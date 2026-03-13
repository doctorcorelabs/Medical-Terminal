import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { PEDIATRIC_COMMON_DRUGS } from '../../data/pediatricDosing';
import { calcCommonPediatricDose, calcPediatricEmergencySummary, estimateEttByAge, getBroselowZone } from '../../utils/pediatricCalculations';

function Stat({ label, value, sublabel }) {
  return (
    <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 px-4 py-3">
      <p className="text-[11px] uppercase tracking-wide text-slate-400">{label}</p>
      <p className="mt-1 text-lg font-semibold text-slate-900 dark:text-slate-100">{value}</p>
      {sublabel && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{sublabel}</p>}
    </div>
  );
}

export default function PediatricCalc() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('broselow');
  const [weightKg, setWeightKg] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [selectedDrugId, setSelectedDrugId] = useState(PEDIATRIC_COMMON_DRUGS[0].id);

  const numericWeight = Number(weightKg);
  const zone = getBroselowZone(numericWeight);
  const ett = estimateEttByAge(Number(ageYears));
  const emergency = calcPediatricEmergencySummary(numericWeight);
  const commonDose = calcCommonPediatricDose(selectedDrugId, numericWeight);
  const selectedDrug = useMemo(() => PEDIATRIC_COMMON_DRUGS.find((drug) => drug.id === selectedDrugId), [selectedDrugId]);

  return (
    <div className="p-4 sm:p-6 max-w-6xl mx-auto">
      <div className="mb-5">
        <button onClick={() => navigate('/tools')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition mb-3">
          <span className="material-symbols-outlined text-base">chevron_left</span>
          Tools
        </button>
        <div className="flex items-start gap-3">
          <div className="bg-blue-100 dark:bg-blue-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-blue-600 dark:text-blue-400 text-2xl">child_care</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Kalkulator Pediatrik</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Broselow quick reference, obat umum anak, dan ringkasan resusitasi berbasis berat badan.</p>
          </div>
        </div>
      </div>

      <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5 mb-5">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Berat badan (kg)</label>
            <input type="number" value={weightKg} onChange={(event) => setWeightKg(event.target.value)} step="0.1" min="1" className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition" />
          </div>
          <div>
            <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Usia (tahun, opsional)</label>
            <input type="number" value={ageYears} onChange={(event) => setAgeYears(event.target.value)} step="0.1" min="0" className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition" />
          </div>
          <div className="flex items-end">
            <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 w-full">
              {[
                { id: 'broselow', label: 'Broselow' },
                { id: 'emergency', label: 'Emergensi' },
                { id: 'common', label: 'Obat Umum' },
              ].map((item) => (
                <button key={item.id} onClick={() => setTab(item.id)} className={`flex-1 px-3 py-2 rounded-lg text-sm font-medium transition ${tab === item.id ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}>
                  {item.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {tab === 'broselow' && (
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Zona Broselow</h2>
            {zone ? (
              <>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <Stat label="Zona" value={zone.color} sublabel={`${zone.minWeight}-${zone.maxWeight} kg`} />
                  <Stat label="Estimasi usia" value={zone.approxAge} sublabel={zone.notes} />
                  <Stat label="ETT cuffed" value={`${zone.ettCuffed} mm`} sublabel={`Uncuffed ${zone.ettUncuffed} mm`} />
                  <Stat label="LMA" value={zone.lma} sublabel={`Blade ${zone.blade}`} />
                  <Stat label="Bolus cairan" value={`${Number(weightKg || 0) * 20 || 0} mL`} sublabel={`${zone.fluidBolusMlKg} mL/kg kristaloid`} />
                  <Stat label="Defibrilasi" value={`${Number(weightKg || 0) * 2 || 0}-${Number(weightKg || 0) * 4 || 0} J`} sublabel={`${zone.defibJKg} J/kg`} />
                </div>
                {ett && (
                  <div className="mt-4 rounded-xl border border-slate-100 dark:border-slate-700 bg-slate-50 dark:bg-slate-900/20 p-4">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">Estimasi dari usia</p>
                    <p className="mt-2 text-sm text-slate-700 dark:text-slate-300">ETT uncuffed {ett.uncuffed} mm · cuffed {ett.cuffed} mm.</p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Masukkan berat badan untuk memetakan zona Broselow.</p>
            )}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Checklist cepat</h2>
            <div className="space-y-3 text-sm text-slate-600 dark:text-slate-300">
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">Hitung bolus kristaloid awal 10-20 mL/kg. Pada syok septik, reassessment tiap bolus sangat penting.</div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">Defibrilasi: mulai 2 J/kg, eskalasi 4 J/kg jika ritme shockable persisten.</div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">Epinefrin arrest: 0.01 mg/kg IV/IO tiap 3-5 menit sesuai algoritme PALS.</div>
              <div className="rounded-xl bg-slate-50 dark:bg-slate-700/40 p-4">Verifikasi panjang / berat aktual bila pasien sangat kecil atau obesitas; Broselow adalah pendekatan cepat, bukan nilai absolut.</div>
            </div>
          </div>
        </div>
      )}

      {tab === 'emergency' && (
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
          <div className="px-4 sm:px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Ringkasan obat emergensi anak</h2>
            <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Menggunakan dataset yang sama dengan tool Simulasi Dosis Darurat, difokuskan untuk konteks PALS.</p>
          </div>
          <div className="divide-y divide-slate-100 dark:divide-slate-700/60">
            {weightKg ? emergency.map((drug) => (
              <div key={drug.id} className="px-4 sm:px-5 py-4 grid grid-cols-1 md:grid-cols-[1.1fr_0.9fr] gap-3">
                <div>
                  <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{drug.name}</p>
                  <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{drug.indication}</p>
                  <p className="mt-2 text-xs text-slate-400">{drug.note}</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <Stat label="Dosis" value={drug.doseDisplay} sublabel={drug.route} />
                  <Stat label="Volume" value={drug.volumeDisplay} sublabel={drug.concentrationLabel} />
                </div>
              </div>
            )) : <div className="px-4 sm:px-5 py-8 text-sm text-slate-500 dark:text-slate-400">Masukkan berat badan untuk melihat ringkasan dosis emergensi anak.</div>}
          </div>
        </div>
      )}

      {tab === 'common' && (
        <div className="grid grid-cols-1 lg:grid-cols-[0.9fr_1.1fr] gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Pilih obat umum</h2>
            <select value={selectedDrugId} onChange={(event) => setSelectedDrugId(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition">
              {PEDIATRIC_COMMON_DRUGS.map((drug) => <option key={drug.id} value={drug.id}>{drug.name} · {drug.indication}</option>)}
            </select>
            {selectedDrug && <p className="mt-3 text-sm text-slate-500 dark:text-slate-400">{selectedDrug.indication}</p>}
          </div>

          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Output dosis</h2>
            {commonDose ? (
              <div className="space-y-3">
                <Stat label="Dosis terhitung" value={commonDose.doseDisplay} sublabel={`${commonDose.route} · maksimum ${commonDose.maxDose}`} />
                <Stat label="Sediaan referensi" value={commonDose.concentration} sublabel={commonDose.note} />
                <Stat label="Bolus cairan" value={commonDose.fluidBolus} sublabel="Default kristaloid isotonic bila indikasi syok" />
              </div>
            ) : (
              <p className="text-sm text-slate-500 dark:text-slate-400">Masukkan berat badan untuk menghitung dosis obat pediatrik.</p>
            )}
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">Dosis pediatrik harus divalidasi terhadap sediaan aktual, interval, dan protokol PALS / formularium RS anak setempat.</p>
    </div>
  );
}