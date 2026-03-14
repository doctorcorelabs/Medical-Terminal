import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';

export default function AdminDashboard() {
    const navigate = useNavigate();
    const location = useLocation();
    const [stats, setStats] = useState({ totalUsers: 0, activeToday: 0, usageToday: 0, disabledFeatures: 0 });
    const [health, setHealth] = useState({ errorRate15m: 0, avgLatency15m: 0, openAlerts: 0 });
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function fetchStats() {
            try {
                const today = new Date();
                today.setHours(0, 0, 0, 0);
                const todayISO = today.toISOString();

                const [usersRes, usageTodayRes, flagsRes] = await Promise.all([
                    supabase.from('profiles').select('id', { count: 'exact', head: true }),
                    supabase.from('usage_logs').select('user_id, feature_key').gte('accessed_at', todayISO),
                    supabase.from('feature_flags').select('enabled'),
                ]);

                const since15m = new Date(Date.now() - (15 * 60 * 1000)).toISOString();
                const [metricsRes, alertsRes] = await Promise.all([
                    supabase.from('system_health_metrics').select('metric_name, metric_value').gte('measured_at', since15m),
                    supabase.from('alert_events').select('id', { count: 'exact', head: true }).eq('status', 'open'),
                ]);

                const uniqueActiveToday = new Set((usageTodayRes.data || []).map(r => r.user_id)).size;
                const disabledCount = (flagsRes.data || []).filter(f => !f.enabled).length;

                setStats({
                    totalUsers: usersRes.count ?? 0,
                    activeToday: uniqueActiveToday,
                    usageToday: (usageTodayRes.data || []).length,
                    disabledFeatures: disabledCount,
                });

                const m = metricsRes.data || [];
                const errorSamples = m.filter(x => x.metric_name === 'error_rate').map(x => Number(x.metric_value));
                const latencySamples = m.filter(x => x.metric_name === 'latency_ms').map(x => Number(x.metric_value));
                const avg = (arr) => arr.length ? (arr.reduce((a, b) => a + b, 0) / arr.length) : 0;

                setHealth({
                    errorRate15m: avg(errorSamples),
                    avgLatency15m: avg(latencySamples),
                    openAlerts: alertsRes.count ?? 0,
                });
            } catch (_err) {
                // non-fatal
            } finally {
                setLoading(false);
            }
        }
        fetchStats();
    }, []);

    const shortcutCards = [
        { label: 'Manajemen Pengguna', desc: 'Lihat semua akun, angkat atau turunkan administrator.', icon: 'manage_accounts', to: '/admin/users', color: 'blue' },
        { label: 'Kontrol Fitur', desc: 'Aktifkan/nonaktifkan fitur dan atur pesan perbaikan.', icon: 'toggle_on', to: '/admin/features', color: 'emerald' },
        { label: 'Analitik Penggunaan', desc: 'Statistik penggunaan fitur dan aktivitas pengguna.', icon: 'bar_chart', to: '/admin/analytics', color: 'violet' },
        { label: 'Pengumuman Global', desc: 'Publikasikan banner informasi realtime untuk user.', icon: 'campaign', to: '/admin/announcements', color: 'amber' },
        { label: 'Alert Center', desc: 'Monitor alert realtime dan tangani insiden sistem.', icon: 'notification_important', to: '/admin/alerts', color: 'blue' },
        { label: 'Timeline User', desc: 'Audit aktivitas pengguna per akun secara kronologis.', icon: 'timeline', to: '/admin/timeline', color: 'emerald' },
    ];

    const statCards = [
        { label: 'Total Pengguna', value: stats.totalUsers, icon: 'group', color: 'blue' },
        { label: 'Pengguna Aktif Hari Ini', value: stats.activeToday, icon: 'person_check', color: 'emerald' },
        { label: 'Penggunaan Fitur Hari Ini', value: stats.usageToday, icon: 'analytics', color: 'violet' },
        { label: 'Fitur Dinonaktifkan', value: stats.disabledFeatures, icon: 'construction', color: 'amber' },
    ];

    const colorMap = {
        blue:    { bg: 'bg-blue-50 dark:bg-blue-900/20',    text: 'text-blue-600 dark:text-blue-400' },
        emerald: { bg: 'bg-emerald-50 dark:bg-emerald-900/20', text: 'text-emerald-600 dark:text-emerald-400' },
        violet:  { bg: 'bg-violet-50 dark:bg-violet-900/20', text: 'text-violet-600 dark:text-violet-400' },
        amber:   { bg: 'bg-amber-50 dark:bg-amber-900/20',  text: 'text-amber-600 dark:text-amber-400' },
    };

    return (
        <div className="w-full max-w-295 mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 space-y-6 md:space-y-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <div>
                <div className="flex items-start md:items-center gap-3 md:gap-4 mb-1">
                    <div className="bg-violet-100 dark:bg-violet-900/30 rounded-xl p-2.5 md:p-3 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-violet-600 dark:text-violet-400 text-[22px] md:text-2xl">admin_panel_settings</span>
                    </div>
                    <div>
                        <h1 className="text-xl sm:text-2xl md:text-3xl font-bold text-slate-900 dark:text-slate-100 leading-tight">Panel Administrator</h1>
                        <p className="text-sm md:text-base text-slate-500 dark:text-slate-400">Kelola pengguna, fitur, dan pantau penggunaan aplikasi.</p>
                    </div>
                </div>
            </div>

            {/* Stat Cards */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-4">
                {statCards.map(card => {
                    const c = colorMap[card.color];
                    return (
                        <div key={card.label} className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 md:p-5 shadow-sm min-h-35 md:min-h-39 flex flex-col justify-between">
                            <div className={`size-10 md:size-11 rounded-lg ${c.bg} ${c.text} flex items-center justify-center mb-3`}>
                                <span className="material-symbols-outlined text-[20px] md:text-[22px]">{card.icon}</span>
                            </div>
                            <p className="text-xs text-slate-500 dark:text-slate-400 font-medium">{card.label}</p>
                            {loading ? (
                                <div className="h-8 w-12 bg-slate-100 dark:bg-slate-800 rounded animate-pulse mt-1" />
                            ) : (
                                <p className="text-2xl md:text-3xl font-bold mt-1">{String(card.value).padStart(2, '0')}</p>
                            )}
                        </div>
                    );
                })}
            </div>

            {/* Shortcut Cards */}
            <div>
                <h2 className="text-base font-bold mb-4 text-slate-700 dark:text-slate-300">Menu Admin</h2>
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    {shortcutCards.map(card => {
                        const c = colorMap[card.color];
                        return (
                            <button
                                key={card.to}
                                onClick={() => navigate(card.to, {
                                    state: {
                                        returnTo: location.pathname,
                                        returnState: location.state ?? null,
                                    },
                                })}
                                className="group text-left bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 md:p-6 shadow-sm hover:border-primary/40 hover:-translate-y-0.5 hover:shadow-md transition-all h-full min-h-50 flex flex-col"
                            >
                                <div className={`size-11 md:size-12 rounded-xl ${c.bg} ${c.text} flex items-center justify-center mb-4`}>
                                    <span className="material-symbols-outlined text-2xl">{card.icon}</span>
                                </div>
                                <p className="font-bold text-slate-900 dark:text-slate-100 mb-1">{card.label}</p>
                                <p className="text-xs md:text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{card.desc}</p>
                                <div className="mt-auto pt-4 flex items-center gap-1 text-xs font-semibold text-primary">
                                    Buka
                                    <span className="material-symbols-outlined text-[16px] group-hover:translate-x-0.5 transition-transform">arrow_forward</span>
                                </div>
                            </button>
                        );
                    })}
                </div>
            </div>

            {/* Health Snapshot */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 md:p-6 shadow-sm">
                <h2 className="text-sm font-bold text-slate-700 dark:text-slate-300 mb-4">Snapshot Kesehatan Sistem (15 Menit)</h2>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3 md:gap-4">
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 min-h-27.5 flex flex-col justify-between">
                        <p className="text-xs text-slate-500">Error Rate</p>
                        <p className="text-xl md:text-2xl font-bold mt-1">{health.errorRate15m.toFixed(2)}%</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 min-h-27.5 flex flex-col justify-between">
                        <p className="text-xs text-slate-500">Rata-rata Latency</p>
                        <p className="text-xl md:text-2xl font-bold mt-1">{Math.round(health.avgLatency15m)} ms</p>
                    </div>
                    <div className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 md:p-5 min-h-27.5 flex flex-col justify-between">
                        <p className="text-xs text-slate-500">Alert Terbuka</p>
                        <p className="text-xl md:text-2xl font-bold mt-1">{health.openAlerts}</p>
                    </div>
                </div>
            </div>
        </div>
    );
}
