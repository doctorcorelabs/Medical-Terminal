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
        signUp: (email, password) => supabase.auth.signUp({ email, password }),
        signIn: (email, password) => supabase.auth.signInWithPassword({ email, password }),
        signOut: () => {
            localStorage.removeItem('medterminal_patients');
            return supabase.auth.signOut();
        },
        resetPassword: (email) => supabase.auth.resetPasswordForEmail(email, {
            redirectTo: `${window.location.origin}/reset-password`,
        }),
        updatePassword: (newPassword) => supabase.auth.updateUser({ password: newPassword }),
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

export function useAuth() {
    return useContext(AuthContext);
}
