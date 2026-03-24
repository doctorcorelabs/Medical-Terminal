import { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';
import { useToast } from '../context/ToastContext';
import { getOrCreateDeviceId, getOrCreateSessionId } from '../services/swConfig';
import { getDeviceTypeIcon } from '../utils/deviceDetection';
import { useAuth } from '../context/AuthContext';

export default function UserDevices() {
    const navigate = useNavigate();
    const { addToast } = useToast();
    const { user } = useAuth();
    const [loading, setLoading] = useState(true);
    const [rows, setRows] = useState([]);
    const [busySessionId, setBusySessionId] = useState(null);

    const currentSessionId = useMemo(() => getOrCreateSessionId(), []);
    const currentDeviceId = useMemo(() => getOrCreateDeviceId(), []);

    const fetchSessions = useCallback(async () => {
        if (!user?.id) return;

        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('user_login_sessions')
                .select('id, user_id, device_id, session_id, user_agent, is_active, session_started_at, last_activity_at, revoked_at, revoke_reason')
                .eq('user_id', user.id)
                .order('last_activity_at', { ascending: false });

            if (error) throw error;
            
            const { data: devices } = await supabase
                .from('user_devices')
                .select('device_id, device_name')
                .eq('user_id', user.id);
            
            const deviceMap = (devices || []).reduce((acc, d) => {
                acc[d.device_id] = d.device_name;
                return acc;
            }, {});

            setRows((data || []).map(s => ({
                ...s,
                device_name: deviceMap[s.device_id] || null
            })));
        } catch (err) {
            addToast(`Gagal memuat perangkat: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast, user?.id]);

    useEffect(() => {
        fetchSessions();
    }, [fetchSessions]);

    const handleRevoke = async (row) => {
        if (!user?.id || row.session_id === currentSessionId) {
            addToast('Sesi aktif saat ini tidak bisa direvoke.', 'info');
            return;
        }

        if (!window.confirm('Putuskan koneksi perangkat ini?')) return;

        setBusySessionId(row.id);
        const nowIso = new Date().toISOString();

        try {
            const { error } = await supabase
                .from('user_login_sessions')
                .update({
                    is_active: false,
                    revoked_at: nowIso,
                    revoke_reason: 'user_self_revoke',
                    updated_at: nowIso,
                })
                .eq('id', row.id)
                .eq('user_id', user.id);

            if (error) throw error;

            await supabase
                .from('user_devices')
                .update({
                    revoked_at: nowIso,
                    revoked_reason: 'user_self_revoke',
                    updated_at: nowIso,
                })
                .eq('user_id', user.id)
                .eq('device_id', row.device_id)
                .is('revoked_at', null);

            await supabase
                .from('security_events')
                .insert({
                    user_id: user.id,
                    device_id: row.device_id,
                    event_type: 'user_self_revoke_device',
                    severity: 'low',
                    metadata: { source: 'user_devices_page' },
                });

            addToast('Perangkat berhasil direvoke.', 'success');
            fetchSessions();
        } catch (err) {
            addToast(`Gagal revoke: ${err.message}`, 'error');
        } finally {
            setBusySessionId(null);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-950/40">
            <div className="w-full max-w-5xl mx-auto px-4 md:px-6 lg:px-8 py-8 md:py-12 space-y-8 pb-32 lg:pb-12 animate-[fadeIn_0.3s_ease-out]">
                {/* Header Section */}
                <div className="flex flex-col md:flex-row md:items-end justify-between gap-6">
                    <div className="space-y-4">
                        <button
                            onClick={() => navigate('/settings')}
                            className="flex items-center gap-2 text-xs font-black uppercase tracking-widest text-slate-400 hover:text-primary transition-colors group"
                        >
                            <span className="material-symbols-outlined text-sm transition-transform group-hover:-translate-x-1">arrow_back</span>
                            Pengaturan
                        </button>
                        <div>
                            <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Perangkat Saya</h1>
                            <p className="text-slate-500 dark:text-slate-400 text-sm mt-2 font-medium">Kelola akses akun Anda. Anda dapat menggunakan maksimal 2 perangkat aktif.</p>
                        </div>
                    </div>
                    
                    <button
                        onClick={fetchSessions}
                        disabled={loading}
                        className="flex items-center gap-2 px-6 py-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl text-xs font-black uppercase tracking-widest hover:border-primary/30 hover:bg-primary/5 transition-all shadow-sm active:scale-95 disabled:opacity-50"
                    >
                        <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        Refresh Data
                    </button>
                </div>

                {/* Stats Summary Area (Optional) */}
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                    <div className="p-6 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 shadow-sm">
                        <div className="flex items-center gap-4">
                            <div className="size-12 rounded-2xl bg-emerald-500/10 flex items-center justify-center text-emerald-500">
                                <span className="material-symbols-outlined text-2xl font-bold">sensors</span>
                            </div>
                            <div>
                                <p className="text-[10px] font-black uppercase tracking-widest text-slate-400">Sesi Aktif</p>
                                <p className="text-2xl font-black text-slate-900 dark:text-white">{rows.filter(r => r.is_active).length} / 2</p>
                            </div>
                        </div>
                    </div>
                    {/* Placeholder for more stats if needed */}
                </div>

                {/* Device Cards Grid */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 lg:gap-6">
                    {loading && rows.length === 0 ? (
                        Array.from({ length: 2 }).map((_, i) => (
                            <div key={i} className="h-48 rounded-3xl bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800 animate-pulse" />
                        ))
                    ) : rows.length === 0 ? (
                        <div className="col-span-full py-20 text-center bg-white dark:bg-slate-900 rounded-3xl border border-dashed border-slate-200 dark:border-slate-800">
                            <div className="flex flex-col items-center gap-4 opacity-30">
                                <span className="material-symbols-outlined text-6xl">devices_off</span>
                                <p className="text-sm font-black uppercase tracking-widest">Belum ada sesi perangkat tercatat</p>
                            </div>
                        </div>
                    ) : (
                        rows.map((row) => {
                            const isCurrentSession = row.session_id === currentSessionId;
                            const deviceIcon = getDeviceTypeIcon(row.user_agent);
                            
                            return (
                                <div 
                                    key={row.id} 
                                    className={`group relative p-6 rounded-3xl border transition-all duration-300 ${
                                        isCurrentSession 
                                        ? 'bg-white dark:bg-slate-900 border-primary/30 shadow-xl shadow-primary/5 ring-1 ring-primary/10' 
                                        : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:shadow-lg hover:border-slate-300 dark:hover:border-slate-700'
                                    }`}
                                >
                                    {isCurrentSession && (
                                        <div className="absolute -top-3 left-6 px-3 py-1 bg-primary text-white text-[9px] font-black uppercase tracking-widest rounded-full shadow-lg shadow-primary/30">
                                            Sesi Saat Ini
                                        </div>
                                    )}

                                    <div className="flex items-start gap-5">
                                        <div className={`size-14 rounded-2xl flex items-center justify-center shrink-0 transition-colors ${
                                            isCurrentSession 
                                            ? 'bg-primary/10 text-primary' 
                                            : 'bg-slate-50 dark:bg-slate-800 text-slate-400 group-hover:bg-slate-100 dark:group-hover:bg-slate-700'
                                        }`}>
                                            <span className="material-symbols-outlined text-3xl font-bold">{deviceIcon}</span>
                                        </div>
                                        
                                        <div className="flex-1 min-w-0">
                                            <h3 className="text-lg font-black text-slate-800 dark:text-white truncate">
                                                {row.device_name || 'Perangkat Tanpa Nama'}
                                            </h3>
                                            <p className="text-[11px] font-medium text-slate-400 line-clamp-1 mt-1">{row.user_agent}</p>
                                            
                                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-5">
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Terakhir Aktif</span>
                                                    <span className="text-xs font-bold text-slate-600 dark:text-slate-300">
                                                        {new Date(row.last_activity_at || row.session_started_at).toLocaleString('id-ID', { dateStyle: 'medium', timeStyle: 'short' })}
                                                    </span>
                                                </div>
                                                <div className="flex flex-col">
                                                    <span className="text-[9px] font-black uppercase tracking-widest text-slate-400">Status</span>
                                                    <div className="flex items-center gap-1.5 mt-0.5">
                                                        <span className={`size-1.5 rounded-full ${row.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></span>
                                                        <span className={`text-[10px] font-black uppercase tracking-widest ${row.is_active ? 'text-emerald-500' : 'text-slate-400'}`}>
                                                            {row.is_active ? 'Online' : 'Sesi Berakhir'}
                                                        </span>
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    </div>

                                    {row.is_active && !isCurrentSession && (
                                        <div className="mt-6 pt-5 border-t border-slate-50 dark:border-slate-800">
                                            <button
                                                onClick={() => handleRevoke(row)}
                                                disabled={busySessionId === row.id}
                                                className="w-full py-3 rounded-2xl bg-rose-50 dark:bg-rose-500/5 text-rose-500 text-[10px] font-black uppercase tracking-widest hover:bg-rose-500 hover:text-white transition-all shadow-sm active:scale-[0.98] flex items-center justify-center gap-2 group/btn disabled:opacity-50"
                                            >
                                                {busySessionId === row.id ? (
                                                    <div className="size-4 border-2 border-rose-500/30 border-t-rose-500 rounded-full animate-spin" />
                                                ) : (
                                                    <>
                                                        <span className="material-symbols-outlined text-lg transition-transform group-hover/btn:scale-110">power_settings_new</span>
                                                        Putuskan Koneksi
                                                    </>
                                                )}
                                            </button>
                                        </div>
                                    )}
                                </div>
                            );
                        })
                    )}
                </div>

                {/* Footer Tip */}
                <div className="p-6 rounded-3xl bg-blue-500/5 border border-blue-500/10 flex items-start gap-4">
                    <span className="material-symbols-outlined text-blue-500 text-2xl font-bold">info</span>
                    <div>
                        <p className="text-sm font-bold text-blue-600 dark:text-blue-400">Keamanan Akun</p>
                        <p className="text-xs text-blue-600/70 dark:text-blue-400/70 mt-1 leading-relaxed">
                            Jika Anda melihat perangkat yang tidak dikenal, segera putuskan koneksi dan ganti kata sandi Anda untuk keamanan akun yang lebih baik.
                        </p>
                    </div>
                </div>
            </div>
        </div>
    );
}
