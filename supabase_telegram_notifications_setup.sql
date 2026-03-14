-- ============================================================
-- supabase_telegram_notifications_setup.sql
-- Telegram Notification Queue (schedule reminders + system alerts)
-- Run this in Supabase SQL Editor
-- ============================================================

-- 1) User channel + preferences
CREATE TABLE IF NOT EXISTS public.notification_channels (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('telegram')),
  telegram_chat_id      TEXT,
  is_verified           BOOLEAN NOT NULL DEFAULT false,
  is_enabled            BOOLEAN NOT NULL DEFAULT true,
  schedule_enabled      BOOLEAN NOT NULL DEFAULT true,
  alert_enabled         BOOLEAN NOT NULL DEFAULT true,
  timezone              TEXT NOT NULL DEFAULT 'Asia/Jakarta',
  quiet_hours_start     TIME,
  quiet_hours_end       TIME,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (user_id, channel)
);

CREATE INDEX IF NOT EXISTS idx_notification_channels_user ON public.notification_channels(user_id);
CREATE INDEX IF NOT EXISTS idx_notification_channels_enabled ON public.notification_channels(channel, is_enabled, is_verified);

-- Optional chat id uniqueness for telegram routing
CREATE UNIQUE INDEX IF NOT EXISTS idx_notification_channels_telegram_chat_unique
  ON public.notification_channels(telegram_chat_id)
  WHERE telegram_chat_id IS NOT NULL AND channel = 'telegram';

-- 2) Queue for async dispatch
CREATE TABLE IF NOT EXISTS public.notification_dispatch_queue (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_type           TEXT NOT NULL CHECK (source_type IN ('alert', 'schedule')),
  source_id             TEXT NOT NULL,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('telegram')),
  idempotency_key       TEXT NOT NULL,
  payload               JSONB NOT NULL DEFAULT '{}'::jsonb,
  status                TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','processing','sent','failed','skipped_quiet_hours','skipped_opt_out','dead')),
  attempt_count         INTEGER NOT NULL DEFAULT 0,
  next_attempt_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
  locked_at             TIMESTAMPTZ,
  lock_owner            TEXT,
  provider_message_id   TEXT,
  last_error            TEXT,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at            TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (idempotency_key)
);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_queue_status_due
  ON public.notification_dispatch_queue(status, next_attempt_at, created_at);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_queue_source
  ON public.notification_dispatch_queue(source_type, source_id);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_queue_user
  ON public.notification_dispatch_queue(user_id, created_at DESC);

-- 3) Immutable dispatch logs
CREATE TABLE IF NOT EXISTS public.notification_dispatch_logs (
  id                    UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  queue_id              UUID REFERENCES public.notification_dispatch_queue(id) ON DELETE SET NULL,
  source_type           TEXT NOT NULL CHECK (source_type IN ('alert', 'schedule')),
  source_id             TEXT NOT NULL,
  user_id               UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  channel               TEXT NOT NULL CHECK (channel IN ('telegram')),
  status                TEXT NOT NULL CHECK (status IN ('sent','failed','skipped_quiet_hours','skipped_opt_out','dead')),
  attempt_number        INTEGER NOT NULL DEFAULT 1,
  provider_message_id   TEXT,
  provider_http_status  INTEGER,
  error_message         TEXT,
  payload               JSONB,
  created_at            TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_status_time
  ON public.notification_dispatch_logs(status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_user_time
  ON public.notification_dispatch_logs(user_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_notification_dispatch_logs_source
  ON public.notification_dispatch_logs(source_type, source_id);

-- 4) RLS policies
ALTER TABLE public.notification_channels ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatch_queue ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.notification_dispatch_logs ENABLE ROW LEVEL SECURITY;

-- Users manage only their own channel settings
DROP POLICY IF EXISTS "notification_channels_select_own" ON public.notification_channels;
CREATE POLICY "notification_channels_select_own"
  ON public.notification_channels FOR SELECT
  TO authenticated
  USING (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_channels_insert_own" ON public.notification_channels;
CREATE POLICY "notification_channels_insert_own"
  ON public.notification_channels FOR INSERT
  TO authenticated
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_channels_update_own" ON public.notification_channels;
CREATE POLICY "notification_channels_update_own"
  ON public.notification_channels FOR UPDATE
  TO authenticated
  USING (auth.uid() = user_id)
  WITH CHECK (auth.uid() = user_id);

DROP POLICY IF EXISTS "notification_channels_delete_own" ON public.notification_channels;
CREATE POLICY "notification_channels_delete_own"
  ON public.notification_channels FOR DELETE
  TO authenticated
  USING (auth.uid() = user_id);

-- Admin read for ops visibility
DROP POLICY IF EXISTS "notification_channels_admin_read" ON public.notification_channels;
CREATE POLICY "notification_channels_admin_read"
  ON public.notification_channels FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "notification_dispatch_queue_admin_read" ON public.notification_dispatch_queue;
CREATE POLICY "notification_dispatch_queue_admin_read"
  ON public.notification_dispatch_queue FOR SELECT
  TO authenticated
  USING (public.is_admin());

DROP POLICY IF EXISTS "notification_dispatch_logs_admin_read" ON public.notification_dispatch_logs;
CREATE POLICY "notification_dispatch_logs_admin_read"
  ON public.notification_dispatch_logs FOR SELECT
  TO authenticated
  USING (public.is_admin());

-- NOTE:
-- Queue writes are expected from server-side functions using service role key.
-- Service role bypasses RLS; therefore no INSERT/UPDATE policy is required for queue/log tables.
