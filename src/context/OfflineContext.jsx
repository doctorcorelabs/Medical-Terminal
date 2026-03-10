import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { pendingSync } from '../services/offlineQueue';
import { syncToSupabase, syncStasesToSupabase, syncSchedulesToSupabase } from '../services/dataService';
import { useAuth } from './AuthContext';

const OfflineContext = createContext();

export function OfflineProvider({ children }) {
    const { user } = useAuth();
    const [isOnline, setIsOnline] = useState(navigator.onLine);
    const [isSyncing, setIsSyncing] = useState(false);
    const [lastSyncAt, setLastSyncAt] = useState(null);
    const [syncFailed, setSyncFailed] = useState(false);
    // Keep user ref so the `online` event handler can always access the latest user
    const userRef = useRef(user);
    useEffect(() => { userRef.current = user; }, [user]);

    const flushPendingSync = useCallback(async (uid) => {
        const id = uid || userRef.current?.id;
        if (!id || !navigator.onLine) return;
        if (!pendingSync.hasAny()) return;

        setIsSyncing(true);
        setSyncFailed(false);
        let failed = false;
        try {
            if (pendingSync.hasPatients()) {
                await syncToSupabase(id);
                // syncToSupabase clears/marks the flag internally; if still set → failed
            }
        } catch {
            failed = true;
        }
        try {
            if (pendingSync.hasStases()) {
                await syncStasesToSupabase(id);
            }
        } catch {
            failed = true;
        }
        try {
            if (pendingSync.hasSchedules()) {
                await syncSchedulesToSupabase(id);
            }
        } catch {
            failed = true;
        }
        // Also treat as failed if any flag is still set after sync attempts
        if (pendingSync.hasAny()) failed = true;

        setSyncFailed(failed);
        if (!failed) setLastSyncAt(new Date());
        setIsSyncing(false);
    }, []);

    // Listen to browser online/offline events
    useEffect(() => {
        const handleOnline = () => {
            setIsOnline(true);
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
        <OfflineContext.Provider value={{ isOnline, isSyncing, lastSyncAt, syncFailed, flushPendingSync }}>
            {children}
        </OfflineContext.Provider>
    );
}

export function useOffline() {
    const ctx = useContext(OfflineContext);
    if (!ctx) throw new Error('useOffline must be used within OfflineProvider');
    return ctx;
}
