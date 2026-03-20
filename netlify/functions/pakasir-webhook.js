import { createClient } from '@supabase/supabase-js';

// Pakasir Webhook Handler
// URL: POST https://<your-netlify-url>/.netlify/functions/pakasir-webhook
export const handler = async (event) => {
    // Hanya menerima POST
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: 'Method Not Allowed' };
    }

    try {
        const body = JSON.parse(event.body);
        const { order_id, amount, status, project } = body;

        console.log(`[Webhook] Menerima notifikasi untuk Order ID: ${order_id}, Status: ${status}`);

        // Verifikasi lingkungan
        const supUrl = process.env.VITE_SUPABASE_URL;
        const supKey = process.env.SUPABASE_SERVICE_ROLE_KEY; // Harus menggunakan Service Role key agar bypass RLS!
        const pakasirProject = process.env.PAKASIR_PROJECT_SLUG || process.env.VITE_PAKASIR_PROJECT_SLUG;
        const pakasirKey = process.env.PAKASIR_API_KEY;

        if (!supUrl || !supKey || !pakasirKey) {
            console.error('Environment variables tidak lengkap (Supabase/Pakasir).');
            return { statusCode: 500, body: 'Server configuration error' };
        }

        // Cek apakah project sesuai
        if (project !== pakasirProject) {
            return { statusCode: 400, body: 'Project mismatch' };
        }

        // Validasi Ganda ke API Pakasir
        console.log(`[Webhook] Melakukan validasi ganda ke Pakasir API untuk ${order_id}...`);
        const pksResponse = await fetch(`https://app.pakasir.com/api/transactiondetail?project=${pakasirProject}&amount=${amount}&order_id=${order_id}&api_key=${pakasirKey}`);
        
        if (!pksResponse.ok) {
            console.error(`Gagal validasi ganda dari Pakasir (HTTP ${pksResponse.status})`);
            return { statusCode: 400, body: 'Failed to validate with Pakasir' };
        }

        const pksData = await pksResponse.json();
        
        if (!pksData || !pksData.transaction) {
            console.error('Invalid response format dari Pakasir', pksData);
            return { statusCode: 400, body: 'Invalid transaction validation response' };
        }

        const validTransaction = pksData.transaction;
        console.log(`[Webhook] Validasi berhasil: ${validTransaction.status}`);

        // Jika transaksi memang 'completed' secara valid
        if (validTransaction.status === 'completed' || status === 'completed') {
            const supabase = createClient(supUrl, supKey);

            // 1. Update ke user_subscriptions
            const { data: subData, error: subError } = await supabase
                .from('user_subscriptions')
                .update({ 
                    status: 'active',
                    amount_paid: validTransaction.amount,
                    payment_method: validTransaction.payment_method,
                    updated_at: new Date().toISOString()
                })
                .eq('gateway_order_id', order_id)
                .select()
                .single();

            if (subError) {
                console.error('[Webhook] Gagal mengupdate user_subscriptions', subError);
                return { statusCode: 500, body: 'Database update failed' };
            }

            console.log(`[Webhook] Transaksi ${order_id} berhasil diupdate menjadi active.`);
            // Catatan: Trigger SQL (on_subscription_active) otomatis akan dijalankan oleh Supabase 
            // untuk memodifikasi `profiles.role` dan memperpanjang masa berlaku langganan.

            return { statusCode: 200, body: JSON.stringify({ message: "Success", transaction: subData }) };
        } else {
            return { statusCode: 400, body: 'Transaction is not completed' };
        }

    } catch (err) {
        console.error('[Webhook Error]', err);
        return { statusCode: 500, body: err.message };
    }
};
