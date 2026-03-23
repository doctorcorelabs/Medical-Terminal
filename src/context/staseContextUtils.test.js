import test from 'node:test';
import assert from 'node:assert/strict';

import { canSyncStases, findPinnedStase, getNextPinnedStaseId } from './staseContextUtils.js';

test('getNextPinnedStaseId toggles off when target already pinned', () => {
    assert.strictEqual(getNextPinnedStaseId('stase-1', 'stase-1'), null);
});

test('getNextPinnedStaseId switches to new target when different', () => {
    assert.strictEqual(getNextPinnedStaseId('stase-1', 'stase-2'), 'stase-2');
    assert.strictEqual(getNextPinnedStaseId(null, 'stase-2'), 'stase-2');
});

test('findPinnedStase returns matching stase or null', () => {
    const stases = [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
    ];

    assert.deepStrictEqual(findPinnedStase(stases, 'b'), { id: 'b', name: 'B' });
    assert.strictEqual(findPinnedStase(stases, 'c'), null);
    assert.strictEqual(findPinnedStase(null, 'a'), null);
    assert.strictEqual(findPinnedStase(stases, null), null);
});

test('canSyncStases requires user id', () => {
    assert.strictEqual(canSyncStases({ id: 'u-1' }), true);
    assert.strictEqual(canSyncStases({}), false);
    assert.strictEqual(canSyncStases(null), false);
});
