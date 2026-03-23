export function getNextPinnedStaseId(currentPinnedStaseId, targetStaseId) {
    return currentPinnedStaseId === targetStaseId ? null : targetStaseId;
}

export function findPinnedStase(stases, pinnedStaseId) {
    if (!Array.isArray(stases) || !pinnedStaseId) return null;
    return stases.find((stase) => stase.id === pinnedStaseId) ?? null;
}

export function canSyncStases(user) {
    return Boolean(user?.id);
}
