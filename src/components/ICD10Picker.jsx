import { useState, useEffect, useCallback, useRef } from 'react';
import { loadICD10, searchICD10 } from '../utils/icd10Data';

const PAGE_SIZE = 50;

/**
 * ICD10Picker — reusable modal for selecting an ICD-10 code.
 * Props:
 *   onSelect(code: string, display: string) — called when user picks a code
 *   onClose() — called when modal is dismissed
 */
export default function ICD10Picker({ onSelect, onClose }) {
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const debounceRef = useRef(null);
  const inputRef = useRef(null);

  useEffect(() => {
    loadICD10()
      .then(data => { setAllData(data); setLoading(false); })
      .catch(err => { setError(err.message); setLoading(false); });
    // Focus search on mount
    setTimeout(() => inputRef.current?.focus(), 50);
  }, []);

  // Debounce query 250ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setDisplayCount(PAGE_SIZE);
    }, 250);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  // Escape closes modal
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') onClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [onClose]);

  const results = searchICD10(allData, debouncedQuery);
  const visible = results.slice(0, displayCount);

  const handleSelect = useCallback((item) => {
    onSelect(item.code, item.display);
    onClose();
  }, [onSelect, onClose]);

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 z-50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Sheet */}
      <div
        className="fixed bottom-0 left-0 right-0 z-50 bg-white dark:bg-slate-900 rounded-t-2xl shadow-2xl flex flex-col"
        style={{ maxHeight: '85dvh', animation: 'slideUp 0.2s ease-out' }}
        onClick={e => e.stopPropagation()}
      >
        {/* Handle bar */}
        <div className="flex justify-center pt-3 pb-1 shrink-0">
          <div className="w-10 h-1 rounded-full bg-slate-200 dark:bg-slate-700" />
        </div>

        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="bg-blue-100 dark:bg-blue-900/30 rounded-xl p-2 shrink-0">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-lg">qr_code_2</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">Pilih Kode ICD-10</p>
            {!loading && <p className="text-xs text-slate-400">{allData.length.toLocaleString()} kode tersedia</p>}
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition p-1 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        </div>

        {/* Search */}
        <div className="px-4 py-3 border-b border-slate-100 dark:border-slate-800 shrink-0">
          <div className="relative">
            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-lg pointer-events-none">search</span>
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={e => setQuery(e.target.value)}
              placeholder="Cari kode atau nama penyakit..."
              className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
            />
            {query && (
              <button
                onClick={() => setQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
              >
                <span className="material-symbols-outlined text-lg">close</span>
              </button>
            )}
          </div>
          {debouncedQuery && !loading && (
            <p className="mt-1.5 text-xs text-slate-400 px-1">
              {results.length.toLocaleString()} hasil untuk &quot;{debouncedQuery}&quot;
            </p>
          )}
        </div>

        {/* Results */}
        <div className="flex-1 overflow-y-auto">
          {loading && (
            <div className="space-y-2 p-4">
              {Array.from({ length: 6 }).map((_, i) => (
                <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.12 }} />
              ))}
              <p className="text-center text-xs text-slate-400 pt-2">Memuat data ICD-10...</p>
            </div>
          )}

          {error && (
            <div className="flex flex-col items-center justify-center py-12 px-4 text-center gap-2">
              <span className="material-symbols-outlined text-3xl text-red-400">error_outline</span>
              <p className="text-sm text-red-500">{error}</p>
            </div>
          )}

          {!loading && !error && results.length === 0 && (
            <div className="flex flex-col items-center justify-center py-12 text-slate-400">
              <span className="material-symbols-outlined text-4xl mb-2">search_off</span>
              <p className="text-sm">Tidak ditemukan untuk &quot;{debouncedQuery}&quot;</p>
            </div>
          )}

          {!loading && !error && results.length > 0 && (
            <div className="divide-y divide-slate-50 dark:divide-slate-800">
              {visible.map(item => (
                <button
                  key={item.code}
                  onClick={() => handleSelect(item)}
                  className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800/60 transition group"
                >
                  <span className="font-mono font-bold text-primary text-sm w-16 shrink-0">{item.code}</span>
                  <span className="flex-1 text-sm text-slate-700 dark:text-slate-300 leading-snug">{item.display}</span>
                  <span className="material-symbols-outlined text-slate-300 group-hover:text-primary text-lg shrink-0 transition">add_circle</span>
                </button>
              ))}

              {displayCount < results.length && (
                <button
                  onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                  className="w-full py-3 text-xs text-primary font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition flex items-center justify-center gap-1"
                >
                  <span className="material-symbols-outlined text-sm">expand_more</span>
                  Tampilkan lebih banyak ({results.length - displayCount} lagi)
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </>
  );
}
