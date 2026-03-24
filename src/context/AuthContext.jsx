import { createContext, useCallback, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { logUserActivity } from '../services/activityService';
import { getRoleFlags, getSignOutStorageKeys } from './authContextUtils';
import {
    DEFAULT_MAX_ACTIVE_DEVICES,
    deactivateCurrentDeviceSession,
    getCurrentDeviceRevocationStatus,
    getUserBanStatus,
    isCurrentDeviceSessionActive,
    registerCurrentDeviceSession,
} from '../services/deviceSecurityService';

const AuthContext = createContext();
const AUTH_DENIAL_FALLBACK_REASON = 'Akun dibatasi oleh admin. Hubungi administrator.';

function mapRevokeReasonToMessage(reasonCode) {
    switch (reasonCode) {
        case 'admin_manual_revoke':
            return 'Sesi perangkat dicabut oleh admin.';
        case 'device_limit_auto_revoke':
            return 'Sesi perangkat ini dicabut otomatis karena batas perangkat telah tercapai.';
        case 'admin_ban_enforced':
            return 'Sesi perangkat dicabut karena akun dibanned oleh admin.';
        default:
            return AUTH_DENIAL_FALLBACK_REASON;
    }
}

function buildBanDenialPayload(reason, source) {
    const normalizedReason = (reason || '').trim() || AUTH_DENIAL_FALLBACK_REASON;
    return {
        type: 'ban',
        source,
        title: 'Akun Anda dibanned',
        message: normalizedReason,
        reason: normalizedReason,
        createdAt: new Date().toISOString(),
    };
}

function buildRevokeDenialPayload(revokeReason, source) {
    const normalizedReason = mapRevokeReasonToMessage(revokeReason);
    return {
        type: 'revoked',
        source,
        title: 'Sesi perangkat dicabut',
        message: normalizedReason,
        reason: normalizedReason,
        revokeReason: revokeReason || null,
        createdAt: new Date().toISOString(),
    };
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(() => {
        const saved = localStorage.getItem('medterminal_user_cache');
        return saved ? JSON.parse(saved) : null;
    });
    const [profile, setProfile] = useState(() => {
        const saved = localStorage.getItem('medterminal_profile_cache');
        return saved ? JSON.parse(saved) : null;
    });
    const [loading, setLoading] = useState(true);
    const [sessionSecurityPending, setSessionSecurityPending] = useState(false);
    const [authDenial, setAuthDenial] = useState(null);
    // Pre-detect recovery mode from URL hash before Supabase events fire to prevent dashboard flash
    const [isRecoveryMode, _setIsRecoveryMode] = useState(() =>
        window.location.hash.includes('type=recovery')
    );
    const isRecoveryRef = useRef(window.location.hash.includes('type=recovery'));
    const activeUserIdRef = useRef(user?.id || null);
    const sessionSecurityGateRef = useRef({ userId: null, lastRunAt: 0, inFlight: false });

    useEffect(() => {
        activeUserIdRef.current = user?.id || null;
    }, [user?.id]);

    const setIsRecoveryMode = (val) => {
        isRecoveryRef.current = val;
        _setIsRecoveryMode(val);
    };

    const resetSessionSecurityGate = useCallback(() => {
        sessionSecurityGateRef.current = { userId: null, lastRunAt: 0, inFlight: false };
    }, []);

    const clearAuthDenial = useCallback(() => {
        setAuthDenial(null);
    }, []);

    const evaluateAuthDenial = useCallback(async (userId, source) => {
        if (!userId) return null;

        const banStatus = await getUserBanStatus(userId);
        if (banStatus.isBanned) {
            return buildBanDenialPayload(banStatus.reason, source);
        }

        const revokeStatus = await getCurrentDeviceRevocationStatus(userId);
        if (revokeStatus.isRevoked) {
            return buildRevokeDenialPayload(revokeStatus.revokeReason, source);
        }

        return null;
    }, []);

    const applySessionSecurity = useCallback(async (userId) => {
        if (!userId) return;

        const gate = sessionSecurityGateRef.current;
        const now = Date.now();
        const sameUser = gate.userId === userId;

        // Prevent duplicate calls during auth bootstrap + SIGNED_IN event burst.
        if ((sameUser && gate.inFlight) || (sameUser && now - gate.lastRunAt < 2500)) {
            return;
        }

        setSessionSecurityPending(true);

        sessionSecurityGateRef.current = {
            userId,
            lastRunAt: now,
            inFlight: true,
        };

        try {
            const denial = await evaluateAuthDenial(userId, 'auth_context_bootstrap');
            if (denial) {
                setAuthDenial(denial);
                const keys = getSignOutStorageKeys(userId);
                keys.scoped.forEach((key) => localStorage.removeItem(key));
                keys.global.forEach((key) => localStorage.removeItem(key));
                setProfile(null);
                setUser(null);
                await supabase.auth.signOut();
                resetSessionSecurityGate();
                return;
            }

            const { data: sessionSync, error: sessionSyncError } = await registerCurrentDeviceSession(userId, DEFAULT_MAX_ACTIVE_DEVICES);
            if (sessionSyncError) {
                console.warn('[AuthContext] registerCurrentDeviceSession failed:', sessionSyncError.message);
            } else if (sessionSync?.revoked_device_id) {
                logUserActivity({
                    userId,
                    eventType: 'auth_device_limit_enforced',
                    metadata: {
                        revoked_device_id: sessionSync.revoked_device_id,
                        revoked_session_id: sessionSync.revoked_session_id,
                        active_count: sessionSync.active_count,
                        max_devices: sessionSync.max_devices,
                    },
                });
            }
        } finally {
            sessionSecurityGateRef.current = {
                userId,
                lastRunAt: Date.now(),
                inFlight: false,
            };
            setSessionSecurityPending(false);
        }
    }, [evaluateAuthDenial, resetSessionSecurityGate]);

    const forceSignOutRevokedSession = useCallback(async (userId, denialPayload = null) => {
        if (!userId) return;

        if (denialPayload) {
            setAuthDenial(denialPayload);
        }

        await supabase.from('security_events').insert({
            user_id: userId,
            event_type: denialPayload?.type === 'ban' ? 'banned_user_access_blocked' : 'revoked_device_access_blocked',
            severity: 'high',
            metadata: { source: denialPayload?.source || 'auth_context_session_guard' },
        });

        const keys = getSignOutStorageKeys(userId);
        keys.scoped.forEach((key) => localStorage.removeItem(key));
        keys.global.forEach((key) => localStorage.removeItem(key));
        setProfile(null);
        setUser(null);
        resetSessionSecurityGate();
        await supabase.auth.signOut();
    }, [resetSessionSecurityGate]);

    const enforceCurrentDeviceStillActive = useCallback(async (userId) => {
        if (!userId) return;

        const denial = await evaluateAuthDenial(userId, 'auth_context_session_guard');
        if (denial) {
            await forceSignOutRevokedSession(userId, denial);
            return;
        }

        const active = await isCurrentDeviceSessionActive(userId);
        if (!active) {
            const revokeStatus = await getCurrentDeviceRevocationStatus(userId);
            const payload = buildRevokeDenialPayload(revokeStatus.revokeReason, 'auth_context_session_guard');
            await forceSignOutRevokedSession(userId, payload);
        }
    }, [evaluateAuthDenial, forceSignOutRevokedSession]);

    const fetchProfile = useCallback(async (userId) => {
        if (!userId) { setProfile(null); return; }
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, user_id, username, full_name, role, subscription_expires_at, created_at')
                .eq('user_id', userId)
                .limit(1);
            if (!error && data && data.length > 0) {
                const profileData = data[0];
                // Avoid stale profile write if auth state changed (e.g. sign out/sign in another account).
                if (activeUserIdRef.current !== userId) return;
                setProfile(profileData);
                localStorage.setItem('medterminal_profile_cache', JSON.stringify(profileData));
            }
        } catch (_err) {
            // profile fetch failure is non-fatal
        }
    }, []);

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            const sessionUser = session?.user ?? null;
            setUser(sessionUser);
            fetchProfile(sessionUser?.id);

            if (sessionUser?.id) {
                applySessionSecurity(sessionUser.id);
            }

            setLoading(false);
        });

        // Listen for changes on auth state (logged in, signed out, etc.)
        const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
            if (event === 'PASSWORD_RECOVERY') {
                setIsRecoveryMode(true);
            } else if (event === 'SIGNED_IN' && isRecoveryRef.current) {
                // SIGNED_IN can fire right after PASSWORD_RECOVERY — preserve recovery mode
            } else {
                setIsRecoveryMode(false);
            }
            const sessionUser = session?.user ?? null;
            setUser(sessionUser);
            if (sessionUser) {
                localStorage.setItem('medterminal_user_cache', JSON.stringify(sessionUser));
            } else {
                localStorage.removeItem('medterminal_user_cache');
                localStorage.removeItem('medterminal_profile_cache');
                setProfile(null);
                setSessionSecurityPending(false);
                resetSessionSecurityGate();
            }

            fetchProfile(sessionUser?.id);
            if (event === 'SIGNED_IN' && sessionUser?.id) {
                logUserActivity({ userId: sessionUser.id, eventType: 'auth_signed_in' });
                applySessionSecurity(sessionUser.id);
            }
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, [applySessionSecurity, fetchProfile, resetSessionSecurityGate]);

    // Enforce remote revoke decisions (admin/device-limit) in near real-time.
    useEffect(() => {
        if (!user?.id) return;

        const userId = user.id;

        const runGuard = () => {
            enforceCurrentDeviceStillActive(userId);
        };

        // Initial check after auth/bootstrap.
        runGuard();

        // Check periodically to enforce revokes even if no tab interaction occurs.
        const intervalId = window.setInterval(runGuard, 45_000);

        // Check immediately when user returns to tab/window.
        const onVisibilityChange = () => {
            if (document.visibilityState === 'visible') runGuard();
        };
        const onFocus = () => runGuard();

        document.addEventListener('visibilitychange', onVisibilityChange);
        window.addEventListener('focus', onFocus);

        // Realtime hook: session table updates for this user.
        const channel = supabase
            .channel(`session_realtime_${userId}`)
            .on(
                'postgres_changes',
                {
                    event: '*',
                    schema: 'public',
                    table: 'user_login_sessions',
                    filter: `user_id=eq.${userId}`,
                },
                () => {
                    runGuard();
                }
            );

        // Delay subscription to avoid "interrupted while page was loading" error in some browsers (e.g. Firefox)
        const subTimeoutId = setTimeout(() => {
            channel.subscribe();
        }, 1500);

        return () => {
            window.clearInterval(intervalId);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            window.removeEventListener('focus', onFocus);
            clearTimeout(subTimeoutId);
            supabase.removeChannel(channel);
        };
    }, [enforceCurrentDeviceStillActive, user?.id]);

    // Real-time Profile Synchronization
    useEffect(() => {
        if (!user?.id) return;

        const channel = supabase
            .channel(`profile_realtime_${user.id}`)
            .on(
                'postgres_changes',
                {
                    event: 'UPDATE',
                    schema: 'public',
                    table: 'profiles',
                    filter: `user_id=eq.${user.id}`
                },
                (payload) => {
                    console.log('[AuthContext] Real-time profile update received:', payload.new);
                    setProfile(payload.new);
                    localStorage.setItem('medterminal_profile_cache', JSON.stringify(payload.new));
                    
                    // Optional: If role changed to specialist, show a global celebration maybe?
                    // We can handle specific UI logic in the components that consume this.
                }
            );

        // Delay subscription to prevent Firefox handshake interruptions during burst loads
        const subTimeoutId = setTimeout(() => {
            channel.subscribe();
        }, 1200);

        return () => {
            clearTimeout(subTimeoutId);
            supabase.removeChannel(channel);
        };
    }, [user?.id]);

    const value = {
        signUp: (email, password, username, captchaToken) => supabase.auth.signUp({ email, password, options: { data: { username }, captchaToken } }),
        signIn: async (email, password, captchaToken) => {
            clearAuthDenial();

            const result = await supabase.auth.signInWithPassword({ email, password, options: { captchaToken } });
            if (result.error || !result.data?.user?.id) {
                return result;
            }

            const denial = await evaluateAuthDenial(result.data.user.id, 'login_preflight');
            if (!denial) {
                return result;
            }

            setAuthDenial(denial);
            const keys = getSignOutStorageKeys(result.data.user.id);
            keys.scoped.forEach((key) => localStorage.removeItem(key));
            keys.global.forEach((key) => localStorage.removeItem(key));
            setProfile(null);
            setUser(null);
            resetSessionSecurityGate();
            await supabase.auth.signOut();

            return {
                data: null,
                error: {
                    message: denial.message,
                    code: 'AUTH_ACCESS_DENIED',
                },
            };
        },
        signOut: async () => {
            if (user?.id) {
                logUserActivity({ userId: user.id, eventType: 'auth_signed_out' });
                await deactivateCurrentDeviceSession(user.id);
            }
            const keys = getSignOutStorageKeys(user?.id || null);
            keys.scoped.forEach((key) => localStorage.removeItem(key));
            keys.global.forEach((key) => localStorage.removeItem(key));
            setProfile(null);
            setUser(null);
            setSessionSecurityPending(false);
            resetSessionSecurityGate();
            return supabase.auth.signOut();
        },
        updateProfile: async (data) => {
            const result = await supabase.auth.updateUser({ data });
            if (!result.error && result.data?.user) {
                const updatedUser = result.data.user;
                setUser(updatedUser);
                localStorage.setItem('medterminal_user_cache', JSON.stringify(updatedUser));

                // Sync specific fields to public.profiles table to avoid desync
                const profileUpdates = {};
                if (data.username !== undefined) profileUpdates.username = data.username;
                if (data.full_name !== undefined) profileUpdates.full_name = data.full_name;

                if (Object.keys(profileUpdates).length > 0) {
                    try {
                        const { error: profileError } = await supabase
                            .from('profiles')
                            .update(profileUpdates)
                            .eq('user_id', updatedUser.id);
                        
                        if (!profileError) {
                            // Re-fetch profile state to ensure UI consistency across app
                            await fetchProfile(updatedUser.id);
                        }
                    } catch (err) {
                        console.error('[AuthContext] Profile sync failed:', err);
                    }
                }
            }
            return result;
        },
        isUsernameAvailable: async (username) => {
            if (!username) return null;
            try {
                // Try querying a public 'profiles' table if it exists
                const { data, error } = await supabase.from('profiles').select('id').eq('username', username).limit(1);
                if (!error) return (data?.length || 0) === 0;
            } catch (_err) {
                // ignore, fall through to Edge Function
            }

            try {
                // Call the deployed Edge Function check_username
                const { data, error } = await supabase.functions.invoke('check_username', {
                    body: { username },
                });
                if (!error && data != null) {
                    return data.available === true;
                }
            } catch (_err) {
                // ignore
            }

            // Unable to verify remotely — allow with a warning shown by caller
            return null;
        },
        resetPassword: (email, captchaToken) => supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
            options: { captchaToken },
        }),
        updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
        signInWithGoogle: () => supabase.auth.signInWithOAuth({
            provider: 'google',
            options: { redirectTo: `${window.location.origin}/` },
        }),
        user,
        profile,
        authDenial,
        clearAuthDenial,
        sessionSecurityPending,
        ...getRoleFlags(profile),
        refreshProfile: () => fetchProfile(user?.id),
        isRecoveryMode,
        setIsRecoveryMode,
    };

    return (
        <AuthContext.Provider value={value}>
            {!loading && children}
        </AuthContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAuth() {
    return useContext(AuthContext);
}
