import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import FornasDrugPicker from '../../components/FornasDrugPicker';
import { RENAL_HEPATIC_DRUGS, findDrugAdjustment } from '../../data/renalHepaticDosing';
import { calcEGFR } from '../../utils/medCalculations';

function Field({ label, unit, value, onChange, type = 'number', step = 'any', min = 0 }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
        {label} {unit && <span className="text-slate-400">({unit})</span>}
      </label>
      <input
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        min={min}
        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
      />
    </div>
  );
}

function Segment({ items, value, onChange }) {
  return (
    <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
      {items.map((item) => (
        <button
          key={item.id}
          onClick={() => onChange(item.id)}
          className={`px-3 py-2 rounded-lg text-sm font-medium transition ${value === item.id ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}

function RecommendationCard({ title, tone, item }) {
  if (!item) return null;

  const toneMap = {
    renal: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800/40 text-blue-700 dark:text-blue-300',
    hepatic: 'bg-amber-50 dark:bg-amber-900/20 border-amber-200 dark:border-amber-800/40 text-amber-700 dark:text-amber-300',
  };

  return (
    <div className={`rounded-2xl border p-4 ${toneMap[tone]}`}>
      <p className="text-xs font-semibold uppercase tracking-wide opacity-80">{title}</p>
      <p className="mt-2 text-lg font-semibold">{item.recommendation}</p>
      <p className="mt-1 text-sm opacity-90">{item.note}</p>
      <p className="mt-2 text-xs opacity-75">Rentang: {item.label ?? `Child-Pugh ${item.childPugh?.join(', ')}`}</p>
    </div>
  );
}

function matchRenalRule(rules, egfr) {
  return rules.find((rule) => {
    if (rule.minEgfr != null && egfr < rule.minEgfr) return false;
    if (rule.maxEgfr != null && egfr > rule.maxEgfr) return false;
    return true;
  }) ?? null;
}

function matchHepaticRule(rules, childPugh) {
  return rules.find((rule) => rule.childPugh?.includes(childPugh)) ?? null;
}

export default function RenalDosing() {
  const navigate = useNavigate();
  const [mode, setMode] = useState('both');
  const [query, setQuery] = useState('');
  const [selectedDrug, setSelectedDrug] = useState(null);
  const [showPicker, setShowPicker] = useState(false);

  const [creatinine, setCreatinine] = useState('');
  const [age, setAge] = useState('');
  const [gender, setGender] = useState('');
  const [manualEgfr, setManualEgfr] = useState('');
  const [useManualEgfr, setUseManualEgfr] = useState(false);
  const [childPugh, setChildPugh] = useState('A');

  const computedEgfr = creatinine && age && gender ? calcEGFR(Number(creatinine), Number(age), gender) : null;
  const effectiveEgfr = useManualEgfr ? Number(manualEgfr) : computedEgfr?.value;

  const suggestions = useMemo(() => {
    if (!query.trim()) return RENAL_HEPATIC_DRUGS.slice(0, 8);
    const q = query.trim().toLowerCase();
    return RENAL_HEPATIC_DRUGS.filter((drug) =>
      drug.name.toLowerCase().includes(q) ||
      drug.aliases.some((alias) => alias.toLowerCase().includes(q)) ||
      drug.category.toLowerCase().includes(q)
    ).slice(0, 8);
  }, [query]);

  const activeDrug = selectedDrug ?? findDrugAdjustment(query);
  const renalRecommendation = activeDrug && effectiveEgfr != null ? matchRenalRule(activeDrug.renal, effectiveEgfr) : null;
  const hepaticRecommendation = activeDrug ? matchHepaticRule(activeDrug.hepatic, childPugh) : null;

  const handleSelectLocalDrug = (drug) => {
    setSelectedDrug(drug);
    setQuery(drug.name);
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
          <div className="bg-teal-100 dark:bg-teal-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-teal-600 dark:text-teal-400 text-2xl">pill</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Penyesuaian Dosis Ginjal/Hepatik</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Dataset lokal kurasi untuk obat umum dengan eGFR dan Child-Pugh sebagai parameter utama.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5 mb-5">
        <div className="flex flex-col lg:flex-row lg:items-start gap-4 lg:justify-between">
          <div className="space-y-3 flex-1">
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Cari obat</label>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={query}
                  onChange={(event) => { setQuery(event.target.value); setSelectedDrug(null); }}
                  placeholder="Mis. metformin, vancomycin, enoxaparin"
                  className="flex-1 rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                />
                <button
                  onClick={() => setShowPicker(true)}
                  className="px-4 py-3 rounded-xl bg-teal-100 dark:bg-teal-900/30 text-teal-700 dark:text-teal-300 text-sm font-medium hover:bg-teal-200 dark:hover:bg-teal-900/50 transition"
                >
                  Pilih dari Fornas
                </button>
              </div>
            </div>

            <div className="flex flex-wrap gap-2">
              {suggestions.map((drug) => (
                <button
                  key={drug.id}
                  onClick={() => handleSelectLocalDrug(drug)}
                  className={`px-3 py-1.5 rounded-full text-xs font-medium border transition ${activeDrug?.id === drug.id ? 'bg-primary text-white border-transparent' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700 hover:border-primary/40 hover:text-primary'}`}
                >
                  {drug.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Mode evaluasi</p>
            <Segment
              items={[
                { id: 'renal', label: 'Renal' },
                { id: 'hepatic', label: 'Hepatik' },
                { id: 'both', label: 'Keduanya' },
              ]}
              value={mode}
              onChange={setMode}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-[0.95fr_1.05fr] gap-5">
        <div className="space-y-5">
          {(mode === 'renal' || mode === 'both') && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
              <div className="flex items-center justify-between gap-3 mb-4">
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Parameter ginjal</h2>
                <label className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                  <input type="checkbox" checked={useManualEgfr} onChange={(event) => setUseManualEgfr(event.target.checked)} />
                  Input manual eGFR
                </label>
              </div>
              {!useManualEgfr && (
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <Field label="Kreatinin serum" unit="mg/dL" value={creatinine} onChange={setCreatinine} step="0.01" />
                  <Field label="Usia" unit="tahun" value={age} onChange={setAge} step="1" />
                  <div>
                    <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Jenis kelamin</label>
                    <select
                      value={gender}
                      onChange={(event) => setGender(event.target.value)}
                      className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                    >
                      <option value="">Pilih...</option>
                      <option value="male">Laki-laki</option>
                      <option value="female">Perempuan</option>
                    </select>
                  </div>
                </div>
              )}
              {useManualEgfr && <Field label="eGFR" unit="mL/min/1.73m²" value={manualEgfr} onChange={setManualEgfr} step="1" />}
              <div className="mt-4 rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
                <p className="text-[11px] uppercase tracking-wide text-slate-400">eGFR aktif</p>
                <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">
                  {effectiveEgfr != null && !Number.isNaN(effectiveEgfr)
                    ? `${Math.round(effectiveEgfr)} mL/min/1.73m²`
                    : 'Belum tersedia'}
                </p>
                {computedEgfr?.stage && !useManualEgfr && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">CKD {computedEgfr.stage} · {computedEgfr.category}</p>}
              </div>
            </div>
          )}

          {(mode === 'hepatic' || mode === 'both') && (
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
              <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Parameter hati</h2>
              <Segment
                items={[
                  { id: 'A', label: 'Child-Pugh A' },
                  { id: 'B', label: 'Child-Pugh B' },
                  { id: 'C', label: 'Child-Pugh C' },
                ]}
                value={childPugh}
                onChange={setChildPugh}
              />
              <p className="mt-3 text-xs text-slate-400">Tool ini memakai Child-Pugh sebagai pendekatan praktis, bukan pengganti evaluasi hepatologi lengkap.</p>
            </div>
          )}
        </div>

        <div className="space-y-4">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <div className="flex items-start justify-between gap-3">
              <div>
                <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Obat terpilih</h2>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{activeDrug ? `${activeDrug.name} · ${activeDrug.category}` : 'Cari obat dari daftar kurasi atau pilih dari Fornas.'}</p>
              </div>
              {activeDrug?.fornasKeyword && (
                <button
                  onClick={() => navigate('/tools/fornas', { state: { initialQuery: activeDrug.fornasKeyword } })}
                  className="px-3 py-2 rounded-lg bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-300 text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                >
                  Lihat di Fornas
                </button>
              )}
            </div>

            {!activeDrug && (
              <div className="mt-4 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 p-6 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600">medication</span>
                <p className="mt-3 text-sm font-medium text-slate-700 dark:text-slate-200">Belum ada obat dipilih</p>
                <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">Dataset saat ini berfokus pada obat umum yang sering butuh penyesuaian dosis.</p>
              </div>
            )}

            {activeDrug && (
              <>
                {activeDrug.warning && (
                  <div className="mt-4 rounded-xl border border-amber-200 dark:border-amber-800/40 bg-amber-50 dark:bg-amber-900/20 px-4 py-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-amber-700 dark:text-amber-300">Clinical caution</p>
                    <p className="mt-1 text-sm text-amber-700 dark:text-amber-300">{activeDrug.warning}</p>
                  </div>
                )}

                <div className="mt-4 grid grid-cols-1 gap-3">
                  {(mode === 'renal' || mode === 'both') && (
                    <RecommendationCard title="Rekomendasi renal" tone="renal" item={renalRecommendation} />
                  )}
                  {(mode === 'hepatic' || mode === 'both') && (
                    <RecommendationCard title="Rekomendasi hepatik" tone="hepatic" item={hepaticRecommendation} />
                  )}
                </div>

                <div className="mt-4 grid grid-cols-1 md:grid-cols-2 gap-4">
                  {(mode === 'renal' || mode === 'both') && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Semua rentang renal</p>
                      <div className="space-y-2">
                        {activeDrug.renal.map((item) => (
                          <div key={item.label} className="text-sm">
                            <p className="font-medium text-slate-800 dark:text-slate-100">{item.label}</p>
                            <p className="text-slate-600 dark:text-slate-300">{item.recommendation}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{item.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                  {(mode === 'hepatic' || mode === 'both') && (
                    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">
                      <p className="text-xs font-semibold text-slate-500 dark:text-slate-400 uppercase tracking-wide mb-2">Semua skenario Child-Pugh</p>
                      <div className="space-y-2">
                        {activeDrug.hepatic.map((item) => (
                          <div key={item.childPugh.join('-')} className="text-sm">
                            <p className="font-medium text-slate-800 dark:text-slate-100">Child-Pugh {item.childPugh.join(', ')}</p>
                            <p className="text-slate-600 dark:text-slate-300">{item.recommendation}</p>
                            <p className="text-xs text-slate-400 mt-0.5">{item.note}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">Panduan ini bersifat referensi cepat. Verifikasi dosis akhir dengan kondisi klinis, kultur, TDM, dan formularium lokal.</p>

      {showPicker && (
        <FornasDrugPicker
          onSelect={(drug) => {
            setQuery(drug.name);
            setSelectedDrug(findDrugAdjustment(drug.name));
          }}
          onClose={() => setShowPicker(false)}
        />
      )}
    </div>
  );
}