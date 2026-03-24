-- Fix: Add DELETE policies for Admin to manage health of device catalogs

-- 1. Policies for user_devices
DROP POLICY IF EXISTS "user_devices_delete_admin" ON public.user_devices;
CREATE POLICY "user_devices_delete_admin"
  ON public.user_devices FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 2. Policies for user_login_sessions
DROP POLICY IF EXISTS "sessions_delete_admin" ON public.user_login_sessions;
CREATE POLICY "sessions_delete_admin"
  ON public.user_login_sessions FOR DELETE
  TO authenticated
  USING (public.is_admin());

-- 3. (Optional) Check if is_admin() function exists and is correct
-- This assumes you have already run the admin setup script.
