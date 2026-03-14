-- ============================================================
-- supabase_profiles_sync_setup.sql
-- Sync auth.users -> public.profiles + auto profile trigger
-- Run this in Supabase SQL Editor as project owner
-- ============================================================

-- 1) Ensure legacy rows have user_id
UPDATE public.profiles
SET user_id = id
WHERE user_id IS NULL;

-- 2) Backfill missing profiles from auth.users
INSERT INTO public.profiles (id, user_id, username, full_name, created_at, role)
SELECT
  au.id,
  au.id,
  'user_' || substr(replace(au.id::text, '-', ''), 1, 8) AS username,
  COALESCE(
    au.raw_user_meta_data->>'full_name',
    au.raw_user_meta_data->>'name',
    split_part(au.email, '@', 1)
  ) AS full_name,
  COALESCE(au.created_at, now()) AS created_at,
  'user' AS role
FROM auth.users au
LEFT JOIN public.profiles p
  ON p.user_id = au.id OR p.id = au.id
WHERE p.id IS NULL;

-- 3) Normalize user_id for rows that matched by id but had different/null user_id
UPDATE public.profiles p
SET user_id = p.id
WHERE p.user_id IS DISTINCT FROM p.id
  AND EXISTS (
    SELECT 1
    FROM auth.users au
    WHERE au.id = p.id
  );

-- 4) Create trigger function for future signups
CREATE OR REPLACE FUNCTION public.create_profile_on_auth()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, username, full_name, created_at, role)
  VALUES (
    NEW.id,
    NEW.id,
    'user_' || substr(replace(NEW.id::text, '-', ''), 1, 8),
    COALESCE(
      NEW.raw_user_meta_data->>'full_name',
      NEW.raw_user_meta_data->>'name',
      split_part(NEW.email, '@', 1)
    ),
    now(),
    'user'
  )
  ON CONFLICT (user_id) DO NOTHING;

  RETURN NEW;
END;
$$;

-- 5) Recreate trigger
DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW
EXECUTE FUNCTION public.create_profile_on_auth();

-- 6) Verify counts
SELECT
  (SELECT count(*) FROM auth.users) AS total_auth_users,
  (SELECT count(*) FROM public.profiles) AS total_profiles;

-- 7) Preview latest profile rows
SELECT id, user_id, username, role, created_at
FROM public.profiles
ORDER BY created_at DESC
LIMIT 100;
