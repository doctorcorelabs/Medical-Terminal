-- Fix for profiles_role_check blocking the 'specialist' role

-- 1. Drop the existing constraint
ALTER TABLE public.profiles DROP CONSTRAINT IF EXISTS profiles_role_check;

-- 2. Add the new constraint allowing 'specialist'
ALTER TABLE public.profiles ADD CONSTRAINT profiles_role_check 
    CHECK (role IN ('admin', 'user', 'specialist'));

-- 3. Just to be safe, grant necessary permissions to service_role on profiles
GRANT ALL ON public.profiles TO service_role;
