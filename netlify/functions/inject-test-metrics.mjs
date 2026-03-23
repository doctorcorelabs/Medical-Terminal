import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '';
const simulationKey = process.env.ALERT_SIMULATION_KEY || '';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-simulation-key',
    },
    body: JSON.stringify(body),
  };
}

function buildMetricRows(metricName, values, source = 'simulator') {
  return values.map((value) => ({
    source,
    metric_name: metricName,
    metric_value: Number(value),
    measured_at: new Date().toISOString(),
    labels: { simulated: true },
  }));
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method Not Allowed' });

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('SUPABASE_URL');
    if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY');
    return json(500, {
      ok: false,
      error: `Missing Supabase env: ${missing.join(', ')}`,
    });
  }

  const reqKey = event.headers['x-simulation-key'] || event.headers['X-Simulation-Key'] || '';
  if (simulationKey && reqKey !== simulationKey) {
    return json(401, { ok: false, error: 'Invalid simulation key.' });
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body.' });
  }

  const scenario = body.scenario || 'high_error_rate';
  const testUserId = body.user_id || null;

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    if (scenario === 'ping') {
      return json(200, {
        ok: true,
        scenario: 'ping',
        message: 'Simulator endpoint reachable.',
        keyProtected: Boolean(simulationKey),
      });
    }

    const inserted = { metrics: 0, activities: 0 };

    if (scenario === 'high_error_rate') {
      const rows = buildMetricRows('error_rate', [8.2, 7.5, 9.1, 6.8, 8.7]);
      const { error } = await supabase.from('system_health_metrics').insert(rows);
      if (error) throw error;
      inserted.metrics += rows.length;
    } else if (scenario === 'high_latency') {
      const rows = buildMetricRows('latency_ms', [1350, 1420, 1280, 1550, 1700, 1490]);
      const { error } = await supabase.from('system_health_metrics').insert(rows);
      if (error) throw error;
      inserted.metrics += rows.length;
    } else if (scenario === 'normal') {
      const rows = [
        ...buildMetricRows('error_rate', [0.3, 0.5, 0.7, 0.6]),
        ...buildMetricRows('latency_ms', [180, 220, 260, 210, 240]),
      ];
      const { error } = await supabase.from('system_health_metrics').insert(rows);
      if (error) throw error;
      inserted.metrics += rows.length;
    } else if (scenario === 'sync_fail_spike') {
      if (!testUserId) {
        return json(400, { ok: false, error: 'scenario sync_fail_spike membutuhkan user_id valid.' });
      }
      const rows = Array.from({ length: 25 }).map(() => ({
        user_id: testUserId,
        event_type: 'sync_failed',
        feature_key: null,
        metadata: { simulated: true },
        occurred_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('user_activity_events').insert(rows);
      if (error) throw error;
      inserted.activities += rows.length;
    } else if (scenario === 'traffic_spike') {
      if (!testUserId) {
        return json(400, { ok: false, error: 'scenario traffic_spike membutuhkan user_id valid.' });
      }
      const rows = Array.from({ length: 600 }).map((_, idx) => ({
        user_id: testUserId,
        event_type: idx % 3 === 0 ? 'tools_page_view' : idx % 3 === 1 ? 'tool_action_started' : 'feature_opened',
        feature_key: 'simulated',
        metadata: { simulated: true },
        occurred_at: new Date().toISOString(),
      }));
      const { error } = await supabase.from('user_activity_events').insert(rows);
      if (error) throw error;
      inserted.activities += rows.length;
    } else {
      return json(400, { ok: false, error: `Unknown scenario: ${scenario}` });
    }

    return json(200, {
      ok: true,
      scenario,
      inserted,
      note: simulationKey ? 'Protected by ALERT_SIMULATION_KEY' : 'No ALERT_SIMULATION_KEY set (open access in current environment).',
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to inject test metrics.' });
  }
};
