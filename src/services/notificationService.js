import { supabase } from './supabaseClient';

const NOTIFICATION_CYCLE_COOLDOWN_MS = 15 * 1000;
let lastCycleTriggerAt = 0;

/**
 * Trigger backend notification cycle to enqueue + dispatch quickly after user actions.
 * Uses short cooldown to avoid excessive requests during rapid edits.
 */
export async function triggerNotificationCycle({ reason = 'manual', force = false } = {}) {
  const now = Date.now();
  if (!force && now - lastCycleTriggerAt < NOTIFICATION_CYCLE_COOLDOWN_MS) return;
  if (!navigator.onLine) return;

  try {
    const { data: sessionData } = await supabase.auth.getSession();
    const accessToken = sessionData?.session?.access_token;
    if (!accessToken) return;

    lastCycleTriggerAt = now;

    await fetch('/.netlify/functions/notification-cycle', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ reason, triggeredAt: new Date().toISOString() }),
    });
  } catch {
    // best-effort only
  }
}

/**
 * Queue a manual test notification for current authenticated user.
 * Backend validates Telegram connection and auth token.
 */
export async function sendTelegramTestNotification() {
  const { data: sessionData } = await supabase.auth.getSession();
  const accessToken = sessionData?.session?.access_token;
  if (!accessToken) throw new Error('Sesi login tidak ditemukan.');

  const res = await fetch('/.netlify/functions/send-telegram-test', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ requestedAt: new Date().toISOString() }),
  });

  let payload = {};
  try {
    payload = await res.json();
  } catch {
    payload = {};
  }

  if (!res.ok || payload?.ok === false) {
    throw new Error(payload?.error || 'Gagal membuat notifikasi tes.');
  }

  await triggerNotificationCycle({ reason: 'telegram_test_notification', force: true });
  return payload;
}
