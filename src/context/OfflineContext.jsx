import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { pendingSync, setPendingSyncScope } from '../services/offlineQueue';
import { syncToSupabase, syncStasesToSupabase, syncSchedulesToSupabase } from '../services/dataService';
import { useAuth } from './AuthContext';
import { countConflicts, clearQueueForUser } from '../services/idbQueue';
import { storeSwConfig, triggerSwSync, onSwSyncComplete } from '../services/swConfig';
import { getPendingStatusFromQueue } from './offlineContextUtils';
import { logUserActivity } from '../services/activityService';

const OfflineContext = createContext();

function logSyncWarning(operation, userId, err) {
    console.warn('[OfflineContext] Sync warning', {
        operation,
        userId: userId || null,
        error: err?.message || String(err || 'unknown'),
    });
}

function buildWarningFingerprint(warnings) {
    if (!Array.isArray(warnings) || warnings.length === 0) return 'none';
    const compact = warnings.slice(0, 5).map((item) => {
        if (!item || typeof item !== 'object') return String(item || 'unknown');
        return `${item.scope || 'na'}:${item.code || 'na'}:${item.table || 'na'}`;
    });
    return compact.join('|');
}

export function OfflineProvider({ children }) {
    const { user } = useAuth();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState(null);
    const [syncFailed, setSyncFailed] = useState(false);
    const [syncDegraded, setSyncDegraded] = useState(false);
    const [hasStuckItems, setHasStuckItems] = useState(false);
    const [syncWarnings, setSyncWarnings] = useState([]);
    const [conflictCount, setConflictCount] = useState(0);
    const [pendingStatus, setPendingStatus] = useState(() => getPendingStatusFromQueue(pendingSync));
    const degradedTelemetryRef = useRef({ fingerprint: null, timestamp: 0 });
    const syncSourcesRef = useRef({ page: false, sw: false });
    const swSyncTimeoutRef = useRef(null);
    // Keep user ref so the `online` event handler can always access the latest user
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    useEffect(() => {
        setPendingSyncScope(user?.id || null);
        refreshPendingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    const setSyncSource = useCallback((source, active) => {
        syncSourcesRef.current[source] = Boolean(active);
        const anyActive = syncSourcesRef.current.page || syncSourcesRef.current.sw;
        setIsSyncing(anyActive);
    }, []);

    const beginSwSyncWindow = useCallback(() => {
        setSyncSource('sw', true);
        if (swSyncTimeoutRef.current) {
            clearTimeout(swSyncTimeoutRef.current);
        }
        swSyncTimeoutRef.current = setTimeout(() => {
            setSyncSource('sw', false);
            swSyncTimeoutRef.current = null;
        }, 30000);
    }, [setSyncSource]);

    // Store Supabase config + session into IDB for the service worker
    useEffect(() => { 
        const syncSessionToSw = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                await storeSwConfig(session || null);
            } catch (err) {
                console.warn('[OfflineContext] Failed to sync session to SW:', err);
            }
        };
        syncSessionToSw();

        const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
            storeSwConfig(session || null).catch((err) => {
                console.warn('[OfflineContext] Failed to update SW auth session:', err);
            });
        });

        return () => {
            authListener?.subscription?.unsubscribe?.();
        };
    }, [user]);

    // Refresh conflict count from IDB
    const refreshConflictCount = useCallback(() => {
        countConflicts()
            .then(setConflictCount)
            .catch((err) => {
                logSyncWarning('countConflicts', userRef.current?.id, err);
            });
    }, []);

    const refreshPendingStatus = useCallback(() => {
        setPendingStatus(getPendingStatusFromQueue(pendingSync));
    }, []);

    useEffect(() => {
        refreshConflictCount();
        refreshPendingStatus();
    }, [refreshConflictCount, refreshPendingStatus]);

    // Listen to SYNC_COMPLETE messages from the service worker
    useEffect(() => {
        const unsub = onSwSyncComplete(({ success, degraded, hasStuckItems, warningCount, warnings, userId: messageUserId }) => {
            const currentUserId = userRef.current?.id || null;
            const normalizedMessageUserId = messageUserId || null;

            // Only process messages for the current user to avoid 'ghost' alerts from previous sessions
            if (normalizedMessageUserId !== currentUserId) {
                return;
            }

            if (swSyncTimeoutRef.current) {
                clearTimeout(swSyncTimeoutRef.current);
                swSyncTimeoutRef.current = null;
            }
            setSyncSource('sw', false);
            if (success) {
                setLastSyncAt(new Date());
                setSyncFailed(false);
            } else {
                setSyncFailed(true);
            }
            const hasWarnings = Boolean(degraded || warningCount > 0);
            setSyncDegraded(hasWarnings);
            setHasStuckItems(Boolean(hasStuckItems));
            setSyncWarnings(Array.isArray(warnings) ? warnings : []);
            
            if (hasWarnings) {
                console.warn('[OfflineContext] SW sync completed with degraded warnings', {
                    warningCount: Number(warningCount) || (Array.isArray(warnings) ? warnings.length : 0),
                    warnings: Array.isArray(warnings) ? warnings : [],
                });

                const normalizedWarnings = Array.isArray(warnings) ? warnings : [];
                const now = Date.now();
                const fingerprint = buildWarningFingerprint(normalizedWarnings);
                const isDuplicateWithinCooldown =
                    degradedTelemetryRef.current.fingerprint === fingerprint
                    && (now - degradedTelemetryRef.current.timestamp) < 60_000;

                if (!isDuplicateWithinCooldown && userRef.current?.id) {
                    degradedTelemetryRef.current = { fingerprint, timestamp: now };
                    logUserActivity({
                        userId: userRef.current.id,
                        eventType: 'offline_sync_degraded',
                        featureKey: 'offline_sync',
                        metadata: {
                            warningCount: Number(warningCount) || normalizedWarnings.length,
                            warningCodes: normalizedWarnings
                                .map((item) => (item && typeof item === 'object' ? item.code : null))
                                .filter(Boolean)
                                .slice(0, 10),
                        },
                    }).catch((err) => {
                        logSyncWarning('telemetry.offline_sync_degraded', userRef.current?.id, err);
                    });
                }
            }
            refreshConflictCount();
            refreshPendingStatus();
        });
        return unsub;
    }, [refreshConflictCount, refreshPendingStatus, setSyncSource]);

    const syncInFlightRef = useRef(false);

    const flushPendingSync = useCallback(async (uid) => {
        const id = uid || userRef.current?.id;
        if (!id || !navigator.onLine) {
            refreshPendingStatus();
            return;
        }
        if (!pendingSync.hasAny()) {
            refreshPendingStatus();
            return;
        }

        // Prevent concurrent sync calls — guard re-entry
        if (syncInFlightRef.current) {
            console.warn('[OfflineContext] Sync already in flight, ignoring concurrent request');
            return;
        }

        syncInFlightRef.current = true;
        setSyncSource('page', true);
        setSyncFailed(false);
        let failed = false;

        try {
            try {
                if (pendingSync.hasPatients()) {
                    await syncToSupabase(id);
                    // syncToSupabase clears/marks the flag internally; if still set → failed
                }
            } catch (err) {
                logSyncWarning('syncToSupabase', id, err);
                failed = true;
            }
            try {
                if (pendingSync.hasStases()) {
                    await syncStasesToSupabase(id);
                }
            } catch (err) {
                logSyncWarning('syncStasesToSupabase', id, err);
                failed = true;
            }
            try {
                if (pendingSync.hasSchedules()) {
                    await syncSchedulesToSupabase(id);
                }
            } catch (err) {
                logSyncWarning('syncSchedulesToSupabase', id, err);
                failed = true;
            }
            // Also treat as failed if any flag is still set after sync attempts
            if (pendingSync.hasAny()) failed = true;

            setSyncFailed(failed);
            setSyncDegraded(false);
            setSyncWarnings([]);
            if (!failed) setLastSyncAt(new Date());
        } finally {
            syncInFlightRef.current = false;
            setSyncSource('page', false);
            refreshPendingStatus();
        }
    }, [refreshPendingStatus, setSyncSource]);
    
    const clearSyncQueue = useCallback(async () => {
        if (!user?.id) return;
        try {
            await clearQueueForUser(user.id);
            setSyncDegraded(false);
            setSyncWarnings([]);
            refreshPendingStatus();
        } catch (err) {
            logSyncWarning('clearSyncQueue', user.id, err);
            throw err;
        }
    }, [user?.id, refreshPendingStatus]);

    // Listen to browser online/offline events
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            // Try Background Sync via SW first, then fallback to page-level flush
            beginSwSyncWindow();
            triggerSwSync().catch((err) => {
                setSyncSource('sw', false);
                logSyncWarning('triggerSwSync', userRef.current?.id, err);
            });
            flushPendingSync();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        
        // Also sync when tab becomes visible (proactive)
        const handleVisibility = () => {
            if (document.visibilityState === 'visible' && navigator.onLine) {
                triggerSwSync().catch(() => {});
                flushPendingSync();
            }
        };
        document.addEventListener('visibilitychange', handleVisibility);

        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
            document.removeEventListener('visibilitychange', handleVisibility);
        };
    }, [beginSwSyncWindow, flushPendingSync, setSyncSource]);

    useEffect(() => {
        return () => {
            if (swSyncTimeoutRef.current) {
                clearTimeout(swSyncTimeoutRef.current);
            }
        };
    }, []);

    // When user logs in and is online, flush any leftover pending syncs from previous session
    useEffect(() => {
        if (user && navigator.onLine && pendingSync.hasAny()) {
            flushPendingSync(user.id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // Reset sync states on logout
    useEffect(() => {
        if (!user) {
            setSyncFailed(false);
            setSyncDegraded(false);
            setHasStuckItems(false);
            setSyncWarnings([]);
            setConflictCount(0);
        }
    }, [user]);

    return (
        <OfflineContext.Provider value={{
            isOnline,
            isSyncing,
            lastSyncAt,
            syncFailed,
            syncDegraded,
            hasStuckItems,
            syncWarnings,
            flushPendingSync,
            conflictCount,
            refreshConflictCount,
            pendingStatus,
            refreshPendingStatus,
            clearSyncQueue,
        }}>
            {children}
        </OfflineContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useOffline() {
    const ctx = useContext(OfflineContext);
    if (!ctx) throw new Error('useOffline must be used within OfflineProvider');
    return ctx;
}
