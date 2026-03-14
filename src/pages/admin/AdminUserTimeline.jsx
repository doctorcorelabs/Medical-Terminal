import { useEffect, useMemo, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../context/ToastContext';
import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';

function formatShortDate(value) {
  return new Date(value).toLocaleDateString('id-ID', {
    day: 'numeric',
    month: 'short',
  });
}

export default function AdminUserTimeline() {
  const navigate = useNavigate();
  const location = useLocation();
  const { addToast } = useToast();
  const [users, setUsers] = useState([]);
  const [userId, setUserId] = useState('');
  const [eventType, setEventType] = useState('all');
  const [days, setDays] = useState('14');
  const [events, setEvents] = useState([]);
  const [loading, setLoading] = useState(true);
  const returnTo = location.state?.returnTo;
  const returnState = location.state?.returnState ?? null;
  const hasReturnTarget = typeof returnTo === 'string' && returnTo.startsWith('/admin');

  useEffect(() => {
    async function loadUsers() {
      const { data } = await supabase.from('profiles').select('user_id, username, full_name').order('created_at', { ascending: false });
      setUsers(data || []);
      if (!userId && data?.length) setUserId(data[0].user_id);
    }
    loadUsers();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!userId) return;
    async function loadEvents() {
      setLoading(true);
      try {
        const since = new Date();
        since.setDate(since.getDate() - parseInt(days, 10));
        since.setHours(0, 0, 0, 0);

        let query = supabase
          .from('user_activity_events')
          .select('id, event_type, feature_key, metadata, occurred_at')
          .eq('user_id', userId)
          .gte('occurred_at', since.toISOString())
          .order('occurred_at', { ascending: false })
          .limit(500);

        if (eventType !== 'all') query = query.eq('event_type', eventType);

        const { data, error } = await query;
        if (error) throw error;
        setEvents(data || []);
      } catch (_err) {
        addToast('Gagal memuat timeline aktivitas.', 'error');
      } finally {
        setLoading(false);
      }
    }
    loadEvents();
  }, [userId, eventType, days]); // eslint-disable-line react-hooks/exhaustive-deps

  const selectedUser = useMemo(() => users.find(u => u.user_id === userId), [users, userId]);

  const handleBack = () => {
    if (hasReturnTarget) {
      navigate(returnTo, { state: returnState });
      return;
    }
    navigate('/admin');
  };

  const dailyChartData = useMemo(() => {
    const dayCount = parseInt(days, 10);
    const mapByDate = {};

    events.forEach((ev) => {
      const key = ev.occurred_at.slice(0, 10);
      mapByDate[key] = (mapByDate[key] || 0) + 1;
    });

    const chart = [];
    for (let i = dayCount - 1; i >= 0; i -= 1) {
      const date = new Date();
      date.setDate(date.getDate() - i);
      const key = date.toISOString().slice(0, 10);
      chart.push({
        date: formatShortDate(date),
        count: mapByDate[key] || 0,
      });
    }

    return chart;
  }, [events, days]);

  return (
    <div className="p-4 md:p-6 lg:p-8 space-y-6 pb-20 lg:pb-8 max-w-6xl animate-[fadeIn_0.3s_ease-out]">
      <button
        onClick={handleBack}
        className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition"
      >
        <span className="material-symbols-outlined text-base">chevron_left</span>
        {hasReturnTarget ? 'Kembali ke Dashboard Admin' : 'Dashboard Admin'}
      </button>
      <div>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Timeline Aktivitas User</h1>
        <p className="text-sm text-slate-500 dark:text-slate-400">Grafik aktivitas harian dan figure timeline event untuk audit operasional.</p>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 grid grid-cols-1 md:grid-cols-4 gap-3">
        <select value={userId} onChange={(e) => setUserId(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          {users.map(u => <option key={u.user_id} value={u.user_id}>{u.username} {u.full_name ? `- ${u.full_name}` : ''}</option>)}
        </select>
        <select value={eventType} onChange={(e) => setEventType(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          <option value="all">Semua Event</option>
          <option value="auth_signed_in">Login</option>
          <option value="auth_signed_out">Logout</option>
          <option value="tools_page_view">Buka Halaman Tools</option>
          <option value="tool_action_started">Mulai Aksi Tool</option>
          <option value="feature_opened">Buka Fitur</option>
        </select>
        <select value={days} onChange={(e) => setDays(e.target.value)} className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm">
          <option value="7">7 hari</option>
          <option value="14">14 hari</option>
        </select>
        <div className="text-xs text-slate-500 flex items-center">User: <span className="font-semibold ml-1">{selectedUser?.username || '-'}</span></div>
      </div>

      <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Grafik Aktivitas Harian</h2>
          <div className="text-xs text-slate-500">Retensi otomatis: maksimal 14 hari</div>
        </div>
        {loading ? (
          <div className="flex items-center justify-center py-16"><span className="material-symbols-outlined animate-spin text-primary text-2xl">progress_activity</span></div>
        ) : events.length === 0 ? (
          <div className="py-16 text-center text-slate-400 text-sm">Belum ada data aktivitas untuk periode ini.</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <BarChart data={dailyChartData} margin={{ top: 5, right: 12, left: -20, bottom: 5 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} />
              <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} tickLine={false} axisLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{
                  fontSize: 12,
                  borderRadius: 8,
                  border: '1px solid #e2e8f0',
                }}
                formatter={(value) => [value, 'Total event']}
                labelFormatter={(_, payload) => {
                  const eventDate = payload?.[0]?.payload?.date;
                  return eventDate ? `Tanggal: ${eventDate}` : '';
                }}
              />
              <Bar dataKey="count" fill="#0ea5e9" radius={[6, 6, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
