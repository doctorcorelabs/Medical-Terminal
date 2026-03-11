import { useOffline } from '../../context/OfflineContext';
import { useNavigate } from 'react-router-dom';

export default function Header({ onMenuToggle, searchQuery, onSearchChange }) {
    const { isOnline, isSyncing, syncFailed, lastSyncAt, conflictCount } = useOffline();
    const navigate = useNavigate();

    return (
        <header className="h-16 border-b border-slate-200 dark:border-slate-800 bg-white/80 dark:bg-slate-900/80 backdrop-blur-md flex items-center justify-between px-4 md:px-8 sticky top-0 z-10 shrink-0">
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
                    onClick={() => conflictCount > 0 ? navigate('/conflicts') : undefined}
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
                <div className="hidden md:flex items-center gap-2 pl-4 border-l border-slate-200 dark:border-slate-800">
                    <p className="text-xs text-slate-500 whitespace-nowrap">
                        {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                    </p>
                </div>
            </div>
        </header>
    );
}

