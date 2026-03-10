import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as dataService from '../services/dataService';

const ScheduleContext = createContext();

export function ScheduleProvider({ children }) {
    const { user } = useAuth();
    const [schedules, setSchedules] = useState([]);

    // Load from Supabase on login, clear stale cache on user change
    useEffect(() => {
        if (user) {
            dataService.clearSchedulesCache();
            dataService.fetchSchedulesFromSupabase(user.id).then(data => {
                setSchedules(data);
            });
        } else {
            dataService.clearSchedulesCache();
            setSchedules([]);
        }
    }, [user]);

    const refreshSchedules = useCallback(() => {
        setSchedules(dataService.getAllSchedules());
    }, []);

    const addSchedule = useCallback((schedule) => {
        const created = dataService.addSchedule(schedule);
        refreshSchedules();
        if (user) dataService.syncSchedulesToSupabase(user.id).catch(() => {});
        return created;
    }, [refreshSchedules, user]);

    const updateSchedule = useCallback((id, updates) => {
        const updated = dataService.updateSchedule(id, updates);
        refreshSchedules();
        if (user) dataService.syncSchedulesToSupabase(user.id).catch(() => {});
        return updated;
    }, [refreshSchedules, user]);

    const deleteSchedule = useCallback((id) => {
        dataService.deleteSchedule(id);
        refreshSchedules();
        if (user) dataService.syncSchedulesToSupabase(user.id).catch(() => {});
    }, [refreshSchedules, user]);

    return (
        <ScheduleContext.Provider value={{
            schedules,
            addSchedule,
            updateSchedule,
            deleteSchedule,
            refreshSchedules,
        }}>
            {children}
        </ScheduleContext.Provider>
    );
}

export function useSchedule() {
    const context = useContext(ScheduleContext);
    if (!context) throw new Error('useSchedule must be used within ScheduleProvider');
    return context;
}
