import { useState, useEffect, useRef } from 'react';
import { labReferences, labCategories } from '../services/dataService';

/**
 * LabReferenceModal
 * Displays the full official RSUD Ki Ageng Brondong lab reference table.
 * Opens as an overlay/sheet. Pass `onClose` to dismiss.
 */
export default function LabReferenceModal({ onClose }) {
    const [search, setSearch] = useState('');
    const [activeCategory, setActiveCategory] = useState('all');
    const [gender, setGender] = useState('male');
    const backdropRef = useRef(null);

    // Close on Escape
    useEffect(() => {
        const handler = (e) => { if (e.key === 'Escape') onClose(); };
        window.addEventListener('keydown', handler);
        return () => window.removeEventListener('keydown', handler);
    }, [onClose]);

    const q = search.toLowerCase().trim();

    const filtered = Object.entries(labReferences).filter(([key, ref]) => {
        const matchCat = activeCategory === 'all' || ref.category === activeCategory;
        const matchQ = !q || ref.name.toLowerCase().includes(q) || (ref.metode || '').toLowerCase().includes(q) || ref.unit.toLowerCase().includes(q);
        return matchCat && matchQ;
    });

    // Group by category order
    const grouped = labCategories.map(cat => ({
        ...cat,
        items: filtered.filter(([, ref]) => ref.category === cat.key),
    })).filter(g => {
        if (activeCategory !== 'all') return g.key === activeCategory && g.items.length > 0;
        return g.items.length > 0;
    });

    function getDisplayRange(ref) {
        if (ref.qualitative) return ref.normalValue || 'Negatif';
        if (ref.infoRanges) {
            return ref.infoRanges.map(r => `${r.label}: ${r.value}`).join(' | ');
        }
        const range = (ref.male && ref.female) ? ref[gender] : ref;
        if (!range || (range.low === undefined && range.high === undefined)) return '–';
        if (range.low === 0 && range.high === 999) return `≥ ${range.low}`;
        if (range.low === undefined || range.low === null) return `< ${range.high}`;
        if (range.high === undefined || range.high === null) return `> ${range.low}`;
        return `${range.low} – ${range.high}`;
    }

    function hasMultipleRanges(ref) {
        return !!(ref.ranges && ref.ranges.length > 1);
    }

    const categoryColorMap = {
        hematologi: 'bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-300 dark:border-red-800',
        diffCount: 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800',
        kimiaKlinik: 'bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-300 dark:border-blue-800',
        elektrolit: 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800',
        imunoserologi: 'bg-purple-50 text-purple-700 border-purple-200 dark:bg-purple-900/20 dark:text-purple-300 dark:border-purple-800',
        urinalisis: 'bg-cyan-50 text-cyan-700 border-cyan-200 dark:bg-cyan-900/20 dark:text-cyan-300 dark:border-cyan-800',
        feses: 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-300 dark:border-amber-800',
        labRujukan: 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-300 dark:border-green-800',
    };

    return (
        <div
            ref={backdropRef}
            onClick={(e) => { if (e.target === backdropRef.current) onClose(); }}
            className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/40 backdrop-blur-sm animate-[fadeIn_0.15s_ease-out] p-0 sm:p-4"
        >
            <div className="relative bg-white dark:bg-slate-900 rounded-t-3xl sm:rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700 w-full sm:max-w-4xl max-h-[90vh] flex flex-col animate-[slideUp_0.2s_ease-out]">
                {/* Header */}
                <div className="flex items-start justify-between gap-3 px-5 pt-5 pb-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 mb-0.5">
                            <div className="size-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-primary text-[18px]">fact_check</span>
                            </div>
                            <h2 className="font-black text-slate-900 dark:text-white text-base sm:text-lg">
                                Nilai Rujukan Laboratorium
                            </h2>
                        </div>
                        <p className="text-xs text-slate-400 ml-10">
                            RSUD Ki Ageng Brondong · Dokumen Resmi
                        </p>
                    </div>
                    <button onClick={onClose} className="shrink-0 p-2 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                        <span className="material-symbols-outlined">close</span>
                    </button>
                </div>

                {/* Controls */}
                <div className="px-5 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0 space-y-2.5">
                    {/* Search */}
                    <div className="relative">
                        <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px] pointer-events-none">search</span>
                        <input
                            type="text"
                            placeholder="Cari parameter (mis: Hemoglobin, SGOT, Dengue...)"
                            value={search}
                            onChange={e => setSearch(e.target.value)}
                            className="w-full pl-9 pr-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-sm focus:outline-none focus:border-primary focus:ring-1 focus:ring-primary/30 transition-all"
                            autoFocus
                        />
                        {search && (
                            <button onClick={() => setSearch('')} className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 transition-colors">
                                <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                        )}
                    </div>

                    {/* Category Tabs + Gender Toggle */}
                    <div className="flex gap-2 items-center justify-between flex-wrap">
                        <div className="flex gap-1 overflow-x-auto pb-1 flex-1 min-w-0">
                            <button
                                onClick={() => setActiveCategory('all')}
                                className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase whitespace-nowrap transition-all shrink-0 ${activeCategory === 'all' ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                            >
                                Semua
                            </button>
                            {labCategories.map(cat => (
                                <button
                                    key={cat.key}
                                    onClick={() => setActiveCategory(cat.key)}
                                    className={`px-3 py-1.5 rounded-lg text-[11px] font-black uppercase whitespace-nowrap transition-all shrink-0 ${activeCategory === cat.key ? 'bg-primary text-white shadow-sm' : 'bg-slate-100 dark:bg-slate-800 text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                                >
                                    {cat.label}
                                </button>
                            ))}
                        </div>
                        {/* Gender toggle */}
                        <div className="flex p-0.5 bg-slate-100 dark:bg-slate-800 rounded-lg gap-0.5 shrink-0">
                            {[{ v: 'male', l: 'Pria', i: 'male' }, { v: 'female', l: 'Wanita', i: 'female' }].map(opt => (
                                <button key={opt.v} onClick={() => setGender(opt.v)}
                                    className={`flex items-center gap-1 px-2.5 py-1 rounded-md text-[11px] font-bold transition-all ${gender === opt.v ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500'}`}>
                                    <span className="material-symbols-outlined text-[14px]">{opt.i}</span>
                                    {opt.l}
                                </button>
                            ))}
                        </div>
                    </div>
                </div>

                {/* Table Content */}
                <div className="overflow-y-auto flex-1 custom-scrollbar">
                    {grouped.length === 0 ? (
                        <div className="text-center py-16 text-slate-400">
                            <span className="material-symbols-outlined text-4xl mb-3 block">search_off</span>
                            <p className="text-sm font-semibold">Parameter tidak ditemukan</p>
                            <p className="text-xs mt-1">Coba kata kunci lain</p>
                        </div>
                    ) : (
                        grouped.map(group => (
                            <div key={group.key}>
                                {/* Category header */}
                                <div className="sticky top-0 z-10 flex items-center gap-2 px-5 py-2.5 bg-slate-50/95 dark:bg-slate-800/95 backdrop-blur-sm border-b border-slate-100 dark:border-slate-800">
                                    <span className="material-symbols-outlined text-[16px] text-slate-500">{group.icon}</span>
                                    <span className="text-[11px] font-black text-slate-500 uppercase tracking-widest">{group.label}</span>
                                    <span className="ml-auto text-[10px] text-slate-400 font-bold">{group.items.length} parameter</span>
                                </div>

                                {/* Table */}
                                <table className="w-full text-sm border-collapse">
                                    <thead>
                                        <tr className="border-b border-slate-100 dark:border-slate-800">
                                            <th className="text-left px-5 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider w-1/3">Parameter</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider hidden sm:table-cell">Metode</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Satuan</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider">Nilai Normal</th>
                                            <th className="text-left px-4 py-2 text-[10px] font-black text-slate-400 uppercase tracking-wider hidden md:table-cell">Ket.</th>
                                        </tr>
                                    </thead>
                                    <tbody>
                                        {group.items.map(([key, ref]) => {
                                            // Has multiple demographic ranges
                                            if (hasMultipleRanges(ref) && activeCategory === 'all') {
                                                return ref.ranges.map((r, i) => (
                                                    <tr key={`${key}-${i}`} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                        <td className="px-5 py-2.5">
                                                            {i === 0 && (
                                                                <div className="flex items-center gap-2">
                                                                    <span className="font-semibold text-slate-800 dark:text-slate-200">{ref.name}</span>
                                                                </div>
                                                            )}
                                                        </td>
                                                        <td className="px-4 py-2.5 hidden sm:table-cell">
                                                            {i === 0 && <span className="text-xs text-slate-400">{ref.metode || '–'}</span>}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            {i === 0 && <span className="text-xs font-mono text-slate-500">{ref.unit}</span>}
                                                        </td>
                                                        <td className="px-4 py-2.5">
                                                            <span className="text-sm font-bold text-primary">
                                                                {r.low !== undefined && r.high !== undefined ? `${r.low} – ${r.high}` : r.low !== undefined ? `≥ ${r.low}` : `≤ ${r.high}`}
                                                            </span>
                                                        </td>
                                                        <td className="px-4 py-2.5 hidden md:table-cell">
                                                            <span className="text-xs text-slate-400 italic">{r.label}</span>
                                                        </td>
                                                    </tr>
                                                ));
                                            }

                                            return (
                                                <tr key={key} className="border-b border-slate-50 dark:border-slate-800/50 hover:bg-slate-50 dark:hover:bg-slate-800/30 transition-colors">
                                                    <td className="px-5 py-2.5">
                                                        <div className="flex items-center gap-2">
                                                            <span className="font-semibold text-slate-800 dark:text-slate-200">{ref.name}</span>
                                                            {ref.qualitative && (
                                                                <span className="text-[9px] px-1.5 py-0.5 rounded bg-slate-100 dark:bg-slate-700 text-slate-400 font-bold uppercase">kualitatif</span>
                                                            )}
                                                        </div>
                                                    </td>
                                                    <td className="px-4 py-2.5 hidden sm:table-cell">
                                                        <span className="text-xs text-slate-400">{ref.metode || '–'}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        <span className="text-xs font-mono text-slate-500">{ref.unit}</span>
                                                    </td>
                                                    <td className="px-4 py-2.5">
                                                        {ref.infoRanges ? (
                                                            <div className="space-y-0.5">
                                                                {ref.infoRanges.map((r, i) => (
                                                                    <div key={i} className="flex items-center gap-1.5">
                                                                        <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${r.label.toLowerCase().includes('baik') || r.label.toLowerCase().includes('normal') || r.label.toLowerCase().includes('negatif') || r.label.toLowerCase().includes('euthyroid')
                                                                                ? 'bg-green-50 text-green-700 border-green-200 dark:bg-green-900/20 dark:text-green-400 dark:border-green-800'
                                                                                : r.label.toLowerCase().includes('buruk') || r.label.toLowerCase().includes('hyper') || r.label.toLowerCase().includes('hypo') || r.label.toLowerCase().includes('positif')
                                                                                    ? 'bg-red-50 text-red-600 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-800'
                                                                                    : 'bg-amber-50 text-amber-600 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-800'
                                                                            }`}>{r.label}</span>
                                                                        <span className="text-xs font-bold text-slate-600 dark:text-slate-300">{r.value}</span>
                                                                    </div>
                                                                ))}
                                                            </div>
                                                        ) : (
                                                            <span className={`text-sm font-bold ${ref.qualitative ? 'text-green-600 dark:text-green-400' : 'text-primary'}`}>
                                                                {getDisplayRange(ref)}
                                                            </span>
                                                        )}
                                                    </td>
                                                    <td className="px-4 py-2.5 hidden md:table-cell">
                                                        {ref.male && ref.female && (
                                                            <span className={`text-[9px] font-black uppercase px-1.5 py-0.5 rounded border ${categoryColorMap[ref.category] || 'bg-slate-50 text-slate-500 border-slate-200'}`}>
                                                                {gender === 'male' ? 'Pria' : 'Wanita'}
                                                            </span>
                                                        )}
                                                        {ref.ranges && !ref.male && (
                                                            <span className="text-[9px] text-slate-400">Multi-range</span>
                                                        )}
                                                    </td>
                                                </tr>
                                            );
                                        })}
                                    </tbody>
                                </table>
                            </div>
                        ))
                    )}
                </div>

                {/* Footer */}
                <div className="px-5 py-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-3 shrink-0 bg-slate-50/50 dark:bg-slate-800/50">
                    <p className="text-[10px] text-slate-400">
                        Sumber: PDS PATKLIN – S1 Units & Pack Insert Reagent · RSUD Ki Ageng Brondong
                    </p>
                    <span className="text-[10px] font-bold text-slate-400">
                        {filtered.length} parameter
                    </span>
                </div>
            </div>
        </div>
    );
}
