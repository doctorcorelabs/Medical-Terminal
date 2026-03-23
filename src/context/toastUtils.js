const DEFAULT_TOAST_TTL = 3500;
const MIN_TOAST_TTL = 300;

export function createToastId(now = Date.now, random = Math.random) {
    return `${now()}${random().toString(16).slice(2)}`;
}

export function normalizeToastTtl(ttl, defaultTtl = DEFAULT_TOAST_TTL) {
    if (!Number.isFinite(ttl)) return defaultTtl;
    return Math.max(MIN_TOAST_TTL, Math.floor(ttl));
}

export function getToastTiming(ttl) {
    const safeTtl = normalizeToastTtl(ttl);
    return {
        enterDelayMs: 10,
        hideDelayMs: Math.max(300, safeTtl - 300),
        removeDelayMs: safeTtl,
    };
}

export function getToastVisuals(type) {
    if (type === 'success') {
        return {
            icon: 'check_circle',
            bgClass: 'bg-green-50 text-green-700 border-green-200',
        };
    }

    if (type === 'error') {
        return {
            icon: 'error',
            bgClass: 'bg-red-50 text-red-700 border-red-200',
        };
    }

    return {
        icon: 'info',
        bgClass: 'bg-white text-slate-800 border-slate-200',
    };
}
