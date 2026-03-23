const DEFAULT_MAINTENANCE_MESSAGE = 'Fitur ini sedang dalam perbaikan. Mohon coba beberapa saat lagi.';

export function mapFeatureFlagsRows(rows) {
    if (!Array.isArray(rows)) return {};

    const map = {};
    rows.forEach((row) => {
        if (!row?.key) return;
        map[row.key] = {
            enabled: Boolean(row.enabled),
            maintenance_message: row.maintenance_message ?? null,
        };
    });
    return map;
}

export function reduceFeatureFlagRealtimePayload(prevFlags, payload) {
    const previous = prevFlags || {};

    if (payload?.eventType === 'DELETE') {
        const deletedKey = payload?.old?.key;
        if (!deletedKey) return previous;
        const next = { ...previous };
        delete next[deletedKey];
        return next;
    }

    const row = payload?.new;
    if (!row?.key) return previous;
    return {
        ...previous,
        [row.key]: {
            enabled: Boolean(row.enabled),
            maintenance_message: row.maintenance_message ?? null,
        },
    };
}

export function resolveFeatureEnabled({ isAdmin, loaded, flags, key }) {
    if (isAdmin) return true;
    if (!loaded) return true;
    const flag = flags?.[key];
    if (!flag) return true;
    return Boolean(flag.enabled);
}

export function resolveMaintenanceMessage(flags, key) {
    return flags?.[key]?.maintenance_message ?? DEFAULT_MAINTENANCE_MESSAGE;
}
