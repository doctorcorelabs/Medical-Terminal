import { useState } from 'react';

/**
 * CleanupModal
 * Modular confirmation dialog for clearing device history and stale logs.
 */
export default function CleanupModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    targetName = '',
    loading = false
}) {
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden transform transition-all scale-100 animate-[zoomIn_0.2s_ease-out]">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4">
                    <div className="size-12 rounded-2xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-amber-500 text-2xl font-bold">cleaning_services</span>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">Hapus Riwayat Perangkat</h2>
                        {targetName && (
                            <p className="text-xs font-bold text-amber-600 mt-1 uppercase tracking-tight">{targetName}</p>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-4">
                    <div className="p-4 bg-amber-500/5 border border-amber-500/10 rounded-xl">
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            Apakah Anda yakin ingin menghapus seluruh riwayat untuk perangkat ini?
                        </p>
                    </div>
                    
                    <ul className="space-y-2 text-[11px] font-bold text-slate-400 uppercase tracking-wider ml-1">
                        <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-amber-500"></span>
                            Metadata perangkat akan dihapus
                        </li>
                        <li className="flex items-center gap-2">
                            <span className="size-1.5 rounded-full bg-amber-500"></span>
                            Seluruh riwayat sesi akan dibersihkan
                        </li>
                        <li className="flex items-center gap-2 text-rose-500">
                            <span className="size-1.5 rounded-full bg-rose-500"></span>
                            Tindakan ini tidak dapat dibatalkan
                        </li>
                    </ul>
                </div>

                {/* Footer */}
                <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                    >
                        Batal
                    </button>
                    <button
                        onClick={onConfirm}
                        disabled={loading}
                        className="flex-[1.5] px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wider bg-slate-900 dark:bg-white text-white dark:text-slate-900 shadow-lg hover:bg-slate-800 dark:hover:bg-slate-100 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <div className="size-4 border-2 border-slate-400 border-t-slate-900 rounded-full animate-spin" />
                        ) : (
                            <span className="material-symbols-outlined text-lg">delete_sweep</span>
                        )}
                        Ya, Bersihkan
                    </button>
                </div>
            </div>
        </div>
    );
}
