// Tracks whether there are local changes that haven't been synced to Supabase.
// Uses localStorage so the pending-sync flags survive page reloads and offline periods.
// When the app comes back online, OfflineContext reads these flags and flushes the data.

const KEYS = {
    patients:  'medterminal_pending_patients_sync',
    stases:    'medterminal_pending_stases_sync',
    schedules: 'medterminal_pending_schedules_sync',
};

let activePendingUserId = null;

function getScopedPendingKey(baseKey, userId = activePendingUserId) {
    return userId ? `${baseKey}:${userId}` : baseKey;
}

function migrateLegacyPendingFlags(userId) {
    if (!userId) return;

    for (const baseKey of Object.values(KEYS)) {
        const scopedKey = getScopedPendingKey(baseKey, userId);
        const hasScoped = localStorage.getItem(scopedKey) === '1';
        const hasLegacy = localStorage.getItem(baseKey) === '1';

        if (!hasScoped && hasLegacy) {
            localStorage.setItem(scopedKey, '1');
        }

        // Remove legacy global key to avoid leaking pending state across users.
        localStorage.removeItem(baseKey);
    }
}

export function setPendingSyncScope(userId) {
    activePendingUserId = userId || null;
    migrateLegacyPendingFlags(activePendingUserId);
}

export const pendingSync = {
    // Patients
    markPatients:    () => localStorage.setItem(getScopedPendingKey(KEYS.patients),  '1'),
    clearPatients:   () => localStorage.removeItem(getScopedPendingKey(KEYS.patients)),
    hasPatients:     () => localStorage.getItem(getScopedPendingKey(KEYS.patients))   === '1',

    // Stases
    markStases:      () => localStorage.setItem(getScopedPendingKey(KEYS.stases),    '1'),
    clearStases:     () => localStorage.removeItem(getScopedPendingKey(KEYS.stases)),
    hasStases:       () => localStorage.getItem(getScopedPendingKey(KEYS.stases))     === '1',

    // Schedules
    markSchedules:   () => localStorage.setItem(getScopedPendingKey(KEYS.schedules),  '1'),
    clearSchedules:  () => localStorage.removeItem(getScopedPendingKey(KEYS.schedules)),
    hasSchedules:    () => localStorage.getItem(getScopedPendingKey(KEYS.schedules))  === '1',

    // Any pending
    hasAny: () =>
        localStorage.getItem(getScopedPendingKey(KEYS.patients))  === '1' ||
        localStorage.getItem(getScopedPendingKey(KEYS.stases))    === '1' ||
        localStorage.getItem(getScopedPendingKey(KEYS.schedules)) === '1',
};
