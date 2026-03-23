import test from 'node:test';
import assert from 'node:assert/strict';

import {
    canSyncSchedules,
    getScheduleContextResetState,
    getScheduleMutationReason,
    getScheduleScopeUserId,
} from './scheduleContextUtils.js';

test('getScheduleScopeUserId resolves nullable user id', () => {
    assert.strictEqual(getScheduleScopeUserId({ id: 'u1' }), 'u1');
    assert.strictEqual(getScheduleScopeUserId({}), null);
    assert.strictEqual(getScheduleScopeUserId(null), null);
});

test('canSyncSchedules requires a valid user id', () => {
    assert.strictEqual(canSyncSchedules({ id: 'u1' }), true);
    assert.strictEqual(canSyncSchedules({ id: '' }), false);
    assert.strictEqual(canSyncSchedules(undefined), false);
});

test('getScheduleMutationReason maps known actions and fallback', () => {
    assert.strictEqual(getScheduleMutationReason('add'), 'schedule_add');
    assert.strictEqual(getScheduleMutationReason('update'), 'schedule_update');
    assert.strictEqual(getScheduleMutationReason('delete'), 'schedule_delete');
    assert.strictEqual(getScheduleMutationReason('import'), 'schedule_import');
    assert.strictEqual(getScheduleMutationReason('other'), 'schedule_unknown');
});

test('getScheduleContextResetState returns an empty schedules array', () => {
    assert.deepStrictEqual(getScheduleContextResetState(), []);
});
