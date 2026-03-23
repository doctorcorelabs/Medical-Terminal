import { createClient } from '@supabase/supabase-js';

const WIB_TIMEZONE = 'Asia/Jakarta';

async function dispatch(supabase, env) {
    const BATCH_SIZE = Number(env.TELEGRAM_MAX_BATCH_SIZE || 50);
    const startMs = Date.now();
    const runId = `netlify-${startMs}`;

    const { data: candidates } = await supabase.from('notification_dispatch_queue')
        .select('id, payload, attempt_count, status')
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

        if (!lockedRow) continue; // Row grabbed by another worker

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
                const status = (res.status === 429 || res.status >= 500) ? 'failed' : 'dead';

                const { error: updateErr } = await supabase.from('notification_dispatch_queue').update({
                    status,
                    last_error: errBody,
                    attempt_count: (lockedRow.attempt_count || 0) + 1,
                    next_attempt_at: status === 'failed' ? new Date(Date.now() + 10000).toISOString() : null,
                    lock_owner: null,
                    locked_at: null
                }).eq('id', lockedRow.id);

                // Log the failed send
                if (!updateErr) {
                    await supabase.from('notification_dispatch_logs').insert({
                        queue_id: lockedRow.id,
                        source_type: 'schedule',
                        source_id: 'unknown',
                        user_id: 'unknown',
                        channel: 'telegram',
                        status: status === 'failed' ? 'failed' : 'dead',
                        attempt_number: (lockedRow.attempt_count || 0) + 1,
                        provider_http_status: res.status,
                        error_message: errBody,
                    });
                }
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

export const handler = async (event, context) => {
    try {
        const supabaseUrl = process.env.VITE_SUPABASE_URL;
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

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

        const sent = await dispatch(supabase, process.env);

        return {
            statusCode: 200,
            body: JSON.stringify({
                ok: true,
                sent,
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
