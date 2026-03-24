import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import ConfirmDialog from '../../components/ConfirmDialog';
import { downloadCsv } from '../../services/exportService';

export default function AdminUsers() {
    const navigate = useNavigate();
    const location = useLocation();
    const { user: currentUser } = useAuth();
    const { addToast } = useToast();
    const [profiles, setProfiles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [search, setSearch] = useState('');
    const [pending, setPending] = useState(null); // { profile, newRole, newExpiresAt }
    const [saving, setSaving] = useState(false);
    const [banPolicies, setBanPolicies] = useState({});
    const [banSavingUserId, setBanSavingUserId] = useState(null);
    const returnTo = location.state?.returnTo;
    const returnState = location.state?.returnState ?? null;
    const hasReturnTarget = typeof returnTo === 'string' && returnTo.startsWith('/admin');

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, user_id, username, full_name, role, created_at, subscription_expires_at')
                .order('created_at', { ascending: false });
            if (!error) {
                const nextProfiles = data || [];
                setProfiles(nextProfiles);

                const userIds = [...new Set(nextProfiles.map((item) => item.user_id).filter(Boolean))];
                if (userIds.length > 0) {
                    const { data: banData, error: banError } = await supabase
                        .from('user_ban_policies')
                        .select('user_id, is_banned, reason, ban_expires_at')
                        .in('user_id', userIds);

                    if (!banError) {
                        const map = (banData || []).reduce((acc, row) => {
                            acc[row.user_id] = row;
                            return acc;
                        }, {});
                        setBanPolicies(map);
                    }
                }
            }
        } catch (_err) {
            addToast('Gagal memuat daftar pengguna.', 'error');
        } finally {
            setLoading(false);
        }
    };

    useEffect(() => { fetchProfiles(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleRoleChange = async () => {
        if (!pending) return;
        setSaving(true);
        try {
            const updates = { role: pending.newRole };
            if (pending.newRole === 'specialist') {
                updates.subscription_expires_at = pending.newExpiresAt || null;
            } else {
                updates.subscription_expires_at = null;
            }
            
            const { error } = await supabase
                .from('profiles')
                .update(updates)
                .eq('user_id', pending.profile.user_id);
            if (error) throw error;
            addToast(`Role ${pending.profile.username} diperbarui menjadi ${pending.newRole}.`, 'success');
            setProfiles(prev => prev.map(p =>
                p.user_id === pending.profile.user_id ? { ...p, ...updates } : p
            ));
        } catch (err) {
            addToast('Gagal mengubah peran: ' + (err.message || ''), 'error');
        } finally {
            setSaving(false);
            setPending(null);
        }
    };

    const filtered = profiles.filter(p => {
        const q = search.toLowerCase().trim();
        if (!q) return true;
        return (
            p.username?.toLowerCase().includes(q) ||
            p.full_name?.toLowerCase().includes(q) ||
            p.role?.includes(q)
        );
    });

    const exportUsersCsv = async () => {
        if (!profiles.length) {
            addToast('Belum ada data pengguna untuk diekspor.', 'info');
            return;
        }
        const rows = profiles.map((p) => ({
            username: p.username || '',
            full_name: p.full_name || '',
            role: p.role || 'user',
            user_id: p.user_id,
            created_at: p.created_at ? new Date(p.created_at).toLocaleString('id-ID') : '',
        }));
        downloadCsv({
            rows,
            columns: [
                { key: 'username', label: 'Username' },
                { key: 'full_name', label: 'Nama Lengkap' },
                { key: 'role', label: 'Role' },
                { key: 'user_id', label: 'User ID' },
                { key: 'subscription_expires_at', label: 'Expired At' },
                { key: 'created_at', label: 'Tanggal Bergabung' },
            ],
            filename: `users_roles_${new Date().toISOString().slice(0, 10)}.csv`,
        });
        await supabase.from('admin_exports').insert({
            admin_id: currentUser?.id,
            export_type: 'users_roles_csv',
            row_count: rows.length,
            filters: { total_users: rows.length },
        });
    };

    const handleBack = () => {
        if (hasReturnTarget) {
            navigate(returnTo, { state: returnState });
            return;
        }
        navigate('/admin');
    };

    const handleToggleBan = async (profile) => {
        const targetUserId = profile?.user_id;
        if (!targetUserId) return;

        const currentlyBanned = banPolicies[targetUserId]?.is_banned === true;
        const nowIso = new Date().toISOString();
        setBanSavingUserId(targetUserId);

        try {
            const { data: authData } = await supabase.auth.getUser();
            const actorUserId = authData?.user?.id || null;

            if (currentlyBanned) {
                const { error: unbanError } = await supabase
                    .from('user_ban_policies')
                    .upsert({
                        user_id: targetUserId,
                        is_banned: false,
                        reason: null,
                        unbanned_by: actorUserId,
                        unbanned_at: nowIso,
                        updated_at: nowIso,
                    }, { onConflict: 'user_id' });

                if (unbanError) throw unbanError;

                await supabase
                    .from('security_events')
                    .insert({
                        user_id: targetUserId,
                        event_type: 'admin_manual_unban',
                        severity: 'medium',
                        metadata: {
                            source: 'admin_users',
                            actor_user_id: actorUserId,
                        },
                    });

                addToast(`User ${profile.username || 'unknown'} berhasil di-unban.`, 'success');
            } else {
                const reasonInput = window.prompt('Alasan ban user (wajib):', 'Aktivitas login mencurigakan');
                const reason = (reasonInput || '').trim();
                if (!reason) {
                    addToast('Ban dibatalkan karena alasan wajib diisi.', 'info');
                    return;
                }

                const { error: banError } = await supabase
                    .from('user_ban_policies')
                    .upsert({
                        user_id: targetUserId,
                        is_banned: true,
                        reason,
                        banned_by: actorUserId,
                        banned_at: nowIso,
                        unbanned_at: null,
                        unbanned_by: null,
                        updated_at: nowIso,
                    }, { onConflict: 'user_id' });

                if (banError) throw banError;

                await supabase
                    .from('user_login_sessions')
                    .update({
                        is_active: false,
                        revoked_at: nowIso,
                        revoke_reason: 'admin_ban_enforced',
                        updated_at: nowIso,
                    })
                    .eq('user_id', targetUserId)
                    .eq('is_active', true);

                await supabase
                    .from('user_devices')
                    .update({
                        revoked_at: nowIso,
                        revoked_reason: 'admin_ban_enforced',
                        updated_at: nowIso,
                    })
                    .eq('user_id', targetUserId)
                    .is('revoked_at', null);

                await supabase
                    .from('security_events')
                    .insert({
                        user_id: targetUserId,
                        event_type: 'admin_manual_ban',
                        severity: 'critical',
                        metadata: {
                            source: 'admin_users',
                            actor_user_id: actorUserId,
                            reason,
                        },
                    });

                addToast(`User ${profile.username || 'unknown'} berhasil diban.`, 'success');
            }

            await fetchProfiles();
        } catch (err) {
            addToast(`Gagal mengubah status ban: ${err.message || ''}`, 'error');
        } finally {
            setBanSavingUserId(null);
        }
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 pb-20 lg:pb-8 max-w-5xl animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <button
                onClick={handleBack}
                className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition"
            >
                <span className="material-symbols-outlined text-base">chevron_left</span>
                {hasReturnTarget ? 'Kembali ke Dashboard Admin' : 'Dashboard Admin'}
            </button>
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
                <div>
                    <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Manajemen Pengguna</h1>
                    <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">Kelola peran akun pengguna aplikasi.</p>
                </div>
                <div className="flex items-center gap-2">
                    <button
                        onClick={exportUsersCsv}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">download</span>
                        Export CSV
                    </button>
                    <button
                        onClick={fetchProfiles}
                        className="flex items-center gap-2 px-4 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm font-semibold hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        <span className="material-symbols-outlined text-[18px]">refresh</span>
                        Refresh
                    </button>
                </div>
            </div>

            {/* Search */}
            <div className="relative">
                <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">search</span>
                <input
                    type="text"
                    value={search}
                    onChange={e => setSearch(e.target.value)}
                    placeholder="Cari username atau nama..."
                    className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-sm"
                />
                {search && (
                    <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition">
                        <span className="material-symbols-outlined text-xl">close</span>
                    </button>
                )}
            </div>

            {/* Table */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                {loading ? (
                    <div className="flex items-center justify-center py-16">
                        <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                    </div>
                ) : filtered.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-16 text-slate-400">
                        <span className="material-symbols-outlined text-4xl mb-2">person_search</span>
                        <p className="text-sm">Tidak ada pengguna ditemukan.</p>
                    </div>
                ) : (
                    <div className="overflow-x-auto">
                        <table className="w-full text-sm">
                            <thead>
                                <tr className="border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/50">
                                    <th className="text-left px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Pengguna</th>
                                    <th className="text-left px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Peran</th>
                                    <th className="text-left px-5 py-3 font-semibold text-slate-500 dark:text-slate-400 text-xs uppercase tracking-wider">Bergabung</th>
                                    <th className="px-5 py-3" />
                                </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                {filtered.map(profile => {
                                    const isSelf = profile.user_id === currentUser?.id;
                                    const isAdmin = profile.role === 'admin';
                                    const isBanned = banPolicies[profile.user_id]?.is_banned === true;
                                    return (
                                        <tr key={profile.id} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                                            <td className="px-5 py-3.5">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-9 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-sm shrink-0">
                                                        {(profile.username?.charAt(0) || 'U').toUpperCase()}
                                                    </div>
                                                    <div>
                                                        <p className="font-semibold text-slate-900 dark:text-slate-100 flex items-center gap-1.5">
                                                            {profile.username || '—'}
                                                            {isSelf && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-primary/10 text-primary">Anda</span>}
                                                            {isBanned && <span className="text-[10px] font-bold px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 border border-red-500/20">BANNED</span>}
                                                        </p>
                                                        <p className="text-xs text-slate-400">{profile.full_name || ''}</p>
                                                        {isBanned && (
                                                            <p className="text-[10px] text-red-500 mt-0.5">{banPolicies[profile.user_id]?.reason || 'Tidak ada alasan'}</p>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {isAdmin ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold">
                                                        <span className="material-symbols-outlined text-[13px]">admin_panel_settings</span>
                                                        Administrator
                                                    </span>
                                                ) : profile.role === 'specialist' ? (
                                                    <div className="flex flex-col gap-1 items-start">
                                                        <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-bold">
                                                            <span className="material-symbols-outlined text-[13px]">workspace_premium</span>
                                                            Specialist
                                                        </span>
                                                        {profile.subscription_expires_at && (
                                                            <span className="text-[10px] text-slate-400 font-medium">
                                                                Exp: {new Date(profile.subscription_expires_at).toLocaleDateString('id-ID')}
                                                            </span>
                                                        )}
                                                        {!profile.subscription_expires_at && (
                                                            <span className="text-[10px] text-teal-500 font-bold">Lifetime</span>
                                                        )}
                                                    </div>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                                                        <span className="material-symbols-outlined text-[13px]">person</span>
                                                        Intern
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-xs text-slate-400">
                                                {profile.created_at
                                                    ? new Date(profile.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <div className="inline-flex items-center gap-2 flex-wrap justify-end">
                                                    <button
                                                        onClick={() => setPending({ 
                                                            profile, 
                                                            newRole: profile.role || 'user',
                                                            newExpiresAt: profile.subscription_expires_at ? new Date(profile.subscription_expires_at).toISOString().split('T')[0] : ''
                                                        })}
                                                        disabled={isSelf}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                            isSelf
                                                                ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200 dark:hover:bg-slate-700'
                                                        }`}
                                                    >
                                                        Ubah Peran
                                                    </button>
                                                    <button
                                                        onClick={() => handleToggleBan(profile)}
                                                        disabled={isSelf || banSavingUserId === profile.user_id}
                                                        className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                            isSelf || banSavingUserId === profile.user_id
                                                                ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                                : isBanned
                                                                    ? 'bg-emerald-500 text-white hover:bg-emerald-600'
                                                                    : 'bg-red-500 text-white hover:bg-red-600'
                                                        }`}
                                                    >
                                                        {banSavingUserId === profile.user_id ? 'Memproses...' : (isBanned ? 'Unban' : 'Ban')}
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                )}
                {!loading && (
                    <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-400">
                        {filtered.length} dari {profiles.length} pengguna
                    </div>
                )}
            </div>

            {/* Role Edit Modal */}
            {pending && (
                <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl w-full max-w-sm overflow-hidden shadow-2xl border border-slate-200 dark:border-slate-800 flex flex-col animate-[slideUpScale_0.3s_cubic-bezier(0.16,1,0.3,1)]">
                        <div className="p-6 border-b border-slate-100 dark:border-slate-800">
                            <h3 className="text-xl font-black text-slate-900 dark:text-white">Ubah Peran Pengguna</h3>
                            <p className="text-sm text-slate-500 mt-1">Mengubah akses untuk {pending.profile.username}</p>
                        </div>
                        <div className="p-6 space-y-4">
                            <div>
                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Role Akses</label>
                                <select 
                                    value={pending.newRole} 
                                    onChange={e => setPending(p => ({ ...p, newRole: e.target.value }))}
                                    className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-3 px-4 font-semibold text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                                >
                                    <option value="user">Intern (User)</option>
                                    <option value="specialist">Specialist (Premium)</option>
                                    <option value="admin">Administrator</option>
                                </select>
                            </div>
                            {pending.newRole === 'specialist' && (
                                <div className="animate-[fadeIn_0.2s_ease-out]">
                                    <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-widest mb-2">Kedaluwarsa Langganan</label>
                                    <input 
                                        type="date" 
                                        value={pending.newExpiresAt}
                                        onChange={e => setPending(p => ({ ...p, newExpiresAt: e.target.value }))}
                                        className="w-full rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 py-3 px-4 text-sm focus:border-primary focus:ring-1 focus:ring-primary outline-none transition"
                                    />
                                    <p className="text-[10px] text-slate-500 mt-1 ml-1">Kosongkan jika Lifetime / Tanpa Batas.</p>
                                </div>
                            )}
                        </div>
                        <div className="p-6 pt-2 flex gap-3">
                            <button
                                onClick={() => setPending(null)}
                                disabled={saving}
                                className="flex-1 py-3 px-4 rounded-xl font-bold text-slate-600 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 dark:hover:bg-slate-700 transition"
                            >
                                Batal
                            </button>
                            <button
                                onClick={handleRoleChange}
                                disabled={saving}
                                className="flex-1 py-3 px-4 rounded-xl font-bold text-white bg-primary hover:bg-primary/90 transition shadow-lg shadow-primary/20 flex items-center justify-center gap-2"
                            >
                                {saving ? <span className="material-symbols-outlined animate-spin text-lg">refresh</span> : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}
