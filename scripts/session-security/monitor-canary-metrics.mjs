const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const LOOKBACK_MINUTES = Number(process.env.LOOKBACK_MINUTES || 30);

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables.');
  process.exit(1);
}

const sinceIso = new Date(Date.now() - LOOKBACK_MINUTES * 60 * 1000).toISOString();

async function fetchJson(path) {
  const response = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, {
    headers: {
      apikey: SUPABASE_SERVICE_ROLE_KEY,
      Authorization: `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase request failed (${response.status}): ${body}`);
  }

  return response.json();
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.min(sorted.length - 1, Math.ceil((p / 100) * sorted.length) - 1);
  return sorted[Math.max(0, idx)];
}

(async () => {
  const heartbeatEvents = await fetchJson(
    `user_activity_events?select=event_type,occurred_at&feature_key=eq.session_guard&event_type=in.(session_heartbeat_429,session_heartbeat_401,session_heartbeat_403,session_kicked_detected,session_false_kick_reported)&occurred_at=gte.${encodeURIComponent(sinceIso)}`
  );

  const takeoverEvents = await fetchJson(
    `security_events?select=event_type,created_at,metadata&event_type=eq.session_takeover&created_at=gte.${encodeURIComponent(sinceIso)}`
  );

  const counts = {
    session_heartbeat_429: 0,
    session_heartbeat_401: 0,
    session_heartbeat_403: 0,
    session_kicked_detected: 0,
    session_false_kick_reported: 0,
  };

  for (const row of heartbeatEvents) {
    if (counts[row.event_type] !== undefined) counts[row.event_type] += 1;
  }

  const takeoverDurations = takeoverEvents
    .map((row) => Number(row?.metadata?.duration_ms))
    .filter((value) => Number.isFinite(value) && value >= 0);

  const takeoverP95 = percentile(takeoverDurations, 95);

  console.log('=== Session Security Canary Metrics ===');
  console.log(`Lookback minutes: ${LOOKBACK_MINUTES}`);
  console.log(`Since: ${sinceIso}`);
  console.log('Heartbeat 429 count:', counts.session_heartbeat_429);
  console.log('Heartbeat 401 count:', counts.session_heartbeat_401);
  console.log('Heartbeat 403 count:', counts.session_heartbeat_403);
  console.log('Kicked detections:', counts.session_kicked_detected);
  console.log('False-kick complaints:', counts.session_false_kick_reported);
  console.log('Takeover events:', takeoverEvents.length);
  console.log('Takeover latency p95 (ms):', takeoverP95 ?? 'n/a');
})();
