import React from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { logUserActivity } from '../../services/activityService';

/**
 * ExclusiveSessionGuard
 * Component that wraps the application and displays a lockout screen 
 * if another session is active.
 */
export default function ExclusiveSessionGuard({ 
    children, 
    isLocked, 
    isKicked, 
    userId, 
    sessionId,
    onTakeoverSuccess 
}) {
    const { addToast } = useToast();
    const [isTakingOver, setIsTakingOver] = React.useState(false);
    const [isReportingKickIssue, setIsReportingKickIssue] = React.useState(false);

    const normalizeTakeoverResult = (rawData) => {
        if (Array.isArray(rawData)) return rawData[0] || null;
        if (rawData && typeof rawData === 'object') return rawData;
        return null;
    };

    const handleTakeover = async () => {
        setIsTakingOver(true);
        try {
            const { data, error } = await supabase.rpc('takeover_exclusive_session', {
                p_user_id: userId,
                p_current_session_id: sessionId
            });

            if (error) throw error;

            const takeoverResult = normalizeTakeoverResult(data);

            if (!takeoverResult) {
                addToast('Takeover selesai, memeriksa status sesi terbaru.', 'info');
                if (onTakeoverSuccess) onTakeoverSuccess();
                return;
            }

            if (takeoverResult.success !== true) {
                const errorMessage = takeoverResult.message || 'Takeover ditolak oleh sistem keamanan.';
                throw new Error(errorMessage);
            }

            if (takeoverResult.code === 'already_primary') {
                addToast('Perangkat ini sudah menjadi sesi utama aktif.', 'info');
            } else {
                addToast('Berhasil mengambil alih sesi. Perangkat lain telah diputuskan.', 'success');
            }

            if (onTakeoverSuccess) onTakeoverSuccess();
        } catch (err) {
            addToast(`Gagal mengambil alih: ${err.message}`, 'error');
        } finally {
            setIsTakingOver(false);
        }
    };

    const handleReportKickIssue = async () => {
        if (!userId || isReportingKickIssue) return;
        setIsReportingKickIssue(true);
        try {
            await logUserActivity({
                userId,
                eventType: 'session_false_kick_reported',
                featureKey: 'session_guard',
                metadata: { session_id: sessionId || null },
            });
            addToast('Laporan terkirim. Tim akan meninjau kemungkinan false-kick.', 'success');
        } catch (_err) {
            addToast('Gagal mengirim laporan. Coba lagi dalam beberapa saat.', 'error');
        } finally {
            setIsReportingKickIssue(false);
        }
    };

    // 1. If Kicked (by another device), show specialized screen
    if (isKicked) {
        return (
            <div className="fixed inset-0 z-9999 bg-slate-900 flex items-center justify-center p-6 text-center">
                <div className="max-w-md w-full space-y-6 animate-[fadeIn_0.3s_ease-out]">
                    <div className="size-20 bg-rose-500/10 rounded-full flex items-center justify-center mx-auto">
                        <span className="material-symbols-outlined text-rose-500 text-4xl animate-pulse">phonelink_erase</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-white mb-2">Sesi Berakhir</h2>
                        <p className="text-slate-400 text-sm">Akun Anda baru saja digunakan di perangkat lain. Untuk keamanan, sesi di perangkat ini telah diputuskan.</p>
                    </div>
                    <button 
                        onClick={() => supabase.auth.signOut()}
                        className="w-full py-4 bg-white text-slate-900 font-black rounded-2xl hover:bg-slate-100 transition-all uppercase tracking-widest text-xs"
                    >
                        Kembali ke Login
                    </button>
                    <button
                        onClick={handleReportKickIssue}
                        disabled={isReportingKickIssue}
                        className="w-full py-3 bg-transparent border border-slate-700 text-slate-300 font-bold rounded-2xl hover:border-slate-500 hover:text-white transition-all text-xs uppercase tracking-widest disabled:opacity-50"
                    >
                        {isReportingKickIssue ? 'Mengirim Laporan...' : 'Laporkan Jika Ini Keliru'}
                    </button>
                </div>
            </div>
        );
    }

    // 2. If Locked (another device is active), show lockout screen
    if (isLocked) {
        return (
            <div className="fixed inset-0 z-9998 bg-slate-900/95 backdrop-blur-md flex items-center justify-center p-6 text-center">
                <div className="max-w-md w-full space-y-8 animate-[scaleIn_0.3s_ease-out]">
                    <div className="space-y-4">
                        <div className="size-20 bg-amber-500/10 rounded-full flex items-center justify-center mx-auto border border-amber-500/20">
                            <span className="material-symbols-outlined text-amber-500 text-4xl">gpp_maybe</span>
                        </div>
                        <div>
                            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 text-amber-500 text-[10px] font-black uppercase tracking-widest mb-4">
                                <span className="size-1.5 rounded-full bg-amber-500 animate-pulse"></span>
                                Akun Sedang Digunakan
                            </div>
                            <h2 className="text-2xl font-black text-white mb-3">Akses Terbatas</h2>
                            <p className="text-slate-400 text-sm leading-relaxed">
                                Akun Anda terdeteksi aktif di perangkat lain. Untuk menjaga integritas data medis, aplikasi hanya dapat dibuka di satu tempat.
                            </p>
                        </div>
                    </div>

                    <div className="bg-white/5 border border-white/10 rounded-3xl p-6 text-left">
                        <div className="flex items-center gap-4">
                            <div className="size-10 rounded-xl bg-white/10 flex items-center justify-center text-white">
                                <span className="material-symbols-outlined">devices</span>
                            </div>
                            <div className="flex-1 min-w-0">
                                <p className="text-[10px] font-black text-slate-500 uppercase tracking-widest">Sesi Aktif</p>
                                <p className="text-sm font-bold text-white truncate">Perangkat Utama Lainnya</p>
                            </div>
                        </div>
                    </div>

                    <div className="grid grid-cols-1 gap-3 pt-4">
                        <button 
                            onClick={handleTakeover}
                            disabled={isTakingOver}
                            className="group relative w-full py-4 bg-primary text-white font-black rounded-2xl shadow-xl shadow-primary/20 hover:scale-[1.02] active:scale-[0.98] transition-all overflow-hidden disabled:opacity-50"
                        >
                            {isTakingOver ? (
                                <span className="material-symbols-outlined animate-spin">progress_activity</span>
                            ) : (
                                <span className="flex items-center justify-center gap-2 uppercase tracking-widest text-xs">
                                    <span className="material-symbols-outlined text-sm">bolt</span>
                                    Gunakan di Sini
                                </span>
                            )}
                        </button>
                        <button 
                            onClick={() => window.location.reload()}
                            className="w-full py-3 text-slate-400 font-bold hover:text-white transition-colors text-xs uppercase tracking-widest"
                        >
                            Muat Ulang Halaman
                        </button>
                    </div>
                    
                    <p className="text-[10px] text-slate-600 font-medium">
                        Fitur keamanan ini mencegah penyalahgunaan akun & memastikan riwayat medis tetap sinkron.
                    </p>
                </div>
            </div>
        );
    }

    // 3. Normalized state (No lock)
    return children;
}
