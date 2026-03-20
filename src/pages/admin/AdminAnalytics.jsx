import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { ALL_TOOLS } from '../../data/toolsCatalog';
import { downloadCsv } from '../../services/exportService';
import {
    BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
} from 'recharts';

const TOOL_NAME_MAP = Object.fromEntries(
    ALL_TOOLS.map(t => [t.id, t.name])
);
const EXTRA_NAME_MAP = {
    news: 'Berita',
    reports: 'Laporan',
    'ai-drug-summary': 'Ringkasan AI',
};
function featureName(key) {
    return TOOL_NAME_MAP[key] || EXTRA_NAME_MAP[key] || key;
}

const COLORS = ['#6366f1', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#14b8a6', '#f97316'];

export default function AdminAnalytics() {
    const navigate = useNavigate();
    const location = useLocation();
    const { addToast } = useToast();
    const [range, setRange] = useState('7'); // days
    const [data, setData] = useState({ topTools: [], dailyChart: [], totalUsage: 0, activeUsers: 0 });
    const [topUsers, setTopUsers] = useState([]);
    const [inactiveUsers, setInactiveUsers] = useState([]);
    const [rawLogs, setRawLogs] = useState([]);
    const [funnel, setFunnel] = useState({
        tools_page_view: 0,
        tool_action_started: 0,
        feature_opened: 0,
    });
    const [subscriptionStats, setSubscriptionStats] = useState({ activeSpecialists: 0, expiringSoon: 0 });
    const [loading, setLoading] = useState(true);
    const returnTo = location.state?.returnTo;
    const returnState = location.state?.returnState ?? null;
    const hasReturnTarget = typeof returnTo === 'string' && returnTo.startsWith('/admin');

    useEffect(() => {
        async function fetchData() {
            setLoading(true);
            try {
                const days = parseInt(range, 10);
                const since = new Date();
                since.setDate(since.getDate() - days);
                since.setHours(0, 0, 0, 0);

                const { data: logs, error } = await supabase
                    .from('usage_logs')
                    .select('user_id, feature_key, accessed_at')
                    .gte('accessed_at', since.toISOString());

                if (error) throw error;

                const rows = logs || [];
                setRawLogs(rows);

                // Total usage
                const totalUsage = rows.length;

                // Unique active users
                const activeUsers = new Set(rows.map(r => r.user_id)).size;

                // Top tools breakdown
                const countByFeature = {};
                rows.forEach(r => {
                    countByFeature[r.feature_key] = (countByFeature[r.feature_key] || 0) + 1;
                });
                const topTools = Object.entries(countByFeature)
                    .map(([key, count]) => ({ key, name: featureName(key), count }))
                    .sort((a, b) => b.count - a.count)
                    .slice(0, 10);

                // Daily chart
                const dailyMap = {};
                rows.forEach(r => {
                    const day = r.accessed_at.slice(0, 10);
                    dailyMap[day] = (dailyMap[day] || 0) + 1;
                });
                const dailyChart = [];
                for (let i = days - 1; i >= 0; i--) {
                    const d = new Date();
                    d.setDate(d.getDate() - i);
                    const key = d.toISOString().slice(0, 10);
                    dailyChart.push({
                        date: d.toLocaleDateString('id-ID', { day: 'numeric', month: 'short' }),
                        count: dailyMap[key] || 0,
                    });
                }

                setData({ topTools, dailyChart, totalUsage, activeUsers });

                const since30d = new Date();
                since30d.setDate(since30d.getDate() - 30);
                since30d.setHours(0, 0, 0, 0);

                const [{ data: activityRows }, { data: allProfiles }] = await Promise.all([
                    supabase
                        .from('user_activity_events')
                        .select('user_id, occurred_at, event_type')
                        .gte('occurred_at', since30d.toISOString()),
                    supabase
                        .from('profiles')
                        .select('user_id, username, full_name, created_at, role, subscription_expires_at')
                        .order('created_at', { ascending: false }),
                ]);

                const profileByUserId = Object.fromEntries((allProfiles || []).map((p) => [p.user_id, p]));
                const counts = {};
                const lastByUser = {};
                const funnelCounts = {
                    tools_page_view: 0,
                    tool_action_started: 0,
                    feature_opened: 0,
                };

                (activityRows || []).forEach((row) => {
                    counts[row.user_id] = (counts[row.user_id] || 0) + 1;
                    if (!lastByUser[row.user_id] || row.occurred_at > lastByUser[row.user_id]) {
                        lastByUser[row.user_id] = row.occurred_at;
                    }
                    if (Object.prototype.hasOwnProperty.call(funnelCounts, row.event_type)) {
                        funnelCounts[row.event_type] += 1;
                    }
                });

                const ranked = Object.entries(counts)
                    .map(([userId, total]) => ({
                        user_id: userId,
                        username: profileByUserId[userId]?.username || 'unknown',
                        full_name: profileByUserId[userId]?.full_name || '',
                        total_events_30d: total,
                        last_activity_at: lastByUser[userId],
                    }))
                    .sort((a, b) => b.total_events_30d - a.total_events_30d)
                    .slice(0, 10);
                setTopUsers(ranked);

                const inactive = (allProfiles || []).filter((p) => !lastByUser[p.user_id]).slice(0, 20);
                setInactiveUsers(inactive);
                setFunnel(funnelCounts);

                // Subscription metrics
                const activeSpec = (allProfiles || []).filter(p => {
                    if (p.role !== 'specialist') return false;
                    if (!p.subscription_expires_at) return true;
                    return new Date(p.subscription_expires_at) > new Date();
                });
                const expSoon = activeSpec.filter(p => {
                    if (!p.subscription_expires_at) return false;
                    const diffDays = Math.ceil((new Date(p.subscription_expires_at) - new Date()) / (1000 * 60 * 60 * 24));
                    return diffDays >= 0 && diffDays <= 7;
                }).length;
                setSubscriptionStats({ activeSpecialists: activeSpec.length, expiringSoon: expSoon });
            } catch (err) {
                addToast('Gagal memuat analitik: ' + (err.message || ''), 'error');
            } finally {
                setLoading(false);
            }
        }
        fetchData();
    }, [range]); // eslint-disable-line react-hooks/exhaustive-deps

    const exportUsageCsv = async () => {
        if (!rawLogs.length) {
            addToast('Belum ada data usage untuk diekspor.', 'info');
            return;
        }
        const rows = rawLogs.map((r) => ({
            user_id: r.user_id,
            feature_key: r.feature_key,
            accessed_at: new Date(r.accessed_at).toLocaleString('id-ID'),
        }));
        downloadCsv({
            rows,
            columns: [
                { key: 'user_id', label: 'User ID' },
                { key: 'feature_key', label: 'Feature Key' },
                { key: 'accessed_at', label: 'Waktu Akses' },
            ],
            filename: `usage_logs_${new Date().toISOString().slice(0, 10)}.csv`,
        });
        await supabase.from('admin_exports').insert({
            admin_id: (await supabase.auth.getUser()).data.user?.id,
            export_type: 'usage_logs_csv',
            row_count: rows.length,
            filters: { range_days: range },
        });
    };

    const rangeOptions = [
        { value: '7', label: '7 Hari Terakhir' },
        { value: '14', label: '14 Hari Terakhir' },
        { value: '30', label: '30 Hari Terakhir' },
    ];

    const handleBack = () => {
        if (hasReturnTarget) {
            navigate(returnTo, { state: returnState });
            return;
        }
        navigate('/admin');
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-8 pb-20 lg:pb-8 max-w-5xl animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition"
            >
                <span className="material-symbols-outlined text-base">chevron_left</span>
                {hasReturnTarget ? 'Kembali ke Dashboard Admin' : 'Dashboard Admin'}
            </button>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Analitik Penggunaan</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Statistik penggunaan fitur dan aktivitas pengguna.</p>
                </div>
                <div className="flex items-center gap-2">
                    <select
                        value={range}
                        onChange={e => setRange(e.target.value)}
                        className="px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm font-semibold text-slate-700 dark:text-slate-300 focus:outline-none focus:ring-2 focus:ring-primary/30"
                    >
                        {rangeOptions.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                    <button onClick={exportUsageCsv} className="px-3 py-2 rounded-lg bg-primary text-white text-xs font-bold hover:bg-primary/90">
                        Export Usage CSV
                    </button>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-24">
                    <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                </div>
            ) : (
                <>
                    {/* Summary Cards */}
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <div className="size-10 rounded-lg bg-violet-50 dark:bg-violet-900/20 text-violet-600 dark:text-violet-400 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[20px]">touch_app</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Total Penggunaan</p>
                            <p className="text-3xl font-bold mt-1">{data.totalUsage.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <div className="size-10 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 text-emerald-600 dark:text-emerald-400 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[20px]">group</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Pengguna Aktif</p>
                            <p className="text-3xl font-bold mt-1">{data.activeUsers.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <div className="flex justify-between items-start mb-3">
                                <div className="size-10 rounded-lg bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600 dark:text-indigo-400 flex items-center justify-center">
                                    <span className="material-symbols-outlined text-[20px]">workspace_premium</span>
                                </div>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Specialist Aktif</p>
                            <p className="text-3xl font-bold mt-1">{subscriptionStats.activeSpecialists.toLocaleString('id-ID')}</p>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                            <div className="size-10 rounded-lg bg-amber-50 dark:bg-amber-900/20 text-amber-600 dark:text-amber-400 flex items-center justify-center mb-3">
                                <span className="material-symbols-outlined text-[20px]">hourglass_empty</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">Akan Expired {'(< 7 Hr)'}</p>
                            <p className="text-3xl font-bold mt-1">{subscriptionStats.expiringSoon.toLocaleString('id-ID')}</p>
                        </div>
                    </div>

                    {/* Daily chart */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm">
                        <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Penggunaan Harian</h2>
                        {data.dailyChart.length === 0 || data.totalUsage === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <span className="material-symbols-outlined text-4xl mb-2">bar_chart</span>
                                <p className="text-sm">Belum ada data pada periode ini.</p>
                            </div>
                        ) : (
                            <ResponsiveContainer width="100%" height={200}>
                                <BarChart data={data.dailyChart} margin={{ top: 5, right: 10, left: -20, bottom: 5 }}>
                                    <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
                                    <XAxis
                                        dataKey="date"
                                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                                        tickLine={false}
                                        axisLine={false}
                                    />
                                    <YAxis
                                        tick={{ fontSize: 11, fill: '#94a3b8' }}
                                        tickLine={false}
                                        axisLine={false}
                                        allowDecimals={false}
                                    />
                                    <Tooltip
                                        contentStyle={{
                                            fontSize: 12,
                                            borderRadius: 8,
                                            border: '1px solid #e2e8f0',
                                        }}
                                        formatter={(v) => [v, 'Penggunaan']}
                                    />
                                    <Bar dataKey="count" radius={[4, 4, 0, 0]} fill="#6366f1" />
                                </BarChart>
                            </ResponsiveContainer>
                        )}
                    </div>

                    {/* Top tools table */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Fitur Paling Sering Digunakan</h2>
                        </div>
                        {data.topTools.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                                <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
                                <p className="text-sm">Belum ada data pada periode ini.</p>
                            </div>
                        ) : (
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {data.topTools.map((item, i) => {
                                    const maxCount = data.topTools[0]?.count || 1;
                                    const pct = Math.round((item.count / maxCount) * 100);
                                    return (
                                        <div key={item.key} className="flex items-center gap-4 px-5 py-3.5">
                                            <span className="text-xs font-bold text-slate-400 w-5 shrink-0">#{i + 1}</span>
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center justify-between mb-1">
                                                    <p className="text-sm font-semibold text-slate-800 dark:text-slate-200 truncate">{item.name}</p>
                                                    <p className="text-sm font-bold text-slate-900 dark:text-slate-100 ml-3 shrink-0">{item.count.toLocaleString('id-ID')}</p>
                                                </div>
                                                <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full overflow-hidden">
                                                    <div
                                                        className="h-full rounded-full"
                                                        style={{ width: `${pct}%`, backgroundColor: COLORS[i % COLORS.length] }}
                                                    />
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}
                    </div>

                    {/* Top users + inactivity */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Top User (30 Hari)</h2>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {topUsers.length === 0 ? (
                                    <div className="px-5 py-6 text-xs text-slate-400">Belum ada data aktivitas.</div>
                                ) : topUsers.map((u, i) => (
                                    <div key={u.user_id} className="px-5 py-3 flex items-center justify-between">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">#{i + 1} {u.username}</p>
                                        <p className="text-xs text-slate-500">{u.total_events_30d} event</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">User Inaktif (30 Hari)</h2>
                            </div>
                            <div className="divide-y divide-slate-100 dark:divide-slate-800">
                                {inactiveUsers.length === 0 ? (
                                    <div className="px-5 py-6 text-xs text-slate-400">Tidak ada user inaktif.</div>
                                ) : inactiveUsers.slice(0, 10).map((u) => (
                                    <div key={u.user_id} className="px-5 py-3 flex items-center justify-between">
                                        <p className="text-sm font-semibold text-slate-800 dark:text-slate-200">{u.username}</p>
                                        <p className="text-xs text-slate-500">Belum ada event</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Funnel */}
                    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800">
                            <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300">Analytics Funnel</h2>
                            <p className="text-xs text-slate-500 mt-0.5">Alur: Tools Page View {'->'} Tool Action Started {'->'} Feature Opened</p>
                        </div>
                        <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                            {[
                                { key: 'tools_page_view', label: 'Masuk Halaman Tools' },
                                { key: 'tool_action_started', label: 'Klik Tool' },
                                { key: 'feature_opened', label: 'Fitur Terbuka' },
                            ].map((step, idx, arr) => {
                                const prevVal = idx === 0 ? funnel.tools_page_view || 1 : funnel[arr[idx - 1].key] || 1;
                                const currentVal = funnel[step.key] || 0;
                                const conv = idx === 0 ? 100 : Math.round((currentVal / prevVal) * 100);

                                return (
                                    <div key={step.key} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4">
                                        <p className="text-xs text-slate-500">{step.label}</p>
                                        <p className="text-2xl font-bold mt-1">{currentVal.toLocaleString('id-ID')}</p>
                                        {idx > 0 && (
                                            <p className="text-xs mt-2 text-slate-500">Konversi step: <span className="font-semibold text-slate-700 dark:text-slate-300">{conv}%</span></p>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}
