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

    const workerUrl = import.meta.env.VITE_NOTIFICATION_WORKER_URL;

    // Use Cloudflare Worker endpoint if available, fallback to Netlify logic (for gradual migration)
    const url = workerUrl ? `${workerUrl}/run-notifications` : '/.netlify/functions/notification-cycle';

    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${accessToken}`,
      },
      body: JSON.stringify({ reason, triggeredAt: new Date().toISOString() }),
    });

    try { await res.json(); } catch { /* ignore malformed response body */ }

    if (!res.ok) {
      throw new Error(`notification-cycle returned ${res.status}`);
    }

    // Apply cooldown only after a successful trigger.
    lastCycleTriggerAt = now;
  } catch (err) {
    console.warn('Notification cycle trigger failed:', err?.message || err);
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

  const workerUrl = import.meta.env.VITE_NOTIFICATION_WORKER_URL;
  const url = workerUrl ? `${workerUrl}/test-notification` : '/.netlify/functions/send-telegram-test';

  const res = await fetch(url, {
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

  // Not needed if the test endpoint already triggers dispatch
  // await triggerNotificationCycle({ reason: 'telegram_test_notification', force: true });
  return payload;
}
