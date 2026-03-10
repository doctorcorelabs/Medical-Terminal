import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  calcBMI, calcBSA, calcIBW, calcEGFR,
  calcMEWS, calcCURB65, calcCorrectedCalcium,
  calcCorrectedSodium, calcAPGAR, colorToClass,
} from '../../utils/medCalculations';

// ─── Category definitions ─────────────────────────────────────────────────────
const CATEGORIES = [
  { id: 'anthropometry', label: 'Antropometri',    icon: 'monitor_weight' },
  { id: 'renal',         label: 'Fungsi Ginjal',   icon: 'water_drop' },
  { id: 'clinical',      label: 'Skor Klinis',     icon: 'vital_signs' },
  { id: 'correction',    label: 'Koreksi Lab',     icon: 'science' },
  { id: 'neonatal',      label: 'Neonatal',        icon: 'child_care' },
];

const CALC_CATEGORIES = {
  bmi:        'anthropometry',
  bsa:        'anthropometry',
  ibw:        'anthropometry',
  egfr:       'renal',
  mews:       'clinical',
  curb65:     'clinical',
  corr_ca:    'correction',
  corr_na:    'correction',
  apgar:      'neonatal',
};

// ─── Result badge ─────────────────────────────────────────────────────────────
function ResultBadge({ result }) {
  if (!result) return null;
  const bgClass   = colorToClass(result.color, 'bg');
  const textClass = colorToClass(result.color, 'text');
  return (
    <div className={`mt-4 rounded-xl p-4 ${bgClass} border-l-4 ${colorToClass(result.color, 'border')}`}>
      <div className="flex items-baseline gap-2 flex-wrap">
        <span className={`text-3xl font-bold tabular-nums ${textClass}`}>{result.display}</span>
        {result.unit && <span className={`text-sm ${textClass} opacity-70`}>{result.unit}</span>}
        {result.stage && <span className={`ml-1 text-xs font-semibold px-2 py-0.5 rounded-full bg-white/40 dark:bg-black/20 ${textClass}`}>CKD {result.stage}</span>}
      </div>
      <p className={`mt-1 text-sm font-semibold ${textClass}`}>{result.category}</p>
      {result.action && <p className={`mt-0.5 text-xs ${textClass} opacity-80`}>{result.action}</p>}
      {result.management && <p className={`mt-0.5 text-xs ${textClass} opacity-80`}>{result.management}</p>}
      {result.mortality && <p className={`mt-0.5 text-xs ${textClass} opacity-70`}>Mortalitas estimasi: {result.mortality}</p>}
    </div>
  );
}

// ─── Score items list (MEWS, CURB-65, APGAR) ─────────────────────────────────
function ScoreBreakdown({ items }) {
  if (!items?.length) return null;
  return (
    <div className="mt-3 space-y-1.5">
      {items.map((item, i) => (
        <div key={i} className="flex items-center justify-between text-xs py-1.5 px-3 bg-slate-50 dark:bg-slate-700/40 rounded-lg">
          <span className="text-slate-600 dark:text-slate-300">{item.label}</span>
          <div className="flex items-center gap-3">
            <span className="text-slate-500 dark:text-slate-400">{item.value}{item.unit}</span>
            <span className={`font-bold w-5 text-center rounded
              ${item.score >= 3 ? 'text-red-600 dark:text-red-400'
                : item.score >= 2 ? 'text-orange-600 dark:text-orange-400'
                : item.score >= 1 ? 'text-yellow-600 dark:text-yellow-400'
                : 'text-emerald-600 dark:text-emerald-400'}`}>
              {item.score}
            </span>
          </div>
        </div>
      ))}
    </div>
  );
}

// ─── Field helpers ────────────────────────────────────────────────────────────
function Field({ label, unit, value, onChange, type = 'number', min, max, step = 'any', hint }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">
        {label} {unit && <span className="text-slate-400">({unit})</span>}
      </label>
      <div className="relative">
        <input
          type={type}
          value={value}
          onChange={e => onChange(e.target.value)}
          min={min} max={max} step={step}
          className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
          placeholder="—"
        />
      </div>
      {hint && <p className="mt-0.5 text-[11px] text-slate-400">{hint}</p>}
    </div>
  );
}

function SelectField({ label, value, onChange, options }) {
  return (
    <div>
      <label className="block text-xs font-medium text-slate-600 dark:text-slate-400 mb-1">{label}</label>
      <select
        value={value}
        onChange={e => onChange(e.target.value)}
        className="w-full px-3 py-2 rounded-lg border border-slate-200 dark:border-slate-600 bg-white dark:bg-slate-700 text-slate-900 dark:text-slate-100 text-sm focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition"
      >
        <option value="">Pilih...</option>
        {options.map(o => <option key={o.value} value={o.value}>{o.label}</option>)}
      </select>
    </div>
  );
}

function CheckField({ label, sublabel, checked, onChange }) {
  return (
    <label className="flex items-start gap-3 cursor-pointer group py-1">
      <div className={`mt-0.5 w-5 h-5 rounded border-2 flex items-center justify-center transition shrink-0
        ${checked ? 'bg-primary border-primary' : 'border-slate-300 dark:border-slate-600 bg-white dark:bg-slate-700'}`}
        onClick={() => onChange(!checked)}
      >
        {checked && <span className="material-symbols-outlined text-white text-[14px]">check</span>}
      </div>
      <div>
        <p className="text-sm text-slate-700 dark:text-slate-300 font-medium leading-tight">{label}</p>
        {sublabel && <p className="text-[11px] text-slate-400 mt-0.5">{sublabel}</p>}
      </div>
    </label>
  );
}

// ─── Calculator Card wrapper ──────────────────────────────────────────────────
function CalcCard({ id, title, icon, description, children, result, scoreItems, onReset, active, onActivate }) {
  return (
    <div
      className={`rounded-2xl border bg-white dark:bg-slate-800/60 transition-all duration-200 overflow-hidden
        ${active ? 'border-primary/40 dark:border-primary/40 shadow-lg shadow-primary/5' : 'border-slate-200 dark:border-slate-700'}`}
    >
      {/* Card header — clickable on mobile for accordion */}
      <button
        onClick={() => onActivate(active ? null : id)}
        className="w-full flex items-center gap-3 px-5 py-4 text-left"
      >
        <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 transition
          ${active ? 'bg-primary/15 dark:bg-primary/25' : 'bg-slate-100 dark:bg-slate-700'}`}>
          <span className={`material-symbols-outlined text-xl ${active ? 'text-primary' : 'text-slate-500 dark:text-slate-400'}`}>{icon}</span>
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-semibold text-slate-900 dark:text-slate-100 text-sm">{title}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400 truncate">{description}</p>
        </div>
        <span className={`material-symbols-outlined text-slate-400 text-xl shrink-0 transition-transform ${active ? 'rotate-180' : ''}`}>expand_more</span>
      </button>

      {/* Expandable content */}
      {active && (
        <div className="px-5 pb-5 border-t border-slate-100 dark:border-slate-700/60 pt-4">
          <div className="space-y-3">
            {children}
          </div>
          {result && (
            <>
              <ResultBadge result={result} />
              {scoreItems && <ScoreBreakdown items={scoreItems} />}
              <button
                onClick={onReset}
                className="mt-3 text-xs text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 flex items-center gap-1 transition"
              >
                <span className="material-symbols-outlined text-sm">refresh</span> Reset
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function MedCalculator() {
  const navigate = useNavigate();
  const [activeCategory, setActiveCategory] = useState('anthropometry');
  const [activeCalc, setActiveCalc] = useState(null);

  // ── BMI ──
  const [bmiWeight, setBmiWeight] = useState('');
  const [bmiHeight, setBmiHeight] = useState('');
  const bmiResult = bmiWeight && bmiHeight ? calcBMI(Number(bmiWeight), Number(bmiHeight)) : null;

  // ── BSA ──
  const [bsaWeight, setBsaWeight] = useState('');
  const [bsaHeight, setBsaHeight] = useState('');
  const bsaResult = bsaWeight && bsaHeight ? calcBSA(Number(bsaWeight), Number(bsaHeight)) : null;

  // ── IBW ──
  const [ibwHeight, setIbwHeight] = useState('');
  const [ibwGender, setIbwGender] = useState('');
  const ibwResult = ibwHeight && ibwGender ? calcIBW(Number(ibwHeight), ibwGender) : null;

  // ── eGFR ──
  const [egfrCr, setEgfrCr] = useState('');
  const [egfrAge, setEgfrAge] = useState('');
  const [egfrGender, setEgfrGender] = useState('');
  const egfrResult = egfrCr && egfrAge && egfrGender ? calcEGFR(Number(egfrCr), Number(egfrAge), egfrGender) : null;

  // ── MEWS ──
  const [mewsSbp, setMewsSbp] = useState('');
  const [mewsHr, setMewsHr] = useState('');
  const [mewsRr, setMewsRr] = useState('');
  const [mewsTemp, setMewsTemp] = useState('');
  const [mewsAvpu, setMewsAvpu] = useState('');
  const mewsResult = mewsSbp && mewsHr && mewsRr && mewsTemp && mewsAvpu
    ? calcMEWS(Number(mewsSbp), Number(mewsHr), Number(mewsRr), Number(mewsTemp), mewsAvpu) : null;

  // ── CURB-65 ──
  const [curbConfusion, setCurbConfusion] = useState(false);
  const [curbBun, setCurbBun] = useState('');
  const [curbRr, setCurbRr] = useState('');
  const [curbSbp, setCurbSbp] = useState('');
  const [curbDbp, setCurbDbp] = useState('');
  const [curbAge, setCurbAge] = useState('');
  const curbReady = curbBun !== '' && curbRr !== '' && curbSbp !== '' && curbDbp !== '' && curbAge !== '';
  const curbResult = curbReady
    ? calcCURB65(curbConfusion, Number(curbBun), Number(curbRr), Number(curbSbp), Number(curbDbp), Number(curbAge)) : null;

  // ── Corrected Ca ──
  const [corrCaMeasured, setCorrCaMeasured] = useState('');
  const [corrCaAlbumin, setCorrCaAlbumin] = useState('');
  const corrCaResult = corrCaMeasured && corrCaAlbumin ? calcCorrectedCalcium(Number(corrCaMeasured), Number(corrCaAlbumin)) : null;

  // ── Corrected Na ──
  const [corrNaMeasured, setCorrNaMeasured] = useState('');
  const [corrNaGlucose, setCorrNaGlucose] = useState('');
  const corrNaResult = corrNaMeasured && corrNaGlucose ? calcCorrectedSodium(Number(corrNaMeasured), Number(corrNaGlucose)) : null;

  // ── APGAR ──
  const [apgarVals, setApgarVals] = useState({ appearance: '', pulse: '', grimace: '', activity: '', respiration: '' });
  const apgarReady = Object.values(apgarVals).every(v => v !== '');
  const apgarResult = apgarReady ? calcAPGAR(...Object.values(apgarVals).map(Number)) : null;

  const resetCalc = (id) => {
    if (id === 'bmi') { setBmiWeight(''); setBmiHeight(''); }
    if (id === 'bsa') { setBsaWeight(''); setBsaHeight(''); }
    if (id === 'ibw') { setIbwHeight(''); setIbwGender(''); }
    if (id === 'egfr') { setEgfrCr(''); setEgfrAge(''); setEgfrGender(''); }
    if (id === 'mews') { setMewsSbp(''); setMewsHr(''); setMewsRr(''); setMewsTemp(''); setMewsAvpu(''); }
    if (id === 'curb65') { setCurbConfusion(false); setCurbBun(''); setCurbRr(''); setCurbSbp(''); setCurbDbp(''); setCurbAge(''); }
    if (id === 'corr_ca') { setCorrCaMeasured(''); setCorrCaAlbumin(''); }
    if (id === 'corr_na') { setCorrNaMeasured(''); setCorrNaGlucose(''); }
    if (id === 'apgar') { setApgarVals({ appearance: '', pulse: '', grimace: '', activity: '', respiration: '' }); }
  };

  const catCalcs = Object.entries(CALC_CATEGORIES)
    .filter(([, cat]) => cat === activeCategory)
    .map(([id]) => id);

  const calcDefs = {
    bmi: {
      title: 'Body Mass Index (BMI)',
      icon: 'monitor_weight',
      description: 'Indeks massa tubuh berdasarkan berat dan tinggi',
      result: bmiResult,
      content: (
        <>
          <Field label="Berat Badan" unit="kg" value={bmiWeight} onChange={setBmiWeight} min={1} max={300} />
          <Field label="Tinggi Badan" unit="cm" value={bmiHeight} onChange={setBmiHeight} min={50} max={250} />
        </>
      ),
    },
    bsa: {
      title: 'Body Surface Area (BSA)',
      icon: 'straighten',
      description: 'Luas permukaan tubuh — formula Mosteller',
      result: bsaResult,
      content: (
        <>
          <Field label="Berat Badan" unit="kg" value={bsaWeight} onChange={setBsaWeight} min={1} max={300} />
          <Field label="Tinggi Badan" unit="cm" value={bsaHeight} onChange={setBsaHeight} min={50} max={250} />
        </>
      ),
    },
    ibw: {
      title: 'Ideal Body Weight (IBW)',
      icon: 'fitness_center',
      description: 'Berat badan ideal — formula Devine',
      result: ibwResult,
      content: (
        <>
          <Field label="Tinggi Badan" unit="cm" value={ibwHeight} onChange={setIbwHeight} min={50} max={250} />
          <SelectField label="Jenis Kelamin" value={ibwGender} onChange={setIbwGender} options={[{ value: 'male', label: 'Laki-laki' }, { value: 'female', label: 'Perempuan' }]} />
        </>
      ),
    },
    egfr: {
      title: 'eGFR (CKD-EPI 2021)',
      icon: 'water_drop',
      description: 'Estimated GFR — race-free CKD-EPI 2021',
      result: egfrResult,
      content: (
        <>
          <Field label="Kreatinin Serum" unit="mg/dL" value={egfrCr} onChange={setEgfrCr} min={0.1} max={20} step="0.01" />
          <Field label="Usia" unit="tahun" value={egfrAge} onChange={setEgfrAge} min={18} max={120} />
          <SelectField label="Jenis Kelamin" value={egfrGender} onChange={setEgfrGender} options={[{ value: 'male', label: 'Laki-laki' }, { value: 'female', label: 'Perempuan' }]} />
        </>
      ),
    },
    mews: {
      title: 'MEWS Score',
      icon: 'vital_signs',
      description: 'Modified Early Warning Score — deteksi deteriorasi klinis',
      result: mewsResult,
      scoreItems: mewsResult?.scoreItems,
      content: (
        <>
          <Field label="Tekanan Darah Sistolik" unit="mmHg" value={mewsSbp} onChange={setMewsSbp} min={40} max={300} />
          <Field label="Denyut Nadi" unit="bpm" value={mewsHr} onChange={setMewsHr} min={10} max={250} />
          <Field label="Laju Napas" unit="/mnt" value={mewsRr} onChange={setMewsRr} min={0} max={60} />
          <Field label="Suhu" unit="°C" value={mewsTemp} onChange={setMewsTemp} min={30} max={43} step="0.1" />
          <SelectField label="Kesadaran (AVPU)" value={mewsAvpu} onChange={setMewsAvpu}
            options={[
              { value: 'A', label: 'A — Alert (Sadar Penuh)' },
              { value: 'V', label: 'V — Voice (Respons Suara)' },
              { value: 'P', label: 'P — Pain (Respons Nyeri)' },
              { value: 'U', label: 'U — Unresponsive (Tidak Respons)' },
            ]} />
        </>
      ),
    },
    curb65: {
      title: 'CURB-65',
      icon: 'pulmonology',
      description: 'Skor risiko mortalitas pneumonia komunitas',
      result: curbResult,
      scoreItems: curbResult?.items,
      content: (
        <>
          <CheckField
            label="Confusion (kebingungan baru)"
            sublabel="Disorientasi orang, tempat, atau waktu yang baru muncul"
            checked={curbConfusion}
            onChange={setCurbConfusion}
          />
          <Field label="Blood Urea Nitrogen (BUN)" unit="mg/dL" value={curbBun} onChange={setCurbBun} min={0} max={300} />
          <Field label="Laju Napas" unit="/mnt" value={curbRr} onChange={setCurbRr} min={0} max={60} />
          <div className="grid grid-cols-2 gap-2">
            <Field label="TD Sistolik" unit="mmHg" value={curbSbp} onChange={setCurbSbp} min={40} max={300} />
            <Field label="TD Diastolik" unit="mmHg" value={curbDbp} onChange={setCurbDbp} min={20} max={200} />
          </div>
          <Field label="Usia" unit="tahun" value={curbAge} onChange={setCurbAge} min={0} max={120} />
        </>
      ),
    },
    corr_ca: {
      title: 'Kalsium Terkoreksi',
      icon: 'science',
      description: 'Koreksi kalsium terhadap kadar albumin',
      result: corrCaResult,
      content: (
        <>
          <Field label="Kalsium Terukur" unit="mg/dL" value={corrCaMeasured} onChange={setCorrCaMeasured} min={0} max={20} step="0.1"
            hint="Rentang normal: 8.5–10.5 mg/dL" />
          <Field label="Albumin" unit="g/dL" value={corrCaAlbumin} onChange={setCorrCaAlbumin} min={0} max={10} step="0.1"
            hint="Albumin normal = 4.0 g/dL" />
        </>
      ),
    },
    corr_na: {
      title: 'Natrium Terkoreksi',
      icon: 'science',
      description: 'Koreksi natrium pada hiperglikemia',
      result: corrNaResult,
      content: (
        <>
          <Field label="Natrium Terukur" unit="mEq/L" value={corrNaMeasured} onChange={setCorrNaMeasured} min={100} max={180}
            hint="Rentang normal: 135–145 mEq/L" />
          <Field label="Glukosa Darah" unit="mg/dL" value={corrNaGlucose} onChange={setCorrNaGlucose} min={50} max={2000}
            hint="Glukosa normal = 100 mg/dL" />
        </>
      ),
    },
    apgar: {
      title: 'Skor APGAR',
      icon: 'child_care',
      description: 'Penilaian kondisi neonatus — 1 & 5 menit pasca lahir',
      result: apgarResult,
      scoreItems: apgarResult?.items,
      content: (
        <div className="space-y-3">
          {[
            { key: 'appearance',  label: 'Warna Kulit (A)', options: ['0 — Seluruh tubuh biru/pucat', '1 — Tubuh merah, ekstremitas biru', '2 — Seluruh tubuh merah'] },
            { key: 'pulse',       label: 'Denyut Jantung (P)', options: ['0 — Tidak ada', '1 — < 100 bpm', '2 — ≥ 100 bpm'] },
            { key: 'grimace',     label: 'Refleks (G)', options: ['0 — Tidak ada respons', '1 — Meringis', '2 — Menangis kuat/bersin'] },
            { key: 'activity',    label: 'Tonus Otot (A)', options: ['0 — Lumpuh', '1 — Sedikit fleksi', '2 — Gerak aktif'] },
            { key: 'respiration', label: 'Usaha Napas (R)', options: ['0 — Tidak ada', '1 — Napas tidak teratur/lemah', '2 — Menangis kuat'] },
          ].map(({ key, label, options }) => (
            <SelectField
              key={key}
              label={label}
              value={apgarVals[key]}
              onChange={v => setApgarVals(prev => ({ ...prev, [key]: v }))}
              options={options.map((o, i) => ({ value: String(i), label: o }))}
            />
          ))}
        </div>
      ),
    },
  };

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
        <div className="flex items-center gap-3">
          <div className="bg-emerald-100 dark:bg-emerald-900/30 rounded-xl p-2.5 shrink-0">
            <span className="material-symbols-outlined text-emerald-600 dark:text-emerald-400 text-2xl">calculate</span>
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-bold text-slate-900 dark:text-slate-100">Kalkulator Medis</h1>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400">Kalkulasi klinis berbasis formula terstandarisasi</p>
          </div>
        </div>
      </div>

      {/* ── Category Tabs ── */}
      <div className="flex gap-2 overflow-x-auto pb-1 mb-6 scrollbar-hide snap-x">
        {CATEGORIES.map(cat => (
          <button
            key={cat.id}
            onClick={() => { setActiveCategory(cat.id); setActiveCalc(null); }}
            className={`flex items-center gap-2 px-3.5 py-2 rounded-xl text-sm font-medium whitespace-nowrap transition-all shrink-0 snap-start
              ${activeCategory === cat.id
                ? 'bg-primary text-white shadow-sm shadow-primary/30'
                : 'bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-primary/30 hover:text-primary'
              }`}
          >
            <span className="material-symbols-outlined text-[18px]">{cat.icon}</span>
            {cat.label}
          </button>
        ))}
      </div>

      {/* ── Calculator Cards ── */}
      <div className="space-y-3">
        {catCalcs.map(id => {
          const def = calcDefs[id];
          if (!def) return null;
          const isActive = activeCalc === id;
          return (
            <CalcCard
              key={id}
              id={id}
              title={def.title}
              icon={def.icon}
              description={def.description}
              result={def.result}
              scoreItems={def.scoreItems}
              active={isActive}
              onActivate={setActiveCalc}
              onReset={() => resetCalc(id)}
            >
              {def.content}
            </CalcCard>
          );
        })}
      </div>

      {/* ── Footer note ── */}
      <p className="mt-8 text-center text-xs text-slate-400 dark:text-slate-500">
        Formula: CKD-EPI 2021 (eGFR) · Mosteller (BSA) · Devine (IBW) · Hasil kalkulasi hanya sebagai alat bantu klinis
      </p>
    </div>
  );
}
