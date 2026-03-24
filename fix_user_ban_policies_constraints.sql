-- ============================================================
-- fix_user_ban_policies_constraints.sql
-- Fix ON CONFLICT(user_id) for user_ban_policies upsert
-- Run this in Supabase SQL Editor
-- ============================================================

DO $$
BEGIN
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_ban_policies'
  ) THEN
    -- Keep only newest row per user so unique index can be created safely.
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id
          ORDER BY COALESCE(updated_at, banned_at, created_at) DESC, id DESC
        ) AS rn
      FROM public.user_ban_policies
    )
    DELETE FROM public.user_ban_policies b
    USING ranked r
    WHERE b.id = r.id
      AND r.rn > 1;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_ban_policies_user_id_unique ON public.user_ban_policies(user_id)';
  END IF;
END $$;

-- Optional verification:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND tablename = 'user_ban_policies'
--   AND indexname = 'idx_user_ban_policies_user_id_unique';
