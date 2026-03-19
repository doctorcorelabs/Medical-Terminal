export const WIB_TIMEZONE = 'Asia/Jakarta';

function isValidDateParts(year, month, day) {
    if (!Number.isInteger(year) || !Number.isInteger(month) || !Number.isInteger(day)) return false;
    if (month < 1 || month > 12 || day < 1 || day > 31) return false;
    const d = new Date(Date.UTC(year, month - 1, day));
    return d.getUTCFullYear() === year && (d.getUTCMonth() + 1) === month && d.getUTCDate() === day;
}

function isValidTimeParts(hour, minute) {
    if (!Number.isInteger(hour) || !Number.isInteger(minute)) return false;
    return hour >= 0 && hour <= 23 && minute >= 0 && minute <= 59;
}

// Convert WIB local date/time to UTC Date object.
export function localDateTimeToUtcWib(dateStr, timeStr) {
    if (typeof dateStr !== 'string' || typeof timeStr !== 'string') return null;

    const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
    const timeMatch = timeStr.match(/^(\d{2}):(\d{2})$/);
    if (!dateMatch || !timeMatch) return null;

    const year = Number(dateMatch[1]);
    const month = Number(dateMatch[2]);
    const day = Number(dateMatch[3]);
    const hour = Number(timeMatch[1]);
    const minute = Number(timeMatch[2]);

    if (!isValidDateParts(year, month, day) || !isValidTimeParts(hour, minute)) return null;

    return new Date(Date.UTC(year, month - 1, day, hour - 7, minute, 0, 0));
}

export function buildScheduleIdempotencyKey(userId, eventId, eventDate, eventTime, reminderMinutes) {
    return `schedule:${userId}:${eventId}:${eventDate}:${eventTime}:${reminderMinutes}`;
}

// Keep manual-test rows and keep rows that still exist in active schedule keys.
export function computeStaleScheduleQueueIds(existingRows, activeKeys) {
    const rows = Array.isArray(existingRows) ? existingRows : [];
    const active = activeKeys instanceof Set ? activeKeys : new Set();

    return rows
        .filter((row) => {
            const key = row?.idempotency_key;
            if (typeof key !== 'string' || !key) return false;
            if (key.startsWith('manual-test:')) return false;
            if (!key.startsWith('schedule:')) return false;
            return !active.has(key);
        })
        .map((row) => row.id)
        .filter(Boolean);
}
