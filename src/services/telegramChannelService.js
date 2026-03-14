import { supabase } from './supabaseClient';

const TELEGRAM_CHANNEL = 'telegram';

function getBrowserTimezone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'Asia/Jakarta';
  } catch {
    return 'Asia/Jakarta';
  }
}

export function getTelegramBotUsername() {
  const raw = String(import.meta.env.VITE_TELEGRAM_BOT_USERNAME || '').trim();
  return raw.replace(/^@/, '');
}

export function buildTelegramStartPayload(userId) {
  return `medterminal_${String(userId || '').replace(/-/g, '')}`.slice(0, 64);
}

export function buildTelegramConnectUrl(userId) {
  const botUsername = getTelegramBotUsername();
  if (!botUsername || !userId) return null;
  const payload = buildTelegramStartPayload(userId);
  return `https://t.me/${botUsername}?start=${encodeURIComponent(payload)}`;
}

export async function getTelegramChannel(userId) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from('notification_channels')
    .select('id, user_id, channel, telegram_chat_id, is_verified, is_enabled, schedule_enabled, alert_enabled, timezone, quiet_hours_start, quiet_hours_end, updated_at')
    .eq('user_id', userId)
    .eq('channel', TELEGRAM_CHANNEL)
    .maybeSingle();

  if (error) throw error;
  return data;
}

export async function ensureTelegramChannel(userId) {
  if (!userId) return null;

  const timezone = getBrowserTimezone();
  const nowIso = new Date().toISOString();

  const { data, error } = await supabase
    .from('notification_channels')
    .upsert({
      user_id: userId,
      channel: TELEGRAM_CHANNEL,
      is_enabled: true,
      schedule_enabled: true,
      alert_enabled: true,
      timezone,
      updated_at: nowIso,
    }, {
      onConflict: 'user_id,channel',
      ignoreDuplicates: false,
    })
    .select('id, user_id, channel, telegram_chat_id, is_verified, is_enabled, schedule_enabled, alert_enabled, timezone, quiet_hours_start, quiet_hours_end, updated_at')
    .single();

  if (error) throw error;
  return data;
}

export async function updateTelegramChannel(userId, patch) {
  if (!userId) return null;

  const updates = {
    ...patch,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from('notification_channels')
    .update(updates)
    .eq('user_id', userId)
    .eq('channel', TELEGRAM_CHANNEL)
    .select('id, user_id, channel, telegram_chat_id, is_verified, is_enabled, schedule_enabled, alert_enabled, timezone, quiet_hours_start, quiet_hours_end, updated_at')
    .single();

  if (error) throw error;
  return data;
}
