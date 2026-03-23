import test from 'node:test';
import assert from 'node:assert/strict';

import {
    addPatient,
    bulkSaveStases,
    getAllPatients,
    getAllSchedules,
    getAllStases,
    setDataStorageScope,
    setScheduleStorageScope,
    syncSchedulesToSupabase,
    syncStasesToSupabase,
    syncToSupabase,
    upsertSchedulesBulk,
} from '../services/dataService.js';
import { pendingSync } from '../services/offlineQueue.js';
import { getPendingStatusFromQueue } from '../context/offlineContextUtils.js';
import { supabase } from '../services/supabaseClient.js';

const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => (Object.prototype.hasOwnProperty.call(store, key) ? store[key] : null),
        setItem: (key, value) => {
            store[key] = String(value);
        },
        removeItem: (key) => {
            delete store[key];
        },
        clear: () => {
            store = {};
        },
    };
})();

Object.defineProperty(globalThis, 'localStorage', {
    value: localStorageMock,
    configurable: true,
});

Object.defineProperty(globalThis, 'crypto', {
    value: {
        randomUUID: (() => {
            let counter = 0;
            return () => {
                counter += 1;
                return `e2e-sync-uuid-${counter}`;
            };
        })(),
    },
    configurable: true,
});

function resetSyncE2EState() {
    localStorage.clear();
    setDataStorageScope(null);
    setScheduleStorageScope(null);
    pendingSync.clearPatients();
    pendingSync.clearStases();
    pendingSync.clearSchedules();
}

function installSupabaseSyncMock() {
    const originalFrom = supabase.from;
    supabase.from = () => {
        const chain = {
            select: () => chain,
            eq: () => chain,
            limit: () => chain,
            maybeSingle: async () => ({ data: null, error: null }),
            upsert: async () => ({ data: null, error: null }),
        };
        return chain;
    };
    return () => {
        supabase.from = originalFrom;
    };
}

test('e2e: pending flags transition from dirty to clean after sync cycle', async () => {
    resetSyncE2EState();
    const restoreSupabase = installSupabaseSyncMock();

    try {

    setDataStorageScope('sync-user-1');
    setScheduleStorageScope('sync-user-1');

    addPatient({ name: 'Sync Patient', age: 29 });
    bulkSaveStases([{ id: 'st-sync-1', name: 'ICU', color: '#AA1133' }]);
    upsertSchedulesBulk([
        {
            id: 'sc-sync-1',
            title: 'Sync schedule',
            date: '2026-03-29',
            isAllDay: true,
            category: 'pasien',
        },
    ]);

    const dirtyStatus = getPendingStatusFromQueue(pendingSync);
    assert.deepStrictEqual(dirtyStatus, {
        patients: true,
        stases: true,
        schedules: true,
        count: 3,
        any: true,
    });

    await syncToSupabase('sync-user-1');
    await syncStasesToSupabase('sync-user-1');
    await syncSchedulesToSupabase('sync-user-1');

    setDataStorageScope('sync-user-1');
    setScheduleStorageScope('sync-user-1');

    const cleanStatus = getPendingStatusFromQueue(pendingSync);
    assert.deepStrictEqual(cleanStatus, {
        patients: false,
        stases: false,
        schedules: false,
        count: 0,
        any: false,
    });

    assert.strictEqual(getAllPatients().length, 1);
    assert.strictEqual(getAllStases().length, 1);
        assert.strictEqual(getAllSchedules().length, 1);
    } finally {
        restoreSupabase();
    }
});

test('e2e: sync for one user does not clear pending flags for another user', async () => {
    resetSyncE2EState();
    const restoreSupabase = installSupabaseSyncMock();

    try {

    setDataStorageScope('sync-user-a');
    setScheduleStorageScope('sync-user-a');
    addPatient({ name: 'User A Patient' });
    bulkSaveStases([{ id: 'st-a-1', name: 'A Unit', color: '#2244AA' }]);
    upsertSchedulesBulk([{ id: 'sc-a-1', title: 'A schedule', date: '2026-03-30', isAllDay: true }]);

    const statusAStart = getPendingStatusFromQueue(pendingSync);
    assert.strictEqual(statusAStart.count, 3);

    setDataStorageScope('sync-user-b');
    setScheduleStorageScope('sync-user-b');
    addPatient({ name: 'User B Patient' });

    const statusBDirty = getPendingStatusFromQueue(pendingSync);
    assert.deepStrictEqual(statusBDirty, {
        patients: true,
        stases: false,
        schedules: false,
        count: 1,
        any: true,
    });

    await syncToSupabase('sync-user-a');
    await syncStasesToSupabase('sync-user-a');
    await syncSchedulesToSupabase('sync-user-a');

    setDataStorageScope('sync-user-a');
    setScheduleStorageScope('sync-user-a');
    const statusAAfterSync = getPendingStatusFromQueue(pendingSync);
    assert.deepStrictEqual(statusAAfterSync, {
        patients: false,
        stases: false,
        schedules: false,
        count: 0,
        any: false,
    });

    setDataStorageScope('sync-user-b');
    setScheduleStorageScope('sync-user-b');
    const statusBAfterASync = getPendingStatusFromQueue(pendingSync);
        assert.deepStrictEqual(statusBAfterASync, {
            patients: true,
            stases: false,
            schedules: false,
            count: 1,
            any: true,
        });
    } finally {
        restoreSupabase();
    }
});
