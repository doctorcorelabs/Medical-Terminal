import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function parseJsonBody(rawBody) {
    try {
        return JSON.parse(rawBody);
    } catch {
        return null;
    }
}

function isValidWebhookPayload(body) {
    if (!body || typeof body !== 'object') return false;
    const { order_id: orderId, amount, status, project } = body;
    const numericAmount = Number(amount);
    return (
        typeof orderId === 'string'
        && orderId.trim().length > 0
        && Number.isFinite(numericAmount)
        && numericAmount > 0
        && typeof status === 'string'
        && status.trim().length > 0
        && typeof project === 'string'
        && project.trim().length > 0
    );
}

function getHeader(event, headerName) {
    const headers = event?.headers || {};
    const target = String(headerName || '').toLowerCase();
    for (const [key, value] of Object.entries(headers)) {
        if (String(key).toLowerCase() === target) return value;
    }
    return undefined;
}

function safeCompare(a, b) {
    if (typeof a !== 'string' || typeof b !== 'string') return false;
    const left = Buffer.from(a, 'utf8');
    const right = Buffer.from(b, 'utf8');
    if (left.length !== right.length) return false;
    return crypto.timingSafeEqual(left, right);
}

function getClientIp(event) {
    const directIp = String(getHeader(event, 'x-nf-client-connection-ip') || '').trim();
    if (directIp) return directIp;
    const forwarded = String(getHeader(event, 'x-forwarded-for') || '').trim();
    if (!forwarded) return '';
    return forwarded.split(',')[0].trim();
}

// Pakasir Webhook Handler
// URL: POST https://medx.daivanlabs.com/.netlify/functions/pakasir-webhook
export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const rawBody = typeof event.body === 'string' ? event.body : '';
        if (!rawBody) {
            return { statusCode: 400, body: 'Invalid payload' };
        }

        const body = parseJsonBody(rawBody);
        if (!isValidWebhookPayload(body)) {
            return { statusCode: 400, body: 'Invalid payload schema' };
        }

        const { order_id, amount, project } = body;
        const incomingStatus = String(body.status || '').toLowerCase();

        console.log(`[Webhook] Menerima notifikasi untuk Order ID: ${order_id}, Status: ${incomingStatus}`);

        const supUrl = process.env.SUPABASE_URL || '';
        const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '';
        const pakasirProject = process.env.PAKASIR_PROJECT_SLUG || '';
        const pakasirKey = process.env.PAKASIR_API_KEY || '';
        const webhookToken = process.env.PAKASIR_WEBHOOK_TOKEN || '';
        const allowedIpsRaw = process.env.PAKASIR_WEBHOOK_ALLOWED_IPS || '';

        if (!supUrl || !supKey || !pakasirKey || !pakasirProject) {
            console.error('[Webhook] Environment variables missing. URL:', !!supUrl, 'Key:', !!supKey, 'PksKey:', !!pakasirKey, 'PksProj:', !!pakasirProject);
            return { statusCode: 500, body: 'Server configuration error' };
        }

        if (webhookToken) {
            const headerToken = String(getHeader(event, 'x-webhook-token') || getHeader(event, 'x-pakasir-webhook-token') || '').trim();
            const queryToken = String(event?.queryStringParameters?.token || '').trim();
            const providedToken = headerToken || queryToken;
            if (!safeCompare(providedToken, webhookToken)) {
                console.warn('[Webhook] Token verification failed', { orderId: order_id });
                return { statusCode: 401, body: 'Unauthorized webhook' };
            }
        }

        if (allowedIpsRaw.trim()) {
            const allowedIps = allowedIpsRaw
                .split(',')
                .map((item) => item.trim())
                .filter(Boolean);
            const clientIp = getClientIp(event);
            if (!clientIp || !allowedIps.includes(clientIp)) {
                console.warn('[Webhook] Rejected by source IP policy', { orderId: order_id, clientIp: clientIp || null });
                return { statusCode: 403, body: 'Forbidden source' };
            }
        }

        if (project !== pakasirProject) {
            return { statusCode: 400, body: 'Project mismatch' };
        }

        const supabase = createClient(supUrl, supKey);
        const { data: existingSub, error: existingSubError } = await supabase
            .from('user_subscriptions')
            .select('id, status, amount_paid, payment_gateway')
            .eq('gateway_order_id', order_id)
            .maybeSingle();

        if (existingSubError) throw existingSubError;
        if (!existingSub) {
            return { statusCode: 404, body: 'Subscription order not found' };
        }

        const expectedAmount = Number(existingSub.amount_paid);
        const incomingAmount = Number(amount);
        if (Number.isFinite(expectedAmount) && expectedAmount > 0 && incomingAmount !== expectedAmount) {
            return { statusCode: 400, body: 'Amount mismatch with subscription order' };
        }

        if (existingSub.payment_gateway && String(existingSub.payment_gateway).toLowerCase() !== 'pakasir') {
            return { statusCode: 400, body: 'Gateway mismatch with subscription order' };
        }

        if (String(existingSub.status || '').toLowerCase() === 'active') {
            return { statusCode: 200, body: JSON.stringify({ message: 'Duplicate ignored' }) };
        }

        // Validasi Ganda
        const params = new URLSearchParams({
            project: pakasirProject,
            amount: String(amount),
            order_id: String(order_id),
            api_key: pakasirKey,
        });
        const pksResponse = await fetch(`https://app.pakasir.com/api/transactiondetail?${params.toString()}`);
        if (!pksResponse.ok) return { statusCode: 400, body: 'Failed to validate with Pakasir' };

        const pksData = await pksResponse.json();
        const validTransaction = pksData.transaction;
        if (!validTransaction) {
            return { statusCode: 400, body: 'Invalid Pakasir response' };
        }

        const transactionOrderId = String(validTransaction.order_id || '');
        const transactionAmount = Number(validTransaction.amount);
        const transactionStatus = String(validTransaction.status || '').toLowerCase();

        if (transactionOrderId !== String(order_id)) {
            return { statusCode: 400, body: 'Order mismatch' };
        }
        if (!Number.isFinite(transactionAmount) || transactionAmount !== Number(amount)) {
            return { statusCode: 400, body: 'Amount mismatch' };
        }

        // Trust only provider-validated status, not incoming webhook status field.
        if (transactionStatus === 'completed') {
            // 1. Update user_subscriptions
            const { data: updatedSub, error: subError } = await supabase
                .from('user_subscriptions')
                .update({ 
                    status: 'active',
                    payment_gateway: 'pakasir',
                    amount_paid: transactionAmount,
                    payment_method: validTransaction.payment_method,
                    updated_at: new Date().toISOString()
                })
                .eq('gateway_order_id', order_id)
                .neq('status', 'active')
                .select('*, subscription_plans(name)')
                .maybeSingle();

            if (subError) throw subError;
            if (!updatedSub) {
                return { statusCode: 200, body: JSON.stringify({ message: 'Already active' }) };
            }

            // 2. Notifikasi (Legacy Telegram removed as per user request to replace with PDF Receipt)
            /*
            if (tgToken && subData.user_id) {
                try {
                    const { data: channel } = await supabase
                        .from('notification_channels')
                        .select('telegram_chat_id')
                        .eq('user_id', subData.user_id)
                        .eq('channel', 'telegram')
                        .eq('is_enabled', true)
                        .maybeSingle();

                    if (channel?.telegram_chat_id) {
                        const planName = subData.subscription_plans?.name || 'Specialist';
                        const message = `✅ *Pembayaran Berhasil!*\n\nHalo! Pembayaran Anda sebesar *Rp ${Number(validTransaction.amount).toLocaleString('id-ID')}* untuk paket *${planName}* telah kami terima.\n\nAkun Anda otomatis aktif sebagai *Specialist*. Silakan refresh aplikasi untuk menikmati fitur lengkap.\n\nOrder ID: \`${order_id}\`\nWaktu: ${new Date().toLocaleString('id-ID')}`;
                        
                        await fetch(`https://api.telegram.org/bot${tgToken}/sendMessage`, {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({
                                chat_id: channel.telegram_chat_id,
                                text: message,
                                parse_mode: 'Markdown'
                            })
                        });
                        console.log(`[Webhook] Notifikasi Telegram terkirim ke ${channel.telegram_chat_id}`);
                    }
                } catch (tgErr) {
                    console.error('[Webhook] Gagal kirim Telegram:', tgErr);
                }
            }
            */

            return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
        } else {
            console.warn('[Webhook] Provider transaction not completed', {
                orderId: order_id,
                incomingStatus,
                providerStatus: transactionStatus,
            });
            return { statusCode: 202, body: 'Transaction not completed' };
        }
    } catch (err) {
        console.error('[Webhook Error]', err);
        return { statusCode: 500, body: err.message };
    }
};
