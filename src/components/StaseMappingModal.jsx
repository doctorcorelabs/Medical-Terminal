import { useState, useMemo, useEffect } from 'react';

const COLOR_PALETTE = [
    '#3b82f6', '#22c55e', '#ef4444', '#a855f7',
    '#f97316', '#14b8a6', '#ec4899', '#eab308',
];

const DEFAULT_ENTRY = { mode: 'none', targetId: '', newName: '', newColor: COLOR_PALETTE[0] };

/**
 * StaseMappingModal
 *
 * Props:
 *  - open: bool
 *  - importedPatients: Patient[]   — raw array from the imported JSON
 *  - localStases: { id, name, color }[]  — stases already in this account
 *  - onApply(mappedPatients, newStases)  — called when user confirms
 *  - onCancel()
 */
const CONDITION_STYLES = {
    stable:    { label: 'Stabil',   cls: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' },
    improving: { label: 'Membaik',  cls: 'bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400' },
    urgent:    { label: 'Mendesak', cls: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400' },
    critical:  { label: 'Kritis',   cls: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400' },
};

export default function StaseMappingModal({ open, importedPatients, localStases, onApply, onCancel }) {
    const [expandedPreviews, setExpandedPreviews] = useState({});
    const togglePreview = (id) => setExpandedPreviews(prev => ({ ...prev, [id]: !prev[id] }));

    // Collect unique stase_id values that appear in the imported file
    const unknownStaseIds = useMemo(() => {
        if (!importedPatients) return [];
        const localIds = new Set(localStases.map(s => s.id));
        const seen = new Set();
        for (const p of importedPatients) {
            if (p.stase_id && !localIds.has(p.stase_id)) seen.add(p.stase_id);
        }
        return Array.from(seen);
    }, [importedPatients, localStases]);

    // Patients per stase group are derived inline; countFor no longer needed
    // mapping state: { [importedStaseId]: { mode: 'none'|'existing'|'create', targetId?, newName, newColor } }
    const [mapping, setMapping] = useState(() =>
        Object.fromEntries(
            (unknownStaseIds || []).map(id => [id, { mode: 'none', targetId: '', newName: '', newColor: COLOR_PALETTE[0] }])
        )
    );

    // Reset when the set of unknownStaseIds changes (new file loaded)
    useEffect(() => {
        setMapping(
            Object.fromEntries(
                unknownStaseIds.map(id => [id, { mode: 'none', targetId: '', newName: '', newColor: COLOR_PALETTE[0] }])
            )
        );
    }, [unknownStaseIds]); // eslint-disable-line

    const setField = (staseId, field, value) =>
        setMapping(prev => ({ ...prev, [staseId]: { ...prev[staseId], [field]: value } }));

    const canApply = unknownStaseIds.every(id => {
        const m = mapping[id];
        if (!m) return false;
        if (m.mode === 'existing') return !!m.targetId;
        if (m.mode === 'create') return m.newName.trim().length > 0;
        return true; // 'none' is always valid (assign null)
    });

    const handleApply = () => {
        // 1. Build new stases to create
        const newStases = [];
        const resolvedMap = {}; // importedStaseId → finalLocalId | null

        for (const id of unknownStaseIds) {
            const m = mapping[id] ?? DEFAULT_ENTRY;
            if (m.mode === 'existing') {
                resolvedMap[id] = m.targetId;
            } else if (m.mode === 'create') {
                const newId = crypto.randomUUID();
                newStases.push({ id: newId, name: m.newName.trim(), color: m.newColor, createdAt: new Date().toISOString() });
                resolvedMap[id] = newId;
            } else {
                resolvedMap[id] = null;
            }
        }

        // 2. Remap patients
        const remapped = importedPatients.map(p => {
            if (p.stase_id && (p.stase_id in resolvedMap)) {
                return { ...p, stase_id: resolvedMap[p.stase_id] };
            }
            return p;
        });

        onApply(remapped, newStases);
    };

    if (!open) return null;

    // If there are no unknown stases, skip the modal and apply directly
    if (unknownStaseIds.length === 0) {
        // Defer the call to avoid updating state during render
        setTimeout(() => onApply(importedPatients, []), 0);
        return null;
    }

    return (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full max-w-lg max-h-[90vh] flex flex-col overflow-hidden">
                {/* Header */}
                <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex items-start gap-3">
                    <div className="size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0 mt-0.5">
                        <span className="material-symbols-outlined text-primary text-xl">device_hub</span>
                    </div>
                    <div className="min-w-0">
                        <h2 className="text-base font-black text-slate-900 dark:text-white">Mapping Stase</h2>
                        <p className="text-xs text-slate-500 mt-0.5">
                            File impor mengandung {unknownStaseIds.length} stase yang belum ada di akun Anda.
                            Pilih tindakan untuk masing-masing.
                        </p>
                    </div>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto px-6 py-4 space-y-5">
                    {unknownStaseIds.map((staseId) => {
                        const m = mapping[staseId] ?? DEFAULT_ENTRY;
                        const patientsInGroup = importedPatients.filter(p => p.stase_id === staseId);
                        const isExpanded = !!expandedPreviews[staseId];
                        return (
                            <div key={staseId} className="rounded-xl border border-slate-200 dark:border-slate-700 p-4 space-y-3 bg-slate-50/50 dark:bg-slate-800/30">
                                {/* Imported stase info + preview toggle */}
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2 min-w-0">
                                        <span className="material-symbols-outlined text-slate-400 text-base shrink-0">assignment</span>
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate font-mono">{staseId}</p>
                                            <p className="text-[10px] text-slate-400">{patientsInGroup.length} pasien dalam file impor</p>
                                        </div>
                                    </div>
                                    <button
                                        onClick={() => togglePreview(staseId)}
                                        className="flex items-center gap-1 text-[10px] font-bold text-primary hover:text-blue-600 transition-colors shrink-0 px-2 py-1 rounded-lg hover:bg-primary/10"
                                    >
                                        <span className="material-symbols-outlined text-sm">
                                            {isExpanded ? 'expand_less' : 'preview'}
                                        </span>
                                        {isExpanded ? 'Tutup' : 'Preview'}
                                    </button>
                                </div>

                                {/* Collapsible patient preview */}
                                {isExpanded && (
                                    <div className="space-y-2 animate-[fadeIn_0.15s_ease-out]">
                                        {patientsInGroup.map(p => {
                                            const cond = CONDITION_STYLES[p.condition] ?? CONDITION_STYLES.stable;
                                            const symptoms = (p.symptoms || []).slice(0, 4).map(s => s.name).filter(Boolean);
                                            const diagnosis = p.diagnosis?.split('\n')[0]?.trim();
                                            return (
                                                <div key={p.id} className="bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 px-3 py-2.5 space-y-1.5">
                                                    <div className="flex items-center justify-between gap-2 flex-wrap">
                                                        <div className="flex items-center gap-2 min-w-0">
                                                            <div className="size-6 rounded-full bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                                                <span className="material-symbols-outlined text-slate-400 text-sm">person</span>
                                                            </div>
                                                            <p className="text-xs font-bold text-slate-800 dark:text-slate-100 truncate">
                                                                {p.name || '—'}
                                                            </p>
                                                            <p className="text-[10px] text-slate-400 shrink-0">
                                                                {p.age ? `${p.age} th` : ''}{p.gender ? ` • ${p.gender === 'female' ? 'P' : 'L'}` : ''}
                                                            </p>
                                                        </div>
                                                        <span className={`text-[9px] font-black px-1.5 py-0.5 rounded-full shrink-0 ${cond.cls}`}>
                                                            {cond.label}
                                                        </span>
                                                    </div>
                                                    {diagnosis && (
                                                        <p className="text-[10px] text-slate-500 dark:text-slate-400 leading-snug line-clamp-2">
                                                            <span className="font-bold text-slate-600 dark:text-slate-300">Dx: </span>{diagnosis}
                                                        </p>
                                                    )}
                                                    {symptoms.length > 0 && (
                                                        <div className="flex gap-1 flex-wrap">
                                                            {symptoms.map((s, i) => (
                                                                <span key={i} className="text-[9px] font-semibold bg-primary/8 text-primary px-1.5 py-0.5 rounded border border-primary/20">
                                                                    {s}
                                                                </span>
                                                            ))}
                                                            {(p.symptoms?.length ?? 0) > 4 && (
                                                                <span className="text-[9px] text-slate-400 self-center">
                                                                    +{p.symptoms.length - 4} lagi
                                                                </span>
                                                            )}
                                                        </div>
                                                    )}
                                                </div>
                                            );
                                        })}
                                    </div>
                                )}

                                {/* Mode selector */}
                                <div className="grid grid-cols-3 gap-1.5 p-1 bg-slate-100 dark:bg-slate-800 rounded-lg">
                                    {[
                                        { value: 'none', label: 'Tanpa Stase', icon: 'link_off' },
                                        { value: 'existing', label: 'Pilih Ada', icon: 'layers' },
                                        { value: 'create', label: 'Buat Baru', icon: 'add_circle' },
                                    ].map(opt => (
                                        <button
                                            key={opt.value}
                                            onClick={() => setField(staseId, 'mode', opt.value)}
                                            className={`flex flex-col items-center gap-0.5 py-2 px-1 rounded-md text-[10px] font-bold transition-all ${
                                                m.mode === opt.value
                                                    ? 'bg-white dark:bg-slate-700 text-primary shadow-sm'
                                                    : 'text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                            }`}
                                        >
                                            <span className="material-symbols-outlined text-base">{opt.icon}</span>
                                            {opt.label}
                                        </button>
                                    ))}
                                </div>

                                {/* Existing stase dropdown */}
                                {m.mode === 'existing' && (
                                    <div className="animate-[fadeIn_0.15s_ease-out]">
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Stase Tujuan</label>
                                        <select
                                            value={m.targetId}
                                            onChange={e => setField(staseId, 'targetId', e.target.value)}
                                            className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm text-slate-700 dark:text-slate-200 focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                                        >
                                            <option value="">— Pilih stase —</option>
                                            {localStases.map(s => (
                                                <option key={s.id} value={s.id}>{s.name}</option>
                                            ))}
                                        </select>
                                        {m.targetId && (
                                            <div className="flex items-center gap-1.5 mt-1.5 ml-1">
                                                <span
                                                    className="size-2.5 rounded-full shrink-0"
                                                    style={{ backgroundColor: localStases.find(s => s.id === m.targetId)?.color }}
                                                />
                                                <p className="text-[10px] text-slate-500">
                                                    {patientsInGroup.length} pasien akan dipindahkan ke stase ini
                                                </p>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Create new stase inputs */}
                                {m.mode === 'create' && (
                                    <div className="space-y-3 animate-[fadeIn_0.15s_ease-out]">
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Nama Stase Baru</label>
                                            <input
                                                type="text"
                                                value={m.newName}
                                                onChange={e => setField(staseId, 'newName', e.target.value)}
                                                placeholder="Cth: Penyakit Dalam, Bedah…"
                                                className="w-full h-10 px-3 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                                            />
                                        </div>
                                        <div>
                                            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">Warna</label>
                                            <div className="flex gap-2 flex-wrap">
                                                {COLOR_PALETTE.map(color => (
                                                    <button
                                                        key={color}
                                                        onClick={() => setField(staseId, 'newColor', color)}
                                                        className={`size-7 rounded-full transition-all border-2 ${
                                                            m.newColor === color
                                                                ? 'border-slate-700 dark:border-white scale-110 shadow-md'
                                                                : 'border-transparent hover:scale-105'
                                                        }`}
                                                        style={{ backgroundColor: color }}
                                                    />
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                )}

                                {/* None mode hint */}
                                {m.mode === 'none' && (
                                    <p className="text-[10px] text-slate-400 ml-1 animate-[fadeIn_0.15s_ease-out]">
                                        Pasien akan diimpor tanpa stase — bisa diassign manual nanti.
                                    </p>
                                )}
                            </div>
                        );
                    })}
                </div>

                {/* Footer */}
                <div className="px-6 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3 bg-slate-50/50 dark:bg-slate-800/30">
                    <button
                        onClick={onCancel}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                    >
                        Batal
                    </button>
                    <button
                        onClick={handleApply}
                        disabled={!canApply}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-blue-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-base">check_circle</span>
                        Terapkan & Impor
                    </button>
                </div>
            </div>
        </div>
    );
}
