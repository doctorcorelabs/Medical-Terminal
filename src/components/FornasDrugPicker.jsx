import { useState, useEffect, useCallback, useRef } from 'react';
import { supabase } from '../services/supabaseClient';
import { useOffline } from '../context/OfflineContext';

// ── Constants (same as FornasDrug.jsx) ────────────────────────────────────────
const FLAGS = [
  { key: 'flag_oen',     label: 'OEN',    title: 'Obat Esensial Nasional',       color: 'emerald' },
  { key: 'flag_fpktl',   label: 'FKRTL',  title: 'Formularium Tingkat Lanjutan', color: 'blue'    },
  { key: 'flag_fpktp',   label: 'FKTP',   title: 'Formularium Tingkat Pertama',  color: 'cyan'    },
  { key: 'flag_prb',     label: 'PRB',    title: 'Program Rujuk Balik',          color: 'violet'  },
  { key: 'flag_pp',      label: 'PP',     title: 'Program Pemerintah',           color: 'amber'   },
  { key: 'flag_program', label: 'Program',title: 'Program Kemenkes',             color: 'orange'  },
  { key: 'flag_kanker',  label: 'Onko',   title: 'Obat Kanker / Onkologi',      color: 'rose'    },
];

const FLAG_COLORS = {
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
  blue:    'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
  cyan:    'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/40',
  violet:  'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/40',
  amber:   'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
  orange:  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/40',
  rose:    'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40',
};

const PAGE_SIZE = 50;
const TABLE = 'fornas_drugs';

// Module-level singleton cache — fetch data once, reuse across all picker opens
let _cachedData = null;
let _fetchPromise = null;

async function loadFornasDrugs() {
  if (_cachedData) return _cachedData;
  if (_fetchPromise) return _fetchPromise;

  _fetchPromise = (async () => {
    try {
      let all = [];
      let from = 0;
      const step = 1000;
      while (true) {
        const { data, error } = await supabase
          .from(TABLE)
          .select('id,sks_id,name,name_international,label,form_code,form,strength,unit,category_l1,category_l2,flag_fpktl,flag_fpktp,flag_pp,flag_prb,flag_oen,flag_program,flag_kanker')
          .order('name')
          .range(from, from + step - 1);
        if (error) throw new Error(error.message);
        all = all.concat(data ?? []);
        if (!data || data.length < step) break;
        from += step;
      }
      _cachedData = all;
      return all;
    } finally {
      // Always clear the in-flight promise so retries work after errors
      _fetchPromise = null;
    }
  })();

  return _fetchPromise;
}

// Map Fornas sediaan form to prescription route
function formToRoute(form) {
  if (!form) return 'oral';
  const f = form.toUpperCase();
  if (/INJEKSI|INFUS|VIAL|AMPUL/.test(f)) return 'iv';
  if (/SALEP|KRIM|GEL|LOTION|PATCH|TOPIKAL|CREAM/.test(f)) return 'topikal';
  if (/INHALER|NEBULIZER|AEROSOL/.test(f)) return 'inhalasi';
  return 'oral'; // tablet, kapsul, kaplet, sirup, suspensi, puyer, suppositoria, dll
}

// ── Small helpers ─────────────────────────────────────────────────────────────
function FlagBadge({ flagKey }) {
  const f = FLAGS.find(x => x.key === flagKey);
  if (!f) return null;
  return (
    <span
      title={f.title}
      className={`inline-flex items-center rounded-full font-medium text-[10px] px-1.5 py-0.5 border ${FLAG_COLORS[f.color]}`}
    >
      {f.label}
    </span>
  );
}

function highlight(text, query) {
  if (!query || !text) return text ?? '';
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const parts = String(text).split(new RegExp(`(${escaped})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-yellow-900 dark:text-yellow-200 rounded px-0.5">{part}</mark>
      : part
  );
}

// ── Filter Chip ───────────────────────────────────────────────────────────────
function Chip({ active, onClick, children, color }) {
  const base = 'flex items-center gap-1 px-2.5 py-1.5 rounded-full text-[11px] font-semibold transition whitespace-nowrap cursor-pointer select-none border shrink-0';
  const activeStyle = color
    ? `${FLAG_COLORS[color]} border-transparent`
    : 'bg-primary text-white border-transparent shadow-sm';
  const inactiveStyle = 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-400 border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:text-primary';
  return (
    <button type="button" onClick={onClick} className={`${base} ${active ? activeStyle : inactiveStyle}`}>
      {children}
    </button>
  );
}

// ── Drug Row ──────────────────────────────────────────────────────────────────
function PickerRow({ drug, query, onSelect }) {
  const activeFlags = FLAGS.filter(f => drug[f.key] === true);
  const sedaaanLabel = drug.label
    || `${drug.form ?? ''}${drug.strength ? ' ' + drug.strength : ''}${drug.unit ? ' ' + drug.unit : ''}`.trim();

  return (
    <button
      type="button"
      onClick={() => onSelect(drug)}
      className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group"
    >
      {/* Icon */}
      <div className="shrink-0 w-8 h-8 rounded-lg bg-teal-50 dark:bg-teal-900/20 flex items-center justify-center">
        <span className="material-symbols-outlined text-teal-500 dark:text-teal-400 text-base">medication</span>
      </div>

      {/* Content */}
      <div className="flex-1 min-w-0">
        <div className="flex items-baseline gap-1.5 flex-wrap">
          <span className="font-semibold text-sm text-slate-800 dark:text-slate-100 capitalize leading-snug">
            {highlight(drug.name?.toLowerCase(), query?.toLowerCase())}
          </span>
          {drug.name_international && drug.name_international.toLowerCase() !== drug.name?.toLowerCase() && (
            <span className="text-[11px] text-slate-400 italic leading-snug shrink-0">
              {highlight(drug.name_international, query)}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5 truncate">
          {highlight(sedaaanLabel, query)}
          {drug.category_l1 && (
            <span className="text-slate-400 dark:text-slate-500"> · {drug.category_l1}</span>
          )}
        </p>
      </div>

      {/* Flags (desktop) */}
      <div className="hidden sm:flex items-center gap-1 shrink-0">
        {activeFlags.slice(0, 3).map(f => <FlagBadge key={f.key} flagKey={f.key} />)}
        {activeFlags.length > 3 && <span className="text-[10px] text-slate-400 shrink-0">+{activeFlags.length - 3}</span>}
      </div>

      <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-primary transition text-lg shrink-0 ml-1">add_circle</span>
    </button>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
/**
 * FornasDrugPicker — reusable modal for selecting a drug from the Fornas database.
 * Props:
 *   onSelect(drugFields) — called with pre-filled prescription fields
 *   onClose() — called when modal is dismissed
 *
 * drugFields shape: { name, dosage, frequency:'', route, fornas_source:true, fornas_form, fornas_category }
 */
export default function FornasDrugPicker({ onSelect, onClose }) {
  const { isOnline } = useOffline();
  const [allData, setAllData]   = useState([]);
  const [loading, setLoading]   = useState(true);
  const [error, setError]       = useState(null);
  const [query, setQuery]       = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFlag, setActiveFlag] = useState(null);
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const debounceRef = useRef(null);
  const inputRef    = useRef(null);

  // Load data (uses singleton cache); extracted so retry button can call it
  const load = useCallback(() => {
    setLoading(true);
    setError(null);
    loadFornasDrugs()
      .then(data => { setAllData(data); setLoading(false); })
      .catch(err  => { setError(err.message); setLoading(false); });
  }, []);

  useEffect(() => {
    load();
    setTimeout(() => inputRef.current?.focus(), 80);
  }, [load]);

  // Debounce search 250ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setDisplayCount(PAGE_SIZE);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Reset pagination when flag filter changes
  useEffect(() => { setDisplayCount(PAGE_SIZE); }, [activeFlag]);

  // Escape closes
  useEffect(() => {
    const handler = e => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  // Filter
  const filtered = allData.filter(drug => {
    if (activeFlag && !drug[activeFlag]) return false;
    if (!debouncedQuery.trim()) return true;
    const q = debouncedQuery.toLowerCase();
    return (
      drug.name?.toLowerCase().includes(q) ||
      drug.name_international?.toLowerCase().includes(q) ||
      drug.label?.toLowerCase().includes(q) ||
      drug.form?.toLowerCase().includes(q) ||
      drug.category_l1?.toLowerCase().includes(q) ||
      drug.category_l2?.toLowerCase().includes(q)
    );
  });

  const visible = filtered.slice(0, displayCount);
  const hasMore = displayCount < filtered.length;

  const handleSelect = useCallback(drug => {
    const dosage = [drug.strength, drug.unit].filter(Boolean).join(' ');
    onSelect({
      name:            drug.name ?? '',
      dosage:          dosage,
      frequency:       '',
      route:           formToRoute(drug.form),
      fornas_source:   true,
      fornas_form:     drug.form ?? '',
      fornas_category: [drug.category_l1, drug.category_l2].filter(Boolean).join(' › '),
    });
    onClose();
  }, [onSelect, onClose]);

  const totalLabel = loading ? '' : `${allData.length.toLocaleString()} sediaan`;

  return (
    <>
      {/* Backdrop */}
      <div className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm" onClick={onClose} />

      {/* Sheet — bottom on mobile, centered on sm+ */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 sm:inset-0 sm:flex sm:items-center sm:justify-center sm:p-4"
        style={{ pointerEvents: 'none' }}
      >
        <div
          className="w-full sm:max-w-lg bg-white dark:bg-slate-900 rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col overflow-hidden sm:mx-auto"
          style={{ maxHeight: '88dvh', pointerEvents: 'auto', animation: 'slideUp 0.22s ease-out' }}
          onClick={e => e.stopPropagation()}
        >
          {/* Handle bar — mobile only */}
          <div className="flex justify-center pt-3 pb-1 shrink-0 sm:hidden">
            <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
          </div>

          {/* Header */}
          <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
            <div className="bg-teal-100 dark:bg-teal-900/30 rounded-xl p-2 shrink-0">
              <span className="material-symbols-outlined text-teal-600 dark:text-teal-400 text-lg">local_pharmacy</span>
            </div>
            <div className="flex-1 min-w-0">
              <p className="font-bold text-slate-900 dark:text-slate-100 text-sm">Pilih Obat Fornas</p>
              {!loading && <p className="text-[11px] text-slate-400">{totalLabel} · Formularium Nasional Kemenkes RI</p>}
            </div>
            <button
              type="button"
              onClick={onClose}
              className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1.5 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0"
            >
              <span className="material-symbols-outlined text-xl">close</span>
            </button>
          </div>

          {/* Search */}
          <div className="px-4 pt-3 pb-2 shrink-0">
            <div className="relative">
              <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
              <input
                ref={inputRef}
                type="text"
                value={query}
                onChange={e => setQuery(e.target.value)}
                placeholder="Cari nama obat, sediaan, atau kelas terapi..."
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
              {query && (
                <button
                  type="button"
                  onClick={() => setQuery('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
                >
                  <span className="material-symbols-outlined text-lg">close</span>
                </button>
              )}
            </div>
          </div>

          {/* Flag filter chips */}
          {!loading && !error && (
            <div className="flex items-center gap-1.5 px-4 pb-2.5 overflow-x-auto scrollbar-hide shrink-0">
              <Chip active={activeFlag === null} onClick={() => setActiveFlag(null)}>
                <span className="material-symbols-outlined text-[12px]">apps</span>
                Semua
              </Chip>
              {FLAGS.map(f => (
                <Chip
                  key={f.key}
                  active={activeFlag === f.key}
                  color={f.color}
                  onClick={() => setActiveFlag(prev => prev === f.key ? null : f.key)}
                >
                  {f.label}
                </Chip>
              ))}
            </div>
          )}

          {/* Count line */}
          {!loading && !error && (debouncedQuery || activeFlag) && (
            <div className="flex items-center justify-between gap-2 px-4 pb-2 shrink-0">
              <p className="text-[11px] text-slate-400">
                <span className="font-semibold text-primary">{filtered.length.toLocaleString()}</span> hasil
                {debouncedQuery ? ` untuk "${debouncedQuery}"` : ''}
              </p>
              <button
                type="button"
                onClick={() => { setQuery(''); setActiveFlag(null); }}
                className="text-[11px] text-slate-400 hover:text-red-500 flex items-center gap-0.5 transition"
              >
                <span className="material-symbols-outlined text-sm">filter_list_off</span>
                Reset
              </button>
            </div>
          )}

          {/* Divider */}
          <div className="border-t border-slate-100 dark:border-slate-800 shrink-0" />

          {/* Results */}
          <div className="flex-1 overflow-y-auto overscroll-contain">
            {loading && (
              <div className="space-y-2 p-4">
                {Array.from({ length: 6 }).map((_, i) => (
                  <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
                ))}
                <p className="text-center text-xs text-slate-400 pt-2">Memuat data Fornas...</p>
              </div>
            )}

            {error && (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-3">
                {!isOnline ? (
                  <>
                    <span className="material-symbols-outlined text-5xl text-amber-400">wifi_off</span>
                    <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Tidak ada koneksi internet</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 max-w-xs leading-relaxed">
                      Data Fornas memerlukan koneksi internet pada akses pertama. Sambungkan internet lalu coba lagi.
                    </p>
                  </>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-5xl text-red-400">error_outline</span>
                    <p className="text-sm font-bold text-red-500 dark:text-red-400">Gagal memuat data Fornas</p>
                    <p className="text-xs text-slate-400 max-w-xs">{error}</p>
                  </>
                )}
                <button
                  type="button"
                  onClick={load}
                  className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-primary text-white text-xs font-bold hover:brightness-110 transition shadow-md shadow-primary/20"
                >
                  <span className="material-symbols-outlined text-sm">refresh</span>
                  Coba Lagi
                </button>
              </div>
            )}

            {!loading && !error && filtered.length === 0 && (
              <div className="flex flex-col items-center justify-center py-12 text-slate-400 dark:text-slate-500 px-4 text-center">
                <span className="material-symbols-outlined text-5xl mb-2">medication_liquid</span>
                <p className="text-sm font-medium">
                  {debouncedQuery ? `Tidak ditemukan untuk "${debouncedQuery}"` : 'Tidak ada hasil untuk filter ini'}
                </p>
                <p className="text-xs mt-1">Coba kata kunci atau filter yang berbeda</p>
              </div>
            )}

            {!loading && !error && filtered.length > 0 && (
              <div className="divide-y divide-slate-50 dark:divide-slate-800/80">
                {visible.map(drug => (
                  <PickerRow
                    key={drug.sks_id ?? drug.id}
                    drug={drug}
                    query={debouncedQuery}
                    onSelect={handleSelect}
                  />
                ))}

                {hasMore && (
                  <button
                    type="button"
                    onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                    className="w-full py-3 text-xs text-primary font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
                  >
                    <span className="material-symbols-outlined text-sm">expand_more</span>
                    Tampilkan lebih banyak ({(filtered.length - displayCount).toLocaleString()} lagi)
                  </button>
                )}
              </div>
            )}
          </div>

          {/* Footer note */}
          <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-800 shrink-0 flex items-center justify-between gap-2">
            <p className="text-[10px] text-slate-400">Sumber: e-fornas.kemkes.go.id · Kemenkes RI</p>
            <div className="flex items-center gap-2">
              {!isOnline && allData.length > 0 && (
                <span className="inline-flex items-center gap-0.5 text-[10px] text-amber-500">
                  <span className="material-symbols-outlined text-[11px]">wifi_off</span>
                  Cache
                </span>
              )}
              <p className="text-[10px] text-slate-400">Frekuensi diisi manual</p>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
