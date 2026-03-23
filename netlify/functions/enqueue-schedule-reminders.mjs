import { createClient } from '@supabase/supabase-js';
import { computeEventVersionStaleIds } from './_schedule-reminder-utils.mjs';

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

function getEffectiveEventTime(event) {
    return event?.isAllDay ? '09:00' : (event?.startTime || '09:00');
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

function buildEnqueueWarnings(metrics, env) {
    const warnings = [];
    const minStaleDeleteRatio = Number(env.SCHEDULE_STALE_DELETE_RATIO_WARN_THRESHOLD || 0.9);

    if (metrics.staleDeleteErrors > 0) {
        warnings.push(`stale_delete_errors:${metrics.staleDeleteErrors}`);
    }

    if (
        metrics.staleCandidates > 0
        && Number.isFinite(minStaleDeleteRatio)
        && metrics.staleDeleteRatio < minStaleDeleteRatio
    ) {
        warnings.push(`stale_delete_ratio_low:${metrics.staleDeleteRatio}`);
    }

    if (metrics.enqueueInsertMismatch > 0) {
        warnings.push(`enqueue_insert_mismatch:${metrics.enqueueInsertMismatch}`);
    }

    return warnings;
}

async function enqueueSchedules(supabase, env) {
    const REMINDER_MINUTES = Number(env.SCHEDULE_REMINDER_MINUTES || 10);
    const LOOKAHEAD_MINUTES = Number(env.SCHEDULE_REMINDER_LOOKAHEAD_MINUTES || 60);
    const GRACE_MINUTES = Number(env.SCHEDULE_REMINDER_GRACE_MINUTES || 15);

    const now = new Date();
    const windowStart = new Date(now.getTime() - GRACE_MINUTES * 60 * 1000);
    const windowEnd = new Date(now.getTime() + LOOKAHEAD_MINUTES * 60 * 1000);

    const { data: channels } = await supabase.from('notification_channels')
        .select('*').eq('channel', 'telegram').eq('is_enabled', true).eq('is_verified', true).eq('schedule_enabled', true);
    if (!channels || channels.length === 0) {
        return {
            enqueued: 0,
            staleCandidates: 0,
            staleDeleted: 0,
            staleDeleteErrors: 0,
            channelsScanned: 0,
            activeUsers: 0,
            staleDeleteRatio: 1,
        };
    }

    const userIds = channels.map(c => c.user_id);
    const { data: schedulesRows } = await supabase.from('user_schedules').select('user_id, schedules_data').in('user_id', userIds);
    const scheduleMap = new Map((schedulesRows || []).map(row => [row.user_id, row.schedules_data || []]));

    const rowsToInsert = [];
    const activeEventIdsByUser = new Map();
    const activeKeysByUser = new Map();

    for (const channel of channels) {
        const events = scheduleMap.get(channel.user_id) || [];

        for (const event of events) {
            const effectiveEventTime = getEffectiveEventTime(event);
            const utcTime = localDateTimeToUtcWib(event.date, effectiveEventTime);
            if (!utcTime) continue;

            const reminderAt = new Date(utcTime.getTime() - REMINDER_MINUTES * 60 * 1000);
            if (reminderAt < windowStart || reminderAt > windowEnd) continue;

            const idempotencyKey = buildScheduleIdempotencyKey(
                channel.user_id,
                event.id,
                event.date,
                effectiveEventTime,
                REMINDER_MINUTES,
            );
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

            if (!activeEventIdsByUser.has(channel.user_id)) activeEventIdsByUser.set(channel.user_id, new Set());
            if (!activeKeysByUser.has(channel.user_id)) activeKeysByUser.set(channel.user_id, new Set());
            activeEventIdsByUser.get(channel.user_id).add(String(event.id));
            activeKeysByUser.get(channel.user_id).add(idempotencyKey);
        }

    }

    let enqueuedCount = 0;
    let staleCandidates = 0;
    let staleDeleted = 0;
    let staleDeleteErrors = 0;
    let enqueueInsertMismatch = 0;
    if (rowsToInsert.length > 0) {
        const { data, error: upsertErr } = await supabase.from('notification_dispatch_queue')
            .upsert(rowsToInsert, { onConflict: 'idempotency_key', ignoreDuplicates: true }).select('id');
        if (upsertErr) throw upsertErr;
        enqueuedCount = data?.length || 0;
        if (enqueuedCount === 0) {
            enqueueInsertMismatch = rowsToInsert.length;
        }
    }

    // Clean up stale queue entries only after latest rows are upserted.
    for (const channel of channels) {
        const activeEventIds = [...(activeEventIdsByUser.get(channel.user_id) || new Set())];
        if (activeEventIds.length === 0) continue;

        const { data: existingRows } = await supabase.from('notification_dispatch_queue')
            .select('id, idempotency_key, source_id, created_at, updated_at')
            .eq('user_id', channel.user_id)
            .eq('source_type', 'schedule')
            .in('source_id', activeEventIds);

        if (!existingRows || existingRows.length === 0) continue;

        const staleIds = computeEventVersionStaleIds(existingRows, activeKeysByUser.get(channel.user_id));
        staleCandidates += staleIds.length;

        // Batch delete stale IDs instead of individual DELETE queries
        if (staleIds.length > 0) {
            const { error: batchErr } = await supabase
                .from('notification_dispatch_queue')
                .delete()
                .in('id', staleIds);

            if (batchErr) {
                staleDeleteErrors += staleIds.length;
                console.error(`[Stale cleanup] Batch delete failed:`, batchErr.message);
            } else {
                staleDeleted += staleIds.length;
            }
        }
    }

    return {
        enqueued: enqueuedCount,
        staleCandidates,
        staleDeleted,
        staleDeleteErrors,
        enqueueInsertMismatch,
        channelsScanned: channels.length,
        activeUsers: activeEventIdsByUser.size,
        staleDeleteRatio: staleCandidates > 0 ? Number((staleDeleted / staleCandidates).toFixed(4)) : 1,
    };
}

export const handler = async (event, context) => {
    try {
        const supabaseUrl = process.env.SUPABASE_URL || '';
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || '';

        if (!supabaseUrl || !serviceRoleKey) {
            return {
                statusCode: 500,
                body: JSON.stringify({ ok: false, error: 'Missing Supabase configuration' }),
            };
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const enqueueResult = await enqueueSchedules(supabase, process.env);
        const warnings = buildEnqueueWarnings(enqueueResult, process.env);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                ...enqueueResult,
                warning: warnings.length > 0 ? warnings.join(', ') : null,
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (err) {
        console.error('[enqueue-schedule-reminders] Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: err?.message || 'Internal server error',
            }),
        };
    }
};
