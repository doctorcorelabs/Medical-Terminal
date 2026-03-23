import test from 'node:test';
import assert from 'node:assert/strict';

import { canAddPatients, canEditPatients, resolveSelectedPatient } from './patientContextUtils.js';

test('resolveSelectedPatient returns null for invalid inputs', () => {
    assert.strictEqual(resolveSelectedPatient(null, 'p1'), null);
    assert.strictEqual(resolveSelectedPatient([], 'p1'), null);
    assert.strictEqual(resolveSelectedPatient([{ id: 'p1' }], null), null);
});

test('resolveSelectedPatient returns matched patient by id', () => {
    const patients = [
        { id: 'p1', name: 'A' },
        { id: 'p2', name: 'B' },
    ];
    assert.deepStrictEqual(resolveSelectedPatient(patients, 'p2'), { id: 'p2', name: 'B' });
});

test('canAddPatients allows admin and specialist without count limits', () => {
    assert.strictEqual(
        canAddPatients({ isAdmin: true, isSpecialist: false, isIntern: false, isExpiredSpecialist: false, patientCount: 99, count: 10 }),
        true
    );
    assert.strictEqual(
        canAddPatients({ isAdmin: false, isSpecialist: true, isIntern: false, isExpiredSpecialist: false, patientCount: 99, count: 10 }),
        true
    );
});

test('canAddPatients enforces intern limit at two patients', () => {
    assert.strictEqual(
        canAddPatients({ isAdmin: false, isSpecialist: false, isIntern: true, isExpiredSpecialist: false, patientCount: 1, count: 1 }),
        true
    );
    assert.strictEqual(
        canAddPatients({ isAdmin: false, isSpecialist: false, isIntern: true, isExpiredSpecialist: false, patientCount: 2, count: 1 }),
        false
    );
});

test('canAddPatients denies expired specialist and non-intern fallback', () => {
    assert.strictEqual(
        canAddPatients({ isAdmin: false, isSpecialist: false, isIntern: true, isExpiredSpecialist: true, patientCount: 0, count: 1 }),
        false
    );
    assert.strictEqual(
        canAddPatients({ isAdmin: false, isSpecialist: false, isIntern: false, isExpiredSpecialist: false, patientCount: 0, count: 1 }),
        false
    );
});

test('canEditPatients blocks only expired specialist sessions', () => {
    assert.strictEqual(canEditPatients(true), false);
    assert.strictEqual(canEditPatients(false), true);
});
