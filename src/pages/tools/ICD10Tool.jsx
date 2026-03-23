import { useState, useEffect, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { loadICD10, searchICD10, clearICD10MemoryCache } from '../../utils/icd10Data';
import {
  cacheAllICD10FromSource,
  clearICD10Cache,
  getCachedICD10All,
  getICD10CacheMeta,
  isICD10Cached,
  refreshICD10Cache,
} from '../../services/icd10CacheService';
import { useOffline } from '../../context/OfflineContext';

const PAGE_SIZE = 50;

function useCopyToClipboard() {
  const [copiedCode, setCopiedCode] = useState(null);
  const copy = useCallback((text) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedCode(text);
      setTimeout(() => setCopiedCode(null), 1800);
    });
  }, []);
  return { copiedCode, copy };
}

export default function ICD10Tool() {
  const navigate = useNavigate();
  const { isOnline } = useOffline();
  const [allData, setAllData] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [displayCount, setDisplayCount] = useState(PAGE_SIZE);
  const [cacheMeta, setCacheMeta] = useState(null);
  const [cacheWarning, setCacheWarning] = useState(null);
  const [isPreparingCache, setIsPreparingCache] = useState(false);
  const [isAutoRefreshingCache, setIsAutoRefreshingCache] = useState(false);
  const debounceRef = useRef(null);
  const refreshInFlightRef = useRef(false);
  const { copiedCode, copy } = useCopyToClipboard();

  const loadAllData = useCallback(async () => {
    setLoading(true);
    setError(null);
    setCacheWarning(null);

    try {
      const [meta, hasCache] = await Promise.all([
        getICD10CacheMeta(),
        isICD10Cached(),
      ]);
      setCacheMeta(meta);

      if (hasCache) {
        const cachedRows = await getCachedICD10All();
        if (cachedRows.length > 0) {
          setAllData(cachedRows);
          setLoading(false);

          if (isOnline && !refreshInFlightRef.current) {
            refreshInFlightRef.current = true;
            setIsAutoRefreshingCache(true);
            refreshICD10Cache()
              .then(({ rows, meta: freshMeta }) => {
                if (rows.length > 0) {
                  setAllData(rows);
                  setCacheMeta({ key: 'icd10CacheMeta', ...freshMeta });
                }
              })
              .catch((err) => {
                console.warn('[ICD10Tool] Auto refresh cache failed', {
                  error: err?.message || String(err || 'unknown'),
                });
                setCacheWarning('Update otomatis cache ICD-10 gagal. Data lokal masih digunakan.');
              })
              .finally(() => {
                setIsAutoRefreshingCache(false);
                refreshInFlightRef.current = false;
              });
          }
          return;
        }
      }

      if (!isOnline) {
        throw new Error('Offline tanpa cache ICD-10. Silakan unduh cache saat online terlebih dahulu.');
      }

      const data = await loadICD10();
      setAllData(data);
      const freshMeta = await getICD10CacheMeta();
      setCacheMeta(freshMeta);
      setLoading(false);
    } catch (err) {
      setError(err.message);
      setLoading(false);
    }
  }, [isOnline]);

  useEffect(() => {
    loadAllData();
  }, [loadAllData]);

  const handlePrepareOfflineCache = useCallback(async () => {
    if (!isOnline) return;
    setIsPreparingCache(true);
    setError(null);
    setCacheWarning(null);

    try {
      const { rows, meta } = await cacheAllICD10FromSource();
      setAllData(rows);
      setCacheMeta({ key: 'icd10CacheMeta', ...meta });
    } catch (err) {
      setError(err.message);
    } finally {
      setIsPreparingCache(false);
    }
  }, [isOnline]);

  const handleClearOfflineCache = useCallback(async () => {
    await clearICD10Cache();
    clearICD10MemoryCache();
    setCacheMeta(null);
    setCacheWarning(null);
    if (!isOnline) {
      setAllData([]);
      setError('Cache ICD-10 telah dihapus. Sambungkan internet untuk memuat data kembali.');
    }
  }, [isOnline]);

  // Debounce search 300ms
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setDebouncedQuery(query);
      setDisplayCount(PAGE_SIZE);
    }, 300);
    return () => clearTimeout(debounceRef.current);
  }, [query]);

  const results = searchICD10(allData, debouncedQuery);
  const visible = results.slice(0, displayCount);
  const hasMore = displayCount < results.length;

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      {/* ── Breadcrumb + Header ── */}
      <div className="mb-5">
        <button
          onClick={() => navigate('/tools')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition mb-3"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
          Tools
        </button>
        <div className="flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex items-center gap-3">
            <div className="bg-blue-100 dark:bg-blue-900/30 rounded-xl p-2.5 shrink-0">
              <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-2xl">qr_code_2</span>
            </div>
            <div>
              <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">ICD-10 e-Klaim</h1>
              <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Pencarian kode penyakit untuk klaim BPJS Kesehatan</p>
            </div>
          </div>
          <span className="self-start sm:self-center sm:ml-auto text-xs bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 px-3 py-1 rounded-full font-medium shrink-0">
            ICD-10 e-Klaim BPJS Indonesia
          </span>
        </div>
      </div>

      {/* Cache controls */}
      <div className="mb-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 px-4 py-3">
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 sm:justify-between">
          <div>
            <p className="text-xs font-semibold text-slate-600 dark:text-slate-300 uppercase tracking-wide">ICD-10 Offline Cache</p>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
              {cacheMeta?.count
                ? `Cached ${Number(cacheMeta.count).toLocaleString()} kode · ${cacheMeta.syncSource === 'auto' ? 'update otomatis' : 'update manual'} ${new Date(cacheMeta.updatedAt).toLocaleString('id-ID')}`
                : 'Belum ada cache penuh. Unduh sekali saat online untuk akses offline penuh.'}
            </p>
            {(isAutoRefreshingCache || cacheMeta?.syncSource === 'auto') && (
              <p className="mt-1 flex items-center gap-1.5 text-[11px] text-blue-600 dark:text-blue-400">
                <span className="material-symbols-outlined text-[13px]">
                  {isAutoRefreshingCache ? 'sync' : 'cloud_done'}
                </span>
                {isAutoRefreshingCache
                  ? 'Sinkron otomatis online sedang berjalan'
                  : `Diperbarui otomatis saat online · ${new Date(cacheMeta.updatedAt).toLocaleString('id-ID')}`}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={handlePrepareOfflineCache}
              disabled={!isOnline || isPreparingCache}
              className="px-3 py-2 rounded-lg bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300 text-xs font-medium hover:bg-blue-200 dark:hover:bg-blue-900/50 disabled:opacity-50 disabled:cursor-not-allowed transition"
            >
              {isPreparingCache ? 'Mengunduh...' : 'Unduh untuk offline'}
            </button>
            {cacheMeta?.count ? (
              <button
                onClick={handleClearOfflineCache}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
              >
                Hapus cache
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {!isOnline && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400">
          <span className="material-symbols-outlined text-base shrink-0">wifi_off</span>
          <p className="text-xs font-medium">
            {allData.length > 0
              ? 'Mode offline aktif: data berasal dari cache ICD-10 lokal.'
              : 'Tidak ada koneksi. Data ICD-10 belum tersedia di cache.'}
          </p>
        </div>
      )}

      {cacheWarning && !error && (
        <div className="flex items-center gap-2 px-4 py-2.5 mb-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-400">
          <span className="material-symbols-outlined text-base shrink-0">warning</span>
          <p className="text-xs font-medium">{cacheWarning}</p>
        </div>
      )}

      {/* ── Search bar ── */}
      <div className="relative mb-4">
        <span className="material-symbols-outlined absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">search</span>
        <input
          type="text"
          value={query}
          onChange={e => setQuery(e.target.value)}
          placeholder="Cari kode ICD-10 atau nama penyakit... (contoh: A01, typhoid, diabetes)"
          className="w-full pl-11 pr-10 py-3.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-sm"
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition"
          >
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        )}
      </div>

      {/* ── Stats bar ── */}
      {!loading && !error && (
        <div className="flex items-center gap-4 mb-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <span className="material-symbols-outlined text-sm">database</span>
            {allData.length.toLocaleString()} kode tersedia
          </span>
          {debouncedQuery && (
            <span className="flex items-center gap-1 text-primary font-medium">
              <span className="material-symbols-outlined text-sm">filter_list</span>
              {results.length.toLocaleString()} hasil ditemukan
            </span>
          )}
        </div>
      )}

      {/* ── Loading State ── */}
      {loading && (
        <div className="space-y-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <div key={i} className="h-12 bg-slate-100 dark:bg-slate-800 rounded-xl animate-pulse" style={{ opacity: 1 - i * 0.1 }} />
          ))}
          <p className="text-center text-sm text-slate-400 mt-4">Memuat data ICD-10...</p>
        </div>
      )}

      {/* ── Error State ── */}
      {error && (
        <div className="flex flex-col items-center justify-center py-16 text-center gap-3">
          <span className="material-symbols-outlined text-4xl text-red-400">error_outline</span>
          <p className="text-sm font-medium text-red-600 dark:text-red-400">Gagal memuat data ICD-10</p>
          <p className="text-xs text-slate-400">{error}</p>
        </div>
      )}

      {/* ── Results Table ── */}
      {!loading && !error && (
        <>
          {results.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-slate-400 dark:text-slate-500">
              <span className="material-symbols-outlined text-5xl mb-3">search_off</span>
              <p className="text-sm font-medium">Tidak ditemukan untuk &quot;{debouncedQuery}&quot;</p>
              <p className="text-xs mt-1">Coba dengan kata kunci atau kode yang berbeda</p>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 dark:border-slate-700 overflow-hidden bg-white dark:bg-slate-800/50">
              {/* Table header — desktop */}
              <div className="hidden sm:grid grid-cols-[140px_1fr_auto] gap-0 bg-slate-50 dark:bg-slate-800 border-b border-slate-200 dark:border-slate-700 text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wider px-4 py-2.5">
                <span>Kode ICD-10</span>
                <span>Nama Penyakit</span>
                <span>Aksi</span>
              </div>

              {/* Rows */}
              <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
                {visible.map(item => (
                  <ICD10Row key={item.code} item={item} copy={copy} copiedCode={copiedCode} query={debouncedQuery} />
                ))}
              </div>

              {/* Load more */}
              {hasMore && (
                <div className="flex items-center justify-between px-4 py-3 bg-slate-50 dark:bg-slate-800 border-t border-slate-200 dark:border-slate-700">
                  <span className="text-xs text-slate-400">
                    Menampilkan {visible.length} dari {results.length.toLocaleString()}
                  </span>
                  <button
                    onClick={() => setDisplayCount(c => c + PAGE_SIZE)}
                    className="text-xs font-medium text-primary hover:text-primary/80 flex items-center gap-1 transition"
                  >
                    <span className="material-symbols-outlined text-sm">expand_more</span>
                    Tampilkan lebih banyak
                  </button>
                </div>
              )}
            </div>
          )}

          {/* Footer */}
          <p className="mt-6 text-center text-xs text-slate-400 dark:text-slate-500">
            Sumber: ICD-10 e-Klaim BPJS Indonesia · Versi ICD-10 2010
          </p>
        </>
      )}
    </div>
  );
}

function highlight(text, query) {
  if (!query) return text;
  const parts = text.split(new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi'));
  return parts.map((part, i) =>
    part.toLowerCase() === query.toLowerCase()
      ? <mark key={i} className="bg-yellow-200 dark:bg-yellow-700/50 text-yellow-900 dark:text-yellow-200 rounded px-0.5">{part}</mark>
      : part
  );
}

function ICD10Row({ item, copy, copiedCode, query }) {
  const isCopied = copiedCode === item.code;
  return (
    <div className="grid grid-cols-1 sm:grid-cols-[140px_1fr_auto] gap-1 sm:gap-0 px-4 py-3 hover:bg-slate-50 dark:hover:bg-slate-700/30 transition group items-center">
      {/* Code */}
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-primary text-sm">{highlight(item.code, query)}</span>
      </div>
      {/* Display */}
      <div className="text-sm text-slate-700 dark:text-slate-300 sm:pr-4 leading-relaxed">
        {highlight(item.display, query)}
      </div>
      {/* Actions */}
      <div className="flex items-center gap-1.5">
        <button
          onClick={() => copy(item.code)}
          title="Salin kode"
          className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-medium transition
            ${isCopied
              ? 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400'
              : 'bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary dark:hover:bg-primary/20 dark:hover:text-primary'
            }`}
        >
          <span className="material-symbols-outlined text-[14px]">{isCopied ? 'check' : 'content_copy'}</span>
          <span className="hidden sm:inline">{isCopied ? 'Tersalin!' : 'Salin'}</span>
        </button>
      </div>
    </div>
  );
}
