-- ============================================================
-- fix_device_session_constraints.sql
-- Fix RPC register_user_device_session ON CONFLICT mismatch
-- Run this in Supabase SQL Editor
-- ============================================================

-- This patch handles legacy deployments where tables may already exist
-- without unique indexes required by ON CONFLICT (user_id, device_id).

DO $$
BEGIN
  -- 1) Deduplicate user_devices to keep only newest row per (user_id, device_id)
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_devices'
  ) THEN
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, device_id
          ORDER BY COALESCE(updated_at, last_seen_at, created_at, first_seen_at) DESC, id DESC
        ) AS rn
      FROM public.user_devices
    )
    DELETE FROM public.user_devices d
    USING ranked r
    WHERE d.id = r.id
      AND r.rn > 1;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_devices_user_device_unique ON public.user_devices(user_id, device_id)';
  END IF;

  -- 2) Deduplicate user_login_sessions to keep only newest row per (user_id, device_id)
  IF EXISTS (
    SELECT 1
    FROM information_schema.tables
    WHERE table_schema = 'public' AND table_name = 'user_login_sessions'
  ) THEN
    WITH ranked AS (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY user_id, device_id
          ORDER BY COALESCE(updated_at, last_activity_at, session_started_at, created_at) DESC, id DESC
        ) AS rn
      FROM public.user_login_sessions
    )
    DELETE FROM public.user_login_sessions s
    USING ranked r
    WHERE s.id = r.id
      AND r.rn > 1;

    EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_login_sessions_user_device_unique ON public.user_login_sessions(user_id, device_id)';
  END IF;
END $$;

-- Optional verification:
-- SELECT indexname, indexdef
-- FROM pg_indexes
-- WHERE schemaname = 'public'
--   AND indexname IN (
--     'idx_user_devices_user_device_unique',
--     'idx_user_login_sessions_user_device_unique'
--   );
