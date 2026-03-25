import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { getDeviceTypeIcon } from '../../utils/deviceDetection';
import RevocationModal from '../../components/modals/RevocationModal';
import BanModal from '../../components/modals/BanModal';
import CleanupModal from '../../components/modals/CleanupModal';

export default function AdminUserDevices() {
    const { addToast } = useToast();
    const [rows, setRows] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const [statusFilter, setStatusFilter] = useState('all');
    const [banByUserId, setBanByUserId] = useState({});
    const [eventsByUserId, setEventsByUserId] = useState({});
    const [expandedUserIds, setExpandedUserIds] = useState(() => new Set());
    const [busyUserId, setBusyUserId] = useState(null); 
    const [busySessionId, setBusySessionId] = useState(null);
    const [busyStatus, setBusyStatus] = useState({}); 

    // Modal state
    const [revokeModal, setRevokeModal] = useState({
        isOpen: false,
        type: 'session', 
        targetId: null,
        targetName: '',
        extraId: null, 
    });

    const [banModal, setBanModal] = useState({
        isOpen: false,
        userId: null,
        username: '',
        currentStatus: false
    });

    const [cleanupModal, setCleanupModal] = useState({
        isOpen: false,
        userId: null,
        deviceId: null,
        deviceName: '',
    });

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const { data: sessions, error: sessionsError } = await supabase
                .from('user_login_sessions')
                .select('id, user_id, device_id, session_id, user_agent, is_active, session_started_at, last_activity_at, revoked_at, revoke_reason, location_metadata')
                .order('last_activity_at', { ascending: false })
                .limit(500);

            if (sessionsError) throw sessionsError;

            const userIds = [...new Set((sessions || []).map((s) => s.user_id).filter(Boolean))];
            let profileMap = {};
            let banMap = {};
            let userEventMap = {};
            let deviceMap = {}; 

            if (userIds.length > 0) {
                const { data: profiles, error: profilesError } = await supabase
                    .from('profiles')
                    .select('user_id, username, full_name, is_security_whitelisted, role')
                    .in('user_id', userIds);

                if (profilesError) {
                    console.warn('[AdminUserDevices] profiles fetch warning:', profilesError.message);
                } else {
                    profileMap = (profiles || []).reduce((acc, item) => {
                        acc[item.user_id] = item;
                        return acc;
                    }, {});
                }

                const { data: banPolicies, error: banPoliciesError } = await supabase
                    .from('user_ban_policies')
                    .select('user_id, is_banned, reason, ban_expires_at')
                    .in('user_id', userIds);

                if (banPoliciesError) {
                    console.warn('[AdminUserDevices] ban policies fetch warning:', banPoliciesError.message);
                } else {
                    banMap = (banPolicies || []).reduce((acc, item) => {
                        acc[item.user_id] = item;
                        return acc;
                    }, {});
                }

                const { data: events, error: eventsError } = await supabase
                    .from('security_events')
                    .select('id, user_id, device_id, event_type, severity, resolved, created_at, metadata')
                    .in('user_id', userIds)
                    .order('created_at', { ascending: false })
                    .limit(1000);

                if (eventsError) {
                    console.warn('[AdminUserDevices] security events fetch warning:', eventsError.message);
                } else {
                    userEventMap = (events || []).reduce((acc, event) => {
                        if (!event?.user_id) return acc;
                        if (!acc[event.user_id]) acc[event.user_id] = [];
                        acc[event.user_id].push(event);
                        return acc;
                    }, {});
                }

                const { data: deviceMetadata, error: deviceError } = await supabase
                    .from('user_devices')
                    .select('user_id, device_id, device_name, location_metadata')
                    .in('user_id', userIds);

                if (!deviceError && deviceMetadata) {
                    deviceMap = deviceMetadata.reduce((acc, d) => {
                        acc[`${d.user_id}:${d.device_id}`] = {
                            name: d.device_name,
                            location: d.location_metadata
                        };
                        return acc;
                    }, {});
                }
            }

            const merged = (sessions || []).map((item) => ({
                ...item,
                username: profileMap[item.user_id]?.username || 'unknown',
                full_name: profileMap[item.user_id]?.full_name || '-',
                device_name: deviceMap[`${item.user_id}:${item.device_id}`]?.name || null,
                device_location: deviceMap[`${item.user_id}:${item.device_id}`]?.location || item.location_metadata || null,
                is_security_whitelisted: profileMap[item.user_id]?.is_security_whitelisted || false,
                role: profileMap[item.user_id]?.role || 'user',
            }));

            setRows(merged);
            setBanByUserId(banMap);
            setEventsByUserId(userEventMap);
        } catch (err) {
            addToast(`Gagal memuat sesi perangkat: ${err.message}`, 'error');
        } finally {
            setLoading(false);
        }
    }, [addToast]);

    useEffect(() => {
        fetchRows();
    }, [fetchRows]);

    const groupedUsers = useMemo(() => {
        const grouped = new Map();

        for (const row of rows) {
            if (!row?.user_id) continue;
            const current = grouped.get(row.user_id) || {
                user_id: row.user_id,
                username: row.username || 'unknown',
                full_name: row.full_name || '-',
                devices: new Map(), 
                activeCount: 0,
                revokedCount: 0,
                lastActivityAt: null,
                isBanned: banByUserId[row.user_id]?.is_banned === true,
                banReason: banByUserId[row.user_id]?.reason || null,
                isWhitelisted: row.is_security_whitelisted === true,
                role: row.role || 'user',
                events: eventsByUserId[row.user_id] || [],
            };

            const deviceId = row.device_id || 'unknown-device';
            const device = current.devices.get(deviceId) || {
                device_id: deviceId,
                device_name: row.device_name || 'Unknown Device',
                device_location: row.device_location || null,
                last_seen_at: null,
                sessions: []
            };

            device.sessions.push(row);
            
            const rowTs = new Date(row.last_activity_at || row.session_started_at || row.created_at || 0).getTime();
            const deviceTs = device.last_seen_at ? new Date(device.last_seen_at).getTime() : 0;
            if (rowTs > deviceTs) {
                device.last_seen_at = row.last_activity_at || row.session_started_at || row.created_at;
            }

            current.devices.set(deviceId, device);

            if (row.is_active) {
                current.activeCount += 1;
            } else {
                current.revokedCount += 1;
            }

            const candidateLast = row.last_activity_at || row.session_started_at || row.created_at || null;
            const prevTs = current.lastActivityAt ? new Date(current.lastActivityAt).getTime() : 0;
            const nextTs = candidateLast ? new Date(candidateLast).getTime() : 0;
            if (nextTs > prevTs) {
                current.lastActivityAt = candidateLast;
            }

            grouped.set(row.user_id, current);
        }

        return Array.from(grouped.values())
            .map((user) => ({
                ...user,
                events: [...(eventsByUserId[user.user_id] || user.events || [])]
                    .sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime()),
                devices: Array.from(user.devices.values()).sort((a, b) => {
                    const tsA = new Date(a.last_seen_at || 0).getTime();
                    const tsB = new Date(b.last_seen_at || 0).getTime();
                    return tsB - tsA;
                }).map(device => ({
                    ...device,
                    hasActiveSession: device.sessions.some(s => s.is_active),
                    sessions: [...device.sessions].sort((as, bs) => {
                        const tsAs = new Date(as.last_activity_at || as.session_started_at || 0).getTime();
                        const tsBs = new Date(bs.last_activity_at || bs.session_started_at || 0).getTime();
                        return tsBs - tsAs;
                    })
                })),
                activeDevicesCount: Array.from(user.devices.values()).filter(d => d.sessions.some(s => s.is_active)).length,
            }))
            .sort((a, b) => {
                const tsA = new Date(a.lastActivityAt || 0).getTime();
                const tsB = new Date(b.lastActivityAt || 0).getTime();
                return tsB - tsA;
            });
    }, [rows, banByUserId, eventsByUserId]);

    const stats = useMemo(() => {
        const totalUsers = groupedUsers.length;
        const totalActiveSessions = rows.filter(s => s.is_active).length;
        const totalBanned = groupedUsers.filter(u => u.isBanned).length;
        const totalWhitelisted = groupedUsers.filter(u => u.isWhitelisted).length;
        const totalActiveDevices = new Set(rows.filter(s => s.is_active).map(s => `${s.user_id}:${s.device_id}`)).size;

        return { totalUsers, totalActiveSessions, totalBanned, totalWhitelisted, totalActiveDevices };
    }, [groupedUsers, rows]);

    const filteredUsers = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return groupedUsers.filter((user) => {
            const matchFilter =
                statusFilter === 'all'
                || (statusFilter === 'active' && user.activeCount > 0)
                || (statusFilter === 'revoked' && user.activeCount === 0)
                || (statusFilter === 'whitelisted' && user.isWhitelisted)
                || (statusFilter === 'banned' && user.isBanned);

            if (!matchFilter) return false;
            if (!q) return true;

            const haystacks = [
                user.username,
                user.full_name,
                user.user_id,
                user.banReason,
                ...user.devices.flatMap(d => d.device_id),
                ...user.devices.flatMap(d => d.sessions.map(s => s.user_agent)),
            ]
                .filter(Boolean)
                .map((v) => String(v).toLowerCase());

            return haystacks.some((v) => v.includes(q));
        }).sort((a, b) => {
            const tsA = new Date(a.lastActivityAt || 0).getTime();
            const tsB = new Date(b.lastActivityAt || 0).getTime();
            return tsB - tsA;
        });
    }, [groupedUsers, searchTerm, statusFilter]);

    const getRiskSummary = (user) => {
        const events = user?.events || [];
        const unresolved = events.filter((event) => !event.resolved);
        const unresolvedCritical = unresolved.filter((event) => event.severity === 'critical').length;
        const unresolvedHigh = unresolved.filter((event) => event.severity === 'high').length;
        const unresolvedMedium = unresolved.filter((event) => event.severity === 'medium').length;
        const unresolvedLow = unresolved.filter((event) => event.severity === 'low').length;

        let score = 0;
        score += unresolvedCritical * 5;
        score += unresolvedHigh * 3;
        score += unresolvedMedium * 2;
        score += unresolvedLow;
        if (user?.isBanned) score += 5;
        if ((user?.activeCount || 0) > 1) score += 1;

        if (score >= 6) {
            return { label: 'high', color: 'text-red-500', bg: 'bg-red-500/10 border-red-500/20' };
        }
        if (score >= 3) {
            return { label: 'medium', color: 'text-amber-500', bg: 'bg-amber-500/10 border-amber-500/20' };
        }
        return { label: 'low', color: 'text-emerald-500', bg: 'bg-emerald-500/10 border-emerald-500/20' };
    };

    const toggleExpanded = (userId) => {
        setExpandedUserIds((prev) => {
            const next = new Set(prev);
            if (next.has(userId)) {
                next.delete(userId);
            } else {
                next.add(userId);
            }
            return next;
        });
    };

    const handleRevoke = (session) => {
        setRevokeModal({
            isOpen: true,
            type: 'session',
            targetId: session.id,
            targetName: `Session across ${session.user_agent.split(' ')[0]}`,
            extraId: session.user_id,
        });
    };

    const handleConfirmRevoke = async (customMsg) => {
        const { type, targetId, extraId } = revokeModal;
        
        if (type === 'session') {
            setBusySessionId(targetId);
            const { error } = await supabase
                .from('user_login_sessions')
                .update({
                    is_active: false,
                    revoked_at: new Date().toISOString(),
                    revoke_reason: 'admin_manual_revoke',
                    revoke_message_custom: customMsg || 'Sesi perangkat dicabut oleh admin.',
                    updated_at: new Date().toISOString(),
                })
                .eq('id', targetId);

            if (error) {
                addToast(`Gagal revoke sesi: ${error.message}`, 'error');
            } else {
                addToast('Sesi perangkat berhasil direvoke.', 'success');
                fetchRows();
            }
            setBusySessionId(null);
        } else if (type === 'device') {
            setBusyUserId(extraId); 
            const { error } = await supabase
                .from('user_login_sessions')
                .update({
                    is_active: false,
                    revoked_at: new Date().toISOString(),
                    revoke_reason: 'admin_manual_revoke',
                    revoke_message_custom: customMsg || 'Semua sesi pada perangkat ini dicabut oleh admin.',
                    updated_at: new Date().toISOString(),
                })
                .eq('user_id', extraId)
                .eq('device_id', targetId)
                .eq('is_active', true);

            if (error) {
                addToast(`Gagal revoke perangkat: ${error.message}`, 'error');
            } else {
                addToast('Semua sesi pada perangkat tersebut berhasil dicabut.', 'success');
                fetchRows();
            }
            setBusyUserId(null);
        } else {
            setBusyUserId(targetId);
            const { error } = await revokeAllSessionsForUser(targetId, 'admin_revoke_all_sessions', true, customMsg);
            if (error) {
                addToast(`Gagal revoke semua sesi: ${error.message}`, 'error');
            } else {
                addToast('Semua sesi aktif user berhasil direvoke.', 'success');
                fetchRows();
            }
            setBusyUserId(null);
        }
        setRevokeModal(prev => ({ ...prev, isOpen: false }));
    };

    const revokeAllSessionsForUser = async (userId, revokeReason, shouldWriteEvent, customMsg) => {
        const nowIso = new Date().toISOString();
        const { error } = await supabase
            .from('user_login_sessions')
            .update({
                is_active: false,
                revoked_at: nowIso,
                revoke_reason: revokeReason,
                revoke_message_custom: customMsg || 'Semua sesi perangkat dicabut oleh admin.',
                updated_at: nowIso,
            })
            .eq('user_id', userId)
            .eq('is_active', true);

        if (error) return { error };

        if (shouldWriteEvent) {
            await supabase
                .from('security_events')
                .insert({
                    user_id: userId,
                    event_type: revokeReason,
                    severity: 'high',
                    metadata: { source: 'admin_user_devices', reason: customMsg },
                });
        }
        return { error: null };
    };

    const handleRevokeAll = (userId, username) => {
        setRevokeModal({
            isOpen: true,
            type: 'user',
            targetId: userId,
            targetName: `User: @${username}`,
            extraId: null
        });
    };

    const handleRevokeDevice = (userId, deviceId, deviceName) => {
        setRevokeModal({
            isOpen: true,
            type: 'device',
            targetId: deviceId,
            targetName: `Device: ${deviceName || deviceId}`,
            extraId: userId,
        });
    };

    const handleDeleteDeviceHistory = (userId, deviceId, deviceName) => {
        setCleanupModal({
            isOpen: true,
            userId,
            deviceId,
            deviceName: deviceName || deviceId,
        });
    };

    const handleConfirmDeleteDevice = async () => {
        const { userId, deviceId, deviceName } = cleanupModal;
        setBusyUserId(userId);
        try {
            // 1. Delete associated sessions
            const { error: sessErr } = await supabase
                .from('user_login_sessions')
                .delete()
                .eq('user_id', userId)
                .eq('device_id', deviceId);
            
            if (sessErr) throw sessErr;

            // 2. Delete device registry
            const { error: devErr } = await supabase
                .from('user_devices')
                .delete()
                .eq('user_id', userId)
                .eq('device_id', deviceId);
            
            if (devErr) throw devErr;

            addToast(`Riwayat perangkat "${deviceName}" telah dibersihkan secara permanen.`, 'success');
            fetchRows();
        } catch (err) {
            addToast(`Gagal menghapus riwayat: ${err.message}`, 'error');
        } finally {
            setBusyUserId(null);
            setCleanupModal(prev => ({ ...prev, isOpen: false }));
        }
    };

    const handleToggleWhitelist = async (userId, newStatus) => {
        setBusyStatus(prev => ({ ...prev, [userId]: true }));
        const { error } = await supabase
            .from('profiles')
            .update({ is_security_whitelisted: newStatus })
            .eq('user_id', userId);

        if (error) {
            addToast(`Gagal update whitelist: ${error.message}`, 'error');
        } else {
            addToast(newStatus ? 'User berhasil dimasukkan ke whitelist.' : 'User dihapus dari whitelist.', 'success');
            fetchRows();
        }
        setBusyStatus(prev => ({ ...prev, [userId]: false }));
    };

    const handleToggleBan = (userId, username, currentStatus) => {
        setBanModal({
            isOpen: true,
            userId,
            username,
            currentStatus
        });
    };

    const handleConfirmBan = async (isBanned, reason) => {
        const { userId, username } = banModal;
        setBusyStatus(prev => ({ ...prev, [userId]: true }));
        try {
            const nowIso = new Date().toISOString();
            const { data: authData } = await supabase.auth.getUser();
            const actorUserId = authData?.user?.id || null;
            
            if (isBanned) {
                const { error: banErr } = await supabase
                    .from('user_ban_policies')
                    .upsert({
                        user_id: userId,
                        is_banned: true,
                        reason: reason,
                        banned_by: actorUserId,
                        banned_at: nowIso,
                        updated_at: nowIso
                    }, { onConflict: 'user_id' });
                if (banErr) throw banErr;

                await revokeAllSessionsForUser(userId, 'admin_ban_enforced', true, reason);
                
                await supabase
                    .from('security_events')
                    .insert({
                        user_id: userId,
                        event_type: 'admin_manual_ban',
                        severity: 'critical',
                        metadata: { source: 'admin_user_devices', reason: reason, actor_user_id: actorUserId },
                    });

                addToast(`User @${username} telah dibanned.`, 'success');
            } else {
                const { error: unbanErr } = await supabase
                    .from('user_ban_policies')
                    .update({
                        is_banned: false,
                        reason: null,
                        unbanned_by: actorUserId,
                        unbanned_at: nowIso,
                        updated_at: nowIso
                    })
                    .eq('user_id', userId);
                if (unbanErr) throw unbanErr;

                await supabase
                    .from('security_events')
                    .insert({
                        user_id: userId,
                        event_type: 'admin_manual_unban',
                        severity: 'medium',
                        metadata: { source: 'admin_user_devices', reason: null, actor_user_id: actorUserId },
                    });
                addToast(`Status ban untuk @${username} telah dicabut.`, 'success');
            }
            fetchRows();
        } catch (err) {
            addToast(`Gagal mengubah status ban: ${err.message}`, 'error');
        } finally {
            setBusyStatus(prev => ({ ...prev, [userId]: false }));
            setBanModal(prev => ({ ...prev, isOpen: false }));
        }
    };

    const formatDateTime = (value) => {
        if (!value) return '-';
        return new Date(value).toLocaleString('id-ID');
    };

    return (
        <div className="w-full max-w-295 mx-auto px-4 md:px-6 lg:px-8 py-4 md:py-6 lg:py-8 space-y-6 md:space-y-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Perangkat Pengguna</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Pantau sesi aktif, deteksi device mencurigakan, dan lakukan revoke manual.</p>
            </div>

            <div className="grid grid-cols-2 md:grid-cols-4 gap-4 md:gap-6">
                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="size-10 rounded-xl bg-blue-50 dark:bg-blue-500/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-blue-500">group</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Total User</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalUsers}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="size-10 rounded-xl bg-emerald-50 dark:bg-emerald-500/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-emerald-500">devices</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Device Aktif</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalActiveDevices}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="size-10 rounded-xl bg-amber-50 dark:bg-amber-500/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-amber-500">verified_user</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Whitelist</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalWhitelisted}</div>
                </div>

                <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm transition-all hover:shadow-md">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="size-10 rounded-xl bg-rose-50 dark:bg-rose-500/10 flex items-center justify-center">
                            <span className="material-symbols-outlined text-rose-500">gpp_bad</span>
                        </div>
                        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Banned</span>
                    </div>
                    <div className="text-2xl font-black text-slate-900 dark:text-white">{stats.totalBanned}</div>
                </div>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-4 md:p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/20 flex flex-col lg:flex-row lg:items-center gap-4">
                    <div className="relative flex-1 max-w-xl">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-[20px]">search</span>
                        <input
                            type="text"
                            placeholder="Cari username, user id, device id, atau user agent..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm transition-all outline-none"
                        />
                    </div>

                    <div className="flex flex-wrap items-center gap-3">
                        <select
                            value={statusFilter}
                            onChange={(e) => setStatusFilter(e.target.value)}
                            className="h-10 px-3 pr-8 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-xs font-bold text-slate-600 dark:text-slate-300 outline-none"
                        >
                            <option value="all">Semua Status</option>
                            <option value="active">Aktif Online</option>
                            <option value="revoked">Offline/Revoked</option>
                            <option value="whitelisted">Whitelisted</option>
                            <option value="banned">Banned</option>
                        </select>

                        <button
                            onClick={fetchRows}
                            className="flex items-center gap-2 h-10 px-4 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs font-black uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:bg-slate-50 transition-all"
                        >
                            <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
                            Refresh
                        </button>
                    </div>
                </div>

                <div className="p-4 md:p-6">
                    {loading && filteredUsers.length === 0 ? (
                        <div className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3">
                                <div className="size-12 rounded-2xl bg-primary/5 flex items-center justify-center">
                                    <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                                </div>
                                <p className="text-slate-400 font-bold text-xs uppercase tracking-widest">Memuat data...</p>
                            </div>
                        </div>
                    ) : filteredUsers.length === 0 ? (
                        <div className="py-20 text-center">
                            <div className="flex flex-col items-center gap-3 opacity-20">
                                <span className="material-symbols-outlined text-6xl">devices_off</span>
                                <p className="text-sm font-black uppercase tracking-widest">Data tidak ditemukan</p>
                            </div>
                        </div>
                    ) : (
                        <div className="grid grid-cols-1 gap-4">
                            {filteredUsers.map((user) => {
                                const isExpanded = expandedUserIds.has(user.user_id);
                                const risk = getRiskSummary(user);
                                return (
                                    <div 
                                        key={user.user_id} 
                                        className={`group rounded-2xl border transition-all duration-300 ${isExpanded ? 'bg-slate-50/50 dark:bg-slate-800/40 border-primary/30 shadow-lg' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 hover:border-slate-300'}`}
                                    >
                                        <div className="p-4 md:p-5 flex flex-col md:flex-row md:items-center justify-between gap-4">
                                            <div className="flex items-start gap-4 flex-1 min-w-0">
                                                <div className="size-12 rounded-2xl bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 group-hover:bg-primary/10 transition-colors">
                                                    <span className="material-symbols-outlined text-slate-400 group-hover:text-primary transition-colors text-2xl">account_circle</span>
                                                </div>
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-2 flex-wrap mb-1">
                                                        <h3 className="text-base font-black text-slate-900 dark:text-white truncate">@{user.username}</h3>
                                                        {user.isWhitelisted && <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-amber-500/10 text-amber-600 border border-amber-500/20">Whitelist</span>}
                                                        {user.isBanned && <span className="px-2 py-0.5 rounded-md text-[9px] font-black uppercase tracking-wider bg-rose-500/10 text-rose-600 border border-rose-500/20">Banned</span>}
                                                    </div>
                                                    <p className="text-sm font-bold text-slate-500 dark:text-slate-400 truncate">{user.full_name}</p>
                                                    <div className="flex items-center gap-3 mt-1.5 flex-wrap">
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                            <span className="material-symbols-outlined text-[14px]">id_card</span>
                                                            {user.user_id.split('-')[0]}...
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                            <span className="material-symbols-outlined text-[14px] text-emerald-500">devices</span>
                                                            {user.activeDevicesCount} Perangkat Aktif
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400 border-l border-slate-200 dark:border-slate-700 pl-3">
                                                            <span className="material-symbols-outlined text-[14px] text-blue-400">sensors</span>
                                                            {user.activeCount} Sesi
                                                        </div>
                                                        <div className="flex items-center gap-1.5 text-[10px] font-bold text-slate-400">
                                                            <span className="material-symbols-outlined text-[14px]">history</span>
                                                            {formatDateTime(user.lastActivityAt)}
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>

                                            <div className="flex items-center gap-3 self-end md:self-center">
                                                <div className={`px-3 py-1.5 rounded-xl border text-[9px] font-black uppercase tracking-widest ${risk.bg} ${risk.color}`}>
                                                    RISK: {risk.label}
                                                </div>
                                                <button
                                                    onClick={() => toggleExpanded(user.user_id)}
                                                    className={`size-10 rounded-xl flex items-center justify-center transition-all ${isExpanded ? 'bg-primary text-white rotate-180 shadow-lg shadow-primary/20' : 'bg-slate-100 dark:bg-slate-800 text-slate-400 hover:bg-slate-200'}`}
                                                >
                                                    <span className="material-symbols-outlined">expand_more</span>
                                                </button>
                                            </div>
                                        </div>

                                        {isExpanded && (
                                            <div className="px-5 pb-6 pt-2 border-t border-slate-100 dark:border-slate-800 animate-[fadeIn_0.2s_ease-out]">
                                                <div className="grid grid-cols-1 lg:grid-cols-[1fr_320px] gap-8 mt-6">
                                                    <div className="space-y-4">
                                                        <div className="flex items-center justify-between mb-2">
                                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Daftar Sesi Perangkat</h4>
                                                            <button 
                                                                onClick={() => handleRevokeAll(user.user_id, user.username)}
                                                                disabled={busyUserId === user.user_id}
                                                                className="text-[10px] font-black uppercase tracking-widest text-rose-500 hover:text-rose-600 transition-colors flex items-center gap-1"
                                                            >
                                                                <span className="material-symbols-outlined text-sm">layers_clear</span>
                                                                Revoke Semua Sesi
                                                            </button>
                                                        </div>
                                                        
                                                        <div className="space-y-6">
                                                            {user.devices.map((device) => (
                                                                <div key={device.device_id} className="bg-slate-50/50 dark:bg-slate-800/20 rounded-2xl border border-slate-100 dark:border-slate-800 overflow-hidden shadow-sm">
                                                                    <div className="px-4 py-3 bg-white dark:bg-slate-900/40 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between gap-4">
                                                                        <div className="flex items-center gap-3 min-w-0">
                                                                            <div className="size-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center shrink-0 text-slate-500">
                                                                                <span className="material-symbols-outlined">{getDeviceTypeIcon(device.sessions[0]?.user_agent)}</span>
                                                                            </div>
                                                                            <div className="min-w-0">
                                                                                <div className="flex items-center gap-2">
                                                                                    <h5 className="text-[11px] font-black text-slate-700 dark:text-slate-200 truncate uppercase tracking-tight">{device.device_name}</h5>
                                                                                    {device.device_location && (
                                                                                        <span className="px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-[8px] font-medium text-slate-400">
                                                                                            {device.device_location.city}, {device.device_location.country}
                                                                                        </span>
                                                                                    )}
                                                                                </div>
                                                                                <p className="text-[9px] font-mono text-slate-400 truncate">ID: {device.device_id}</p>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex items-center gap-2">
                                                                            <button 
                                                                                onClick={() => handleRevokeDevice(user.user_id, device.device_id, device.device_name)}
                                                                                disabled={busyUserId === user.user_id || !device.hasActiveSession}
                                                                                className={`px-3 py-1.5 rounded-lg border text-[9px] font-black uppercase tracking-wider transition-all flex items-center gap-1.5 ${device.hasActiveSession ? 'border-rose-500/20 text-rose-500 hover:bg-rose-500 hover:text-white' : 'border-slate-200 text-slate-300 cursor-not-allowed'}`}
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">phonelink_erase</span>
                                                                                Revoke
                                                                            </button>
                                                                            <button 
                                                                                onClick={() => handleDeleteDeviceHistory(user.user_id, device.device_id, device.device_name)}
                                                                                disabled={busyUserId === user.user_id || device.hasActiveSession}
                                                                                className={`p-1.5 rounded-lg border transition-all flex items-center justify-center ${!device.hasActiveSession ? 'border-slate-200 text-slate-400 hover:bg-slate-100 hover:text-rose-600 hover:border-rose-200' : 'border-slate-100 text-slate-200 cursor-not-allowed'}`}
                                                                                title="Hapus Riwayat Perangkat"
                                                                            >
                                                                                <span className="material-symbols-outlined text-sm">delete_sweep</span>
                                                                            </button>
                                                                        </div>
                                                                    </div>
                                                                    <div className="p-3 space-y-2">
                                                                        {device.sessions.map((session) => (
                                                                            <div key={session.id} className="bg-white dark:bg-slate-900/60 p-3 rounded-xl border border-slate-100 dark:border-slate-700/50 flex items-center justify-between gap-4 group/session">
                                                                                <div className="flex items-center gap-3 min-w-0">
                                                                                    <div className={`size-2 rounded-full shrink-0 ${session.is_active ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`}></div>
                                                                                    <div className="min-w-0">
                                                                                        <div className="flex items-center gap-2">
                                                                                            <p className="text-[11px] font-bold text-slate-600 dark:text-slate-300 truncate">
                                                                                                {session.user_agent.split(' ')[0]} / {session.user_agent.includes('Chrome') ? 'Chrome' : session.user_agent.includes('Firefox') ? 'Firefox' : session.user_agent.includes('Safari') ? 'Safari' : 'Browser'}
                                                                                            </p>
                                                                                            {session.location_metadata && (
                                                                                                <span className="text-[8px] text-slate-300 font-medium">({session.location_metadata.city})</span>
                                                                                            )}
                                                                                        </div>
                                                                                        <p className="text-[9px] text-slate-400 line-clamp-1">{session.user_agent}</p>
                                                                                    </div>
                                                                                </div>
                                                                                <div className="flex items-center gap-2 shrink-0">
                                                                                    <span className="text-[9px] font-bold text-slate-400 mr-1">{formatDateTime(session.last_activity_at)}</span>
                                                                                    {session.is_active && (
                                                                                        <button
                                                                                            onClick={() => handleRevoke(session)}
                                                                                            disabled={busySessionId === session.id}
                                                                                            className="size-8 rounded-lg border border-slate-100 dark:border-slate-800 text-slate-400 hover:text-rose-500 hover:border-rose-500/30 transition-all flex items-center justify-center active:scale-90"
                                                                                        >
                                                                                            <span className="material-symbols-outlined text-base">logout</span>
                                                                                        </button>
                                                                                    )}
                                                                                </div>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                </div>
                                                            ))}
                                                        </div>
                                                    </div>

                                                    <div className="space-y-6">
                                                        <div className="bg-slate-50 dark:bg-slate-800/20 p-5 rounded-2xl border border-slate-100 dark:border-slate-800">
                                                            <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-5">Security Management</h4>
                                                            <div className="space-y-3">
                                                                <button
                                                                    onClick={() => handleToggleWhitelist(user.user_id, !user.isWhitelisted)}
                                                                    disabled={busyStatus[user.user_id]}
                                                                    className={`w-full p-3.5 rounded-xl flex items-center justify-between transition-all group/opt ${user.isWhitelisted ? 'bg-amber-500/10 border-amber-500/20 text-amber-600' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 hover:border-amber-500/30'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">
                                                                        <span className="material-symbols-outlined">verified_user</span>
                                                                        Security Whitelist
                                                                    </div>
                                                                    <div className={`size-5 rounded-full border-2 flex items-center justify-center ${user.isWhitelisted ? 'bg-amber-500 border-amber-500' : 'border-slate-200'}`}>
                                                                        {user.isWhitelisted && <span className="material-symbols-outlined text-white text-[12px] font-bold">check</span>}
                                                                    </div>
                                                                </button>

                                                                <button
                                                                    onClick={() => handleToggleBan(user.user_id, user.username, user.isBanned)}
                                                                    disabled={busyStatus[user.user_id]}
                                                                    className={`w-full p-3.5 rounded-xl flex items-center justify-between transition-all group/opt ${user.isBanned ? 'bg-rose-500/10 border-rose-500/20 text-rose-600' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-600 hover:border-rose-500/30'}`}
                                                                >
                                                                    <div className="flex items-center gap-3 text-[11px] font-black uppercase tracking-widest">
                                                                        <span className="material-symbols-outlined">gpp_bad</span>
                                                                        Banned User
                                                                    </div>
                                                                    <div className={`size-5 rounded-full border-2 flex items-center justify-center ${user.isBanned ? 'bg-rose-500 border-rose-500' : 'border-slate-200'}`}>
                                                                        {user.isBanned && <span className="material-symbols-outlined text-white text-[12px] font-bold">block</span>}
                                                                    </div>
                                                                </button>
                                                            </div>
                                                            {user.isBanned && user.banReason && (
                                                                <div className="mt-4 p-3 bg-rose-500/5 border border-rose-500/10 rounded-xl">
                                                                    <p className="text-[9px] font-black uppercase tracking-widest text-rose-500 mb-1">Alasan Ban:</p>
                                                                    <p className="text-[11px] text-rose-600/80 dark:text-rose-400/80 italic">"{user.banReason}"</p>
                                                                </div>
                                                            )}
                                                        </div>

                                                        <div className="space-y-4">
                                                            <div className="flex items-center justify-between">
                                                                <h4 className="text-[10px] font-black uppercase tracking-widest text-slate-400">Security Events</h4>
                                                                <span className="text-[9px] font-bold text-slate-400">{user.events.length} Total</span>
                                                            </div>
                                                            <div className="space-y-2">
                                                                {user.events.length > 0 ? user.events.slice(0, 3).map((event) => (
                                                                    <div key={event.id} className="p-3 rounded-xl border border-slate-50 dark:border-slate-800/50 bg-slate-50/50 dark:bg-slate-800/20 flex items-start gap-3">
                                                                        <div className={`size-2 rounded-full mt-1.5 shrink-0 ${event.severity === 'critical' ? 'bg-rose-500' : event.severity === 'high' ? 'bg-orange-500' : 'bg-blue-500'}`}></div>
                                                                        <div className="min-w-0">
                                                                            <p className="text-[10px] font-black uppercase tracking-tight text-slate-700 dark:text-slate-300 truncate">{event.event_type.replace(/_/g, ' ')}</p>
                                                                            <p className="text-[9px] text-slate-400 mt-0.5">{formatDateTime(event.created_at)}</p>
                                                                        </div>
                                                                    </div>
                                                                )) : (
                                                                    <p className="text-[10px] text-slate-400 text-center py-4 bg-slate-50 dark:bg-slate-800/10 rounded-xl italic">No recent events</p>
                                                                )}
                                                            </div>
                                                        </div>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                );
                            })}
                        </div>
                    )}
                </div>
            </div>
            
            <RevocationModal
                isOpen={revokeModal.isOpen}
                onClose={() => setRevokeModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmRevoke}
                type={revokeModal.type}
                targetId={revokeModal.targetId}
                targetName={revokeModal.targetName}
            />

            <BanModal
                isOpen={banModal.isOpen}
                onClose={() => setBanModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmBan}
                targetName={banModal.username}
                currentStatus={banModal.currentStatus}
                loading={busyStatus[banModal.userId]}
            />

            <CleanupModal
                isOpen={cleanupModal.isOpen}
                onClose={() => setCleanupModal(prev => ({ ...prev, isOpen: false }))}
                onConfirm={handleConfirmDeleteDevice}
                targetName={cleanupModal.deviceName}
                loading={busyUserId === cleanupModal.userId}
            />
        </div>
    );
}
