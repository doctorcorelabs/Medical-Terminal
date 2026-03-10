import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as dataService from '../services/dataService';

const StaseContext = createContext();

export function StaseProvider({ children }) {
    const { user } = useAuth();
    const [stases, setStases] = useState([]);
    const [pinnedStaseId, setPinnedStaseIdState] = useState(null);

    // Load stases from Supabase on login
    useEffect(() => {
        if (user) {
            dataService.fetchStasesFromSupabase(user.id).then(({ stases: s, pinnedStaseId: pinId }) => {
                setStases(s);
                setPinnedStaseIdState(pinId);
            });
        }
    }, [user]);

    const refreshStases = useCallback(() => {
        setStases(dataService.getAllStases());
        setPinnedStaseIdState(dataService.getPinnedStaseId());
    }, []);

    const addStase = useCallback((name, color) => {
        const newStase = dataService.addStase({ name, color });
        refreshStases();
        if (user) dataService.syncStasesToSupabase(user.id).catch(() => {});
        return newStase;
    }, [refreshStases, user]);

    const updateStase = useCallback((id, updates) => {
        const updated = dataService.updateStase(id, updates);
        refreshStases();
        if (user) dataService.syncStasesToSupabase(user.id).catch(() => {});
        return updated;
    }, [refreshStases, user]);

    const deleteStase = useCallback((id) => {
        dataService.deleteStase(id);
        refreshStases();
        if (user) dataService.syncStasesToSupabase(user.id).catch(() => {});
    }, [refreshStases, user]);

    const pinStase = useCallback((id) => {
        const newPinned = pinnedStaseId === id ? null : id;
        dataService.setPinnedStaseId(newPinned);
        setPinnedStaseIdState(newPinned);
        if (user) dataService.syncStasesToSupabase(user.id).catch(() => {});
    }, [pinnedStaseId, user]);

    const reorderStase = useCallback((id, direction) => {
        dataService.reorderStase(id, direction);
        refreshStases();
        if (user) dataService.syncStasesToSupabase(user.id).catch(() => {});
    }, [refreshStases, user]);

    return (
        <StaseContext.Provider value={{
            stases,
            pinnedStaseId,
            pinnedStase,
            addStase,
            updateStase,
            deleteStase,
            pinStase,
            reorderStase,
            refreshStases,
        }}>
            {children}
        </StaseContext.Provider>
    );
}

export function useStase() {
    const context = useContext(StaseContext);
    if (!context) throw new Error('useStase must be used within StaseProvider');
    return context;
}
