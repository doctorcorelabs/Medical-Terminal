import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { calcDropRate, calcDrugInfusion, calcInfusionRate, colorToClass } from '../../utils/medCalculations';

function ResultCard({ title, result, extra }) {
  if (!result) return null;
  return (
    <div className={`rounded-2xl border p-4 ${colorToClass(result.color, 'bg')} ${colorToClass(result.color, 'border')}`}>
      <p className={`text-xs font-medium uppercase tracking-wide ${colorToClass(result.color, 'text')}`}>{title}</p>
      <div className="mt-2 flex items-baseline gap-2 flex-wrap">
        <span className={`text-3xl font-bold ${colorToClass(result.color, 'text')}`}>{result.display}</span>
        <span className={`text-sm ${colorToClass(result.color, 'text')} opacity-80`}>{result.unit}</span>
      </div>
      {extra && <p className={`mt-2 text-sm ${colorToClass(result.color, 'text')} opacity-90`}>{extra}</p>}
    </div>
  );
}

function Field({ label, unit, value, onChange, min = 0, step = 'any' }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">
        {label} {unit && <span className="text-slate-400">({unit})</span>}
      </label>
      <input
        type="number"
        min={min}
        step={step}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
        placeholder="0"
      />
    </div>
  );
}

export default function InfusionCalc() {
  const navigate = useNavigate();
  const [tab, setTab] = useState('volume');

  const [volumeMl, setVolumeMl] = useState('');
  const [durationHours, setDurationHours] = useState('');
  const [durationMinutes, setDurationMinutes] = useState('');
  const [dropFactor, setDropFactor] = useState('20');

  const [dose, setDose] = useState('');
  const [doseUnit, setDoseUnit] = useState('mcg/kg/min');
  const [weightKg, setWeightKg] = useState('');
  const [concentrationMgPerMl, setConcentrationMgPerMl] = useState('');

  const totalMinutes = (Number(durationHours || 0) * 60) + Number(durationMinutes || 0);
  const volumeResult = calcInfusionRate(Number(volumeMl), Number(durationHours), Number(durationMinutes));
  const dropResult = calcDropRate(Number(volumeMl), totalMinutes, Number(dropFactor));
  const drugResult = calcDrugInfusion({
    dose: Number(dose),
    doseUnit,
    weightKg: Number(weightKg),
    concentrationMgPerMl: Number(concentrationMgPerMl),
  });

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
          <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">fluid</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Infus & Konversi Kecepatan</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Dua mode kerja: konversi cairan standar dan kalkulasi pump setting obat kontinu.</p>
          </div>
        </div>
      </div>

      <div className="inline-flex rounded-xl bg-slate-100 dark:bg-slate-800 p-1 border border-slate-200 dark:border-slate-700 mb-5">
        {[
          { id: 'volume', label: 'Volume / Tetesan' },
          { id: 'drug', label: 'Obat Kontinu' },
        ].map((item) => (
          <button
            key={item.id}
            onClick={() => setTab(item.id)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${tab === item.id ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200'}`}
          >
            {item.label}
          </button>
        ))}
      </div>

      {tab === 'volume' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Konversi volume ke laju infus</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Volume" unit="mL" value={volumeMl} onChange={setVolumeMl} min={1} step="1" />
              <Field label="Durasi" unit="jam" value={durationHours} onChange={setDurationHours} min={0} step="1" />
              <Field label="Tambahan menit" unit="menit" value={durationMinutes} onChange={setDurationMinutes} min={0} step="1" />
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Faktor tetes</label>
                <select
                  value={dropFactor}
                  onChange={(event) => setDropFactor(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                >
                  <option value="10">10 gtt/mL</option>
                  <option value="15">15 gtt/mL</option>
                  <option value="20">20 gtt/mL</option>
                  <option value="60">60 gtt/mL (mikro)</option>
                </select>
              </div>
            </div>
          </div>

          <div className="space-y-3">
            <ResultCard title="Pump Rate" result={volumeResult} extra={volumeResult ? `Durasi total ${volumeResult.totalHours.toLocaleString('id-ID', { maximumFractionDigits: 2 })} jam` : ''} />
            <ResultCard title="Drop Rate" result={dropResult} extra={dropResult ? `Bulatkan menjadi ${dropResult.roundedDisplay} gtt/menit untuk set manual.` : ''} />
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Rumus</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">mL/jam = volume ÷ durasi (jam). gtt/menit = volume × faktor tetes ÷ total menit.</p>
            </div>
          </div>
        </div>
      )}

      {tab === 'drug' && (
        <div className="grid grid-cols-1 lg:grid-cols-[1.2fr_0.8fr] gap-5">
          <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800/60 p-4 sm:p-5">
            <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100 mb-4">Konversi dosis obat ke mL/jam</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <Field label="Target dosis" unit={doseUnit} value={dose} onChange={setDose} min={0} step="0.01" />
              <div>
                <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1.5">Satuan dosis</label>
                <select
                  value={doseUnit}
                  onChange={(event) => setDoseUnit(event.target.value)}
                  className="w-full rounded-xl border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 px-4 py-3 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
                >
                  <option value="mcg/kg/min">mcg/kg/menit</option>
                  <option value="mg/kg/jam">mg/kg/jam</option>
                  <option value="mg/jam">mg/jam</option>
                </select>
              </div>
              <Field label="Berat badan" unit="kg" value={weightKg} onChange={setWeightKg} min={0} step="0.1" />
              <Field label="Konsentrasi akhir" unit="mg/mL" value={concentrationMgPerMl} onChange={setConcentrationMgPerMl} min={0} step="0.001" />
            </div>
            <p className="mt-3 text-xs text-slate-400">Contoh: 200 mg norepinefrin dalam 50 mL menghasilkan konsentrasi 4 mg/mL.</p>
          </div>

          <div className="space-y-3">
            <ResultCard title="Pump Setting" result={drugResult} extra={drugResult ? `${drugResult.descriptor} setara ${drugResult.mgPerHourDisplay}.` : ''} />
            <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 p-4">
              <p className="text-sm font-medium text-slate-700 dark:text-slate-200">Catatan</p>
              <p className="mt-2 text-sm text-slate-500 dark:text-slate-400 leading-relaxed">Jika satuan berbasis kg, berat badan wajib diisi. Gunakan konsentrasi aktual setelah rekonstitusi dan pengenceran akhir, bukan kandungan per vial.</p>
            </div>
          </div>
        </div>
      )}

      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Tool ini membantu konversi angka. Validasi kembali order, satuan, serta kompatibilitas pompa sebelum pemberian kepada pasien.
      </p>
    </div>
  );
}