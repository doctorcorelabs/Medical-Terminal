export const THEME_KEY = 'medterminal_theme';
export const COPILOT_CONTEXT_KEY = 'copilot_context_enabled';

export function getScopedStorageKey(baseKey, userId) {
    return userId ? `${baseKey}:${userId}` : baseKey;
}

export function normalizeThemeValue(value) {
    if (value === 'dark' || value === 'light') return value;
    return null;
}

export function parseStoredBoolean(value) {
    if (value === null || value === undefined) return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'boolean') return parsed;
    } catch {
        return null;
    }
    return null;
}