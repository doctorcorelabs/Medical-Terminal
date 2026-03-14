import { useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useFeatureFlags } from '../context/FeatureFlagContext';
import { logUserActivity } from '../services/activityService';
import { logFeatureUsage } from '../services/usageService';
import MaintenanceBox from './MaintenanceBox';

/**
 * Wraps a feature/page: if the feature flag is disabled (and user is not admin),
 * renders a MaintenanceBox instead of the children.
 *
 * @param {string} featureKey - key matching a row in feature_flags table
 * @param {React.ReactNode} children
 */
export default function FeatureGate({ featureKey, children }) {
    const { isEnabled, getMaintenanceMessage } = useFeatureFlags();
    const { user } = useAuth();
    const enabled = isEnabled(featureKey);

    // Log usage on mount (fire-and-forget, only when feature is accessible)
    useEffect(() => {
        if (enabled && user?.id) {
            logFeatureUsage(featureKey, user.id);
            logUserActivity({ userId: user.id, eventType: 'feature_opened', featureKey });
        }
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    if (!enabled) {
        return <MaintenanceBox message={getMaintenanceMessage(featureKey)} />;
    }

    return children;
}
