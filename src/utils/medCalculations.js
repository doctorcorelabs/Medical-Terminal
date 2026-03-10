// Medical formula calculations — all pure functions, no side effects

// ─── BMI ──────────────────────────────────────────────────────────────────────
export function calcBMI(weightKg, heightCm) {
  if (!weightKg || !heightCm || heightCm <= 0) return null;
  const h = heightCm / 100;
  const bmi = weightKg / (h * h);
  let category, color;
  if (bmi < 18.5)       { category = 'Berat Badan Kurang';  color = 'blue'; }
  else if (bmi < 25)    { category = 'Berat Badan Normal';  color = 'green'; }
  else if (bmi < 30)    { category = 'Berat Badan Lebih';   color = 'yellow'; }
  else if (bmi < 35)    { category = 'Obesitas I';          color = 'orange'; }
  else                  { category = 'Obesitas II';          color = 'red'; }
  return { value: bmi, display: bmi.toFixed(1), unit: 'kg/m²', category, color };
}

// ─── BSA — Mosteller formula ──────────────────────────────────────────────────
export function calcBSA(weightKg, heightCm) {
  if (!weightKg || !heightCm) return null;
  const bsa = Math.sqrt((heightCm * weightKg) / 3600);
  let category, color;
  if (bsa < 1.5)        { category = 'Sangat Kecil';  color = 'blue'; }
  else if (bsa <= 2.0)  { category = 'Normal';         color = 'green'; }
  else                  { category = 'Di atas Normal'; color = 'yellow'; }
  return { value: bsa, display: bsa.toFixed(2), unit: 'm²', category, color };
}

// ─── IBW — Devine formula ─────────────────────────────────────────────────────
export function calcIBW(heightCm, gender) {
  if (!heightCm || !gender) return null;
  const heightInches = heightCm / 2.54;
  const excessInches = Math.max(0, heightInches - 60);
  const ibw = gender === 'male'
    ? 50 + 2.3 * excessInches
    : 45.5 + 2.3 * excessInches;
  return { value: ibw, display: ibw.toFixed(1), unit: 'kg',
    category: 'Berat Badan Ideal (Devine)', color: 'green' };
}

// ─── eGFR — CKD-EPI 2021 (race-free) ────────────────────────────────────────
export function calcEGFR(creatinineMgDl, ageYears, gender) {
  if (!creatinineMgDl || !ageYears || !gender) return null;
  const isFemale = gender === 'female';
  const kappa = isFemale ? 0.7 : 0.9;
  const alpha = isFemale ? -0.241 : -0.302;
  const sc = creatinineMgDl / kappa;
  const egfr = 142
    * Math.pow(Math.min(sc, 1), alpha)
    * Math.pow(Math.max(sc, 1), -1.200)
    * Math.pow(0.9938, ageYears)
    * (isFemale ? 1.012 : 1);

  let stage, category, color;
  if (egfr >= 90)         { stage = 'G1'; category = 'Normal atau Tinggi';         color = 'green'; }
  else if (egfr >= 60)    { stage = 'G2'; category = 'Penurunan Ringan';            color = 'green'; }
  else if (egfr >= 45)    { stage = 'G3a'; category = 'Penurunan Ringan-Sedang';   color = 'yellow'; }
  else if (egfr >= 30)    { stage = 'G3b'; category = 'Penurunan Sedang-Berat';    color = 'orange'; }
  else if (egfr >= 15)    { stage = 'G4'; category = 'Penurunan Berat';             color = 'red'; }
  else                    { stage = 'G5'; category = 'Gagal Ginjal';                color = 'red'; }

  return { value: egfr, display: Math.round(egfr).toString(),
    unit: 'mL/min/1.73m²', stage, category, color };
}

// ─── MEWS — Modified Early Warning Score ─────────────────────────────────────
export function calcMEWS(sbp, hr, rr, tempC, avpu) {
  // sbp: systolic mmHg, hr: bpm, rr: breaths/min, tempC: °C, avpu: A/V/P/U
  const scoreItems = [];

  // Systolic BP
  let sbpScore;
  if (sbp <= 70)          sbpScore = 3;
  else if (sbp <= 80)     sbpScore = 2;
  else if (sbp <= 100)    sbpScore = 1;
  else if (sbp <= 199)    sbpScore = 0;
  else                    sbpScore = 2;
  scoreItems.push({ label: 'Tekanan Darah Sistolik', value: sbp, unit: 'mmHg', score: sbpScore });

  // Heart rate
  let hrScore;
  if (hr < 40)            hrScore = 2;
  else if (hr <= 50)      hrScore = 1;
  else if (hr <= 100)     hrScore = 0;
  else if (hr <= 110)     hrScore = 1;
  else if (hr <= 129)     hrScore = 2;
  else                    hrScore = 3;
  scoreItems.push({ label: 'Denyut Nadi', value: hr, unit: 'bpm', score: hrScore });

  // Respiratory rate
  let rrScore;
  if (rr < 9)             rrScore = 2;
  else if (rr <= 14)      rrScore = 0;
  else if (rr <= 20)      rrScore = 1;
  else if (rr <= 29)      rrScore = 2;
  else                    rrScore = 3;
  scoreItems.push({ label: 'Laju Napas', value: rr, unit: '/mnt', score: rrScore });

  // Temperature
  let tempScore;
  if (tempC < 35)         tempScore = 2;
  else if (tempC <= 38.4) tempScore = 0;
  else                    tempScore = 2;
  scoreItems.push({ label: 'Suhu', value: tempC, unit: '°C', score: tempScore });

  // AVPU
  const avpuMap = { A: 0, V: 1, P: 2, U: 3 };
  const avpuScore = avpuMap[avpu?.toUpperCase()] ?? 0;
  scoreItems.push({ label: 'Kesadaran (AVPU)', value: avpu, unit: '', score: avpuScore });

  const total = scoreItems.reduce((sum, i) => sum + i.score, 0);
  let category, color, action;
  if (total <= 1)      { category = 'Risiko Rendah';       color = 'green';  action = 'Observasi rutin'; }
  else if (total <= 3) { category = 'Risiko Sedang';       color = 'yellow'; action = 'Tingkatkan frekuensi monitoring'; }
  else if (total <= 5) { category = 'Risiko Tinggi';       color = 'orange'; action = 'Segera hubungi dokter'; }
  else                 { category = 'Risiko Sangat Tinggi'; color = 'red';   action = 'Pertimbangkan ICU/High Dependency'; }

  return { total, scoreItems, category, color, action, display: total.toString(), unit: 'poin' };
}

// ─── CURB-65 ─────────────────────────────────────────────────────────────────
export function calcCURB65(confusion, bun, rr, sbp, dbp, age) {
  // confusion: boolean (baru)
  // bun: blood urea nitrogen mg/dL (>19 = 1 poin)
  // rr: /min (≥30 = 1 poin)
  // sbp: mmHg (≤90 = 1 poin) OR dbp ≤60
  // age: years (≥65 = 1 poin)
  const items = [
    { label: 'Confusion (baru)',       value: confusion ? 'Ya' : 'Tidak', score: confusion ? 1 : 0,
      criteria: 'Gangguan kesadaran baru' },
    { label: 'BUN > 19 mg/dL',        value: `${bun} mg/dL`,             score: bun > 19 ? 1 : 0,
      criteria: 'Blood Urea Nitrogen > 19 mg/dL' },
    { label: 'Laju Napas ≥ 30/mnt',   value: `${rr}/mnt`,                score: rr >= 30 ? 1 : 0,
      criteria: 'Respiratory rate ≥ 30/menit' },
    { label: 'TD Rendah',              value: `${sbp}/${dbp} mmHg`,       score: (sbp <= 90 || dbp <= 60) ? 1 : 0,
      criteria: 'Sistolik ≤ 90 atau diastolik ≤ 60 mmHg' },
    { label: 'Usia ≥ 65 tahun',       value: `${age} tahun`,             score: age >= 65 ? 1 : 0,
      criteria: 'Usia ≥ 65 tahun' },
  ];

  const total = items.reduce((s, i) => s + i.score, 0);
  let category, color, mortality, management;
  if (total === 0)      { category = 'Risiko Rendah';       color = 'green';  mortality = '< 1%';   management = 'Rawat jalan, antibiotik oral'; }
  else if (total === 1) { category = 'Risiko Rendah';       color = 'green';  mortality = '~2.7%';  management = 'Rawat jalan atau observasi singkat'; }
  else if (total === 2) { category = 'Risiko Sedang';       color = 'yellow'; mortality = '~9.2%';  management = 'Pertimbangkan rawat inap'; }
  else if (total === 3) { category = 'Risiko Tinggi';       color = 'orange'; mortality = '~14.5%'; management = 'Rawat inap, pertimbangkan ICU'; }
  else                  { category = 'Risiko Sangat Tinggi'; color = 'red';   mortality = '~27-40%'; management = 'ICU'; }

  return { total, items, category, color, mortality, management, display: total.toString(), unit: '/5' };
}

// ─── Corrected Calcium ───────────────────────────────────────────────────────
export function calcCorrectedCalcium(measuredCa, albumin) {
  // measuredCa: mg/dL, albumin: g/dL; normal albumin = 4 g/dL
  if (!measuredCa || !albumin) return null;
  const corrected = measuredCa + 0.8 * (4 - albumin);
  let category, color;
  if (corrected < 8.5)       { category = 'Hipokalsemia';    color = 'blue'; }
  else if (corrected <= 10.5){ category = 'Normal';           color = 'green'; }
  else if (corrected <= 12)  { category = 'Hiperkalsemia Ringan'; color = 'yellow'; }
  else                       { category = 'Hiperkalsemia Berat';  color = 'red'; }
  return { value: corrected, display: corrected.toFixed(1), unit: 'mg/dL', category, color };
}

// ─── Corrected Sodium ────────────────────────────────────────────────────────
export function calcCorrectedSodium(measuredNa, glucoseMgDl) {
  // Corrects for hyperglycemia: Na rises as glucose falls
  if (!measuredNa || !glucoseMgDl) return null;
  const corrected = measuredNa + 2.4 * ((glucoseMgDl - 100) / 100);
  let category, color;
  if (corrected < 135)       { category = 'Hiponatremia';    color = 'blue'; }
  else if (corrected <= 145) { category = 'Normal';           color = 'green'; }
  else if (corrected <= 150) { category = 'Hipernatremia Ringan'; color = 'yellow'; }
  else                       { category = 'Hipernatremia Berat';  color = 'red'; }
  return { value: corrected, display: corrected.toFixed(1), unit: 'mEq/L', category, color };
}

// ─── APGAR Score ─────────────────────────────────────────────────────────────
export function calcAPGAR(appearance, pulse, grimace, activity, respiration) {
  // Each param: 0, 1, or 2
  const items = [
    { label: 'Warna Kulit (Appearance)',   value: appearance,  max: 2,
      descriptions: ['Seluruh tubuh biru/pucat', 'Tubuh merah, ekstremitas biru', 'Seluruh tubuh merah'] },
    { label: 'Denyut Jantung (Pulse)',     value: pulse,       max: 2,
      descriptions: ['Tidak ada', '< 100 bpm', '≥ 100 bpm'] },
    { label: 'Refleks (Grimace)',          value: grimace,     max: 2,
      descriptions: ['Tidak ada respons', 'Meringis', 'Menangis kuat/bersin'] },
    { label: 'Tonus Otot (Activity)',      value: activity,    max: 2,
      descriptions: ['Lumpuh', 'Sedikit fleksi', 'Gerak aktif'] },
    { label: 'Usaha Napas (Respiration)', value: respiration, max: 2,
      descriptions: ['Tidak ada', 'Napas tidak teratur/lemah', 'Menangis kuat'] },
  ];

  const total = items.reduce((s, i) => s + (Number(i.value) || 0), 0);
  let category, color, action;
  if (total >= 7)       { category = 'Normal';            color = 'green';  action = 'Perawatan rutin neonatus'; }
  else if (total >= 4)  { category = 'Perlu Perhatian';   color = 'yellow'; action = 'Stimulasi dan suplementasi oksigen'; }
  else                  { category = 'Kondisi Buruk';      color = 'red';   action = 'Resusitasi segera'; }

  return { total, items, category, color, action, display: total.toString(), unit: '/10' };
}

// ─── Helper: Color to Tailwind class ─────────────────────────────────────────
export function colorToClass(color, type = 'bg') {
  const map = {
    green:  { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-400', border: 'border-emerald-400' },
    yellow: { bg: 'bg-yellow-100 dark:bg-yellow-900/30',   text: 'text-yellow-700 dark:text-yellow-400',   border: 'border-yellow-400' },
    orange: { bg: 'bg-orange-100 dark:bg-orange-900/30',   text: 'text-orange-700 dark:text-orange-400',   border: 'border-orange-400' },
    red:    { bg: 'bg-red-100 dark:bg-red-900/30',         text: 'text-red-700 dark:text-red-400',         border: 'border-red-400' },
    blue:   { bg: 'bg-blue-100 dark:bg-blue-900/30',       text: 'text-blue-700 dark:text-blue-400',       border: 'border-blue-400' },
  };
  return map[color]?.[type] ?? '';
}
