// cloudflare/session-worker/src/index.js

const RATE_LIMIT_BUCKETS = new Map();
const NONCE_CACHE = new Map();

const RATE_LIMIT_WINDOW_MS = 60 * 1000;
const RATE_LIMIT_MAX_REQUESTS = 90;
const REPLAY_WINDOW_MS = 5 * 60 * 1000;

export function __resetWorkerSecurityCachesForTest() {
  RATE_LIMIT_BUCKETS.clear();
  NONCE_CACHE.clear();
}

function pruneExpiredEntries(nowMs) {
  for (const [key, bucket] of RATE_LIMIT_BUCKETS.entries()) {
    if (nowMs - bucket.windowStartMs > RATE_LIMIT_WINDOW_MS * 2) {
      RATE_LIMIT_BUCKETS.delete(key);
    }
  }

  for (const [key, expiresAtMs] of NONCE_CACHE.entries()) {
    if (expiresAtMs <= nowMs) {
      NONCE_CACHE.delete(key);
    }
  }
}

function checkRateLimit(rateKey, nowMs) {
  const currentBucket = RATE_LIMIT_BUCKETS.get(rateKey);
  if (!currentBucket || nowMs - currentBucket.windowStartMs >= RATE_LIMIT_WINDOW_MS) {
    RATE_LIMIT_BUCKETS.set(rateKey, { windowStartMs: nowMs, count: 1 });
    return { allowed: true, retryAfterSec: 0 };
  }

  currentBucket.count += 1;
  RATE_LIMIT_BUCKETS.set(rateKey, currentBucket);

  if (currentBucket.count > RATE_LIMIT_MAX_REQUESTS) {
    const retryAfterMs = RATE_LIMIT_WINDOW_MS - (nowMs - currentBucket.windowStartMs);
    return { allowed: false, retryAfterSec: Math.max(1, Math.ceil(retryAfterMs / 1000)) };
  }

  return { allowed: true, retryAfterSec: 0 };
}

function validateReplayProtection(request, sessionId, nowMs, enforceReplayProtection) {
  const tsHeader = request.headers.get("x-session-timestamp");
  const nonceHeader = request.headers.get("x-session-nonce");

  if (!tsHeader || !nonceHeader) {
    if (enforceReplayProtection) {
      return { ok: false, status: 400, error: "Missing replay protection headers" };
    }
    return { ok: true };
  }

  const tsMs = Number(tsHeader);
  if (!Number.isFinite(tsMs)) {
    return { ok: false, status: 400, error: "Invalid timestamp header" };
  }

  if (Math.abs(nowMs - tsMs) > REPLAY_WINDOW_MS) {
    return { ok: false, status: 401, error: "Heartbeat timestamp expired" };
  }

  const nonceKey = `${sessionId}:${nonceHeader}`;
  const existingExpiry = NONCE_CACHE.get(nonceKey);
  if (existingExpiry && existingExpiry > nowMs) {
    return { ok: false, status: 409, error: "Replay detected" };
  }

  NONCE_CACHE.set(nonceKey, nowMs + REPLAY_WINDOW_MS);
  return { ok: true };
}

function getSessionStartMs(sessionRow) {
  const rawValue = sessionRow?.session_started_at || sessionRow?.created_at || null;
  if (!rawValue) return null;

  const ms = Date.parse(rawValue);
  return Number.isFinite(ms) ? ms : null;
}

function shouldCurrentSessionBeLocked(currentSession, otherActiveRows, fallbackSessionId) {
  if (!Array.isArray(otherActiveRows) || otherActiveRows.length === 0) {
    return false;
  }

  const currentStartMs = getSessionStartMs(currentSession);
  const currentSessionId = String(currentSession?.session_id || fallbackSessionId || '');

  // If we cannot derive a stable start time for current session, keep previous behavior (locked on conflict).
  if (currentStartMs === null) {
    return true;
  }

  for (const other of otherActiveRows) {
    const otherStartMs = getSessionStartMs(other);
    const otherSessionId = String(other?.session_id || '');

    // Older competing active session remains primary.
    if (otherStartMs !== null && otherStartMs < currentStartMs) {
      return true;
    }

    // Deterministic tie-breaker for equal start time.
    if (otherStartMs !== null && otherStartMs === currentStartMs && otherSessionId && currentSessionId) {
      if (otherSessionId < currentSessionId) {
        return true;
      }
    }

    // Unknown competitor start time: stay conservative and lock current.
    if (otherStartMs === null) {
      return true;
    }
  }

  return false;
}

export default {
  async fetch(request, env) {
    const nowMs = Date.now();
    pruneExpiredEntries(nowMs);

    const allowedOrigins = String(env.CORS_ALLOWED_ORIGINS || "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean);

    const enforceReplayProtection = String(env.ENFORCE_HEARTBEAT_REPLAY_PROTECTION || "false").toLowerCase() === "true";

    const requestOrigin = request.headers.get("Origin");
    const isOriginAllowed = Boolean(requestOrigin && allowedOrigins.includes(requestOrigin));

    const corsHeaders = {
      "Access-Control-Allow-Origin": isOriginAllowed ? requestOrigin : "null",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization, x-session-timestamp, x-session-nonce",
      "Access-Control-Max-Age": "86400",
      "Vary": "Origin",
    };

    // 1. Handle Preflight OPTIONS
    if (request.method === "OPTIONS") {
      if (!isOriginAllowed) {
        return new Response(null, { status: 403, headers: corsHeaders });
      }
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Helper to return JSON with CORS
    const jsonResponse = (data, status = 200, extraHeaders = {}) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
          ...extraHeaders,
        },
      });
    };

    if (url.pathname !== "/heartbeat" || request.method !== "POST") {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    if (!isOriginAllowed) {
      return jsonResponse({ error: "Origin not allowed" }, 403);
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const body = await request.json();
      const { session_id, user_id, device_id } = body;

      if (!session_id || !user_id) {
        return jsonResponse({ 
          error: "Missing parameters", 
          received: { session_id: !!session_id, user_id: !!user_id } 
        }, 400);
      }

      const ipAddress = request.headers.get("CF-Connecting-IP") || request.headers.get("x-forwarded-for") || "unknown";
      const rateLimitKey = `${user_id}:${session_id}:${device_id || "no-device"}:${ipAddress}`;
      const rateLimitResult = checkRateLimit(rateLimitKey, nowMs);
      if (!rateLimitResult.allowed) {
        return jsonResponse(
          { error: "Too many heartbeat requests", retry_after_seconds: rateLimitResult.retryAfterSec },
          429,
          { "Retry-After": String(rateLimitResult.retryAfterSec) }
        );
      }

      const replayValidation = validateReplayProtection(request, session_id, nowMs, enforceReplayProtection);
      if (!replayValidation.ok) {
        return jsonResponse({ error: replayValidation.error }, replayValidation.status);
      }

      // 2. Update Supabase
      const supabaseUrl = env.SUPABASE_URL;
      const supabaseKey = env.SUPABASE_ANON_KEY; 

      const encodedUserId = encodeURIComponent(user_id);
      const encodedSessionId = encodeURIComponent(session_id);

      const lookupResponse = await fetch(
        `${supabaseUrl}/rest/v1/user_login_sessions?user_id=eq.${encodedUserId}&session_id=eq.${encodedSessionId}&select=id,session_id,is_active,revoke_reason,device_id,session_started_at,created_at&limit=1`,
        {
          headers: {
            "apikey": supabaseKey,
            "Authorization": authHeader,
          },
        }
      );

      if (!lookupResponse.ok) {
        const lookupError = await lookupResponse.text();
        return jsonResponse({ error: "Session lookup failed", detail: lookupError }, lookupResponse.status);
      }

      const lookupData = await lookupResponse.json();
      const currentSession = lookupData[0];

      if (!currentSession) {
        return jsonResponse({ status: "kicked", reason: "session_not_found" }, 200);
      }

      if (device_id && currentSession.device_id && currentSession.device_id !== device_id) {
        return jsonResponse({ error: "Device mismatch for session" }, 403);
      }

      if (!currentSession.is_active) {
        return jsonResponse({ status: "kicked", reason: currentSession.revoke_reason || "session_revoked" }, 200);
      }

      const encodedRecordId = encodeURIComponent(currentSession.id);

      // PENTING: Gunakan session_id=eq., bukan id=eq. karena session_id adalah TEXT (UUID custom)
      const response = await fetch(`${supabaseUrl}/rest/v1/user_login_sessions?id=eq.${encodedRecordId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": authHeader,
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ 
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return jsonResponse({ error: "Supabase sync failed", detail: error }, response.status);
      }

      const data = await response.json();
      const session = data[0];

      // 3. Cek apakah sesi ini masih aktif (tidak di-kick)
      if (!session || !session.is_active) {
        return jsonResponse({ 
          status: "kicked", 
          reason: session?.revoke_reason 
        }, 200);
      }

      // 4. Cek Konflik Eksklusif
      // Fix 8: Do NOT filter by device_id here. A user opening two different browsers
      // on the same device shares the same device_id but has distinct session_ids — both
      // should trigger a conflict. Filtering by device_id=neq would silently allow this.
      const conflictQuery = `user_id=eq.${encodedUserId}&is_active=eq.true&session_id=neq.${encodedSessionId}&select=id,session_id,session_started_at,created_at`;

      const conflictCheck = await fetch(
        `${supabaseUrl}/rest/v1/user_login_sessions?${conflictQuery}`,
        {
          headers: { "apikey": supabaseKey, "Authorization": authHeader }
        }
      );

      if (!conflictCheck.ok) {
        return jsonResponse({ error: "Conflict check failed" }, conflictCheck.status);
      }

      const otherActive = await conflictCheck.json();
      const is_locked = shouldCurrentSessionBeLocked(currentSession, otherActive, session_id);

      return jsonResponse({ 
        status: "ok", 
        is_locked,
        session_state: "active"
      }, 200);

    } catch (err) {
      return jsonResponse({ error: "Internal Server Error", message: err.message }, 500);
    }
  },
};
