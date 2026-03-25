import test, { afterEach, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import worker, { __resetWorkerSecurityCachesForTest } from './index.js';

const BASE_ENV = {
  CORS_ALLOWED_ORIGINS: 'https://medical.example.com',
  SUPABASE_URL: 'https://supabase.local',
  SUPABASE_ANON_KEY: 'anon-key',
  ENFORCE_HEARTBEAT_REPLAY_PROTECTION: 'false',
};

function makeRequest({
  origin = 'https://medical.example.com',
  method = 'POST',
  body,
  headers = {},
} = {}) {
  const payload = body ?? {
    user_id: 'user-1',
    session_id: 'session-1',
    device_id: 'device-1',
  };

  return new Request('https://worker.local/heartbeat', {
    method,
    headers: {
      Origin: origin,
      Authorization: 'Bearer test-token',
      'Content-Type': 'application/json',
      ...headers,
    },
    body: method === 'OPTIONS' ? undefined : JSON.stringify(payload),
  });
}

function createSupabaseFetchMock({
  lookupSession = {
    id: 'row-1',
    is_active: true,
    revoke_reason: null,
    device_id: 'device-1',
  },
  patchSession,
  conflictRows = [],
} = {}) {
  const effectivePatchSession = patchSession ?? lookupSession;

  return async (url, options = {}) => {
    const asString = String(url);

    if (asString.includes('session_id=neq.')) {
      return new Response(JSON.stringify(conflictRows), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    if (asString.includes('/rest/v1/user_login_sessions?user_id=eq.')) {
      const rows = lookupSession ? [lookupSession] : [];
      return new Response(
        JSON.stringify(rows),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    if (asString.includes('/rest/v1/user_login_sessions?id=eq.') && options.method === 'PATCH') {
      return new Response(
        JSON.stringify(effectivePatchSession ? [effectivePatchSession] : []),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(JSON.stringify({ error: 'unexpected request', url: asString }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' },
    });
  };
}

beforeEach(() => {
  __resetWorkerSecurityCachesForTest();
});

afterEach(() => {
  __resetWorkerSecurityCachesForTest();
});

test('rejects heartbeat from non-allowlisted origin', async () => {
  const response = await worker.fetch(
    makeRequest({ origin: 'https://evil.example.com' }),
    BASE_ENV
  );

  assert.equal(response.status, 403);
  const payload = await response.json();
  assert.equal(payload.error, 'Origin not allowed');
});

test('returns ok and unlocked for valid heartbeat', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock();

  try {
    const response = await worker.fetch(makeRequest(), BASE_ENV);
    assert.equal(response.status, 200);

    const payload = await response.json();
    assert.equal(payload.status, 'ok');
    assert.equal(payload.is_locked, false);
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforced replay protection rejects missing headers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock();

  try {
    const response = await worker.fetch(
      makeRequest(),
      {
        ...BASE_ENV,
        ENFORCE_HEARTBEAT_REPLAY_PROTECTION: 'true',
      }
    );

    assert.equal(response.status, 400);
    const payload = await response.json();
    assert.equal(payload.error, 'Missing replay protection headers');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('enforced replay protection rejects duplicate nonce', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock();

  const ts = String(Date.now());
  const nonce = 'fixed-nonce';

  try {
    const first = await worker.fetch(
      makeRequest({ headers: { 'x-session-timestamp': ts, 'x-session-nonce': nonce } }),
      {
        ...BASE_ENV,
        ENFORCE_HEARTBEAT_REPLAY_PROTECTION: 'true',
      }
    );
    assert.equal(first.status, 200);

    const second = await worker.fetch(
      makeRequest({ headers: { 'x-session-timestamp': ts, 'x-session-nonce': nonce } }),
      {
        ...BASE_ENV,
        ENFORCE_HEARTBEAT_REPLAY_PROTECTION: 'true',
      }
    );

    assert.equal(second.status, 409);
    const payload = await second.json();
    assert.equal(payload.error, 'Replay detected');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('non-enforced replay protection allows missing replay headers', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock();

  try {
    const response = await worker.fetch(makeRequest(), {
      ...BASE_ENV,
      ENFORCE_HEARTBEAT_REPLAY_PROTECTION: 'false',
    });

    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'ok');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('rejects device mismatch for existing session', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock({
    lookupSession: {
      id: 'row-1',
      is_active: true,
      revoke_reason: null,
      device_id: 'server-device',
    },
  });

  try {
    const response = await worker.fetch(
      makeRequest({
        body: {
          user_id: 'user-1',
          session_id: 'session-1',
          device_id: 'client-device',
        },
      }),
      BASE_ENV
    );

    assert.equal(response.status, 403);
    const payload = await response.json();
    assert.equal(payload.error, 'Device mismatch for session');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns kicked when session is not found', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock({ lookupSession: null });

  try {
    const response = await worker.fetch(makeRequest(), BASE_ENV);
    assert.equal(response.status, 200);
    const payload = await response.json();
    assert.equal(payload.status, 'kicked');
    assert.equal(payload.reason, 'session_not_found');
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('returns 429 when rate limit threshold exceeded in same window', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = createSupabaseFetchMock();

  try {
    let limitedResponse = null;
    for (let i = 0; i < 95; i += 1) {
      const response = await worker.fetch(makeRequest(), BASE_ENV);
      if (response.status === 429) {
        limitedResponse = response;
        break;
      }
    }

    assert.ok(limitedResponse, 'Expected one request to hit rate limit');
    assert.equal(limitedResponse.status, 429);
    assert.ok(limitedResponse.headers.get('Retry-After'));
    const payload = await limitedResponse.json();
    assert.equal(payload.error, 'Too many heartbeat requests');
  } finally {
    globalThis.fetch = originalFetch;
  }
});
