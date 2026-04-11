import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useToast } from '../context/ToastContext';
import { logUserActivity } from '../services/activityService';
import { selectSessionWorkerUrlForUser } from './useSessionHeartbeatRouting';

/**
 * useSessionHeartbeat
 * Periodically pings the Cloudflare Worker to maintain session exclusivity.
 * 
 * @param {string} userId - Current user UUID
 * @param {string} sessionId - Current session UUID (from user_login_sessions)
 * @param {boolean} isWhitelisted - If true, bypasses exclusivity checks
 * @param {string} deviceId - Physical device ID
 */
export function useSessionHeartbeat(userId, sessionId, isWhitelisted = false, deviceId = null) {
    const { addToast } = useToast();
    const intervalRef = useRef(null);
    const consecutiveFailuresRef = useRef(0);
    const nextAllowedHeartbeatAtRef = useRef(0);
    const hasShownRateLimitToastRef = useRef(false);
    const hasShownForbiddenToastRef = useRef(false);
    const [isLocked, setIsLocked] = useState(false);
    const [isKicked, setIsKicked] = useState(false);

    // Fix 3: Use a ref to hold isLocked so performHeartbeat doesn't need isLocked
    // in its dependency array — prevents the state → recreate → re-interval feedback loop.
    const isLockedRef = useRef(false);
    useEffect(() => {
        isLockedRef.current = isLocked;
    }, [isLocked]);

    // Fix 4: Store the pending sign-out timer so it can be cancelled on unmount
    // or if the component re-renders before the 3-second delay fires.
    const signOutTimerRef = useRef(null);
    
    const primaryWorkerUrl = import.meta.env.VITE_SESSION_WORKER_URL || '';
    const canaryWorkerUrl = import.meta.env.VITE_SESSION_WORKER_CANARY_URL || '';
    const canaryPercent = Number(import.meta.env.VITE_SESSION_WORKER_CANARY_PERCENT || 0);
    const WORKER_URL = selectSessionWorkerUrlForUser({
        userId,
        primaryUrl: primaryWorkerUrl,
        canaryUrl: canaryWorkerUrl,
        canaryPercent,
    });

    const createHeartbeatSecurityHeaders = useCallback(() => {
        const nowMs = Date.now();
        const nonce = (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function')
            ? crypto.randomUUID()
            : `${nowMs}-${Math.random().toString(36).slice(2)}`;

        return {
            'x-session-timestamp': String(nowMs),
            'x-session-nonce': nonce,
        };
    }, []);

    const applyFailureBackoff = useCallback((retryAfterSec = 0) => {
        const nowMs = Date.now();
        if (retryAfterSec > 0) {
            nextAllowedHeartbeatAtRef.current = nowMs + retryAfterSec * 1000;
            return;
        }

        consecutiveFailuresRef.current = Math.min(consecutiveFailuresRef.current + 1, 5);
        const delayMs = Math.min(2 ** consecutiveFailuresRef.current * 1000, 30000);
        nextAllowedHeartbeatAtRef.current = nowMs + delayMs;
    }, []);

    const clearFailureBackoff = useCallback(() => {
        consecutiveFailuresRef.current = 0;
        nextAllowedHeartbeatAtRef.current = 0;
        hasShownRateLimitToastRef.current = false;
        hasShownForbiddenToastRef.current = false;
    }, []);

    /**
     * Reset isKicked when sessionId changes (new session/login).
     * Without this, stale "kicked" state persists across fresh logins.
     */
    useEffect(() => {
        if (sessionId) {
            setIsKicked(false);
            clearFailureBackoff();
        }
    }, [sessionId, clearFailureBackoff]);

    // Fix 4 (cont.): Clean up pending sign-out timer on unmount.
    useEffect(() => {
        return () => {
            if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current);
        };
    }, []);

    // Fix 3 (cont.): performHeartbeat no longer includes `isLocked` in its deps.
    // Instead it reads isLockedRef.current for early-return values so the callback
    // identity is stable and won't restart the 30-second interval on every lock toggle.
    const performHeartbeat = useCallback(async ({ allowHidden = false } = {}) => {
        if (!userId || !sessionId || !WORKER_URL) return { ok: false, isLocked: isLockedRef.current };
        if (!allowHidden && document.visibilityState !== 'visible') return { ok: false, isLocked: isLockedRef.current };

        if (Date.now() < nextAllowedHeartbeatAtRef.current) {
            return { ok: false, isLocked: isLockedRef.current };
        }

        const { data: { session } } = await supabase.auth.getSession();
        if (!session) return { ok: false, isLocked: isLockedRef.current };

        const response = await fetch(`${WORKER_URL}/heartbeat`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${session.access_token}`,
                ...createHeartbeatSecurityHeaders(),
            },
            body: JSON.stringify({ 
                user_id: userId, 
                session_id: sessionId,
                device_id: deviceId 
            })
        });

        if (response.status === 429) {
            const payload = await response.json().catch(() => ({}));
            const retryAfterSec = Number(payload.retry_after_seconds || response.headers.get('Retry-After') || 0);
            applyFailureBackoff(Number.isFinite(retryAfterSec) ? retryAfterSec : 0);
            if (!hasShownRateLimitToastRef.current) {
                addToast('Sinkronisasi sesi sedang diperlambat sementara untuk keamanan.', 'warning');
                hasShownRateLimitToastRef.current = true;
                logUserActivity({
                    userId,
                    eventType: 'session_heartbeat_429',
                    featureKey: 'session_guard',
                    metadata: { retry_after_seconds: retryAfterSec || null },
                });
            }
            return { ok: false, isLocked: isLockedRef.current };
        }

        if (response.status === 401 || response.status === 403) {
            applyFailureBackoff(10);
            if (!hasShownForbiddenToastRef.current) {
                addToast('Sesi keamanan perlu divalidasi ulang. Silakan muat ulang halaman.', 'warning');
                hasShownForbiddenToastRef.current = true;
                logUserActivity({
                    userId,
                    eventType: `session_heartbeat_${response.status}`,
                    featureKey: 'session_guard',
                    metadata: { worker_url: WORKER_URL || null },
                });
            }
            return { ok: false, isLocked: isLockedRef.current };
        }

        if (!response.ok) {
            applyFailureBackoff();
            return { ok: false, isLocked: isLockedRef.current };
        }

        const result = await response.json();
        clearFailureBackoff();

        if (result.status === 'kicked') {
            setIsKicked(true);
            addToast('Sesi Anda telah berakhir karena diambil alih oleh perangkat lain.', 'warning');
            logUserActivity({
                userId,
                eventType: 'session_kicked_detected',
                featureKey: 'session_guard',
                metadata: {
                    reason: result.reason || null,
                    worker_url: WORKER_URL || null,
                },
            });
            // Fix 4: Store timer in ref so it can be cancelled on unmount.
            if (signOutTimerRef.current) clearTimeout(signOutTimerRef.current);
            signOutTimerRef.current = setTimeout(() => supabase.auth.signOut(), 3000);
            return { ok: true, isLocked: false };
        }

        const nextLockState = Boolean(result.is_locked);
        setIsLocked(nextLockState);
        return { ok: true, isLocked: nextLockState };
    // isLocked intentionally excluded: read via isLockedRef.current to avoid
    // the state→recreate→re-interval feedback loop (Fix 3).
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [WORKER_URL, addToast, applyFailureBackoff, clearFailureBackoff, createHeartbeatSecurityHeaders, deviceId, sessionId, userId]);

    useEffect(() => {
        if (!userId || !sessionId || !WORKER_URL) return;
        if (isWhitelisted) return;

        const sendHeartbeat = async () => {
            try {
                await performHeartbeat();
            } catch (err) {
                applyFailureBackoff();
                console.warn('[Heartbeat] Connection failed:', err.message);
            }
        };

        // Initial heartbeat
        sendHeartbeat();
 
        // 30 second interval
        intervalRef.current = setInterval(sendHeartbeat, 30000);
 
        return () => {
            if (intervalRef.current) clearInterval(intervalRef.current);
        };
    }, [WORKER_URL, applyFailureBackoff, isWhitelisted, performHeartbeat, sessionId, userId]);
 
    /**
     * Manual trigger to update lock status immediately
     */
    const refreshLockStatus = async () => {
        if (!userId || !sessionId || !WORKER_URL) return;
        
        try {
            const result = await performHeartbeat({ allowHidden: true });
            if (result.ok) return result.isLocked;
        } catch (_err) {
            // silent fail for manual refresh
        }
        return isLockedRef.current;
    };

    return { isLocked, isKicked, refreshLockStatus };
}
