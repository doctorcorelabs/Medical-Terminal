import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as dataService from '../services/dataService';
import { triggerNotificationCycle } from '../services/notificationService';

const ScheduleContext = createContext();

export function ScheduleProvider({ children }) {
    const { user } = useAuth();
    const [schedules, setSchedules] = useState([]);

    // Load from Supabase on login, clear stale cache on user change
    useEffect(() => {
        if (user?.id) {
            dataService.setScheduleStorageScope(user.id);
            dataService.fetchSchedulesFromSupabase(user.id).then(data => {
                setSchedules(data);
            });
        } else {
            dataService.clearSchedulesCache();
            dataService.setScheduleStorageScope(null);
            setSchedules([]);
        }
    }, [user]);

    const refreshSchedules = useCallback(() => {
        setSchedules(dataService.getAllSchedules());
    }, []);

    const addSchedule = useCallback((schedule) => {
        const created = dataService.addSchedule(schedule);
        refreshSchedules();
        if (user) {
            dataService.syncSchedulesToSupabase(user.id)
                .then(() => triggerNotificationCycle({ reason: 'schedule_add', force: true }))
                .catch(() => {});
        }
        return created;
    }, [refreshSchedules, user]);

    const updateSchedule = useCallback((id, updates) => {
        const updated = dataService.updateSchedule(id, updates);
        refreshSchedules();
        if (user) {
            dataService.syncSchedulesToSupabase(user.id)
                .then(() => triggerNotificationCycle({ reason: 'schedule_update', force: true }))
                .catch(() => {});
        }
        return updated;
    }, [refreshSchedules, user]);

    const deleteSchedule = useCallback((id) => {
        dataService.deleteSchedule(id);
        refreshSchedules();
        if (user) {
            dataService.syncSchedulesToSupabase(user.id)
                .then(() => triggerNotificationCycle({ reason: 'schedule_delete', force: true }))
                .catch(() => {});
        }
    }, [refreshSchedules, user]);

    const importSchedulesBulk = useCallback(async (items) => {
        const merged = dataService.upsertSchedulesBulk(items);
        refreshSchedules();
        if (user) {
            await dataService.syncSchedulesToSupabase(user.id);
            triggerNotificationCycle({ reason: 'schedule_import', force: true });
        }
        return merged;
    }, [refreshSchedules, user]);

    const resetAllSchedules = useCallback(async () => {
        await dataService.deleteAllSchedulesData(user?.id);
        refreshSchedules();
    }, [refreshSchedules, user]);

    return (
        <ScheduleContext.Provider value={{
            schedules,
            addSchedule,
            updateSchedule,
            deleteSchedule,
            importSchedulesBulk,
            resetAllSchedules,
            refreshSchedules,
        }}>
            {children}
        </ScheduleContext.Provider>
    );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useSchedule() {
    const context = useContext(ScheduleContext);
    if (!context) throw new Error('useSchedule must be used within ScheduleProvider');
    return context;
}
