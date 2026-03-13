export const BROSelow_ZONES = [
  { id: 'grey', color: 'Abu-abu', minWeight: 3, maxWeight: 5, approxAge: 'neonatus', ettCuffed: '3.0', ettUncuffed: '3.5', blade: 'Miller 1', lma: '1', fluidBolusMlKg: '10-20', defibJKg: '2-4', notes: 'Neonatal / infant kecil' },
  { id: 'pink', color: 'Merah muda', minWeight: 6, maxWeight: 7, approxAge: '4-8 bulan', ettCuffed: '3.5', ettUncuffed: '4.0', blade: 'Miller 1', lma: '1.5', fluidBolusMlKg: '10-20', defibJKg: '2-4', notes: 'Bayi awal' },
  { id: 'red', color: 'Merah', minWeight: 8, maxWeight: 9, approxAge: '8-12 bulan', ettCuffed: '4.0', ettUncuffed: '4.5', blade: 'Miller 1-2', lma: '1.5', fluidBolusMlKg: '10-20', defibJKg: '2-4', notes: 'Infant akhir' },
  { id: 'purple', color: 'Ungu', minWeight: 10, maxWeight: 11, approxAge: '1-2 tahun', ettCuffed: '4.0', ettUncuffed: '4.5', blade: 'Mac 2', lma: '2', fluidBolusMlKg: '20', defibJKg: '2-4', notes: 'Toddler' },
  { id: 'yellow', color: 'Kuning', minWeight: 12, maxWeight: 14, approxAge: '2-3 tahun', ettCuffed: '4.5', ettUncuffed: '5.0', blade: 'Mac 2', lma: '2', fluidBolusMlKg: '20', defibJKg: '2-4', notes: 'Toddler besar' },
  { id: 'white', color: 'Putih', minWeight: 15, maxWeight: 18, approxAge: '4-5 tahun', ettCuffed: '5.0', ettUncuffed: '5.5', blade: 'Mac 2', lma: '2.5', fluidBolusMlKg: '20', defibJKg: '2-4', notes: 'Pra-sekolah' },
  { id: 'blue', color: 'Biru', minWeight: 19, maxWeight: 23, approxAge: '6-7 tahun', ettCuffed: '5.5', ettUncuffed: '6.0', blade: 'Mac 2-3', lma: '2.5-3', fluidBolusMlKg: '20', defibJKg: '2-4', notes: 'Usia sekolah awal' },
  { id: 'orange', color: 'Oranye', minWeight: 24, maxWeight: 29, approxAge: '8-10 tahun', ettCuffed: '6.0', ettUncuffed: '6.5', blade: 'Mac 3', lma: '3', fluidBolusMlKg: '20', defibJKg: '2-4', notes: 'Usia sekolah' },
  { id: 'green', color: 'Hijau', minWeight: 30, maxWeight: 36, approxAge: '10-12 tahun', ettCuffed: '6.5', ettUncuffed: '7.0', blade: 'Mac 3', lma: '4', fluidBolusMlKg: '20', defibJKg: '2-4', notes: 'Praremaja' },
];

export const PEDIATRIC_COMMON_DRUGS = [
  { id: 'paracetamol', name: 'Paracetamol', indication: 'Demam / nyeri', dosePerKg: 15, unit: 'mg', route: 'PO/PR', maxDose: '1000 mg per dosis', concentration: '120 mg/5 mL sirup', note: 'Interval tiap 4-6 jam; maksimum 60-75 mg/kg/hari.' },
  { id: 'ibuprofen', name: 'Ibuprofen', indication: 'Demam / nyeri', dosePerKg: 10, unit: 'mg', route: 'PO', maxDose: '400 mg per dosis', concentration: '100 mg/5 mL sirup', note: 'Hindari pada dehidrasi berat / gangguan ginjal.' },
  { id: 'amoxicillin', name: 'Amoxicillin', indication: 'Infeksi bakteri umum', dosePerKg: 25, unit: 'mg', route: 'PO', maxDose: '1000 mg per dosis', concentration: '250 mg/5 mL sirup', note: 'Dosis dibagi tiap 8-12 jam tergantung indikasi.' },
  { id: 'ceftriaxone', name: 'Ceftriaxone', indication: 'Infeksi berat', dosePerKg: 50, unit: 'mg', route: 'IV', maxDose: '2000 mg per dosis', concentration: '1000 mg/vial', note: 'Meningitis dapat memerlukan 100 mg/kg/hari.' },
  { id: 'ondansetron', name: 'Ondansetron', indication: 'Mual muntah', dosePerKg: 0.15, unit: 'mg', route: 'IV/PO', maxDose: '8 mg per dosis', concentration: '2 mg/mL', note: 'Jangan melebihi 8 mg per dosis pada kebanyakan regimen pediatrik.' },
  { id: 'dexamethasone', name: 'Dexamethasone', indication: 'Croup / edema / antiinflamasi', dosePerKg: 0.6, unit: 'mg', route: 'PO/IV', maxDose: '16 mg per dosis', concentration: '0.5 mg/5 mL atau 4 mg/mL', note: 'Untuk croup, dosis tunggal sering cukup.' },
  { id: 'diazepam', name: 'Diazepam', indication: 'Kejang', dosePerKg: 0.2, unit: 'mg', route: 'IV/PR', maxDose: '10 mg per dosis', concentration: '5 mg/mL', note: 'Bisa 0.5 mg/kg PR sesuai protokol.' },
  { id: 'lorazepam', name: 'Lorazepam', indication: 'Status epileptikus', dosePerKg: 0.1, unit: 'mg', route: 'IV', maxDose: '4 mg per dosis', concentration: '2 mg/mL', note: 'Alternatif lini pertama benzodiazepin.' },
  { id: 'salbutamol', name: 'Salbutamol nebulisasi', indication: 'Bronkospasme', dosePerKg: 0.15, unit: 'mg', route: 'Neb', maxDose: '5 mg per nebulisasi', concentration: '2.5 mg/2.5 mL nebule', note: 'Minimum lazim 2.5 mg pada banyak protokol IGD.' },
  { id: 'prednisone', name: 'Prednisone/Prednisolone', indication: 'Eksaserbasi asma / inflamasi', dosePerKg: 1, unit: 'mg', route: 'PO', maxDose: '60 mg per hari', concentration: '5 mg tablet / sirup variatif', note: 'Umumnya 1-2 mg/kg/hari.' },
  { id: 'calcium-gluconate', name: 'Kalsium Glukonat', indication: 'Hipokalsemia / hiperkalemia', dosePerKg: 50, unit: 'mg', route: 'IV', maxDose: '3000 mg', concentration: '100 mg/mL', note: 'Berikan perlahan dengan monitor jantung.' },
  { id: 'sodium-bicarbonate', name: 'Natrium Bikarbonat', indication: 'Asidosis / hiperkalemia / overdosis TCA', dosePerKg: 1, unit: 'mEq', route: 'IV', maxDose: 'Sesuai protokol', concentration: '1 mEq/mL', note: 'Gunakan selektif sesuai indikasi.' },
];