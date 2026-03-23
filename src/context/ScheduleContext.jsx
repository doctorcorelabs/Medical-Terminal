import { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { useAuth } from './AuthContext';
import * as dataService from '../services/dataService';
import { triggerNotificationCycle } from '../services/notificationService';
import {
    canSyncSchedules,
    getScheduleContextResetState,
    getScheduleMutationReason,
    getScheduleScopeUserId,
} from './scheduleContextUtils';

const ScheduleContext = createContext();

function logSyncWarning(operation, userId, err) {
    console.warn('[ScheduleContext] Sync warning', {
        operation,
        userId: userId || null,
        error: err?.message || String(err || 'unknown'),
    });
}

export function ScheduleProvider({ children }) {
    const { user } = useAuth();
    const [schedules, setSchedules] = useState([]);

    // Load from Supabase on login, clear stale cache on user change
    useEffect(() => {
        const scopeUserId = getScheduleScopeUserId(user);
        if (scopeUserId) {
            dataService.setScheduleStorageScope(scopeUserId);
            dataService.fetchSchedulesFromSupabase(scopeUserId).then(data => {
                setSchedules(data);
            });
        } else {
            dataService.clearSchedulesCache();
            dataService.setScheduleStorageScope(null);
            setSchedules(getScheduleContextResetState());
        }
    }, [user]);

    const refreshSchedules = useCallback(() => {
        setSchedules(dataService.getAllSchedules());
    }, []);

    const addSchedule = useCallback((schedule) => {
        const created = dataService.addSchedule(schedule);
        refreshSchedules();
        if (canSyncSchedules(user)) {
            dataService.syncSchedulesToSupabase(user.id)
                .then(() => triggerNotificationCycle({ reason: getScheduleMutationReason('add'), force: true }))
                .catch((err) => {
                    logSyncWarning('addSchedule.syncAndNotify', user.id, err);
                });
        }
        return created;
    }, [refreshSchedules, user]);

    const updateSchedule = useCallback((id, updates) => {
        const updated = dataService.updateSchedule(id, updates);
        refreshSchedules();
        if (canSyncSchedules(user)) {
            dataService.syncSchedulesToSupabase(user.id)
                .then(() => triggerNotificationCycle({ reason: getScheduleMutationReason('update'), force: true }))
                .catch((err) => {
                    logSyncWarning('updateSchedule.syncAndNotify', user.id, err);
                });
        }
        return updated;
    }, [refreshSchedules, user]);

    const deleteSchedule = useCallback((id) => {
        dataService.deleteSchedule(id);
        refreshSchedules();
        if (canSyncSchedules(user)) {
            dataService.syncSchedulesToSupabase(user.id)
                .then(() => triggerNotificationCycle({ reason: getScheduleMutationReason('delete'), force: true }))
                .catch((err) => {
                    logSyncWarning('deleteSchedule.syncAndNotify', user.id, err);
                });
        }
    }, [refreshSchedules, user]);

    const importSchedulesBulk = useCallback(async (items) => {
        const merged = dataService.upsertSchedulesBulk(items);
        refreshSchedules();
        if (canSyncSchedules(user)) {
            try {
                await dataService.syncSchedulesToSupabase(user.id);
                await triggerNotificationCycle({ reason: getScheduleMutationReason('import'), force: true });
            } catch (err) {
                logSyncWarning('importSchedulesBulk.syncAndNotify', user.id, err);
            }
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
