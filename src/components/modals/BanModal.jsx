import { useState, useEffect } from 'react';

/**
 * BanModal
 * 
 * Props:
 *  - isOpen: boolean
 *  - onClose: function
 *  - onConfirm: function(isBanned, reason)
 *  - targetName: string
 *  - currentStatus: boolean (true if currently banned)
 *  - loading: boolean
 */
export default function BanModal({ 
    isOpen, 
    onClose, 
    onConfirm, 
    targetName = '',
    currentStatus = false,
    loading = false
}) {
    const [reason, setReason] = useState('');
    const [presetReason, setPresetReason] = useState('');

    const PRESET_REASONS = [
        'Aktivitas login mencurigakan',
        'Pelanggaran syarat dan ketentuan',
        'Penggunaan perangkat tidak sah',
        'Permintaan keamanan sistem',
    ];

    useEffect(() => {
        if (isOpen) {
            setReason('');
            setPresetReason('');
        }
    }, [isOpen]);

    if (!isOpen) return null;

    const handleConfirm = () => {
        const finalReason = reason.trim() || presetReason || 'Alasan tidak ditentukan';
        onConfirm(!currentStatus, finalReason);
    };

    const isBanAction = !currentStatus;

    return (
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-md overflow-hidden transform transition-all scale-100">
                {/* Header */}
                <div className={`px-6 py-5 border-b border-slate-100 dark:border-slate-800 flex items-start gap-4 ${isBanAction ? 'bg-rose-50/30' : 'bg-emerald-50/30'}`}>
                    <div className={`size-12 rounded-2xl flex items-center justify-center shrink-0 ${isBanAction ? 'bg-rose-100 dark:bg-rose-500/10 text-rose-500' : 'bg-emerald-100 dark:bg-emerald-500/10 text-emerald-500'}`}>
                        <span className="material-symbols-outlined text-2xl font-bold">
                            {isBanAction ? 'gpp_bad' : 'verified_user'}
                        </span>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-lg font-black text-slate-900 dark:text-white leading-tight">
                            {isBanAction ? 'Ban Akun Pengguna' : 'Buka Blokir Akun'}
                        </h2>
                        {targetName && (
                            <p className="text-sm font-bold text-slate-500 dark:text-slate-400 mt-1">@{targetName}</p>
                        )}
                    </div>
                </div>

                {/* Body */}
                <div className="px-6 py-6 space-y-5">
                    <p className="text-sm text-slate-500 dark:text-slate-400 leading-relaxed">
                        {isBanAction 
                            ? 'Akun ini akan dinonaktifkan secara permanen sampai Anda mencabut status blokir. Semua sesi aktif akan segera diputus.' 
                            : 'Pengguna akan dapat kembali menggunakan akun ini dan melakukan login seperti biasa.'}
                    </p>

                    {isBanAction && (
                        <div className="space-y-4">
                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                                    Pilih Alasan Preset
                                </label>
                                <div className="grid grid-cols-1 gap-2">
                                    {PRESET_REASONS.map((r) => (
                                        <button
                                            key={r}
                                            onClick={() => {
                                                setPresetReason(r);
                                                setReason('');
                                            }}
                                            className={`text-left px-4 py-3 rounded-xl text-xs font-bold transition-all border ${
                                                presetReason === r 
                                                ? 'bg-rose-500/10 border-rose-500 text-rose-600 dark:text-rose-400' 
                                                : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-slate-300'
                                            }`}
                                        >
                                            {r}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-2">
                                <label className="block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-slate-500 ml-1">
                                    Atau Alasan Kustom
                                </label>
                                <textarea
                                    value={reason}
                                    onChange={(e) => {
                                        setReason(e.target.value);
                                        setPresetReason('');
                                    }}
                                    placeholder="Tulis alasan spesifik di sini..."
                                    className="w-full min-h-[80px] p-4 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-4 focus:ring-rose-500/10 focus:border-rose-500 outline-none transition-all resize-none"
                                />
                            </div>
                        </div>
                    )}
                </div>

                {/* Footer */}
                <div className="px-6 py-5 bg-slate-50 dark:bg-slate-800/50 flex gap-3">
                    <button
                        onClick={onClose}
                        disabled={loading}
                        className="flex-1 px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider text-slate-500 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all disabled:opacity-50"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleConfirm}
                        disabled={loading || (isBanAction && !reason.trim() && !presetReason)}
                        className={`flex-[1.5] px-4 py-3 rounded-2xl text-xs font-black uppercase tracking-wider text-white shadow-lg transition-all disabled:opacity-50 flex items-center justify-center gap-2 ${
                            isBanAction 
                            ? 'bg-rose-500 shadow-rose-500/20 hover:bg-rose-600' 
                            : 'bg-emerald-500 shadow-emerald-500/20 hover:bg-emerald-600'
                        }`}
                    >
                        {loading ? (
                            <div className="size-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                        ) : (
                            <>
                                <span className="material-symbols-outlined text-base">
                                    {isBanAction ? 'block' : 'undo'}
                                </span>
                                {isBanAction ? 'Konfirmasi Ban' : 'Aktifkan Akun'}
                            </>
                        )}
                    </button>
                </div>
            </div>
        </div>
    );
}
