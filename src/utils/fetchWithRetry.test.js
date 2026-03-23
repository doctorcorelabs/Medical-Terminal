import test from 'node:test';
import assert from 'node:assert/strict';

import { fetchWithRetry } from './fetchWithRetry.js';

function makeResponse(status, body = '') {
    return {
        status,
        ok: status >= 200 && status < 300,
        text: async () => body,
        json: async () => ({ body }),
    };
}

test('fetchWithRetry returns response on first successful call', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return makeResponse(200, 'ok');
    };

    try {
        const response = await fetchWithRetry('https://example.com', { retries: 3, backoff: 0 });
        assert.strictEqual(response.status, 200);
        assert.strictEqual(calls, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('fetchWithRetry retries on 500 then succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls < 3) return makeResponse(500, 'server error');
        return makeResponse(200, 'ok');
    };

    try {
        const response = await fetchWithRetry('https://example.com', { retries: 3, backoff: 0 });
        assert.strictEqual(response.status, 200);
        assert.strictEqual(calls, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('fetchWithRetry retries on 408 then succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls === 1) return makeResponse(408, 'timeout');
        return makeResponse(201, 'created');
    };

    try {
        const response = await fetchWithRetry('https://example.com', { retries: 2, backoff: 0 });
        assert.strictEqual(response.status, 201);
        assert.strictEqual(calls, 2);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('fetchWithRetry returns last 5xx response when retries exhausted', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        return makeResponse(503, 'still down');
    };

    try {
        const response = await fetchWithRetry('https://example.com', { retries: 2, backoff: 0 });
        assert.strictEqual(response.status, 503);
        assert.strictEqual(calls, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('fetchWithRetry retries on TypeError network failure then succeeds', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    globalThis.fetch = async () => {
        calls += 1;
        if (calls < 3) throw new TypeError('Failed to fetch');
        return makeResponse(200, 'ok');
    };

    try {
        const response = await fetchWithRetry('https://example.com', { retries: 3, backoff: 0 });
        assert.strictEqual(response.status, 200);
        assert.strictEqual(calls, 3);
    } finally {
        globalThis.fetch = originalFetch;
    }
});

test('fetchWithRetry throws non-network error without retrying', async () => {
    const originalFetch = globalThis.fetch;
    let calls = 0;
    const err = new Error('Boom');
    globalThis.fetch = async () => {
        calls += 1;
        throw err;
    };

    try {
        await assert.rejects(
            () => fetchWithRetry('https://example.com', { retries: 3, backoff: 0 }),
            /Boom/
        );
        assert.strictEqual(calls, 1);
    } finally {
        globalThis.fetch = originalFetch;
    }
});
