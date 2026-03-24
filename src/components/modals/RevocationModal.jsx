import { useState, useEffect } from 'react';

/**
 * RevocationModal
 * 
 * Props:
 *  - isOpen: boolean
 *  - onClose: function
 *  - onConfirm: function(customMessage)
 *  - title: string
 *  - description: string
 *  - targetName: string (e.g. Username or Device Name)
 *  - loading: boolean
 */
export default function RevocationModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    title = 'Cabut Sesi Perangkat',
    description = 'Apakah Anda yakin ingin menghentikan sesi ini secara paksa?',
    targetName = '',
    loading = false
}) {
    const [message, setMessage] = useState('Sesi perangkat dicabut oleh admin.');

    useEffect(() => {
        if (isOpen) {
            setMessage('Sesi perangkat dicabut oleh admin.');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden transform transition-all scale-100">
                {/* Header */}
                <div className="px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4">
                    <div className="size-12 rounded-2xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center shrink-0">
                        <span className="material-symbols-outlined text-rose-500 text-2xl font-bold">lock_reset</span>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">{title}</h2>
                        {targetName && (
                            <p className="text-sm font-bold text-rose-500 mt-1">{targetName}</p>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-4">
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {description}
                    </p>

                    <div className="space-y-2">
                        <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                            Pesan Kustom (Opsional)
                        </label>
                        <textarea
                            value={message}
                            onChange={(e) => setMessage(e.target.value)}
                            placeholder="Tulis alasan pencabutan sesi di sini..."
                            className="w-full min-h-[100px] p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all resize-none"
                        />
                    </div>
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
                        onClick={() => onConfirm(message)}
                        disabled={loading}
                        className="flex-[1.5] px-4 py-3 rounded-xl text-sm font-black uppercase tracking-wider bg-rose-500 text-white shadow-lg shadow-rose-500/20 hover:bg-rose-600 hover:shadow-rose-500/40 transition-all disabled:opacity-50 flex items-center justify-center gap-2"
                    >
                        {loading ? (
                            <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <span className="material-symbols-outlined text-lg">logout</span>
                        )}
                        Konfirmasi Revoke
                    </button>
                </div>
            </div>
        </div>
    );
}
