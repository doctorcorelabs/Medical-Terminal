import test from 'node:test';
import assert from 'node:assert/strict';

import {
    addPatient,
    addSchedule,
    getAllPatients,
    getAllSchedules,
    setDataStorageScope,
    setScheduleStorageScope,
    upsertSchedulesBulk,
} from '../services/dataService.js';
import { pendingSync } from '../services/offlineQueue.js';
import { getPendingStatusFromQueue } from '../context/offlineContextUtils.js';
import { parseImportedScheduleJson } from '../utils/scheduleImport.js';
import { schedulesDiffer } from '../utils/scheduleSync.js';

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
                return `int-uuid-${counter}`;
            };
        })(),
    },
    configurable: true,
});

function resetIntegrationState() {
    localStorage.clear();
    setDataStorageScope(null);
    setScheduleStorageScope(null);
}

test('integration: scoped import marks pending schedule sync without leaking user data', () => {
    resetIntegrationState();

    setDataStorageScope('user-1');
    setScheduleStorageScope('user-1');

    addPatient({ name: 'User One Patient' });
    addSchedule({ title: 'Local round', date: '2026-03-23', isAllDay: true });

    const imported = parseImportedScheduleJson(JSON.stringify({
        schedules: [
            {
                id: 'sched-1',
                title: 'Imported schedule',
                date: '2026-03-24',
                isAllDay: true,
                category: 'pasien',
                priority: 'sedang',
            },
        ],
    }));

    assert.strictEqual(imported.ok, true);
    upsertSchedulesBulk(imported.validItems);

    const user1Patients = getAllPatients();
    const user1Schedules = getAllSchedules();
    assert.strictEqual(user1Patients.length, 1);
    assert.strictEqual(user1Schedules.length, 2);

    const pendingAfterImport = getPendingStatusFromQueue(pendingSync);
    assert.strictEqual(pendingAfterImport.patients, true);
    assert.strictEqual(pendingAfterImport.schedules, true);
    assert.strictEqual(pendingAfterImport.stases, false);
    assert.strictEqual(pendingAfterImport.count, 2);
    assert.strictEqual(pendingAfterImport.any, true);

    pendingSync.clearSchedules();
    const pendingAfterClear = getPendingStatusFromQueue(pendingSync);
    assert.strictEqual(pendingAfterClear.schedules, false);
    assert.strictEqual(pendingAfterClear.patients, true);
    assert.strictEqual(pendingAfterClear.any, true);

    setDataStorageScope('user-2');
    setScheduleStorageScope('user-2');
    assert.strictEqual(getAllPatients().length, 0);
    assert.strictEqual(getAllSchedules().length, 0);
});

test('integration: scoped schedule upsert stays stable and isolated across user switches', () => {
    resetIntegrationState();

    setDataStorageScope('user-a');
    setScheduleStorageScope('user-a');

    upsertSchedulesBulk([
        {
            id: 'shared-id',
            title: 'Older title',
            date: '2026-03-25',
            isAllDay: true,
            updatedAt: '2026-03-25T08:00:00.000Z',
        },
    ]);

    upsertSchedulesBulk([
        {
            id: 'shared-id',
            title: 'Newest title',
            date: '2026-03-25',
            isAllDay: true,
            updatedAt: '2026-03-25T12:00:00.000Z',
        },
    ]);

    const userASchedules = getAllSchedules();
    assert.strictEqual(userASchedules.length, 1);
    assert.strictEqual(userASchedules[0].title, 'Newest title');

    setScheduleStorageScope('user-b');
    assert.strictEqual(getAllSchedules().length, 0);
    addSchedule({ title: 'User B item', date: '2026-03-26', isAllDay: true });
    assert.strictEqual(getAllSchedules().length, 1);

    setScheduleStorageScope('user-a');
    const userASchedulesAgain = getAllSchedules();
    assert.strictEqual(userASchedulesAgain.length, 1);
    assert.strictEqual(userASchedulesAgain[0].title, 'Newest title');
    assert.strictEqual(schedulesDiffer(userASchedules, userASchedulesAgain), false);
});
