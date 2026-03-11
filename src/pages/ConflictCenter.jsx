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
        <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 items-center py-2.5 border-b border-slate-100 dark:border-slate-800">
            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{FIELD_LABELS[field] || field}</span>
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
                    <span className="text-[10px] text-slate-400 uppercase font-bold">Lokal (Anda)</span>
                    {choice === 'local' && <span className="material-symbols-outlined text-[13px] text-primary ml-auto">check_circle</span>}
                </div>
                {formatValue(localVal)}
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
                {formatValue(serverVal)}
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
            // Default: keep local if local is newer, otherwise server
            const localTime = localSnapshot?.updatedAt || '';
            const serverTime = serverSnapshot?.updatedAt || '';
            defaults[f] = localTime >= serverTime ? 'local' : 'server';
        });
        return defaults;
    });

    const diffFields = allFields.filter(f => JSON.stringify(localSnapshot?.[f]) !== JSON.stringify(serverSnapshot?.[f]));

    const handleChoose = (field, side) => setChoices(prev => ({ ...prev, [field]: side }));

    const handleSave = async () => {
        // Build merged record
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
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 overflow-hidden">
            {/* Header */}
            <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-200 dark:border-slate-800 bg-amber-50 dark:bg-amber-900/10">
                <span className="material-symbols-outlined text-amber-500">merge_type</span>
                <div className="flex-1 min-w-0">
                    <p className="font-semibold text-sm text-slate-900 dark:text-slate-100">
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

            {/* Column headers */}
            {diffFields.length > 0 && (
                <div className="grid grid-cols-[1fr_2fr_2fr] gap-2 px-5 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                    <span className="text-[10px] uppercase font-bold text-slate-400">Field</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Lokal (Anda)</span>
                    <span className="text-[10px] uppercase font-bold text-slate-400">Server</span>
                </div>
            )}

            {/* Diff rows */}
            <div className="px-5 max-h-80 overflow-y-auto">
                {diffFields.length === 0 ? (
                    <p className="py-6 text-center text-sm text-slate-400">Tidak ada perbedaan yang terdeteksi.</p>
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
                    className="flex items-center gap-1.5 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors"
                >
                    <span className="material-symbols-outlined text-[16px]">save</span>
                    Simpan Pilihan
                </button>
                <button
                    onClick={handleKeepLocal}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                    <span className="material-symbols-outlined text-[15px]">smartphone</span>
                    Pakai Semua Lokal
                </button>
                <button
                    onClick={handleKeepServer}
                    className="flex items-center gap-1.5 px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-700 text-sm text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors"
                >
                    <span className="material-symbols-outlined text-[15px]">cloud</span>
                    Pakai Semua Server
                </button>
            </div>
        </div>
    );
}

export default function ConflictCenter() {
    const [conflicts, setConflicts] = useState([]);
    const [loading, setLoading] = useState(true);
    const [activeId, setActiveId] = useState(null);
    const { refreshConflictCount } = useOffline();
    const { user } = useAuth();

    const load = useCallback(() => {
        setLoading(true);
        listConflicts()
            .then(data => {
                setConflicts(data);
                if (!activeId && data.length > 0) setActiveId(data[0].id);
            })
            .catch(() => {})
            .finally(() => setLoading(false));
    }, [activeId]);

    useEffect(() => { load(); }, []); // eslint-disable-line react-hooks/exhaustive-deps

    const handleResolved = useCallback(async (id, merged) => {
        // Apply the user's merged choice back to local storage then re-sync
        const conflict = conflicts.find(c => c.id === id);
        if (conflict?.type === 'patients' && merged?.id) {
            updatePatient(merged.id, merged);
            syncToSupabase(user?.id).catch(() => {});
        }
        setConflicts(prev => prev.filter(c => c.id !== id));
        setActiveId(prev => prev === id ? null : prev);
        refreshConflictCount();
    }, [conflicts, refreshConflictCount, user?.id]);

    const handleDismiss = useCallback(async (id) => {
        await deleteConflict(id);
        setConflicts(prev => prev.filter(c => c.id !== id));
        setActiveId(prev => prev === id ? null : prev);
        refreshConflictCount();
    }, [refreshConflictCount]);

    const activeConflict = conflicts.find(c => c.id === activeId);

    return (
        <div className="p-4 md:p-8 max-w-5xl mx-auto">
            {/* Page header */}
            <div className="flex items-center gap-3 mb-6">
                <div className="p-2.5 rounded-xl bg-amber-100 dark:bg-amber-900/30">
                    <span className="material-symbols-outlined text-amber-500">merge_type</span>
                </div>
                <div>
                    <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Konflik Data</h1>
                    <p className="text-sm text-slate-500">Selesaikan perbedaan data antara perangkat dan server.</p>
                </div>
            </div>

            {loading ? (
                <div className="flex items-center justify-center py-16 text-slate-400 gap-2">
                    <span className="material-symbols-outlined animate-spin">progress_activity</span>
                    <span>Memuat konflik…</span>
                </div>
            ) : conflicts.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-20 gap-3 text-slate-400">
                    <span className="material-symbols-outlined text-5xl text-green-400">check_circle</span>
                    <p className="font-semibold text-slate-600 dark:text-slate-300">Tidak ada konflik data</p>
                    <p className="text-sm">Semua data sudah tersinkronisasi dengan baik.</p>
                </div>
            ) : (
                <div className="grid md:grid-cols-[280px_1fr] gap-4">
                    {/* Conflict list */}
                    <div className="flex flex-col gap-2">
                        <p className="text-xs font-bold text-slate-400 uppercase px-1 mb-1">{conflicts.length} konflik</p>
                        {conflicts.map(c => (
                            <button
                                key={c.id}
                                onClick={() => setActiveId(c.id)}
                                className={`text-left rounded-xl p-3 border transition-all ${activeId === c.id
                                    ? 'border-primary bg-primary/5 dark:bg-primary/10'
                                    : 'border-slate-200 dark:border-slate-700 hover:border-amber-300 bg-white dark:bg-slate-900'
                                }`}
                            >
                                <p className="font-semibold text-sm text-slate-800 dark:text-slate-200 truncate">
                                    {c.entityName || c.entityId}
                                </p>
                                <p className="text-[11px] text-slate-400 mt-0.5">
                                    {c.type} · {c.changedFields?.length || 0} field berbeda
                                </p>
                                <p className="text-[10px] text-slate-400 mt-0.5">
                                    {new Date(c.detectedAt).toLocaleString('id-ID')}
                                </p>
                            </button>
                        ))}
                    </div>

                    {/* Active resolver */}
                    <div>
                        {activeConflict ? (
                            <ConflictResolver
                                key={activeConflict.id}
                                conflict={activeConflict}
                                onResolved={handleResolved}
                                onDismiss={handleDismiss}
                            />
                        ) : (
                            <div className="flex items-center justify-center h-48 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 text-slate-400 text-sm">
                                Pilih konflik untuk ditinjau
                            </div>
                        )}
                    </div>
                </div>
            )}
        </div>
    );
}
