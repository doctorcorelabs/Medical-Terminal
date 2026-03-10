import { useState, useRef, useEffect, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { supabase } from '../../services/supabaseClient';

const MAX_DRUGS = 10;
const PREVIEW_LENGTH = 300;
const RECENT_FETCH_LIMIT = 20;
const RECENT_MAX_DISPLAY = 10;

// ── Cache helpers ──────────────────────────────────────────────
function makeKey(drugs) {
  return [...drugs].map(d => d.toLowerCase()).sort().join('|');
}

async function loadFromCache(drugs) {
  const key = makeKey(drugs);
  const { data, error } = await supabase
    .from('drug_interaction_cache')
    .select('*')
    .eq('drug_key', key)
    .maybeSingle();
  if (error || !data) return null;
  return data;
}

async function saveToCache(drugs, interactions) {
  const key = makeKey(drugs);
  await supabase.from('drug_interaction_cache').upsert({
    drug_key: key,
    drugs,
    interactions,
    checked_at: new Date().toISOString(),
  }, { onConflict: 'drug_key' });
}

async function updateSummaryInCache(drugKey, pair, summary) {
  const { data } = await supabase
    .from('drug_interaction_cache')
    .select('interactions')
    .eq('drug_key', drugKey)
    .maybeSingle();
  if (!data) return;
  const updated = (data.interactions || []).map(item => {
    if (item.pair && item.pair[0] === pair[0] && item.pair[1] === pair[1]) {
      return { ...item, ai_summary: summary };
    }
    return item;
  });
  await supabase
    .from('drug_interaction_cache')
    .update({ interactions: updated })
    .eq('drug_key', drugKey);
}

// ── Relative time ──────────────────────────────────────────────
function relativeTime(isoString) {
  const diff = Date.now() - new Date(isoString).getTime();
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return 'Baru saja';
  if (minutes < 60) return `${minutes} menit lalu`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} jam lalu`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} hari lalu`;
  const months = Math.floor(days / 30);
  return `${months} bulan lalu`;
}

// Colour palette for drug chips
const CHIP_COLORS = [
  'bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-700',
  'bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-700',
  'bg-violet-100 dark:bg-violet-900/40 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-700',
  'bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-700',
  'bg-rose-100 dark:bg-rose-900/40 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-700',
  'bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-700',
  'bg-fuchsia-100 dark:bg-fuchsia-900/40 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-700',
  'bg-teal-100 dark:bg-teal-900/40 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-700',
  'bg-orange-100 dark:bg-orange-900/40 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-700',
  'bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-700',
];

function chipColor(index) {
  return CHIP_COLORS[index % CHIP_COLORS.length];
}

function SeverityBadge({ severity }) {
  const s = (severity || '').toLowerCase();
  const map = {
    major:     'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400',
    moderate:  'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400',
    minor:     'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-700 dark:text-yellow-400',
    unknown:   'bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-400',
  };
  const cls = map[s] ?? map.unknown;
  return (
    <span className={`text-[11px] font-semibold px-2 py-0.5 rounded-full ${cls}`}>
      {severity || 'Unknown'}
    </span>
  );
}

function InteractionCard({ item, initialSummary, onSummaryFetched }) {
  const [expanded, setExpanded] = useState(false);
  const [summary, setSummary] = useState(initialSummary || null);
  const [summaryLoading, setSummaryLoading] = useState(false);
  const [summaryError, setSummaryError] = useState('');

  // Sync when parent provides a cached summary (e.g., loading from history)
  useEffect(() => {
    if (initialSummary) setSummary(initialSummary);
  }, [initialSummary]);

  const desc = item.description || '';
  const isLong = desc.length > PREVIEW_LENGTH;
  const displayed = expanded || !isLong ? desc : desc.slice(0, PREVIEW_LENGTH) + '…';

  const fetchSummary = async () => {
    if (summary || summaryLoading) return;
    setSummaryLoading(true);
    setSummaryError('');
    try {
      const res = await fetch('/.netlify/functions/summarize-interaction', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: desc, pair: item.pair }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSummaryError(data.error || 'Gagal membuat ringkasan.');
        return;
      }
      setSummary(data.summary);
      if (onSummaryFetched) onSummaryFetched(item.pair, data.summary);
    } catch {
      setSummaryError('Gagal terhubung ke server.');
    } finally {
      setSummaryLoading(false);
    }
  };

  return (
    <div className="rounded-2xl border border-orange-200 dark:border-orange-800/50 bg-orange-50/50 dark:bg-orange-900/10 p-5">
      {/* ── Pair header ── */}
      <div className="flex items-start justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{item.pair[0]}</span>
          <span className="material-symbols-outlined text-orange-500 text-base">sync_alt</span>
          <span className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{item.pair[1]}</span>
        </div>
        {item?.severity && item.severity.toLowerCase() !== 'unknown' && (
          <SeverityBadge severity={item.severity} />
        )}
      </div>

      {/* ── Description ── */}
      <div className="text-xs text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap text-justify">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>{displayed}</ReactMarkdown>
      </div>

      {/* ── Footer: expand + AI summary button ── */}
      <div className="flex items-center justify-between mt-2 gap-2">
        <div>
          {isLong && (
            <button
              onClick={() => setExpanded(e => !e)}
              className="text-xs text-primary hover:underline font-medium"
            >
              {expanded ? 'Sembunyikan' : 'Lihat selengkapnya'}
            </button>
          )}
        </div>
        <button
          onClick={fetchSummary}
          disabled={summaryLoading || !!summary}
          className="flex items-center gap-1 text-xs px-2.5 py-1 rounded-lg bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 hover:bg-violet-200 dark:hover:bg-violet-900/50 font-medium disabled:opacity-50 disabled:cursor-not-allowed transition shrink-0"
        >
          {summaryLoading ? (
            <>
              <span className="material-symbols-outlined text-[13px] animate-spin">progress_activity</span>
              Meringkas…
            </>
          ) : (
            <>
              <span className="material-symbols-outlined text-[13px]">auto_awesome</span>
              {summary ? 'Diringkas' : 'Ringkasan AI'}
            </>
          )}
        </button>
      </div>

      {/* ── Summary error ── */}
      {summaryError && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
          <span className="material-symbols-outlined text-[13px]">error</span>
          {summaryError}
        </p>
      )}

      {/* ── Summary box ── */}
      {summary && (
        <div className="mt-3 rounded-xl bg-violet-50 dark:bg-violet-900/20 border border-violet-200 dark:border-violet-800/50 px-4 py-3">
          <div className="flex items-center gap-1.5 mb-2">
            <span className="material-symbols-outlined text-violet-500 text-[14px]">auto_awesome</span>
            <span className="text-[11px] font-semibold text-violet-600 dark:text-violet-400 uppercase tracking-wider">Ringkasan AI</span>
          </div>
          <div className="text-xs text-slate-700 dark:text-slate-300 leading-relaxed text-justify whitespace-pre-wrap">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{summary}</ReactMarkdown>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Recent Panel ──────────────────────────────────────────────
function RecentPanel({ entries, loading, onSelect }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden flex flex-col">
      {/* Panel header */}
      <div className="flex items-center gap-2 px-4 py-3 border-b border-slate-100 dark:border-slate-700/60 bg-slate-50/80 dark:bg-slate-800/80">
        <span className="material-symbols-outlined text-amber-500 text-[18px]">history</span>
        <span className="text-xs font-bold text-slate-700 dark:text-slate-200 uppercase tracking-wider flex-1">
          Obat Terbaru Dianalisis
        </span>
        {!loading && entries.length > 0 && (
          <span className="text-[10px] font-semibold bg-amber-100 dark:bg-amber-900/30 text-amber-600 dark:text-amber-400 px-2 py-0.5 rounded-full">
            {entries.length}
          </span>
        )}
      </div>

      {/* Body */}
      <div className="flex-1 overflow-y-auto max-h-120 lg:max-h-140">
        {loading ? (
          <div className="p-3 space-y-2.5">
            {[1, 2, 3].map(i => (
              <div key={i} className="rounded-xl border border-slate-100 dark:border-slate-700/50 p-3 animate-pulse">
                <div className="flex gap-1.5 mb-2">
                  <div className="h-5 w-16 bg-slate-200 dark:bg-slate-700 rounded-full" />
                  <div className="h-5 w-3 bg-slate-100 dark:bg-slate-800 rounded-full" />
                  <div className="h-5 w-14 bg-slate-200 dark:bg-slate-700 rounded-full" />
                </div>
                <div className="flex justify-between">
                  <div className="h-4 w-20 bg-slate-100 dark:bg-slate-700/50 rounded-full" />
                  <div className="h-4 w-14 bg-slate-100 dark:bg-slate-700/50 rounded-full" />
                </div>
              </div>
            ))}
          </div>
        ) : entries.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-10 px-4 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2">history_toggle_off</span>
            <p className="text-xs text-slate-400 dark:text-slate-500">Belum ada data analisis tersimpan.</p>
          </div>
        ) : (
          <div className="p-3 space-y-2">
            {entries.map((entry, idx) => (
              <button
                key={entry.drug_key}
                onClick={() => onSelect(entry)}
                className="w-full text-left rounded-xl border border-slate-100 dark:border-slate-700/50 bg-slate-50/60 dark:bg-slate-900/30 hover:bg-amber-50 dark:hover:bg-amber-900/10 hover:border-amber-200 dark:hover:border-amber-800/50 p-3 transition group"
              >
                {/* Drug chips */}
                <div className="flex flex-wrap gap-1 mb-2">
                  {entry.drugs.map((drug, di) => (
                    <span
                      key={di}
                      className={`inline-flex items-center px-2 py-0.5 rounded-full border text-[10px] font-medium ${chipColor(di)}`}
                    >
                      {drug}
                    </span>
                  ))}
                </div>
                {/* Meta row */}
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1">
                    <span className="material-symbols-outlined text-orange-400 text-[12px]">warning</span>
                    <span className="text-[10px] font-semibold text-orange-600 dark:text-orange-400">
                      {entry.interactions.length} interaksi
                    </span>
                  </div>
                  <span className="text-[10px] text-slate-400 dark:text-slate-500 shrink-0">
                    {relativeTime(entry.checked_at)}
                  </span>
                </div>
                {/* Load hint */}
                <div className="mt-1.5 flex items-center gap-1 opacity-0 group-hover:opacity-100 transition">
                  <span className="material-symbols-outlined text-amber-500 text-[11px]">open_in_full</span>
                  <span className="text-[10px] text-amber-600 dark:text-amber-400 font-medium">Klik untuk muat</span>
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* Footer hint */}
      {!loading && entries.length > 0 && (
        <div className="px-4 py-2.5 border-t border-slate-100 dark:border-slate-700/60 bg-slate-50/50 dark:bg-slate-800/40">
          <p className="text-[10px] text-slate-400 dark:text-slate-500 flex items-center gap-1">
            <span className="material-symbols-outlined text-[11px]">public</span>
            Riwayat analisis bersama semua pengguna
          </p>
        </div>
      )}
    </div>
  );
}

export default function DrugInteraction() {
  const navigate = useNavigate();
  const inputRef = useRef(null);
  const topRef = useRef(null);

  const [drugInput, setDrugInput] = useState('');
  const [drugs, setDrugs] = useState([]);
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState(null); // null = not yet checked, [] = checked & empty, [...] = has results
  const [error, setError] = useState('');
  const [cacheHit, setCacheHit] = useState(false);
  const [currentDrugKey, setCurrentDrugKey] = useState('');

  const [recentEntries, setRecentEntries] = useState([]);
  const [recentLoading, setRecentLoading] = useState(true);

  const fetchRecentAnalyses = useCallback(async () => {
    setRecentLoading(true);
    try {
      const { data } = await supabase
        .from('drug_interaction_cache')
        .select('drug_key, drugs, interactions, checked_at')
        .order('checked_at', { ascending: false })
        .limit(RECENT_FETCH_LIMIT);

      if (data) {
        const withInteractions = data
          .filter(r => Array.isArray(r.interactions) && r.interactions.length > 0)
          .slice(0, RECENT_MAX_DISPLAY);
        setRecentEntries(withInteractions);
      }
    } catch (_) {
      // silently fail
    } finally {
      setRecentLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchRecentAnalyses();
  }, [fetchRecentAnalyses]);

  const addDrug = () => {
    const name = drugInput.trim();
    if (!name) return;
    const lower = name.toLowerCase();
    if (drugs.some(d => d.toLowerCase() === lower)) {
      setError('Obat sudah ditambahkan.');
      return;
    }
    if (drugs.length >= MAX_DRUGS) {
      setError(`Maksimal ${MAX_DRUGS} obat.`);
      return;
    }
    setDrugs(prev => [...prev, name]);
    setDrugInput('');
    setError('');
    setResults(null);
    setCacheHit(false);
    inputRef.current?.focus();
  };

  const removeDrug = (index) => {
    setDrugs(prev => prev.filter((_, i) => i !== index));
    setResults(null);
    setError('');
    setCacheHit(false);
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      addDrug();
    }
  };

  const checkInteractions = async () => {
    if (drugs.length < 2) return;
    setLoading(true);
    setError('');
    setResults(null);
    setCacheHit(false);

    const key = makeKey(drugs);

    try {
      // 1. Try cache first
      const cached = await loadFromCache(drugs);
      if (cached) {
        setResults(cached.interactions);
        setCurrentDrugKey(key);
        setCacheHit(true);
        return;
      }

      // 2. Cache miss → call API
      const res = await fetch('/.netlify/functions/check-interactions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ drugs }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(data.error || `Error ${res.status}`);
        return;
      }

      const interactions = data.interactions || [];
      setResults(interactions);
      setCurrentDrugKey(key);

      // 3. Save to cache (only if there are results — still save empty arrays to avoid hammering API)
      await saveToCache(drugs, interactions);

      // 4. Refresh recent panel
      await fetchRecentAnalyses();
    } catch (err) {
      setError('Gagal terhubung ke server. Periksa koneksi internet Anda.');
    } finally {
      setLoading(false);
    }
  };

  const handleSummaryFetched = useCallback(async (pair, summary) => {
    if (!currentDrugKey) return;
    await updateSummaryInCache(currentDrugKey, pair, summary);
    // Update results state optimistically so re-renders show cached value instantly
    setResults(prev =>
      prev ? prev.map(item =>
        item.pair && item.pair[0] === pair[0] && item.pair[1] === pair[1]
          ? { ...item, ai_summary: summary }
          : item
      ) : prev
    );
  }, [currentDrugKey]);

  const handleRecentClick = async (entry) => {
    setDrugs(entry.drugs);
    setResults(null);
    setCurrentDrugKey(entry.drug_key);
    setCacheHit(true);
    setError('');
    setDrugInput('');
    topRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });

    // Always fetch fresh from Supabase so ai_summary is up-to-date
    const fresh = await loadFromCache(entry.drugs);
    setResults(fresh ? fresh.interactions : entry.interactions);
  };

  const reset = () => {
    setDrugs([]);
    setDrugInput('');
    setResults(null);
    setError('');
    setCacheHit(false);
    setCurrentDrugKey('');
    inputRef.current?.focus();
  };

  const canCheck = drugs.length >= 2 && !loading;

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto" ref={topRef}>
      {/* ── Header (full width) ── */}
      <div className="flex items-center gap-3 mb-6">
        <button
          onClick={() => navigate('/tools')}
          className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-500 dark:text-slate-400"
          aria-label="Kembali"
        >
          <span className="material-symbols-outlined text-xl">arrow_back</span>
        </button>
        <div className="bg-rose-100 dark:bg-rose-900/30 rounded-xl p-2.5">
          <span className="material-symbols-outlined text-rose-500 dark:text-rose-400 text-2xl">medication</span>
        </div>
        <div>
          <h1 className="text-xl font-bold text-slate-900 dark:text-slate-100">Interaction Checker</h1>
          <p className="text-xs text-slate-500 dark:text-slate-400">Cek interaksi antar obat menggunakan data label FDA</p>
        </div>
      </div>

      {/* ── Two-column layout ── */}
      <div className="grid grid-cols-1 lg:grid-cols-[1fr_300px] xl:grid-cols-[1fr_320px] gap-5 lg:gap-6 items-start">

        {/* ── LEFT: Main tool ── */}
        <div className="min-w-0">
          {/* Drug Input Section */}
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-5 mb-5">
            <label className="block text-xs font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider mb-1">
              Daftar Obat
            </label>
            <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 mb-3">
              Masukkan nama obat dalam bahasa Inggris (nama generik atau merk). Contoh: <strong>warfarin</strong>, <strong>paracetamol</strong>.{' '}
              Gunakan ejaan lengkap (hindari singkatan) untuk hasil yang lebih akurat.
            </p>

            {/* Chips */}
            {drugs.length > 0 && (
              <div className="flex flex-wrap gap-2 mb-3">
                {drugs.map((drug, i) => (
                  <span
                    key={i}
                    className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full border text-sm font-medium ${chipColor(i)}`}
                  >
                    {drug}
                    <button
                      onClick={() => removeDrug(i)}
                      className="opacity-60 hover:opacity-100 transition"
                      aria-label={`Hapus ${drug}`}
                    >
                      <span className="material-symbols-outlined text-[14px]">close</span>
                    </button>
                  </span>
                ))}
              </div>
            )}

            {/* Input row */}
            <div className="flex gap-2">
              <input
                ref={inputRef}
                type="text"
                value={drugInput}
                onChange={e => { setDrugInput(e.target.value); setError(''); }}
                onKeyDown={handleKeyDown}
                placeholder="Ketik nama obat, lalu Enter atau Tambah…"
                disabled={drugs.length >= MAX_DRUGS}
                className="flex-1 px-4 py-2.5 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/50 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary text-sm disabled:opacity-50 transition"
              />
              <button
                onClick={addDrug}
                disabled={!drugInput.trim() || drugs.length >= MAX_DRUGS}
                className="px-4 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition"
              >
                Tambah
              </button>
            </div>

            {drugs.length < 2 && drugs.length > 0 && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Tambah minimal 1 obat lagi untuk memeriksa interaksi.</p>
            )}
            {drugs.length === 0 && (
              <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Tambah minimal 2 obat untuk memeriksa interaksi.</p>
            )}
            {error && (
              <p className="mt-2 text-xs text-red-500 dark:text-red-400 flex items-center gap-1">
                <span className="material-symbols-outlined text-[14px]">error</span>
                {error}
              </p>
            )}
          </div>

          {/* Actions */}
          <div className="flex gap-3 mb-6">
            <button
              onClick={checkInteractions}
              disabled={!canCheck}
              className="flex-1 flex items-center justify-center gap-2 py-3 rounded-xl bg-rose-500 hover:bg-rose-600 text-white font-semibold text-sm disabled:opacity-40 disabled:cursor-not-allowed transition"
            >
              {loading ? (
                <>
                  <span className="material-symbols-outlined animate-spin text-xl">progress_activity</span>
                  Memeriksa…
                </>
              ) : (
                <>
                  <span className="material-symbols-outlined text-xl">search</span>
                  Periksa Interaksi
                </>
              )}
            </button>
            {(drugs.length > 0 || results !== null) && (
              <button
                onClick={reset}
                className="px-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 text-sm font-medium transition"
              >
                Reset
              </button>
            )}
          </div>

          {/* Results */}
          {results !== null && (
            <div className="space-y-4">
              {/* Cache hit indicator */}
              {cacheHit && (
                <div className="flex items-center gap-2 text-[11px] text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-900/10 border border-emerald-200 dark:border-emerald-800/50 rounded-xl px-3 py-2">
                  <span className="material-symbols-outlined text-[14px]">bolt</span>
                  Memuat dari cache — tidak memanggil API lagi
                </div>
              )}

              {results.length === 0 ? (
                <div className="flex flex-col items-center justify-center rounded-2xl border border-emerald-200 dark:border-emerald-800/50 bg-emerald-50 dark:bg-emerald-900/10 py-10 px-6 text-center">
                  <span className="material-symbols-outlined text-5xl text-emerald-500 mb-3">check_circle</span>
                  <p className="font-semibold text-emerald-700 dark:text-emerald-400">Tidak Ditemukan Interaksi</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 max-w-sm">
                    Tidak ada interaksi yang tercatat dalam label obat FDA untuk kombinasi ini. Tetap konsultasikan dengan apoteker atau dokter.
                  </p>
                </div>
              ) : (
                <>
                  <div className="flex items-center gap-2">
                    <span className="material-symbols-outlined text-orange-500 text-base">warning</span>
                    <h2 className="text-sm font-semibold text-slate-700 dark:text-slate-300">
                      {results.length} Interaksi Ditemukan
                    </h2>
                  </div>
                  {results.map((item) => (
                    <InteractionCard
                      key={item.pair ? item.pair.join('|') : Math.random()}
                      item={item}
                      initialSummary={item.ai_summary || null}
                      onSummaryFetched={handleSummaryFetched}
                    />
                  ))}
                </>
              )}

              {/* Disclaimer */}
              <div className="rounded-xl bg-slate-100 dark:bg-slate-800/70 border border-slate-200 dark:border-slate-700 px-4 py-3 flex gap-2.5">
                <span className="material-symbols-outlined text-slate-400 text-[18px] shrink-0 mt-0.5">info</span>
                <p className="text-[11px] text-slate-500 dark:text-slate-400 leading-relaxed">
                  Data bersumber dari label obat FDA melalui OpenFDA API. Informasi ini <strong>bukan pengganti konsultasi klinis</strong>.
                  Selalu konfirmasi dengan apoteker atau dokter sebelum mengambil keputusan terapeutik.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* ── RIGHT: Recent panel ── */}
        <div className="lg:sticky lg:top-4 lg:self-start">
          <RecentPanel
            entries={recentEntries}
            loading={recentLoading}
            onSelect={handleRecentClick}
          />
        </div>

      </div>
    </div>
  );
}
