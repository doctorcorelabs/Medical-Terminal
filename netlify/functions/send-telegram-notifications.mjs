import { createClient } from '@supabase/supabase-js';

function computeRetryDelayMs(nextAttemptCount, env) {
    const baseMs = Number(env.TELEGRAM_RETRY_BASE_MS || 10000);
    const maxMs = Number(env.TELEGRAM_RETRY_MAX_MS || 5 * 60 * 1000);
    const exp = Math.max(0, nextAttemptCount - 1);
    return Math.min(maxMs, baseMs * (2 ** exp));
}

async function dispatch(supabase, env) {
    const BATCH_SIZE = Number(env.TELEGRAM_MAX_BATCH_SIZE || 50);
    const MAX_RETRY_ATTEMPTS = Number(env.TELEGRAM_MAX_RETRY_ATTEMPTS || 5);
    const startMs = Date.now();
    const runId = `netlify-${startMs}`;

    const { data: candidates } = await supabase.from('notification_dispatch_queue')
        .select('id, payload, attempt_count, status')
        .eq('status', 'pending')
        .lte('next_attempt_at', new Date().toISOString())
        .limit(BATCH_SIZE);

    if (!candidates || candidates.length === 0) {
        return {
            sent: 0,
            candidates: 0,
            processed: 0,
            locked: 0,
            lockMiss: 0,
            failed: 0,
            dead: 0,
            retried: 0,
            durationMs: Date.now() - startMs,
        };
    }

    let sentCount = 0;
    let processedCount = 0;
    let lockedCount = 0;
    let lockMissCount = 0;
    let failedCount = 0;
    let deadCount = 0;
    let retriedCount = 0;

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

        if (!lockedRow) {
            lockMissCount += 1;
            continue; // Row grabbed by another worker
        }

        lockedCount += 1;
        processedCount += 1;

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
                const { error: updateErr } = await supabase.from('notification_dispatch_queue').update({
                    status: 'sent',
                    updated_at: new Date().toISOString(),
                    lock_owner: null,
                    locked_at: null
                }).eq('id', lockedRow.id);

                if (!updateErr) sentCount++;

                // Log the successful send
                await supabase.from('notification_dispatch_logs').insert({
                    queue_id: lockedRow.id,
                    source_type: 'schedule',
                    source_id: 'unknown',
                    user_id: 'unknown',
                    channel: 'telegram',
                    status: 'sent',
                    attempt_number: (lockedRow.attempt_count || 0) + 1,
                    provider_http_status: res.status,
                });
            } else {
                const errBody = await res.text();
                const nextAttemptCount = (lockedRow.attempt_count || 0) + 1;
                const isRetriable = (res.status === 429 || res.status >= 500);
                const canRetry = isRetriable && nextAttemptCount < MAX_RETRY_ATTEMPTS;
                const status = canRetry ? 'failed' : 'dead';
                const nextAttemptAt = canRetry
                    ? new Date(Date.now() + computeRetryDelayMs(nextAttemptCount, env)).toISOString()
                    : null;

                const { error: updateErr } = await supabase.from('notification_dispatch_queue').update({
                    status,
                    last_error: errBody,
                    attempt_count: nextAttemptCount,
                    next_attempt_at: nextAttemptAt,
                    lock_owner: null,
                    locked_at: null
                }).eq('id', lockedRow.id);

                // Log the failed send
                if (!updateErr) {
                    if (status === 'failed') {
                        failedCount += 1;
                        retriedCount += 1;
                    } else {
                        deadCount += 1;
                    }
                    await supabase.from('notification_dispatch_logs').insert({
                        queue_id: lockedRow.id,
                        source_type: 'schedule',
                        source_id: 'unknown',
                        user_id: 'unknown',
                        channel: 'telegram',
                        status,
                        attempt_number: nextAttemptCount,
                        provider_http_status: res.status,
                        error_message: errBody,
                    });
                }
            }
        } catch (err) {
            console.error(`[dispatch] Error sending to ${lockedRow.id}:`, err.message);
            const nextAttemptCount = (lockedRow.attempt_count || 0) + 1;
            const canRetry = nextAttemptCount < MAX_RETRY_ATTEMPTS;
            const status = canRetry ? 'failed' : 'dead';
            const nextAttemptAt = canRetry
                ? new Date(Date.now() + computeRetryDelayMs(nextAttemptCount, env)).toISOString()
                : null;

            await supabase.from('notification_dispatch_queue').update({
                status,
                attempt_count: nextAttemptCount,
                last_error: err?.message || 'Network error',
                next_attempt_at: nextAttemptAt,
                lock_owner: null,
                locked_at: null
            }).eq('id', lockedRow.id);

            if (status === 'failed') {
                failedCount += 1;
                retriedCount += 1;
            } else {
                deadCount += 1;
            }
        }
    }
    return {
        sent: sentCount,
        candidates: candidates.length,
        processed: processedCount,
        locked: lockedCount,
        lockMiss: lockMissCount,
        failed: failedCount,
        dead: deadCount,
        retried: retriedCount,
        durationMs: Date.now() - startMs,
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

        if (!process.env.TELEGRAM_BOT_TOKEN) {
            return {
                statusCode: 500,
                body: JSON.stringify({ ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' }),
            };
        }

        const supabase = createClient(supabaseUrl, serviceRoleKey, {
            auth: { persistSession: false, autoRefreshToken: false },
        });

        const metrics = await dispatch(supabase, process.env);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                sent: metrics.sent,
                dispatch: metrics,
                timestamp: new Date().toISOString(),
            }),
        };
    } catch (err) {
        console.error('[send-telegram-notifications] Error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({
                ok: false,
                error: err?.message || 'Internal server error',
            }),
        };
    }
};
