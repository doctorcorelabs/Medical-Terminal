import { createClient } from '@supabase/supabase-js';

// Pakasir Webhook Handler
// URL: POST https://medx.daivanlabs.com/.netlify/functions/pakasir-webhook
export const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { order_id, amount, status, project } = body;

        console.log(`[Webhook] Menerima notifikasi untuk Order ID: ${order_id}, Status: ${status}`);

        const supUrl = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
        const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        const pakasirProject = process.env.PAKASIR_PROJECT_SLUG || process.env.VITE_PAKASIR_PROJECT_SLUG;
        const pakasirKey = process.env.PAKASIR_API_KEY;
        const tgToken = process.env.TELEGRAM_BOT_TOKEN;

        if (!supUrl || !supKey || !pakasirKey || !pakasirProject) {
            console.error('[Webhook] Environment variables missing. URL:', !!supUrl, 'Key:', !!supKey, 'PksKey:', !!pakasirKey, 'PksProj:', !!pakasirProject);
            return { statusCode: 500, body: 'Server configuration error' };
        }

        if (project !== pakasirProject) {
            return { statusCode: 400, body: 'Project mismatch' };
        }

        // Validasi Ganda
        const pksResponse = await fetch(`https://app.pakasir.com/api/transactiondetail?project=${pakasirProject}&amount=${amount}&order_id=${order_id}&api_key=${pakasirKey}`);
        if (!pksResponse.ok) return { statusCode: 400, body: 'Failed to validate with Pakasir' };

        const pksData = await pksResponse.json();
        const validTransaction = pksData.transaction;

        if (validTransaction.status === 'completed' || status === 'completed') {
            const supabase = createClient(supUrl, supKey);

            // 1. Update user_subscriptions
            const { data: subData, error: subError } = await supabase
                .from('user_subscriptions')
                .update({ 
                    status: 'active',
                    amount_paid: validTransaction.amount,
                    payment_method: validTransaction.payment_method,
                    updated_at: new Date().toISOString()
                })
                .eq('gateway_order_id', order_id)
                .select('*, subscription_plans(name)')
                .single();

            if (subError) throw subError;

            // 2. Kirim Notifikasi Telegram (Optional jika user terhubung)
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

            return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
        } else {
            return { statusCode: 400, body: 'Transaction not completed' };
        }
    } catch (err) {
        console.error('[Webhook Error]', err);
        return { statusCode: 500, body: err.message };
    }
};
