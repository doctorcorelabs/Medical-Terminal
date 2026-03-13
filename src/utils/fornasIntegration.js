export const FORNAS_FLAGS = [
  { key: 'flag_oen', label: 'OEN', title: 'Obat Esensial Nasional', color: 'emerald' },
  { key: 'flag_fpktl', label: 'FKRTL', title: 'Formularium Tingkat Lanjutan', color: 'blue' },
  { key: 'flag_fpktp', label: 'FKTP', title: 'Formularium Tingkat Pertama', color: 'cyan' },
  { key: 'flag_prb', label: 'PRB', title: 'Program Rujuk Balik', color: 'violet' },
  { key: 'flag_pp', label: 'PP', title: 'Program Pemerintah', color: 'amber' },
  { key: 'flag_program', label: 'Program', title: 'Termasuk Program Kemenkes', color: 'orange' },
  { key: 'flag_kanker', label: 'Onko', title: 'Obat Kanker / Onkologi', color: 'rose' },
];

export const FORNAS_FLAG_COLORS = {
  emerald: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 border-emerald-200 dark:border-emerald-800/40',
  blue: 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-400 border-blue-200 dark:border-blue-800/40',
  cyan: 'bg-cyan-100 dark:bg-cyan-900/30 text-cyan-700 dark:text-cyan-400 border-cyan-200 dark:border-cyan-800/40',
  violet: 'bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 border-violet-200 dark:border-violet-800/40',
  amber: 'bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-400 border-amber-200 dark:border-amber-800/40',
  orange: 'bg-orange-100 dark:bg-orange-900/30 text-orange-700 dark:text-orange-400 border-orange-200 dark:border-orange-800/40',
  rose: 'bg-rose-100 dark:bg-rose-900/30 text-rose-700 dark:text-rose-400 border-rose-200 dark:border-rose-800/40',
};

const ANTIBIOTIC_SYNONYMS = {
  amoxicillin: ['amoksisilin'],
  azithromycin: ['azitromisin'],
  ceftriaxone: ['seftriakson'],
  cefepime: ['sefepim'],
  cephalexin: ['sefaleksin'],
  cefazolin: ['sefazolin'],
  ampicillin: ['ampisilin'],
  sulbactam: ['sulbaktam'],
  clavulanate: ['asam klavulanat', 'clavulanic acid'],
  piperacillin: ['piperasilin'],
  tazobactam: ['tazobaktam'],
  meropenem: ['meropenem trihidrat'],
  levofloxacin: ['levofloksasin'],
  ciprofloxacin: ['ciprofloksasin'],
  linezolid: ['linezolidum'],
  vancomycin: ['vankomisin'],
  amikacin: ['amikasin'],
  metronidazole: ['metronidazol'],
  clindamycin: ['klindamisin'],
  aztreonam: ['aztreonamum'],
  doxycycline: ['doksisiklin'],
  trimethoprim: ['trimetoprim'],
  sulfamethoxazole: ['sulfametoksazol'],
};

function normalizeText(value) {
  return String(value ?? '')
    .toLowerCase()
    .replace(/\b\d+(?:[.,]\d+)?\s*(mg|mcg|g|gram|ml|iu|unit)\b/g, ' ')
    .replace(/\b(q\d+h|bid|tid|qid|od|iv|im|po)\b/g, ' ')
    .replace(/\([^)]*\)/g, ' ')
    .replace(/[^a-z0-9\s]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function splitRegimenDrugName(value) {
  if (!value) return [];
  return String(value)
    .split(/\s*\+\s*|\s+dan\s+|\s+dengan\s+|\s*\/\s*|\s*&\s*/i)
    .map((part) => normalizeText(part))
    .filter(Boolean);
}

function expandTokensWithSynonyms(tokens) {
  const merged = new Set(tokens);
  tokens.forEach((token) => {
    const parts = token.split(' ').filter(Boolean);
    parts.forEach((part) => {
      const synonyms = ANTIBIOTIC_SYNONYMS[part] ?? [];
      synonyms.forEach((synonym) => {
        const normalizedSynonym = normalizeText(synonym);
        if (normalizedSynonym) merged.add(normalizedSynonym);
      });
    });
  });
  return [...merged];
}

export function buildFornasSearchQuery(value) {
  const tokens = splitRegimenDrugName(value);
  return tokens[0] ?? normalizeText(value);
}

export function getActiveFornasFlags(drug) {
  if (!drug) return [];
  return FORNAS_FLAGS.filter((flag) => drug[flag.key] === true);
}

export function getFornasRestrictionLines(drug) {
  if (!drug) return [];
  return [
    drug.restriction_drug,
    drug.restriction_form,
    drug.restriction_note_l1,
    drug.restriction_note_l2,
    drug.restriction_note_l3,
    drug.restriction_note_l4,
  ].filter(Boolean);
}

export function hasCriticalFornasRestriction(drug) {
  const lines = getFornasRestrictionLines(drug).map((line) => normalizeText(line));
  if (!lines.length) return false;
  const criticalPatterns = [
    /tidak boleh/,
    /kontraindikasi/,
    /hanya untuk/,
    /wajib/,
    /harus/,
    /rawat inap/,
    /pengawasan/,
  ];
  return lines.some((line) => criticalPatterns.some((pattern) => pattern.test(line)));
}

function fornasMatchScore(row, token) {
  if (!row || !token) return 0;

  const name = normalizeText(row.name);
  const intl = normalizeText(row.name_international);
  const label = normalizeText(row.label);

  if (!name && !intl) return 0;
  if (name === token) return 100;
  if (intl === token) return 95;
  if (name.startsWith(token) || intl.startsWith(token)) return 80;
  if (name.includes(token) || intl.includes(token)) return 65;
  if (label.includes(token)) return 50;
  return 0;
}

export function findBestFornasMatch(rows, regimenDrugName) {
  if (!Array.isArray(rows) || rows.length === 0 || !regimenDrugName) return null;

  const tokens = expandTokensWithSynonyms(splitRegimenDrugName(regimenDrugName));
  if (!tokens.length) return null;

  let best = null;
  let bestScore = 0;

  for (const token of tokens) {
    for (const row of rows) {
      const score = fornasMatchScore(row, token);
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
  }

  return bestScore >= 50 ? best : null;
}

export function hasAnyCriticalRestrictions(rows) {
  return Array.isArray(rows) && rows.some((row) => hasCriticalFornasRestriction(row));
}