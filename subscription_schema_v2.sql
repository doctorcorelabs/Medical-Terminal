-- =========================================================================
-- SUBSCRIPTIONS & PAYMENT GATEWAY SQL FOUNDATION
-- Run this in Supabase SQL Editor to prepare for Payment Integrations
-- =========================================================================

-- 1. Master Table: Subscription Plans
-- Menyimpan daftar paket berlangganan (Intern, Specialist Monthly, Lifetime)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(100) NOT NULL, -- Contoh: 'Specialist Monthly'
    code VARCHAR(50) UNIQUE NOT NULL, -- Contoh: 'specialist_monthly'
    price NUMERIC(15,2) NOT NULL DEFAULT 0,
    duration_days INTEGER, -- Jumlah hari aktif (NULL = Lifetime/Selamanya)
    max_patients INTEGER, -- Kuota pasien maksimal (NULL = Tanpa batas)
    is_active BOOLEAN DEFAULT true,
    features JSONB DEFAULT '{}'::jsonb, -- Konfigurasi akses fitur tambahan
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- Isi Data Awal (Seeder)
INSERT INTO public.subscription_plans (name, code, price, duration_days, max_patients, features)
VALUES
('Intern (Free)', 'intern', 0, NULL, 2, '{"ai_insight": false, "export_pdf": false}'),
('Specialist Monthly', 'specialist_monthly', 49000, 30, NULL, '{"ai_insight": true, "export_pdf": true}'),
('Specialist Lifetime', 'specialist_lifetime', 999000, NULL, NULL, '{"ai_insight": true, "export_pdf": true}')
ON CONFLICT (code) DO NOTHING;

-- 2. Transaksi/Riwayat Langganan User (Untuk Payment Gateway)
-- Tabel ini akan di-insert ketika user klik "Beli" (menunggu bayar) dan di-update via Webhook dari Midtrans/Stripe/Pakasir.
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE,
    plan_id UUID REFERENCES public.subscription_plans(id) ON DELETE RESTRICT,
    status VARCHAR(20) NOT NULL DEFAULT 'pending', -- 'pending', 'active', 'expired', 'failed', 'cancelled'
    start_date TIMESTAMP WITH TIME ZONE,
    end_date TIMESTAMP WITH TIME ZONE, -- Waktu expired, jika NULL berarti Lifetime
    
    -- Payment Gateway Data
    payment_gateway VARCHAR(30), -- 'midtrans', 'stripe', 'pakasir', dll
    gateway_order_id VARCHAR(100) UNIQUE, -- Kode transaksi yg dilempar ke gateway
    payment_method VARCHAR(50), -- e.g., 'credit_card', 'gopay', 'qris'
    amount_paid NUMERIC(15,2),
    
    created_at TIMESTAMP WITH TIME ZONE DEFAULT now(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT now()
);

-- 3. Memperbarui Tabel Profiles
-- Kita tetap memakai kolom role/subscription_expires_at yang ada sekarang, 
-- namun kita tambahkan referensi untuk menghubungkannya ke transaksi terbaru untuk kemudahan.
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='profiles' AND column_name='active_subscription_id') THEN
        ALTER TABLE public.profiles ADD COLUMN active_subscription_id UUID REFERENCES public.user_subscriptions(id);
    END IF;
END $$;

-- 4. Fungsi & Trigger (Opsional: Autoupdate profile from webhook)
-- Nantinya, Webhook Handler (via Netlify Functions) cukup UPDATE tabel `user_subscriptions` menjadi 'active'. 
-- Trigger ini bisa langsung mengubah profil user.
CREATE OR REPLACE FUNCTION update_profile_on_subscription_success()
RETURNS TRIGGER AS $$
DECLARE
    plan_code VARCHAR;
    plan_duration INTEGER;
BEGIN
    IF NEW.status = 'active' AND OLD.status != 'active' THEN
        -- Cari tau detail paket
        SELECT code, duration_days INTO plan_code, plan_duration FROM public.subscription_plans WHERE id = NEW.plan_id;
        
        IF plan_code LIKE 'specialist%' THEN
            UPDATE public.profiles
            SET role = 'specialist',
                subscription_expires_at = CASE 
                    WHEN plan_duration IS NULL THEN NULL 
                    ELSE now() + (plan_duration || ' days')::interval 
                END,
                active_subscription_id = NEW.id
            WHERE user_id = NEW.user_id;
        ELSE
            UPDATE public.profiles
            SET role = 'intern',
                subscription_expires_at = NULL,
                active_subscription_id = NEW.id
            WHERE user_id = NEW.user_id;
        END IF;
    END IF;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Trigger untuk menjalankan fungsi di atas
DROP TRIGGER IF EXISTS on_subscription_active ON public.user_subscriptions;
CREATE TRIGGER on_subscription_active
    AFTER UPDATE ON public.user_subscriptions
    FOR EACH ROW
    EXECUTE FUNCTION update_profile_on_subscription_success();
