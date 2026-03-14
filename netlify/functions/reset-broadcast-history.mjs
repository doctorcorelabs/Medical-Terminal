import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function getBearerToken(headerValue) {
  const raw = String(headerValue || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const token = getBearerToken(event.headers.authorization || event.headers.Authorization);
  if (!token) return json(401, { ok: false, error: 'Missing bearer token' });

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: userData, error: userErr } = await supabase.auth.getUser(token);
    if (userErr || !userData?.user?.id) {
      return json(401, { ok: false, error: 'Unauthorized' });
    }

    const userId = userData.user.id;
    const { data: profile, error: profileErr } = await supabase
      .from('profiles')
      .select('role')
      .eq('user_id', userId)
      .maybeSingle();

    if (profileErr) throw profileErr;
    if (!profile || profile.role !== 'admin') {
      return json(403, { ok: false, error: 'Akses ditolak. Hanya admin yang dapat reset riwayat broadcast.' });
    }

    const { data: alerts, error: alertsErr } = await supabase
      .from('alert_events')
      .select('id, payload')
      .eq('source', 'admin-broadcast')
      .limit(10000);
    if (alertsErr) throw alertsErr;

    const alertIds = (alerts || []).map((row) => String(row.id));
    const correlationIds = [...new Set((alerts || []).map((row) => row?.payload?.correlation_id).filter(Boolean))];
    const announcementIds = [...new Set((alerts || []).map((row) => row?.payload?.in_app_announcement_id).filter(Boolean))];

    if (alertIds.length > 0) {
      await supabase
        .from('notification_dispatch_logs')
        .delete()
        .eq('source_type', 'alert')
        .in('source_id', alertIds);

      await supabase
        .from('notification_dispatch_queue')
        .delete()
        .eq('source_type', 'alert')
        .in('source_id', alertIds);

      await supabase
        .from('alert_events')
        .delete()
        .in('id', alertIds);
    }

    if (announcementIds.length > 0) {
      await supabase
        .from('admin_announcements')
        .delete()
        .in('id', announcementIds);
    }

    if (correlationIds.length > 0) {
      await supabase
        .from('admin_announcements')
        .delete()
        .in('correlation_id', correlationIds);
    }

    return json(200, {
      ok: true,
      deleted_alerts: alertIds.length,
      deleted_correlations: correlationIds.length,
      deleted_announcements: announcementIds.length,
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Gagal reset riwayat broadcast' });
  }
};
