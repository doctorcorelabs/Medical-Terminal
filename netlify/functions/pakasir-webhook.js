import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

function getHeader(event, name) {
    const headers = event?.headers || {};
    const exact = headers[name];
    if (typeof exact === 'string') return exact;
    const lower = headers[name.toLowerCase()];
    if (typeof lower === 'string') return lower;
    return null;
}

function parseJsonBody(rawBody) {
    try {
        return JSON.parse(rawBody);
    } catch {
        return null;
    }
}

function normalizeSignature(rawSignature) {
    if (!rawSignature || typeof rawSignature !== 'string') return null;
    const trimmed = rawSignature.trim();
    if (!trimmed) return null;
    return trimmed.startsWith('sha256=') ? trimmed.slice('sha256='.length) : trimmed;
}

function verifyWebhookSignature(rawBody, rawSignature, secret) {
    if (!rawBody || !rawSignature || !secret) return false;
    const signature = normalizeSignature(rawSignature);
    if (!signature || !/^[a-fA-F0-9]{64}$/.test(signature)) return false;

    const expected = crypto
        .createHmac('sha256', secret)
        .update(rawBody)
        .digest('hex');

    const expectedBuffer = Buffer.from(expected, 'hex');
    const receivedBuffer = Buffer.from(signature, 'hex');
    if (expectedBuffer.length !== receivedBuffer.length) return false;
    return crypto.timingSafeEqual(expectedBuffer, receivedBuffer);
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

        const { order_id, amount, status, project } = body;

        console.log(`[Webhook] Menerima notifikasi untuk Order ID: ${order_id}, Status: ${status}`);

        const supUrl = process.env.SUPABASE_URL || '';
        const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '';
        const pakasirProject = process.env.PAKASIR_PROJECT_SLUG || '';
        const pakasirKey = process.env.PAKASIR_API_KEY || '';
        const webhookSecret = process.env.PAKASIR_WEBHOOK_SECRET || '';

        if (!supUrl || !supKey || !pakasirKey || !pakasirProject || !webhookSecret) {
            console.error('[Webhook] Environment variables missing. URL:', !!supUrl, 'Key:', !!supKey, 'PksKey:', !!pakasirKey, 'PksProj:', !!pakasirProject, 'HookSecret:', !!webhookSecret);
            return { statusCode: 500, body: 'Server configuration error' };
        }

        const signatureHeader =
            getHeader(event, 'x-pakasir-signature')
            || getHeader(event, 'x-signature')
            || getHeader(event, 'signature');

        if (!verifyWebhookSignature(rawBody, signatureHeader, webhookSecret)) {
            return { statusCode: 401, body: 'Invalid signature' };
        }

        if (project !== pakasirProject) {
            return { statusCode: 400, body: 'Project mismatch' };
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
            const supabase = createClient(supUrl, supKey);

            // 1. Update user_subscriptions
            const { data: _subData, error: subError } = await supabase
                .from('user_subscriptions')
                .update({ 
                    status: 'active',
                    amount_paid: transactionAmount,
                    payment_method: validTransaction.payment_method,
                    updated_at: new Date().toISOString()
                })
                .eq('gateway_order_id', order_id)
                .select('*, subscription_plans(name)')
                .single();

            if (subError) throw subError;

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
            return { statusCode: 400, body: 'Transaction not completed' };
        }
    } catch (err) {
        console.error('[Webhook Error]', err);
        return { statusCode: 500, body: err.message };
    }
};
