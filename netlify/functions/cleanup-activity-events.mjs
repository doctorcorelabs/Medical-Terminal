import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body),
  };
}

export const handler = async (event) => {
  if (event?.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL or SUPABASE_URL');
    if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY');
    return json(500, { ok: false, error: `Missing Supabase env: ${missing.join(', ')}` });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const cutoff = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000));

  try {
    const { data, error } = await supabase
      .from('user_activity_events')
      .delete()
      .lt('occurred_at', cutoff.toISOString())
      .select('id');

    if (error) throw error;

    const deletedRows = data?.length || 0;
    console.log(`[cleanup-activity-events] deleted=${deletedRows} cutoff=${cutoff.toISOString()}`);

    return json(200, {
      ok: true,
      deletedRows,
      cutoff: cutoff.toISOString(),
      retentionDays: 14,
      ranAt: new Date().toISOString(),
    });
  } catch (err) {
    console.error('[cleanup-activity-events] failed:', err?.message || err);
    return json(500, {
      ok: false,
      error: err?.message || 'Cleanup failed',
      cutoff: cutoff.toISOString(),
    });
  }
};
