export function buildPendingStatus(patients, stases, schedules) {
    const count = Number(Boolean(patients)) + Number(Boolean(stases)) + Number(Boolean(schedules));
    return {
        patients: Boolean(patients),
        stases: Boolean(stases),
        schedules: Boolean(schedules),
        count,
        any: count > 0,
    };
}

export function getPendingStatusFromQueue(pendingSync) {
    return buildPendingStatus(
        pendingSync.hasPatients(),
        pendingSync.hasStases(),
        pendingSync.hasSchedules()
    );
}
