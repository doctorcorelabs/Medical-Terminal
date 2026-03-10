-- ============================================================
-- Drug Interaction Cache Table
-- Jalankan script ini di menu "SQL Editor" pada dashboard Supabase Anda.
-- Script ini aman dijalankan berulang kali (idempotent).
-- ============================================================
--
-- Tabel ini menyimpan hasil cek interaksi obat secara publik (shared across all users).
-- Cache key = nama obat yang di-sort alphabetically, lowercase, digabung dengan "|"
-- Contoh: "aspirin|warfarin"
--
-- Kolom interactions menyimpan array JSON dengan struktur:
-- [
--   {
--     "pair": ["aspirin", "warfarin"],
--     "severity": "Major",
--     "description": "...",
--     "ai_summary": "..." (optional, diisi setelah user klik Ringkasan AI)
--   },
--   ...
-- ]
-- ============================================================

CREATE TABLE IF NOT EXISTS public.drug_interaction_cache (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    drug_key TEXT UNIQUE NOT NULL,
    drugs TEXT[] NOT NULL,
    interactions JSONB NOT NULL DEFAULT '[]'::jsonb,
    checked_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Index for fast lookup by key
CREATE INDEX IF NOT EXISTS idx_drug_interaction_cache_key ON public.drug_interaction_cache (drug_key);

-- Index for ordering by recent
CREATE INDEX IF NOT EXISTS idx_drug_interaction_cache_checked_at ON public.drug_interaction_cache (checked_at DESC);

-- Row Level Security: shared public cache — all users can read and the app can write
ALTER TABLE public.drug_interaction_cache ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Public can view drug interaction cache" ON public.drug_interaction_cache;
CREATE POLICY "Public can view drug interaction cache"
    ON public.drug_interaction_cache FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public can insert drug interaction cache" ON public.drug_interaction_cache;
CREATE POLICY "Public can insert drug interaction cache"
    ON public.drug_interaction_cache FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Public can update drug interaction cache" ON public.drug_interaction_cache;
CREATE POLICY "Public can update drug interaction cache"
    ON public.drug_interaction_cache FOR UPDATE
    USING (true)
    WITH CHECK (true);

-- Done! The app will now cache drug interaction results globally across all users.
