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

function toMillis(value) {
    const ms = Date.parse(String(value || ''));
    return Number.isFinite(ms) ? ms : 0;
}

// Keep newest schedule row per event (source_id) and return stale row IDs.
export function computeEventVersionStaleIds(existingRows) {
    const rows = Array.isArray(existingRows) ? existingRows : [];
    const byEventId = new Map();

    for (const row of rows) {
        const eventId = String(row?.source_id || '').trim();
        const key = String(row?.idempotency_key || '');
        if (!eventId) continue;
        if (!key.startsWith('schedule:')) continue;
        if (key.startsWith('manual-test:')) continue;
        if (!byEventId.has(eventId)) byEventId.set(eventId, []);
        byEventId.get(eventId).push(row);
    }

    const staleIds = [];
    for (const rowsForEvent of byEventId.values()) {
        if (rowsForEvent.length <= 1) continue;

        const sorted = [...rowsForEvent].sort((a, b) => {
            const timeA = toMillis(a?.updated_at) || toMillis(a?.created_at);
            const timeB = toMillis(b?.updated_at) || toMillis(b?.created_at);
            return timeB - timeA;
        });

        for (let i = 1; i < sorted.length; i += 1) {
            if (sorted[i]?.id) staleIds.push(sorted[i].id);
        }
    }

    return staleIds;
}
