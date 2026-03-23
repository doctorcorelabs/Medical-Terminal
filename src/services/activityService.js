import { supabase } from './supabaseClient';

/**
 * Log user activity event for admin analytics.
 * Fire-and-forget by design.
 */
export async function logUserActivity({ userId, eventType, featureKey = null, metadata = null }) {
  if (!userId || !eventType) return;
  try {
    await supabase.from('user_activity_events').insert({
      user_id: userId,
      event_type: eventType,
      feature_key: featureKey,
      metadata,
    });
  } catch (err) {
    // non-fatal, but keep minimal telemetry for operational debugging
    console.warn('[activityService] Failed to log user activity', {
      userId,
      eventType,
      featureKey,
      error: err?.message || String(err || 'unknown'),
    });
  }
}
