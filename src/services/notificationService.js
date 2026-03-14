const NOTIFICATION_CYCLE_COOLDOWN_MS = 15 * 1000;
let lastCycleTriggerAt = 0;

/**
 * Trigger backend notification cycle to enqueue + dispatch quickly after user actions.
 * Uses short cooldown to avoid excessive requests during rapid edits.
 */
export async function triggerNotificationCycle({ reason = 'manual' } = {}) {
  const now = Date.now();
  if (now - lastCycleTriggerAt < NOTIFICATION_CYCLE_COOLDOWN_MS) return;
  if (!navigator.onLine) return;

  lastCycleTriggerAt = now;

  try {
    await fetch('/.netlify/functions/notification-cycle', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ reason, triggeredAt: new Date().toISOString() }),
    });
  } catch {
    // best-effort only
  }
}
