import test from 'node:test';
import assert from 'node:assert/strict';

import {
    createToastId,
    normalizeToastTtl,
    getToastTiming,
    getToastVisuals,
} from './toastUtils.js';

test('createToastId combines provided clock and random sources', () => {
    const id = createToastId(() => 1700000000000, () => 0.5);
    assert.strictEqual(id, '17000000000008');
});

test('normalizeToastTtl keeps finite numbers and applies minimum bound', () => {
    assert.strictEqual(normalizeToastTtl(3500), 3500);
    assert.strictEqual(normalizeToastTtl(450.9), 450);
    assert.strictEqual(normalizeToastTtl(50), 300);
    assert.strictEqual(normalizeToastTtl(299.99), 300);
});

test('normalizeToastTtl falls back to default for invalid ttl values', () => {
    assert.strictEqual(normalizeToastTtl(null), 3500);
    assert.strictEqual(normalizeToastTtl(undefined), 3500);
    assert.strictEqual(normalizeToastTtl(Number.NaN), 3500);
    assert.strictEqual(normalizeToastTtl(Infinity), 3500);
});

test('getToastTiming returns coherent enter/hide/remove schedule', () => {
    assert.deepStrictEqual(getToastTiming(1200), {
        enterDelayMs: 10,
        hideDelayMs: 900,
        removeDelayMs: 1200,
    });

    assert.deepStrictEqual(getToastTiming(250), {
        enterDelayMs: 10,
        hideDelayMs: 300,
        removeDelayMs: 300,
    });
});

test('getToastVisuals maps known toast types and defaults to info style', () => {
    assert.deepStrictEqual(getToastVisuals('success'), {
        icon: 'check_circle',
        bgClass: 'bg-green-50 text-green-700 border-green-200',
    });

    assert.deepStrictEqual(getToastVisuals('error'), {
        icon: 'error',
        bgClass: 'bg-red-50 text-red-700 border-red-200',
    });

    assert.deepStrictEqual(getToastVisuals('info'), {
        icon: 'info',
        bgClass: 'bg-white text-slate-800 border-slate-200',
    });

    assert.deepStrictEqual(getToastVisuals('unknown'), {
        icon: 'info',
        bgClass: 'bg-white text-slate-800 border-slate-200',
    });
});
