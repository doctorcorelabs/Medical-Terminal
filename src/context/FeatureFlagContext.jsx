import { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';

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
                const map = {};
                data.forEach(f => { map[f.key] = { enabled: f.enabled, maintenance_message: f.maintenance_message }; });
                setFlags(map);
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
                    setFlags(prev => {
                        if (payload.eventType === 'DELETE') {
                            const next = { ...prev };
                            delete next[payload.old.key];
                            return next;
                        }
                        const row = payload.new;
                        return {
                            ...prev,
                            [row.key]: { enabled: row.enabled, maintenance_message: row.maintenance_message },
                        };
                    });
                }
            )
            .subscribe();

        return () => { supabase.removeChannel(channel); };
    }, [loadFlags]);

    const isEnabled = useCallback((key) => {
        // Admins bypass ALL feature flags
        if (isAdmin) return true;
        if (!loaded) return true; // optimistic: show features while loading
        const flag = flags[key];
        // If flag not registered in DB, default to enabled
        if (!flag) return true;
        return flag.enabled;
    }, [isAdmin, flags, loaded]);

    const getMaintenanceMessage = useCallback((key) => {
        return flags[key]?.maintenance_message
            ?? 'Fitur ini sedang dalam perbaikan. Mohon coba beberapa saat lagi.';
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
