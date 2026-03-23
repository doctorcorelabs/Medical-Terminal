import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || '';
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';
const telegramWebhookSecret = process.env.TELEGRAM_WEBHOOK_SECRET || '';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Telegram-Bot-Api-Secret-Token',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
    },
    body: JSON.stringify(body),
  };
}

function decodeUserIdFromStartPayload(payload) {
  const raw = String(payload || '').trim();
  const match = raw.match(/^medterminal_([a-fA-F0-9]{32})$/);
  if (!match) return null;
  const hex = match[1].toLowerCase();
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

function parseStartPayload(text) {
  const clean = String(text || '').trim();
  const cmdMatch = clean.match(/^\/start(?:@[a-zA-Z0-9_]+)?(?:\s+(.+))?$/);
  if (!cmdMatch) return null;
  return (cmdMatch[1] || '').trim();
}

function escapeHtml(value = '') {
  return String(value)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

async function sendTelegramMessage(chatId, text) {
  if (!telegramBotToken || !chatId) return;

  await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: 'HTML',
      disable_web_page_preview: true,
    }),
  });
}

function isUniqueViolation(error) {
  if (!error) return false;
  return error.code === '23505' || String(error.message || '').toLowerCase().includes('duplicate');
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });
  if (event.httpMethod !== 'POST') return json(405, { ok: false, error: 'Method not allowed' });

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }

  if (!telegramBotToken) {
    return json(500, { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' });
  }

  if (telegramWebhookSecret) {
    const incomingSecret = event.headers['x-telegram-bot-api-secret-token'] || event.headers['X-Telegram-Bot-Api-Secret-Token'];
    if (incomingSecret !== telegramWebhookSecret) {
      return json(401, { ok: false, error: 'Invalid webhook secret' });
    }
  }

  let update;
  try {
    update = JSON.parse(event.body || '{}');
  } catch {
    return json(400, { ok: false, error: 'Invalid JSON body' });
  }

  const message = update?.message || update?.edited_message;
  const chatId = message?.chat?.id ? String(message.chat.id) : null;
  const firstName = message?.from?.first_name || 'dokter';
  const text = String(message?.text || '');

  if (!message || !chatId) {
    return json(200, { ok: true, ignored: true, reason: 'No message/chat found' });
  }

  const payload = parseStartPayload(text);
  if (payload === null) {
    return json(200, { ok: true, ignored: true, reason: 'Not a /start command' });
  }

  const userId = decodeUserIdFromStartPayload(payload);
  if (!userId) {
    await sendTelegramMessage(
      chatId,
      [
        '⚠️ <b>Koneksi belum berhasil</b>',
        'Silakan kembali ke aplikasi MedxTerminal, lalu tekan tombol <b>Hubungkan Telegram</b> lagi.',
      ].join('\n'),
    );
    return json(200, { ok: true, linked: false, reason: 'Invalid start payload' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const upsertPayload = {
      user_id: userId,
      channel: 'telegram',
      telegram_chat_id: chatId,
      is_verified: true,
      is_enabled: true,
      schedule_enabled: true,
      alert_enabled: true,
      updated_at: new Date().toISOString(),
    };

    const { error: upsertError } = await supabase
      .from('notification_channels')
      .upsert(upsertPayload, {
        onConflict: 'user_id,channel',
        ignoreDuplicates: false,
      });

    if (upsertError) {
      if (isUniqueViolation(upsertError)) {
        await sendTelegramMessage(
          chatId,
          [
            '⚠️ <b>Chat Telegram ini sudah terhubung ke akun lain</b>',
            'Jika ini tidak sengaja, putuskan koneksi lama dari akun sebelumnya lalu coba lagi.',
          ].join('\n'),
        );
        return json(200, { ok: true, linked: false, reason: 'chat_id_already_used' });
      }
      throw upsertError;
    }

    await sendTelegramMessage(
      chatId,
      [
        `✅ <b>Halo ${escapeHtml(firstName)}, Telegram berhasil terhubung.</b>`,
        'Mulai sekarang reminder jadwal Anda aktif otomatis.',
        'Silakan kembali ke halaman Jadwal untuk melihat status <b>Terhubung</b>.',
      ].join('\n'),
    );

    return json(200, { ok: true, linked: true, userId, chatId });
  } catch (err) {
    await sendTelegramMessage(
      chatId,
      [
        '⚠️ <b>Koneksi sementara gagal</b>',
        'Silakan coba lagi dalam beberapa saat dari aplikasi MedxTerminal.',
      ].join('\n'),
    );
    return json(500, { ok: false, error: err.message || 'Failed to link Telegram account' });
  }
};
