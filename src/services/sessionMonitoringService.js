import { supabase } from './supabaseClient';
import { getOrCreateSessionId } from './swConfig';

let currentChannel = null;

/**
 * Monitors the current session for revocation.
 * If the session is revoked, the onRevoked callback is called with the reason and message.
 * @param {string} userId - The current user ID.
 * @param {function} onRevoked - Callback function(reason, message).
 */
export function subscribeToSessionRevocation(userId, onRevoked) {
    if (!userId) return null;
    
    const sessionId = getOrCreateSessionId();
    if (!sessionId) return null;

    // Cleanup existing channel
    if (currentChannel) {
        supabase.removeChannel(currentChannel);
    }

    console.log(`[SessionMonitor] Subscribing to session: ${sessionId}`);

    currentChannel = supabase
        .channel(`session_monitor:${sessionId}`)
        .on(
            'postgres_changes',
            {
                event: 'UPDATE',
                schema: 'public',
                table: 'user_login_sessions',
                filter: `session_id=eq.${sessionId}`
            },
            (payload) => {
                const { is_active, revoke_reason, revoke_message_custom } = payload.new;
                
                if (is_active === false) {
                    console.warn(`[SessionMonitor] Session revoked! Reason: ${revoke_reason}`);
                    onRevoked({
                        reason: revoke_reason,
                        message: revoke_message_custom || 'Sesi Anda telah dihentikan.'
                    });
                }
            }
        )
        .subscribe((status) => {
            if (status === 'SUBSCRIBED') {
                console.log('[SessionMonitor] Realtime subscription active.');
            }
        });

    return () => {
        if (currentChannel) {
            supabase.removeChannel(currentChannel);
            currentChannel = null;
        }
    };
}

export function unsubscribeFromSessionRevocation() {
    if (currentChannel) {
        supabase.removeChannel(currentChannel);
        currentChannel = null;
    }
}
