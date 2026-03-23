import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';
import {
    mapFeatureFlagsRows,
    reduceFeatureFlagRealtimePayload,
    resolveFeatureEnabled,
    resolveMaintenanceMessage,
} from './featureFlagUtils';

const FeatureFlagContext = createContext();

export function FeatureFlagProvider({ children }) {
    const { isAdmin } = useAuth();
    const [flags, setFlags] = useState({});  // { [key]: { enabled, maintenance_message } }
    const [loaded, setLoaded] = useState(false);

    const loadFlags = useCallback(async () => {
        try {
            const { data, error } = await supabase
                .from('feature_flags')
                .select('key, enabled, maintenance_message');
            if (!error && data) {
                setFlags(mapFeatureFlagsRows(data));
            }
        } catch (_err) {
            // non-fatal — fall through, flags remain empty (all enabled for safety)
        } finally {
            setLoaded(true);
        }
    }, []);

    useEffect(() => {
        loadFlags();

        // Realtime subscription: propagate admin changes instantly to all online users
        const channel = supabase
            .channel('feature_flags_changes')
            .on(
                'postgres_changes',
                { event: '*', schema: 'public', table: 'feature_flags' },
                (payload) => {
                    setFlags(prev => reduceFeatureFlagRealtimePayload(prev, payload));
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [loadFlags]);

    const isEnabled = useCallback((key) => {
        // Admins bypass ALL feature flags
        return resolveFeatureEnabled({ isAdmin, loaded, flags, key });
    }, [isAdmin, flags, loaded]);

    const getMaintenanceMessage = useCallback((key) => {
        return resolveMaintenanceMessage(flags, key);
    }, [flags]);

    return (
        <FeatureFlagContext.Provider value={{ isEnabled, getMaintenanceMessage, flags, refreshFlags: loadFlags, loaded }}>
            {children}
        </FeatureFlagContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useFeatureFlags() {
    return useContext(FeatureFlagContext);
}
