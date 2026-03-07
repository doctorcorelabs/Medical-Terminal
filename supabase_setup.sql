-- Panduan Setup Supabase Database

-- 1. Jalankan script ini di menu "SQL Editor" pada dashboard Supabase Anda.

CREATE TABLE public.user_patients (
    user_id UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    patients_data JSONB NOT NULL DEFAULT '[]'::jsonb,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Atur Row Level Security (RLS) agar data aman dan hanya bisa diakses oleh pemiliknya
ALTER TABLE public.user_patients ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their own patients data"
    ON public.user_patients FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own patients data"
    ON public.user_patients FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own patients data"
    ON public.user_patients FOR UPDATE
    USING (auth.uid() = user_id)
    WITH CHECK (auth.uid() = user_id);
    
-- Selesai! Sekarang aplikasi dapat menyimpan dan mensinkronisasi JSON data pasien dengan Supabase.
