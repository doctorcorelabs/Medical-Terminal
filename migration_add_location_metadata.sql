-- ============================================================
-- migration_add_location_metadata.sql
-- Adds location tracking support to device security system.
-- ============================================================

-- 1) Add location_metadata column to user_devices
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_devices' AND column_name='location_metadata') THEN
    ALTER TABLE public.user_devices ADD COLUMN location_metadata JSONB;
  END IF;
END $$;

-- 2) Add location_metadata column to user_login_sessions
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='user_login_sessions' AND column_name='location_metadata') THEN
    ALTER TABLE public.user_login_sessions ADD COLUMN location_metadata JSONB;
  END IF;
END $$;

-- 3) Update RPC register_user_device_session to handle location
CREATE OR REPLACE FUNCTION public.register_user_device_session(
  p_user_id UUID,
  p_device_id TEXT,
  p_user_agent TEXT DEFAULT NULL,
  p_device_name TEXT DEFAULT NULL,
  p_max_devices INTEGER DEFAULT 2,
  p_session_id TEXT DEFAULT NULL,
  p_location_metadata JSONB DEFAULT NULL
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
  v_is_whitelisted BOOLEAN := false;
BEGIN
  IF p_user_id IS NULL OR p_device_id IS NULL OR length(trim(p_device_id)) = 0 THEN
    RAISE EXCEPTION 'invalid device session payload';
  END IF;

  -- Only self calls or admins can execute for a target user.
  IF auth.uid() IS DISTINCT FROM p_user_id AND NOT public.is_admin() THEN
    RAISE EXCEPTION 'not authorized to register session for this user';
  END IF;

  -- Check whitelist status
  SELECT (role = 'admin' OR is_security_whitelisted)
  INTO v_is_whitelisted
  FROM public.profiles
  WHERE user_id = p_user_id;

  -- Upsert device catalog
  INSERT INTO public.user_devices (
    user_id, device_id, device_name, user_agent, 
    is_trusted, first_seen_at, last_seen_at, 
    location_metadata, updated_at
  )
  VALUES (
    p_user_id, p_device_id, p_device_name, p_user_agent, 
    false, now(), now(), 
    p_location_metadata, now()
  )
  ON CONFLICT (user_id, device_id)
  DO UPDATE SET
    device_name = COALESCE(EXCLUDED.device_name, public.user_devices.device_name),
    user_agent = EXCLUDED.user_agent,
    last_seen_at = now(),
    location_metadata = COALESCE(EXCLUDED.location_metadata, public.user_devices.location_metadata),
    revoked_at = NULL,
    revoked_reason = NULL,
    updated_at = now();

  -- Upsert login session
  INSERT INTO public.user_login_sessions (
    user_id, device_id, session_id, user_agent, 
    is_active, session_started_at, last_activity_at, 
    location_metadata, updated_at
  )
  VALUES (
    p_user_id, p_device_id, COALESCE(p_session_id, p_device_id), p_user_agent, 
    true, now(), now(), 
    p_location_metadata, now()
  )
  ON CONFLICT (user_id, session_id)
  DO UPDATE SET
    device_id = EXCLUDED.device_id,
    user_agent = EXCLUDED.user_agent,
    is_active = true,
    last_activity_at = now(),
    location_metadata = COALESCE(EXCLUDED.location_metadata, public.user_login_sessions.location_metadata),
    revoked_at = NULL,
    revoke_reason = NULL,
    updated_at = now();

  -- Count active distinct physical devices
  SELECT COUNT(DISTINCT s.device_id)::INTEGER
    INTO v_active_count
  FROM public.user_login_sessions s
  WHERE s.user_id = p_user_id
    AND s.is_active = true;

  -- Enforcement logic (unchanged from original)
  IF NOT COALESCE(v_is_whitelisted, false) AND v_active_count > GREATEST(COALESCE(p_max_devices, 2), 1) THEN
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
          revoke_message_custom = 'Sesi ini dihentikan secara otomatis karena Anda login dari perangkat baru dan telah melebihi batas maksimal perangkat fisik.',
          updated_at = now()
      FROM oldest o
      WHERE s.id = o.id
      RETURNING s.id, s.device_id
    )
    SELECT r.id, r.device_id
      INTO v_revoked_session_id, v_revoked_device_id
    FROM revoke_session r;
  END IF;

  RETURN jsonb_build_object(
    'active_count', v_active_count,
    'revoked_session_id', v_revoked_session_id,
    'revoked_device_id', v_revoked_device_id
  );
END;
$$;
