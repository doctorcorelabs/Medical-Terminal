import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ANTIBIOTIC_GUIDE, RISK_OPTIONS } from '../../data/antibioticGuide';

function Tag({ children, active, onClick }) {
  return (
    <button
      onClick={onClick}
      className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${active ? 'bg-primary text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:text-primary'}`}
    >
      {children}
    </button>
  );
}

function RegimenSection({ title, items, tone }) {
  if (!items?.length) return null;
  const toneMap = {
    primary: 'border-emerald-200 dark:border-emerald-800/40 bg-emerald-50 dark:bg-emerald-900/20',
    secondary: 'border-blue-200 dark:border-blue-800/40 bg-blue-50 dark:bg-blue-900/20',
    alternative: 'border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20',
  };
  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-300">{title}</p>
      <div className="mt-3 space-y-3">
        {items.map((item, index) => (
          <div key={`${item.drug}-${index}`} className="rounded-xl bg-white/70 dark:bg-slate-900/20 px-4 py-3">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.drug}</p>
                <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{item.dose}</p>
              </div>
              <span className="text-[11px] px-2 py-1 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-500 dark:text-slate-300">{item.route}</span>
            </div>
            <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">Durasi awal: {item.duration}</p>
            {item.notes && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.notes}</p>}
          </div>
        ))}
      </div>
    </div>
  );
}

export default function AntibioticSteward() {
  const navigate = useNavigate();
  const [selectedSiteId, setSelectedSiteId] = useState(ANTIBIOTIC_GUIDE[0].id);
  const [severity, setSeverity] = useState('moderate');
  const [activeRisks, setActiveRisks] = useState([]);

  const selectedSite = ANTIBIOTIC_GUIDE.find((item) => item.id === selectedSiteId) ?? ANTIBIOTIC_GUIDE[0];
  const regimen = selectedSite.regimens[severity];

  const relevantRisks = useMemo(
    () => selectedSite.risks.filter((risk) => activeRisks.includes(risk.key)),
    [activeRisks, selectedSite]
  );

  const toggleRisk = (key) => {
    setActiveRisks((current) => current.includes(key) ? current.filter((item) => item !== key) : [...current, key]);
  };

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <button
          onClick={() => navigate('/tools')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition mb-3"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
          Tools
        </button>
        <div className="flex items-start gap-3">
          <div className="bg-orange-100 dark:bg-orange-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-orange-600 dark:text-orange-400 text-2xl">biotech</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Antibiotic Stewardship Helper</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Panduan empiris awal berbasis fokus infeksi, severitas, dan risiko patogen resisten sebelum kultur final tersedia.</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.9fr_1.1fr] gap-5">
        <div className="space-y-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Fokus infeksi</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              {ANTIBIOTIC_GUIDE.map((item) => (
                <button
                  key={item.id}
                  onClick={() => setSelectedSiteId(item.id)}
                  className={`text-left rounded-2xl border p-4 transition ${selectedSiteId === item.id ? 'border-primary bg-primary/5 dark:bg-primary/10' : 'border-slate-200 dark:border-slate-700 hover:border-primary/30'}`}
                >
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center ${selectedSiteId === item.id ? 'bg-primary/15 dark:bg-primary/25' : 'bg-slate-100 dark:bg-slate-700'}`}>
                      <span className={`material-symbols-outlined ${selectedSiteId === item.id ? 'text-primary' : 'text-slate-500 dark:text-slate-300'}`}>{item.icon}</span>
                    </div>
                    <div>
                      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{item.shortLabel}</p>
                      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{item.organ}</p>
                      <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 leading-relaxed">{item.summary}</p>
                    </div>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Severity</h2>
            <div className="flex flex-wrap gap-2">
              {[
                { id: 'mild', label: 'Ringan / rawat jalan' },
                { id: 'moderate', label: 'Sedang / rawat inap' },
                { id: 'severe', label: 'Berat / ICU' },
              ].map((item) => (
                <Tag key={item.id} active={severity === item.id} onClick={() => setSeverity(item.id)}>{item.label}</Tag>
              ))}
            </div>
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-3">Risk modifiers</h2>
            <div className="flex flex-wrap gap-2">
              {RISK_OPTIONS.map((risk) => (
                <Tag key={risk.key} active={activeRisks.includes(risk.key)} onClick={() => toggleRisk(risk.key)}>{risk.label}</Tag>
              ))}
            </div>
            <p className="mt-3 text-xs text-slate-400">Gunakan data kultur lokal dan antibiogram RS untuk finalisasi regimen.</p>
          </div>
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
              <div>
                <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{selectedSite.label}</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Severity aktif: {severity === 'mild' ? 'Ringan' : severity === 'moderate' ? 'Sedang' : 'Berat'}.</p>
              </div>
              <button
                onClick={() => navigate('/tools/fornas', { state: { initialQuery: regimen.firstLine[0]?.drug.split(' ')[0] ?? '' } })}
                className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
              >
                Cari first-line di Fornas
              </button>
            </div>
          </div>

          <RegimenSection title="Lini 1" items={regimen.firstLine} tone="primary" />
          <RegimenSection title="Lini 2" items={regimen.secondLine} tone="secondary" />
          <RegimenSection title="Alternatif" items={regimen.alternatives} tone="alternative" />

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">Penyesuaian berdasarkan risiko</h3>
            {relevantRisks.length === 0 && <p className="mt-2 text-sm text-slate-500 dark:text-slate-400">Belum ada risk modifier dipilih. Gunakan regimen dasar dan sesuaikan setelah kultur/antibiogram tersedia.</p>}
            {relevantRisks.length > 0 && (
              <div className="mt-3 space-y-3">
                {relevantRisks.map((risk) => (
                  <div key={risk.key} className="rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
                    <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{risk.label}</p>
                    <p className="mt-1 text-sm text-slate-600 dark:text-slate-300">{risk.recommendation}</p>
                    <p className="mt-1 text-xs text-slate-400">{risk.notes}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="rounded-2xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 p-4 sm:p-5">
            <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Stewardship reminder</p>
            <p className="mt-2 text-sm text-amber-700 dark:text-amber-300 leading-relaxed">Ambil kultur sebelum antibiotik bila feasible, lakukan reassessment 48-72 jam, dan de-eskalasi setelah data mikrobiologi atau respons klinis tersedia.</p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">Berdasarkan dataset kurasi internal untuk referensi awal. Bukan pengganti panduan RS, kultur, atau konsultasi penyakit infeksi.</p>
    </div>
  );
}