-- Panduan Setup Supabase: Fitur Jadwal
-- Script ini aman dijalankan berulang kali (idempotent).
-- Jalankan script ini di menu "SQL Editor" pada dashboard Supabase Anda.

-- ============================================================
-- TABEL JADWAL (untuk fitur manajemen jadwal dokter/coass)
-- ============================================================

CREATE TABLE IF NOT EXISTS public.user_schedules (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    schedules_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Atur Row Level Security (RLS) agar data aman dan hanya bisa diakses oleh pemiliknya
ALTER TABLE public.user_schedules ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Users can view their own schedules data" ON public.user_schedules;
CREATE POLICY "Users can view their own schedules data"
    ON public.user_schedules FOR SELECT
    USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can insert their own schedules data" ON public.user_schedules;
CREATE POLICY "Users can insert their own schedules data"
    ON public.user_schedules FOR INSERT
    WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "Users can update their own schedules data" ON public.user_schedules;
CREATE POLICY "Users can update their own schedules data"
    ON public.user_schedules FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);

-- Selesai! Aplikasi kini dapat menyimpan dan mensinkronisasi data jadwal dengan Supabase.
-- Schema event yang tersimpan di schedules_data (JSONB array):
-- {
--   id: UUID,
--   title: TEXT,
--   description: TEXT (optional),
--   date: 'YYYY-MM-DD',
--   startTime: 'HH:mm' (optional),
--   endTime: 'HH:mm' (optional),
--   isAllDay: BOOLEAN,
--   category: 'pasien' | 'operasi' | 'rapat' | 'jaga' | 'pribadi' | 'lainnya',
--   patientId: UUID (optional, FK ke patient),
--   priority: 'rendah' | 'sedang' | 'tinggi',
--   createdAt: ISO timestamp
-- }
