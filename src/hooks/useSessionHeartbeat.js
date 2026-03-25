import { useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useToast } from '../context/ToastContext';

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
    const [isLocked, setIsLocked] = useState(false);
    const [isKicked, setIsKicked] = useState(false);
    
    const WORKER_URL = import.meta.env.VITE_SESSION_WORKER_URL || '';

    useEffect(() => {
        if (!userId || !sessionId || !WORKER_URL) return;
        if (isWhitelisted) return;

        const sendHeartbeat = async () => {
            // Only send if tab is visible
            if (document.visibilityState !== 'visible') return;

            try {
                const { data: { session } } = await supabase.auth.getSession();
                if (!session) return;

                const response = await fetch(`${WORKER_URL}/heartbeat`, {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json',
                        'Authorization': `Bearer ${session.access_token}`
                    },
                    body: JSON.stringify({ 
                        user_id: userId, 
                        session_id: sessionId,
                        device_id: deviceId 
                    })
                });

                if (response.ok) {
                    const result = await response.json();
                    
                    if (result.status === 'kicked') {
                        setIsKicked(true);
                        addToast('Sesi Anda telah berakhir karena diambil alih oleh perangkat lain.', 'warning');
                        // Auto logout after 3 seconds
                        setTimeout(() => supabase.auth.signOut(), 3000);
                        return;
                    }

                    setIsLocked(result.is_locked);
                }
            } catch (err) {
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
    }, [userId, sessionId, isWhitelisted, WORKER_URL, addToast]);

    return { isLocked, isKicked };
}
