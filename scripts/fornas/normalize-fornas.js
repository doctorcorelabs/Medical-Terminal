/**
 * normalize-fornas.js
 * Reads fornas-all.json and produces fornas-normalized.json with
 * standard field names ready for Supabase upsert.
 *
 * Usage:  node normalize-fornas.js
 *         node normalize-fornas.js fornas-all.json    <- explicit input path
 *
 * ──────────────────────────────────────────────────────────────────────────
 * STEP 1: Run `node test-call.js` and look at "First-item keys" output.
 * STEP 2: Update FIELD_MAP below so each target key lists the actual
 *         API field name(s) as candidates (first match wins).
 * STEP 3: Run `node normalize-fornas.js` and review the mapping report.
 * ──────────────────────────────────────────────────────────────────────────
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Field Mapping ─────────────────────────────────────────────────────────────
// For each target column, list candidate source field names in priority order.
// The first one found in the raw record wins.

// ✓ Confirmed field names from test-call.js + test-detail.js:
//   Phase 1 (list)   : _id_obat, _nama_obat, _nama_obat_internasional
//   Phase 2 (byidobat): _kode_sediaan, _sediaan, _kekuatan, _kode_satuan, _satuan, _label
//   Phase 3 (obatsks) : _sks_id, _kelas_terapi, _sub_kelas_terapi, _sub_sub_kelas_terapi,
//                       _sub_sub_sub_kelas_terapi, _fpktl, _fpktp, _pp, _prb, _oen,
//                       _program, _kanker, _komposisi, _rkt0–_rkt3,
//                       _restriksi_obat, _restriksi_sediaan, _peresepan_maksimal
const FIELD_MAP = {
  // ── Identity ────────────────────────────────────────────
  source_id:            ['_id_obat'],
  sks_id:               ['_sks_id', '_id'],          // obatsks unique combination ID
  name:                 ['_nama_obat'],
  name_international:   ['_nama_obat_internasional'],
  label:                ['_label'],                  // e.g. "abakavir - TABLET 300 MILIGRAM"
  // ── Sediaan (from byidobat) ──────────────────────────────
  form_code:            ['_kode_sediaan'],
  form:                 ['_sediaan'],
  strength:             ['_kekuatan'],
  unit_code:            ['_kode_satuan'],
  unit:                 ['_satuan'],
  // ── Kelas Terapi (from obatsks) ──────────────────────────
  category_l1:          ['_kelas_terapi'],
  category_l2:          ['_sub_kelas_terapi'],
  category_l3:          ['_sub_sub_kelas_terapi'],
  category_l4:          ['_sub_sub_sub_kelas_terapi'],
  // ── Restrictions & flags ────────────────────────────────
  restriction_drug:     ['_restriksi_obat'],
  restriction_form:     ['_restriksi_sediaan'],
  restriction_note_l1:  ['_rkt0'],
  restriction_note_l2:  ['_rkt1'],
  restriction_note_l3:  ['_rkt2'],
  restriction_note_l4:  ['_rkt3'],
  max_prescription:     ['_peresepan_maksimal'],
  komposisi:            ['_komposisi'],
  // ── Boolean flags ────────────────────────────────────────
  flag_fpktl:           ['_fpktl'],   // Formularium Primer
  flag_fpktp:           ['_fpktp'],   // Formularium Primer Tambahan
  flag_pp:              ['_pp'],      // Program Pemerintah
  flag_prb:             ['_prb'],     // Program Rujuk Balik
  flag_oen:             ['_oen'],     // Obat Esensial Nasional
  flag_program:         ['_program'],
  flag_kanker:          ['_kanker'],  // Obat kanker
};

// ── Text Normalisation Helpers ────────────────────────────────────────────────

function trim(v) {
  return typeof v === 'string' ? v.trim() : v;
}

function titleCase(s) {
  if (!s) return s;
  return s.toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
}

function upperCase(s) {
  return typeof s === 'string' ? s.trim().toUpperCase() : s;
}

// ── Core mapping ─────────────────────────────────────────────────────────────

function resolveField(record, candidates) {
  for (const key of candidates) {
    if (Object.prototype.hasOwnProperty.call(record, key) && record[key] != null && record[key] !== '') {
      return record[key];
    }
  }
  return null;
}

function normalizeRecord(raw) {
  const resolved = {};
  for (const [target, candidates] of Object.entries(FIELD_MAP)) {
    resolved[target] = resolveField(raw, candidates);
  }

  const boolField = v => (v == null ? null : Boolean(v));

  return {
    // Identity
    source_id:           resolved.source_id != null ? String(resolved.source_id).trim() : null,
    sks_id:              resolved.sks_id    != null ? Number(resolved.sks_id)             : null,
    name:                titleCase(trim(resolved.name)),
    name_international:  trim(resolved.name_international),
    label:               trim(resolved.label),
    // Sediaan
    form_code:           upperCase(resolved.form_code),
    form:                upperCase(trim(resolved.form)),
    strength:            trim(resolved.strength),
    unit_code:           upperCase(resolved.unit_code),
    unit:                upperCase(trim(resolved.unit)),
    // Kelas terapi
    category_l1:         upperCase(trim(resolved.category_l1)),
    category_l2:         upperCase(trim(resolved.category_l2)),
    category_l3:         titleCase(trim(resolved.category_l3)),
    category_l4:         titleCase(trim(resolved.category_l4)),
    // Restrictions
    restriction_drug:    trim(resolved.restriction_drug),
    restriction_form:    trim(resolved.restriction_form),
    restriction_note_l1: trim(resolved.restriction_note_l1),
    restriction_note_l2: trim(resolved.restriction_note_l2),
    restriction_note_l3: trim(resolved.restriction_note_l3),
    restriction_note_l4: trim(resolved.restriction_note_l4),
    max_prescription:    resolved.max_prescription != null ? String(resolved.max_prescription) : null,
    komposisi:           trim(resolved.komposisi) || null,
    // Boolean flags
    flag_fpktl:  boolField(resolved.flag_fpktl),
    flag_fpktp:  boolField(resolved.flag_fpktp),
    flag_pp:     boolField(resolved.flag_pp),
    flag_prb:    boolField(resolved.flag_prb),
    flag_oen:    boolField(resolved.flag_oen),
    flag_program:boolField(resolved.flag_program),
    flag_kanker: boolField(resolved.flag_kanker),
    // Full raw for audit
    raw: raw,
  };
}

// ── Mapping Report ────────────────────────────────────────────────────────────

function buildMappingReport(rawSample, normalized) {
  console.log('\n' + '─'.repeat(60));
  console.log('Field Mapping Report (based on first record)');
  console.log('─'.repeat(60));
  console.log('Source keys found:', Object.keys(rawSample).join(', '), '\n');

  for (const [target, candidates] of Object.entries(FIELD_MAP)) {
    const found = candidates.find(c => Object.prototype.hasOwnProperty.call(rawSample, c));
    const value = normalized[target];
    const status = found ? `✓ "${found}"` : '✗ NOT FOUND';
    const display = value != null ? JSON.stringify(String(value).slice(0, 50)) : 'null';
    console.log(`  ${target.padEnd(14)} ${status.padEnd(22)} → ${display}`);
  }

  // Unmapped source fields (in raw but not in any FIELD_MAP candidate list)
  const allCandidates = new Set(Object.values(FIELD_MAP).flat());
  const unmapped = Object.keys(rawSample).filter(k => !allCandidates.has(k));
  if (unmapped.length) {
    console.log('\n  ⚠  Unmapped source fields (update FIELD_MAP to capture them):');
    unmapped.forEach(k => console.log(`       "${k}": ${JSON.stringify(rawSample[k])?.slice(0, 80)}`));
  }
  console.log('─'.repeat(60) + '\n');
}

// ── Quality checks ────────────────────────────────────────────────────────────

function qualityReport(normalized) {
  const total = normalized.length;
  const stats = {};

  for (const key of Object.keys(FIELD_MAP)) {
    const nullCount = normalized.filter(r => r[key] == null).length;
    stats[key] = { filled: total - nullCount, null: nullCount, pct: (((total - nullCount) / total) * 100).toFixed(1) };
  }

  console.log('Quality Report (fill rate)');
  console.log('─'.repeat(60));
  for (const [key, s] of Object.entries(stats)) {
    const bar = '█'.repeat(Math.round(s.pct / 5)).padEnd(20);
    console.log(`  ${key.padEnd(14)} ${bar} ${s.pct}% (${s.filled}/${total})`);
  }
  console.log('─'.repeat(60));
}

// ── Main ─────────────────────────────────────────────────────────────────────

const inputFile = process.argv[2] ?? path.join(__dirname, 'fornas-all.json');
const outputFile = path.join(__dirname, 'fornas-normalized.json');

console.log('='.repeat(60));
console.log('Fornas Normalizer');
console.log('='.repeat(60));
console.log(`Input : ${inputFile}`);
console.log(`Output: ${outputFile}\n`);

let raw;
try {
  raw = JSON.parse(readFileSync(inputFile, 'utf-8'));
} catch (err) {
  console.error(`✗ Could not read input file: ${err.message}`);
  console.error('  Run fetch-fornas.js first to generate fornas-all.json');
  process.exit(1);
}

console.log(`Records read: ${raw.length}`);

if (!raw.length) {
  console.warn('Input file is empty — nothing to normalize.');
  process.exit(0);
}

// Show mapping report based on first record
const firstNorm = normalizeRecord(raw[0]);
buildMappingReport(raw[0], firstNorm);

// Normalize all records
const normalized = raw.map(normalizeRecord);

// Remove records with no name (completely empty/bad rows)
const valid    = normalized.filter(r => r.name != null);
const skipped  = normalized.length - valid.length;
if (skipped) console.warn(`⚠  Skipped ${skipped} records with no "name" value\n`);

// Quality report
qualityReport(valid);

// Write output
writeFileSync(outputFile, JSON.stringify(valid, null, 2), 'utf-8');

console.log(`\n✓ Saved ${valid.length} normalized records → ${outputFile}`);
console.log('\nNext steps:');
console.log('  1. Review the mapping report above and update FIELD_MAP if needed');
console.log('  2. Run: node upsert-to-supabase.js   (Opsi B — coming next)');
