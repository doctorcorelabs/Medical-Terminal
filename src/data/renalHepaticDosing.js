export const RENAL_HEPATIC_DRUGS = [
  {
    id: 'metformin',
    name: 'Metformin',
    aliases: ['glucophage'],
    category: 'Antidiabetik',
    fornasKeyword: 'metformin',
    warning: 'Pantau risiko asidosis laktat, terutama bila ada sepsis, hipoksia, atau gagal ginjal akut.',
    renal: [
      { label: 'eGFR >= 60', minEgfr: 60, recommendation: 'Dosis standar', note: 'Monitor fungsi ginjal berkala.' },
      { label: 'eGFR 45-59', minEgfr: 45, maxEgfr: 59, recommendation: 'Dosis standar atau evaluasi penurunan bila faktor risiko', note: 'Tinjau ulang dosis total harian.' },
      { label: 'eGFR 30-44', minEgfr: 30, maxEgfr: 44, recommendation: 'Maksimum 1000 mg/hari', note: 'Jangan inisiasi baru bila memungkinkan.' },
      { label: 'eGFR < 30', maxEgfr: 29, recommendation: 'Hindari / stop', note: 'Kontraindikasi relatif karena risiko akumulasi.' },
    ],
    hepatic: [
      { childPugh: ['A'], recommendation: 'Gunakan hati-hati', note: 'Nilai fungsi hati dan perfusi.' },
      { childPugh: ['B', 'C'], recommendation: 'Hindari bila penyakit hati aktif berat', note: 'Risiko hipoksia jaringan dan asidosis laktat meningkat.' },
    ],
  },
  {
    id: 'levofloxacin',
    name: 'Levofloxacin',
    aliases: ['levofloksasin'],
    category: 'Antibiotik',
    fornasKeyword: 'levofloxacin',
    warning: 'Perhatikan QT prolongation, delirium, dan tendinopati pada pasien usia lanjut.',
    renal: [
      { label: 'eGFR >= 50', minEgfr: 50, recommendation: 'Dosis standar', note: 'Contoh 750 mg q24h sesuai indikasi.' },
      { label: 'eGFR 20-49', minEgfr: 20, maxEgfr: 49, recommendation: 'Berikan loading standar lalu perpanjang interval', note: 'Misal 750 mg q48h atau 500 mg q24-48h.' },
      { label: 'eGFR < 20', maxEgfr: 19, recommendation: 'Kurangi dosis dan interval lebih panjang', note: 'Pertimbangkan 500-750 mg tiap 48 jam.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B', 'C'], recommendation: 'Tidak perlu penyesuaian bermakna', note: 'Eliminasi dominan renal.' },
    ],
  },
  {
    id: 'ciprofloxacin',
    name: 'Ciprofloxacin',
    aliases: ['ciprofloksasin'],
    category: 'Antibiotik',
    fornasKeyword: 'ciprofloxacin',
    warning: 'Hindari kombinasi dengan obat pemanjang QT bila memungkinkan.',
    renal: [
      { label: 'eGFR >= 50', minEgfr: 50, recommendation: 'Dosis standar', note: 'Misal 400 mg IV q12h atau 500 mg oral q12h.' },
      { label: 'eGFR 30-49', minEgfr: 30, maxEgfr: 49, recommendation: 'Turunkan menjadi q18-24h', note: 'Sesuaikan dengan berat infeksi.' },
      { label: 'eGFR < 30', maxEgfr: 29, recommendation: 'Kurangi dosis 50% atau interval q24h', note: 'Pertimbangkan alternatif pada infeksi berat.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B', 'C'], recommendation: 'Tidak perlu penyesuaian rutin', note: 'Tetap pantau efek samping sistemik.' },
    ],
  },
  {
    id: 'amoxicillin-clavulanate',
    name: 'Amoxicillin/Clavulanate',
    aliases: ['amoxiclav', 'co amoxiclav'],
    category: 'Antibiotik',
    fornasKeyword: 'amoksisilin',
    warning: 'Formulasi 875/125 mg tidak dianjurkan pada gangguan ginjal berat.',
    renal: [
      { label: 'eGFR >= 30', minEgfr: 30, recommendation: 'Dosis standar', note: 'Sesuaikan frekuensi menurut indikasi.' },
      { label: 'eGFR 10-29', minEgfr: 10, maxEgfr: 29, recommendation: 'Gunakan formulasi lebih rendah q12h', note: 'Hindari sediaan high-strength q8h.' },
      { label: 'eGFR < 10', maxEgfr: 9, recommendation: 'q24h', note: 'Pertimbangkan alternatif IV pada infeksi berat.' },
    ],
    hepatic: [
      { childPugh: ['A'], recommendation: 'Dosis standar dengan monitoring', note: 'Pantau enzim hati bila terapi > 7 hari.' },
      { childPugh: ['B', 'C'], recommendation: 'Gunakan hati-hati', note: 'Risiko cholestatic hepatitis meningkat.' },
    ],
  },
  {
    id: 'cefepime',
    name: 'Cefepime',
    aliases: [],
    category: 'Antibiotik',
    fornasKeyword: 'cefepime',
    warning: 'Neurotoksisitas meningkat bila dosis tidak disesuaikan pada CKD.',
    renal: [
      { label: 'eGFR >= 60', minEgfr: 60, recommendation: 'Dosis standar', note: 'Contoh 2 g q8-12h tergantung infeksi.' },
      { label: 'eGFR 30-59', minEgfr: 30, maxEgfr: 59, recommendation: 'Turunkan frekuensi', note: 'Contoh 2 g q12-24h.' },
      { label: 'eGFR 11-29', minEgfr: 11, maxEgfr: 29, recommendation: 'Kurangi dosis signifikan', note: 'Contoh 1 g q24h atau sesuai indikasi.' },
      { label: 'eGFR <= 10', maxEgfr: 10, recommendation: 'Kurangi tajam / interval lebih panjang', note: 'Pertimbangkan TDM bila tersedia.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B', 'C'], recommendation: 'Tidak perlu penyesuaian rutin', note: 'Tetap perhatikan kombinasi gangguan renal-hepatik.' },
    ],
  },
  {
    id: 'meropenem',
    name: 'Meropenem',
    aliases: [],
    category: 'Antibiotik',
    fornasKeyword: 'meropenem',
    warning: 'Perhatikan kejang pada gangguan ginjal dan dosis tinggi.',
    renal: [
      { label: 'eGFR >= 50', minEgfr: 50, recommendation: 'Dosis standar', note: '1 g q8h atau extended infusion sesuai protokol.' },
      { label: 'eGFR 26-49', minEgfr: 26, maxEgfr: 49, recommendation: 'Turunkan menjadi q12h', note: 'Pertahankan strategi infus bila digunakan.' },
      { label: 'eGFR 10-25', minEgfr: 10, maxEgfr: 25, recommendation: 'Gunakan 50% dosis q12h', note: 'Sesuaikan dengan MIC target.' },
      { label: 'eGFR < 10', maxEgfr: 9, recommendation: 'q24h', note: 'Pertimbangkan konsultasi farmasi klinik.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B', 'C'], recommendation: 'Tidak perlu penyesuaian rutin', note: 'Eliminasi terutama melalui ginjal.' },
    ],
  },
  {
    id: 'vancomycin',
    name: 'Vancomycin',
    aliases: ['vankomisin'],
    category: 'Antibiotik',
    fornasKeyword: 'vancomycin',
    warning: 'Idealnya gunakan AUC-guided dosing atau trough monitoring.',
    renal: [
      { label: 'eGFR >= 50', minEgfr: 50, recommendation: 'Loading 20-25 mg/kg lalu maintenance berdasarkan TDM', note: 'Frekuensi lazim q8-12h.' },
      { label: 'eGFR 20-49', minEgfr: 20, maxEgfr: 49, recommendation: 'Interval q24-48h dengan level monitoring', note: 'Jangan hanya mengandalkan rumus tanpa TDM.' },
      { label: 'eGFR < 20', maxEgfr: 19, recommendation: 'Dosis individual berbasis level', note: 'Berikan loading bila perlu, lalu tunggu kadar.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B', 'C'], recommendation: 'Tidak ada penyesuaian spesifik', note: 'Fokus pada fungsi ginjal dan TDM.' },
    ],
  },
  {
    id: 'fluconazole',
    name: 'Fluconazole',
    aliases: [],
    category: 'Antijamur',
    fornasKeyword: 'fluconazole',
    warning: 'Pantau QT, hepatotoksisitas, dan interaksi CYP.',
    renal: [
      { label: 'eGFR > 50', minEgfr: 51, recommendation: 'Dosis standar', note: 'Loading tetap penuh.' },
      { label: 'eGFR <= 50', maxEgfr: 50, recommendation: 'Berikan loading penuh lalu 50% maintenance', note: 'Infeksi invasif tetap perlu evaluasi klinis ketat.' },
    ],
    hepatic: [
      { childPugh: ['A'], recommendation: 'Gunakan dengan monitoring', note: 'Pantau transaminase.' },
      { childPugh: ['B', 'C'], recommendation: 'Pertimbangkan pengurangan / alternatif', note: 'Risiko hepatotoksisitas meningkat pada penyakit hati lanjut.' },
    ],
  },
  {
    id: 'gabapentin',
    name: 'Gabapentin',
    aliases: [],
    category: 'Neurologi',
    fornasKeyword: 'gabapentin',
    warning: 'Sedasi dan ataksia meningkat bila akumulasi pada CKD.',
    renal: [
      { label: 'eGFR >= 60', minEgfr: 60, recommendation: 'Dosis standar', note: 'Titrasi bertahap sesuai respons.' },
      { label: 'eGFR 30-59', minEgfr: 30, maxEgfr: 59, recommendation: 'Turunkan total dosis harian', note: 'Misal 400-1400 mg/hari terbagi.' },
      { label: 'eGFR 15-29', minEgfr: 15, maxEgfr: 29, recommendation: 'Gunakan dosis rendah 1-2 kali/hari', note: 'Contoh 200-700 mg/hari.' },
      { label: 'eGFR < 15', maxEgfr: 14, recommendation: 'Dosis sangat rendah / pascadialisis', note: 'Individualisasi ketat.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B', 'C'], recommendation: 'Tidak perlu penyesuaian rutin', note: 'Eliminasi renal.' },
    ],
  },
  {
    id: 'allopurinol',
    name: 'Allopurinol',
    aliases: [],
    category: 'Rheumatologi',
    fornasKeyword: 'allopurinol',
    warning: 'Mulai rendah terutama pada CKD untuk menurunkan risiko SCAR/AHS.',
    renal: [
      { label: 'eGFR >= 60', minEgfr: 60, recommendation: 'Mulai 100 mg/hari, titrasi', note: 'Sesuaikan target asam urat.' },
      { label: 'eGFR 30-59', minEgfr: 30, maxEgfr: 59, recommendation: 'Mulai 50-100 mg/hari', note: 'Naikkan perlahan dengan monitoring.' },
      { label: 'eGFR < 30', maxEgfr: 29, recommendation: 'Mulai 50 mg/hari atau selang sehari', note: 'Titrasi sangat hati-hati.' },
    ],
    hepatic: [
      { childPugh: ['A'], recommendation: 'Mulai rendah', note: 'Monitor fungsi hati dan reaksi kulit.' },
      { childPugh: ['B', 'C'], recommendation: 'Gunakan hati-hati', note: 'Pertimbangkan alternatif bila ada hepatitis aktif.' },
    ],
  },
  {
    id: 'enoxaparin',
    name: 'Enoxaparin',
    aliases: [],
    category: 'Antikoagulan',
    fornasKeyword: 'enoxaparin',
    warning: 'Perhatikan akumulasi anti-Xa pada CKD, terutama dosis terapeutik.',
    renal: [
      { label: 'eGFR >= 30', minEgfr: 30, recommendation: 'Dosis standar sesuai indikasi', note: 'Profilaksis dan terapi dibedakan.' },
      { label: 'eGFR < 30', maxEgfr: 29, recommendation: 'Turunkan frekuensi / dosis', note: 'Contoh terapi 1 mg/kg q24h; profilaksis 30 mg q24h.' },
    ],
    hepatic: [
      { childPugh: ['A', 'B'], recommendation: 'Gunakan dengan monitoring perdarahan', note: 'Tidak ada penyesuaian baku.' },
      { childPugh: ['C'], recommendation: 'Hati-hati tinggi', note: 'Risiko perdarahan meningkat karena koagulopati.' },
    ],
  },
  {
    id: 'morphine',
    name: 'Morphine',
    aliases: ['morfin'],
    category: 'Analgesik',
    fornasKeyword: 'morphine',
    warning: 'Metabolit aktif dapat terakumulasi pada CKD dan menyebabkan sedasi/depresi napas.',
    renal: [
      { label: 'eGFR >= 60', minEgfr: 60, recommendation: 'Dosis standar dengan titrasi', note: 'Pantau sedasi dan frekuensi napas.' },
      { label: 'eGFR 30-59', minEgfr: 30, maxEgfr: 59, recommendation: 'Mulai 25-50% lebih rendah', note: 'Pertimbangkan interval lebih panjang.' },
      { label: 'eGFR < 30', maxEgfr: 29, recommendation: 'Hindari bila memungkinkan', note: 'Pilih fentanyl atau hydromorphone bila tersedia.' },
    ],
    hepatic: [
      { childPugh: ['A'], recommendation: 'Mulai rendah', note: 'First-pass berkurang dapat meningkatkan bioavailabilitas.' },
      { childPugh: ['B', 'C'], recommendation: 'Kurangi dosis dan interval lebih panjang', note: 'Pantau ensefalopati dan retensi CO2.' },
    ],
  },
  {
    id: 'paracetamol',
    name: 'Paracetamol',
    aliases: ['acetaminophen'],
    category: 'Analgesik',
    fornasKeyword: 'paracetamol',
    warning: 'Tetap batasi total harian pada pasien malnutrisi, alkoholik, atau penyakit hati.',
    renal: [
      { label: 'eGFR >= 10', minEgfr: 10, recommendation: 'Dosis standar, pertimbangkan interval 6-8 jam', note: 'Biasanya aman bila total harian terkontrol.' },
      { label: 'eGFR < 10', maxEgfr: 9, recommendation: 'Perpanjang interval 8 jam', note: 'Akumulasi metabolit mungkin terjadi.' },
    ],
    hepatic: [
      { childPugh: ['A'], recommendation: 'Maks 3 g/hari', note: 'Gunakan dosis efektif terendah.' },
      { childPugh: ['B', 'C'], recommendation: 'Maks 2 g/hari', note: 'Hindari penggunaan berkepanjangan tanpa evaluasi.' },
    ],
  },
];

export function findDrugAdjustment(query) {
  const q = query.trim().toLowerCase();
  if (!q) return null;
  return RENAL_HEPATIC_DRUGS.find((drug) =>
    drug.name.toLowerCase().includes(q) ||
    drug.aliases.some((alias) => alias.toLowerCase().includes(q))
  ) ?? null;
}
