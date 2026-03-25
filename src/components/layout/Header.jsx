import { useOffline } from '../../context/OfflineContext';
import { useNavigate } from 'react-router-dom';
import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useAdminAlerts } from '../../context/AdminAlertContext';

export default function Header({ onMenuToggle }) {
    const { isOnline, isSyncing, syncFailed, syncDegraded, syncWarnings, lastSyncAt, pendingStatus } = useOffline();
    const { isAdmin, profile, isSpecialist } = useAuth();
    const { openAlertsCount } = useAdminAlerts();
    const navigate = useNavigate();
    const [announcement, setAnnouncement] = useState(null);

    const expDate = profile?.subscription_expires_at ? new Date(profile.subscription_expires_at) : null;
    const daysLeft = expDate ? Math.ceil((expDate - new Date()) / (1000 * 60 * 60 * 24)) : null;
    const showExpWarning = isSpecialist && daysLeft !== null && daysLeft <= 3 && daysLeft >= 0;

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
            });

        const subTimeoutId = setTimeout(() => {
            channel.subscribe();
        }, 2200);

        return () => {
            isMounted = false;
            clearTimeout(subTimeoutId);
            supabase.removeChannel(channel);
        };
    }, [isAdmin]);

    return (
        <header className="border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md sticky top-0 z-10 shrink-0">
            {/* Subscription Warning Banner */}
            {showExpWarning && (
                <div className="bg-amber-500 text-white px-4 md:px-8 py-2 flex items-center justify-between text-xs sm:text-sm font-semibold sticky top-0 z-30 shadow-md flex-wrap gap-2 animate-[slideDown_0.3s_ease-out]">
                    <div className="flex items-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">warning</span>
                        <span>
                            Langganan <b>Specialist</b> Anda akan berakhir dalam <span className="bg-amber-600 px-1.5 py-0.5 rounded mr-0.5">{daysLeft}</span> hari. 
                        </span>
                    </div>
                    <button onClick={() => navigate('/subscription')} className="bg-white text-amber-600 px-3 py-1 rounded-lg text-xs hover:bg-amber-50 active:scale-95 transition-all shadow-sm shrink-0 font-bold ml-auto border border-transparent hover:border-amber-200">
                        Perpanjang Sekarang
                    </button>
                </div>
            )}
            
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
            {/* Left: Mobile menu */}
            <div className="flex items-center gap-3">
                <button onClick={onMenuToggle} className="lg:hidden p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-600 dark:text-slate-400 shrink-0">
                    <span className="material-symbols-outlined">menu</span>
                </button>
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
                {isOnline && !isSyncing && !syncFailed && syncDegraded && (
                    <div
                        onClick={() => navigate('/settings')}
                        title={`Sinkronisasi sedang tertunda (${(syncWarnings || []).length} item menunggu antrean). Klik untuk buka pengelola.`}
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 text-amber-600 dark:text-amber-400 text-[11px] font-bold whitespace-nowrap cursor-pointer hover:bg-amber-100 transition-colors"
                    >
                        <span className="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                        <span className="hidden sm:inline">Sync tertunda</span>
                    </div>
                )}

                {isOnline && !isSyncing && !syncFailed && !syncDegraded && hasStuckItems && (
                    <div
                        onClick={() => navigate('/settings')}
                        title="Ada item yang gagal sinkron berkali-kali. Cek pengelola antrean di Pengaturan."
                        className="flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400 text-[11px] font-bold whitespace-nowrap cursor-pointer hover:bg-slate-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[14px]">priority_high</span>
                        <span className="hidden lg:inline">Cek Antrean</span>
                    </div>
                )}
                {isOnline && !isSyncing && !syncFailed && !syncDegraded && lastSyncAt && (
                    <div
                        title={`Sinkronisasi terakhir: ${lastSyncAt.toLocaleTimeString('id-ID')}`}
                        className="hidden md:flex items-center gap-1 text-[11px] text-green-600 dark:text-green-500 font-semibold"
                    >
                        <span className="material-symbols-outlined text-[14px]">cloud_done</span>
                        <span>Tersinkron</span>
                    </div>
                )}

                {pendingStatus?.any && (
                    <div
                        title={`Menunggu sinkronisasi: ${[
                            pendingStatus.patients ? 'pasien' : null,
                            pendingStatus.stases ? 'stase' : null,
                            pendingStatus.schedules ? 'jadwal' : null,
                        ].filter(Boolean).join(', ')}`}
                        className="hidden sm:flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 border border-amber-300 dark:border-amber-700 text-amber-700 dark:text-amber-400 text-[11px] font-bold whitespace-nowrap"
                    >
                        <span className="material-symbols-outlined text-[14px]">pending_actions</span>
                        <span>Pending {pendingStatus.count}</span>
                    </div>
                )}

                {/* Removed non-admin notification bell as requested */}

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

