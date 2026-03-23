import test from 'node:test';
import assert from 'node:assert/strict';

import { pendingSync, setPendingSyncScope } from './offlineQueue.js';

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

function resetState() {
    localStorage.clear();
    setPendingSyncScope(null);
}

test('patients flag lifecycle: mark, has, clear', () => {
    resetState();

    assert.strictEqual(pendingSync.hasPatients(), false);
    pendingSync.markPatients();
    assert.strictEqual(pendingSync.hasPatients(), true);
    pendingSync.clearPatients();
    assert.strictEqual(pendingSync.hasPatients(), false);
});

test('stases flag lifecycle: mark, has, clear', () => {
    resetState();

    assert.strictEqual(pendingSync.hasStases(), false);
    pendingSync.markStases();
    assert.strictEqual(pendingSync.hasStases(), true);
    pendingSync.clearStases();
    assert.strictEqual(pendingSync.hasStases(), false);
});

test('schedules flag lifecycle: mark, has, clear', () => {
    resetState();

    assert.strictEqual(pendingSync.hasSchedules(), false);
    pendingSync.markSchedules();
    assert.strictEqual(pendingSync.hasSchedules(), true);
    pendingSync.clearSchedules();
    assert.strictEqual(pendingSync.hasSchedules(), false);
});

test('hasAny true when any one flag is set', () => {
    resetState();

    assert.strictEqual(pendingSync.hasAny(), false);
    pendingSync.markPatients();
    assert.strictEqual(pendingSync.hasAny(), true);
    pendingSync.clearPatients();

    pendingSync.markStases();
    assert.strictEqual(pendingSync.hasAny(), true);
    pendingSync.clearStases();

    pendingSync.markSchedules();
    assert.strictEqual(pendingSync.hasAny(), true);
    pendingSync.clearSchedules();

    assert.strictEqual(pendingSync.hasAny(), false);
});

test('scoping isolates pending flags by user', () => {
    resetState();

    setPendingSyncScope('user-a');
    pendingSync.markPatients();
    assert.strictEqual(pendingSync.hasPatients(), true);

    setPendingSyncScope('user-b');
    assert.strictEqual(pendingSync.hasPatients(), false);

    pendingSync.markStases();
    assert.strictEqual(pendingSync.hasStases(), true);

    setPendingSyncScope('user-a');
    assert.strictEqual(pendingSync.hasPatients(), true);
    assert.strictEqual(pendingSync.hasStases(), false);

    setPendingSyncScope('user-b');
    assert.strictEqual(pendingSync.hasPatients(), false);
    assert.strictEqual(pendingSync.hasStases(), true);
});

test('setPendingSyncScope migrates legacy flags to scoped flags', () => {
    resetState();

    localStorage.setItem('medterminal_pending_patients_sync', '1');
    localStorage.setItem('medterminal_pending_stases_sync', '1');

    setPendingSyncScope('user-1');

    assert.strictEqual(localStorage.getItem('medterminal_pending_patients_sync'), null);
    assert.strictEqual(localStorage.getItem('medterminal_pending_stases_sync'), null);
    assert.strictEqual(localStorage.getItem('medterminal_pending_patients_sync:user-1'), '1');
    assert.strictEqual(localStorage.getItem('medterminal_pending_stases_sync:user-1'), '1');
    assert.strictEqual(pendingSync.hasPatients(), true);
    assert.strictEqual(pendingSync.hasStases(), true);
});

test('migration does not overwrite existing scoped flags', () => {
    resetState();

    localStorage.setItem('medterminal_pending_patients_sync', '1');
    localStorage.setItem('medterminal_pending_patients_sync:user-1', '1');

    setPendingSyncScope('user-1');

    assert.strictEqual(localStorage.getItem('medterminal_pending_patients_sync'), null);
    assert.strictEqual(localStorage.getItem('medterminal_pending_patients_sync:user-1'), '1');
    assert.strictEqual(pendingSync.hasPatients(), true);
});

test('anonymous scope uses unscoped keys', () => {
    resetState();

    setPendingSyncScope(null);
    pendingSync.markSchedules();

    assert.strictEqual(localStorage.getItem('medterminal_pending_schedules_sync'), '1');
    assert.strictEqual(pendingSync.hasSchedules(), true);

    pendingSync.clearSchedules();
    assert.strictEqual(localStorage.getItem('medterminal_pending_schedules_sync'), null);
});
