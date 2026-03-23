-- supabase_patients_limit_policy.sql
-- Enforce patient-count business rules at DB layer for user_patients writes.
-- Run in Supabase SQL Editor after base tables/policies are created.

-- Business rules:
-- 1) admin: unlimited patients
-- 2) specialist with active subscription: unlimited patients
-- 3) others (user/intern/expired specialist): max 2 patients

CREATE OR REPLACE FUNCTION public.can_write_user_patients(target_user_id uuid, patients_payload jsonb)
RETURNS boolean
LANGUAGE plpgsql
STABLE
AS $$
DECLARE
  profile_role text;
  expires_at timestamptz;
  payload_count integer;
BEGIN
  IF auth.uid() IS NULL OR auth.uid() <> target_user_id THEN
    RETURN false;
  END IF;

  SELECT p.role, p.subscription_expires_at
    INTO profile_role, expires_at
  FROM public.profiles p
  WHERE COALESCE(p.user_id, p.id) = auth.uid()
  LIMIT 1;

  IF profile_role = 'admin' THEN
    RETURN true;
  END IF;

  IF profile_role = 'specialist' AND (expires_at IS NULL OR expires_at > now()) THEN
    RETURN true;
  END IF;

  payload_count := CASE
    WHEN patients_payload IS NULL THEN 0
    WHEN jsonb_typeof(patients_payload) <> 'array' THEN 0
    ELSE jsonb_array_length(patients_payload)
  END;

  RETURN payload_count <= 2;
END;
$$;

-- Re-apply write policies to use the validator.
DROP POLICY IF EXISTS "Users can insert their own patients data" ON public.user_patients;
CREATE POLICY "Users can insert their own patients data"
  ON public.user_patients FOR INSERT
  WITH CHECK (public.can_write_user_patients(user_id, patients_data));

DROP POLICY IF EXISTS "Users can update their own patients data" ON public.user_patients;
CREATE POLICY "Users can update their own patients data"
  ON public.user_patients FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (public.can_write_user_patients(user_id, patients_data));
