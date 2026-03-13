import { useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  calcBSA,
  calcChemoDose,
  calcDailyCalories,
  calcHarrisBenedict,
  calcMifflinStJeor,
  calcProteinNeeds,
  colorToClass,
} from '../../utils/medCalculations';

const ACTIVITY_FACTORS = [
  { value: 1.2, label: 'Bedrest / minimal activity (1.2)' },
  { value: 1.3, label: 'Rawat inap ringan (1.3)' },
  { value: 1.5, label: 'Aktivitas sedang (1.5)' },
  { value: 1.7, label: 'Aktivitas tinggi / rehabilitasi (1.7)' },
];

const STRESS_FACTORS = [
  { value: 1, label: 'Tanpa stres metabolik (1.0)' },
  { value: 1.1, label: 'Post-op ringan / infeksi ringan (1.1)' },
  { value: 1.25, label: 'Infeksi sedang / trauma sedang (1.25)' },
  { value: 1.5, label: 'Sepsis / luka bakar / kritis (1.5)' },
];

const PROTEIN_FACTORS = [
  { value: 0.8, label: 'Dewasa stabil / sehat (0.8 g/kg)' },
  { value: 1.0, label: 'Usia lanjut / rawat inap ringan (1.0 g/kg)' },
  { value: 1.2, label: 'Penyakit akut / pasca operasi (1.2 g/kg)' },
  { value: 1.5, label: 'Kritis / sepsis / luka tekan (1.5 g/kg)' },
  { value: 2.0, label: 'Luka bakar / trauma besar (2.0 g/kg)' },
];

function Field({ label, unit, value, onChange, step = 'any', min = 0 }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">{label} {unit && <span className="text-slate-400">({unit})</span>}</label>
      <input
        type="number"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        step={step}
        min={min}
        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
      />
    </div>
  );
}

function ResultCard({ title, result, supporting }) {
  if (!result) return null;
  return (
    <div className={`rounded-2xl border p-4 ${colorToClass(result.color, 'bg')} ${colorToClass(result.color, 'border')}`}>
      <p className={`text-xs font-semibold uppercase tracking-wide ${colorToClass(result.color, 'text')}`}>{title}</p>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className={`text-3xl font-bold ${colorToClass(result.color, 'text')}`}>{result.display}</span>
        <span className={`text-sm ${colorToClass(result.color, 'text')} opacity-80`}>{result.unit}</span>
      </div>
      <p className={`mt-1 text-sm ${colorToClass(result.color, 'text')} opacity-90`}>{result.category}</p>
      {supporting && <p className={`mt-2 text-xs ${colorToClass(result.color, 'text')} opacity-80`}>{supporting}</p>}
    </div>
  );
}

export default function NutritionCalc() {
  const navigate = useNavigate();
  const [gender, setGender] = useState('male');
  const [weightKg, setWeightKg] = useState('');
  const [heightCm, setHeightCm] = useState('');
  const [ageYears, setAgeYears] = useState('');
  const [activityFactor, setActivityFactor] = useState('1.2');
  const [stressFactor, setStressFactor] = useState('1');
  const [proteinFactor, setProteinFactor] = useState('1.2');
  const [protocolMgPerM2, setProtocolMgPerM2] = useState('');

  const mifflin = calcMifflinStJeor(Number(weightKg), Number(heightCm), Number(ageYears), gender);
  const harris = calcHarrisBenedict(Number(weightKg), Number(heightCm), Number(ageYears), gender);
  const calorieResult = calcDailyCalories(mifflin?.value, Number(activityFactor), Number(stressFactor));
  const proteinResult = calcProteinNeeds(Number(weightKg), Number(proteinFactor));
  const bsaResult = calcBSA(Number(weightKg), Number(heightCm));
  const chemoResult = calcChemoDose(bsaResult?.value, Number(protocolMgPerM2));

  const supporting = useMemo(() => {
    if (!mifflin || !harris) return null;
    return `BMR Mifflin ${mifflin.display} kkal/hari · Harris-Benedict ${harris.display} kkal/hari.`;
  }, [mifflin, harris]);

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <button onClick={() => navigate('/tools')} className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition mb-3">
          <span className="material-symbols-outlined text-base">chevron_left</span>
          Tools
        </button>
        <div className="flex items-start gap-3">
          <div className="bg-purple-100 dark:bg-purple-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-purple-600 dark:text-purple-400 text-2xl">nutrition</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Kalkulator Gizi & BSA</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Kebutuhan kalori, protein, BSA, dan estimasi dosis regimen berbasis mg/m².</p>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-[1fr_0.95fr] gap-5">
        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Data dasar pasien</h2>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Berat badan" unit="kg" value={weightKg} onChange={setWeightKg} step="0.1" />
            <Field label="Tinggi badan" unit="cm" value={heightCm} onChange={setHeightCm} step="0.1" />
            <Field label="Usia" unit="tahun" value={ageYears} onChange={setAgeYears} step="1" />
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Jenis kelamin</label>
              <select value={gender} onChange={(event) => setGender(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition">
                <option value="male">Laki-laki</option>
                <option value="female">Perempuan</option>
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Faktor aktivitas</label>
              <select value={activityFactor} onChange={(event) => setActivityFactor(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition">
                {ACTIVITY_FACTORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Faktor stres</label>
              <select value={stressFactor} onChange={(event) => setStressFactor(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition">
                {STRESS_FACTORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <div>
              <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Target protein</label>
              <select value={proteinFactor} onChange={(event) => setProteinFactor(event.target.value)} className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition">
                {PROTEIN_FACTORS.map((item) => <option key={item.value} value={item.value}>{item.label}</option>)}
              </select>
            </div>
            <Field label="Regimen" unit="mg/m²" value={protocolMgPerM2} onChange={setProtocolMgPerM2} step="0.1" />
          </div>
        </div>

        <div className="space-y-3">
          <ResultCard title="Kebutuhan Kalori" result={calorieResult} supporting={supporting} />
          <ResultCard title="Kebutuhan Protein" result={proteinResult} supporting={proteinResult ? `${proteinResult.factor} g/kg × ${weightKg || 0} kg.` : ''} />
          <ResultCard title="Body Surface Area" result={bsaResult} supporting="Menggunakan formula Mosteller." />
          <ResultCard title="Dosis Berbasis BSA" result={chemoResult} supporting={chemoResult ? `${protocolMgPerM2} mg/m² × BSA ${bsaResult?.display} m².` : 'Masukkan protokol mg/m² untuk menghitung total dosis.'} />
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Catatan klinis</p>
            <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Gunakan kebutuhan gizi sebagai starting point. Kondisi seperti CKD, obesitas, luka bakar, dan refeeding risk tetap memerlukan penyesuaian individual.</p>
          </div>
        </div>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">Formula gizi ini bersifat estimasi awal dan tidak menggantikan asesmen nutrisi klinis lengkap atau order kemoterapi tervalidasi.</p>
    </div>
  );
}