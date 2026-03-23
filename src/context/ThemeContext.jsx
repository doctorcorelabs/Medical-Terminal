import { createContext, useContext, useState, useEffect } from 'react';
import { useAuth } from './AuthContext';
import { THEME_KEY, getScopedStorageKey, normalizeThemeValue } from './contextStorageUtils';

const ThemeContext = createContext();

function getThemeStorageKey(userId) {
    return getScopedStorageKey(THEME_KEY, userId);
}

export function ThemeProvider({ children }) {
    const { user } = useAuth();
    const [isDark, setIsDark] = useState(() => {
        const stored = normalizeThemeValue(localStorage.getItem(getThemeStorageKey(user?.id)));
        return stored ? stored === 'dark' : true; // Default dark mode untuk medical
    });

    useEffect(() => {
        const scopedKey = getThemeStorageKey(user?.id);
        const scopedValue = normalizeThemeValue(localStorage.getItem(scopedKey));
        const legacyValue = normalizeThemeValue(localStorage.getItem(THEME_KEY));

        if (scopedValue) {
            setIsDark(scopedValue === 'dark');
            if (user?.id) {
                localStorage.removeItem(THEME_KEY);
            }
            return;
        }

        if (user?.id && legacyValue) {
            localStorage.setItem(scopedKey, legacyValue);
            localStorage.removeItem(THEME_KEY);
            setIsDark(legacyValue === 'dark');
            return;
        }

        if (!user?.id && legacyValue) {
            setIsDark(legacyValue === 'dark');
            return;
        }

        setIsDark(true);
    }, [user?.id]);

    useEffect(() => {
        const key = getThemeStorageKey(user?.id);
        const value = isDark ? 'dark' : 'light';
        localStorage.setItem(key, value);
        if (user?.id) {
            localStorage.removeItem(THEME_KEY);
        }
    }, [isDark, user?.id]);

    useEffect(() => {
        document.documentElement.classList.toggle('dark', isDark);
    }, [isDark]);

    const toggleTheme = () => setIsDark(prev => !prev);

    return (
        <ThemeContext.Provider value={{ isDark, toggleTheme }}>
            {children}
        </ThemeContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useTheme() {
    const context = useContext(ThemeContext);
    if (!context) throw new Error('useTheme must be used within ThemeProvider');
    return context;
}
