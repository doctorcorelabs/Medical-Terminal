import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { EMERGENCY_DRUGS } from '../../data/emergencyDrugs';
import { calcEmergencyDoses } from '../../utils/medCalculations';

function SectionCard({ children, className = '' }) {
  return (
    <div className={`rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 ${className}`}>
      {children}
    </div>
  );
}

function Metric({ label, value, sublabel }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</p>}
    </div>
  );
}

export default function EmergencyDose() {
  const navigate = useNavigate();
  const [weightKg, setWeightKg] = useState('');
  const [mode, setMode] = useState('pediatric');

  const numericWeight = Number(weightKg);
  const results = weightKg ? calcEmergencyDoses(numericWeight, EMERGENCY_DRUGS) : [];

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
          <div className="bg-red-100 dark:bg-red-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-red-600 dark:text-red-400 text-2xl">emergency</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Simulasi Dosis Darurat</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Akses cepat dosis obat emergensi berbasis berat badan untuk area resusitasi.</p>
          </div>
        </div>
      </div>

      <SectionCard className="p-4 sm:p-5 mb-5">
        <div className="flex flex-col lg:flex-row gap-4 lg:items-end lg:justify-between">
          <div className="flex-1">
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Berat Badan</label>
            <div className="relative max-w-sm">
              <input
                type="number"
                min="1"
                max="250"
                step="0.1"
                value={weightKg}
                onChange={(event) => setWeightKg(event.target.value)}
                placeholder="Masukkan berat pasien"
                className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 pr-14 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
              />
              <span className="absolute right-4 top-1/2 -translate-y-1/2 text-sm text-slate-400">kg</span>
            </div>
          </div>

          <div>
            <p className="text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Mode Referensi</p>
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700">
              {[
                { id: 'pediatric', label: 'Pediatrik' },
                { id: 'adult', label: 'Dewasa' },
              ].map((item) => (
                <button
                  key={item.id}
                  onClick={() => setMode(item.id)}
                  className={`px-3 py-2 rounded-lg text-sm font-medium transition ${mode === item.id ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mt-4">
          <Metric
            label="Estimasi Berat"
            value={weightKg ? `${numericWeight.toLocaleString('id-ID', { maximumFractionDigits: 1 })} kg` : 'Belum diisi'}
            sublabel={mode === 'pediatric' ? 'Mode menonjolkan dosis berbasis BB seperti PALS.' : 'Gunakan bersama judgment klinis ACLS lokal.'}
          />
          <Metric
            label="Obat Tersedia"
            value={`${EMERGENCY_DRUGS.length} item`}
            sublabel="Obat bolus dan vasopresor emergensi yang sering dipakai"
          />
          <Metric
            label="Catatan"
            value="Bukan order otomatis"
            sublabel="Verifikasi konsentrasi, pengenceran, dan protokol RS sebelum pemberian"
          />
        </div>
      </SectionCard>

      {!weightKg && (
        <SectionCard className="p-10 text-center">
          <span className="material-symbols-outlined text-5xl text-slate-300 dark:text-slate-600">monitor_weight</span>
          <p className="mt-3 text-base font-medium text-slate-700 dark:text-slate-200">Masukkan berat badan untuk melihat simulasi dosis</p>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Hasil akan dihitung otomatis untuk seluruh obat darurat di bawah.</p>
        </SectionCard>
      )}

      {weightKg && (
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {results.map((drug) => (
            <SectionCard key={drug.id} className="p-4 sm:p-5">
              <div className="flex items-start justify-between gap-3 mb-4">
                <div>
                  <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">{drug.name}</h2>
                  <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{drug.indication}</p>
                </div>
                <span className="text-[11px] font-medium px-2 py-1 rounded-full bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400">
                  {drug.route}
                </span>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <Metric label="Dosis" value={drug.doseDisplay} sublabel={drug.type === 'mcg_per_kg_min_range' ? 'Target per menit' : 'Dosis awal berbasis berat badan'} />
                <Metric label="Volume dari sediaan" value={drug.volumeDisplay} sublabel={drug.concentrationLabel} />
                <Metric label="Batas Maksimum" value={drug.maxDisplay} sublabel="Ikuti batas institusi dan protokol resusitasi" />
                <Metric label="Konteks klinis" value={mode === 'pediatric' ? 'PALS-oriented' : 'ACLS-oriented'} sublabel={mode === 'pediatric' ? 'Highlight obat berbasis BB dan minimum dose.' : 'Pastikan konsentrasi serta pump setting sesuai standar dewasa.'} />
              </div>

              <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50/80 dark:bg-slate-900/20 p-3">
                <p className="text-xs font-medium text-slate-600 dark:text-slate-300">Catatan penting</p>
                <p className="mt-1 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">{drug.note}</p>
              </div>
            </SectionCard>
          ))}
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Referensi cepat emergensi. Selalu cek konsentrasi vial, pengenceran, dan protokol unit sebelum administrasi obat.
      </p>
    </div>
  );
}