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

export function mergeSchedules(localSchedules = [], serverSchedules = []) {
    const mergedById = new Map();
    const mergedWithoutId = [];

    localSchedules.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = normalizedScheduleId(item);
        if (!id) {
            mergedWithoutId.push(item);
            return;
        }
        mergedById.set(id, item);
    });

    serverSchedules.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const id = normalizedScheduleId(item);
        if (!id) {
            mergedWithoutId.push(item);
            return;
        }
        const localItem = mergedById.get(id);
        if (!localItem) {
            mergedById.set(id, item);
            return;
        }

        const localTs = getScheduleTimestamp(localItem);
        const serverTs = getScheduleTimestamp(item);
        if (serverTs > localTs) mergedById.set(id, item);
    });

    return [...mergedById.values(), ...mergedWithoutId];
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
