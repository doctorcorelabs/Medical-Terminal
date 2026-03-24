-- Panduan Setup Supabase Database
-- Script ini aman dijalankan berulang kali (idempotent).
-- 1. Jalankan script ini di menu "SQL Editor" pada dashboard Supabase Anda.

CREATE TABLE IF NOT EXISTS public.user_patients (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    patients_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_patients
    ADD COLUMN IF NOT EXISTS _device_id TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS _sequence BIGINT NOT NULL DEFAULT 0;

-- Atur Row Level Security (RLS) agar data aman dan hanya bisa diakses oleh pemiliknya
ALTER TABLE public.user_patients ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own patients data" ON public.user_patients;
CREATE POLICY "Users can view their own patients data"
    ON public.user_patients FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own patients data" ON public.user_patients;
CREATE POLICY "Users can insert their own patients data"
    ON public.user_patients FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own patients data" ON public.user_patients;
CREATE POLICY "Users can update their own patients data"
    ON public.user_patients FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Selesai! Sekarang aplikasi dapat menyimpan dan mensinkronisasi JSON data pasien dengan Supabase.

-- ============================================================
-- TABEL STASE (untuk fitur manajemen stase coass)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_stases (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    stases_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    pinned_stase_id TEXT DEFAULT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

ALTER TABLE public.user_stases
    ADD COLUMN IF NOT EXISTS _device_id TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS _sequence BIGINT NOT NULL DEFAULT 0;

ALTER TABLE public.user_stases ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own stases data" ON public.user_stases;
CREATE POLICY "Users can view their own stases data"
    ON public.user_stases FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own stases data" ON public.user_stases;
CREATE POLICY "Users can insert their own stases data"
    ON public.user_stases FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own stases data" ON public.user_stases;
CREATE POLICY "Users can update their own stases data"
    ON public.user_stases FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Catatan: Setiap stase memiliki schema: { id, name, color, createdAt }
-- Setiap pasien memiliki tambahan field: stase_id (string | null)
