import { createContext, useContext, useState, useCallback } from 'react';

const CopilotContext = createContext();

export function CopilotProvider({ children }) {
    const [pageContext, setPageContext] = useState(null);
    const [patientData, setPatientData] = useState(null);
    const [isContextEnabled, setIsContextEnabled] = useState(() => {
        const saved = localStorage.getItem('copilot_context_enabled');
        return saved !== null ? JSON.parse(saved) : false;
    });

    const updatePageContext = useCallback((content, data = null) => {
        setPageContext(content);
        setPatientData(data);
        if (content) {
            // Only auto-enable if there is no previous explicit user preference to turn it OFF
            const saved = localStorage.getItem('copilot_context_enabled');
            if (saved === null) {
                setIsContextEnabled(true);
            }
        }
    }, []);

    const clearPageContext = useCallback(() => {
        setPageContext(null);
        setPatientData(null);
    }, []);

    const toggleContext = useCallback((val) => {
        setIsContextEnabled(val);
        localStorage.setItem('copilot_context_enabled', JSON.stringify(val));
    }, []);

    return (
        <CopilotContext.Provider value={{ 
            pageContext, 
            patientData,
            setPageContext: updatePageContext, 
            clearPageContext,
            isContextEnabled,
            toggleContext
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
