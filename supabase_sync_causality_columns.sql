-- Add causality metadata columns for deterministic multi-device sync.
-- Safe to run multiple times.

ALTER TABLE IF EXISTS public.user_patients
    ADD COLUMN IF NOT EXISTS _device_id TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS _sequence BIGINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.user_stases
    ADD COLUMN IF NOT EXISTS _device_id TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS _sequence BIGINT NOT NULL DEFAULT 0;

ALTER TABLE IF EXISTS public.user_schedules
    ADD COLUMN IF NOT EXISTS _device_id TEXT NOT NULL DEFAULT 'legacy',
    ADD COLUMN IF NOT EXISTS _sequence BIGINT NOT NULL DEFAULT 0;

-- Backfill defensive update for pre-existing rows that may contain NULL.
UPDATE public.user_patients
SET _device_id = COALESCE(_device_id, 'legacy'),
    _sequence = COALESCE(_sequence, 0)
WHERE _device_id IS NULL OR _sequence IS NULL;

UPDATE public.user_stases
SET _device_id = COALESCE(_device_id, 'legacy'),
    _sequence = COALESCE(_sequence, 0)
WHERE _device_id IS NULL OR _sequence IS NULL;

UPDATE public.user_schedules
SET _device_id = COALESCE(_device_id, 'legacy'),
    _sequence = COALESCE(_sequence, 0)
WHERE _device_id IS NULL OR _sequence IS NULL;
