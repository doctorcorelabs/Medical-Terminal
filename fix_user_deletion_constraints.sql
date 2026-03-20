-- ==========================================
-- FIX USER DELETION CONSTRAINTS
-- Run this in Supabase SQL Editor
-- ==========================================

DO $$ 
DECLARE 
    r RECORD;
BEGIN
    -- 1. admin_announcements (created_by -> SET NULL)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'admin_announcements' AND column_name = 'created_by' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.admin_announcements DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.admin_announcements ADD CONSTRAINT admin_announcements_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 2. user_activity_events (user_id -> CASCADE)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'user_activity_events' AND column_name = 'user_id' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.user_activity_events DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.user_activity_events ADD CONSTRAINT user_activity_events_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- 3. alert_events (handled_by -> SET NULL)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'alert_events' AND column_name = 'handled_by' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.alert_events DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.alert_events ADD CONSTRAINT alert_events_handled_by_fkey FOREIGN KEY (handled_by) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 4. alert_events (created_by -> SET NULL)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'alert_events' AND column_name = 'created_by' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.alert_events DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.alert_events ADD CONSTRAINT alert_events_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 5. admin_exports (admin_id -> CASCADE)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'admin_exports' AND column_name = 'admin_id' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.admin_exports DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.admin_exports ADD CONSTRAINT admin_exports_admin_id_fkey FOREIGN KEY (admin_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- 6. alert_rules (created_by -> SET NULL)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'alert_rules' AND column_name = 'created_by' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.alert_rules DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.alert_rules ADD CONSTRAINT alert_rules_created_by_fkey FOREIGN KEY (created_by) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 7. feature_flags (updated_by -> SET NULL)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'feature_flags' AND column_name = 'updated_by' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.feature_flags DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.feature_flags ADD CONSTRAINT feature_flags_updated_by_fkey FOREIGN KEY (updated_by) REFERENCES auth.users(id) ON DELETE SET NULL;

    -- 8. usage_logs (user_id -> CASCADE)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'usage_logs' AND column_name = 'user_id' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.usage_logs DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.usage_logs ADD CONSTRAINT usage_logs_user_id_fkey FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE;

    -- 9. profiles (active_subscription_id -> SET NULL)
    FOR r IN (SELECT constraint_name FROM information_schema.key_column_usage WHERE table_name = 'profiles' AND column_name = 'active_subscription_id' AND table_schema = 'public') LOOP
        EXECUTE 'ALTER TABLE public.profiles DROP CONSTRAINT ' || r.constraint_name;
    END LOOP;
    ALTER TABLE public.profiles ADD CONSTRAINT profiles_active_subscription_id_fkey FOREIGN KEY (active_subscription_id) REFERENCES public.user_subscriptions(id) ON DELETE SET NULL;

END $$;
