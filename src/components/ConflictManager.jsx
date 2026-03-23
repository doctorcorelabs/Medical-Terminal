import { useEffect, useState, useCallback } from 'react';
import { listConflicts, resolveConflict, deleteConflict } from '../services/idbQueue';
import { updatePatient, syncToSupabase } from '../services/dataService';
import { useOffline } from '../context/OfflineContext';
import { useAuth } from '../context/AuthContext';

// Fields that are shown in the diff view
const FIELD_LABELS = {
    name: 'Nama Pasien',
    age: 'Usia',
    gender: 'Jenis Kelamin',
    bloodType: 'Golongan Darah',
    rhesus: 'Rhesus',
    address: 'Alamat',
    phone: 'No. Telepon',
    diagnosis: 'Diagnosis',
    notes: 'Catatan',
    prescriptions: 'Resep Obat',
    symptoms: 'Gejala',
    vitalSigns: 'Tanda Vital',
    physicalExams: 'Pemeriksaan Fisik',
    supportingExams: 'Pemeriksaan Penunjang',
    dailyReports: 'Laporan Harian',
    updatedAt: 'Diperbarui',
};

function formatValue(val) {
    if (val === undefined || val === null || val === '') return <span className="text-slate-400 italic text-xs">—</span>;
    if (typeof val === 'object') return <span className="text-xs font-mono text-slate-500">{JSON.stringify(val).slice(0, 120)}{JSON.stringify(val).length > 120 ? '…' : ''}</span>;
    return <span className="text-sm">{String(val)}</span>;
}

function DiffRow({ field, local, server, choice, onChoose }) {
    const localVal = local?.[field];
    const serverVal = server?.[field];
    const isDiff = JSON.stringify(localVal) !== JSON.stringify(serverVal);
    if (!isDiff) return null;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-[1fr_2fr_2fr] gap-2 items-start sm:items-center py-4 sm:py-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400 sm:truncate" title={FIELD_LABELS[field] || field}>
                {FIELD_LABELS[field] || field}
            </span>
            {/* Local */}
            <button
                onClick={() => onChoose(field, 'local')}
                className={`rounded-lg px-3 py-2 text-left text-xs border transition-all ${choice === 'local'
                    ? 'border-primary bg-primary/10 text-primary font-medium'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-primary/50'
                }`}
            >
                <div className="flex items-center gap-1 mb-0.5">
                    <span className="material-symbols-outlined text-[13px] text-slate-400">smartphone</span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Lokal</span>
                    {choice === 'local' && <span className="material-symbols-outlined text-[13px] text-primary ml-auto">check_circle</span>}
                </div>
                <div className="wrap-break-word">{formatValue(localVal)}</div>
            </button>
            {/* Server */}
            <button
                onClick={() => onChoose(field, 'server')}
                className={`rounded-lg px-3 py-2 text-left text-xs border transition-all ${choice === 'server'
                    ? 'border-emerald-500 bg-emerald-50 dark:bg-emerald-900/20 text-emerald-700 dark:text-emerald-400 font-medium'
                    : 'border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 hover:border-emerald-300'
                }`}
            >
                <div className="flex items-center gap-1 mb-0.5">
                    <span className="material-symbols-outlined text-[13px] text-slate-400">cloud</span>
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Server</span>
                    {choice === 'server' && <span className="material-symbols-outlined text-[13px] text-emerald-500 ml-auto">check_circle</span>}
                </div>
                <div className="wrap-break-word">{formatValue(serverVal)}</div>
            </button>
        </div>
    );
}

function ConflictResolver({ conflict, onResolved, onDismiss }) {
    const { localSnapshot, serverSnapshot } = conflict;
    const allFields = Array.from(
        new Set([...Object.keys(localSnapshot || {}), ...Object.keys(serverSnapshot || {})])
    ).filter(f => f !== 'id');

    const [choices, setChoices] = useState(() => {
        const defaults = {};
        allFields.forEach(f => {
            const localTime = localSnapshot?.updatedAt || '';
            const serverTime = serverSnapshot?.updatedAt || '';
            defaults[f] = localTime >= serverTime ? 'local' : 'server';
        });
        return defaults;
    });

    const diffFields = allFields.filter(f => JSON.stringify(localSnapshot?.[f]) !== JSON.stringify(serverSnapshot?.[f]));

    const handleChoose = (field, side) => setChoices(prev => ({ ...prev, [field]: side }));

    const handleSave = async () => {
        const merged = { ...localSnapshot };
        for (const f of diffFields) {
            merged[f] = choices[f] === 'server' ? serverSnapshot?.[f] : localSnapshot?.[f];
        }
        merged.updatedAt = new Date().toISOString();
        await resolveConflict(conflict.id);
        onResolved(conflict.id, merged);
    };

    const handleKeepServer = async () => {
        await resolveConflict(conflict.id);
        onResolved(conflict.id, serverSnapshot);
    };

    const handleKeepLocal = async () => {
        await resolveConflict(conflict.id);
        onResolved(conflict.id, localSnapshot);
    };

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/10">
                <span className="material-symbols-outlined text-amber-500">merge_type</span>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100 truncate">
                        {conflict.entityName || conflict.entityId}
                    </p>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                        Terdeteksi: {new Date(conflict.detectedAt).toLocaleString('id-ID')}
                        {conflict.changedFields?.length > 0 && (
                            <> · <span className="font-medium">{conflict.changedFields.length} field berbeda</span></>
                        )}
                    </p>
                </div>
                <button onClick={() => onDismiss(conflict.id)} className="p-1 rounded-lg hover:bg-amber-100 dark:hover:bg-amber-900/30 text-slate-400">
                    <span className="material-symbols-outlined text-[18px]">close</span>
                </button>
            </div>

            {/* Column headers - Hidden on small mobile */}
            {diffFields.length > 0 && (
                <div className="hidden sm:grid grid-cols-[1fr_2fr_2fr] gap-2 px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 text-slate-400">
                    <span className="text-[10px] uppercase font-bold">Field</span>
                    <span className="text-[10px] uppercase font-bold">Lokal</span>
                    <span className="text-[10px] uppercase font-bold">Server</span>
                </div>
            )}

            {/* Diff rows */}
            <div className="px-5 max-h-96 overflow-y-auto">
                {diffFields.length === 0 ? (
                    <p className="py-8 text-center text-sm text-slate-400">Tidak ada perbedaan yang terdeteksi.</p>
                ) : diffFields.map(f => (
                    <DiffRow
                        key={f}
                        field={f}
                        local={localSnapshot}
                        server={serverSnapshot}
                        choice={choices[f]}
                        onChoose={handleChoose}
                    />
                ))}
            </div>

            {/* Actions */}
            <div className="flex flex-wrap items-center gap-2 px-5 py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                <button
                    onClick={handleSave}
                    className="flex-1 sm:flex-none flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-primary text-white text-sm font-bold hover:bg-primary/90 transition-all shadow-lg shadow-primary/20 active:scale-95"
                >
                    <span className="material-symbols-outlined text-[18px]">save</span>
                    Simpan Pilihan
                </button>
                <div className="grid grid-cols-2 gap-2 w-full sm:w-auto">
                    <button
                        onClick={handleKeepLocal}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[16px]">smartphone</span>
                        Lokal Saja
                    </button>
                    <button
                        onClick={handleKeepServer}
                        className="flex items-center justify-center gap-1.5 px-3 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-[11px] sm:text-xs text-slate-600 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-all active:scale-95"
                    >
                        <span className="material-symbols-outlined text-[16px]">cloud</span>
                        Server Saja
                    </button>
                </div>
            </div>
        </div>
    );
}

export default function ConflictManager() {
    const [conflicts, setConflicts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const { refreshConflictCount } = useOffline();
    const { user } = useAuth();

    const logConflictWarning = useCallback((operation, err, extra = {}) => {
        console.warn('[ConflictManager] Warning', {
            operation,
            userId: user?.id || null,
            error: err?.message || String(err || 'unknown'),
            ...extra,
        });
    }, [user?.id]);

    const load = useCallback(() => {
        setLoading(true);
        listConflicts()
            .then(data => {
                setConflicts(data);
                if (!activeId && data.length > 0) setActiveId(data[0].id);
            })
            .catch((err) => {
                logConflictWarning('load.listConflicts', err);
            })
            .finally(() => setLoading(false));
    }, [activeId, logConflictWarning]);

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleResolved = useCallback(async (id, merged) => {
        const conflict = conflicts.find(c => c.id === id);
        if (conflict?.type === 'patients' && merged?.id) {
            updatePatient(merged.id, merged);
            syncToSupabase(user?.id).catch((err) => {
                logConflictWarning('resolve.syncToSupabase', err, { conflictId: id });
            });
        }
        setConflicts(prev => prev.filter(c => c.id !== id));
        setActiveId(prev => prev === id ? null : (prev === id ? null : prev));
        refreshConflictCount();
    }, [conflicts, logConflictWarning, refreshConflictCount, user?.id]);

    const handleDismiss = useCallback(async (id) => {
        await deleteConflict(id);
        setConflicts(prev => prev.filter(c => c.id !== id));
        setActiveId(prev => prev === id ? null : prev);
        refreshConflictCount();
    }, [refreshConflictCount]);

    const activeConflict = conflicts.find(c => c.id === activeId);

    return (
        <section id="data-conflicts" className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden animate-[fadeIn_0.3s_ease-out]">
            <div className="px-6 lg:px-8 py-6 border-b border-slate-100 dark:border-slate-800 bg-amber-50/50 dark:bg-amber-900/10">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="p-2 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                            <span className="material-symbols-outlined text-amber-600">merge_type</span>
                        </div>
                        <div>
                            <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Konflik Data</h3>
                            <p className="text-sm text-slate-600 dark:text-slate-400 font-medium">Selesaikan perbedaan data dengan server</p>
                        </div>
                    </div>
                    {conflicts.length > 0 && (
                        <span className="px-3 py-1 rounded-full bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-400 text-[10px] font-black uppercase tracking-widest self-start sm:self-auto">
                            {conflicts.length} Konflik
                        </span>
                    )}
                </div>
            </div>

            <div className="p-6 lg:p-8">
                {loading ? (
                    <div className="flex flex-col items-center justify-center py-12 text-slate-400 gap-3">
                        <span className="material-symbols-outlined animate-spin text-3xl text-primary">progress_activity</span>
                        <span className="text-sm font-bold">Memuat data konflik...</span>
                    </div>
                ) : conflicts.length === 0 ? (
                    <div className="flex flex-col items-center justify-center py-10 text-center">
                        <div className="size-16 rounded-full bg-emerald-50 dark:bg-emerald-900/20 flex items-center justify-center text-emerald-500 mb-4">
                            <span className="material-symbols-outlined text-3xl">check_circle</span>
                        </div>
                        <h4 className="font-bold text-slate-800 dark:text-slate-200 mb-1">Semua Sinkron</h4>
                        <p className="text-xs text-slate-500 max-w-xs mx-auto">Tidak ada konflik data yang perlu diselesaikan saat ini.</p>
                    </div>
                ) : (
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* List - Scrollable on desktop, grid on mobile */}
                        <div className="lg:col-span-4 flex flex-col gap-2">
                            <div className="flex items-center justify-between mb-2">
                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Pilih Item</p>
                            </div>
                            <div className="flex lg:flex-col gap-2 overflow-x-auto lg:overflow-x-visible pb-2 lg:pb-0 scrollbar-hide">
                                {conflicts.map(c => (
                                    <button
                                        key={c.id}
                                        onClick={() => setActiveId(c.id)}
                                        className={`text-left rounded-2xl p-4 border transition-all shrink-0 w-64 lg:w-full ${activeId === c.id
                                            ? 'border-primary bg-primary/5 dark:bg-primary/10 ring-2 ring-primary/10'
                                            : 'border-slate-100 dark:border-slate-800 hover:border-amber-300 bg-slate-50/50 dark:bg-slate-800/30'
                                        }`}
                                    >
                                        <div className="flex items-center gap-2 mb-1.5">
                                            <span className="text-[10px] font-bold text-primary uppercase">{c.type}</span>
                                        </div>
                                        <p className="font-bold text-sm text-slate-800 dark:text-slate-200 truncate mb-1">
                                            {c.entityName || c.entityId}
                                        </p>
                                        <div className="flex items-center justify-between">
                                            <span className="text-[10px] text-slate-500">{c.changedFields?.length || 0} field berbeda</span>
                                            <span className="text-[9px] text-slate-400">{new Date(c.detectedAt).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}</span>
                                        </div>
                                    </button>
                                ))}
                            </div>
                        </div>

                        {/* Resolver */}
                        <div className="lg:col-span-8">
                            {activeConflict ? (
                                <ConflictResolver
                                    key={activeConflict.id}
                                    conflict={activeConflict}
                                    onResolved={handleResolved}
                                    onDismiss={handleDismiss}
                                />
                            ) : (
                                <div className="flex flex-col items-center justify-center p-12 rounded-3xl border-2 border-dashed border-slate-100 dark:border-slate-800 text-slate-400 gap-3">
                                    <span className="material-symbols-outlined text-4xl opacity-20">touch_app</span>
                                    <p className="text-xs font-bold uppercase tracking-widest opacity-50 text-center">Pilih kontlik di samping<br/>untuk ditinjau</p>
                                </div>
                            )}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
