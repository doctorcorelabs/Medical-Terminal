import test from 'node:test';
import assert from 'node:assert/strict';
import {
    setDataStorageScope,
    getAllPatients,
    addPatient,
    updatePatient,
    deletePatient,
    getPatientById,
    bulkSavePatients,
    getAllStases,
    addStase,
    updateStase,
    deleteStase,
    getPinnedStaseId,
    setPinnedStaseId,
    reorderStase,
    addSymptom,
    updateSymptom,
    removeSymptom,
    addDailyReport,
    updateDailyReport,
    removeDailyReport,
    addPhysicalExam,
    updatePhysicalExam,
    removePhysicalExam,
    addSupportingExam,
    updateSupportingExam,
    removeSupportingExam,
    addPrescription,
    updatePrescription,
    removePrescription,
    addVitalSign,
    updateVitalSign,
    removeVitalSign,
} from './dataService.js';

// Mock localStorage
const localStorageMock = (() => {
    let store = {};
    return {
        getItem: (key) => store[key] || null,
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

Object.defineProperty(global, 'localStorage', {
    value: localStorageMock,
});

// Mock crypto.randomUUID for consistent IDs in tests
const mockUUIDs = (() => {
    let counter = 0;
    return {
        reset: () => {
            counter = 0;
        },
        next: () => {
            counter++;
            return `uuid-${counter}`;
        },
    };
})();

Object.defineProperty(global, 'crypto', {
    value: {
        randomUUID: () => mockUUIDs.next(),
    },
});

// Helper to clear state between tests
function resetState() {
    localStorage.clear();
    mockUUIDs.reset();
    setDataStorageScope(null);
}

// ============================================================================
// PATIENT CRUD TESTS
// ============================================================================

test('setDataStorageScope - scopes data by user ID', () => {
    resetState();
    setDataStorageScope('user-123');
    const patient = addPatient({ name: 'Test Patient', age: 30 });
    assert.ok(patient.id);

    // Switch to different user scope
    setDataStorageScope('user-456');
    const allPatients = getAllPatients();
    assert.strictEqual(allPatients.length, 0, 'Different user scope should see no patients');

    // Switch back to user-123
    setDataStorageScope('user-123');
    const patients = getAllPatients();
    assert.strictEqual(patients.length, 1, 'Original user scope should still have patient');
});

test('addPatient - creates patient with auto-generated ID and timestamps', () => {
    resetState();
    setDataStorageScope('user-1');
    
    const newPatient = addPatient({
        name: 'John Doe',
        age: 35,
        gender: 'M',
        mrn: 'MRN-001',
    });

    assert.ok(newPatient.id.startsWith('uuid-'));
    assert.strictEqual(newPatient.name, 'John Doe');
    assert.strictEqual(newPatient.age, 35);
    assert.ok(newPatient.createdAt);
    assert.ok(newPatient.updatedAt);
    assert.deepStrictEqual(newPatient.dailyReports, []);
    assert.deepStrictEqual(newPatient.symptoms, []);
    assert.deepStrictEqual(newPatient.vitalSigns, []);
});

test('addPatient - seeds vitalSigns from snapshot fields', () => {
    resetState();
    setDataStorageScope('user-1');

    const newPatient = addPatient({
        name: 'Jane Doe',
        heartRate: 80,
        bloodPressure: '120/80',
        temperature: 36.5,
    });

    assert.strictEqual(newPatient.vitalSigns.length, 1);
    assert.strictEqual(newPatient.vitalSigns[0].heartRate, 80);
    assert.strictEqual(newPatient.vitalSigns[0].bloodPressure, '120/80');
    assert.strictEqual(newPatient.vitalSigns[0].temperature, 36.5);
});

test('addPatient - preserves explicit vitalSigns array if provided', () => {
    resetState();
    setDataStorageScope('user-1');

    const vital1 = { id: 'v1', recordedAt: '2026-03-20T10:00:00Z', heartRate: 75 };
    const newPatient = addPatient({
        name: 'Test',
        vitalSigns: [vital1],
    });

    assert.strictEqual(newPatient.vitalSigns.length, 1);
    assert.strictEqual(newPatient.vitalSigns[0].id, 'v1');
});

test('getAllPatients - returns all patients in scope', () => {
    resetState();
    setDataStorageScope('user-1');

    assert.strictEqual(getAllPatients().length, 0);

    addPatient({ name: 'Patient A' });
    addPatient({ name: 'Patient B' });

    const patients = getAllPatients();
    assert.strictEqual(patients.length, 2);
    assert.strictEqual(patients[0].name, 'Patient A');
    assert.strictEqual(patients[1].name, 'Patient B');
});

test('getPatientById - returns null if not found', () => {
    resetState();
    setDataStorageScope('user-1');

    const result = getPatientById('nonexistent-id');
    assert.strictEqual(result, null);
});

test('getPatientById - returns patient if found', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Test Patient' });
    const found = getPatientById(patient.id);

    assert.ok(found);
    assert.strictEqual(found.id, patient.id);
    assert.strictEqual(found.name, 'Test Patient');
});

test('updatePatient - returns null if patient not found', () => {
    resetState();
    setDataStorageScope('user-1');

    const result = updatePatient('nonexistent-id', { name: 'Updated' });
    assert.strictEqual(result, null);
});

test('updatePatient - updates existing patient and updates timestamp', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Original Name', age: 25 });
    const originalCreatedAt = patient.createdAt;
    
    // Wait a tiny bit to ensure timestamp difference
    const updated = updatePatient(patient.id, { name: 'Updated Name', age: 30 });

    assert.ok(updated);
    assert.strictEqual(updated.name, 'Updated Name');
    assert.strictEqual(updated.age, 30);
    assert.strictEqual(updated.createdAt, originalCreatedAt);
    assert.ok(new Date(updated.updatedAt) >= new Date(patient.updatedAt));
});

test('deletePatient - removes patient and records tombstone', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'To Delete' });
    assert.strictEqual(getAllPatients().length, 1);

    const result = deletePatient(patient.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getAllPatients().length, 0);

    // Verify tombstone is recorded (for sync)
    const deletedState = JSON.parse(localStorage.getItem('medterminal_deleted_patients:user-1') || '{}');
    assert.ok(deletedState[patient.id]);
});

test('bulkSavePatients - replaces entire patient list', () => {
    resetState();
    setDataStorageScope('user-1');

    addPatient({ name: 'A' });
    addPatient({ name: 'B' });
    assert.strictEqual(getAllPatients().length, 2);

    const newPatients = [
        { id: 'new-1', name: 'X' },
        { id: 'new-2', name: 'Y' },
        { id: 'new-3', name: 'Z' },
    ];
    bulkSavePatients(newPatients);

    const all = getAllPatients();
    assert.strictEqual(all.length, 3);
    assert.strictEqual(all[0].name, 'X');
    assert.strictEqual(all[2].name, 'Z');
});

// ============================================================================
// BLOOD TYPE NORMALIZATION TESTS
// ============================================================================

test('addPatient - normalizes legacy combined bloodType (A+ → bloodType + rhesus)', () => {
    resetState();
    setDataStorageScope('user-1');

    // Manually save legacy format to localStorage
    localStorage.setItem('medterminal_patients:user-1', JSON.stringify([
        { id: 'legacy-1', bloodType: 'A+' },
        { id: 'legacy-2', bloodType: 'AB-' },
    ]));

    const patients = getAllPatients();
    assert.strictEqual(patients[0].bloodType, 'A');
    assert.strictEqual(patients[0].rhesus, '+');
    assert.strictEqual(patients[1].bloodType, 'AB');
    assert.strictEqual(patients[1].rhesus, '-');
});

// ============================================================================
// STASE CRUD TESTS
// ============================================================================

test('addStase - creates stase with ID, color, and timestamp', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Pediatri', color: '#FF5588' });

    assert.ok(stase.id.startsWith('uuid-'));
    assert.strictEqual(stase.name, 'Pediatri');
    assert.strictEqual(stase.color, '#FF5588');
    assert.ok(stase.createdAt);
});

test('getAllStases - returns all stases', () => {
    resetState();
    setDataStorageScope('user-1');

    addStase({ name: 'Pediatri', color: '#FF5588' });
    addStase({ name: 'Bedah', color: '#00AA99' });

    const stases = getAllStases();
    assert.strictEqual(stases.length, 2);
    assert.strictEqual(stases[0].name, 'Pediatri');
    assert.strictEqual(stases[1].name, 'Bedah');
});

test('updateStase - returns null if stase not found', () => {
    resetState();
    setDataStorageScope('user-1');

    const result = updateStase('nonexistent-id', { name: 'Updated' });
    assert.strictEqual(result, null);
});

test('updateStase - updates stase and updates timestamp', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Original', color: '#FF0000' });
    const updated = updateStase(stase.id, { name: 'Updated', color: '#00FF00' });

    assert.ok(updated);
    assert.strictEqual(updated.name, 'Updated');
    assert.strictEqual(updated.color, '#00FF00');
    assert.ok(updated.updatedAt);
});

test('deleteStase - removes stase and cascades patient deletion', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Pediatri', color: '#FF5588' });
    const patient1 = addPatient({ name: 'Child A', stase_id: stase.id });
    const patient2 = addPatient({ name: 'Child B', stase_id: stase.id });
    const patient3 = addPatient({ name: 'Other Patient' });

    assert.strictEqual(getAllStases().length, 1);
    assert.strictEqual(getAllPatients().length, 3);

    const result = deleteStase(stase.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getAllStases().length, 0);
    assert.strictEqual(getAllPatients().length, 1); // Only patient3 remains
    assert.strictEqual(getAllPatients()[0].name, 'Other Patient');

    // Cascade-deleted patients should be tombstoned for sync.
    const deletedState = JSON.parse(localStorage.getItem('medterminal_deleted_patients:user-1') || '{}');
    assert.ok(deletedState[patient1.id]);
    assert.ok(deletedState[patient2.id]);
});

test('deleteStase - removes pinned stase if it was pinned', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Pinned', color: '#FF0000' });
    setPinnedStaseId(stase.id);

    assert.strictEqual(getPinnedStaseId(), stase.id);

    deleteStase(stase.id);

    assert.strictEqual(getPinnedStaseId(), null);
});

test('reorderStase - moves stase up', () => {
    resetState();
    setDataStorageScope('user-1');

    const s1 = addStase({ name: 'First', color: '#FF0000' });
    const s2 = addStase({ name: 'Second', color: '#00FF00' });
    const s3 = addStase({ name: 'Third', color: '#0000FF' });

    // Move s3 up
    const result = reorderStase(s3.id, 'up');
    assert.strictEqual(result, true);

    const stases = getAllStases();
    assert.strictEqual(stases[1].id, s3.id);
    assert.strictEqual(stases[2].id, s2.id);
});

test('reorderStase - returns false if moving beyond bounds', () => {
    resetState();
    setDataStorageScope('user-1');

    const s1 = addStase({ name: 'First', color: '#FF0000' });

    const resultUp = reorderStase(s1.id, 'up');
    assert.strictEqual(resultUp, false);

    const resultDown = reorderStase(s1.id, 'down');
    assert.strictEqual(resultDown, false);
});

// ============================================================================
// PINNED STASE TESTS
// ============================================================================

test('getPinnedStaseId - returns null if not set', () => {
    resetState();
    setDataStorageScope('user-1');

    const pinned = getPinnedStaseId();
    assert.strictEqual(pinned, null);
});

test('setPinnedStaseId - sets and gets pinned stase', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Pediatri', color: '#FF5588' });
    setPinnedStaseId(stase.id);

    assert.strictEqual(getPinnedStaseId(), stase.id);
});

test('setPinnedStaseId - removes pinned stase when passed null', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Pediatri', color: '#FF5588' });
    setPinnedStaseId(stase.id);
    assert.strictEqual(getPinnedStaseId(), stase.id);

    setPinnedStaseId(null);
    assert.strictEqual(getPinnedStaseId(), null);
});

// ============================================================================
// PATIENT DETAIL ITEM TESTS (Symptoms, Daily Reports, etc.)
// ============================================================================

test('addSymptom - adds symptom to patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const symptom = addSymptom(patient.id, { name: 'Fever', duration: '3 days', severity: 'high' });

    assert.ok(symptom.id);
    assert.strictEqual(symptom.name, 'Fever');
    assert.strictEqual(symptom.severity, 'high');

    const found = getPatientById(patient.id);
    assert.strictEqual(found.symptoms.length, 1);
    assert.strictEqual(found.symptoms[0].name, 'Fever');
});

test('addSymptom - returns null if patient not found', () => {
    resetState();
    setDataStorageScope('user-1');

    const result = addSymptom('nonexistent-id', { name: 'Fever' });
    assert.strictEqual(result, null);
});

test('updateSymptom - updates symptom and patient timestamp', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const symptom = addSymptom(patient.id, { name: 'Fever', severity: 'high' });
    const originalCreatedAt = patient.createdAt;

    const updated = updateSymptom(patient.id, symptom.id, { severity: 'low' });

    assert.ok(updated);
    assert.strictEqual(updated.severity, 'low');

    const found = getPatientById(patient.id);
    assert.ok(new Date(found.updatedAt) >= new Date(originalCreatedAt));
});

test('removeSymptom - removes symptom from patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const symptom = addSymptom(patient.id, { name: 'Fever' });

    assert.strictEqual(getPatientById(patient.id).symptoms.length, 1);

    const result = removeSymptom(patient.id, symptom.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getPatientById(patient.id).symptoms.length, 0);
});

test('addDailyReport - adds daily report to patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const report = addDailyReport(patient.id, {
        date: '2026-03-23',
        chiefComplaint: 'Demam',
        vitals: 'HR 80, BP 120/80',
    });

    assert.ok(report.id);
    assert.strictEqual(report.chiefComplaint, 'Demam');

    const found = getPatientById(patient.id);
    assert.strictEqual(found.dailyReports.length, 1);
});

test('updateDailyReport - updates report', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const report = addDailyReport(patient.id, { date: '2026-03-23', chiefComplaint: 'Demam' });

    const updated = updateDailyReport(patient.id, report.id, { chiefComplaint: 'Batuk' });

    assert.ok(updated);
    assert.strictEqual(updated.chiefComplaint, 'Batuk');
});

test('removeDailyReport - removes report from patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const report = addDailyReport(patient.id, { date: '2026-03-23', chiefComplaint: 'Demam' });

    assert.strictEqual(getPatientById(patient.id).dailyReports.length, 1);

    const result = removeDailyReport(patient.id, report.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getPatientById(patient.id).dailyReports.length, 0);
});

// ============================================================================
// PHYSICAL EXAM TESTS
// ============================================================================

test('addPhysicalExam - adds exam to patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const exam = addPhysicalExam(patient.id, { date: '2026-03-23', findings: 'Auskultasi normal' });

    assert.ok(exam.id);
    assert.strictEqual(exam.findings, 'Auskultasi normal');
    assert.strictEqual(getPatientById(patient.id).physicalExams.length, 1);
});

test('updatePhysicalExam - updates exam', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const exam = addPhysicalExam(patient.id, { date: '2026-03-23', findings: 'Normal' });

    const updated = updatePhysicalExam(patient.id, exam.id, { findings: 'Abnormal' });
    assert.strictEqual(updated.findings, 'Abnormal');
});

test('removePhysicalExam - removes exam from patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const exam = addPhysicalExam(patient.id, { date: '2026-03-23', findings: 'Normal' });

    const result = removePhysicalExam(patient.id, exam.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getPatientById(patient.id).physicalExams.length, 0);
});

// ============================================================================
// SUPPORTING EXAM TESTS
// ============================================================================

test('addSupportingExam - adds exam to patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const exam = addSupportingExam(patient.id, { date: '2026-03-23', examType: 'Rontgen', findings: 'Normal' });

    assert.ok(exam.id);
    assert.strictEqual(exam.examType, 'Rontgen');
    assert.strictEqual(getPatientById(patient.id).supportingExams.length, 1);
});

test('updateSupportingExam - updates exam', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const exam = addSupportingExam(patient.id, { date: '2026-03-23', examType: 'Lab', findings: 'Normal' });

    const updated = updateSupportingExam(patient.id, exam.id, { findings: 'Abnormal results' });
    assert.strictEqual(updated.findings, 'Abnormal results');
});

test('removeSupportingExam - removes exam from patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const exam = addSupportingExam(patient.id, { date: '2026-03-23', examType: 'Lab', findings: 'Normal' });

    const result = removeSupportingExam(patient.id, exam.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getPatientById(patient.id).supportingExams.length, 0);
});

// ============================================================================
// PRESCRIPTION TESTS
// ============================================================================

test('addPrescription - adds prescription to patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const rx = addPrescription(patient.id, { drugName: 'Paracetamol', dose: '500mg', route: 'Oral' });

    assert.ok(rx.id);
    assert.strictEqual(rx.drugName, 'Paracetamol');
    assert.strictEqual(getPatientById(patient.id).prescriptions.length, 1);
});

test('updatePrescription - updates prescription', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const rx = addPrescription(patient.id, { drugName: 'Paracetamol', dose: '500mg' });

    const updated = updatePrescription(patient.id, rx.id, { dose: '1000mg' });
    assert.strictEqual(updated.dose, '1000mg');
});

test('removePrescription - removes prescription from patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const rx = addPrescription(patient.id, { drugName: 'Paracetamol', dose: '500mg' });

    const result = removePrescription(patient.id, rx.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getPatientById(patient.id).prescriptions.length, 0);
});

// ============================================================================
// VITAL SIGNS TESTS
// ============================================================================

test('addVitalSign - adds vital sign to patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const vital = addVitalSign(patient.id, {
        recordedAt: '2026-03-23T10:00:00Z',
        heartRate: 80,
        bloodPressure: '120/80',
    });

    assert.ok(vital.id);
    assert.strictEqual(vital.heartRate, 80);
    assert.strictEqual(getPatientById(patient.id).vitalSigns.length, 1);
});

test('updateVitalSign - updates vital sign', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const vital = addVitalSign(patient.id, { recordedAt: '2026-03-23T10:00:00Z', heartRate: 80 });

    const updated = updateVitalSign(patient.id, vital.id, { heartRate: 90 });
    assert.strictEqual(updated.heartRate, 90);
});

test('removeVitalSign - removes vital sign from patient', () => {
    resetState();
    setDataStorageScope('user-1');

    const patient = addPatient({ name: 'Patient' });
    const vital = addVitalSign(patient.id, { recordedAt: '2026-03-23T10:00:00Z', heartRate: 80 });

    const result = removeVitalSign(patient.id, vital.id);
    assert.strictEqual(result, true);
    assert.strictEqual(getPatientById(patient.id).vitalSigns.length, 0);
});

// ============================================================================
// INTEGRATION TESTS
// ============================================================================

test('Multiple patients with mixed operations', () => {
    resetState();
    setDataStorageScope('user-1');

    // Create multiple patients
    const p1 = addPatient({ name: 'Patient A', age: 30 });
    const p2 = addPatient({ name: 'Patient B', age: 25 });
    const p3 = addPatient({ name: 'Patient C', age: 40 });

    assert.strictEqual(getAllPatients().length, 3);

    // Add details to p1
    addSymptom(p1.id, { name: 'Fever' });
    addDailyReport(p1.id, { date: '2026-03-23' });

    // Update p2
    updatePatient(p2.id, { age: 26 });

    // Delete p3
    deletePatient(p3.id);

    // Verify state
    const all = getAllPatients();
    assert.strictEqual(all.length, 2);
    assert.strictEqual(all[0].symptoms.length, 1);
    assert.strictEqual(all[0].dailyReports.length, 1);
    assert.strictEqual(all[1].age, 26);
});

test('Stase cascade delete with scoping', () => {
    resetState();
    setDataStorageScope('user-1');

    const stase = addStase({ name: 'Pediatri', color: '#FF5588' });
    const p1 = addPatient({ name: 'Child 1', stase_id: stase.id });
    const p2 = addPatient({ name: 'Child 2', stase_id: stase.id });

    assert.strictEqual(getAllPatients().length, 2);

    deleteStase(stase.id);

    assert.strictEqual(getAllPatients().length, 0);
    assert.strictEqual(getAllStases().length, 0);
});

test('User scope isolation prevents cross-user data leak', () => {
    resetState();

    // User 1
    setDataStorageScope('user-1');
    addPatient({ name: 'User 1 Patient' });
    addStase({ name: 'User 1 Stase', color: '#FF0000' });

    // User 2
    setDataStorageScope('user-2');
    addPatient({ name: 'User 2 Patient' });
    addStase({ name: 'User 2 Stase', color: '#00FF00' });

    // Verify isolation
    assert.strictEqual(getAllPatients().length, 1);
    assert.strictEqual(getAllPatients()[0].name, 'User 2 Patient');
    assert.strictEqual(getAllStases().length, 1);
    assert.strictEqual(getAllStases()[0].name, 'User 2 Stase');

    // Switch back to User 1
    setDataStorageScope('user-1');
    assert.strictEqual(getAllPatients().length, 1);
    assert.strictEqual(getAllPatients()[0].name, 'User 1 Patient');
    assert.strictEqual(getAllStases().length, 1);
    assert.strictEqual(getAllStases()[0].name, 'User 1 Stase');
});
