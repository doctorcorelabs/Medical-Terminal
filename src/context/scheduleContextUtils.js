export function getScheduleScopeUserId(user) {
    return user?.id ?? null;
}

export function canSyncSchedules(user) {
    return Boolean(getScheduleScopeUserId(user));
}

export function getScheduleMutationReason(action) {
    if (action === 'add') return 'schedule_add';
    if (action === 'update') return 'schedule_update';
    if (action === 'delete') return 'schedule_delete';
    if (action === 'import') return 'schedule_import';
    return 'schedule_unknown';
}

export function getScheduleContextResetState() {
    return [];
}
