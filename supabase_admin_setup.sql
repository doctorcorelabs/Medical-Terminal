-- ============================================================
-- supabase_admin_setup.sql
-- Admin Role, Feature Flags & Usage Analytics System
-- Run this in Supabase SQL Editor
-- ============================================================

-- ============================================================
-- 1. Add role column to profiles
-- ============================================================
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS role TEXT NOT NULL DEFAULT 'user'
  CHECK (role IN ('user', 'admin'));

-- Backfill for legacy rows: ensure user_id is populated from id
UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

-- Harden UID-based identity mapping
ALTER TABLE public.profiles
  ALTER COLUMN user_id SET NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS profiles_user_id_unique
  ON public.profiles(user_id);

-- ============================================================
-- 2. Create feature_flags table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.feature_flags (
  key                 TEXT        PRIMARY KEY,
  enabled             BOOLEAN     NOT NULL DEFAULT true,
  maintenance_message TEXT        NOT NULL DEFAULT 'Fitur ini sedang dalam perbaikan. Mohon coba beberapa saat lagi.',
  updated_at          TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_by          UUID        REFERENCES auth.users(id)
);

-- ============================================================
-- 3. Create usage_logs table
-- ============================================================
CREATE TABLE IF NOT EXISTS public.usage_logs (
  id           UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id      UUID        NOT NULL REFERENCES auth.users(id),
  feature_key  TEXT        NOT NULL,
  accessed_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for analytics queries
CREATE INDEX IF NOT EXISTS idx_usage_logs_feature_key  ON public.usage_logs(feature_key);
CREATE INDEX IF NOT EXISTS idx_usage_logs_user_id      ON public.usage_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_usage_logs_accessed_at  ON public.usage_logs(accessed_at);

-- ============================================================
-- 4. Helper function: is_admin()
-- ============================================================
CREATE OR REPLACE FUNCTION public.is_admin()
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles
    WHERE COALESCE(user_id, id) = auth.uid() AND role = 'admin'
  );
$$;

-- ============================================================
-- 5. RLS – feature_flags
--    Public read (all authenticated users), admin write
-- ============================================================
ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "feature_flags_public_select" ON public.feature_flags;
CREATE POLICY "feature_flags_public_select"
  ON public.feature_flags FOR SELECT
  TO authenticated, anon
  USING (true);

DROP POLICY IF EXISTS "feature_flags_admin_all" ON public.feature_flags;
CREATE POLICY "feature_flags_admin_all"
  ON public.feature_flags FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 6. RLS – usage_logs
--    Users insert own records; admins read all
-- ============================================================
ALTER TABLE public.usage_logs ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "usage_logs_insert_own" ON public.usage_logs;
CREATE POLICY "usage_logs_insert_own"
  ON public.usage_logs FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "usage_logs_admin_select" ON public.usage_logs;
CREATE POLICY "usage_logs_admin_select"
  ON public.usage_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- ============================================================
-- 7. RLS – profiles (extend existing policies for admin access)
--    Note: existing "Users can view own profile" policy stays.
--    We add an admin-override SELECT and UPDATE policy.
-- ============================================================
DROP POLICY IF EXISTS "profiles_admin_select" ON public.profiles;
CREATE POLICY "profiles_admin_select"
  ON public.profiles FOR SELECT
  TO authenticated
  USING (public.is_admin() OR auth.uid() = COALESCE(user_id, id));

DROP POLICY IF EXISTS "profiles_admin_update_role" ON public.profiles;
CREATE POLICY "profiles_admin_update_role"
  ON public.profiles FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- ============================================================
-- 8. Seed feature_flags (all enabled by default)
-- ============================================================
INSERT INTO public.feature_flags (key, enabled, maintenance_message) VALUES
  ('icd10',            true, 'Fitur ICD-10 e-Klaim sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('calculator',       true, 'Kalkulator Medis sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('drug-interaction', true, 'Interaction Checker sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('fornas',           true, 'Obat Fornas sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('emergency-dose',   true, 'Simulasi Dosis Darurat sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('infusion-calc',    true, 'Kalkulator Infus & Konversi Kecepatan sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('pharmacokinetics', true, 'Farmakokinetik Klinis sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('pediatric-calc',   true, 'Kalkulator Pediatrik sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('nutrition-bsa',    true, 'Kalkulator Gizi & BSA sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('news',             true, 'Fitur Berita sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('reports',          true, 'Fitur Laporan sedang dalam perbaikan. Mohon coba beberapa saat lagi.'),
  ('ai-drug-summary',  true, 'Fitur Ringkasan AI Interaksi Obat sedang dalam perbaikan. Mohon coba beberapa saat lagi.')
ON CONFLICT (key) DO NOTHING;

-- ============================================================
-- 9. Bootstrap: promote your own accounts to admin (UID-based)
--    Use user_id UUID, not username (username can change).
-- ============================================================
-- Step A: find target UID(s)
-- SELECT username, user_id, role, created_at
-- FROM public.profiles
-- ORDER BY created_at DESC;

-- Step B: promote by UID
-- UPDATE public.profiles
--   SET role = 'admin'
--   WHERE COALESCE(user_id, id) IN (
--     '00000000-0000-0000-0000-000000000000',
--     '11111111-1111-1111-1111-111111111111'
--   );

-- ============================================================
-- Done!
-- After running this file:
--   1. Run step 9 with real target user_id UUID(s)
--   2. Log in -> sidebar will show "Panel Admin"
-- ============================================================
