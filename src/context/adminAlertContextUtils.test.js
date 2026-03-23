import test from 'node:test';
import assert from 'node:assert/strict';

import { buildAdminAlertsState, canAccessAdminAlerts } from './adminAlertContextUtils.js';

test('canAccessAdminAlerts is true only for truthy admin flag', () => {
    assert.strictEqual(canAccessAdminAlerts(true), true);
    assert.strictEqual(canAccessAdminAlerts(false), false);
    assert.strictEqual(canAccessAdminAlerts(null), false);
    assert.strictEqual(canAccessAdminAlerts(undefined), false);
});

test('buildAdminAlertsState computes count and keeps latest rows', () => {
    const state = buildAdminAlertsState(
        [{ id: 'a1' }, { id: 'a2' }],
        [{ id: 'b1', title: 'Alert' }]
    );

    assert.deepStrictEqual(state, {
        openAlertsCount: 2,
        latestAlerts: [{ id: 'b1', title: 'Alert' }],
    });
});

test('buildAdminAlertsState falls back safely for invalid inputs', () => {
    const state = buildAdminAlertsState(null, undefined);

    assert.deepStrictEqual(state, {
        openAlertsCount: 0,
        latestAlerts: [],
    });
});
