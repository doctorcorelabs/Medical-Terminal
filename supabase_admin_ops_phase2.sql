-- ============================================================
-- supabase_admin_ops_phase2.sql
-- Admin Operations Phase 2 (alert rules, funnel readiness)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) Alert rules table
CREATE TABLE IF NOT EXISTS public.alert_rules (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rule_key       TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  level          TEXT NOT NULL DEFAULT 'warning' CHECK (level IN ('info','warning','critical')),
  condition_type TEXT NOT NULL,
  threshold      DOUBLE PRECISION NOT NULL,
  window_minutes INTEGER NOT NULL DEFAULT 5,
  breach_confirmations INTEGER NOT NULL DEFAULT 2,
  resolve_confirmations INTEGER NOT NULL DEFAULT 2,
  cooldown_minutes INTEGER NOT NULL DEFAULT 10,
  dedup_window_minutes INTEGER NOT NULL DEFAULT 30,
  active         BOOLEAN NOT NULL DEFAULT true,
  created_by     UUID REFERENCES auth.users(id),
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Forward-compatible ALTERs for projects that already created alert_rules
ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS breach_confirmations INTEGER NOT NULL DEFAULT 2;
ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS resolve_confirmations INTEGER NOT NULL DEFAULT 2;
ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS cooldown_minutes INTEGER NOT NULL DEFAULT 10;
ALTER TABLE public.alert_rules ADD COLUMN IF NOT EXISTS dedup_window_minutes INTEGER NOT NULL DEFAULT 30;

CREATE INDEX IF NOT EXISTS idx_alert_rules_active ON public.alert_rules(active);

-- 1b) Rule state table for anti-flapping and cooldown management
CREATE TABLE IF NOT EXISTS public.alert_rule_states (
  rule_key            TEXT PRIMARY KEY,
  last_status         TEXT NOT NULL DEFAULT 'normal' CHECK (last_status IN ('normal','breached','open','cooldown')),
  consecutive_breach  INTEGER NOT NULL DEFAULT 0,
  consecutive_normal  INTEGER NOT NULL DEFAULT 0,
  last_value          DOUBLE PRECISION,
  last_evaluated_at   TIMESTAMPTZ,
  cooldown_until      TIMESTAMPTZ
);

-- 2) Optional event normalization for funnel
--    event_type convention:
--    - tools_page_view
--    - tool_opened
--    - tool_action_started
--    - tool_action_completed

-- 3) RLS for alert rules
ALTER TABLE public.alert_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.alert_rule_states ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "alert_rules_admin_read" ON public.alert_rules;
CREATE POLICY "alert_rules_admin_read"
  ON public.alert_rules FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "alert_rules_admin_write" ON public.alert_rules;
CREATE POLICY "alert_rules_admin_write"
  ON public.alert_rules FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

DROP POLICY IF EXISTS "alert_rule_states_admin_read" ON public.alert_rule_states;
CREATE POLICY "alert_rule_states_admin_read"
  ON public.alert_rule_states FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "alert_rule_states_admin_write" ON public.alert_rule_states;
CREATE POLICY "alert_rule_states_admin_write"
  ON public.alert_rule_states FOR ALL
  TO authenticated
  USING (public.is_admin())
  WITH CHECK (public.is_admin());

-- 4) Seed baseline rules
INSERT INTO public.alert_rules (rule_key, title, level, condition_type, threshold, window_minutes, breach_confirmations, resolve_confirmations, cooldown_minutes, dedup_window_minutes, active)
VALUES
  ('high_error_rate_5m', 'Lonjakan Error Rate', 'critical', 'error_rate_pct', 5, 5, 2, 2, 10, 30, true),
  ('high_latency_10m', 'Latency Tinggi', 'warning', 'latency_p95_ms', 1200, 10, 2, 2, 10, 30, true),
  ('sync_fail_spike_15m', 'Lonjakan Gagal Sinkronisasi', 'warning', 'sync_fail_count', 20, 15, 1, 2, 10, 30, true),
  ('traffic_spike_10m', 'Traffic Abnormal', 'warning', 'usage_event_count', 500, 10, 2, 2, 15, 60, false)
ON CONFLICT (rule_key) DO NOTHING;

-- 5) Simple verification
SELECT rule_key, title, level, threshold, window_minutes, breach_confirmations, resolve_confirmations, cooldown_minutes, dedup_window_minutes, active
FROM public.alert_rules
ORDER BY created_at DESC;
