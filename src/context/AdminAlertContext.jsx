import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';
import { buildAdminAlertsState, canAccessAdminAlerts } from './adminAlertContextUtils';

const AdminAlertContext = createContext();

export function AdminAlertProvider({ children }) {
  const { isAdmin } = useAuth();
  const [openAlertsCount, setOpenAlertsCount] = useState(0);
  const [latestAlerts, setLatestAlerts] = useState([]);

  useEffect(() => {
    if (!canAccessAdminAlerts(isAdmin)) {
      const nextState = buildAdminAlertsState([], []);
      setOpenAlertsCount(nextState.openAlertsCount);
      setLatestAlerts(nextState.latestAlerts);
      return;
    }

    let mounted = true;

    const load = async () => {
      const [{ data: openRows }, { data: latestRows }] = await Promise.all([
        supabase.from('alert_events').select('id').eq('status', 'open'),
        supabase.from('alert_events').select('id, level, title, message, status, created_at').order('created_at', { ascending: false }).limit(10),
      ]);
      if (!mounted) return;
      const nextState = buildAdminAlertsState(openRows, latestRows);
      setOpenAlertsCount(nextState.openAlertsCount);
      setLatestAlerts(nextState.latestAlerts);
    };

    load();

    const channel = supabase
      .channel('admin_alert_events_realtime')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'alert_events' }, () => {
        load();
      })
      .subscribe();

    return () => {
      mounted = false;
      supabase.removeChannel(channel);
    };
  }, [isAdmin]);

  return (
    <AdminAlertContext.Provider value={{ openAlertsCount, latestAlerts }}>
      {children}
    </AdminAlertContext.Provider>
  );
}

// eslint-disable-next-line react-refresh/only-export-components
export function useAdminAlerts() {
  return useContext(AdminAlertContext);
}
