const SCHEDULE_KEY = 'medterminal_schedules';

export function getScheduleStorageKey(userId = null) {
    return userId ? `${SCHEDULE_KEY}:${userId}` : SCHEDULE_KEY;
}

export function purgeExpiredSchedules(schedules = []) {
    const cutoff = new Date();
    cutoff.setDate(cutoff.getDate() - 30);
    const cutoffStr = `${cutoff.getFullYear()}-${String(cutoff.getMonth() + 1).padStart(2, '0')}-${String(cutoff.getDate()).padStart(2, '0')}`;
    return schedules.filter(s => s?.date >= cutoffStr);
}

export function parseStoredSchedules(data) {
    if (!data) return [];
    const parsed = JSON.parse(data);
    if (!Array.isArray(parsed)) return [];
    return purgeExpiredSchedules(parsed);
}

function normalizedScheduleId(item) {
    if (!item || typeof item !== 'object' || typeof item.id !== 'string') return '';
    return item.id.trim();
}

function getScheduleTimestamp(item) {
    const source = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at;
    const parsed = source ? Date.parse(source) : Number.NaN;
    return Number.isFinite(parsed) ? parsed : 0;
}

function parseServerTimestamp(value) {
    if (!value) return 0;
    const parsed = Date.parse(value);
    return Number.isFinite(parsed) ? parsed : 0;
}

/**
 * Merges local and server schedules.
 * If serverUpdatedAt is provided, it handles deletions: items in local but not 
 * in server are removed if their updatedAt is before serverUpdatedAt.
 */
export function mergeSchedules(localSchedules = [], serverSchedules = [], serverUpdatedAt = null) {
    const mergedById = new Map();
    const serverTimestamp = parseServerTimestamp(serverUpdatedAt);
    const serverIds = new Set(serverSchedules.map(s => normalizedScheduleId(s)).filter(Boolean));

    // 1. Process Local Schedules
    localSchedules.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = normalizedScheduleId(item);
        if (!id) return; // Ignore items without ID in this logic or handle separately

        const localTs = getScheduleTimestamp(item);

        // Deletion Check: If it's NOT in server, was it deleted or is it just new?
        if (serverTimestamp > 0 && !serverIds.has(id)) {
            // Server row is newer than local item last touch.
            // AND server doesn't have it. -> It was likely deleted on another device.
            if (localTs < serverTimestamp) {
                return; // DROP from local (Delete Sync)
            }
        }
        
        mergedById.set(id, item);
    });

    // 2. Process Server Schedules
    serverSchedules.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = normalizedScheduleId(item);
        if (!id) return;

        const localItem = mergedById.get(id);
        if (!localItem) {
            mergedById.set(id, item);
            return;
        }

        const localTs = getScheduleTimestamp(localItem);
        const serverTs = getScheduleTimestamp(item);
        if (serverTs > localTs) {
            mergedById.set(id, item);
        }
    });

    // Handle items without IDs (fallback)
    const localWithoutId = localSchedules.filter(s => !normalizedScheduleId(s));
    const serverWithoutId = serverSchedules.filter(s => !normalizedScheduleId(s));

    return [...mergedById.values(), ...localWithoutId, ...serverWithoutId];
}

function normalizeScheduleForCompare(item) {
    if (!item || typeof item !== 'object') return '';
    return JSON.stringify(Object.keys(item).sort().reduce((acc, key) => {
        acc[key] = item[key];
        return acc;
    }, {}));
}

export function schedulesDiffer(first = [], second = []) {
    if (first.length !== second.length) return true;
    const left = first.map(normalizeScheduleForCompare).sort();
    const right = second.map(normalizeScheduleForCompare).sort();
    return left.some((value, index) => value !== right[index]);
}
