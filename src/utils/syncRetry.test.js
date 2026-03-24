import test from 'node:test';
import assert from 'node:assert/strict';

import { computeRetryDelayMs, getQueueRetryState } from './syncRetry.js';

test('computeRetryDelayMs returns zero for non-positive attempts', () => {
    assert.equal(computeRetryDelayMs(0), 0);
    assert.equal(computeRetryDelayMs(-5), 0);
});

test('computeRetryDelayMs grows exponentially and respects max delay', () => {
    const noJitter = () => 0;
    assert.equal(computeRetryDelayMs(1, { baseDelayMs: 1000, maxDelayMs: 10000 }, noJitter), 1000);
    assert.equal(computeRetryDelayMs(2, { baseDelayMs: 1000, maxDelayMs: 10000 }, noJitter), 2000);
    assert.equal(computeRetryDelayMs(3, { baseDelayMs: 1000, maxDelayMs: 10000 }, noJitter), 4000);
    assert.equal(computeRetryDelayMs(10, { baseDelayMs: 1000, maxDelayMs: 10000 }, noJitter), 10000);
});

test('computeRetryDelayMs applies positive jitter when random > 0', () => {
    const maxRandom = () => 1;
    const withJitter = computeRetryDelayMs(2, { baseDelayMs: 1000, maxDelayMs: 10000, jitterRatio: 0.5 }, maxRandom);
    assert.equal(withJitter, 3000);
});

test('getQueueRetryState is ready when no attempt metadata exists', () => {
    const state = getQueueRetryState({});
    assert.equal(state.ready, true);
    assert.equal(state.waitMs, 0);
});

test('getQueueRetryState defers retry when backoff window has not elapsed', () => {
    const now = Date.parse('2026-03-24T10:00:05.000Z');
    const item = {
        attemptCount: 2,
        lastAttemptAt: '2026-03-24T10:00:04.000Z',
    };

    const state = getQueueRetryState(item, { baseDelayMs: 3000, jitterRatio: 0 }, now, () => 0);
    assert.equal(state.ready, false);
    assert.equal(state.delayMs, 6000);
    assert.equal(state.waitMs, 5000);
});

test('getQueueRetryState is ready when backoff window elapsed', () => {
    const now = Date.parse('2026-03-24T10:01:20.000Z');
    const item = {
        attemptCount: 3,
        lastAttemptAt: '2026-03-24T10:01:00.000Z',
    };

    const state = getQueueRetryState(item, { baseDelayMs: 4000, jitterRatio: 0 }, now, () => 0);
    assert.equal(state.ready, true);
    assert.equal(state.waitMs, 0);
    assert.equal(state.delayMs, 16000);
});
