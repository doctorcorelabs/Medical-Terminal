import { createContext, useContext, useState, useCallback } from 'react';

const CopilotContext = createContext();

export function CopilotProvider({ children }) {
    const [pageContext, setPageContext] = useState(null);
    const [isContextEnabled, setIsContextEnabled] = useState(() => {
        const saved = localStorage.getItem('copilot_context_enabled');
        return saved !== null ? JSON.parse(saved) : true;
    });

    const clearPageContext = useCallback(() => {
        setPageContext(null);
    }, []);

    const toggleContext = useCallback((val) => {
        setIsContextEnabled(val);
        localStorage.setItem('copilot_context_enabled', JSON.stringify(val));
    }, []);

    return (
        <CopilotContext.Provider value={{ 
            pageContext, 
            setPageContext, 
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
