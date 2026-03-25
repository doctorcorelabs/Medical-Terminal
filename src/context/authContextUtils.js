const SCOPED_SIGNOUT_KEYS = [
    'medterminal_pdf_prefs',
    'medterminal_patients',
    'medterminal_deleted_patients',
    'medterminal_stases',
    'medterminal_deleted_stases',
    'medterminal_pinned_stase',
    'medterminal_schedules',
    'medterminal_pending_patients_sync',
    'medterminal_pending_stases_sync',
    'medterminal_pending_schedules_sync',
    'medterminal_theme',
    'copilot_context_enabled',
    'patientDetailActiveTab',
    'addPatientActiveTab',
    'medterminal_schedule_view',
];

const GLOBAL_SIGNOUT_KEYS = [
    'medterminal_pdf_prefs',
    'medterminal_user_cache',
    'medterminal_profile_cache',
    'medterminal_patients',
    'medterminal_deleted_patients',
    'medterminal_stases',
    'medterminal_deleted_stases',
    'medterminal_pinned_stase',
    'medterminal_schedules',
    'medterminal_pending_patients_sync',
    'medterminal_pending_stases_sync',
    'medterminal_pending_schedules_sync',
    'medterminal_theme',
    'copilot_context_enabled',
    'patientDetailActiveTab',
    'addPatientActiveTab',
    'medterminal_schedule_view',
];

function isFutureIsoDate(isoDate, nowMs) {
    if (!isoDate) return true;
    const expiresAt = Date.parse(isoDate);
    if (!Number.isFinite(expiresAt)) return false;
    return expiresAt > nowMs;
}

export function getRoleFlags(profile, now = new Date()) {
    const nowMs = now.getTime();
    const isAdmin = profile?.role === 'admin';
    const specialistActive = profile?.role === 'specialist' && isFutureIsoDate(profile?.subscription_expires_at, nowMs);
    const specialistExpired = profile?.role === 'specialist' && !isFutureIsoDate(profile?.subscription_expires_at, nowMs);

    return {
        isAdmin,
        isSpecialist: specialistActive,
        isExpiredSpecialist: specialistExpired,
        isIntern: !isAdmin && !specialistActive,
        isWhitelisted: profile?.is_security_whitelisted === true || isAdmin,
    };
}

export function getSignOutStorageKeys(userId) {
    const scoped = userId ? SCOPED_SIGNOUT_KEYS.map((key) => `${key}:${userId}`) : [];
    return {
        scoped,
        global: [...GLOBAL_SIGNOUT_KEYS],
    };
}
