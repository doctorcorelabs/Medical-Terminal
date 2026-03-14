import { createClient } from '@supabase/supabase-js';
import { handler as enqueueAlertsHandler } from './enqueue-alert-notifications.mjs';
import { handler as sendTelegramHandler } from './send-telegram-notifications.mjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

const ALLOWED_LEVELS = new Set(['info', 'warning', 'critical']);

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

function parseBody(rawBody) {
  if (!rawBody) return {};
  try {
    return JSON.parse(rawBody);
  } catch {
    return null;
  }
}

function parseFunctionBody(response) {
  try {
    return typeof response?.body === 'string' ? JSON.parse(response.body) : (response?.body || {});
  } catch {
    return {};
  }
}

function validateInput(body) {
  const title = String(body?.title || '').trim();
  const message = String(body?.message || '').trim();
  const level = String(body?.level || 'info').trim().toLowerCase();
  const channels = {
    in_app: body?.channels?.in_app !== false,
    telegram: body?.channels?.telegram !== false,
  };
  const criticalOverride = Boolean(body?.critical_override);

  if (!title || title.length < 3) {
    return { ok: false, error: 'Judul minimal 3 karakter.' };
  }
  if (title.length > 120) {
    return { ok: false, error: 'Judul maksimal 120 karakter.' };
  }
  if (!message || message.length < 8) {
    return { ok: false, error: 'Isi pesan minimal 8 karakter.' };
  }
  if (message.length > 2000) {
    return { ok: false, error: 'Isi pesan maksimal 2000 karakter.' };
  }
  if (!ALLOWED_LEVELS.has(level)) {
    return { ok: false, error: 'Level broadcast tidak valid.' };
  }
  if (!channels.in_app && !channels.telegram) {
    return { ok: false, error: 'Pilih minimal satu channel pengiriman.' };
  }

  return {
    ok: true,
    value: {
      title,
      message,
      level,
      channels,
      critical_override: level === 'critical' ? criticalOverride : false,
    },
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  const token = getBearerToken(event.headers.authorization || event.headers.Authorization);
  if (!token) return json(401, { ok: false, error: 'Missing bearer token' });

  const body = parseBody(event.body);
  if (body === null) return json(400, { ok: false, error: 'Payload JSON tidak valid.' });

  const validation = validateInput(body);
  if (!validation.ok) return json(400, { ok: false, error: validation.error });

  const payload = validation.value;

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
      return json(403, { ok: false, error: 'Akses ditolak. Hanya admin yang dapat mengirim broadcast.' });
    }

    const correlationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    let announcementId = null;
    if (payload.channels.in_app) {
      let annRes = await supabase
        .from('admin_announcements')
        .insert({
          title: payload.title,
          message: payload.message,
          level: payload.level,
          target: 'all',
          active: true,
          created_by: userId,
          updated_at: nowIso,
          source_type: 'admin_alert_broadcast',
          correlation_id: correlationId,
        })
        .select('id')
        .single();

      if (annRes.error && String(annRes.error.message || '').toLowerCase().includes('column')) {
        annRes = await supabase
          .from('admin_announcements')
          .insert({
            title: payload.title,
            message: payload.message,
            level: payload.level,
            target: 'all',
            active: true,
            created_by: userId,
            updated_at: nowIso,
          })
          .select('id')
          .single();
      }

      if (annRes.error) throw annRes.error;
      announcementId = annRes.data?.id || null;
    }

    let alertEventId = null;
    let dispatchSummary = null;
    if (payload.channels.telegram) {
      let alertRes = await supabase
        .from('alert_events')
        .insert({
          level: payload.level,
          title: payload.title,
          message: payload.message,
          status: 'open',
          source: 'admin-broadcast',
          rule_key: 'admin_broadcast',
          payload: {
            is_admin_broadcast: true,
            audience_scope: 'all',
            channels: payload.channels,
            correlation_id: correlationId,
            critical_override: payload.critical_override,
            created_by: userId,
            in_app_announcement_id: announcementId,
          },
          created_by: userId,
          is_admin_broadcast: true,
          audience_scope: 'all',
          correlation_id: correlationId,
          updated_at: nowIso,
        })
        .select('id')
        .single();

      if (alertRes.error && String(alertRes.error.message || '').toLowerCase().includes('column')) {
        alertRes = await supabase
          .from('alert_events')
          .insert({
            level: payload.level,
            title: payload.title,
            message: payload.message,
            status: 'open',
            source: 'admin-broadcast',
            rule_key: 'admin_broadcast',
            payload: {
              is_admin_broadcast: true,
              audience_scope: 'all',
              channels: payload.channels,
              correlation_id: correlationId,
              critical_override: payload.critical_override,
              created_by: userId,
              in_app_announcement_id: announcementId,
            },
            updated_at: nowIso,
          })
          .select('id')
          .single();
      }

      if (alertRes.error) throw alertRes.error;
      alertEventId = alertRes.data?.id || null;

      if (alertEventId) {
        const enqueueRes = await enqueueAlertsHandler({ httpMethod: 'GET', internalCall: true });
        const sendRes = await sendTelegramHandler({ httpMethod: 'GET', internalCall: true });
        const enqueueBody = parseFunctionBody(enqueueRes);
        const sendBody = parseFunctionBody(sendRes);

        dispatchSummary = {
          enqueue: enqueueBody,
          dispatch: sendBody,
        };
      }
    }

    return json(200, {
      ok: true,
      correlation_id: correlationId,
      channels: payload.channels,
      critical_override: payload.critical_override,
      announcement_id: announcementId,
      alert_event_id: alertEventId,
      dispatch_summary: dispatchSummary,
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Gagal membuat broadcast alert' });
  }
};
