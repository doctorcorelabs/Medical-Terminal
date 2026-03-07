// Data management with localStorage (MVP) - will be replaced with Supabase
const STORAGE_KEY = 'medterminal_patients';

function getStoredData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveData(patients) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
}

export function getAllPatients() {
    return getStoredData();
}

export function getPatientById(id) {
    const patients = getStoredData();
    return patients.find(p => p.id === id) || null;
}

export function addPatient(patient) {
    const patients = getStoredData();
    const newPatient = {
        ...patient,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dailyReports: [],
        symptoms: [],
        physicalExams: [],
        supportingExams: [],
        prescriptions: [],
        aiInsights: [],
    };
    patients.push(newPatient);
    saveData(patients);
    return newPatient;
}

export function updatePatient(id, updates) {
    const patients = getStoredData();
    const index = patients.findIndex(p => p.id === id);
    if (index === -1) return null;

    patients[index] = {
        ...patients[index],
        ...updates,
        updatedAt: new Date().toISOString(),
    };
    saveData(patients);
    return patients[index];
}

export function deletePatient(id) {
    const patients = getStoredData();
    const filtered = patients.filter(p => p.id !== id);
    saveData(filtered);
    return true;
}

export function addDailyReport(patientId, report) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newReport = {
        ...report,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
    };

    if (!patient.dailyReports) patient.dailyReports = [];
    patient.dailyReports.push(newReport);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newReport;
}

export function addSymptom(patientId, symptom) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newSymptom = {
        ...symptom,
        id: crypto.randomUUID(),
        recordedAt: new Date().toISOString(),
    };

    if (!patient.symptoms) patient.symptoms = [];
    patient.symptoms.push(newSymptom);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newSymptom;
}

export function removeSymptom(patientId, symptomId) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.symptoms) return null;

    patient.symptoms = patient.symptoms.filter(s => s.id !== symptomId);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return true;
}

export function addPhysicalExam(patientId, exam) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newExam = {
        ...exam,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
    };

    if (!patient.physicalExams) patient.physicalExams = [];
    patient.physicalExams.push(newExam);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newExam;
}

export function addSupportingExam(patientId, exam) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newExam = {
        ...exam,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
    };

    if (!patient.supportingExams) patient.supportingExams = [];
    patient.supportingExams.push(newExam);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newExam;
}

export function addPrescription(patientId, prescription) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newPrescription = {
        ...prescription,
        id: crypto.randomUUID(),
        date: new Date().toISOString(),
    };

    if (!patient.prescriptions) patient.prescriptions = [];
    patient.prescriptions.push(newPrescription);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newPrescription;
}

// Lab reference values
export const labReferences = {
    hemoglobin: { name: 'Hemoglobin', unit: 'g/dL', male: { low: 13.5, high: 17.5 }, female: { low: 12.0, high: 16.0 } },
    hematocrit: { name: 'Hematocrit', unit: '%', male: { low: 38.3, high: 48.6 }, female: { low: 35.5, high: 44.9 } },
    wbc: { name: 'WBC', unit: '×10³/µL', low: 4.5, high: 11.0 },
    platelet: { name: 'Platelet', unit: '×10³/µL', low: 150, high: 400 },
    glucose: { name: 'Glukosa', unit: 'mg/dL', low: 70, high: 100 },
    creatinine: { name: 'Kreatinin', unit: 'mg/dL', male: { low: 0.7, high: 1.3 }, female: { low: 0.6, high: 1.1 } },
    sodium: { name: 'Natrium', unit: 'mEq/L', low: 136, high: 145 },
    potassium: { name: 'Kalium', unit: 'mEq/L', low: 3.5, high: 5.0 },
    sgot: { name: 'SGOT/AST', unit: 'U/L', low: 0, high: 40 },
    sgpt: { name: 'SGPT/ALT', unit: 'U/L', low: 0, high: 41 },
    albumin: { name: 'Albumin', unit: 'g/dL', low: 3.5, high: 5.5 },
    bilirubin: { name: 'Bilirubin Total', unit: 'mg/dL', low: 0.1, high: 1.2 },
    ureum: { name: 'Ureum', unit: 'mg/dL', low: 15, high: 40 },
    cholesterol: { name: 'Kolesterol Total', unit: 'mg/dL', low: 0, high: 200 },
    triglyceride: { name: 'Trigliserida', unit: 'mg/dL', low: 0, high: 150 },
    uricAcid: { name: 'Asam Urat', unit: 'mg/dL', male: { low: 3.4, high: 7.0 }, female: { low: 2.4, high: 6.0 } },
};

export function checkLabValue(labKey, value, gender = 'male') {
    const ref = labReferences[labKey];
    if (!ref) return { status: 'unknown', label: 'Unknown' };

    const range = ref.male ? ref[gender] : ref;
    const numValue = parseFloat(value);

    if (isNaN(numValue)) return { status: 'unknown', label: '-' };
    if (numValue < range.low) return { status: 'low', label: '↓ Rendah' };
    if (numValue > range.high) return { status: 'high', label: '↑ Tinggi' };
    return { status: 'normal', label: 'Normal' };
}

export function calculateDaysInHospital(admissionDate) {
    const admission = new Date(admissionDate);
    const now = new Date();
    const diff = Math.floor((now - admission) / (1000 * 60 * 60 * 24));
    return Math.max(0, diff);
}

export function calculateRecoveryProgress(admissionDate, targetDays) {
    const daysIn = calculateDaysInHospital(admissionDate);
    const progress = Math.min(100, Math.round((daysIn / targetDays) * 100));
    return { daysIn, targetDays, progress, remaining: Math.max(0, targetDays - daysIn) };
}

export function getConditionFromProgress(progress, daysIn, targetDays) {
    if (daysIn > targetDays) return 'overdue';
    if (progress >= 80) return 'near-target';
    if (progress >= 50) return 'on-track';
    return 'early';
}

export function formatDate(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
    });
}

export function formatDateTime(dateString) {
    if (!dateString) return '-';
    return new Date(dateString).toLocaleDateString('id-ID', {
        day: 'numeric',
        month: 'short',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
    });
}

export function getRelativeTime(dateString) {
    const now = new Date();
    const date = new Date(dateString);
    const diff = Math.floor((now - date) / 1000);

    if (diff < 60) return 'Baru saja';
    if (diff < 3600) return `${Math.floor(diff / 60)} menit lalu`;
    if (diff < 86400) return `${Math.floor(diff / 3600)} jam lalu`;
    if (diff < 604800) return `${Math.floor(diff / 86400)} hari lalu`;
    return formatDate(dateString);
}
