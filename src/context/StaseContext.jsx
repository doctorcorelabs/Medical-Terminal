import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as dataService from '../services/dataService';
import { canSyncStases, findPinnedStase, getNextPinnedStaseId } from './staseContextUtils';

const StaseContext = createContext();

export function StaseProvider({ children }) {
    const { user } = useAuth();
    const [stases, setStases] = useState([]);
    const [pinnedStaseId, setPinnedStaseIdState] = useState(null);

    // Load stases from Supabase on login, reset on logout
    useEffect(() => {
        if (user) {
            dataService.setDataStorageScope(user.id);
            dataService.fetchStasesFromSupabase(user.id).then(({ stases: s, pinnedStaseId: pinId }) => {
                setStases(s);
                setPinnedStaseIdState(pinId);
            });
        } else {
            dataService.setDataStorageScope(null);
            setStases([]);
            setPinnedStaseIdState(null);
        }
    }, [user]);

    const refreshStases = useCallback(() => {
        setStases(dataService.getAllStases());
        setPinnedStaseIdState(dataService.getPinnedStaseId());
    }, []);

    const addStase = useCallback((name, color) => {
        const newStase = dataService.addStase({ name, color });
        refreshStases();
        if (canSyncStases(user)) dataService.syncStasesToSupabase(user.id).catch(() => {});
        return newStase;
    }, [refreshStases, user]);

    const updateStase = useCallback((id, updates) => {
        const updated = dataService.updateStase(id, updates);
        refreshStases();
        if (canSyncStases(user)) dataService.syncStasesToSupabase(user.id).catch(() => {});
        return updated;
    }, [refreshStases, user]);

    const deleteStase = useCallback((id) => {
        dataService.deleteStase(id);
        refreshStases();
        if (canSyncStases(user)) dataService.syncStasesToSupabase(user.id).catch(() => {});
    }, [refreshStases, user]);

    const pinStase = useCallback((id) => {
        const newPinned = getNextPinnedStaseId(pinnedStaseId, id);
        dataService.setPinnedStaseId(newPinned);
        setPinnedStaseIdState(newPinned);
        if (canSyncStases(user)) dataService.syncStasesToSupabase(user.id).catch(() => {});
    }, [pinnedStaseId, user]);

    const reorderStase = useCallback((id, direction) => {
        dataService.reorderStase(id, direction);
        refreshStases();
        if (canSyncStases(user)) dataService.syncStasesToSupabase(user.id).catch(() => {});
    }, [refreshStases, user]);

    const pinnedStase = findPinnedStase(stases, pinnedStaseId);

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

// eslint-disable-next-line react-refresh/only-export-components
export function useStase() {
    const context = useContext(StaseContext);
    if (!context) throw new Error('useStase must be used within StaseProvider');
    return context;
}
