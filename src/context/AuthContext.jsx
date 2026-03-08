import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';

const AuthContext = createContext();

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);
    const [isRecoveryMode, setIsRecoveryMode] = useState(false);

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
            redirectTo: window.location.origin,
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
