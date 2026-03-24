// Data management with localStorage and Supabase sync
import { supabase } from './supabaseClient.js';
import { pendingSync, setPendingSyncScope } from './offlineQueue.js';
import { enqueue, clearQueueByType } from './idbQueue.js';
import { getOrCreateDeviceId } from './swConfig.js';
import {
    getScheduleStorageKey,
    mergeSchedules,
    parseStoredSchedules,
    purgeExpiredSchedules,
    schedulesDiffer,
} from '../utils/scheduleSync.js';
const STORAGE_KEY = 'medterminal_patients';
const DELETED_PATIENTS_KEY = 'medterminal_deleted_patients'; // Tombstones for sync
const STASE_KEY = 'medterminal_stases';
const DELETED_STASES_KEY = 'medterminal_deleted_stases'; // Tombstones for sync
const PINNED_KEY = 'medterminal_pinned_stase';
const DELETED_SCHEDULES_KEY = 'medterminal_deleted_schedules'; // Tombstones for schedule sync
const SYNC_SEQUENCE_KEY = 'medterminal_sync_sequence';

let activeDataUserId = null;
let activeScheduleUserId = null;

function logSyncWarning(operation, userId, err, extra = {}) {
    console.warn('[dataService] Sync warning', {
        operation,
        userId: userId || null,
        error: err?.message || String(err || 'unknown'),
        ...extra,
    });
}

function getRoleSnapshot() {
    try {
        const raw = localStorage.getItem('medterminal_profile_cache');
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        return typeof parsed?.role === 'string' ? parsed.role : null;
    } catch {
        return null;
    }
}

function getSequenceStorageKey(userId, type) {
    const scope = userId || 'anonymous';
    return `${SYNC_SEQUENCE_KEY}:${scope}:${type}`;
}

function nextSyncSequence(userId, type) {
    const key = getSequenceStorageKey(userId, type);
    let current = 0;
    try {
        current = Number(localStorage.getItem(key) || '0');
    } catch {
        current = 0;
    }
    const next = Number.isFinite(current) ? current + 1 : 1;
    try {
        localStorage.setItem(key, String(next));
    } catch {
        // Non-fatal: sequence falls back to current runtime value.
    }
    return next;
}

function buildSyncMetadata(userId, type) {
    return {
        deviceId: getOrCreateDeviceId(),
        sequenceNum: nextSyncSequence(userId, type),
        roleSnapshot: getRoleSnapshot(),
    };
}

function getScopedDataKey(baseKey, userId = activeDataUserId) {
    return userId ? `${baseKey}:${userId}` : baseKey;
}

function migrateLegacyDataStorage(userId) {
    if (!userId) return;

    const scopedBases = [
        STORAGE_KEY,
        STASE_KEY,
        PINNED_KEY,
        DELETED_PATIENTS_KEY,
        DELETED_STASES_KEY,
    ];

    for (const baseKey of scopedBases) {
        const scopedKey = getScopedDataKey(baseKey, userId);
        const scopedValue = localStorage.getItem(scopedKey);
        const legacyValue = localStorage.getItem(baseKey);

        if (scopedValue == null && legacyValue != null) {
            localStorage.setItem(scopedKey, legacyValue);
        }

        // Remove legacy global key so it cannot leak to another user session.
        localStorage.removeItem(baseKey);
    }
}

export function setDataStorageScope(userId) {
    activeDataUserId = userId || null;
    migrateLegacyDataStorage(activeDataUserId);
    setPendingSyncScope(activeDataUserId);
}

function getStoredData() {
    try {
        const data = localStorage.getItem(getScopedDataKey(STORAGE_KEY));
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

function getDeletedState(key) {
    try {
        return JSON.parse(localStorage.getItem(getScopedDataKey(key)) || '{}');
    } catch {
        return {};
    }
}

function recordDeletion(id, key) {
    const deleted = getDeletedState(key);
    deleted[id] = new Date().toISOString();
    localStorage.setItem(getScopedDataKey(key), JSON.stringify(deleted));
}

function saveData(patients) {
    localStorage.setItem(getScopedDataKey(STORAGE_KEY), JSON.stringify(patients));
}

function getScheduleDeletedKey(userId = activeScheduleUserId) {
    return userId ? `${DELETED_SCHEDULES_KEY}:${userId}` : DELETED_SCHEDULES_KEY;
}

function getDeletedSchedulesState() {
    try {
        return JSON.parse(localStorage.getItem(getScheduleDeletedKey()) || '{}');
    } catch {
        return {};
    }
}

function recordScheduleDeletion(id) {
    const deleted = getDeletedSchedulesState();
    deleted[id] = new Date().toISOString();
    localStorage.setItem(getScheduleDeletedKey(), JSON.stringify(deleted));
}

function clearScheduleDeletionForIds(ids = []) {
    const deleted = getDeletedSchedulesState();
    let changed = false;
    for (const id of ids) {
        if (id && deleted[id]) {
            delete deleted[id];
            changed = true;
        }
    }
    if (changed) {
        localStorage.setItem(getScheduleDeletedKey(), JSON.stringify(deleted));
    }
}

function clearAllScheduleDeletionState() {
    localStorage.removeItem(getScheduleDeletedKey());
}

// ----- Per-item merge helper (shared by patients & stases foreground sync) -----
function getItemTimestamp(item) {
    const source = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at;
    const parsed = source ? Date.parse(source) : Number.NaN;
    if (!Number.isFinite(parsed)) return 0;

    // Guard against extreme client clock skew (future timestamps dominating merge forever).
    const now = Date.now();
    const maxFutureSkewMs = 5 * 60 * 1000;
    if (parsed > (now + maxFutureSkewMs)) {
        return now;
    }

    return parsed;
}

function mergeItemsByIdForeground(localItems, serverItems, serverUpdatedAtStr, deletedKey) {
    const serverTimestamp = serverUpdatedAtStr ? Date.parse(serverUpdatedAtStr) : 0;
    const serverMap = new Map();
    for (const item of serverItems) {
        if (item?.id) serverMap.set(item.id, item);
    }
    const merged = [];
    const mergedIds = new Set();

    for (const local of localItems) {
        if (!local?.id) { merged.push(local); continue; }

        const server = serverMap.get(local.id);
        const localTs = getItemTimestamp(local);

        if (!server) {
            if (serverTimestamp > 0 && localTs < serverTimestamp) {
                continue; // Deleted on another device
            }
            merged.push(local);
            mergedIds.add(local.id);
            continue;
        }

        const serverTs = getItemTimestamp(server);
        merged.push(serverTs > localTs ? server : local);
        mergedIds.add(local.id);
    }

    const deletedMap = deletedKey ? getDeletedState(deletedKey) : {};
    for (const server of serverItems) {
        if (!server?.id || mergedIds.has(server.id)) continue;
        
        // Tombstone check: If it's on server but deleted locally, keep it deleted IF our tombstone is newer
        const serverTs = getItemTimestamp(server);
        const localDeleteTs = deletedMap[server.id] ? Date.parse(deletedMap[server.id]) : 0;
        
        if (localDeleteTs > serverTs) {
            continue; // Keep it deleted
        }
        
        merged.push(server);
    }
    return merged;
}

// ----- Supabase Sync Functions -----
export async function syncToSupabase(userId) {
    if (!userId) return;
    setDataStorageScope(userId);
    const localPatients = getStoredData();
    const syncMeta = buildSyncMetadata(userId, 'patients');
    await enqueue({
        type: 'patients',
        op: 'upsert',
        userId,
        payload: { patients_data: localPatients },
        ...syncMeta,
    }).catch((err) => {
        logSyncWarning('patients.enqueue', userId, err);
    });
    
    try {
        const { data: serverRow } = await supabase
            .from('user_patients')
            .select('patients_data, updated_at')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        const serverPatients = Array.isArray(serverRow?.patients_data) ? serverRow.patients_data : [];
        const finalPatients = serverRow
            ? mergeItemsByIdForeground(localPatients, serverPatients, serverRow.updated_at, DELETED_PATIENTS_KEY)
            : localPatients;

        const { error } = await supabase.from('user_patients').upsert({
            user_id: userId,
            patients_data: finalPatients,
            updated_at: new Date().toISOString(),
            _device_id: syncMeta.deviceId,
            _sequence: syncMeta.sequenceNum,
        });
        
        if (error) throw error;
        saveData(finalPatients);
        pendingSync.clearPatients();
        clearQueueByType(userId, 'patients').catch((err) => {
            logSyncWarning('patients.clearQueueByType', userId, err);
        });
    } catch (err) {
        const errorMessage = String(err?.message || '');
        const deniedByRls = /row-level security|violates row-level security/i.test(errorMessage);
        if (deniedByRls && localPatients.length > 2) {
            console.error('Patients sync blocked by server policy: patient limit exceeded for current role.', {
                userId,
                patientCount: localPatients.length,
            });
        } else {
            console.error("Failed to sync Patients to Supabase:", err);
        }
        pendingSync.markPatients();
        throw err;
    }
}

export async function deleteAllPatientsData(userId) {
    if (userId) {
        setDataStorageScope(userId);
    }
    // 1. Wipe local cache
    localStorage.removeItem(getScopedDataKey(STORAGE_KEY));
    localStorage.removeItem(getScopedDataKey(DELETED_PATIENTS_KEY));
    pendingSync.clearPatients();
    // 2. Perform the remote reset by upserting an empty array instead of deleting the row.
    // This ensures other devices see an "empty but newer" state.
    if (userId) {
        try {
            await clearQueueByType(userId, 'patients').catch((err) => {
                logSyncWarning('patients.reset.clearQueueByType', userId, err);
            });
            const { error } = await supabase.from('user_patients').upsert({
                user_id: userId,
                patients_data: [],
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
        } catch (err) {
            console.error('Failed to reset patients on Supabase:', err);
            throw err;
        }
    }
}

export async function fetchFromSupabase(userId) {
    if (!userId) {
        setDataStorageScope(null);
        return getStoredData();
    }
    setDataStorageScope(userId);
    try {
        const { data } = await supabase
            .from('user_patients')
            .select('patients_data, updated_at')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        if (data) {
            const serverPatients = Array.isArray(data.patients_data) ? data.patients_data : [];
            const localPatients = getStoredData();

            if (pendingSync.hasPatients() && localPatients.length > 0) {
                const merged = mergeItemsByIdForeground(localPatients, serverPatients, data.updated_at, DELETED_PATIENTS_KEY);
                saveData(merged);
                return merged;
            }

            saveData(serverPatients);
            return serverPatients;
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
        const data = localStorage.getItem(getScopedDataKey(STASE_KEY));
        return data ? JSON.parse(data) : [];
    } catch {
        return [];
    }
}

function saveStases(stases) {
    localStorage.setItem(getScopedDataKey(STASE_KEY), JSON.stringify(stases));
}

export function getPinnedStaseId() {
    return localStorage.getItem(getScopedDataKey(PINNED_KEY)) || null;
}

export function setPinnedStaseId(id) {
    if (id === null) {
        localStorage.removeItem(getScopedDataKey(PINNED_KEY));
    } else {
        localStorage.setItem(getScopedDataKey(PINNED_KEY), id);
    }
}

// ----- Stase Supabase Sync -----
export async function syncStasesToSupabase(userId) {
    if (!userId) return;
    setDataStorageScope(userId);
    const localStases = getStoredStases();
    const pinnedStaseId = getPinnedStaseId();
    
    const syncMeta = buildSyncMetadata(userId, 'stases');
    await enqueue({
        type: 'stases',
        op: 'upsert',
        userId,
        payload: { stases_data: localStases, pinned_stase_id: pinnedStaseId },
        ...syncMeta,
    }).catch((err) => {
        logSyncWarning('stases.enqueue', userId, err);
    });
    
    try {
        const { data: serverRow } = await supabase
            .from('user_stases')
            .select('stases_data, pinned_stase_id, updated_at')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        const serverStases = Array.isArray(serverRow?.stases_data) ? serverRow.stases_data : [];
        const finalStases = serverRow
            ? mergeItemsByIdForeground(localStases, serverStases, serverRow.updated_at, DELETED_STASES_KEY)
            : localStases;

        let finalPinned = pinnedStaseId;
        if (serverRow) {
            const serverTs = serverRow.updated_at ? Date.parse(serverRow.updated_at) : 0;
            if (serverTs > 0 && serverRow.pinned_stase_id !== undefined) {
                finalPinned = serverRow.pinned_stase_id;
            }
        }
        if (finalPinned && !finalStases.some(s => s.id === finalPinned)) {
            finalPinned = null;
        }

        const { error } = await supabase.from('user_stases').upsert({
            user_id: userId,
            stases_data: finalStases,
            pinned_stase_id: finalPinned,
            updated_at: new Date().toISOString(),
            _device_id: syncMeta.deviceId,
            _sequence: syncMeta.sequenceNum,
        });
        
        if (error) throw error;
        saveStases(finalStases);
        setPinnedStaseId(finalPinned);
        pendingSync.clearStases();
        clearQueueByType(userId, 'stases').catch((err) => {
            logSyncWarning('stases.clearQueueByType', userId, err);
        });
    } catch (err) {
        console.error("Failed to sync stases to Supabase:", err);
        pendingSync.markStases();
        throw err;
    }
}

export async function fetchStasesFromSupabase(userId) {
    if (!userId) {
        setDataStorageScope(null);
        return { stases: getStoredStases(), pinnedStaseId: getPinnedStaseId() };
    }
    setDataStorageScope(userId);
    try {
        const { data } = await supabase
            .from('user_stases')
            .select('stases_data, pinned_stase_id, updated_at')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        if (data) {
            const serverStases = Array.isArray(data.stases_data) ? data.stases_data : [];
            const localStases = getStoredStases();

            if (pendingSync.hasStases() && localStases.length > 0) {
                const merged = mergeItemsByIdForeground(localStases, serverStases, data.updated_at, DELETED_STASES_KEY);
                saveStases(merged);
                const pinned = data.pinned_stase_id || getPinnedStaseId();
                const validPinned = pinned && merged.some(s => s.id === pinned) ? pinned : null;
                setPinnedStaseId(validPinned);
                return { stases: merged, pinnedStaseId: validPinned };
            }

            saveStases(serverStases);
            setPinnedStaseId(data.pinned_stase_id || null);
            return { stases: serverStases, pinnedStaseId: data.pinned_stase_id || null };
        }
    } catch (err) {
        console.error("Failed to fetch stases from Supabase:", err);
    }
    return { stases: getStoredStases(), pinnedStaseId: getPinnedStaseId() };
}

export async function deleteAllStasesData(userId) {
    if (userId) {
        setDataStorageScope(userId);
    }
    saveStases([]);
    setPinnedStaseId(null);
    localStorage.removeItem(getScopedDataKey(DELETED_STASES_KEY));
    pendingSync.clearStases();
    if (userId) {
        try {
            await clearQueueByType(userId, 'stases').catch((err) => {
                logSyncWarning('stases.reset.clearQueueByType', userId, err);
            });
            const { error } = await supabase.from('user_stases').upsert({
                user_id: userId,
                stases_data: [],
                pinned_stase_id: null,
                updated_at: new Date().toISOString()
            });
            if (error) throw error;
        } catch (err) {
            console.error('Failed to reset stases on Supabase:', err);
            throw err;
        }
    }
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
    stases[index] = { ...stases[index], ...updates, updatedAt: new Date().toISOString() };
    saveStases(stases);
    return stases[index];
}

export function deleteStase(id) {
    // Remove the stase
    const stases = getStoredStases();
    const filteredSorted = stases.filter(s => s.id !== id);
    saveStases(filteredSorted);
    recordDeletion(id, DELETED_STASES_KEY); // Record tombstone
    if (typeof pendingSync !== 'undefined' && pendingSync.markStases) {
        pendingSync.markStases();
    }

    // Also delete all patients belonging to this stase
    const patients = getStoredData();
    const cascadeDeletedPatients = patients.filter((p) => p.stase_id === id);
    const remainingPatients = patients.filter(p => p.stase_id !== id);
    const hadCascadeDeletes = remainingPatients.length !== patients.length;
    saveData(remainingPatients);
    for (const patient of cascadeDeletedPatients) {
        if (patient?.id) {
            recordDeletion(patient.id, DELETED_PATIENTS_KEY);
        }
    }
    if (hadCascadeDeletes && typeof pendingSync !== 'undefined' && pendingSync.markPatients) {
        pendingSync.markPatients();
    }

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

/**
 * Replace entire patient list locally and mark as dirty for sync.
 * This is used for imports to avoid race conditions with remote sync.
 */
export function bulkSavePatients(patients) {
    saveData(patients);
    if (typeof pendingSync !== 'undefined' && pendingSync.markPatients) {
        pendingSync.markPatients();
    }
}

/**
 * Replace entire stase list locally and mark as dirty for sync.
 */
export function bulkSaveStases(stases) {
    localStorage.setItem(getScopedDataKey(STASE_KEY), JSON.stringify(stases));
    if (typeof pendingSync !== 'undefined' && pendingSync.markStases) {
        pendingSync.markStases();
    }
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
    if (typeof pendingSync !== 'undefined' && pendingSync.markPatients) {
        pendingSync.markPatients();
    }
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
    if (typeof pendingSync !== 'undefined' && pendingSync.markPatients) {
        pendingSync.markPatients();
    }
    return patients[index];
}

export function deletePatient(id) {
    const patients = getStoredData();
    const filtered = patients.filter(p => p.id !== id);
    saveData(filtered);
    recordDeletion(id, DELETED_PATIENTS_KEY); // Record tombstone for sync
    if (typeof pendingSync !== 'undefined' && pendingSync.markPatients) {
        pendingSync.markPatients();
    }
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
function readSchedulesFromKey(key) {
    try {
        const data = localStorage.getItem(key);
        if (!data) return [];
        const purged = parseStoredSchedules(data);
        if (JSON.stringify(purged) !== data) {
            localStorage.setItem(key, JSON.stringify(purged));
        }
        return purged;
    } catch {
        return [];
    }
}

function migrateLegacySchedules(userId) {
    if (!userId) return;
    const scopedKey = getScheduleStorageKey(userId);
    if (localStorage.getItem(scopedKey)) return;
    
    const legacyKey = getScheduleStorageKey();
    const legacyData = localStorage.getItem(legacyKey);
    if (!legacyData) return;
    
    const legacySchedules = readSchedulesFromKey(legacyKey);
    if (legacySchedules.length > 0) {
        localStorage.setItem(scopedKey, JSON.stringify(legacySchedules));
    }

    const scopedDeletedKey = getScheduleDeletedKey(userId);
    if (!localStorage.getItem(scopedDeletedKey)) {
        const legacyDeleted = localStorage.getItem(DELETED_SCHEDULES_KEY);
        if (legacyDeleted) {
            localStorage.setItem(scopedDeletedKey, legacyDeleted);
        }
    }
    
    // Prevent this legacy data from leaking to subsequent new users
    localStorage.removeItem(legacyKey);
    localStorage.removeItem(DELETED_SCHEDULES_KEY);
}

export function setScheduleStorageScope(userId) {
    activeScheduleUserId = userId || null;
    migrateLegacySchedules(activeScheduleUserId);
}

function getStoredSchedules() {
    return readSchedulesFromKey(getScheduleStorageKey(activeScheduleUserId));
}

function saveSchedules(schedules) {
    localStorage.setItem(getScheduleStorageKey(activeScheduleUserId), JSON.stringify(schedules));
}

export function clearSchedulesCache() {
    localStorage.removeItem(getScheduleStorageKey(activeScheduleUserId));
}

export async function syncSchedulesToSupabase(userId) {
    if (!userId) return;
    setScheduleStorageScope(userId);
    const localSchedules = getStoredSchedules();
    const deletedSchedulesState = getDeletedSchedulesState();
    
    // Enqueue for background retry
    const syncMeta = buildSyncMetadata(userId, 'schedules');
    await enqueue({
        type: 'schedules',
        op: 'upsert',
        userId,
        payload: {
            schedules_data: localSchedules,
            deleted_schedules_state: deletedSchedulesState,
        },
        ...syncMeta,
    }).catch((err) => {
        logSyncWarning('schedules.enqueue', userId, err);
    });
    
    try {
        // 1. Fetch current server state to avoid blind overwrite
        const { data: serverRow } = await supabase
            .from('user_schedules')
            .select('schedules_data, updated_at')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        // 2. Perform reconciled merge
        const merged = mergeSchedules(
            localSchedules,
            serverRow?.schedules_data || [],
            serverRow?.updated_at,
            deletedSchedulesState,
        );

        // 3. Push merged state
        const { error } = await supabase.from('user_schedules').upsert({
            user_id: userId,
            schedules_data: merged,
            updated_at: new Date().toISOString(),
            _device_id: syncMeta.deviceId,
            _sequence: syncMeta.sequenceNum,
        });
        
        if (error) throw error;
        
        saveSchedules(merged); // Update local with merged result
        // Clear deletion state only for schedules that were successfully merged back (non-deleted)
        const mergedIds = (merged || []).map(s => s?.id).filter(Boolean);
        if (mergedIds.length > 0) {
            clearScheduleDeletionForIds(mergedIds);
        }
        pendingSync.clearSchedules();
        clearQueueByType(userId, 'schedules').catch((err) => {
            logSyncWarning('schedules.clearQueueByType', userId, err);
        });
    } catch (err) {
        console.error('Failed to sync schedules to Supabase:', err);
        pendingSync.markSchedules();
        throw err;
    }
}

export async function fetchSchedulesFromSupabase(userId) {
    if (!userId) return getStoredSchedules();
    setScheduleStorageScope(userId);
    const localSchedules = getStoredSchedules();

    try {
        const { data } = await supabase
            .from('user_schedules')
            .select('schedules_data, updated_at')
            .eq('user_id', userId)
            .limit(1)
            .maybeSingle();

        const serverSchedules = Array.isArray(data?.schedules_data)
            ? purgeExpiredSchedules(data.schedules_data)
            : [];

        const mergedWithDeletions = mergeSchedules(
            localSchedules,
            serverSchedules,
            data?.updated_at,
            getDeletedSchedulesState(),
        );

        saveSchedules(mergedWithDeletions);
        
        if (
            !data && localSchedules.length > 0
        ) {
            syncSchedulesToSupabase(userId).catch((err) => {
                logSyncWarning('schedules.fetch.autoSync.missingRemoteRow', userId, err);
            });
        } else if (
            (Array.isArray(data?.schedules_data) && serverSchedules.length !== data.schedules_data.length)
            || schedulesDiffer(serverSchedules, mergedWithDeletions)
        ) {
            syncSchedulesToSupabase(userId).catch((err) => {
                logSyncWarning('schedules.fetch.autoSync.reconcile', userId, err);
            });
        }

        return mergedWithDeletions;
    } catch (err) {
        console.error('Failed to fetch schedules from Supabase:', err);
    }
    return localSchedules;
}

export function getAllSchedules() {
    return getStoredSchedules();
}

export function addSchedule(schedule) {
    const schedules = getStoredSchedules();
    const nowIso = new Date().toISOString();
    const newSchedule = {
        ...schedule,
        id: crypto.randomUUID(),
        createdAt: nowIso,
        updatedAt: nowIso,
    };
    schedules.push(newSchedule);
    saveSchedules(schedules);
    return newSchedule;
}

export function updateSchedule(id, updates) {
    const schedules = getStoredSchedules();
    const index = schedules.findIndex(s => s.id === id);
    if (index === -1) return null;
    schedules[index] = { ...schedules[index], ...updates, updatedAt: new Date().toISOString() };
    saveSchedules(schedules);
    return schedules[index];
}

export function deleteSchedule(id) {
    const schedules = getStoredSchedules();
    const exists = schedules.some((s) => s.id === id);
    saveSchedules(schedules.filter(s => s.id !== id));
    if (exists) {
        recordScheduleDeletion(id);
        pendingSync.markSchedules();
    }
    return true;
}

export function upsertSchedulesBulk(importedSchedules = []) {
    const schedules = getStoredSchedules();
    const byId = new Map(schedules.map(item => [item.id, item]));

    importedSchedules.forEach(item => {
        if (!item || typeof item !== 'object') return;
        const id = typeof item.id === 'string' && item.id.trim() ? item.id.trim() : crypto.randomUUID();
        const existing = byId.get(id);
        clearScheduleDeletionForIds([id]);
        byId.set(id, {
            ...existing,
            ...item,
            id,
            createdAt: item.createdAt || existing?.createdAt || new Date().toISOString(),
            updatedAt: item.updatedAt || item.updated_at || existing?.updatedAt || existing?.updated_at || new Date().toISOString(),
        });
    });

    const merged = Array.from(byId.values());
    saveSchedules(merged);
    if (importedSchedules.length > 0) {
        pendingSync.markSchedules();
    }
    return merged;
}

export async function deleteAllSchedulesData(userId) {
    saveSchedules([]);
    clearAllScheduleDeletionState();
    if (!userId) {
        pendingSync.clearSchedules();
        return;
    }
    try {
        // 1. Clear IndexedDB queue to stop pending syncs from overwriting the reset
        await clearQueueByType(userId, 'schedules').catch((err) => {
            logSyncWarning('schedules.reset.clearQueueByType', userId, err);
        });
        pendingSync.clearSchedules();
        
        // 2. Perform the remote reset by upserting an empty array instead of deleting the row.
        // This ensures other devices see an "empty but newer" state and clear their local cache.
        const { error } = await supabase.from('user_schedules').upsert({
            user_id: userId,
            schedules_data: [],
            updated_at: new Date().toISOString(),
        });
        if (error) throw error;
    } catch (err) {
        console.error('Failed to reset schedules on Supabase:', err);
        throw err;
    }
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

        // Terima berbagai format umum:
        // 1. Dx - Probabilitas: Tinggi
        // 1) Dx (Tinggi)
        // - Dx - kemungkinan sedang
        // Dx: ... | Probabilitas tinggi
        const match = cleanLine.match(
            /^(?:[-*]\s*)?(?:\d+[.)]\s*)?(.+?)(?:\s*-\s*Probabilitas\s*:?\s*(Tinggi|Sedang|Rendah)|\s*\((Tinggi|Sedang|Rendah)\)|\s*-\s*(?:kemungkinan\s*)?(Tinggi|Sedang|Rendah))\b/i
        );

        if (match) {
            const rawName = match[1].trim();
            const probText = (match[2] || match[3] || match[4] || '').toLowerCase();

            if (!rawName || !probText) continue;

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

export function getComprehensiveTemplate() {
    return [
        {
            "id": crypto.randomUUID(),
            "name": "Template Pasien Super Komprehensif",
            "age": 45,
            "gender": "male",
            "room": "Anggrek - Bed 1",
            "bloodType": "B",
            "rhesus": "+",
            "admissionDate": new Date().toISOString().split('T')[0],
            "targetDays": 7,
            "status": "active",
            "condition": "stable",
            "chiefComplaint": "Pasien datang dengan keluhan sesak napas dan demam tinggi sejak 2 hari yang lalu.",
            "diagnosis": "Community-Acquired Pneumonia (J18.9)\nDiabetes Mellitus Type 2 (E11.9)",
            "allergies": "Amoxicillin (Rash), Seafood (Gatal-gatal)",
            "medicalHistory": "Hipertensi Terkontrol (5 tahun), DM Type 2 (3 tahun)",
            "heartRate": "92",
            "bloodPressure": "120/80",
            "temperature": "38.2",
            "respRate": "24",
            "spO2": "95",
            "weight": "70",
            "height": "170",
            "symptoms": [
                { "id": crypto.randomUUID(), "name": "Sesak Napas", "severity": "sedang", "notes": "Bertambah berat saat aktivitas, membaik dengan istirahat.", "recordedAt": new Date().toISOString() },
                { "id": crypto.randomUUID(), "name": "Batuk Produktif", "severity": "sedang", "notes": "Sputum berwarna kuning kehijauan, kental.", "recordedAt": new Date().toISOString() },
                { "id": crypto.randomUUID(), "name": "Demam", "severity": "berat", "notes": "Suhu naik turun, menggigil (+), berkeringat malam (+).", "recordedAt": new Date().toISOString() }
            ],
            "physicalExams": [
                { "id": crypto.randomUUID(), "system": "umum", "findings": "Kesan sakit sedang, Compos Mentis, GCS 15 (E4V5M6), Status gizi cukup.", "date": new Date().toISOString() },
                { "id": crypto.randomUUID(), "system": "kepala", "findings": "Mata: CA (-/-), SI (-/-). Mulut: Mukosa bibir kering (-), Sianosis (-).", "date": new Date().toISOString() },
                { "id": crypto.randomUUID(), "system": "thorax", "findings": "Paru: Simetris, Retraksi (-). Suara napas Vesikuler (+/+), Rhonki basah halus basal dextra (+), Wheezing (-/-). Jantung: BJ I-II murni reguler, Murmur (-), Gallop (-).", "date": new Date().toISOString() },
                { "id": crypto.randomUUID(), "system": "abdomen", "findings": "Datar, Supel, BU (+) normal, Nyeri tekan epigastrium (-), Hepar/Lien tak teraba.", "date": new Date().toISOString() },
                { "id": crypto.randomUUID(), "system": "ekstremitas", "findings": "Akral hangat, CRT < 2 detik, Edema pretibial (-/-).", "date": new Date().toISOString() }
            ],
            "supportingExams": [
                { "id": crypto.randomUUID(), "type": "lab", "testName": "Hemoglobin", "value": "13.5", "unit": "g/dL", "labKey": "hb", "date": new Date().toISOString(), "result": { "status": "normal", "label": "✓ Normal" } },
                { "id": crypto.randomUUID(), "type": "lab", "testName": "Leukosit", "value": "15600", "unit": "/uL", "labKey": "leukosit", "date": new Date().toISOString(), "result": { "status": "high", "label": "↑ Tinggi" } },
                { "id": crypto.randomUUID(), "type": "lab", "testName": "Gula Darah Sewaktu", "value": "210", "unit": "mg/dL", "labKey": "gdSewaktu", "date": new Date().toISOString(), "result": { "status": "high", "label": "↑ Tinggi" } },
                { "id": crypto.randomUUID(), "type": "radiology", "testName": "Foto Thorax PA", "value": "Infiltrat di basal paru kanan, kesan Pneumonia.", "unit": "-", "date": new Date().toISOString(), "result": { "status": "abnormal", "label": "⚠ Abnormal" } }
            ],
            "prescriptions": [
                { "id": crypto.randomUUID(), "name": "Levofloxacin", "dosage": "750mg", "frequency": "1x/hari", "route": "iv", "fornas_source": true, "fornas_category": "Antibakteri", "date": new Date().toISOString() },
                { "id": crypto.randomUUID(), "name": "Paracetamol", "dosage": "500mg", "frequency": "3x/hari (KP)", "route": "oral", "fornas_source": true, "fornas_category": "Analgetik Antipiretik", "date": new Date().toISOString() },
                { "id": crypto.randomUUID(), "name": "Metformin", "dosage": "500mg", "frequency": "2x/hari", "route": "oral", "fornas_source": true, "fornas_category": "Antidiabetik Oral", "date": new Date().toISOString() }
            ],
            "dailyReports": [
                { "id": crypto.randomUUID(), "notes": "Pasien merasa sedikit lebih nyaman, namun sesak masih dirasakan saat berubah posisi. Demam mulai turun setelah pemberian antipiretik.", "condition": "stabil", "recordedAt": new Date().toISOString() }
            ],
            "vitalSigns": [
                {
                    "id": crypto.randomUUID(),
                    "recordedAt": new Date(Date.now() - 3600000).toISOString(),
                    "heartRate": "98",
                    "bloodPressure": "130/85",
                    "temperature": "38.8",
                    "respRate": "26",
                    "spO2": "94"
                },
                {
                    "id": crypto.randomUUID(),
                    "recordedAt": new Date().toISOString(),
                    "heartRate": "92",
                    "bloodPressure": "120/80",
                    "temperature": "38.2",
                    "respRate": "24",
                    "spO2": "95"
                }
            ]
        }
    ];
}
