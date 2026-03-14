import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../services/supabaseClient';
import { useAuth } from './AuthContext';

const AdminAlertContext = createContext();

export function AdminAlertProvider({ children }) {
  const { isAdmin } = useAuth();
  const [openAlertsCount, setOpenAlertsCount] = useState(0);
  const [latestAlerts, setLatestAlerts] = useState([]);

  useEffect(() => {
    if (!isAdmin) {
      setOpenAlertsCount(0);
      setLatestAlerts([]);
      return;
    }

    let mounted = true;

    const load = async () => {
      const [{ data: openRows }, { data: latestRows }] = await Promise.all([
        supabase.from('alert_events').select('id').eq('status', 'open'),
        supabase.from('alert_events').select('id, level, title, message, status, created_at').order('created_at', { ascending: false }).limit(10),
      ]);
      if (!mounted) return;
      setOpenAlertsCount((openRows || []).length);
      setLatestAlerts(latestRows || []);
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
