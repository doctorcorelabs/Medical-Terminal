import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { pendingSync, setPendingSyncScope } from '../services/offlineQueue';
import { syncToSupabase, syncStasesToSupabase, syncSchedulesToSupabase } from '../services/dataService';
import { useAuth } from './AuthContext';
import { countConflicts } from '../services/idbQueue';
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
    const [syncWarnings, setSyncWarnings] = useState([]);
    const [conflictCount, setConflictCount] = useState(0);
    const [pendingStatus, setPendingStatus] = useState(() => getPendingStatusFromQueue(pendingSync));
    const degradedTelemetryRef = useRef({ fingerprint: null, timestamp: 0 });
    // Keep user ref so the `online` event handler can always access the latest user
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    useEffect(() => {
        setPendingSyncScope(user?.id || null);
        refreshPendingStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    // Store Supabase config + session into IDB for the service worker
    useEffect(() => { 
        const syncSessionToSw = async () => {
            try {
                const { data: { session } } = await supabase.auth.getSession();
                await storeSwConfig(session?.access_token || null);
            } catch (err) {
                console.warn('[OfflineContext] Failed to sync session to SW:', err);
            }
        };
        syncSessionToSw();
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
        const unsub = onSwSyncComplete(({ success, degraded, warningCount, warnings }) => {
            if (success) {
                setLastSyncAt(new Date());
                setSyncFailed(false);
            } else {
                setSyncFailed(true);
            }
            const hasWarnings = Boolean(degraded || warningCount > 0);
            setSyncDegraded(hasWarnings);
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
            setIsSyncing(false);
            refreshConflictCount();
            refreshPendingStatus();
        });
        return unsub;
    }, [refreshConflictCount, refreshPendingStatus]);

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

        setIsSyncing(true);
        setSyncFailed(false);
        let failed = false;
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
        setIsSyncing(false);
        refreshPendingStatus();
    }, [refreshPendingStatus]);

    // Listen to browser online/offline events
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
            // Try Background Sync via SW first, then fallback to page-level flush
            triggerSwSync().catch((err) => {
                logSyncWarning('triggerSwSync', userRef.current?.id, err);
            });
            flushPendingSync();
        };
        const handleOffline = () => {
            setIsOnline(false);
        };
        window.addEventListener('online', handleOnline);
        window.addEventListener('offline', handleOffline);
        return () => {
            window.removeEventListener('online', handleOnline);
            window.removeEventListener('offline', handleOffline);
        };
    }, [flushPendingSync]);

    // When user logs in and is online, flush any leftover pending syncs from previous session
    useEffect(() => {
        if (user && navigator.onLine && pendingSync.hasAny()) {
            flushPendingSync(user.id);
        }
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.id]);

    return (
        <OfflineContext.Provider value={{
            isOnline,
            isSyncing,
            lastSyncAt,
            syncFailed,
            syncDegraded,
            syncWarnings,
            flushPendingSync,
            conflictCount,
            refreshConflictCount,
            pendingStatus,
            refreshPendingStatus,
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
