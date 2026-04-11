-- SECURITY PATCH v2: Enforce caller ownership in takeover_exclusive_session
-- Masalah: RPC bisa dipanggil oleh user manapun dengan p_user_id milik user lain,
--          dan bahkan oleh anon tanpa autentikasi.
-- Perbaikan:
--   1. Tambahkan guard auth.uid() = p_user_id sebelum eksekusi apapun.
--   2. Revoke EXECUTE dari role 'anon'.

DROP FUNCTION IF EXISTS public.takeover_exclusive_session(UUID, TEXT);

CREATE OR REPLACE FUNCTION public.takeover_exclusive_session(
    p_user_id UUID,
    p_current_session_id TEXT
)
RETURNS TABLE (
    success BOOLEAN,
    code TEXT,
    message TEXT,
    deactivated_sessions INTEGER,
    reactivated_current BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
    v_started_at TIMESTAMPTZ := clock_timestamp();
    v_deactivated_count INTEGER := 0;
    v_reactivated_count INTEGER := 0;
    v_session_exists BOOLEAN := false;
    v_duration_ms INTEGER := 0;
BEGIN
    -- Security: caller JWT must match the target user_id.
    -- Prevents cross-user takeover attacks.
    IF auth.uid() IS NULL OR auth.uid() != p_user_id THEN
        RETURN QUERY SELECT false, 'unauthorized'::TEXT, 'Akses ditolak: sesi ini bukan milik Anda.'::TEXT, 0, false;
        RETURN;
    END IF;

    IF p_user_id IS NULL OR p_current_session_id IS NULL OR btrim(p_current_session_id) = '' THEN
        RETURN QUERY SELECT false, 'invalid_input'::TEXT, 'Parameter takeover tidak valid.'::TEXT, 0, false;
        RETURN;
    END IF;

    -- Per-user transaction lock to prevent split-brain on concurrent takeover requests.
    PERFORM pg_advisory_xact_lock(hashtext('exclusive_takeover:' || p_user_id::TEXT));

    SELECT EXISTS (
        SELECT 1
        FROM public.user_login_sessions
        WHERE user_id = p_user_id
          AND session_id = p_current_session_id
    ) INTO v_session_exists;

    IF NOT v_session_exists THEN
        RETURN QUERY SELECT false, 'session_not_found'::TEXT, 'Sesi saat ini tidak ditemukan.'::TEXT, 0, false;
        RETURN;
    END IF;

    -- 1. Deactivate all other active sessions for this user.
    UPDATE public.user_login_sessions
    SET
        is_active = false,
        revoked_at = now(),
        revoke_reason = 'kicked_by_exclusive_takeover',
        updated_at = now()
    WHERE user_id = p_user_id
      AND session_id != p_current_session_id
      AND is_active = true;

    GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

    -- 2. Ensure the current session is active (re-activate if it was previously kicked).
    UPDATE public.user_login_sessions
    SET
        is_active = true,
        revoked_at = NULL,
        revoke_reason = NULL,
        updated_at = now()
    WHERE user_id = p_user_id
      AND session_id = p_current_session_id;

    GET DIAGNOSTICS v_reactivated_count = ROW_COUNT;

    v_duration_ms := GREATEST(0, FLOOR(EXTRACT(EPOCH FROM (clock_timestamp() - v_started_at)) * 1000)::INTEGER);

    INSERT INTO public.security_events (user_id, event_type, severity, metadata)
    VALUES (
        p_user_id,
        'session_takeover',
        'medium',
        jsonb_build_object(
            'session_id', p_current_session_id,
            'source', 'exclusive_guard',
            'deactivated_sessions', v_deactivated_count,
            'reactivated_current', (v_reactivated_count > 0),
            'duration_ms', v_duration_ms
        )
    );

    IF v_deactivated_count > 0 THEN
        RETURN QUERY SELECT true, 'takeover_applied'::TEXT, 'Takeover berhasil. Sesi lain telah diputus.'::TEXT, v_deactivated_count, (v_reactivated_count > 0);
    ELSE
        RETURN QUERY SELECT true, 'already_primary'::TEXT, 'Perangkat ini sudah menjadi sesi utama aktif.'::TEXT, 0, (v_reactivated_count > 0);
    END IF;
END;
$$;

-- Only authenticated users may call this function.
-- anon access is explicitly removed.
REVOKE EXECUTE ON FUNCTION public.takeover_exclusive_session(UUID, TEXT) FROM anon;
GRANT EXECUTE ON FUNCTION public.takeover_exclusive_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.takeover_exclusive_session(UUID, TEXT) TO service_role;
