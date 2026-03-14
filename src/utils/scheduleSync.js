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

export function mergeSchedules(localSchedules = [], serverSchedules = []) {
    const localIds = new Set();
    const merged = [];

    localSchedules.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        merged.push(item);
        if (typeof item.id === 'string' && item.id.trim()) localIds.add(item.id.trim());
    });

    serverSchedules.forEach((item) => {
        if (!item || typeof item !== 'object') return;
        const itemId = typeof item.id === 'string' ? item.id.trim() : '';
        if (itemId && localIds.has(itemId)) return;
        merged.push(item);
        if (itemId) localIds.add(itemId);
    });

    return merged;
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
