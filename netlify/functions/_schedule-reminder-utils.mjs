export const WIB_TIMEZONE = 'Asia/Jakarta';
export const WIB_UTC_OFFSET_MINUTES = 7 * 60;

function parseTime(time) {
  const [h, m] = String(time || '').split(':').map(Number);
  if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
  if (h < 0 || h > 23 || m < 0 || m > 59) return null;
  return { h, m };
}

export function localDateTimeToUtcWib(dateStr, timeStr) {
  const [year, month, day] = String(dateStr).split('-').map(Number);
  const time = parseTime(timeStr);
  if (!year || !month || !day || !time) return null;

  const localAsUtcMillis = Date.UTC(year, month - 1, day, time.h, time.m, 0, 0);
  return new Date(localAsUtcMillis - WIB_UTC_OFFSET_MINUTES * 60 * 1000);
}

export function buildScheduleIdempotencyKey(userId, eventId, eventDate, eventTime, reminderMinutes) {
  return `schedule:${userId}:${eventId || 'na'}:${eventDate}:${eventTime}:${reminderMinutes}`;
}

export function isAutoScheduleIdempotencyKey(idempotencyKey) {
  return String(idempotencyKey || '').startsWith('schedule:');
}

export function computeStaleScheduleQueueIds(existingRows, activeIdempotencyKeySet) {
  if (!Array.isArray(existingRows) || existingRows.length === 0) return [];

  return existingRows
    .filter((row) => isAutoScheduleIdempotencyKey(row?.idempotency_key))
    .filter((row) => !activeIdempotencyKeySet.has(String(row?.idempotency_key || '')))
    .map((row) => row.id)
    .filter(Boolean);
}
