// Tracks whether there are local changes that haven't been synced to Supabase.
// Uses localStorage so the pending-sync flags survive page reloads and offline periods.
// When the app comes back online, OfflineContext reads these flags and flushes the data.

const KEYS = {
    patients:  'medterminal_pending_patients_sync',
    stases:    'medterminal_pending_stases_sync',
    schedules: 'medterminal_pending_schedules_sync',
};

export const pendingSync = {
    // Patients
    markPatients:    () => localStorage.setItem(KEYS.patients,  '1'),
    clearPatients:   () => localStorage.removeItem(KEYS.patients),
    hasPatients:     () => localStorage.getItem(KEYS.patients)   === '1',

    // Stases
    markStases:      () => localStorage.setItem(KEYS.stases,    '1'),
    clearStases:     () => localStorage.removeItem(KEYS.stases),
    hasStases:       () => localStorage.getItem(KEYS.stases)     === '1',

    // Schedules
    markSchedules:   () => localStorage.setItem(KEYS.schedules,  '1'),
    clearSchedules:  () => localStorage.removeItem(KEYS.schedules),
    hasSchedules:    () => localStorage.getItem(KEYS.schedules)  === '1',

    // Any pending
    hasAny: () =>
        localStorage.getItem(KEYS.patients)  === '1' ||
        localStorage.getItem(KEYS.stases)    === '1' ||
        localStorage.getItem(KEYS.schedules) === '1',
};
