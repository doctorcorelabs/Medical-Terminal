-- PHASE 13: EXCLUSIVE SESSION & LOG RETENTION (FIXED VERSION)
-- Tujuan: Mendukung mekanisme Hard Lock dan Pembersihan Otomatis.

-- 1. Tambahkan Index untuk Performa Heartbeat
CREATE INDEX IF NOT EXISTS idx_sessions_active_activity 
ON public.user_login_sessions (user_id, is_active, last_activity_at);

-- 2. RPC: Takeover Exclusive Session (FIXED)
-- Fungsi ini akan mematikan semua sesi aktif user kecuali sesi yang sedang digunakan sekarang.
-- Hapus versi lama (UUID, UUID) jika ada untuk menghindari error "function not unique"
DROP FUNCTION IF EXISTS public.takeover_exclusive_session(UUID, UUID);
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

    -- 1. MATIKAN semua sesi aktif lainnya milik user ini
    UPDATE public.user_login_sessions
    SET 
        is_active = false,
        revoked_at = now(),
        revoke_reason = 'kicked_by_exclusive_takeover',
        updated_at = now()
    WHERE user_id = p_user_id
        -- Gunakan kolom session_id (TEXT), bukan id (UUID)
      AND session_id != p_current_session_id 
      AND is_active = true;

        GET DIAGNOSTICS v_deactivated_count = ROW_COUNT;

    -- 2. PASTIKAN sesi ini sendiri aktif (Jika sebelumnya di-kick oleh perangkat lain)
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

    -- Catat kejadian keamanan
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

-- IZINKAN USER TERAUTENTIKASI MENJALANKAN FUNGSI INI
GRANT EXECUTE ON FUNCTION public.takeover_exclusive_session(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.takeover_exclusive_session(UUID, TEXT) TO anon;
GRANT EXECUTE ON FUNCTION public.takeover_exclusive_session(UUID, TEXT) TO service_role;

-- 3. Log Retention (Auto-Delete) via pg_cron
-- Pastikan ekstensi pg_cron aktif (biasanya sudah aktif di Supabase)
-- Jalankan setiap hari jam 00:00 UTC
-- Menghapus sesi non-aktif yang lebih lama dari 30 hari.

-- Catatan: Jalankan query berikut secara manual di SQL Editor jika cron belum aktif:
-- SELECT cron.schedule('cleanup-expired-sessions', '0 0 * * *', $$
--   DELETE FROM public.user_login_sessions 
--   WHERE is_active = false 
--   AND last_activity_at < (now() - interval '30 days');
-- $$);

-- 4. View untuk Dashboard Admin (Optimasi)
-- Menghitung jumlah sesi "Panas" (Last activity < 7 Menit)
CREATE OR REPLACE VIEW public.v_active_exclusive_status AS
SELECT 
    user_id,
    count(*) FILTER (WHERE is_active = true AND last_activity_at > (now() - interval '7 minutes')) as hot_sessions_count
FROM public.user_login_sessions
GROUP BY user_id;
