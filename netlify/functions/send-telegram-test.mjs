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

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function getBearerToken(headerValue) {
  const raw = String(headerValue || '');
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

function buildTestMessage() {
  const now = new Date();
  const when = now.toLocaleString('id-ID', {
    timeZone: 'Asia/Jakarta',
    day: '2-digit',
    month: 'long',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  return [
    '🧪 <b>Notifikasi Tes Berhasil Dibuat</b>',
    '<i>Ini adalah pesan uji dari halaman Jadwal MedxTerminal.</i>',
    `<i>Waktu:</i> ${escapeHtml(when)} WIB`,
  ].join('\n');
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

    const { data: channel, error: channelErr } = await supabase
      .from('notification_channels')
      .select('telegram_chat_id, is_verified, is_enabled, schedule_enabled')
      .eq('user_id', userId)
      .eq('channel', 'telegram')
      .maybeSingle();

    if (channelErr) throw channelErr;

    const isReady = !!(channel?.telegram_chat_id && channel?.is_verified && channel?.is_enabled && channel?.schedule_enabled);
    if (!isReady) {
      return json(400, {
        ok: false,
        error: 'Telegram belum terhubung atau reminder jadwal masih nonaktif.',
      });
    }

    const row = {
      source_type: 'schedule',
      source_id: `manual-test-${Date.now()}`,
      user_id: userId,
      channel: 'telegram',
      idempotency_key: `manual-test:${userId}:${Date.now()}:${crypto.randomUUID()}`,
      payload: {
        text: buildTestMessage(),
        parse_mode: 'HTML',
        telegram_chat_id: channel.telegram_chat_id,
        event_date: new Date().toISOString().slice(0, 10),
        event_time: new Date().toISOString().slice(11, 16),
      },
      status: 'pending',
      next_attempt_at: new Date().toISOString(),
    };

    const { data: inserted, error: insertErr } = await supabase
      .from('notification_dispatch_queue')
      .insert(row)
      .select('id')
      .single();

    if (insertErr) throw insertErr;

    return json(200, { ok: true, queueId: inserted?.id || null });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to enqueue test notification' });
  }
};
