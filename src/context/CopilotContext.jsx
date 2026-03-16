import { createContext, useContext, useState, useCallback } from 'react';

const CopilotContext = createContext();

export function CopilotProvider({ children }) {
    const [pageContext, setPageContext] = useState(null);
    const [isContextEnabled, setIsContextEnabled] = useState(false); // Default OFF

    const updatePageContext = useCallback((content) => {
        setPageContext(content);
        if (content) {
            setIsContextEnabled(true); // Auto ON saat ada data pasien
        }
    }, []);

    const clearPageContext = useCallback(() => {
        setPageContext(null);
        setIsContextEnabled(false); // Auto OFF saat keluar
    }, []);

    const toggleContext = useCallback((val) => {
        setIsContextEnabled(val);
        localStorage.setItem('copilot_context_enabled', JSON.stringify(val));
    }, []);

    return (
        <CopilotContext.Provider value={{ 
            pageContext, 
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
