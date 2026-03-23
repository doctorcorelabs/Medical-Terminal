import test from 'node:test';
import assert from 'node:assert/strict';

import { getRoleFlags, getSignOutStorageKeys } from './authContextUtils.js';

test('getRoleFlags resolves admin role', () => {
    const flags = getRoleFlags({ role: 'admin' }, new Date('2026-03-23T00:00:00Z'));
    assert.deepStrictEqual(flags, {
        isAdmin: true,
        isSpecialist: false,
        isExpiredSpecialist: false,
        isIntern: false,
    });
});

test('getRoleFlags resolves active specialist with no expiry date', () => {
    const flags = getRoleFlags({ role: 'specialist', subscription_expires_at: null }, new Date('2026-03-23T00:00:00Z'));
    assert.deepStrictEqual(flags, {
        isAdmin: false,
        isSpecialist: true,
        isExpiredSpecialist: false,
        isIntern: false,
    });
});

test('getRoleFlags resolves active specialist with future expiry date', () => {
    const flags = getRoleFlags(
        { role: 'specialist', subscription_expires_at: '2026-04-01T00:00:00Z' },
        new Date('2026-03-23T00:00:00Z')
    );
    assert.strictEqual(flags.isSpecialist, true);
    assert.strictEqual(flags.isExpiredSpecialist, false);
    assert.strictEqual(flags.isIntern, false);
});

test('getRoleFlags resolves expired specialist', () => {
    const flags = getRoleFlags(
        { role: 'specialist', subscription_expires_at: '2026-03-01T00:00:00Z' },
        new Date('2026-03-23T00:00:00Z')
    );
    assert.strictEqual(flags.isSpecialist, false);
    assert.strictEqual(flags.isExpiredSpecialist, true);
    assert.strictEqual(flags.isIntern, true);
});

test('getRoleFlags treats non-admin non-specialist as intern', () => {
    const flags = getRoleFlags({ role: 'intern' }, new Date('2026-03-23T00:00:00Z'));
    assert.deepStrictEqual(flags, {
        isAdmin: false,
        isSpecialist: false,
        isExpiredSpecialist: false,
        isIntern: true,
    });
});

test('getSignOutStorageKeys returns scoped and global key lists', () => {
    const keys = getSignOutStorageKeys('u-1');
    assert.ok(keys.scoped.includes('medterminal_patients:u-1'));
    assert.ok(keys.scoped.includes('copilot_context_enabled:u-1'));
    assert.ok(keys.global.includes('medterminal_patients'));
    assert.ok(keys.global.includes('medterminal_user_cache'));
});

test('getSignOutStorageKeys returns only global keys for anonymous session', () => {
    const keys = getSignOutStorageKeys(null);
    assert.deepStrictEqual(keys.scoped, []);
    assert.ok(keys.global.includes('medterminal_profile_cache'));
});
