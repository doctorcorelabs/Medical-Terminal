import test from 'node:test';
import assert from 'node:assert/strict';

import {
    mapFeatureFlagsRows,
    reduceFeatureFlagRealtimePayload,
    resolveFeatureEnabled,
    resolveMaintenanceMessage,
} from './featureFlagUtils.js';

test('mapFeatureFlagsRows maps keyed rows and ignores invalid entries', () => {
    const map = mapFeatureFlagsRows([
        { key: 'ai', enabled: true, maintenance_message: null },
        { key: 'reports', enabled: 0, maintenance_message: 'Maintenance' },
        null,
        { enabled: true },
    ]);

    assert.deepStrictEqual(map, {
        ai: { enabled: true, maintenance_message: null },
        reports: { enabled: false, maintenance_message: 'Maintenance' },
    });
});

test('reduceFeatureFlagRealtimePayload handles delete events', () => {
    const previous = {
        ai: { enabled: true, maintenance_message: null },
        reports: { enabled: false, maintenance_message: 'Down' },
    };

    const next = reduceFeatureFlagRealtimePayload(previous, {
        eventType: 'DELETE',
        old: { key: 'reports' },
    });

    assert.deepStrictEqual(next, {
        ai: { enabled: true, maintenance_message: null },
    });
});

test('reduceFeatureFlagRealtimePayload handles upsert events', () => {
    const previous = {
        ai: { enabled: true, maintenance_message: null },
    };

    const next = reduceFeatureFlagRealtimePayload(previous, {
        eventType: 'UPDATE',
        new: { key: 'reports', enabled: false, maintenance_message: 'Maintenance' },
    });

    assert.deepStrictEqual(next, {
        ai: { enabled: true, maintenance_message: null },
        reports: { enabled: false, maintenance_message: 'Maintenance' },
    });
});

test('resolveFeatureEnabled respects admin, loading, and flag defaults', () => {
    assert.strictEqual(resolveFeatureEnabled({ isAdmin: true, loaded: true, flags: {}, key: 'x' }), true);
    assert.strictEqual(resolveFeatureEnabled({ isAdmin: false, loaded: false, flags: {}, key: 'x' }), true);
    assert.strictEqual(resolveFeatureEnabled({ isAdmin: false, loaded: true, flags: {}, key: 'x' }), true);
    assert.strictEqual(resolveFeatureEnabled({ isAdmin: false, loaded: true, flags: { x: { enabled: false } }, key: 'x' }), false);
});

test('resolveMaintenanceMessage returns custom or fallback text', () => {
    const flags = {
        ai: { enabled: false, maintenance_message: 'Temporarily disabled' },
    };
    assert.strictEqual(resolveMaintenanceMessage(flags, 'ai'), 'Temporarily disabled');
    assert.strictEqual(
        resolveMaintenanceMessage(flags, 'unknown'),
        'Fitur ini sedang dalam perbaikan. Mohon coba beberapa saat lagi.'
    );
});
