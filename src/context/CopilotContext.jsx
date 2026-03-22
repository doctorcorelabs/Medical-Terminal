/* eslint-disable react-refresh/only-export-components */
import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';

const CopilotContext = createContext();
const COPILOT_CONTEXT_KEY = 'copilot_context_enabled';

function getCopilotContextStorageKey(userId) {
    return userId ? `${COPILOT_CONTEXT_KEY}:${userId}` : COPILOT_CONTEXT_KEY;
}

function parseStoredBoolean(value) {
    if (value === null || value === undefined) return null;
    if (value === 'true') return true;
    if (value === 'false') return false;
    try {
        const parsed = JSON.parse(value);
        if (typeof parsed === 'boolean') return parsed;
    } catch {
        return null;
    }
    return null;
}

export function CopilotProvider({ children }) {
    const { isIntern, user } = useAuth();
    const [pageContext, setPageContext] = useState(null);
    const [patientData, setPatientData] = useState(null);
    const [isContextEnabled, setIsContextEnabled] = useState(() => {
        const saved = parseStoredBoolean(localStorage.getItem(getCopilotContextStorageKey(user?.id)));
        return saved ?? false;
    });

    useEffect(() => {
        const scopedKey = getCopilotContextStorageKey(user?.id);
        const scopedValue = parseStoredBoolean(localStorage.getItem(scopedKey));
        const legacyValue = parseStoredBoolean(localStorage.getItem(COPILOT_CONTEXT_KEY));

        if (scopedValue !== null) {
            setIsContextEnabled(scopedValue);
            if (user?.id) {
                localStorage.removeItem(COPILOT_CONTEXT_KEY);
            }
            return;
        }

        if (user?.id && legacyValue !== null) {
            localStorage.setItem(scopedKey, JSON.stringify(legacyValue));
            localStorage.removeItem(COPILOT_CONTEXT_KEY);
            setIsContextEnabled(legacyValue);
            return;
        }

        if (!user?.id && legacyValue !== null) {
            setIsContextEnabled(legacyValue);
            return;
        }

        setIsContextEnabled(false);
    }, [user?.id]);

    const updatePageContext = useCallback((content, data = null) => {
        setPageContext(content);
        setPatientData(data);
        if (content) {
            // Only auto-enable if there is no previous explicit user preference to turn it OFF
            const saved = parseStoredBoolean(localStorage.getItem(getCopilotContextStorageKey(user?.id)));
            if (saved === null) {
                setIsContextEnabled(true);
            }
        }
    }, [user?.id]);

    const clearPageContext = useCallback(() => {
        setPageContext(null);
        setPatientData(null);
    }, []);

    const toggleContext = useCallback((val) => {
        setIsContextEnabled(val);
        localStorage.setItem(getCopilotContextStorageKey(user?.id), JSON.stringify(val));
        if (user?.id) {
            localStorage.removeItem(COPILOT_CONTEXT_KEY);
        }
    }, [user?.id]);

    const [isPdfExportMode, setIsPdfExportMode] = useState(false);

    const activeContextEnabled = isIntern ? false : isContextEnabled;

    return (
        <CopilotContext.Provider value={{ 
            pageContext, 
            patientData,
            setPageContext: updatePageContext, 
            clearPageContext,
            isContextEnabled: activeContextEnabled,
            toggleContext,
            isPdfExportMode,
            setIsPdfExportMode
        }}>
            {children}
        </CopilotContext.Provider>
    );
}

export function useCopilotContext() {
    const context = useContext(CopilotContext);
    if (!context) {
        throw new Error('useCopilotContext must be used within a CopilotProvider');
    }
    return context;
}
