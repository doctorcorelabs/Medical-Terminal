import test from 'node:test';
import assert from 'node:assert/strict';

import { buildPendingStatus, getPendingStatusFromQueue } from './offlineContextUtils.js';

test('buildPendingStatus reports zero count when all flags are false', () => {
    assert.deepStrictEqual(buildPendingStatus(false, false, false), {
        patients: false,
        stases: false,
        schedules: false,
        count: 0,
        any: false,
    });
});

test('buildPendingStatus coerces truthy and computes count/any correctly', () => {
    assert.deepStrictEqual(buildPendingStatus(1, 'yes', null), {
        patients: true,
        stases: true,
        schedules: false,
        count: 2,
        any: true,
    });
});

test('buildPendingStatus handles all pending flags', () => {
    assert.deepStrictEqual(buildPendingStatus(true, true, true), {
        patients: true,
        stases: true,
        schedules: true,
        count: 3,
        any: true,
    });
});

test('getPendingStatusFromQueue reads pendingSync flags', () => {
    const pendingSyncMock = {
        hasPatients: () => true,
        hasStases: () => false,
        hasSchedules: () => true,
    };

    assert.deepStrictEqual(getPendingStatusFromQueue(pendingSyncMock), {
        patients: true,
        stases: false,
        schedules: true,
        count: 2,
        any: true,
    });
});
