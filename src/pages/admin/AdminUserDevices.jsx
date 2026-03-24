import { useCallback, useEffect, useMemo, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { getDeviceTypeIcon } from '../../utils/deviceDetection';

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

    const fetchRows = useCallback(async () => {
        setLoading(true);
        try {
            const { data: sessions, error: sessionsError } = await supabase
                .from('user_login_sessions')
                .select('id, user_id, device_id, session_id, user_agent, is_active, session_started_at, last_activity_at, revoked_at, revoke_reason')
                .order('last_activity_at', { ascending: false })
                .limit(500);

            if (sessionsError) throw sessionsError;

            const userIds = [...new Set((sessions || []).map((s) => s.user_id).filter(Boolean))];
            let profileMap = {};
            let banMap = {};
            let userEventMap = {};
            let deviceMap = {}; // Maps user_id:device_id -> device_name

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
                    .select('user_id, device_id, device_name')
                    .in('user_id', userIds);

                if (!deviceError && deviceMetadata) {
                    deviceMap = deviceMetadata.reduce((acc, d) => {
                        acc[`${d.user_id}:${d.device_id}`] = d.device_name;
                        return acc;
                    }, {});
                }
            }

            const merged = (sessions || []).map((item) => ({
                ...item,
                username: profileMap[item.user_id]?.username || 'unknown',
                full_name: profileMap[item.user_id]?.full_name || '-',
                device_name: deviceMap[`${item.user_id}:${item.device_id}`] || null,
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
                sessions: [],
                activeCount: 0,
                revokedCount: 0,
                lastActivityAt: null,
                isBanned: banByUserId[row.user_id]?.is_banned === true,
                banReason: banByUserId[row.user_id]?.reason || null,
                isWhitelisted: profileMap[row.user_id]?.is_security_whitelisted === true,
                role: profileMap[row.user_id]?.role || 'user',
                events: eventsByUserId[row.user_id] || [],
            };

            current.sessions.push(row);
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
                sessions: [...user.sessions].sort((a, b) => {
                    const tsA = new Date(a.last_activity_at || a.session_started_at || a.created_at || 0).getTime();
                    const tsB = new Date(b.last_activity_at || b.session_started_at || b.created_at || 0).getTime();
                    return tsB - tsA;
                }),
            }))
            .sort((a, b) => {
                const tsA = new Date(a.lastActivityAt || 0).getTime();
                const tsB = new Date(b.lastActivityAt || 0).getTime();
                return tsB - tsA;
            });
    }, [rows, banByUserId, eventsByUserId]);

    const filteredUsers = useMemo(() => {
        const q = searchTerm.trim().toLowerCase();
        return groupedUsers.filter((user) => {
            const matchFilter =
                statusFilter === 'all'
                || (statusFilter === 'active' && user.activeCount > 0)
                || (statusFilter === 'revoked' && user.activeCount === 0)
                || (statusFilter === 'banned' && user.isBanned);

            if (!matchFilter) return false;
            if (!q) return true;

            const haystacks = [
                user.username,
                user.full_name,
                user.user_id,
                user.banReason,
                ...user.sessions.map((session) => session.device_id),
                ...user.sessions.map((session) => session.revoke_reason),
                ...user.sessions.map((session) => session.user_agent),
                ...user.events.map((event) => event.event_type),
                ...user.events.map((event) => event.severity),
            ]
                .filter(Boolean)
                .map((v) => String(v).toLowerCase());

            return haystacks.some((v) => v.includes(q));
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

    const handleRevoke = async (session) => {
        const customMsg = window.prompt('Pesan untuk user (opsional):', 'Sesi perangkat dicabut oleh admin.');
        if (customMsg === null) return;

        setBusySessionId(session.id);
        const { error } = await supabase
            .from('user_login_sessions')
            .update({
                is_active: false,
                revoked_at: new Date().toISOString(),
                revoke_reason: 'admin_manual_revoke',
                revoke_message_custom: customMsg || 'Sesi perangkat dicabut oleh admin.',
                updated_at: new Date().toISOString(),
            })
            .eq('id', session.id);

        if (error) {
            addToast(`Gagal revoke sesi: ${error.message}`, 'error');
            setBusySessionId(null);
            return;
        }

        await supabase
            .from('security_events')
            .insert({
                user_id: session.user_id,
                device_id: session.device_id,
                event_type: 'admin_manual_revoke_session',
                severity: 'medium',
                metadata: { source: 'admin_user_devices', reason: customMsg },
            });

        addToast('Sesi perangkat berhasil direvoke.', 'success');
        setBusySessionId(null);
        fetchRows();
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

        if (error) {
            return { error };
        }

        await supabase
            .from('user_devices')
            .update({
                revoked_at: nowIso,
                revoked_reason: revokeReason,
                updated_at: nowIso,
            })
            .eq('user_id', userId)
            .is('revoked_at', null);

        if (shouldWriteEvent) {
            await supabase
                .from('security_events')
                .insert({
                    user_id: userId,
                    event_type: 'admin_revoke_all_sessions',
                    severity: 'high',
                    metadata: { source: 'admin_user_devices', reason: customMsg },
                });
        }

        return { error: null };
    };

    const handleRevokeAll = async (userId) => {
        const customMsg = window.prompt('Pesan untuk user (opsional):', 'Semua sesi perangkat dicabut oleh admin.');
        if (customMsg === null) return;

        setBusyUserId(userId);
        const { error } = await revokeAllSessionsForUser(userId, 'admin_revoke_all_sessions', true, customMsg);
        if (error) {
            addToast(`Gagal revoke semua sesi: ${error.message}`, 'error');
            setBusyUserId(null);
            return;
        }

        addToast('Semua sesi aktif user berhasil direvoke.', 'success');
        setBusyUserId(null);
        fetchRows();
    };

    const handleToggleWhitelist = async (userId, newStatus) => {
        setBusyUserId(userId);
        const { error } = await supabase
            .from('profiles')
            .update({ is_security_whitelisted: newStatus })
            .eq('user_id', userId);

        if (error) {
            addToast(`Gagal update whitelist: ${error.message}`, 'error');
            setBusyUserId(null);
            return;
        }

        addToast(newStatus ? 'User berhasil dimasukkan ke whitelist.' : 'User dihapus dari whitelist.', 'success');
        setBusyUserId(null);
        fetchRows();
    };

    const handleSetBan = async (userId, shouldBan) => {
        setBusyUserId(userId);
        const nowIso = new Date().toISOString();
        let reason = null;
        if (shouldBan) {
            reason = window.prompt('Alasan ban user (wajib):', 'Aktivitas login mencurigakan') || '';
            if (!reason.trim()) {
                addToast('Ban dibatalkan karena alasan wajib diisi.', 'info');
                setBusyUserId(null);
                return;
            }
        }

        const { data: authData } = await supabase.auth.getUser();
        const actorUserId = authData?.user?.id || null;

        const payload = shouldBan
            ? {
                user_id: userId,
                is_banned: true,
                reason,
                banned_by: actorUserId,
                banned_at: nowIso,
                unbanned_at: null,
                unbanned_by: null,
                updated_at: nowIso,
            }
            : {
                user_id: userId,
                is_banned: false,
                reason: null,
                unbanned_by: actorUserId,
                unbanned_at: nowIso,
                updated_at: nowIso,
            };

        const { error } = await supabase
            .from('user_ban_policies')
            .upsert(payload, { onConflict: 'user_id' });

        if (error) {
            addToast(`Gagal ${shouldBan ? 'ban' : 'unban'} user: ${error.message}`, 'error');
            setBusyUserId(null);
            return;
        }

        await supabase
            .from('security_events')
            .insert({
                user_id: userId,
                event_type: shouldBan ? 'admin_manual_ban' : 'admin_manual_unban',
                severity: shouldBan ? 'critical' : 'medium',
                metadata: {
                    source: 'admin_user_devices',
                    reason: shouldBan ? reason : null,
                    actor_user_id: actorUserId,
                },
            });

        if (shouldBan) {
            await revokeAllSessionsForUser(userId, 'admin_ban_enforced', false);
            addToast('User berhasil diban dan semua sesi aktif telah diputus.', 'success');
            setBusyUserId(null);
            fetchRows();
            return;
        }

        addToast('User berhasil di-unban.', 'success');
        setBusyUserId(null);
        fetchRows();
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

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col lg:flex-row lg:items-center gap-3">
                    <div className="relative flex-1 max-w-xl">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-[20px]">search</span>
                        <input
                            type="text"
                            placeholder="Cari username, user id, device id, atau user agent..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm transition-all"
                        />
                    </div>

                    <select
                        value={statusFilter}
                        onChange={(e) => setStatusFilter(e.target.value)}
                        className="px-3 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm"
                    >
                        <option value="all">Semua Status</option>
                        <option value="active">Aktif</option>
                        <option value="revoked">Revoked</option>
                        <option value="banned">Banned</option>
                    </select>

                    <button
                        onClick={fetchRows}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                    >
                        <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        Refresh
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Ringkasan Device</th>
                                <th className="px-6 py-4">Aktivitas Terakhir</th>
                                    <th className="px-6 py-4">Risk</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading && rows.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
                                            <p className="text-slate-500 text-sm">Memuat data perangkat...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredUsers.length === 0 ? (
                                <tr>
                                    <td colSpan="6" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-40">
                                            <span className="material-symbols-outlined text-5xl">devices</span>
                                            <p className="text-sm font-bold">Belum ada data sesi perangkat</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredUsers.map((user) => {
                                    const isExpanded = expandedUserIds.has(user.user_id);
                                    const risk = getRiskSummary(user);
                                    return [
                                        <tr key={`row_${user.user_id}`} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors">
                                                <td className="px-6 py-4 align-top">
                                                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{user.username}</p>
                                                    <p className="text-[11px] text-slate-400">{user.full_name}</p>
                                                    <p className="text-[10px] font-mono text-slate-400 mt-1">{user.user_id}</p>
                                                    {user.isBanned && (
                                                        <span className="inline-flex items-center gap-1 mt-2 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider bg-red-500/10 text-red-500 border border-red-500/20">
                                                            <span className="size-1.5 rounded-full bg-red-500"></span>
                                                            BANNED
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="px-6 py-4 align-top">
                                                    <p className="text-sm font-semibold text-slate-700 dark:text-slate-200">
                                                        {user.sessions.length} device tercatat
                                                    </p>
                                                    <p className="text-[11px] text-slate-500">{user.activeCount} aktif • {user.revokedCount} revoked</p>
                                                </td>

                                                <td className="px-6 py-4 align-top">
                                                    <p className="text-sm text-slate-700 dark:text-slate-200">{formatDateTime(user.lastActivityAt)}</p>
                                                </td>

                                                <td className="px-6 py-4 align-top">
                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${risk.color} ${risk.bg}`}>
                                                        <span className="size-1.5 rounded-full bg-current"></span>
                                                        {risk.label}
                                                    </span>
                                                </td>

                                                <td className="px-6 py-4 align-top">
                                                    {user.isBanned ? (
                                                        <span className="inline-flex items-center gap-1 text-red-500 font-bold text-xs">
                                                            <span className="size-1.5 rounded-full bg-red-500"></span>
                                                            BANNED
                                                        </span>
                                                    ) : user.activeCount > 0 ? (
                                                        <span className="inline-flex items-center gap-1 text-green-500 font-bold text-xs">
                                                            <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                            ACTIVE
                                                        </span>
                                                    ) : (
                                                        <span className="inline-flex items-center gap-1 text-slate-500 font-bold text-xs">
                                                            <span className="size-1.5 rounded-full bg-slate-400"></span>
                                                            REVOKED
                                                        </span>
                                                    )}
                                                </td>

                                                <td className="px-6 py-4 align-top text-right">
                                                    <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                                                        <button
                                                            onClick={() => toggleExpanded(user.user_id)}
                                                            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 text-[10px] font-black uppercase tracking-wider rounded-lg hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">{isExpanded ? 'expand_less' : 'expand_more'}</span>
                                                            {isExpanded ? 'Tutup' : 'Detail'}
                                                        </button>

                                                        <button
                                                            onClick={() => handleRevokeAll(user.user_id)}
                                                            disabled={busyUserId === user.user_id}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                busyUserId === user.user_id
                                                                    ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                            }`}
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">devices_off</span>
                                                            Revoke All
                                                        </button>

                                                        <button
                                                            onClick={() => handleToggleWhitelist(user.user_id, !user.isWhitelisted)}
                                                            disabled={busyUserId === user.user_id}
                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                user.isWhitelisted
                                                                    ? 'bg-amber-100 dark:bg-amber-500/20 text-amber-700 dark:text-amber-400 hover:bg-amber-200'
                                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                            } ${busyUserId === user.user_id ? 'opacity-50 cursor-not-allowed' : ''}`}
                                                            title={user.isWhitelisted ? 'Hapus dari Whitelist Security' : 'Tambah ke Whitelist Security (Bypass Limit)'}
                                                        >
                                                            <span className="material-symbols-outlined text-[14px]">
                                                                {user.isWhitelisted ? 'verified_user' : 'shield_person'}
                                                            </span>
                                                            {user.isWhitelisted ? 'Whitelisted' : 'Whitelist'}
                                                        </button>

                                                        {user.isBanned ? (
                                                            <button
                                                                onClick={() => handleSetBan(user.user_id, false)}
                                                                disabled={busyUserId === user.user_id}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                    busyUserId === user.user_id
                                                                        ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                        : 'bg-emerald-500 text-white hover:bg-emerald-600'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">lock_open</span>
                                                                Unban
                                                            </button>
                                                        ) : (
                                                            <button
                                                                onClick={() => handleSetBan(user.user_id, true)}
                                                                disabled={busyUserId === user.user_id}
                                                                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                    busyUserId === user.user_id
                                                                        ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                        : 'bg-red-500 text-white hover:bg-red-600'
                                                                }`}
                                                            >
                                                                <span className="material-symbols-outlined text-[14px]">gpp_bad</span>
                                                                Ban
                                                            </button>
                                                        )}
                                                    </div>
                                                </td>
                                        </tr>,

                                        isExpanded ? (
                                            <tr key={`expanded_${user.user_id}`} className="bg-slate-50/40 dark:bg-slate-900/40">
                                                    <td colSpan="6" className="px-6 pb-5 pt-1">
                                                        <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 overflow-hidden">
                                                            <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 flex items-center justify-between">
                                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500">Riwayat Device & Sesi</p>
                                                                {user.isBanned && (
                                                                    <p className="text-[10px] font-bold text-red-500">Alasan: {user.banReason || 'Tidak ada alasan'}</p>
                                                                )}
                                                            </div>

                                                            <div className="sticky top-0 z-10 px-4 py-3 border-b border-slate-100 dark:border-slate-800 bg-white/95 dark:bg-slate-900/95 backdrop-blur-sm flex flex-wrap items-center justify-between gap-2">
                                                                <div className="flex items-center gap-2">
                                                                    <span className="text-[10px] font-black uppercase tracking-wider text-slate-500">Action Bar</span>
                                                                    <span className={`inline-flex items-center gap-1 px-2 py-1 rounded-md text-[10px] font-black uppercase tracking-wider border ${risk.color} ${risk.bg}`}>
                                                                        <span className="size-1.5 rounded-full bg-current"></span>
                                                                        Risk {risk.label}
                                                                    </span>
                                                                </div>

                                                                <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                                                                    <button
                                                                        onClick={() => handleRevokeAll(user.user_id)}
                                                                        disabled={busyUserId === user.user_id}
                                                                        className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                            busyUserId === user.user_id
                                                                                ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                                        }`}
                                                                    >
                                                                        <span className="material-symbols-outlined text-[14px]">devices_off</span>
                                                                        Revoke All
                                                                    </button>

                                                                    {user.isBanned ? (
                                                                        <button
                                                                            onClick={() => handleSetBan(user.user_id, false)}
                                                                            disabled={busyUserId === user.user_id}
                                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                                busyUserId === user.user_id
                                                                                    ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                                    : 'bg-emerald-500 text-white hover:bg-emerald-600'
                                                                            }`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">lock_open</span>
                                                                            Unban
                                                                        </button>
                                                                    ) : (
                                                                        <button
                                                                            onClick={() => handleSetBan(user.user_id, true)}
                                                                            disabled={busyUserId === user.user_id}
                                                                            className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 text-[10px] font-black uppercase tracking-wider rounded-lg transition-all ${
                                                                                busyUserId === user.user_id
                                                                                    ? 'opacity-50 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                                    : 'bg-red-500 text-white hover:bg-red-600'
                                                                            }`}
                                                                        >
                                                                            <span className="material-symbols-outlined text-[14px]">gpp_bad</span>
                                                                            Ban
                                                                        </button>
                                                                    )}
                                                                </div>
                                                            </div>

                                                            <div className="p-4 border-b border-slate-100 dark:border-slate-800">
                                                                <p className="text-[10px] font-black uppercase tracking-wider text-slate-500 mb-2">Ringkasan Event Keamanan</p>
                                                                {user.events.length === 0 ? (
                                                                    <p className="text-xs text-slate-500">Belum ada security event untuk user ini.</p>
                                                                ) : (
                                                                    <div className="space-y-2 max-h-36 overflow-auto pr-1">
                                                                        {user.events.slice(0, 8).map((event) => (
                                                                            <div key={event.id} className="flex items-start justify-between gap-3 p-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 border border-slate-100 dark:border-slate-700">
                                                                                <div>
                                                                                    <p className="text-xs font-bold text-slate-700 dark:text-slate-200">{event.event_type}</p>
                                                                                    <p className="text-[11px] text-slate-500">{formatDateTime(event.created_at)}</p>
                                                                                </div>
                                                                                <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                                                                    event.severity === 'critical'
                                                                                        ? 'text-red-500 bg-red-500/10 border-red-500/20'
                                                                                        : event.severity === 'high'
                                                                                            ? 'text-amber-500 bg-amber-500/10 border-amber-500/20'
                                                                                            : event.severity === 'medium'
                                                                                                ? 'text-blue-500 bg-blue-500/10 border-blue-500/20'
                                                                                                : 'text-emerald-500 bg-emerald-500/10 border-emerald-500/20'
                                                                                }`}>
                                                                                    {event.severity}
                                                                                </span>
                                                                            </div>
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>

                                                            <div className="overflow-x-auto">
                                                                <table className="w-full text-left border-collapse">
                                                                    <thead>
                                                                        <tr className="bg-slate-50/70 dark:bg-slate-800/50 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                                                                            <th className="px-4 py-3">Device</th>
                                                                            <th className="px-4 py-3">Mulai</th>
                                                                            <th className="px-4 py-3">Aktivitas</th>
                                                                            <th className="px-4 py-3">Status</th>
                                                                            <th className="px-4 py-3 text-right">Aksi</th>
                                                                        </tr>
                                                                    </thead>
                                                                    <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                                                        {(() => {
                                                                            const deviceGroups = new Map();
                                                                            user.sessions.forEach(s => {
                                                                                if (!deviceGroups.has(s.device_id)) deviceGroups.set(s.device_id, []);
                                                                                deviceGroups.get(s.device_id).push(s);
                                                                            });
                                                                            
                                                                            return Array.from(deviceGroups.entries()).map(([deviceId, sessions]) => {
                                                                                const mainSession = sessions[0];
                                                                                const deviceName = mainSession.device_name || 'Alat Fisik';
                                                                                const deviceIcon = getDeviceTypeIcon(mainSession.user_agent);
                                                                                
                                                                                return (
                                                                                    <tr key={deviceId} className="bg-slate-50/20 dark:bg-slate-800/20">
                                                                                        <td colSpan="5" className="px-4 py-0">
                                                                                            <div className="py-3 border-b border-slate-100 dark:border-slate-800">
                                                                                                <div className="flex items-center gap-3 mb-2">
                                                                                                    <div className="size-8 rounded-lg bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500">
                                                                                                        <span className="material-symbols-outlined text-lg">{deviceIcon}</span>
                                                                                                    </div>
                                                                                                    <div>
                                                                                                        <p className="text-sm font-black text-slate-800 dark:text-slate-100">{deviceName}</p>
                                                                                                        <p className="text-[10px] font-mono text-slate-400">ID: {deviceId}</p>
                                                                                                    </div>
                                                                                                </div>
                                                                                                
                                                                                                <div className="ml-11 space-y-2">
                                                                                                    {sessions.map(session => (
                                                                                                        <div key={session.id} className="flex items-center justify-between p-2 rounded-lg bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                                                                                            <div className="flex-1 min-w-0 mr-4">
                                                                                                                <div className="flex items-center gap-2">
                                                                                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-200">
                                                                                                                        {session.user_agent?.includes('Chrome') ? 'Google Chrome' : 
                                                                                                                         session.user_agent?.includes('Firefox') ? 'Mozilla Firefox' : 
                                                                                                                         session.user_agent?.includes('Safari') && !session.user_agent?.includes('Chrome') ? 'Apple Safari' : 
                                                                                                                         session.user_agent?.includes('Edg') ? 'Microsoft Edge' : 'Browser'}
                                                                                                                    </span>
                                                                                                                    {session.is_active ? (
                                                                                                                        <span className="flex h-1.5 w-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                                                                                    ) : (
                                                                                                                        <span className="text-[10px] font-bold text-slate-400 uppercase">Revoked</span>
                                                                                                                    )}
                                                                                                                </div>
                                                                                                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{session.user_agent}</p>
                                                                                                                <p className="text-[10px] text-slate-500 mt-1">
                                                                                                                    Aktif: {formatDateTime(session.last_activity_at || session.session_started_at)}
                                                                                                                </p>
                                                                                                                {!session.is_active && session.revoke_reason && (
                                                                                                                    <p className="text-[9px] text-red-400 mt-0.5 italic">Ket: {session.revoke_reason}</p>
                                                                                                                )}
                                                                                                            </div>
                                                                                                            <div className="flex items-center gap-2">
                                                                                                                {session.is_active && (
                                                                                                                    <button
                                                                                                                        onClick={() => handleRevoke(session)}
                                                                                                                        disabled={busySessionId === session.id}
                                                                                                                        className="p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-500/10 rounded-lg transition-colors disabled:opacity-50"
                                                                                                                        title="Revoke Sesi"
                                                                                                                    >
                                                                                                                        <span className="material-symbols-outlined text-[18px]">no_accounts</span>
                                                                                                                    </button>
                                                                                                                )}
                                                                                                            </div>
                                                                                                        </div>
                                                                                                    ))}
                                                                                                </div>
                                                                                            </div>
                                                                                        </td>
                                                                                    </tr>
                                                                                );
                                                                            });
                                                                        })()}
                                                                    </tbody>
                                                                </table>
                                                            </div>
                                                        </div>
                                                    </td>
                                            </tr>
                                        ) : null,
                                    ];
                                })
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
