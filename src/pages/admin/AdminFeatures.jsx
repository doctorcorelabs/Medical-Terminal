import { useEffect, useState } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useAuth } from '../../context/AuthContext';
import { useToast } from '../../context/ToastContext';
import { useFeatureFlags } from '../../context/FeatureFlagContext';
import { ALL_TOOLS } from '../../data/toolsCatalog';

// Extra non-tool features that also have flags
const EXTRA_FLAGS = [
    { key: 'news',            name: 'Berita',                     icon: 'newspaper',  category: 'Konten' },
    { key: 'reports',         name: 'Laporan',                    icon: 'analytics',  category: 'Konten' },
    { key: 'ai-drug-summary', name: 'Ringkasan AI Interaksi Obat', icon: 'smart_toy', category: 'AI' },
];

const TOOL_FLAGS = ALL_TOOLS
    .filter(t => t.route)
    .map(t => ({ key: t.id, name: t.name, icon: t.icon, category: t.category }));

const ALL_FLAGS = [...TOOL_FLAGS, ...EXTRA_FLAGS];

export default function AdminFeatures() {
    const { user } = useAuth();
    const { addToast } = useToast();
    const { refreshFlags } = useFeatureFlags();

    const [rows, setRows] = useState({}); // { [key]: { enabled, maintenance_message } }
    const [editing, setEditing] = useState({}); // { [key]: { enabled, maintenance_message } } — local edits
    const [saving, setSaving] = useState({}); // { [key]: boolean }
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        async function load() {
            try {
                const { data, error } = await supabase
                    .from('feature_flags')
                    .select('key, enabled, maintenance_message');
                if (!error && data) {
                    const map = {};
                    data.forEach(f => { map[f.key] = { enabled: f.enabled, maintenance_message: f.maintenance_message }; });
                    setRows(map);
                    setEditing(map);
                }
            } catch (_err) {
                addToast('Gagal memuat data fitur.', 'error');
            } finally {
                setLoading(false);
            }
        }
        load();
    }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleToggle = (key) => {
        setEditing(prev => ({
            ...prev,
            [key]: { ...prev[key], enabled: !prev[key]?.enabled },
        }));
    };

    const handleMessageChange = (key, value) => {
        setEditing(prev => ({
            ...prev,
            [key]: { ...prev[key], maintenance_message: value },
        }));
    };

    const handleSave = async (key) => {
        const update = editing[key];
        if (!update) return;
        setSaving(prev => ({ ...prev, [key]: true }));
        try {
            const { error } = await supabase
                .from('feature_flags')
                .upsert({
                    key,
                    enabled: update.enabled,
                    maintenance_message: update.maintenance_message,
                    updated_at: new Date().toISOString(),
                    updated_by: user?.id,
                }, { onConflict: 'key' });
            if (error) throw error;
            setRows(prev => ({ ...prev, [key]: update }));
            refreshFlags();
            addToast(`Perubahan pada "${ALL_FLAGS.find(f => f.key === key)?.name}" disimpan.`, 'success');
        } catch (err) {
            addToast('Gagal menyimpan: ' + (err.message || ''), 'error');
        } finally {
            setSaving(prev => ({ ...prev, [key]: false }));
        }
    };

    const isDirty = (key) => {
        const orig = rows[key];
        const curr = editing[key];
        if (!orig || !curr) return false;
        return orig.enabled !== curr.enabled || orig.maintenance_message !== curr.maintenance_message;
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 pb-20 lg:pb-8 max-w-4xl animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <div>
                <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Kontrol Fitur</h1>
                <p className="text-sm text-slate-500 dark:text-slate-400 mt-0.5">
                    Aktifkan atau nonaktifkan fitur untuk semua pengguna. Administrator selalu dapat mengakses semua fitur.
                </p>
            </div>

            <div className="bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-xl p-4 flex items-start gap-3">
                <span className="material-symbols-outlined text-amber-500 text-xl shrink-0 mt-0.5">info</span>
                <p className="text-sm text-amber-700 dark:text-amber-300">
                    Perubahan langsung berlaku untuk semua pengguna yang sedang online. Pengguna offline akan melihat perubahan saat mereka membuka kembali aplikasi.
                </p>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-20">
                    <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                </div>
            ) : (
                <div className="space-y-3">
                    {ALL_FLAGS.map(flag => {
                        const current = editing[flag.key] ?? { enabled: true, maintenance_message: '' };
                        const isSaving = saving[flag.key];
                        const dirty = isDirty(flag.key);

                        return (
                            <div
                                key={flag.key}
                                className={`bg-white dark:bg-slate-900 rounded-xl border shadow-sm overflow-hidden transition-all
                                    ${current.enabled
                                        ? 'border-slate-200 dark:border-slate-800'
                                        : 'border-amber-300 dark:border-amber-700'}`}
                            >
                                <div className="flex items-center gap-4 px-5 py-4">
                                    <span className={`material-symbols-outlined text-xl ${current.enabled ? 'text-primary' : 'text-amber-500'}`}>
                                        {flag.icon}
                                    </span>
                                    <div className="flex-1 min-w-0">
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{flag.name}</p>
                                            <span className="text-[11px] px-2 py-0.5 rounded-full bg-slate-100 dark:bg-slate-800 text-slate-500 dark:text-slate-400">
                                                {flag.category}
                                            </span>
                                            <span className="text-[10px] font-mono text-slate-400 dark:text-slate-500">{flag.key}</span>
                                        </div>
                                    </div>

                                    {/* Toggle */}
                                    <button
                                        onClick={() => handleToggle(flag.key)}
                                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors shrink-0
                                            ${current.enabled ? 'bg-emerald-500' : 'bg-slate-300 dark:bg-slate-600'}`}
                                    >
                                        <span
                                            className={`inline-block size-4 rounded-full bg-white shadow transition-transform
                                                ${current.enabled ? 'translate-x-6' : 'translate-x-1'}`}
                                        />
                                    </button>

                                    {/* Status label */}
                                    <span className={`text-xs font-semibold w-16 text-right shrink-0 ${current.enabled ? 'text-emerald-600 dark:text-emerald-400' : 'text-amber-600 dark:text-amber-400'}`}>
                                        {current.enabled ? 'Aktif' : 'Nonaktif'}
                                    </span>
                                </div>

                                {/* Maintenance message input — shown when disabled */}
                                {!current.enabled && (
                                    <div className="px-5 pb-4 border-t border-amber-100 dark:border-amber-900/30 pt-3">
                                        <label className="block text-xs font-semibold text-amber-700 dark:text-amber-400 mb-1.5">
                                            Pesan untuk pengguna
                                        </label>
                                        <textarea
                                            rows={2}
                                            value={current.maintenance_message}
                                            onChange={e => handleMessageChange(flag.key, e.target.value)}
                                            placeholder="Tulis pesan yang akan ditampilkan kepada pengguna..."
                                            className="w-full px-3 py-2 rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 text-slate-800 dark:text-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-amber-400/40 resize-none placeholder-slate-400"
                                        />
                                    </div>
                                )}

                                {/* Save button */}
                                {(dirty || !current.enabled) && (
                                    <div className="px-5 pb-4 flex justify-end">
                                        <button
                                            onClick={() => handleSave(flag.key)}
                                            disabled={isSaving || !dirty}
                                            className={`flex items-center gap-1.5 px-4 py-2 rounded-lg text-xs font-bold transition-colors
                                                ${dirty
                                                    ? 'bg-primary text-white hover:bg-primary/90'
                                                    : 'bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed'}`}
                                        >
                                            {isSaving ? (
                                                <span className="material-symbols-outlined text-[16px] animate-spin">progress_activity</span>
                                            ) : (
                                                <span className="material-symbols-outlined text-[16px]">save</span>
                                            )}
                                            {isSaving ? 'Menyimpan…' : 'Simpan Perubahan'}
                                        </button>
                                    </div>
                                )}
                            </div>
                        );
                    })}
                </div>
            )}
        </div>
    );
}
