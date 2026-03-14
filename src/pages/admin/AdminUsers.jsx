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
    const [pending, setPending] = useState(null); // { profile, newRole }
    const [saving, setSaving] = useState(false);
    const returnTo = location.state?.returnTo;
    const returnState = location.state?.returnState ?? null;
    const hasReturnTarget = typeof returnTo === 'string' && returnTo.startsWith('/admin');

    const fetchProfiles = async () => {
        setLoading(true);
        try {
            const { data, error } = await supabase
                .from('profiles')
                .select('id, user_id, username, full_name, role, created_at')
                .order('created_at', { ascending: false });
            if (!error) setProfiles(data || []);
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
            const { error } = await supabase
                .from('profiles')
                .update({ role: pending.newRole })
                .eq('user_id', pending.profile.user_id);
            if (error) throw error;
            addToast(
                pending.newRole === 'admin'
                    ? `${pending.profile.username} diangkat sebagai Administrator.`
                    : `${pending.profile.username} diturunkan menjadi User.`,
                'success'
            );
            setProfiles(prev => prev.map(p =>
                p.user_id === pending.profile.user_id ? { ...p, role: pending.newRole } : p
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
                                                        </p>
                                                        <p className="text-xs text-slate-400">{profile.full_name || ''}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-5 py-3.5">
                                                {isAdmin ? (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-bold">
                                                        <span className="material-symbols-outlined text-[13px]">admin_panel_settings</span>
                                                        Administrator
                                                    </span>
                                                ) : (
                                                    <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400 text-xs font-semibold">
                                                        <span className="material-symbols-outlined text-[13px]">person</span>
                                                        User
                                                    </span>
                                                )}
                                            </td>
                                            <td className="px-5 py-3.5 text-xs text-slate-400">
                                                {profile.created_at
                                                    ? new Date(profile.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })
                                                    : '—'}
                                            </td>
                                            <td className="px-5 py-3.5 text-right">
                                                <button
                                                    onClick={() => setPending({ profile, newRole: isAdmin ? 'user' : 'admin' })}
                                                    disabled={isSelf}
                                                    className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors ${
                                                        isSelf
                                                            ? 'opacity-40 cursor-not-allowed bg-slate-100 dark:bg-slate-800 text-slate-400'
                                                            : isAdmin
                                                                ? 'bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/40 border border-red-200 dark:border-red-800'
                                                                : 'bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-400 hover:bg-violet-100 dark:hover:bg-violet-900/40 border border-violet-200 dark:border-violet-800'
                                                    }`}
                                                >
                                                    {isAdmin ? 'Turunkan ke User' : 'Angkat Admin'}
                                                </button>
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

            {/* Confirm Dialog */}
            <ConfirmDialog
                open={!!pending}
                title={pending?.newRole === 'admin' ? 'Angkat sebagai Administrator?' : 'Turunkan ke User?'}
                message={
                    pending?.newRole === 'admin'
                        ? `${pending?.profile?.username} akan mendapatkan akses penuh ke Panel Admin, termasuk kontrol fitur dan manajemen pengguna.`
                        : `${pending?.profile?.username} akan kehilangan akses ke Panel Admin.`
                }
                confirmLabel={saving ? 'Menyimpan…' : (pending?.newRole === 'admin' ? 'Ya, Angkat Admin' : 'Ya, Turunkan')}
                cancelLabel="Batal"
                danger={pending?.newRole !== 'admin'}
                onConfirm={handleRoleChange}
                onCancel={() => setPending(null)}
            />
        </div>
    );
}
