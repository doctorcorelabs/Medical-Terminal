-- ============================================================
-- supabase_admin_ops_phase1.sql
-- Admin Operations Phase 1 (banner, activity, health, exports)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Announcements (global banner)
CREATE TABLE IF NOT EXISTS public.admin_announcements (
  id         UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  level      TEXT NOT NULL DEFAULT 'info' CHECK (level IN ('info','warning','critical')),
  target     TEXT NOT NULL DEFAULT 'all' CHECK (target IN ('all','admin','non_admin')),
  active     BOOLEAN NOT NULL DEFAULT true,
  start_at   TIMESTAMPTZ,
  end_at     TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_announcements_active ON public.admin_announcements(active, start_at, end_at);
CREATE INDEX IF NOT EXISTS idx_admin_announcements_created_at ON public.admin_announcements(created_at DESC);

-- 2) User activity events
CREATE TABLE IF NOT EXISTS public.user_activity_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id     UUID NOT NULL REFERENCES auth.users(id),
  event_type  TEXT NOT NULL,
  feature_key TEXT,
  metadata    JSONB,
  occurred_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_user_activity_events_user_time ON public.user_activity_events(user_id, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_events_event_time ON public.user_activity_events(event_type, occurred_at DESC);
CREATE INDEX IF NOT EXISTS idx_user_activity_events_feature_time ON public.user_activity_events(feature_key, occurred_at DESC);

-- Runtime retention policy:
-- Data activity event disimpan maksimal 14 hari.
-- Pembersihan data dijalankan oleh scheduler Netlify function: cleanup-activity-events.

-- 3) System health metrics
CREATE TABLE IF NOT EXISTS public.system_health_metrics (
  id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source       TEXT NOT NULL,
  metric_name  TEXT NOT NULL,
  metric_value DOUBLE PRECISION NOT NULL,
  labels       JSONB,
  measured_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_system_health_metrics_time ON public.system_health_metrics(measured_at DESC);
CREATE INDEX IF NOT EXISTS idx_system_health_metrics_lookup ON public.system_health_metrics(source, metric_name, measured_at DESC);

-- 4) Alert events (basic store)
CREATE TABLE IF NOT EXISTS public.alert_events (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  level       TEXT NOT NULL CHECK (level IN ('info','warning','critical')),
  title       TEXT NOT NULL,
  message     TEXT NOT NULL,
  status      TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open','ack','resolved','snoozed')),
  source      TEXT,
  rule_key    TEXT,
  payload     JSONB,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  handled_by  UUID REFERENCES auth.users(id),
  handled_at  TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_alert_events_status_time ON public.alert_events(status, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_alert_events_level_time ON public.alert_events(level, created_at DESC);

-- 5) Admin export logs
CREATE TABLE IF NOT EXISTS public.admin_exports (
  id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  admin_id    UUID NOT NULL REFERENCES auth.users(id),
  export_type TEXT NOT NULL,
  filters     JSONB,
  row_count   INTEGER,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_admin_exports_admin_time ON public.admin_exports(admin_id, created_at DESC);

-- 6) Views for Top users and inactivity (30 days)
CREATE OR REPLACE VIEW public.v_top_users_30d 
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.username,
  p.full_name,
  COUNT(e.id)::BIGINT AS total_events_30d,
  MAX(e.occurred_at) AS last_activity_at
FROM public.profiles p
JOIN public.user_activity_events e ON e.user_id = p.user_id
WHERE e.occurred_at >= now() - interval '30 days'
GROUP BY p.user_id, p.username, p.full_name
ORDER BY total_events_30d DESC;

CREATE OR REPLACE VIEW public.v_inactive_users_30d 
WITH (security_invoker = true)
AS
SELECT
  p.user_id,
  p.username,
  p.full_name,
  MAX(e.occurred_at) AS last_activity_at
FROM public.profiles p
LEFT JOIN public.user_activity_events e ON e.user_id = p.user_id
GROUP BY p.user_id, p.username, p.full_name
HAVING MAX(e.occurred_at) IS NULL OR MAX(e.occurred_at) < now() - interval '30 days'
ORDER BY last_activity_at NULLS FIRST;

-- 7) Enable RLS
ALTER TABLE public.admin_announcements ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_activity_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.system_health_metrics ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.admin_exports ENABLE ROW LEVEL SECURITY;

-- Announcements policies
DROP POLICY IF EXISTS "announcements_authenticated_read" ON public.admin_announcements;
CREATE POLICY "announcements_authenticated_read"
  ON public.admin_announcements FOR SELECT
  TO authenticated
  USING (true);

DROP POLICY IF EXISTS "announcements_admin_write" ON public.admin_announcements;
CREATE POLICY "announcements_admin_write"
  ON public.admin_announcements FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- User activity policies
DROP POLICY IF EXISTS "activity_insert_own" ON public.user_activity_events;
CREATE POLICY "activity_insert_own"
  ON public.user_activity_events FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "activity_admin_read" ON public.user_activity_events;
CREATE POLICY "activity_admin_read"
  ON public.user_activity_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- Health metrics policies
DROP POLICY IF EXISTS "health_admin_read" ON public.system_health_metrics;
CREATE POLICY "health_admin_read"
  ON public.system_health_metrics FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "health_insert_authenticated" ON public.system_health_metrics;
CREATE POLICY "health_insert_authenticated"
  ON public.system_health_metrics FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() IS NOT NULL);

-- Alert policies
DROP POLICY IF EXISTS "alerts_admin_read" ON public.alert_events;
CREATE POLICY "alerts_admin_read"
  ON public.alert_events FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "alerts_admin_write" ON public.alert_events;
CREATE POLICY "alerts_admin_write"
  ON public.alert_events FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- Admin export policies
DROP POLICY IF EXISTS "admin_exports_insert_own" ON public.admin_exports;
CREATE POLICY "admin_exports_insert_own"
  ON public.admin_exports FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = admin_id);

DROP POLICY IF EXISTS "admin_exports_admin_read" ON public.admin_exports;
CREATE POLICY "admin_exports_admin_read"
  ON public.admin_exports FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- 8) Seed welcome announcement (optional)
INSERT INTO public.admin_announcements (title, message, level, target, active)
SELECT 'Informasi Sistem', 'Panel admin fase 1 telah aktif. Gunakan fitur ini untuk pemantauan operasional.', 'info', 'admin', false
WHERE NOT EXISTS (SELECT 1 FROM public.admin_announcements);

-- Operational note:
-- Retensi user_activity_events > 14 hari dihapus permanen oleh job harian
-- yang dikonfigurasi di netlify.toml (scheduled_functions.cleanup-activity-events).

-- 9) Broadcast metadata extensions (safe for existing deployments)
ALTER TABLE public.alert_events
  ADD COLUMN IF NOT EXISTS created_by UUID REFERENCES auth.users(id);

ALTER TABLE public.alert_events
  ADD COLUMN IF NOT EXISTS is_admin_broadcast BOOLEAN NOT NULL DEFAULT false;

ALTER TABLE public.alert_events
  ADD COLUMN IF NOT EXISTS audience_scope TEXT NOT NULL DEFAULT 'all';

ALTER TABLE public.alert_events
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE public.admin_announcements
  ADD COLUMN IF NOT EXISTS correlation_id TEXT;

ALTER TABLE public.admin_announcements
  ADD COLUMN IF NOT EXISTS source_type TEXT NOT NULL DEFAULT 'manual';

CREATE INDEX IF NOT EXISTS idx_alert_events_admin_broadcast_time
  ON public.alert_events(is_admin_broadcast, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_alert_events_correlation
  ON public.alert_events(correlation_id);

CREATE INDEX IF NOT EXISTS idx_admin_announcements_correlation
  ON public.admin_announcements(correlation_id);
