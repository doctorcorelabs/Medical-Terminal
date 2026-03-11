-- Supabase DELETE policies for user-owned rows
-- Run this in Supabase SQL Editor if you want users to be able
-- to permanently delete their own data via authenticated requests.

-- Patients: allow users to delete their own row
DROP POLICY IF EXISTS "Users can delete their own patients data" ON public.user_patients;
CREATE POLICY "Users can delete their own patients data"
  ON public.user_patients FOR DELETE
  USING (auth.uid() = user_id);

-- Stases: allow users to delete their own row
DROP POLICY IF EXISTS "Users can delete their own stases data" ON public.user_stases;
CREATE POLICY "Users can delete their own stases data"
  ON public.user_stases FOR DELETE
  USING (auth.uid() = user_id);

-- (Optional) Schedules: allow users to delete their own row if you use user_schedules
DROP POLICY IF EXISTS "Users can delete their own schedules data" ON public.user_schedules;
CREATE POLICY "Users can delete their own schedules data"
  ON public.user_schedules FOR DELETE
  USING (auth.uid() = user_id);

-- NOTES:
-- 1) If you prefer not to physically delete rows, use an upsert to set patients_data = '[]'.
--    Example (JS): await supabase.from('user_patients').upsert({ user_id, patients_data: [] })
-- 2) Run this file after running supabase_setup.sql (which creates the tables and RLS for SELECT/INSERT/UPDATE).
-- 3) These policies allow the logged-in user (auth) to delete only their own row.
