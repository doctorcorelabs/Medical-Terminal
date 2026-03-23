import test from 'node:test';
import assert from 'node:assert/strict';

import {
  WIB_TIMEZONE,
  localDateTimeToUtcWib,
  buildScheduleIdempotencyKey,
  computeStaleScheduleQueueIds,
  computeEventVersionStaleIds,
} from '../../netlify/functions/_schedule-reminder-utils.mjs';

test('WIB timezone constant is fixed to Asia/Jakarta', () => {
  assert.equal(WIB_TIMEZONE, 'Asia/Jakarta');
});

test('localDateTimeToUtcWib converts WIB local time to correct UTC time', () => {
  const utcDate = localDateTimeToUtcWib('2026-03-15', '09:00');
  assert.ok(utcDate instanceof Date);
  assert.equal(utcDate.toISOString(), '2026-03-15T02:00:00.000Z');
});

test('localDateTimeToUtcWib returns null for invalid time format', () => {
  assert.equal(localDateTimeToUtcWib('2026-03-15', '25:00'), null);
  assert.equal(localDateTimeToUtcWib('2026-03-15', 'ab:cd'), null);
});

test('buildScheduleIdempotencyKey keeps stable key structure', () => {
  const key = buildScheduleIdempotencyKey('u-1', 'ev-1', '2026-03-15', '08:30', 30);
  assert.equal(key, 'schedule:u-1:ev-1:2026-03-15:08:30:30');
});

test('queue invalidation removes stale auto-schedule rows but keeps active rows and manual-test rows', () => {
  const existingRows = [
    { id: 'q1', idempotency_key: 'schedule:user-1:event-a:2026-03-15:08:30:30' },
    { id: 'q2', idempotency_key: 'schedule:user-1:event-b:2026-03-15:09:00:30' },
    { id: 'q3', idempotency_key: 'manual-test:user-1:abc123' },
  ];

  const activeKeys = new Set([
    'schedule:user-1:event-b:2026-03-15:09:00:30',
  ]);

  const staleIds = computeStaleScheduleQueueIds(existingRows, activeKeys);
  assert.deepEqual(staleIds, ['q1']);
});

test('integration mock: schedule update changes time and stale old queue row is invalidated', () => {
  const oldKey = buildScheduleIdempotencyKey('user-7', 'event-99', '2026-03-20', '10:00', 30);
  const newKey = buildScheduleIdempotencyKey('user-7', 'event-99', '2026-03-20', '11:00', 30);

  const existingRows = [
    { id: 'old-row', idempotency_key: oldKey },
  ];

  const activeKeys = new Set([newKey]);
  const staleIds = computeStaleScheduleQueueIds(existingRows, activeKeys);

  assert.deepEqual(staleIds, ['old-row']);
});

test('computeEventVersionStaleIds keeps newest row per event and ignores manual-test keys', () => {
  const rows = [
    {
      id: 'old-a',
      source_id: 'event-a',
      idempotency_key: 'schedule:user-1:event-a:2026-03-20:10:00:10',
      created_at: '2026-03-23T11:00:00.000Z',
      updated_at: '2026-03-23T11:00:00.000Z',
    },
    {
      id: 'new-a',
      source_id: 'event-a',
      idempotency_key: 'schedule:user-1:event-a:2026-03-20:10:01:10',
      created_at: '2026-03-23T11:01:00.000Z',
      updated_at: '2026-03-23T11:01:00.000Z',
    },
    {
      id: 'manual-1',
      source_id: 'event-a',
      idempotency_key: 'manual-test:user-1:abc',
      created_at: '2026-03-23T11:02:00.000Z',
      updated_at: '2026-03-23T11:02:00.000Z',
    },
    {
      id: 'only-b',
      source_id: 'event-b',
      idempotency_key: 'schedule:user-1:event-b:2026-03-20:12:00:10',
      created_at: '2026-03-23T11:03:00.000Z',
      updated_at: '2026-03-23T11:03:00.000Z',
    },
  ];

  const staleIds = computeEventVersionStaleIds(rows);
  assert.deepEqual(staleIds, ['old-a']);
});
