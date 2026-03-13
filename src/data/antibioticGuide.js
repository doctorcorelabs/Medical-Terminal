export const ANTIBIOTIC_GUIDE = [
  {
    id: 'cap',
    label: 'Community-Acquired Pneumonia',
    shortLabel: 'CAP',
    organ: 'Paru',
    icon: 'pulmonology',
    summary: 'Terapi empiris CAP berdasarkan severitas dan faktor risiko patogen resisten.',
    regimens: {
      mild: {
        firstLine: [
          { drug: 'Amoxicillin', dose: '1 g oral tiap 8 jam', route: 'PO', duration: '5 hari', notes: 'Pilihan utama bila tidak ada komorbid signifikan.' },
          { drug: 'Azithromycin', dose: '500 mg hari pertama, lanjut 250 mg/hari', route: 'PO', duration: '3-5 hari', notes: 'Pertimbangkan bila curiga atipikal atau alergi beta-laktam.' },
        ],
        secondLine: [
          { drug: 'Amoxicillin/Clavulanate', dose: '875/125 mg oral tiap 12 jam', route: 'PO', duration: '5-7 hari', notes: 'Untuk komorbid atau risiko aspirasi ringan.' },
        ],
        alternatives: [
          { drug: 'Levofloxacin', dose: '750 mg oral tiap 24 jam', route: 'PO', duration: '5 hari', notes: 'Gunakan bila alergi berat beta-laktam.' },
        ],
      },
      moderate: {
        firstLine: [
          { drug: 'Ceftriaxone + Azithromycin', dose: '1-2 g IV q24h + 500 mg IV/PO q24h', route: 'IV/PO', duration: '5-7 hari', notes: 'Cover tipikal dan atipikal.' },
        ],
        secondLine: [
          { drug: 'Ampicillin/Sulbactam + Azithromycin', dose: '3 g IV q6h + 500 mg q24h', route: 'IV', duration: '5-7 hari', notes: 'Alternatif ward non-ICU.' },
        ],
        alternatives: [
          { drug: 'Levofloxacin', dose: '750 mg IV/PO q24h', route: 'IV/PO', duration: '5 hari', notes: 'Bila monoterapi diperlukan karena alergi.' },
        ],
      },
      severe: {
        firstLine: [
          { drug: 'Ceftriaxone + Azithromycin', dose: '2 g IV q24h + 500 mg IV q24h', route: 'IV', duration: '7 hari', notes: 'Naikkan spektrum bila ada faktor risiko khusus.' },
        ],
        secondLine: [
          { drug: 'Piperacillin/Tazobactam + Azithromycin', dose: '4.5 g IV q6h + 500 mg q24h', route: 'IV', duration: '7 hari', notes: 'Bila ada risiko aspirasi atau Pseudomonas.' },
        ],
        alternatives: [
          { drug: 'Levofloxacin + Linezolid', dose: '750 mg q24h + 600 mg q12h', route: 'IV/PO', duration: '7 hari', notes: 'Untuk alergi beta-laktam berat dengan risiko MRSA.' },
        ],
      },
    },
    risks: [
      { key: 'mrsa', label: 'MRSA risk', recommendation: 'Tambahkan Vancomycin 15-20 mg/kg IV q8-12h atau Linezolid 600 mg q12h.', notes: 'Riwayat kolonisasi MRSA, necrotizing pneumonia, atau post-influenza.' },
      { key: 'pseudomonas', label: 'Pseudomonas risk', recommendation: 'Gunakan antipseudomonal beta-laktam: Piperacillin/Tazobactam, Cefepime, atau Meropenem.', notes: 'Bronkiektasis, penggunaan antibiotik luas baru-baru ini, atau kultur sebelumnya positif.' },
      { key: 'betaLactamAllergy', label: 'Alergi beta-laktam berat', recommendation: 'Pilih Levofloxacin atau Moxifloxacin; pertimbangkan Linezolid bila MRSA risk.', notes: 'Verifikasi apakah reaksi anafilaksis atau hanya ruam ringan.' },
    ],
  },
  {
    id: 'hap-vap',
    label: 'Hospital-Acquired / Ventilator-Associated Pneumonia',
    shortLabel: 'HAP/VAP',
    organ: 'Paru',
    icon: 'respiratory_rate',
    summary: 'Fokus pada kuman nosokomial gram negatif dan risiko MRSA/Pseudomonas.',
    regimens: {
      mild: {
        firstLine: [
          { drug: 'Piperacillin/Tazobactam', dose: '4.5 g IV q6h', route: 'IV', duration: '7 hari', notes: 'Pertimbangkan extended infusion sesuai kebijakan ICU.' },
        ],
        secondLine: [
          { drug: 'Cefepime', dose: '2 g IV q8-12h', route: 'IV', duration: '7 hari', notes: 'Alternatif gram negatif luas.' },
        ],
        alternatives: [
          { drug: 'Levofloxacin', dose: '750 mg IV q24h', route: 'IV', duration: '7 hari', notes: 'Bila opsi beta-laktam terbatas.' },
        ],
      },
      moderate: {
        firstLine: [
          { drug: 'Piperacillin/Tazobactam + Vancomycin', dose: '4.5 g IV q6h + 15-20 mg/kg q8-12h', route: 'IV', duration: '7 hari', notes: 'Untuk coverage MRSA empiris bila ada faktor risiko.' },
        ],
        secondLine: [
          { drug: 'Cefepime + Linezolid', dose: '2 g IV q8h + 600 mg q12h', route: 'IV', duration: '7 hari', notes: 'Alternatif bila AKI atau target AUC vankomisin sulit dicapai.' },
        ],
        alternatives: [
          { drug: 'Meropenem + Vancomycin', dose: '1 g IV q8h + 15-20 mg/kg q8-12h', route: 'IV', duration: '7 hari', notes: 'Untuk risiko ESBL.' },
        ],
      },
      severe: {
        firstLine: [
          { drug: 'Meropenem + Vancomycin', dose: '1 g IV q8h + 15-20 mg/kg q8-12h', route: 'IV', duration: '7 hari', notes: 'Untuk ICU atau syok sepsis.' },
        ],
        secondLine: [
          { drug: 'Cefepime + Amikacin + Linezolid', dose: '2 g q8h + 15-20 mg/kg q24h + 600 mg q12h', route: 'IV', duration: '7 hari', notes: 'Pertimbangkan dua gram negatif hanya bila syok/sepsis berat.' },
        ],
        alternatives: [
          { drug: 'Aztreonam + Linezolid', dose: '2 g IV q8h + 600 mg q12h', route: 'IV', duration: '7 hari', notes: 'Untuk alergi beta-laktam berat.' },
        ],
      },
    },
    risks: [
      { key: 'mrsa', label: 'MRSA risk', recommendation: 'Pertahankan Vancomycin atau Linezolid.', notes: 'Prioritas tinggi bila ventilator > 5 hari atau kultur MRSA sebelumnya.' },
      { key: 'esbl', label: 'ESBL risk', recommendation: 'Naikkan ke Meropenem.', notes: 'Riwayat ESBL atau penggunaan sefalosporin luas sebelumnya.' },
      { key: 'pseudomonas', label: 'Pseudomonas risk', recommendation: 'Pertimbangkan dua agen aktif gram negatif bila syok / mortalitas tinggi.', notes: 'Sesuaikan dengan antibiogram ICU.' },
    ],
  },
  {
    id: 'uti-complicated',
    label: 'Complicated UTI / Pyelonephritis',
    shortLabel: 'cUTI',
    organ: 'Ginjal / traktus urinarius',
    icon: 'urology',
    summary: 'Bedakan infeksi ringan, rawat inap, dan sepsis urogenital.',
    regimens: {
      mild: {
        firstLine: [
          { drug: 'Ciprofloxacin', dose: '500 mg PO q12h', route: 'PO', duration: '7 hari', notes: 'Bila resistensi lokal rendah dan pasien stabil.' },
        ],
        secondLine: [
          { drug: 'Levofloxacin', dose: '750 mg PO q24h', route: 'PO', duration: '5 hari', notes: 'Alternatif oral once-daily.' },
        ],
        alternatives: [
          { drug: 'Amoxicillin/Clavulanate', dose: '875/125 mg PO q12h', route: 'PO', duration: '10-14 hari', notes: 'Hanya bila kultur mendukung.' },
        ],
      },
      moderate: {
        firstLine: [
          { drug: 'Ceftriaxone', dose: '1-2 g IV q24h', route: 'IV', duration: '7-10 hari', notes: 'Transisi ke oral bila membaik.' },
        ],
        secondLine: [
          { drug: 'Piperacillin/Tazobactam', dose: '4.5 g IV q6h', route: 'IV', duration: '7-10 hari', notes: 'Bila terdapat obstruksi atau riwayat rawat inap baru.' },
        ],
        alternatives: [
          { drug: 'Aztreonam', dose: '1-2 g IV q8h', route: 'IV', duration: '7-10 hari', notes: 'Untuk alergi beta-laktam berat.' },
        ],
      },
      severe: {
        firstLine: [
          { drug: 'Meropenem', dose: '1 g IV q8h', route: 'IV', duration: '10-14 hari', notes: 'Bila syok sepsis atau ESBL risk tinggi.' },
        ],
        secondLine: [
          { drug: 'Piperacillin/Tazobactam + Amikacin', dose: '4.5 g q6h + 15 mg/kg q24h', route: 'IV', duration: '7-10 hari', notes: 'Pertimbangkan aminoglikosida hanya untuk fase awal.' },
        ],
        alternatives: [
          { drug: 'Cefepime', dose: '2 g IV q8-12h', route: 'IV', duration: '7-10 hari', notes: 'Bila ESBL risk tidak tinggi dan antibiogram mendukung.' },
        ],
      },
    },
    risks: [
      { key: 'esbl', label: 'ESBL risk', recommendation: 'Utamakan Meropenem.', notes: 'Riwayat ESBL, penggunaan fluorokuinolon/cefalosporin baru-baru ini, atau recurrent cUTI.' },
      { key: 'pseudomonas', label: 'Pseudomonas risk', recommendation: 'Gunakan Piperacillin/Tazobactam atau Cefepime.', notes: 'Kateter jangka panjang atau instrumen urologi berulang.' },
      { key: 'betaLactamAllergy', label: 'Alergi beta-laktam berat', recommendation: 'Pertimbangkan Aztreonam atau fluorokuinolon bila sensitif.', notes: 'Tetap sesuaikan kultur urine dan fungsi ginjal.' },
    ],
  },
  {
    id: 'cellulitis',
    label: 'Cellulitis / Skin Soft Tissue Infection',
    shortLabel: 'SSTI',
    organ: 'Kulit dan jaringan lunak',
    icon: 'healing',
    summary: 'Pisahkan non-purulen dari risiko MRSA atau infeksi nekrotikans.',
    regimens: {
      mild: {
        firstLine: [
          { drug: 'Cephalexin', dose: '500 mg PO q6h', route: 'PO', duration: '5 hari', notes: 'Untuk cellulitis non-purulen stabil.' },
        ],
        secondLine: [
          { drug: 'Amoxicillin/Clavulanate', dose: '625-875/125 mg PO q12h', route: 'PO', duration: '5-7 hari', notes: 'Bila curiga bite wound atau polimikrobial ringan.' },
        ],
        alternatives: [
          { drug: 'Clindamycin', dose: '300-450 mg PO q6-8h', route: 'PO', duration: '5-7 hari', notes: 'Bila alergi beta-laktam.' },
        ],
      },
      moderate: {
        firstLine: [
          { drug: 'Cefazolin', dose: '1-2 g IV q8h', route: 'IV', duration: '5-7 hari', notes: 'Untuk rawat inap tanpa syok.' },
        ],
        secondLine: [
          { drug: 'Ampicillin/Sulbactam', dose: '3 g IV q6h', route: 'IV', duration: '5-7 hari', notes: 'Bila ada komponen bite/diabetik ringan.' },
        ],
        alternatives: [
          { drug: 'Clindamycin', dose: '600 mg IV q8h', route: 'IV', duration: '5-7 hari', notes: 'Alternatif alergi beta-laktam.' },
        ],
      },
      severe: {
        firstLine: [
          { drug: 'Piperacillin/Tazobactam + Vancomycin', dose: '4.5 g IV q6h + 15-20 mg/kg q8-12h', route: 'IV', duration: '7-14 hari', notes: 'Bila sepsis, nekrotikans, atau diabetic foot berat.' },
        ],
        secondLine: [
          { drug: 'Meropenem + Linezolid', dose: '1 g IV q8h + 600 mg q12h', route: 'IV', duration: '7-14 hari', notes: 'Alternatif spektrum luas dengan cover MRSA.' },
        ],
        alternatives: [
          { drug: 'Tindakan bedah', dose: 'Debridement / source control', route: 'Prosedur', duration: 'Segera', notes: 'Esensial pada nekrotizing infection.' },
        ],
      },
    },
    risks: [
      { key: 'mrsa', label: 'MRSA risk', recommendation: 'Tambahkan Vancomycin, Linezolid, atau Doxycycline/TMP-SMX bila purulen.', notes: 'Absces, riwayat MRSA, atau penggunaan antibiotik sebelumnya.' },
      { key: 'immunosuppressed', label: 'Imunosupresi', recommendation: 'Pertimbangkan coverage gram negatif / jamur sesuai konteks.', notes: 'Neutropenia, transplantasi, steroid dosis tinggi.' },
      { key: 'betaLactamAllergy', label: 'Alergi beta-laktam berat', recommendation: 'Pilih Clindamycin atau kombinasi non-beta-laktam.', notes: 'Evaluasi risiko C. difficile pada clindamycin.' },
    ],
  },
  {
    id: 'sepsis-unknown',
    label: 'Sepsis Fokus Belum Jelas',
    shortLabel: 'Sepsis',
    organ: 'Sistemik',
    icon: 'ecg_heart',
    summary: 'Empirik awal harus mempertimbangkan fokus tersering, source control, dan resistensi setempat.',
    regimens: {
      mild: {
        firstLine: [
          { drug: 'Ceftriaxone', dose: '2 g IV q24h', route: 'IV', duration: 'Re-evaluasi 48-72 jam', notes: 'Hanya untuk sepsis stabil tanpa syok dan komunitas.' },
        ],
        secondLine: [
          { drug: 'Ampicillin/Sulbactam', dose: '3 g IV q6h', route: 'IV', duration: 'Re-evaluasi 48-72 jam', notes: 'Bila curiga fokus abdomen/aspirasi ringan.' },
        ],
        alternatives: [
          { drug: 'Levofloxacin', dose: '750 mg IV q24h', route: 'IV', duration: 'Re-evaluasi 48-72 jam', notes: 'Bila alergi beta-laktam.' },
        ],
      },
      moderate: {
        firstLine: [
          { drug: 'Piperacillin/Tazobactam', dose: '4.5 g IV q6h', route: 'IV', duration: 'Re-evaluasi harian', notes: 'Pilihan luas untuk fokus abdomen, urin, atau nosokomial sedang.' },
        ],
        secondLine: [
          { drug: 'Cefepime + Metronidazole', dose: '2 g IV q8-12h + 500 mg q8h', route: 'IV', duration: 'Re-evaluasi harian', notes: 'Alternatif bila curiga abdomen/gram negatif.' },
        ],
        alternatives: [
          { drug: 'Meropenem', dose: '1 g IV q8h', route: 'IV', duration: 'Re-evaluasi harian', notes: 'Naikkan bila ada ESBL risk atau syok berkembang.' },
        ],
      },
      severe: {
        firstLine: [
          { drug: 'Meropenem + Vancomycin', dose: '1 g IV q8h + 15-20 mg/kg q8-12h', route: 'IV', duration: 'Re-evaluasi harian', notes: 'Untuk sepsis berat / syok sepsis sambil tunggu kultur.' },
        ],
        secondLine: [
          { drug: 'Piperacillin/Tazobactam + Vancomycin + Amikacin', dose: '4.5 g q6h + 15-20 mg/kg q8-12h + 15 mg/kg q24h', route: 'IV', duration: 'Amikacin 24-48 jam awal', notes: 'Gunakan aminoglikosida bila mortalitas sangat tinggi dan perlu double gram-negative cover.' },
        ],
        alternatives: [
          { drug: 'Source control emergent', dose: 'Drainase / debridement / device removal', route: 'Prosedur', duration: 'Secepatnya', notes: 'Antibiotik tanpa source control sering gagal.' },
        ],
      },
    },
    risks: [
      { key: 'mrsa', label: 'MRSA risk', recommendation: 'Pertahankan Vancomycin atau Linezolid empiris.', notes: 'Kateter, infeksi kulit, kolonisasi MRSA, atau post-influenza.' },
      { key: 'esbl', label: 'ESBL risk', recommendation: 'Naikkan ke Meropenem.', notes: 'Riwayat ESBL, paparan antibiotik luas, atau nosokomial lama.' },
      { key: 'immunosuppressed', label: 'Imunosupresi', recommendation: 'Pertimbangkan coverage antijamur / antiviral sesuai konteks klinis.', notes: 'Evaluasi neutropenia dan fokus oportunistik.' },
    ],
  },
];

export const RISK_OPTIONS = [
  { key: 'mrsa', label: 'MRSA risk' },
  { key: 'esbl', label: 'ESBL risk' },
  { key: 'pseudomonas', label: 'Pseudomonas risk' },
  { key: 'immunosuppressed', label: 'Imunosupresi' },
  { key: 'betaLactamAllergy', label: 'Alergi beta-laktam berat' },
];
