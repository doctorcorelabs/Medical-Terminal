let createSupabaseClient;

async function getCreateClient() {
  if (createSupabaseClient) return createSupabaseClient;
  const mod = await import('@supabase/supabase-js');
  createSupabaseClient = mod.createClient;
  return createSupabaseClient;
}

function json(status, body) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-key, apikey, x-client-info, Accept, Origin',
      Vary: 'Origin',
    },
  });
}

function empty(status = 204) {
  return new Response(null, {
    status,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-key, apikey, x-client-info, Accept, Origin',
      Vary: 'Origin',
    },
  });
}

function parseLookbackMinutes(value, fallback = 15) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed) || parsed <= 0) return fallback;
  return Math.min(parsed, 24 * 60);
}

function getBucketStartIso(now, minutes) {
  const windowMs = minutes * 60 * 1000;
  const bucketStartMs = Math.floor(now.getTime() / windowMs) * windowMs;
  return new Date(bucketStartMs).toISOString();
}

function summarizeWarningCodes(rows) {
  const counts = new Map();

  for (const row of rows) {
    const codes = Array.isArray(row?.metadata?.warningCodes) ? row.metadata.warningCodes : [];
    for (const code of codes) {
      const key = String(code || '').trim();
      if (!key) continue;
      counts.set(key, (counts.get(key) || 0) + 1);
    }
  }

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([code, count]) => ({ code, count }));
}

async function verifyBearerUser(supabase, token) {
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data?.user?.id) return null;
  return data.user.id;
}

async function isAdminUser(supabase, userId) {
  if (!userId) return false;

  const { data, error } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) return false;
  return String(data?.role || '').toLowerCase() === 'admin';
}

async function authorizeRequest(request, env, supabase) {
  const internalKey = request.headers.get('x-internal-key');
  const authHeader = request.headers.get('Authorization') || '';
  const expected = env.OPS_INTERNAL_KEY || env.INTERNAL_OPS_KEY || '';

  if (expected && internalKey === expected) {
    return { ok: true, mode: 'internal-key' };
  }

  if (expected && authHeader === `Bearer ${expected}`) {
    return { ok: true, mode: 'internal-bearer' };
  }

  if (authHeader.startsWith('Bearer ')) {
    const token = authHeader.slice('Bearer '.length).trim();
    const userId = await verifyBearerUser(supabase, token);
    if (userId) {
      const isAdmin = await isAdminUser(supabase, userId);
      if (isAdmin) return { ok: true, mode: 'admin-bearer', userId };
      return { ok: false, status: 403, error: 'Admin access required' };
    }
  }

  return { ok: false, status: 401, error: 'Unauthorized' };
}

async function runAggregation(env, options = {}) {
  const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
  const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';

  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY');
  }

  const createClient = await getCreateClient();
  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const lookbackMinutes = parseLookbackMinutes(options.lookbackMinutes, parseLookbackMinutes(env.SYNC_HEALTH_LOOKBACK_MINUTES, 15));
  const now = new Date();
  const sinceIso = new Date(now.getTime() - lookbackMinutes * 60 * 1000).toISOString();
  const bucketStart = getBucketStartIso(now, lookbackMinutes);

  const { data: events, error: eventsError } = await supabase
    .from('user_activity_events')
    .select('user_id, metadata, occurred_at')
    .eq('event_type', 'offline_sync_degraded')
    .gte('occurred_at', sinceIso);

  if (eventsError) throw eventsError;

  const rows = events || [];
  const eventCount = rows.length;
  const uniqueUsers = new Set(rows.map((item) => item.user_id).filter(Boolean)).size;
  const warningCountTotal = rows.reduce((sum, item) => {
    const next = Number(item?.metadata?.warningCount);
    return sum + (Number.isFinite(next) && next > 0 ? next : 0);
  }, 0);
  const warningAvg = eventCount > 0 ? warningCountTotal / eventCount : 0;
  const topWarningCodes = summarizeWarningCodes(rows);

  const measuredAt = now.toISOString();
  const labels = {
    window_minutes: lookbackMinutes,
    bucket_start: bucketStart,
    invocation: options.invocation || 'manual',
    top_warning_codes: topWarningCodes,
  };

  const metricNames = [
    'offline_sync_degraded_count',
    'offline_sync_degraded_users',
    'offline_sync_warning_avg',
  ];

  const { data: existingRows, error: existingError } = await supabase
    .from('system_health_metrics')
    .select('id, metric_name')
    .eq('source', 'offline_sync')
    .eq('labels->>bucket_start', bucketStart)
    .in('metric_name', metricNames)
    .limit(3);

  if (existingError) throw existingError;

  const existingMetricNames = new Set((existingRows || []).map((row) => row.metric_name));
  if (metricNames.every((name) => existingMetricNames.has(name))) {
    return {
      lookbackMinutes,
      measuredAt,
      insertedMetrics: 0,
      deduped: true,
      summarized: {
        eventCount,
        uniqueUsers,
        warningCountTotal,
        warningAvg: Number(warningAvg.toFixed(2)),
        topWarningCodes,
      },
    };
  }

  const metricRows = [
    {
      source: 'offline_sync',
      metric_name: 'offline_sync_degraded_count',
      metric_value: eventCount,
      labels,
      measured_at: measuredAt,
    },
    {
      source: 'offline_sync',
      metric_name: 'offline_sync_degraded_users',
      metric_value: uniqueUsers,
      labels,
      measured_at: measuredAt,
    },
    {
      source: 'offline_sync',
      metric_name: 'offline_sync_warning_avg',
      metric_value: Number(warningAvg.toFixed(2)),
      labels,
      measured_at: measuredAt,
    },
  ];

  const { error: insertError } = await supabase.from('system_health_metrics').insert(metricRows);
  if (insertError) throw insertError;

  return {
    lookbackMinutes,
    measuredAt,
    insertedMetrics: metricRows.length,
    summarized: {
      eventCount,
      uniqueUsers,
      warningCountTotal,
      warningAvg: Number(warningAvg.toFixed(2)),
      topWarningCodes,
    },
  };
}

export default {
  async scheduled(event, env, ctx) {
    ctx.waitUntil((async () => {
      try {
        const result = await runAggregation(env, {
          invocation: 'scheduled',
        });
        console.log('[sync-health] scheduled aggregation ok', {
          cron: event.cron,
          measuredAt: result.measuredAt,
          eventCount: result.summarized.eventCount,
        });
      } catch (err) {
        console.error('[sync-health] scheduled aggregation failed', {
          error: err?.message || String(err || 'unknown'),
          cron: event.cron,
        });
      }
    })());
  },

  async fetch(request, env) {
    if (request.method === 'OPTIONS') {
      return empty(204);
    }

    const url = new URL(request.url);

    if (request.method === 'GET' && (url.pathname === '/' || url.pathname === '/health')) {
      return json(200, {
        ok: true,
        worker: 'sync-health',
        message: 'Cloudflare sync health worker is running',
      });
    }

    if (request.method !== 'POST' || url.pathname !== '/run-sync-health') {
      return json(404, { ok: false, error: 'Not Found' });
    }

    const supabaseUrl = env.SUPABASE_URL || env.VITE_SUPABASE_URL || '';
    const serviceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY || env.SERVICE_ROLE_KEY || env.VITE_SUPABASE_SERVICE_ROLE_KEY || '';
    if (!supabaseUrl || !serviceRoleKey) {
      return json(500, {
        ok: false,
        error: 'Missing Supabase configuration',
      });
    }

    const createClient = await getCreateClient();
    const supabase = createClient(supabaseUrl, serviceRoleKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const auth = await authorizeRequest(request, env, supabase);
    if (!auth.ok) {
      return json(auth.status || 401, { ok: false, error: auth.error || 'Unauthorized' });
    }

    let lookbackMinutes;
    try {
      const body = await request.json().catch(() => ({}));
      lookbackMinutes = body?.lookbackMinutes;
    } catch {
      lookbackMinutes = undefined;
    }

    try {
      const result = await runAggregation(env, {
        lookbackMinutes,
        invocation: auth.mode || 'manual',
      });
      return json(200, {
        ok: true,
        ...result,
      });
    } catch (err) {
      return json(500, {
        ok: false,
        error: err?.message || 'Failed to aggregate sync health',
      });
    }
  },
};
