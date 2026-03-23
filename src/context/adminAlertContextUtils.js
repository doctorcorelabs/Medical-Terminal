export function canAccessAdminAlerts(isAdmin) {
    return Boolean(isAdmin);
}

export function buildAdminAlertsState(openRows, latestRows) {
    return {
        openAlertsCount: Array.isArray(openRows) ? openRows.length : 0,
        latestAlerts: Array.isArray(latestRows) ? latestRows : [],
    };
}
