// Data management with localStorage and Supabase sync
import { supabase } from './supabaseClient';
import { pendingSync } from './offlineQueue';
import { enqueue, clearQueueByType } from './idbQueue';
const STORAGE_KEY = 'medterminal_patients';
const STASE_KEY = 'medterminal_stases';
const PINNED_KEY = 'medterminal_pinned_stase';

function getStoredData() {
    try {
        const data = localStorage.getItem(STORAGE_KEY);
        const parsed = data ? JSON.parse(data) : [];
        // Normalize legacy combined bloodType values like 'A+' into { bloodType: 'A', rhesus: '+' }
        if (Array.isArray(parsed)) {
            return parsed.map(p => {
                if (!p) return p;
                const patient = { ...p };
                // If rhesus already exists, keep as-is
                if (typeof patient.rhesus === 'string') return patient;
                // If bloodType is a combined string like 'A+' or 'AB-' split it
                if (typeof patient.bloodType === 'string' && patient.bloodType.length > 0) {
                    const bt = patient.bloodType.trim();
                    const last = bt.slice(-1);
                    if (last === '+' || last === '-') {
                        patient.rhesus = last;
                        patient.bloodType = bt.slice(0, -1);
                    } else {
                        patient.rhesus = patient.rhesus || '';
                    }
                } else {
                    patient.bloodType = patient.bloodType || '';
                    patient.rhesus = patient.rhesus || '';
                }
                return patient;
            });
        }
        return parsed;
    } catch {
        return [];
    }
}

function saveData(patients) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(patients));
}

// ----- Supabase Sync Functions -----
export async function syncToSupabase(userId) {
    if (!userId) return;
    const patients = getStoredData();
    // Enqueue BEFORE attempting sync — ensures SW retries if tab closes mid-sync
    await enqueue({ type: 'patients', op: 'upsert', userId, payload: { patients_data: patients } }).catch(() => {});
    try {
        const { error } = await supabase.from('user_patients').upsert({
            user_id: userId,
            patients_data: patients,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        pendingSync.clearPatients();
        clearQueueByType(userId, 'patients').catch(() => {}); // success: dequeue
    } catch (err) {
        console.error("Failed to sync to Supabase:", err);
        // Mark as pending so OfflineContext flushes when back online
        // Queue item already written — SW will retry when online
        pendingSync.markPatients();
        throw err;
    }
}

export async function deleteAllPatientsData(userId) {
    // 1. Wipe local cache
    localStorage.removeItem(STORAGE_KEY);
    pendingSync.clearPatients();
    // 2. Delete the row from Supabase (if logged in)
    if (userId) {
        try {
            const { error } = await supabase.from('user_patients').delete().eq('user_id', userId);
            if (error) throw error;
        } catch (err) {
            console.error('Failed to delete patients from Supabase:', err);
            throw err;
        }
    }
}

export async function fetchFromSupabase(userId) {
    if (!userId) return getStoredData();
    // If there are offline changes, push them first so server has the latest data
    if (pendingSync.hasPatients()) {
        await syncToSupabase(userId);
    }
    try {
        const { data, error } = await supabase
            .from('user_patients')
            .select('patients_data')
            .eq('user_id', userId)
            .maybeSingle();

        if (data?.patients_data) {
            saveData(data.patients_data);
            return data.patients_data;
        }
    } catch (err) {
        console.error("Failed to fetch from Supabase:", err);
    }
    return getStoredData();
}
// -----------------------------------

// ----- Stase localStorage Helpers -----
function getStoredStases() {
    try {
        const data = localStorage.getItem(STASE_KEY);
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveStases(stases) {
    localStorage.setItem(STASE_KEY, JSON.stringify(stases));
}

export function getPinnedStaseId() {
    return localStorage.getItem(PINNED_KEY) || null;
}

export function setPinnedStaseId(id) {
    if (id === null) {
        localStorage.removeItem(PINNED_KEY);
    } else {
        localStorage.setItem(PINNED_KEY, id);
    }
}

// ----- Stase Supabase Sync -----
export async function syncStasesToSupabase(userId) {
    if (!userId) return;
    const stases = getStoredStases();
    const pinnedStaseId = getPinnedStaseId();
    // Enqueue BEFORE attempting sync
    await enqueue({ type: 'stases', op: 'upsert', userId, payload: { stases_data: stases, pinned_stase_id: pinnedStaseId } }).catch(() => {});
    try {
        const { error } = await supabase.from('user_stases').upsert({
            user_id: userId,
            stases_data: stases,
            pinned_stase_id: pinnedStaseId,
            updated_at: new Date().toISOString()
        });
        if (error) throw error;
        pendingSync.clearStases();
        clearQueueByType(userId, 'stases').catch(() => {}); // success: dequeue
    } catch (err) {
        console.error("Failed to sync stases to Supabase:", err);
        pendingSync.markStases();
        throw err;
    }
}

export async function fetchStasesFromSupabase(userId) {
    if (!userId) return { stases: getStoredStases(), pinnedStaseId: getPinnedStaseId() };
    // Flush offline stase changes first
    if (pendingSync.hasStases()) {
        await syncStasesToSupabase(userId);
    }
    try {
        const { data } = await supabase
            .from('user_stases')
            .select('stases_data, pinned_stase_id')
            .eq('user_id', userId)
            .maybeSingle();

        if (data?.stases_data) {
            saveStases(data.stases_data);
            if (data.pinned_stase_id) {
                setPinnedStaseId(data.pinned_stase_id);
            } else {
                setPinnedStaseId(null);
            }
            return { stases: data.stases_data, pinnedStaseId: data.pinned_stase_id || null };
        }
    } catch (err) {
        console.error("Failed to fetch stases from Supabase:", err);
    }
    return { stases: getStoredStases(), pinnedStaseId: getPinnedStaseId() };
}

// ----- Stase CRUD -----
export function getAllStases() {
    return getStoredStases();
}

export function addStase({ name, color }) {
    const stases = getStoredStases();
    const newStase = {
        id: crypto.randomUUID(),
        name,
        color,
        createdAt: new Date().toISOString(),
    };
    stases.push(newStase);
    saveStases(stases);
    return newStase;
}

export function updateStase(id, updates) {
    const stases = getStoredStases();
    const index = stases.findIndex(s => s.id === id);
    if (index === -1) return null;
    stases[index] = { ...stases[index], ...updates };
    saveStases(stases);
    return stases[index];
}

export function deleteStase(id) {
    // Remove the stase
    const stases = getStoredStases();
    const filtered = stases.filter(s => s.id !== id);
    saveStases(filtered);

    // Also delete all patients belonging to this stase
    const patients = getStoredData();
    const remainingPatients = patients.filter(p => p.stase_id !== id);
    saveData(remainingPatients);

    // Unpin if it was pinned
    if (getPinnedStaseId() === id) {
        setPinnedStaseId(null);
    }
    return true;
}

export function reorderStase(id, direction) {
    const stases = getStoredStases();
    const index = stases.findIndex(s => s.id === id);
    if (index === -1) return false;
    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= stases.length) return false;
    const reordered = [...stases];
    [reordered[index], reordered[newIndex]] = [reordered[newIndex], reordered[index]];
    saveStases(reordered);
    return true;
}
// ---------------------------------------

export function getAllPatients() {
    return getStoredData();
}

export function getPatientById(id) {
    const patients = getStoredData();
    return patients.find(p => p.id === id) || null;
}

export function addPatient(patient) {
    const patients = getStoredData();

    // Auto-seed vitalSigns from snapshot fields if patient didn't already bring a history
    const hasInitialVitals = patient.heartRate || patient.bloodPressure || patient.temperature || patient.respRate || patient.spO2;
    const seedVitalSigns = patient.vitalSigns?.length > 0 ? patient.vitalSigns : (
        hasInitialVitals ? [{
            id: crypto.randomUUID(),
            recordedAt: new Date().toISOString(),
            heartRate: patient.heartRate ?? '',
            bloodPressure: patient.bloodPressure ?? '',
            temperature: patient.temperature ?? '',
            respRate: patient.respRate ?? '',
            spO2: patient.spO2 ?? '',
        }] : []
    );

    const newPatient = {
        ...patient,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        dailyReports: patient.dailyReports || [],
        symptoms: patient.symptoms || [],
        physicalExams: patient.physicalExams || [],
        supportingExams: patient.supportingExams || [],
        prescriptions: patient.prescriptions || [],
        vitalSigns: seedVitalSigns,
        aiInsights: patient.aiInsights || [],
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
        date: report.date ? new Date(report.date).toISOString() : new Date().toISOString(),
    };

    if (!patient.dailyReports) patient.dailyReports = [];
    patient.dailyReports.push(newReport);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newReport;
}

export function updateDailyReport(patientId, reportId, updates) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.dailyReports) return null;

    const index = patient.dailyReports.findIndex(r => r.id === reportId);
    if (index === -1) return null;

    patient.dailyReports[index] = {
        ...patient.dailyReports[index],
        ...updates,
        date: updates.date ? new Date(updates.date).toISOString() : patient.dailyReports[index].date,
    };
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return patient.dailyReports[index];
}

export function removeDailyReport(patientId, reportId) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.dailyReports) return null;

    patient.dailyReports = patient.dailyReports.filter(r => r.id !== reportId);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return true;
}

export function addSymptom(patientId, symptom) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newSymptom = {
        ...symptom,
        id: crypto.randomUUID(),
        recordedAt: symptom.recordedAt ? new Date(symptom.recordedAt).toISOString() : new Date().toISOString(),
    };

    if (!patient.symptoms) patient.symptoms = [];
    patient.symptoms.push(newSymptom);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newSymptom;
}

export function updateSymptom(patientId, symptomId, updates) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.symptoms) return null;

    const index = patient.symptoms.findIndex(s => s.id === symptomId);
    if (index === -1) return null;

    patient.symptoms[index] = {
        ...patient.symptoms[index],
        ...updates,
        recordedAt: updates.recordedAt ? new Date(updates.recordedAt).toISOString() : patient.symptoms[index].recordedAt,
    };
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return patient.symptoms[index];
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
        date: exam.date ? new Date(exam.date).toISOString() : new Date().toISOString(),
    };

    if (!patient.physicalExams) patient.physicalExams = [];
    patient.physicalExams.push(newExam);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newExam;
}

export function updatePhysicalExam(patientId, examId, updates) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.physicalExams) return null;

    const index = patient.physicalExams.findIndex(e => e.id === examId);
    if (index === -1) return null;

    patient.physicalExams[index] = {
        ...patient.physicalExams[index],
        ...updates,
        date: updates.date ? new Date(updates.date).toISOString() : patient.physicalExams[index].date,
    };
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return patient.physicalExams[index];
}

export function removePhysicalExam(patientId, examId) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.physicalExams) return null;

    patient.physicalExams = patient.physicalExams.filter(e => e.id !== examId);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return true;
}

export function addSupportingExam(patientId, exam) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newExam = {
        ...exam,
        id: crypto.randomUUID(),
        date: exam.date ? new Date(exam.date).toISOString() : new Date().toISOString(),
    };

    if (!patient.supportingExams) patient.supportingExams = [];
    patient.supportingExams.push(newExam);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newExam;
}

export function updateSupportingExam(patientId, examId, updates) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.supportingExams) return null;

    const index = patient.supportingExams.findIndex(e => e.id === examId);
    if (index === -1) return null;

    patient.supportingExams[index] = {
        ...patient.supportingExams[index],
        ...updates,
        date: updates.date ? new Date(updates.date).toISOString() : patient.supportingExams[index].date,
    };
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return patient.supportingExams[index];
}

export function removeSupportingExam(patientId, examId) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.supportingExams) return null;

    patient.supportingExams = patient.supportingExams.filter(e => e.id !== examId);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return true;
}

export function addPrescription(patientId, prescription) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newPrescription = {
        ...prescription,
        id: crypto.randomUUID(),
        date: prescription.date ? new Date(prescription.date).toISOString() : new Date().toISOString(),
    };

    if (!patient.prescriptions) patient.prescriptions = [];
    patient.prescriptions.push(newPrescription);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newPrescription;
}

export function updatePrescription(patientId, prescId, updates) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.prescriptions) return null;

    const index = patient.prescriptions.findIndex(p => p.id === prescId);
    if (index === -1) return null;

    patient.prescriptions[index] = {
        ...patient.prescriptions[index],
        ...updates,
        date: updates.date ? new Date(updates.date).toISOString() : patient.prescriptions[index].date,
    };
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return patient.prescriptions[index];
}

export function removePrescription(patientId, prescriptionId) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.prescriptions) return null;

    patient.prescriptions = patient.prescriptions.filter(p => p.id !== prescriptionId);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return true;
}

export function addVitalSign(patientId, vitals) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient) return null;

    const newVitalSign = {
        ...vitals,
        id: crypto.randomUUID(),
        recordedAt: vitals.recordedAt ? new Date(vitals.recordedAt).toISOString() : new Date().toISOString(),
    };

    if (!patient.vitalSigns) patient.vitalSigns = [];
    patient.vitalSigns.push(newVitalSign);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return newVitalSign;
}

export function updateVitalSign(patientId, vsId, updates) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.vitalSigns) return null;

    const index = patient.vitalSigns.findIndex(v => v.id === vsId);
    if (index === -1) return null;

    patient.vitalSigns[index] = {
        ...patient.vitalSigns[index],
        ...updates,
        recordedAt: updates.recordedAt ? new Date(updates.recordedAt).toISOString() : patient.vitalSigns[index].recordedAt,
    };
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return patient.vitalSigns[index];
}

export function removeVitalSign(patientId, vsId) {
    const patients = getStoredData();
    const patient = patients.find(p => p.id === patientId);
    if (!patient || !patient.vitalSigns) return null;

    patient.vitalSigns = patient.vitalSigns.filter(v => v.id !== vsId);
    patient.updatedAt = new Date().toISOString();
    saveData(patients);
    return true;
}

// ============================================================
// SCHEDULE – localStorage helpers + Supabase sync
// ============================================================
const SCHEDULE_KEY = 'medterminal_schedules';

function getStoredSchedules() {
    try {
        const data = localStorage.getItem(SCHEDULE_KEY);
        if (!data) return [];
        const parsed = JSON.parse(data);
        const purged = purgeExpiredSchedules(parsed);
        if (purged.length !== parsed.length) saveSchedules(purged);
        return purged;
    } catch {
        return [];
    }
}

function saveSchedules(schedules) {
    localStorage.setItem(SCHEDULE_KEY, JSON.stringify(schedules));
}

export function clearSchedulesCache() {
    localStorage.removeItem(SCHEDULE_KEY);
}

function purgeExpiredSchedules(schedules) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    return schedules.filter(s => s.date >= cutoffStr);
}

export async function syncSchedulesToSupabase(userId) {
    if (!userId) return;
    const schedules = getStoredSchedules();
    // Enqueue BEFORE attempting sync
    await enqueue({ type: 'schedules', op: 'upsert', userId, payload: { schedules_data: schedules } }).catch(() => {});
    try {
        const { error } = await supabase.from('user_schedules').upsert({
            user_id: userId,
            schedules_data: schedules,
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
        pendingSync.clearSchedules();
        clearQueueByType(userId, 'schedules').catch(() => {}); // success: dequeue
    } catch (err) {
        console.error('Failed to sync schedules to Supabase:', err);
        pendingSync.markSchedules();
        throw err;
    }
}

export async function fetchSchedulesFromSupabase(userId) {
    if (!userId) return getStoredSchedules();
    // Flush offline schedule changes first
    if (pendingSync.hasSchedules()) {
        await syncSchedulesToSupabase(userId);
    }
    try {
        const { data } = await supabase
            .from('user_schedules')
            .select('schedules_data')
            .eq('user_id', userId)
            .maybeSingle();

        if (data?.schedules_data) {
            const purged = purgeExpiredSchedules(data.schedules_data);
            saveSchedules(purged);
            if (purged.length !== data.schedules_data.length) syncSchedulesToSupabase(userId);
            return purged;
        }
    } catch (err) {
        console.error('Failed to fetch schedules from Supabase:', err);
    }
    return getStoredSchedules();
}

export function getAllSchedules() {
    return getStoredSchedules();
}

export function addSchedule(schedule) {
    const schedules = getStoredSchedules();
    const newSchedule = {
        ...schedule,
        id: crypto.randomUUID(),
        createdAt: new Date().toISOString(),
    };
    schedules.push(newSchedule);
    saveSchedules(schedules);
    return newSchedule;
}

export function updateSchedule(id, updates) {
    const schedules = getStoredSchedules();
    const index = schedules.findIndex(s => s.id === id);
    if (index === -1) return null;
    schedules[index] = { ...schedules[index], ...updates };
    saveSchedules(schedules);
    return schedules[index];
}

export function deleteSchedule(id) {
    const schedules = getStoredSchedules();
    saveSchedules(schedules.filter(s => s.id !== id));
    return true;
}
// -------------------------------------------------------

// ============================================================
// LAB REFERENCES – RSUD Ki Ageng Brondong (Official)
// Organized by: category, with metode, satuan, and gender ranges
// ============================================================
export const labCategories = [
    { key: 'hematologi', label: 'Hematologi', icon: 'bloodtype' },
    { key: 'diffCount', label: 'Diff Count', icon: 'scatter_plot' },
    { key: 'kimiaKlinik', label: 'Kimia Klinik', icon: 'science' },
    { key: 'elektrolit', label: 'Elektrolit', icon: 'electric_bolt' },
    { key: 'imunoserologi', label: 'Imunoserologi', icon: 'vaccines' },
    { key: 'urinalisis', label: 'Urinalisis', icon: 'water_drop' },
    { key: 'feses', label: 'Feses', icon: 'biotech' },
    { key: 'labRujukan', label: 'Lab Rujukan (IBL/ABC)', icon: 'local_hospital' },
];

export const labReferences = {
    // ---- HEMATOLOGI ----
    lekosit: {
        name: 'Lekosit', category: 'hematologi', metode: 'Hema Auto', unit: '10³/mm³',
        // Dewasa default
        low: 4.0, high: 10.0,
        ranges: [
            { label: 'Bayi baru lahir', low: 9.0, high: 30.0 },
            { label: 'Bayi/Anak', low: 9.0, high: 12.0 },
            { label: 'Dewasa', low: 4.0, high: 10.0 },
        ],
    },
    eritrosit: {
        name: 'Eritrosit', category: 'hematologi', metode: 'Hema Auto', unit: '10⁶/L',
        male: { low: 4.4, high: 5.6 }, female: { low: 3.8, high: 5.0 },
        ranges: [
            { label: 'Bayi', low: 3.7, high: 6.5 },
            { label: '< 2 mgg', low: 3.9, high: 5.9 },
            { label: '1 th', low: 3.1, high: 4.3 },
            { label: 'Anak > 1 th', low: 3.9, high: 5.2 },
            { label: 'Laki-laki', low: 4.4, high: 5.6 },
            { label: 'Wanita', low: 3.8, high: 5.0 },
        ],
    },
    hemoglobin: {
        name: 'Hemoglobin', category: 'hematologi', metode: 'Hema Auto', unit: 'gr/dl',
        male: { low: 13.0, high: 18.0 }, female: { low: 12.0, high: 16.0 },
        ranges: [
            { label: 'Bayi', low: 14.9, high: 23.7 },
            { label: '< 2 mgg', low: 13.4, high: 19.8 },
            { label: '1 th', low: 9.4, high: 13.0 },
            { label: 'Anak > 1 th', low: 11.5, high: 15.5 },
            { label: 'Pria', low: 13.0, high: 18.0 },
            { label: 'Wanita', low: 12.0, high: 16.0 },
        ],
    },
    hematokrit: {
        name: 'Hematokrit', category: 'hematologi', metode: 'Hema Auto', unit: '%',
        male: { low: 40, high: 50 }, female: { low: 35, high: 45 },
        ranges: [
            { label: 'Bayi', low: 47, high: 75 },
            { label: '< 2 mgg', low: 41, high: 75 },
            { label: '1 th', low: 28, high: 42 },
            { label: 'Anak > 1 th', low: 34, high: 45 },
            { label: 'Pria', low: 40, high: 50 },
            { label: 'Wanita', low: 35, high: 45 },
        ],
    },
    trombosit: {
        name: 'Trombosit', category: 'hematologi', metode: 'Hema Auto', unit: '10³/mm³',
        low: 150, high: 450,
    },
    mcv: {
        name: 'MCV', category: 'hematologi', metode: 'Hema Auto', unit: 'fL',
        low: 80, high: 100,
    },
    mch: {
        name: 'MCH', category: 'hematologi', metode: 'Hema Auto', unit: 'pg',
        low: 26.0, high: 33.5,
    },
    mchc: {
        name: 'MCHC', category: 'hematologi', metode: 'Hema Auto', unit: 'g/dl',
        low: 31.5, high: 35.0,
    },
    rdw: {
        name: 'RDW', category: 'hematologi', metode: 'Hema Auto', unit: '%',
        low: 10.0, high: 15.0,
    },
    mpv: {
        name: 'MPV', category: 'hematologi', metode: 'Hema Auto', unit: 'μm³',
        low: 6.5, high: 11.0,
    },
    pdw: {
        name: 'PDW', category: 'hematologi', metode: 'Hema Auto', unit: '%',
        low: 10.0, high: 18.0,
    },
    // ---- DIFF COUNT ----
    limfosit: {
        name: 'Limfosit', category: 'diffCount', metode: 'Hema Auto', unit: '%',
        low: 17.0, high: 48.0,
    },
    monosit: {
        name: 'Monosit', category: 'diffCount', metode: 'Hema Auto', unit: '%',
        low: 4.0, high: 10.0,
    },
    granulosit: {
        name: 'Granulosit', category: 'diffCount', metode: 'Hema Auto', unit: '%',
        low: 43.0, high: 76.0,
    },
    led: {
        name: 'LED I', category: 'diffCount', metode: 'Westergren', unit: 'mm/jam',
        low: 0, high: 15,
    },
    bt: {
        name: 'BT (Bleeding Time)', category: 'diffCount', metode: 'Ivy', unit: 'Menit',
        low: 1, high: 6,
    },
    ct: {
        name: 'CT (Clotting Time)', category: 'diffCount', metode: 'Lee & White', unit: 'Menit',
        low: 6, high: 15,
    },
    // ---- KIMIA KLINIK ----
    gdpuasa: {
        name: 'Gula Darah Puasa', category: 'kimiaKlinik', metode: 'GOD PAP', unit: 'mg/dl',
        low: 70, high: 126,
    },
    gd2jpp: {
        name: 'Gula Darah 2 JPP', category: 'kimiaKlinik', metode: 'GOD PAP', unit: 'mg/dl',
        low: 70, high: 180,
    },
    gdSewaktu: {
        name: 'Gula Darah Sewaktu', category: 'kimiaKlinik', metode: 'GOD PAP', unit: 'mg/dl',
        low: 70, high: 200,
        ranges: [
            { label: 'Dewasa', low: 70, high: 200 },
            { label: '1-6 Th', low: 74, high: 127 },
        ],
    },
    sgot: {
        name: 'SGOT', category: 'kimiaKlinik', metode: 'IFCC', unit: 'U/L',
        male: { low: 0, high: 37 }, female: { low: 0, high: 31 },
        ranges: [
            { label: 'Pria', low: 0, high: 37 },
            { label: 'Wanita', low: 0, high: 31 },
        ],
    },
    sgpt: {
        name: 'SGPT', category: 'kimiaKlinik', metode: 'IFCC', unit: 'U/L',
        male: { low: 0, high: 42 }, female: { low: 0, high: 31 },
        ranges: [
            { label: 'Pria', low: 0, high: 42 },
            { label: 'Wanita', low: 0, high: 31 },
        ],
    },
    bilirubinTotal: {
        name: 'Bilirubin Total', category: 'kimiaKlinik', metode: 'Modified Jendrasik/Grof', unit: 'mg/dl',
        low: 0, high: 1.2,
    },
    bilirubinDirek: {
        name: 'Bilirubin Direk', category: 'kimiaKlinik', metode: 'Modified Jendrasik/Grof', unit: 'mg/dl',
        low: 0, high: 0.3,
    },
    ureum: {
        name: 'Ureum', category: 'kimiaKlinik', metode: 'Enzymatic CLR', unit: 'mg/dl',
        low: 10, high: 50,
    },
    kreatinin: {
        name: 'Kreatinin', category: 'kimiaKlinik', metode: 'Photo CLR', unit: 'mg/dl',
        male: { low: 0.6, high: 1.1 }, female: { low: 0.5, high: 0.9 },
        ranges: [
            { label: 'Pria', low: 0.6, high: 1.1 },
            { label: 'Wanita', low: 0.5, high: 0.9 },
        ],
    },
    asamUrat: {
        name: 'Asam Urat', category: 'kimiaKlinik', unit: 'mg/dl',
        male: { low: 0.34, high: 7.2 }, female: { low: 0.34, high: 6.0 },
        ranges: [
            { label: 'Pria', low: 0.34, high: 7.2 },
            { label: 'Wanita', low: 0.34, high: 5.7 },
        ],
    },
    totalProtein: {
        name: 'Total Protein', category: 'kimiaKlinik', metode: 'Biuret', unit: 'gr/dl',
        low: 6.6, high: 8.7,
    },
    albumin: {
        name: 'Albumin', category: 'kimiaKlinik', unit: 'gr/dl',
        low: 3.8, high: 5.1,
    },
    kolesterol: {
        name: 'Kolesterol Total', category: 'kimiaKlinik', metode: 'CHOD PAP', unit: 'mg/dl',
        low: 0, high: 200,
    },
    trigliserida: {
        name: 'Trigliserida', category: 'kimiaKlinik', metode: 'CLR Enzymatic GPO', unit: 'mg/dl',
        low: 0, high: 200,
    },
    hdl: {
        name: 'HDL Kolesterol', category: 'kimiaKlinik', unit: 'mg/dl',
        low: 35, high: 999,
    },
    ldl: {
        name: 'LDL Kolesterol', category: 'kimiaKlinik', unit: 'mg/dl',
        low: 0, high: 115,
    },
    ckmb: {
        name: 'CKMB', category: 'kimiaKlinik', metode: 'DGKC dan IFCC', unit: 'U/L',
        low: 0, high: 24,
    },
    // ---- ELEKTROLIT ----
    kalium: {
        name: 'Kalium', category: 'elektrolit', metode: 'ISE', unit: 'mEq/L',
        low: 3.6, high: 5.5,
    },
    natrium: {
        name: 'Natrium', category: 'elektrolit', metode: 'ISE', unit: 'mEq/L',
        low: 135, high: 145,
    },
    klorida: {
        name: 'Klorida', category: 'elektrolit', metode: 'ISE', unit: 'mEq/L',
        low: 98, high: 108,
    },
    // ---- IMUNOSEROLOGI ----
    hbsag: {
        name: 'HBsAg', category: 'imunoserologi', metode: 'Rapid', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    antiHcv: {
        name: 'Anti HCV', category: 'imunoserologi', metode: 'ICT', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    igmHav: {
        name: 'IgM HAV', category: 'imunoserologi', metode: 'ICT', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    dengueNs1: {
        name: 'Dengue NS1 Ag', category: 'imunoserologi', metode: 'ICT', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    dengueIgg: {
        name: 'Dengue IgG', category: 'imunoserologi', metode: 'ICT', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    dengueIgm: {
        name: 'Dengue IgM', category: 'imunoserologi', metode: 'ICT', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    igmSalmonella: {
        name: 'IgM Salmonella', category: 'imunoserologi', metode: 'IMBI', unit: '-',
        low: 0, high: 1.9, infoRanges: [{ label: 'Negatif', value: '< 2' }, { label: 'Positif', value: '≥ 4' }],
    },
    widalO: {
        name: 'Widal O', category: 'imunoserologi', metode: 'Aglutinasi', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    widalH: {
        name: 'Widal H', category: 'imunoserologi', metode: 'Aglutinasi', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    widalAh: {
        name: 'Widal AH', category: 'imunoserologi', metode: 'Aglutinasi', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    widalBh: {
        name: 'Widal BH', category: 'imunoserologi', metode: 'Aglutinasi', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    malaria: {
        name: 'Malaria', category: 'imunoserologi', metode: 'ICT', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    // ---- URINALISIS ----
    urinWarna: {
        name: 'Warna Urin', category: 'urinalisis', metode: 'Makroskopis', unit: '-',
        qualitative: true, normalValue: 'Kuning Jernih',
    },
    urinBj: {
        name: 'Berat Jenis Urin', category: 'urinalisis', metode: 'Makroskopis', unit: 'g/dl',
        low: 1.003, high: 1.030,
    },
    urinPh: {
        name: 'pH Urin', category: 'urinalisis', metode: 'Makroskopis', unit: '-',
        low: 4.8, high: 7.5,
    },
    urinProtein: {
        name: 'Protein Urin', category: 'urinalisis', metode: 'Imm. chromatograf', unit: 'mg/dl',
        qualitative: true, normalValue: 'Negatif',
    },
    urinGlukosa: {
        name: 'Glukosa Urin', category: 'urinalisis', metode: 'Imm. chromatograf', unit: 'mg/dl',
        qualitative: true, normalValue: 'Normal',
    },
    urinUrobilin: {
        name: 'Urobilin Urin', category: 'urinalisis', metode: 'Imm. chromatograf', unit: 'mg/dl',
        qualitative: true, normalValue: 'Negatif',
    },
    urinBilirubin: {
        name: 'Bilirubin Urin', category: 'urinalisis', metode: 'Imm. chromatograf', unit: 'mg/dl',
        qualitative: true, normalValue: 'Negatif',
    },
    urinLekosit: {
        name: 'Lekosit Urin', category: 'urinalisis', metode: 'Mikroskopis', unit: 'LPB',
        low: 1, high: 4,
    },
    urinEritrosit: {
        name: 'Eritrosit Urin', category: 'urinalisis', metode: 'Mikroskopis', unit: 'LPB',
        low: 0, high: 1,
    },
    urinEpithel: {
        name: 'Epithel Urin', category: 'urinalisis', metode: 'Mikroskopis', unit: 'LPK',
        low: 1, high: 15,
    },
    urinCilinder: {
        name: 'Silinder Urin', category: 'urinalisis', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    urinKristal: {
        name: 'Kristal Urin', category: 'urinalisis', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    urinNitrit: {
        name: 'Nitrit Urin', category: 'urinalisis', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    // ---- FESES ----
    fesesLekosit: {
        name: 'Lekosit Feses', category: 'feses', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    fesesEritrosit: {
        name: 'Eritrosit Feses', category: 'feses', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    fesesDarahSamar: {
        name: 'Darah Samar Feses', category: 'feses', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    fesesKarbohidrat: {
        name: 'Karbohidrat Feses', category: 'feses', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    fesesLemak: {
        name: 'Lemak Feses', category: 'feses', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    fesesAmoeba: {
        name: 'Amoeba Feses', category: 'feses', metode: 'Mikroskopis', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    // ---- LAB RUJUKAN (IBL/ABC) ----
    hba1c: {
        name: 'HbA1C', category: 'labRujukan', unit: '%',
        infoRanges: [
            { label: 'Baik', value: '< 6,5' },
            { label: 'Sedang', value: '6,6 – 8,0' },
            { label: 'Buruk', value: '> 8,0' },
        ],
        low: 0, high: 6.5,
    },
    retikulosit: {
        name: 'Retikulosit', category: 'labRujukan', unit: '%',
        low: 0.5, high: 1.5,
    },
    fibrinogen: {
        name: 'Fibrinogen', category: 'labRujukan', unit: 'mg/dl',
        low: 200, high: 400,
    },
    gammaGt: {
        name: 'Gamma GT', category: 'labRujukan', unit: 'U/L',
        male: { low: 11, high: 62 }, female: { low: 9, high: 39 },
        ranges: [
            { label: 'Pria', low: 11, high: 62 },
            { label: 'Wanita', low: 9, high: 39 },
        ],
    },
    alkFosfatase: {
        name: 'Alk. Phosphatase', category: 'labRujukan', unit: 'U/L',
        low: 42, high: 141,
    },
    kalsium: {
        name: 'Kalsium', category: 'labRujukan', unit: 'mg/dl',
        low: 8.1, high: 10.4,
    },
    magnesium: {
        name: 'Magnesium', category: 'labRujukan', unit: 'mg/dl',
        low: 1.9, high: 2.5,
    },
    ldh: {
        name: 'LDH', category: 'labRujukan', unit: 'U/L',
        low: 160, high: 320,
    },
    asto: {
        name: 'ASTO', category: 'labRujukan', unit: 'IU/mL',
        qualitative: true, normalValue: 'Negatif',
    },
    astoSemiKuantitatif: {
        name: 'ASTO Semi Kuantitatif', category: 'labRujukan', unit: 'IU/mL',
        low: 0, high: 199,
    },
    rf: {
        name: 'Rhematoid Faktor', category: 'labRujukan', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    crp: {
        name: 'CRP', category: 'labRujukan', unit: '-',
        qualitative: true, normalValue: 'Negatif',
    },
    hiv: {
        name: 'HIV', category: 'labRujukan', unit: 'INDEX',
        qualitative: true, normalValue: 'Non Reaktif',
    },
    antiHbs: {
        name: 'Anti HBs', category: 'labRujukan', unit: 'UI/ml',
        low: 0, high: 9.9,
    },
    tshs: {
        name: 'TSHs', category: 'labRujukan', unit: 'μIU/mL',
        low: 0.27, high: 4.2,
        infoRanges: [
            { label: 'Euthyroid', value: '0,27 – 4,2' },
            { label: 'Hyperthyroid', value: '< 0,27' },
            { label: 'Hypothyroid', value: '> 4,2' },
        ],
    },
    t3: {
        name: 'T3', category: 'labRujukan', unit: 'nmol/L',
        low: 1.6, high: 4.3,
    },
    t4: {
        name: 'T4', category: 'labRujukan', unit: 'nmol/L',
        low: 105.5, high: 208.5,
    },
    freeT4: {
        name: 'Free T4', category: 'labRujukan', unit: 'ng/dl',
        low: 0.93, high: 1.7,
    },
    aptt: {
        name: 'APTT', category: 'labRujukan', unit: 'Detik',
        low: 27, high: 42,
    },
    ppt: {
        name: 'PPT', category: 'labRujukan', unit: 'Detik',
        low: 12, high: 19,
    },
    besiSerum: {
        name: 'Besi Serum (Fe)', category: 'labRujukan', unit: 'μg/dl',
        low: 40, high: 158,
    },
    tibc: {
        name: 'TIBC', category: 'labRujukan', unit: 'μg/dl',
        low: 250, high: 410,
    },
    psa: {
        name: 'PSA', category: 'labRujukan', unit: 'ng/mL',
        low: 0, high: 4,
    },
};

// Get range for a specific lab key and gender
function getRange(ref, gender = 'male') {
    if (ref.qualitative) return null;
    if (ref.male && ref.female) return ref[gender] || ref.male;
    return { low: ref.low, high: ref.high };
}

export function checkLabValue(labKey, value, gender = 'male') {
    const ref = labReferences[labKey];
    if (!ref) return { status: 'unknown', label: '–' };

    // Qualitative result (non-numeric)
    if (ref.qualitative) {
        const v = String(value).toLowerCase().trim();
        const isNormal = ['negatif', 'negative', 'normal', 'kuning jernih', 'steril', 'non reaktif'].some(n => v.includes(n));
        return isNormal
            ? { status: 'normal', label: 'Normal' }
            : { status: 'high', label: '⚠ Abnormal' };
    }

    const range = getRange(ref, gender);
    if (!range) return { status: 'unknown', label: '–' };

    const numValue = parseFloat(String(value).replace(',', '.'));
    if (isNaN(numValue)) return { status: 'unknown', label: '–' };

    if (typeof range.low === 'number' && numValue < range.low) return { status: 'low', label: '↓ Rendah' };
    if (typeof range.high === 'number' && numValue > range.high) return { status: 'high', label: '↑ Tinggi' };
    return { status: 'normal', label: '✓ Normal' };
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

export function parseAIDiagnoses(text) {
    if (!text) return null;
    const diagnoses = [];
    const lines = text.split('\n');
    let inDdx = false;

    for (const line of lines) {
        // Masuk seksi DDx
        if (/kemungkinan diagnosis|\(ddx\)|diagnosis banding/i.test(line)) {
            inDdx = true;
            continue;
        }
        // Keluar seksi DDx
        if (inDdx && /gejala utama|pemeriksaan yang|red flag/i.test(line)) {
            inDdx = false;
        }
        if (!inDdx) continue;

        // Bersihkan markdown bold/italic
        const cleanLine = line.replace(/\*\*/g, '').replace(/\*/g, '').replace(/_/g, '').trim();

        // Regex fleksibel: nomor. [nama termasuk (CAP) dsb] - Probabilitas: Tinggi/Sedang/Rendah
        const match = cleanLine.match(
            /^\d+\.\s+(.+?)\s*-\s*Probabilitas\s*:\s*(Tinggi|Sedang|Rendah)/i
        );

        if (match) {
            const rawName = match[1].trim();
            const probText = match[2].toLowerCase();

            let probValue;
            if (probText === 'tinggi') probValue = 85 + Math.floor(Math.random() * 10);
            else if (probText === 'sedang') probValue = 50 + Math.floor(Math.random() * 20);
            else probValue = 20 + Math.floor(Math.random() * 15);

            // Singkat nama: hapus keterangan dalam kurung seperti (CAP), (jika ada riwayat PPOK)
            const simplified = rawName.replace(/\s*\([^)]*\)/g, '').trim();
            const displayName = simplified.length > 1 ? simplified : rawName;

            diagnoses.push({
                diagnosis: displayName,
                probability: probValue,
                level: probText,
                fullMark: 100,
            });
        }
    }

    return diagnoses.length > 0 ? diagnoses : null;
}
