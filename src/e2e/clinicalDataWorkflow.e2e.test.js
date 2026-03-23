import test from 'node:test';
import assert from 'node:assert/strict';

import {
    addPatient,
    addSchedule,
    addStase,
    bulkSavePatients,
    bulkSaveStases,
    deleteStase,
    getAllPatients,
    getAllSchedules,
    getAllStases,
    getPinnedStaseId,
    setDataStorageScope,
    setPinnedStaseId,
    setScheduleStorageScope,
    upsertSchedulesBulk,
} from '../services/dataService.js';
import { pendingSync } from '../services/offlineQueue.js';
import { parseImportedScheduleJson } from '../utils/scheduleImport.js';
import { buildBackupPayload, parseBackupPayload, validateBackupPayload } from '../utils/backupFormat.js';
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
                return `e2e-uuid-${counter}`;
            };
        })(),
    },
    configurable: true,
});

function resetE2EState() {
    localStorage.clear();
    setDataStorageScope(null);
    setScheduleStorageScope(null);
    pendingSync.clearPatients();
    pendingSync.clearStases();
    pendingSync.clearSchedules();
}

test('e2e: clinician data lifecycle supports backup, destructive change, and restore', () => {
    resetE2EState();

    setDataStorageScope('doctor-1');
    setScheduleStorageScope('doctor-1');

    const stase = addStase({ name: 'ICU', color: '#AA1122' });
    setPinnedStaseId(stase.id);

    addPatient({
        name: 'Patient Alpha',
        age: 32,
        stase_id: stase.id,
        bloodType: 'A',
        rhesus: '+',
    });

    addSchedule({
        title: 'Morning bedside round',
        date: '2026-03-23',
        isAllDay: true,
        category: 'pasien',
    });

    const imported = parseImportedScheduleJson(JSON.stringify({
        schedules: [
            {
                id: 'sched-import-1',
                title: 'Imported follow-up',
                date: '2026-03-24',
                isAllDay: true,
                category: 'pasien',
                priority: 'sedang',
            },
            {
                id: 'sched-import-1',
                title: 'Imported follow-up revised',
                date: '2026-03-24',
                isAllDay: true,
                category: 'pasien',
                priority: 'tinggi',
            },
            {
                title: '',
                date: '2026-03-25',
            },
        ],
    }));

    assert.strictEqual(imported.ok, true);
    assert.strictEqual(imported.validItems.length, 1);
    assert.strictEqual(imported.invalidItems.length, 1);
    upsertSchedulesBulk(imported.validItems);

    const beforeBackup = {
        patients: getAllPatients(),
        stases: getAllStases(),
        schedules: getAllSchedules(),
    };

    assert.strictEqual(beforeBackup.patients.length, 1);
    assert.strictEqual(beforeBackup.stases.length, 1);
    assert.strictEqual(beforeBackup.schedules.length, 2);
    assert.strictEqual(getPinnedStaseId(), stase.id);

    const backupPayload = buildBackupPayload({
        ...beforeBackup,
        userId: 'doctor-1',
    });
    const parsedBackup = parseBackupPayload(backupPayload);
    const validatedBackup = validateBackupPayload(parsedBackup);

    assert.strictEqual(validatedBackup.totalInvalid, 0);
    assert.strictEqual(validatedBackup.patients.length, 1);
    assert.strictEqual(validatedBackup.stases.length, 1);
    assert.strictEqual(validatedBackup.schedules.length, 2);

    deleteStase(stase.id);
    assert.strictEqual(getAllStases().length, 0);
    assert.strictEqual(getAllPatients().length, 0);
    assert.strictEqual(getPinnedStaseId(), null);

    bulkSaveStases(validatedBackup.stases);
    bulkSavePatients(validatedBackup.patients);
    upsertSchedulesBulk(validatedBackup.schedules);

    const afterRestore = {
        patients: getAllPatients(),
        stases: getAllStases(),
        schedules: getAllSchedules(),
    };

    assert.strictEqual(afterRestore.patients.length, 1);
    assert.strictEqual(afterRestore.stases.length, 1);
    assert.strictEqual(afterRestore.schedules.length, 2);
    assert.strictEqual(schedulesDiffer(beforeBackup.schedules, afterRestore.schedules), false);
});

test('e2e: user-scoped backups remain isolated across account switches', () => {
    resetE2EState();

    setDataStorageScope('doctor-a');
    setScheduleStorageScope('doctor-a');

    addStase({ name: 'Neuro', color: '#2233AA' });
    addPatient({ name: 'Patient A', age: 41 });
    addSchedule({ title: 'A schedule', date: '2026-03-26', isAllDay: true });

    const payloadA = buildBackupPayload({
        patients: getAllPatients(),
        stases: getAllStases(),
        schedules: getAllSchedules(),
        userId: 'doctor-a',
    });
    const validatedA = validateBackupPayload(parseBackupPayload(payloadA));

    setDataStorageScope('doctor-b');
    setScheduleStorageScope('doctor-b');

    addStase({ name: 'Cardio', color: '#11AA55' });
    addPatient({ name: 'Patient B', age: 58 });
    addSchedule({ title: 'B schedule', date: '2026-03-27', isAllDay: true });

    const payloadB = buildBackupPayload({
        patients: getAllPatients(),
        stases: getAllStases(),
        schedules: getAllSchedules(),
        userId: 'doctor-b',
    });
    const validatedB = validateBackupPayload(parseBackupPayload(payloadB));

    assert.strictEqual(validatedA.patients.length, 1);
    assert.strictEqual(validatedB.patients.length, 1);
    assert.notStrictEqual(validatedA.patients[0].name, validatedB.patients[0].name);

    setDataStorageScope('doctor-a');
    setScheduleStorageScope('doctor-a');

    const currentA = {
        patients: getAllPatients(),
        stases: getAllStases(),
        schedules: getAllSchedules(),
    };

    assert.strictEqual(currentA.patients.length, 1);
    assert.strictEqual(currentA.stases.length, 1);
    assert.strictEqual(currentA.schedules.length, 1);
    assert.strictEqual(currentA.patients[0].name, 'Patient A');
    assert.strictEqual(schedulesDiffer(currentA.schedules, validatedA.schedules), false);
});
