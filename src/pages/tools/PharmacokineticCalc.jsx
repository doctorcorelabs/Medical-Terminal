import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  calcHalfLife,
  calcLoadingDose,
  calcMaintenanceDose,
  calcSteadyStateConcentration,
  calcTimeToSteadyState,
  colorToClass,
} from '../../utils/medCalculations';

function Field({ label, unit, value, onChange, step = 'any', min = 0, hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
        {label} {unit && <span className="text-slate-400">({unit})</span>}
      </label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        placeholder="0"
      />
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function ResultBadge({ result, supporting }) {
  if (!result) return null;
  return (
    <div className={`mt-4 rounded-xl p-4 ${colorToClass(result.color, 'bg')} border-l-4 ${colorToClass(result.color, 'border')}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-3xl font-bold tabular-nums ${colorToClass(result.color, 'text')}`}>{result.display}</span>
        {result.unit && <span className={`text-sm ${colorToClass(result.color, 'text')} opacity-80`}>{result.unit}</span>}
      </div>
      <p className={`mt-1 text-sm font-semibold ${colorToClass(result.color, 'text')}`}>{result.category}</p>
      {supporting && <p className={`mt-1 text-xs ${colorToClass(result.color, 'text')} opacity-85`}>{supporting}</p>}
    </div>
  );
}

function CalcCard({ title, icon, description, children, result, supporting }) {
  return (
    <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 overflow-hidden">
      <div className="flex items-center gap-3 px-5 py-4 border-b border-slate-100 dark:border-slate-700/60">
        <div className="w-10 h-10 rounded-xl bg-slate-100 dark:bg-slate-700 flex items-center justify-center shrink-0">
          <span className="material-symbols-outlined text-slate-500 dark:text-slate-300">{icon}</span>
        </div>
        <div>
          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{description}</p>
        </div>
      </div>
      <div className="px-5 py-4">
        <div className="space-y-3">{children}</div>
        <ResultBadge result={result} supporting={supporting} />
      </div>
    </div>
  );
}

export default function PharmacokineticCalc() {
  const navigate = useNavigate();

  const [halfLifeVd, setHalfLifeVd] = useState('');
  const [halfLifeCl, setHalfLifeCl] = useState('');

  const [loadingVd, setLoadingVd] = useState('');
  const [loadingTarget, setLoadingTarget] = useState('');
  const [loadingWeight, setLoadingWeight] = useState('');
  const [loadingF, setLoadingF] = useState('1');

  const [maintenanceCl, setMaintenanceCl] = useState('');
  const [maintenanceTarget, setMaintenanceTarget] = useState('');
  const [maintenanceInterval, setMaintenanceInterval] = useState('');
  const [maintenanceWeight, setMaintenanceWeight] = useState('');
  const [maintenanceF, setMaintenanceF] = useState('1');

  const [cssDose, setCssDose] = useState('');
  const [cssF, setCssF] = useState('1');
  const [cssCl, setCssCl] = useState('');
  const [cssWeight, setCssWeight] = useState('');
  const [cssInterval, setCssInterval] = useState('');

  const [steadyVd, setSteadyVd] = useState('');
  const [steadyCl, setSteadyCl] = useState('');

  const halfLife = calcHalfLife(Number(halfLifeVd), Number(halfLifeCl));
  const loadingDose = calcLoadingDose(Number(loadingVd), Number(loadingTarget), Number(loadingWeight), Number(loadingF));
  const maintenanceDose = calcMaintenanceDose(Number(maintenanceCl), Number(maintenanceTarget), Number(maintenanceInterval), Number(maintenanceWeight), Number(maintenanceF));
  const steadyState = calcSteadyStateConcentration(Number(cssDose), Number(cssF), Number(cssCl), Number(cssWeight), Number(cssInterval));
  const timeToSteady = calcTimeToSteadyState(Number(steadyVd), Number(steadyCl));

  return (
    <div className="p-4 sm:p-6 max-w-5xl mx-auto">
      <div className="mb-5">
        <button
          onClick={() => navigate('/tools')}
          className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-slate-400 hover:text-primary transition mb-3"
        >
          <span className="material-symbols-outlined text-base">chevron_left</span>
          Tools
        </button>
        <div className="flex items-start gap-3">
          <div className="bg-rose-100 dark:bg-rose-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-rose-600 dark:text-rose-400 text-2xl">monitoring</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Farmakokinetik Klinis</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Hitung parameter dasar distribusi dan eliminasi untuk menyiapkan regimen berbasis target konsentrasi.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        <CalcCard
          title="Half-life"
          icon="hourglass_top"
          description="Estimasi waktu paruh dari volume distribusi dan clearance"
          result={halfLife}
          supporting="Rumus: 0.693 × Vd / CL"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Volume distribusi" unit="L/kg" value={halfLifeVd} onChange={setHalfLifeVd} step="0.01" hint="Contoh vancomisin sekitar 0.7 L/kg" />
            <Field label="Clearance" unit="L/jam/kg" value={halfLifeCl} onChange={setHalfLifeCl} step="0.001" hint="Masukkan clearance per kg" />
          </div>
        </CalcCard>

        <CalcCard
          title="Loading Dose"
          icon="rocket_launch"
          description="Menaksir dosis awal untuk segera mencapai target konsentrasi"
          result={loadingDose}
          supporting="Rumus: (Vd × target concentration × berat) / F"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vd" unit="L/kg" value={loadingVd} onChange={setLoadingVd} step="0.01" />
            <Field label="Target konsentrasi" unit="mg/L" value={loadingTarget} onChange={setLoadingTarget} step="0.1" />
            <Field label="Berat badan" unit="kg" value={loadingWeight} onChange={setLoadingWeight} step="0.1" />
            <Field label="Bioavailabilitas (F)" unit="0-1" value={loadingF} onChange={setLoadingF} step="0.01" hint="IV = 1.0, oral bisa < 1" />
          </div>
        </CalcCard>

        <CalcCard
          title="Maintenance Dose"
          icon="sync"
          description="Dosis per interval untuk mempertahankan target konsentrasi rata-rata"
          result={maintenanceDose}
          supporting="Rumus: (CL × target concentration × interval × berat) / F"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Clearance" unit="L/jam/kg" value={maintenanceCl} onChange={setMaintenanceCl} step="0.001" />
            <Field label="Target konsentrasi" unit="mg/L" value={maintenanceTarget} onChange={setMaintenanceTarget} step="0.1" />
            <Field label="Interval dosis" unit="jam" value={maintenanceInterval} onChange={setMaintenanceInterval} step="0.5" />
            <Field label="Berat badan" unit="kg" value={maintenanceWeight} onChange={setMaintenanceWeight} step="0.1" />
            <Field label="Bioavailabilitas (F)" unit="0-1" value={maintenanceF} onChange={setMaintenanceF} step="0.01" />
          </div>
        </CalcCard>

        <CalcCard
          title="Steady State Concentration"
          icon="stacked_line_chart"
          description="Prediksi konsentrasi rata-rata steady state dari regimen yang sudah direncanakan"
          result={steadyState}
          supporting="Rumus: (F × dose) / (CL × berat × interval)"
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Dosis tiap pemberian" unit="mg" value={cssDose} onChange={setCssDose} step="0.1" />
            <Field label="Bioavailabilitas (F)" unit="0-1" value={cssF} onChange={setCssF} step="0.01" />
            <Field label="Clearance" unit="L/jam/kg" value={cssCl} onChange={setCssCl} step="0.001" />
            <Field label="Berat badan" unit="kg" value={cssWeight} onChange={setCssWeight} step="0.1" />
            <Field label="Interval dosis" unit="jam" value={cssInterval} onChange={setCssInterval} step="0.5" />
          </div>
        </CalcCard>

        <CalcCard
          title="Time to Steady State"
          icon="schedule"
          description="Estimasi waktu mencapai steady state, biasanya 4-5 kali waktu paruh"
          result={timeToSteady}
          supporting={timeToSteady ? `Berdasarkan half-life sekitar ${timeToSteady.halfLifeHours.toLocaleString('id-ID', { maximumFractionDigits: 2 })} jam.` : 'Rumus: 4-5 × t1/2'}
        >
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field label="Vd" unit="L/kg" value={steadyVd} onChange={setSteadyVd} step="0.01" />
            <Field label="Clearance" unit="L/jam/kg" value={steadyCl} onChange={setSteadyCl} step="0.001" />
          </div>
        </CalcCard>
      </div>

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Model ini bersifat simplified one-compartment. Untuk TDM nyata, tetap gunakan level obat, fungsi organ, dan protokol farmasi klinik setempat.
      </p>
    </div>
  );
}