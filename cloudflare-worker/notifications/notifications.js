import { createClient } from '@supabase/supabase-js';

// --- Ported Utilities ---
const WIB_TIMEZONE = 'Asia/Jakarta';
const WIB_UTC_OFFSET_MINUTES = 7 * 60;

function parseTime(time) {
    const [h, m] = String(time || '').split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return { h, m };
}

function localDateTimeToUtcWib(dateStr, timeStr) {
    const [year, month, day] = String(dateStr).split('-').map(Number);
    const time = parseTime(timeStr);
    if (!year || !month || !day || !time) return null;
    const localAsUtcMillis = Date.UTC(year, month - 1, day, time.h, time.m, 0, 0);
    return new Date(localAsUtcMillis - WIB_UTC_OFFSET_MINUTES * 60 * 1000);
}

function buildScheduleIdempotencyKey(userId, eventId, eventDate, eventTime, reminderMinutes) {
    return `schedule:${userId}:${eventId || 'na'}:${eventDate}:${eventTime}:${reminderMinutes}`;
}

function escapeHtml(value = '') {
    return String(value)
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;');
}

function buildScheduleMessage(event, reminderMinutes) {
    const timeLine = event.isAllDay ? 'Seharian' : (event.startTime ? `${event.startTime}${event.endTime ? ` - ${event.endTime}` : ''}` : '(tanpa jam)');
    const dateObj = new Date(`${event.date}T00:00:00Z`);
    const dateFmt = dateObj.toLocaleDateString('id-ID', { timeZone: WIB_TIMEZONE, weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });

    return [
        '⏰ <b>Reminder Jadwal</b>',
        `<b>${escapeHtml(event.title || 'Kegiatan')}</b>`,
        `<i>${dateFmt}</i>`,
        `<i>Jam:</i> ${escapeHtml(timeLine)}`,
        '<i>Zona waktu:</i> WIB (GMT+7)',
        `<i>Reminder:</i> Aktif (±${reminderMinutes} menit sebelum jadwal)`,
    ].join('\n');
}

function buildAlertMessage(alert) {
    const levelEmoji = alert.level === 'critical' ? '🚨' : alert.level === 'warning' ? '⚠️' : 'ℹ️';
    const statusText = alert.status === 'resolved' ? 'RESOLVED' : 'OPEN';
    const isAdminBroadcast = alert.source === 'admin-broadcast' || alert.payload?.is_admin_broadcast === true;
    const header = isAdminBroadcast ? `${levelEmoji} <b>Pengumuman Admin ${statusText}</b>` : `${levelEmoji} <b>System Alert ${statusText}</b>`;
    return [
        header,
        `<b>${escapeHtml(alert.title || 'Alert')}</b>`,
        escapeHtml(alert.message || ''),
        alert.rule_key ? `<i>Rule:</i> ${escapeHtml(alert.rule_key)}` : null,
        `<i>Waktu:</i> ${new Date(alert.updated_at || alert.created_at).toLocaleString('id-ID', { timeZone: 'Asia/Jakarta' })} WIB`,
    ].filter(Boolean).join('\n');
}

// --- Schedule Enqueue Logic ---
async function enqueueSchedules(supabase, env) {
    const REMINDER_MINUTES = Number(env.SCHEDULE_REMINDER_MINUTES || 10);
    const LOOKAHEAD_MINUTES = Number(env.SCHEDULE_REMINDER_LOOKAHEAD_MINUTES || 60);
    const GRACE_MINUTES = Number(env.SCHEDULE_REMINDER_GRACE_MINUTES || 15);

    const now = new Date();
    const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LOOKAHEAD_MINUTES * 60 * 1000);

    const { data: channels } = await supabase.from('notification_channels')
        .select('*').eq('channel', 'telegram').eq('is_enabled', true).eq('is_verified', true).eq('schedule_enabled', true);
    if (!channels || channels.length === 0) return 0;

    const userIds = channels.map(c => c.user_id);
    const { data: schedulesRows } = await supabase.from('user_schedules').select('user_id, schedules_data').in('user_id', userIds);
    const scheduleMap = new Map((schedulesRows || []).map(row => [row.user_id, row.schedules_data || []]));

    const rowsToInsert = [];
    for (const channel of channels) {
        const events = scheduleMap.get(channel.user_id) || [];
        for (const event of events) {
            const utcTime = localDateTimeToUtcWib(event.date, event.isAllDay ? '09:00' : (event.startTime || '09:00'));
            if (!utcTime) continue;

            const reminderAt = new Date(utcTime.getTime() - REMINDER_MINUTES * 60 * 1000);
            if (reminderAt < windowStart || reminderAt > windowEnd) continue;

            const idempotencyKey = buildScheduleIdempotencyKey(channel.user_id, event.id, event.date, event.startTime, REMINDER_MINUTES);
            const nextAttempt = reminderAt > now ? reminderAt.toISOString() : now.toISOString();

            rowsToInsert.push({
                source_type: 'schedule',
                source_id: String(event.id),
                user_id: channel.user_id,
                channel: 'telegram',
                idempotency_key: idempotencyKey,
                payload: {
                    text: buildScheduleMessage(event, REMINDER_MINUTES),
                    telegram_chat_id: channel.telegram_chat_id,
                },
                status: 'pending',
                next_attempt_at: nextAttempt
            });
        }
    }

    if (rowsToInsert.length > 0) {
        const { data } = await supabase.from('notification_dispatch_queue')
            .upsert(rowsToInsert, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id');
        return data?.length || 0;
    }
    return 0;
}

// --- Alert Enqueue Logic ---
async function enqueueAlerts(supabase, env) {
    const LOOKBACK_MINUTES = Number(env.NOTIFICATION_ALERT_LOOKBACK_MINUTES || 10);
    const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

    const { data: alerts } = await supabase.from('alert_events')
        .select('*').in('status', ['open', 'resolved']).gte('updated_at', sinceIso).order('updated_at', { ascending: true }).limit(100);

    if (!alerts || alerts.length === 0) return 0;

    const { data: channels } = await supabase.from('notification_channels')
        .select('user_id, telegram_chat_id').eq('channel', 'telegram').eq('is_enabled', true).eq('is_verified', true).eq('alert_enabled', true);

    if (!channels || channels.length === 0) return 0;

    const rowsToInsert = [];
    for (const alert of alerts) {
        const text = buildAlertMessage(alert);
        const forceSend = Boolean(alert.source === 'admin-broadcast' && alert.level === 'critical' && alert.payload?.critical_override === true);
        for (const channel of channels) {
            rowsToInsert.push({
                source_type: 'alert',
                source_id: String(alert.id),
                user_id: channel.user_id,
                channel: 'telegram',
                idempotency_key: `alert:${alert.id}:${channel.user_id}:telegram`,
                payload: {
                    text,
                    telegram_chat_id: channel.telegram_chat_id,
                    force_send: forceSend,
                },
                status: 'pending',
                next_attempt_at: new Date().toISOString(),
            });
        }
    }

    if (rowsToInsert.length > 0) {
        const { data } = await supabase.from('notification_dispatch_queue')
            .upsert(rowsToInsert, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id');
        return data?.length || 0;
    }
    return 0;
}

// --- Dispatch Logic ---
async function dispatch(supabase, env) {
    const BATCH_SIZE = Number(env.TELEGRAM_MAX_BATCH_SIZE || 50);
    const startMs = Date.now();
    const runId = `cf-worker-${startMs}`;

    const { data: candidates } = await supabase.from('notification_dispatch_queue')
        .select('id, payload, attempt_count')
        .eq('status', 'pending')
        .lte('next_attempt_at', new Date().toISOString())
        .limit(BATCH_SIZE);

    if (!candidates || candidates.length === 0) return 0;

    let sentCount = 0;
    for (const item of candidates) {
        // ATOMIC LOCK: Only proceed if we can change status from 'pending' to 'processing'
        const { data: lockedRow } = await supabase
            .from('notification_dispatch_queue')
            .update({ 
                status: 'processing', 
                locked_at: new Date().toISOString(),
                lock_owner: runId,
                updated_at: new Date().toISOString()
            })
            .eq('id', item.id)
            .eq('status', 'pending')
            .select('id, payload, attempt_count')
            .maybeSingle();

        if (!lockedRow) continue; // Row grabbed by another worker (Netlify or other CF instance)

        try {
            const res = await fetch(`https://api.telegram.org/bot${env.TELEGRAM_BOT_TOKEN}/sendMessage`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    chat_id: lockedRow.payload.telegram_chat_id,
                    text: lockedRow.payload.text,
                    parse_mode: 'HTML',
                    disable_web_page_preview: true,
                })
            });

            if (res.ok) {
                await supabase.from('notification_dispatch_queue').update({ 
                    status: 'sent', 
                    updated_at: new Date().toISOString(),
                    lock_owner: null,
                    locked_at: null
                }).eq('id', lockedRow.id);
                sentCount++;
            } else {
                const errBody = await res.text();
                const status = (res.status === 429 || res.status >= 500) ? 'failed' : 'dead';
                await supabase.from('notification_dispatch_queue').update({ 
                    status, 
                    last_error: errBody,
                    attempt_count: (lockedRow.attempt_count || 0) + 1,
                    next_attempt_at: status === 'failed' ? new Date(Date.now() + 10000).toISOString() : null,
                    lock_owner: null,
                    locked_at: null
                }).eq('id', lockedRow.id);
            }
        } catch (err) {
            console.error(`[dispatch] Error sending to ${lockedRow.id}:`, err.message);
            // Revert lock on network error so it can be retried
            await supabase.from('notification_dispatch_queue').update({ 
                status: 'pending', 
                lock_owner: null, 
                locked_at: null 
            }).eq('id', lockedRow.id);
        }
    }
    return sentCount;
}

// --- Main Handler ---
export async function handleNotificationCycle(env) {
    console.log('[notifications] Cycle started...');
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        const enqueuedSchedules = await enqueueSchedules(supabase, env);
        console.log(`[notifications] Enqueued ${enqueuedSchedules} schedules`);
        
        const enqueuedAlerts = await enqueueAlerts(supabase, env);
        console.log(`[notifications] Enqueued ${enqueuedAlerts} alerts`);
        
        const sent = await dispatch(supabase, env);
        console.log(`[notifications] Sent ${sent} items`);

        // Cleanup old admin_alert_broadcast announcements after 24h
        const { error: cleanupErr } = await supabase
            .from('admin_announcements')
            .delete()
            .eq('source_type', 'admin_alert_broadcast')
            .lt('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());
        if (cleanupErr) console.error('[notifications] Cleanup error:', cleanupErr.message);
    } catch (err) {
        console.error('[notifications] Cycle fatal error:', err.message);
    }
}

export async function handleTestNotification(env, userId) {
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    
    try {
        const { data: channel } = await supabase.from('notification_channels')
            .select('telegram_chat_id, is_verified, is_enabled, schedule_enabled')
            .eq('user_id', userId).eq('channel', 'telegram').maybeSingle();

        if (!channel?.telegram_chat_id || !channel?.is_verified) {
            return { ok: false, error: 'Telegram belum terhubung atau belum diverifikasi.' };
        }

        const now = new Date();
        const when = now.toLocaleString('id-ID', { timeZone: WIB_TIMEZONE, day: '2-digit', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });

        const text = [
            '🧪 <b>Notifikasi tes berhasil, Selamat akun Anda sudah terhubung</b>',
            '',
            `<i>Waktu:</i> ${escapeHtml(when)} WIB`,
        ].join('\n');

        const row = {
            source_type: 'schedule',
            source_id: `manual-test-${Date.now()}`,
            user_id: userId,
            channel: 'telegram',
            idempotency_key: `manual-test:${userId}:${Date.now()}`,
            payload: {
                text,
                telegram_chat_id: channel.telegram_chat_id,
            },
            status: 'pending',
            next_attempt_at: new Date().toISOString(),
        };

        const { data: inserted, error: insertErr } = await supabase.from('notification_dispatch_queue').insert(row).select('id').single();
        if (insertErr) throw insertErr;

        // Immediately trigger dispatch for this test
        const sent = await dispatch(supabase, env);

        return { ok: true, queueId: inserted?.id, sent };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
