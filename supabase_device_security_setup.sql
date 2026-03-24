-- ============================================================
-- supabase_device_security_setup.sql
-- Device Session Limit + Manual Ban Governance
-- Run this in Supabase SQL Editor (after supabase_admin_setup.sql)
-- ============================================================

-- 1) Device registry per user
CREATE TABLE IF NOT EXISTS public.user_devices (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id        TEXT NOT NULL,
  device_name      TEXT,
  user_agent       TEXT,
  is_trusted       BOOLEAN NOT NULL DEFAULT false,
  first_seen_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at       TIMESTAMPTZ,
  revoked_reason   TEXT,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, device_id)
);

CREATE INDEX IF NOT EXISTS idx_user_devices_user_last_seen
  ON public.user_devices(user_id, last_seen_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_devices_revoked
  ON public.user_devices(user_id, revoked_at);

-- Legacy compatibility: ensure ON CONFLICT(user_id, device_id) works
DO $$
BEGIN
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
END $$;

-- 2) Active login session per device per user
CREATE TABLE IF NOT EXISTS public.user_login_sessions (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id           UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id         TEXT NOT NULL,
  session_id        TEXT NOT NULL,
  user_agent        TEXT,
  is_active         BOOLEAN NOT NULL DEFAULT true,
  session_started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_activity_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  revoked_at        TIMESTAMPTZ,
  revoke_reason     TEXT,
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, session_id)
);

CREATE INDEX IF NOT EXISTS idx_user_login_sessions_active
  ON public.user_login_sessions(user_id, is_active, last_activity_at DESC);

CREATE INDEX IF NOT EXISTS idx_user_login_sessions_device
  ON public.user_login_sessions(device_id, last_activity_at DESC);

DO $$
BEGIN
  -- Drop old unique index if exists
  EXECUTE 'DROP INDEX IF EXISTS idx_user_login_sessions_user_device_unique';
  
  -- Ensure session_id column exists
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_login_sessions' AND column_name='session_id') THEN
    ALTER TABLE public.user_login_sessions ADD COLUMN session_id TEXT;
    -- Backfill session_id with device_id for existing rows
    UPDATE public.user_login_sessions SET session_id = device_id WHERE session_id IS NULL;
    ALTER TABLE public.user_login_sessions ALTER COLUMN session_id SET NOT NULL;
  END IF;

  -- Ensure unique constraint is on (user_id, session_id)
  -- First drop the old UNIQUE constraint if it exists (might be named differently by Postgres)
  -- Then create the new unique index
  EXECUTE 'CREATE UNIQUE INDEX IF NOT EXISTS idx_user_login_sessions_user_session_unique ON public.user_login_sessions(user_id, session_id)';
END $$;

-- 3) Ban policy (manual by admin)
CREATE TABLE IF NOT EXISTS public.user_ban_policies (
  id               UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id          UUID NOT NULL UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  is_banned        BOOLEAN NOT NULL DEFAULT false,
  reason           TEXT,
  banned_by        UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  banned_at        TIMESTAMPTZ,
  ban_expires_at   TIMESTAMPTZ,
  unbanned_at      TIMESTAMPTZ,
  unbanned_by      UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_ban_policies_active
  ON public.user_ban_policies(is_banned, ban_expires_at);

-- Legacy safety: ensure ON CONFLICT(user_id) is always valid.
DO $$
BEGIN
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
END $$;

-- 4) Security events for admin review
CREATE TABLE IF NOT EXISTS public.security_events (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id        UUID REFERENCES auth.users(id) ON DELETE CASCADE,
  device_id      TEXT,
  event_type     TEXT NOT NULL,
  severity       TEXT NOT NULL DEFAULT 'low' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  metadata       JSONB,
  resolved       BOOLEAN NOT NULL DEFAULT false,
  resolved_by    UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  resolved_at    TIMESTAMPTZ,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_user_time
  ON public.security_events(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_events_severity_open
  ON public.security_events(severity, resolved, created_at DESC);

-- 5) Helper: check ban status by user id
CREATE OR REPLACE FUNCTION public.is_user_banned(p_user_id UUID DEFAULT auth.uid())
RETURNS BOOLEAN
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_ban_policies b
    WHERE b.user_id = p_user_id
      AND b.is_banned = true
      AND (b.ban_expires_at IS NULL OR b.ban_expires_at > now())
  );
$$;

-- 6) Helper: register/refresh device session and enforce max devices
CREATE OR REPLACE FUNCTION public.register_user_device_session(
  p_user_id UUID,
  p_device_id TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL,
  p_max_devices INTEGER DEFAULT 2,
  p_session_id TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_revoked_session_id UUID;
  v_revoked_device_id TEXT;
  v_active_count INTEGER;
BEGIN
  IF p_user_id IS NULL OR p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RAISE EXCEPTION 'invalid device session payload';
  END IF;

  -- Only self calls or admins can execute for a target user.
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized to register session for this user';
  END IF;

  -- Upsert device catalog
  INSERT INTO public.user_devices (user_id, device_id, device_name, user_agent, is_trusted, first_seen_at, last_seen_at, revoked_at, revoked_reason, created_at, updated_at)
  VALUES (p_user_id, p_device_id, p_device_name, p_user_agent, false, now(), now(), NULL, NULL, now(), now())
  ON CONFLICT (user_id, device_id)
  DO UPDATE SET
    device_name = COALESCE(EXCLUDED.device_name, public.user_devices.device_name),
    user_agent = EXCLUDED.user_agent,
    last_seen_at = now(),
    revoked_at = NULL,
    revoked_reason = NULL,
    updated_at = now();

  -- Upsert login session for this specific browser session on this device
  INSERT INTO public.user_login_sessions (user_id, device_id, session_id, user_agent, is_active, session_started_at, last_activity_at, revoked_at, revoke_reason, created_at, updated_at)
  VALUES (p_user_id, p_device_id, COALESCE(p_session_id, p_device_id), p_user_agent, true, now(), now(), NULL, NULL, now(), now())
  ON CONFLICT (user_id, session_id)
  DO UPDATE SET
    device_id = EXCLUDED.device_id,
    user_agent = EXCLUDED.user_agent,
    is_active = true,
    session_started_at = COALESCE(public.user_login_sessions.session_started_at, now()),
    last_activity_at = now(),
    revoked_at = NULL,
    revoke_reason = NULL,
    updated_at = now();

  -- Count active distinct physical devices
  SELECT COUNT(DISTINCT s.device_id)::INTEGER
    INTO v_active_count
  FROM public.user_login_sessions s
  WHERE s.user_id = p_user_id
    AND s.is_active = true;

  -- If over limit, revoke oldest active session that is not current device
  IF v_active_count > GREATEST(COALESCE(p_max_devices, 2), 1) THEN
    WITH oldest AS (
      SELECT s.id, s.device_id
      FROM public.user_login_sessions s
      WHERE s.user_id = p_user_id
        AND s.is_active = true
        AND s.device_id <> p_device_id
      ORDER BY COALESCE(s.last_activity_at, s.session_started_at, s.created_at) ASC
      LIMIT 1
    ), revoke_session AS (
      UPDATE public.user_login_sessions s
      SET is_active = false,
          revoked_at = now(),
          revoke_reason = 'device_limit_auto_revoke',
          updated_at = now()
      FROM oldest o
      WHERE s.id = o.id
      RETURNING s.id, s.device_id
    ), revoke_device AS (
      UPDATE public.user_devices d
      SET revoked_at = now(),
          revoked_reason = 'device_limit_auto_revoke',
          updated_at = now()
      FROM revoke_session r
      WHERE d.user_id = p_user_id
        AND d.device_id = r.device_id
      RETURNING d.device_id
    )
    SELECT r.id, r.device_id
      INTO v_revoked_session_id, v_revoked_device_id
    FROM revoke_session r;

    IF v_revoked_session_id IS NOT NULL THEN
      INSERT INTO public.security_events (user_id, device_id, event_type, severity, metadata, created_at, updated_at)
      VALUES (
        p_user_id,
        p_device_id,
        'device_limit_enforced',
        'medium',
        jsonb_build_object(
          'revoked_session_id', v_revoked_session_id,
          'revoked_device_id', v_revoked_device_id,
          'max_devices', GREATEST(COALESCE(p_max_devices, 2), 1)
        ),
        now(),
        now()
      );
    END IF;
  END IF;

  SELECT COUNT(DISTINCT s.device_id)::INTEGER
    INTO v_active_count
  FROM public.user_login_sessions s
  WHERE s.user_id = p_user_id
    AND s.is_active = true;

  RETURN jsonb_build_object(
    'active_count', v_active_count,
    'revoked_session_id', v_revoked_session_id,
    'revoked_device_id', v_revoked_device_id,
    'max_devices', GREATEST(COALESCE(p_max_devices, 2), 1)
  );
END;
$$;

-- 7) Enable RLS
ALTER TABLE public.user_devices ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_login_sessions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_ban_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

-- user_devices policies
DROP POLICY IF EXISTS "user_devices_select_own_or_admin" ON public.user_devices;
CREATE POLICY "user_devices_select_own_or_admin"
  ON public.user_devices FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "user_devices_update_own_or_admin" ON public.user_devices;
CREATE POLICY "user_devices_update_own_or_admin"
  ON public.user_devices FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "user_devices_insert_own_or_admin" ON public.user_devices;
CREATE POLICY "user_devices_insert_own_or_admin"
  ON public.user_devices FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- user_login_sessions policies
DROP POLICY IF EXISTS "sessions_select_own_or_admin" ON public.user_login_sessions;
CREATE POLICY "sessions_select_own_or_admin"
  ON public.user_login_sessions FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "sessions_insert_own_or_admin" ON public.user_login_sessions;
CREATE POLICY "sessions_insert_own_or_admin"
  ON public.user_login_sessions FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "sessions_update_own_or_admin" ON public.user_login_sessions;
CREATE POLICY "sessions_update_own_or_admin"
  ON public.user_login_sessions FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin())
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

-- user_ban_policies policies
DROP POLICY IF EXISTS "ban_policies_select_own_or_admin" ON public.user_ban_policies;
CREATE POLICY "ban_policies_select_own_or_admin"
  ON public.user_ban_policies FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "ban_policies_admin_all" ON public.user_ban_policies;
CREATE POLICY "ban_policies_admin_all"
  ON public.user_ban_policies FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- security_events policies
DROP POLICY IF EXISTS "security_events_select_own_or_admin" ON public.security_events;
CREATE POLICY "security_events_select_own_or_admin"
  ON public.security_events FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "security_events_insert_own_or_admin" ON public.security_events;
CREATE POLICY "security_events_insert_own_or_admin"
  ON public.security_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id OR public.is_admin());

DROP POLICY IF EXISTS "security_events_admin_update" ON public.security_events;
CREATE POLICY "security_events_admin_update"
  ON public.security_events FOR UPDATE
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 8) Optional seed: ensure row exists for existing users can be created on demand by app
-- No static seed required.
