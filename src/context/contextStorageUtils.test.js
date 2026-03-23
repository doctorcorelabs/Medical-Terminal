import test from 'node:test';
import assert from 'node:assert/strict';

import {
    THEME_KEY,
    COPILOT_CONTEXT_KEY,
    getScopedStorageKey,
    normalizeThemeValue,
    parseStoredBoolean,
} from './contextStorageUtils.js';

test('getScopedStorageKey returns base key for anonymous scope', () => {
    assert.strictEqual(getScopedStorageKey(THEME_KEY, null), THEME_KEY);
    assert.strictEqual(getScopedStorageKey(COPILOT_CONTEXT_KEY, undefined), COPILOT_CONTEXT_KEY);
});

test('getScopedStorageKey appends user id for scoped storage', () => {
    assert.strictEqual(
        getScopedStorageKey(THEME_KEY, 'user-123'),
        'medterminal_theme:user-123'
    );
    assert.strictEqual(
        getScopedStorageKey(COPILOT_CONTEXT_KEY, 'abc'),
        'copilot_context_enabled:abc'
    );
});

test('normalizeThemeValue accepts only dark/light', () => {
    assert.strictEqual(normalizeThemeValue('dark'), 'dark');
    assert.strictEqual(normalizeThemeValue('light'), 'light');
    assert.strictEqual(normalizeThemeValue('Dark'), null);
    assert.strictEqual(normalizeThemeValue('system'), null);
    assert.strictEqual(normalizeThemeValue(null), null);
});

test('parseStoredBoolean handles string booleans', () => {
    assert.strictEqual(parseStoredBoolean('true'), true);
    assert.strictEqual(parseStoredBoolean('false'), false);
});

test('parseStoredBoolean handles JSON booleans', () => {
    assert.strictEqual(parseStoredBoolean(' true '), true);
    assert.strictEqual(parseStoredBoolean(' false '), false);
    assert.strictEqual(parseStoredBoolean('"true"'), null);
});

test('parseStoredBoolean returns null for nullish and invalid values', () => {
    assert.strictEqual(parseStoredBoolean(null), null);
    assert.strictEqual(parseStoredBoolean(undefined), null);
    assert.strictEqual(parseStoredBoolean('not-json'), null);
    assert.strictEqual(parseStoredBoolean('123'), null);
    assert.strictEqual(parseStoredBoolean('{}'), null);
    assert.strictEqual(parseStoredBoolean('[]'), null);
});
