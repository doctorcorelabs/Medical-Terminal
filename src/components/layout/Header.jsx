import { useOffline } from '../../context/OfflineContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useAdminAlerts } from '../../context/AdminAlertContext';

export default function Header({ onMenuToggle, searchQuery, onSearchChange }) {
    const { isOnline, isSyncing, syncFailed, lastSyncAt, conflictCount } = useOffline();
    const { isAdmin } = useAuth();
    const { openAlertsCount } = useAdminAlerts();
    const navigate = useNavigate();
    const [announcement, setAnnouncement] = useState(null);

    useEffect(() => {
        let isMounted = true;

        const loadAnnouncement = async () => {
            const nowIso = new Date().toISOString();
            let query = supabase
                .from('admin_announcements')
                .select('id, title, message, level, target, active, start_at, end_at, created_at')
                .eq('active', true)
                .or(`start_at.is.null,start_at.lte.${nowIso}`)
                .or(`end_at.is.null,end_at.gte.${nowIso}`)
                .order('created_at', { ascending: false })
                .limit(20);

            const { data, error } = await query;
            if (error || !isMounted) return;
            const visible = (data || []).find((item) => {
                if (item.target === 'all') return true;
                if (item.target === 'admin') return !!isAdmin;
                if (item.target === 'non_admin') return !isAdmin;
                return false;
            });
            setAnnouncement(visible || null);
        };

        loadAnnouncement();

        const channel = supabase
            .channel('admin_announcements_header')
            .on('postgres_changes', { event: '*', schema: 'public', table: 'admin_announcements' }, () => {
                loadAnnouncement();
            })
            .subscribe();

        return () => {
            isMounted = false;
            supabase.removeChannel(channel);
        };
    }, [isAdmin]);

    return (
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
            {announcement && (
                <div className={`px-4 md:px-8 py-2 text-xs font-medium border-b border-slate-200/70 dark:border-slate-700/60 ${announcement.level === 'critical'
                    ? 'bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300'
                    : announcement.level === 'warning'
                        ? 'bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300'
                        : 'bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300'} `}
                >
                    <span className="font-bold mr-2">{announcement.title}</span>
                    <span>{announcement.message}</span>
                </div>
            )}
            <div className="h-16 flex items-center justify-between px-4 md:px-8">
            {/* Left: Mobile menu + Search */}
            <div className="flex items-center gap-3 flex-1 max-w-xl min-w-0">
                <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                    <span className="material-symbols-outlined">menu</span>
                </button>
                <div className="relative flex-1 min-w-0">
                    <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-xl">search</span>
                    <input
                        type="text"
                        value={searchQuery}
                        onChange={e => onSearchChange(e.target.value)}
                        className="w-full bg-slate-100 dark:bg-slate-800 border-none rounded-lg pl-10 pr-4 py-2 text-sm focus:ring-2 focus:ring-primary/50 transition-all placeholder:text-slate-400"
                        placeholder="Cari pasien, catatan, atau gejala..."
                    />
                </div>
            </div>

            {/* Right: Actions */}
            <div className="flex items-center gap-2 md:gap-4 shrink-0 ml-4">

                {/* ── Offline / Syncing indicator ── */}
                {!isOnline && (
                    <div
                        title="Anda sedang offline. Data tersimpan lokal dan akan disinkronkan saat kembali online."
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-[11px] font-bold whitespace-nowrap animate-pulse"
                    >
                        <span className="material-symbols-outlined text-[14px]">wifi_off</span>
                        <span className="hidden sm:inline">Offline</span>
                    </div>
                )}
                {isOnline && isSyncing && (
                    <div
                        title="Menyinkronkan data ke server..."
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-blue-100 dark:bg-blue-900/40 border border-blue-300 dark:border-blue-700 text-blue-700 dark:text-blue-400 text-[11px] font-bold whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-[14px] animate-spin">sync</span>
                        <span className="hidden sm:inline">Sinkronisasi...</span>
                    </div>
                )}
                {isOnline && !isSyncing && syncFailed && (
                    <div
                        title="Sinkronisasi gagal. Akan dicoba lagi secara otomatis."
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-red-100 dark:bg-red-900/40 border border-red-300 dark:border-red-700 text-red-700 dark:text-red-400 text-[11px] font-bold whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-[14px]">sync_problem</span>
                        <span className="hidden sm:inline">Sync gagal</span>
                    </div>
                )}
                {isOnline && !isSyncing && !syncFailed && lastSyncAt && (
                    <div
                        title={`Sinkronisasi terakhir: ${lastSyncAt.toLocaleTimeString('id-ID')}`}
                        className="hidden md:flex items-center gap-1 text-[11px] text-green-600 dark:text-green-500 font-semibold"
                    >
                        <span className="material-symbols-outlined text-[14px]">cloud_done</span>
                        <span>Tersinkron</span>
                    </div>
                )}

                <button
                    onClick={() => navigate('/settings#data-conflicts')}
                    title={conflictCount > 0 ? `${conflictCount} konflik data perlu ditinjau` : 'Notifikasi'}
                    className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400"
                >
                    <span className="material-symbols-outlined">
                        {conflictCount > 0 ? 'merge_type' : 'notifications'}
                    </span>
                    {conflictCount > 0 ? (
                        <span className="absolute top-1 right-1 size-4 flex items-center justify-center rounded-full bg-amber-500 text-white text-[9px] font-bold border-2 border-white dark:border-slate-900">
                            {conflictCount}
                        </span>
                    ) : (
                        <span className="absolute top-2 right-2 size-2 bg-red-500 rounded-full border-2 border-white dark:border-slate-900"></span>
                    )}
                </button>

                {isAdmin && (
                    <button
                        onClick={() => navigate('/admin/alerts')}
                        title={openAlertsCount > 0 ? `${openAlertsCount} alert terbuka` : 'Alert Center'}
                        className="relative p-2 rounded-full hover:bg-slate-100 dark:hover:bg-slate-800 text-violet-600 dark:text-violet-400"
                    >
                        <span className="material-symbols-outlined">notification_important</span>
                        {openAlertsCount > 0 && (
                            <span className="absolute top-1 right-1 min-w-4 h-4 px-1 flex items-center justify-center rounded-full bg-red-500 text-white text-[9px] font-bold border-2 border-white dark:border-slate-900">
                                {openAlertsCount}
                            </span>
                        )}
                    </button>
                )}

                <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </div>
            </div>
        </header>
    );
}

