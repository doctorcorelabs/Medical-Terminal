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
  } catch (_err) {
    // non-fatal
  }
}
