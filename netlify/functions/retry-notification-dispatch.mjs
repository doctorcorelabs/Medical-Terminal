import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 3));
const STALE_LOCK_MINUTES = Math.max(1, Number(process.env.NOTIFICATION_STALE_LOCK_MINUTES || 10));

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
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const now = new Date();
    const staleBeforeIso = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000).toISOString();

    const { data: staleRows, error: staleError } = await supabase
      .from('notification_dispatch_queue')
      .select('id')
      .eq('status', 'processing')
      .lt('locked_at', staleBeforeIso)
      .limit(1000);

    if (staleError) throw staleError;

    let recoveredStale = 0;
    if (staleRows && staleRows.length > 0) {
      const staleIds = staleRows.map((row) => row.id);
      const { error: updateStaleError } = await supabase
        .from('notification_dispatch_queue')
        .update({
          status: 'pending',
          lock_owner: null,
          locked_at: null,
          next_attempt_at: now.toISOString(),
          updated_at: now.toISOString(),
        })
        .in('id', staleIds);
      if (updateStaleError) throw updateStaleError;
      recoveredStale = staleIds.length;
    }

    const { data: retryRows, error: retryError } = await supabase
      .from('notification_dispatch_queue')
      .select('id')
      .eq('status', 'failed')
      .lt('attempt_count', MAX_ATTEMPTS)
      .lte('next_attempt_at', now.toISOString())
      .limit(1000);

    if (retryError) throw retryError;

    let movedToPending = 0;
    if (retryRows && retryRows.length > 0) {
      const retryIds = retryRows.map((row) => row.id);
      const { error: updateRetryError } = await supabase
        .from('notification_dispatch_queue')
        .update({
          status: 'pending',
          lock_owner: null,
          locked_at: null,
          updated_at: now.toISOString(),
        })
        .in('id', retryIds);
      if (updateRetryError) throw updateRetryError;
      movedToPending = retryIds.length;
    }

    return json(200, {
      ok: true,
      recoveredStale,
      movedToPending,
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to recover notification retries' });
  }
};
