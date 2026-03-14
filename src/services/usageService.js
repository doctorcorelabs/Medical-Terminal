import { supabase } from './supabaseClient';

/**
 * Log a feature access event for analytics.
 * Fire-and-forget: errors are silently ignored so failures never affect the user.
 *
 * @param {string} featureKey - key matching toolsCatalog id or known feature name
 * @param {string|null} userId - auth user id
 */
export async function logFeatureUsage(featureKey, userId) {
    if (!featureKey || !userId) return;
    try {
        await supabase.from('usage_logs').insert({ feature_key: featureKey, user_id: userId });
    } catch (_err) {
        // non-fatal, do nothing
    }
}
