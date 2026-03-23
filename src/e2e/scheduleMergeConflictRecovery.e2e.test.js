import test from 'node:test';
import assert from 'node:assert/strict';

import {
    fetchSchedulesFromSupabase,
    getAllSchedules,
    setScheduleStorageScope,
    syncSchedulesToSupabase,
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
                return `e2e-merge-uuid-${counter}`;
            };
        })(),
    },
    configurable: true,
});

function resetMergeE2EState() {
    localStorage.clear();
    setScheduleStorageScope(null);
    pendingSync.clearPatients();
    pendingSync.clearStases();
    pendingSync.clearSchedules();
}

function installScheduleSupabaseMock(initialRowsByUser = {}) {
    const rowsByUser = new Map(Object.entries(initialRowsByUser));
    const upsertCalls = [];
    const originalFrom = supabase.from;

    supabase.from = (table) => {
        if (table !== 'user_schedules') {
            return {
                select: () => ({
                    eq: () => ({
                        limit: () => ({
                            maybeSingle: async () => ({ data: null, error: null }),
                        }),
                    }),
                }),
                upsert: async () => ({ data: null, error: null }),
            };
        }

        let scopedUserId = null;
        const chain = {
            select: () => chain,
            eq: (column, value) => {
                if (column === 'user_id') scopedUserId = value;
                return chain;
            },
            limit: () => chain,
            maybeSingle: async () => ({
                data: rowsByUser.get(scopedUserId) || null,
                error: null,
            }),
            upsert: async (payload) => {
                rowsByUser.set(payload.user_id, {
                    schedules_data: Array.isArray(payload.schedules_data) ? payload.schedules_data : [],
                    updated_at: payload.updated_at,
                });
                upsertCalls.push(payload);
                return { data: null, error: null };
            },
        };

        return chain;
    };

    return {
        restore: () => {
            supabase.from = originalFrom;
        },
        getRowsByUser: () => rowsByUser,
        getUpsertCalls: () => upsertCalls,
    };
}

test('e2e: fetch merge applies server precedence and clears pending after explicit sync', async () => {
    resetMergeE2EState();

    const mock = installScheduleSupabaseMock({
        'merge-user-1': {
            schedules_data: [
                {
                    id: 'sch-1',
                    title: 'Server authoritative title',
                    date: '2026-03-31',
                    isAllDay: true,
                    updatedAt: '2026-03-31T12:00:00.000Z',
                },
            ],
            updated_at: '2026-03-31T10:00:00.000Z',
        },
    });

    try {
        setScheduleStorageScope('merge-user-1');

        upsertSchedulesBulk([
            {
                id: 'sch-1',
                title: 'Local stale title',
                date: '2026-03-31',
                isAllDay: true,
                updatedAt: '2026-03-31T09:00:00.000Z',
            },
            {
                id: 'sch-deleted-on-server',
                title: 'Should be dropped by deletion sync',
                date: '2026-03-30',
                isAllDay: true,
                updatedAt: '2026-03-31T08:00:00.000Z',
            },
        ]);

        const dirtyStatus = getPendingStatusFromQueue(pendingSync);
        assert.strictEqual(dirtyStatus.schedules, true);

        const merged = await fetchSchedulesFromSupabase('merge-user-1');
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].id, 'sch-1');
        assert.strictEqual(merged[0].title, 'Server authoritative title');

        const localAfterFetch = getAllSchedules();
        assert.strictEqual(localAfterFetch.length, 1);
        assert.strictEqual(localAfterFetch[0].id, 'sch-1');

        const statusAfterFetch = getPendingStatusFromQueue(pendingSync);
        assert.strictEqual(statusAfterFetch.schedules, true);

        await syncSchedulesToSupabase('merge-user-1');
        const statusAfterSync = getPendingStatusFromQueue(pendingSync);
        assert.strictEqual(statusAfterSync.schedules, false);

        assert.ok(mock.getUpsertCalls().length >= 1);
        const serverRow = mock.getRowsByUser().get('merge-user-1');
        assert.strictEqual(Array.isArray(serverRow?.schedules_data), true);
        assert.strictEqual(serverRow.schedules_data.length, 1);
    } finally {
        mock.restore();
    }
});

test('e2e: fetch merge keeps local item when local update is newer than server timestamp', async () => {
    resetMergeE2EState();

    const mock = installScheduleSupabaseMock({
        'merge-user-2': {
            schedules_data: [],
            updated_at: '2026-03-31T10:00:00.000Z',
        },
    });

    try {
        setScheduleStorageScope('merge-user-2');

        upsertSchedulesBulk([
            {
                id: 'sch-local-newer',
                title: 'Local must survive',
                date: '2026-04-01',
                isAllDay: true,
                updatedAt: '2026-03-31T12:00:00.000Z',
            },
        ]);

        const merged = await fetchSchedulesFromSupabase('merge-user-2');
        assert.strictEqual(merged.length, 1);
        assert.strictEqual(merged[0].id, 'sch-local-newer');
        assert.strictEqual(merged[0].title, 'Local must survive');

        await syncSchedulesToSupabase('merge-user-2');
        const statusAfterSync = getPendingStatusFromQueue(pendingSync);
        assert.strictEqual(statusAfterSync.schedules, false);

        const serverRow = mock.getRowsByUser().get('merge-user-2');
        assert.strictEqual(serverRow.schedules_data.length, 1);
        assert.strictEqual(serverRow.schedules_data[0].id, 'sch-local-newer');
    } finally {
        mock.restore();
    }
});
