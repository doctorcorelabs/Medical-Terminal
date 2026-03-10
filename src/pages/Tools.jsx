import { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const ALL_TOOLS = [
  {
    id: 'icd10',
    name: 'ICD-10 e-Klaim',
    description: 'Pencarian kode penyakit ICD-10 untuk klaim BPJS dan dokumentasi diagnosis pasien.',
    icon: 'qr_code_2',
    category: 'Diagnosis',
    categoryColor: 'blue',
    route: '/tools/icd10',
    available: true,
  },
  {
    id: 'calculator',
    name: 'Kalkulator Medis',
    description: 'BMI, eGFR, BSA, IBW, MEWS, CURB-65, Kalsium & Natrium Terkoreksi, skor APGAR.',
    icon: 'calculate',
    category: 'Kalkulasi',
    categoryColor: 'emerald',
    route: '/tools/calculator',
    available: true,
  },
  {
    id: 'clinical-guide',
    name: 'Panduan Klinis',
    description: 'Referensi panduan tatalaksana klinis berbasis evidence-based medicine.',
    icon: 'menu_book',
    category: 'Referensi',
    categoryColor: 'purple',
    route: null,
    available: false,
  },
  {
    id: 'drug-ref',
    name: 'Referensi Obat',
    description: 'Database dosis, interaksi, dan kontraindikasi obat-obatan klinis.',
    icon: 'medication',
    category: 'Farmakologi',
    categoryColor: 'pink',
    route: null,
    available: false,
  },
  {
    id: 'diagnostic-score',
    name: 'Skor Diagnostik',
    description: 'Skor dan kriteria diagnostik terstandarisasi untuk berbagai kondisi klinik.',
    icon: 'fact_check',
    category: 'Skrining',
    categoryColor: 'orange',
    route: null,
    available: false,
  },
  {
    id: 'dose-calc',
    name: 'Kalkulator Dosis',
    description: 'Kalkulasi dosis obat berdasarkan berat badan, fungsi ginjal, dan parameter klinis.',
    icon: 'vaccines',
    category: 'Farmakologi',
    categoryColor: 'pink',
    route: null,
    available: false,
  },
];

const CATEGORY_COLORS = {
  blue:    { badge: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400' },
  emerald: { badge: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400' },
  purple:  { badge: 'bg-purple-100 dark:bg-purple-900/30 text-purple-700 dark:text-purple-400' },
  pink:    { badge: 'bg-pink-100 dark:bg-pink-900/30 text-pink-700 dark:text-pink-400' },
  orange:  { badge: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400' },
};

export default function Tools() {
  const navigate = useNavigate();
  const [search, setSearch] = useState('');

  const filtered = ALL_TOOLS.filter(t =>
    !search.trim() ||
    t.name.toLowerCase().includes(search.toLowerCase()) ||
    t.category.toLowerCase().includes(search.toLowerCase()) ||
    t.description.toLowerCase().includes(search.toLowerCase())
  );

  const available = filtered.filter(t => t.available);
  const coming = filtered.filter(t => !t.available);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      {/* ── Header ── */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-1">
          <div className="bg-primary/10 dark:bg-primary/20 rounded-xl p-2.5 flex items-center justify-center">
            <span className="material-symbols-outlined text-primary text-2xl">medical_information</span>
          </div>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 dark:text-slate-100">Clinical Tools</h1>
            <p className="text-sm text-slate-500 dark:text-slate-400">Alat bantu klinis terintegrasi untuk praktek sehari-hari</p>
          </div>
        </div>
      </div>

      {/* ── Search ── */}
      <div className="relative mb-8">
        <span className="material-symbols-outlined absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400 text-xl pointer-events-none">search</span>
        <input
          type="text"
          value={search}
          onChange={e => setSearch(e.target.value)}
          placeholder="Cari nama tool atau kategori..."
          className="w-full pl-10 pr-4 py-3 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-900 dark:text-slate-100 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition text-sm sm:text-base"
        />
        {search && (
          <button onClick={() => setSearch('')} className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition">
            <span className="material-symbols-outlined text-xl">close</span>
          </button>
        )}
      </div>

      {/* ── Available Tools ── */}
      {available.length > 0 && (
        <section className="mb-10">
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-emerald-500 text-base">check_circle</span>
            <h2 className="text-sm font-semibold text-slate-600 dark:text-slate-400 uppercase tracking-wider">Tersedia</h2>
            <span className="text-xs bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 px-2 py-0.5 rounded-full font-medium">{available.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {available.map(tool => (
              <ToolCard key={tool.id} tool={tool} onClick={() => navigate(tool.route)} />
            ))}
          </div>
        </section>
      )}

      {/* ── Coming Soon ── */}
      {coming.length > 0 && (
        <section>
          <div className="flex items-center gap-2 mb-4">
            <span className="material-symbols-outlined text-slate-400 text-base">schedule</span>
            <h2 className="text-sm font-semibold text-slate-500 dark:text-slate-500 uppercase tracking-wider">Segera Hadir</h2>
            <span className="text-xs bg-slate-100 dark:bg-slate-800 text-slate-500 px-2 py-0.5 rounded-full font-medium">{coming.length}</span>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {coming.map(tool => (
              <ToolCard key={tool.id} tool={tool} onClick={null} dimmed />
            ))}
          </div>
        </section>
      )}

      {filtered.length === 0 && (
        <div className="flex flex-col items-center justify-center py-20 text-slate-400 dark:text-slate-500">
          <span className="material-symbols-outlined text-5xl mb-3">search_off</span>
          <p className="text-base font-medium">Tidak ada tool ditemukan</p>
          <p className="text-sm mt-1">Coba kata kunci lain</p>
        </div>
      )}
    </div>
  );
}

function ToolCard({ tool, onClick, dimmed }) {
  const catColor = CATEGORY_COLORS[tool.categoryColor] ?? CATEGORY_COLORS.blue;

  return (
    <div
      onClick={onClick ?? undefined}
      className={`relative group rounded-2xl border bg-white dark:bg-slate-800/60 flex flex-col gap-3 p-5 transition-all duration-200
        ${dimmed
          ? 'border-slate-200 dark:border-slate-700/50 opacity-60 cursor-not-allowed'
          : 'border-slate-200 dark:border-slate-700 cursor-pointer hover:shadow-lg hover:border-primary/30 dark:hover:border-primary/30 hover:-translate-y-0.5'
        }`}
    >
      {/* Coming soon overlay badge */}
      {dimmed && (
        <div className="absolute top-3 right-3 flex items-center gap-1 bg-slate-100 dark:bg-slate-700 rounded-full px-2 py-0.5">
          <span className="material-symbols-outlined text-[13px] text-slate-400">lock</span>
          <span className="text-[11px] text-slate-400 font-medium">Segera</span>
        </div>
      )}

      {/* Icon */}
      <div className={`w-12 h-12 rounded-xl flex items-center justify-center shrink-0
        ${dimmed ? 'bg-slate-100 dark:bg-slate-700' : 'bg-primary/10 dark:bg-primary/20 group-hover:bg-primary/20 dark:group-hover:bg-primary/30 transition'}`}>
        <span className={`material-symbols-outlined text-2xl ${dimmed ? 'text-slate-400' : 'text-primary'}`}>{tool.icon}</span>
      </div>

      {/* Body */}
      <div className="flex-1 min-h-0">
        <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm leading-snug mb-1">{tool.name}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed line-clamp-3">{tool.description}</p>
      </div>

      {/* Footer */}
      <div className="flex items-center justify-between pt-1">
        <span className={`text-[11px] font-medium px-2 py-0.5 rounded-full ${catColor.badge}`}>{tool.category}</span>
        {!dimmed && (
          <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-primary transition text-lg">arrow_forward</span>
        )}
      </div>
    </div>
  );
}
