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
            
            // Enrich with device names
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
            addToast('Sesi aktif saat ini tidak bisa direvoke dari layar ini.', 'info');
            return;
        }

        const nowIso = new Date().toISOString();

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

        if (error) {
            addToast(`Gagal revoke perangkat: ${error.message}`, 'error');
            return;
        }

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
    };

    return (
        <div className="w-full max-w-295 mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 space-y-6 md:space-y-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            <button
                onClick={() => navigate('/settings')}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition"
            >
                <span className="material-symbols-outlined text-base">chevron_left</span>
                Kembali ke Pengaturan
            </button>

            <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Perangkat Saya</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Kelola sesi login Anda. Maksimal 2 perangkat aktif secara bersamaan.</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex items-center justify-between gap-3">
                    <p className="text-xs font-bold uppercase tracking-wider text-slate-500">Sesi Perangkat</p>
                    <button
                        onClick={fetchSessions}
                        className="flex items-center gap-2 px-4 py-2 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                    >
                        <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        Refresh
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                                <th className="px-6 py-4">Device</th>
                                <th className="px-6 py-4">Aktivitas</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-20 text-center">
                                        <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
                                    </td>
                                </tr>
                            ) : rows.length === 0 ? (
                                <tr>
                                    <td colSpan="4" className="px-6 py-20 text-center text-sm text-slate-500">Belum ada sesi perangkat.</td>
                                </tr>
                            ) : (
                                rows.map((row) => {
                                    const isCurrentSession = row.session_id === currentSessionId;
                                    const deviceIcon = getDeviceTypeIcon(row.user_agent);
                                    
                                    return (
                                        <tr key={row.id} className={`transition-colors ${isCurrentSession ? 'bg-primary/5 dark:bg-primary/5' : 'hover:bg-slate-50/50 dark:hover:bg-slate-800/30'}`}>
                                            <td className="px-6 py-4 align-top">
                                                <div className="flex items-start gap-4">
                                                    <div className={`size-10 rounded-xl flex items-center justify-center flex-shrink-0 ${
                                                        isCurrentSession 
                                                        ? 'bg-primary text-white' 
                                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                                    }`}>
                                                        <span className="material-symbols-outlined text-xl">{deviceIcon}</span>
                                                    </div>
                                                    <div>
                                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                            {row.device_name || 'Perangkat Tanpa Nama'}
                                                        </p>
                                                        {isCurrentSession && (
                                                            <span className="inline-flex items-center gap-1 mt-1 px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-primary text-white">
                                                                Sesi Saat Ini
                                                            </span>
                                                        )}
                                                        <p className="text-[10px] font-mono text-slate-400 mt-1 max-w-64 truncate">ID: {row.device_id}</p>
                                                        <p className="text-[11px] text-slate-500 mt-1 max-w-120 truncate">{row.user_agent || '-'}</p>
                                                    </div>
                                                </div>
                                            </td>

                                            <td className="px-6 py-4 align-top">
                                                <p className="text-sm text-slate-700 dark:text-slate-200">
                                                    {new Date(row.last_activity_at || row.session_started_at).toLocaleString('id-ID')}
                                                </p>
                                                <p className="text-[11px] text-slate-400">Mulai: {new Date(row.session_started_at).toLocaleString('id-ID')}</p>
                                            </td>

                                            <td className="px-6 py-4 align-top">
                                                {row.is_active ? (
                                                    <span className="inline-flex items-center gap-1 text-green-500 font-bold text-xs">
                                                        <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                        ACTIVE
                                                    </span>
                                                ) : (
                                                    <div>
                                                        <span className="inline-flex items-center gap-1 text-slate-500 font-bold text-xs">
                                                            <span className="size-1.5 rounded-full bg-slate-400"></span>
                                                            REVOKED
                                                        </span>
                                                        <p className="text-[10px] text-slate-400 mt-1">{row.revoke_reason || '-'}</p>
                                                    </div>
                                                )}
                                            </td>

                                            <td className="px-6 py-4 align-top text-right">
                                                {row.is_active && !isCurrentSession ? (
                                                    <button
                                                        onClick={() => handleRevoke(row)}
                                                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-red-50 dark:bg-red-500/10 text-red-600 dark:text-red-400 text-[11px] font-black uppercase tracking-wider rounded-lg hover:bg-red-500 hover:text-white transition-all"
                                                    >
                                                        <span className="material-symbols-outlined text-[16px]">logout</span>
                                                        Putus
                                                    </button>
                                                ) : (
                                                    <span className="text-[11px] text-slate-400">-</span>
                                                )}
                                            </td>
                                        </tr>
                                    );
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
