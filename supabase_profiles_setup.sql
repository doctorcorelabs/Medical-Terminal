-- supabase_profiles_setup.sql
-- Creates a simple profiles table and an optional trigger to populate it when a user signs up
-- Run this in Supabase SQL Editor (or via psql) as a project owner.

-- 1) Create profiles table
CREATE TABLE IF NOT EXISTS public.profiles (
  id uuid PRIMARY KEY DEFAULT auth.uid(),
  user_id uuid UNIQUE REFERENCES auth.users(id) ON DELETE CASCADE,
  username text UNIQUE NOT NULL,
  full_name text,
  created_at timestamp with time zone DEFAULT now()
);

-- 2) Ensure username is lowercase (optional) - add a check or use trigger
-- This check enforces allowed characters and length (3-20, letters/numbers/underscore)
ALTER TABLE public.profiles
  DROP CONSTRAINT IF EXISTS profiles_username_format;
ALTER TABLE public.profiles
  ADD CONSTRAINT profiles_username_format CHECK (username ~ '^[A-Za-z0-9_]{3,20}$');

-- 3) Index for fast lookup (case-insensitive)
CREATE INDEX IF NOT EXISTS idx_profiles_username_ilower ON public.profiles (lower(username));

-- 4) Enable Row Level Security
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- 4a) Users can read their own profile
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (auth.uid() = user_id);

-- 4b) Users can insert their own profile (signup flow)
CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (auth.uid() = user_id);

-- 4c) Users can update their own profile
CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

-- 4d) Allow reading username/full_name publicly (needed for availability check)
--     Remove this if you want profiles to be strictly private.
CREATE POLICY "Usernames are publicly readable"
  ON public.profiles FOR SELECT
  USING (true);

-- 4) (Optional) Function + trigger to create profile row when a user is created via auth
-- Note: This trigger uses auth.users table which is only available to service_role or DB owner.
-- Use with caution; for a secure flow you may create profiles server-side using service_role key.

/*
CREATE FUNCTION public.create_profile_on_auth() RETURNS trigger AS $$
BEGIN
  INSERT INTO public.profiles (id, user_id, username, full_name, created_at)
  VALUES (NEW.id, NEW.id, split_part(NEW.email, '@', 1), NULL, now())
  ON CONFLICT (user_id) DO NOTHING;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER on_auth_user_created
AFTER INSERT ON auth.users
FOR EACH ROW EXECUTE FUNCTION public.create_profile_on_auth();
*/

-- End of file
