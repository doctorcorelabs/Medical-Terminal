function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function ensureObjectArray(value) {
    return asArray(value).filter(item => item && typeof item === 'object');
}

function toText(value) {
    return typeof value === 'string' ? value.trim() : '';
}

function isValidDateOnly(value) {
    return /^\d{4}-\d{2}-\d{2}$/.test(toText(value));
}

function normalizePatient(item) {
    const name = toText(item?.name);
    const id = toText(item?.id);
    if (!name && !id) return null;
    return { ...item };
}

function normalizeStase(item) {
    const name = toText(item?.name);
    const id = toText(item?.id);
    if (!name && !id) return null;
    return { ...item };
}

function normalizeSchedule(item) {
    const title = toText(item?.title);
    const date = toText(item?.date);
    if (!title || !isValidDateOnly(date)) return null;
    return { ...item };
}

function normalizeItems(items, normalizer) {
    const valid = [];
    let invalidCount = 0;

    for (const item of ensureObjectArray(items)) {
        const normalized = normalizer(item);
        if (normalized) {
            valid.push(normalized);
        } else {
            invalidCount += 1;
        }
    }

    return { valid, invalidCount };
}

export function parseBackupPayload(raw) {
    // Legacy v1: top-level patient array
    if (Array.isArray(raw)) {
        return {
            version: 1,
            patients: ensureObjectArray(raw),
            stases: [],
            schedules: [],
        };
    }

    // Soft-compatible object shape: { patients, stases, schedules }
    if (raw && typeof raw === 'object' && Array.isArray(raw.patients)) {
        return {
            version: Number(raw.version) || 1,
            patients: ensureObjectArray(raw.patients),
            stases: ensureObjectArray(raw.stases),
            schedules: ensureObjectArray(raw.schedules),
        };
    }

    // v2 shape: { version, data: { patients, stases, schedules } }
    if (raw && typeof raw === 'object' && raw.data && typeof raw.data === 'object' && Array.isArray(raw.data.patients)) {
        return {
            version: Number(raw.version) || 2,
            patients: ensureObjectArray(raw.data.patients),
            stases: ensureObjectArray(raw.data.stases),
            schedules: ensureObjectArray(raw.data.schedules),
        };
    }

    throw new Error('Unsupported backup format');
}

export function validateBackupPayload(parsed) {
    const patients = normalizeItems(parsed?.patients, normalizePatient);
    const stases = normalizeItems(parsed?.stases, normalizeStase);
    const schedules = normalizeItems(parsed?.schedules, normalizeSchedule);

    return {
        version: Number(parsed?.version) || 1,
        patients: patients.valid,
        stases: stases.valid,
        schedules: schedules.valid,
        invalid: {
            patients: patients.invalidCount,
            stases: stases.invalidCount,
            schedules: schedules.invalidCount,
        },
        totalInvalid: patients.invalidCount + stases.invalidCount + schedules.invalidCount,
    };
}

export function buildBackupPayload({ patients, stases, schedules, userId }) {
    return {
        version: 2,
        exportedAt: new Date().toISOString(),
        source: 'medical-terminal',
        userId: userId || null,
        data: {
            patients: ensureObjectArray(patients),
            stases: ensureObjectArray(stases),
            schedules: ensureObjectArray(schedules),
        },
    };
}
