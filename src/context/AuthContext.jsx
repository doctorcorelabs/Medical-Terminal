import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    // Pre-detect recovery mode from URL hash before Supabase events fire to prevent dashboard flash
    const [isRecoveryMode, _setIsRecoveryMode] = useState(() =>
        window.location.hash.includes('type=recovery')
    );
    const isRecoveryRef = useRef(window.location.hash.includes('type=recovery'));

    const setIsRecoveryMode = (val) => {
        isRecoveryRef.current = val;
        _setIsRecoveryMode(val);
    };

    useEffect(() => {
        // Check active sessions and sets the user
        supabase.auth.getSession().then(({ data: { session } }) => {
            setUser(session?.user ?? null);
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
            setUser(session?.user ?? null);
            setLoading(false);
        });

        return () => subscription.unsubscribe();
    }, []);

    const value = {
        signUp: (email, password, username, captchaToken) => supabase.auth.signUp({ email, password, options: { data: { username }, captchaToken } }),
        signIn: (email, password, captchaToken) => supabase.auth.signInWithPassword({ email, password, options: { captchaToken } }),
        signOut: () => {
            localStorage.removeItem('medterminal_patients');
            localStorage.removeItem('medterminal_stases');
            localStorage.removeItem('medterminal_pinned_stase');
            localStorage.removeItem('medterminal_pending_patients_sync');
            localStorage.removeItem('medterminal_pending_stases_sync');
            localStorage.removeItem('medterminal_pending_schedules_sync');
            return supabase.auth.signOut();
        },
        updateProfile: (data) => supabase.auth.updateUser({ data }),
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
