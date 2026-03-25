-- PHASE 13: EXCLUSIVE SESSION & LOG RETENTION (FIXED VERSION)
-- Tujuan: Mendukung mekanisme Hard Lock dan Pembersihan Otomatis.

-- 1. Tambahkan Index untuk Performa Heartbeat
CREATE INDEX IF NOT EXISTS idx_sessions_active_activity 
ON public.user_login_sessions (user_id, is_active, last_activity_at);

-- 2. RPC: Takeover Exclusive Session (FIXED)
-- Fungsi ini akan mematikan semua sesi aktif user kecuali sesi yang sedang digunakan sekarang.
-- Parameter p_current_session_id diubah ke TEXT agar cocok dengan ID browser (hw-xxxx).
CREATE OR REPLACE FUNCTION public.takeover_exclusive_session(
    p_user_id UUID,
    p_current_session_id TEXT 
)
RETURNS TABLE (success BOOLEAN, message TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
    -- Matikan semua sesi aktif lainnya milik user ini
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

    -- Catat kejadian keamanan
    INSERT INTO public.security_events (user_id, event_type, severity, metadata)
    VALUES (
        p_user_id, 
        'session_takeover', 
        'medium', 
        jsonb_build_object('session_id', p_current_session_id, 'source', 'exclusive_guard')
    );

    RETURN QUERY SELECT true, 'Takeover berhasil. Sesi lain telah diputus.'::TEXT;
END;
$$;

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
