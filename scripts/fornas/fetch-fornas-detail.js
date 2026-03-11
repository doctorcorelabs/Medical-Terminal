/**
 * fetch-fornas-detail.js
 * Phase 2: Enriches each drug from fornas-all.json with full detail:
 *
 *   Drug (from list)
 *     └─ sediaan variants  (type=byidobat)
 *          └─ full classification & flags  (type=obatsks)
 *
 * Output:  fornas-enriched.json  — one record per drug-sediaan combination
 *
 * Usage:
 *   node fetch-fornas-detail.js
 *   node fetch-fornas-detail.js 50        <- process only first 50 drugs (test mode)
 *
 * Estimated run time: ~15 min for all 663 drugs (byidobat + obatsks per variant)
 */

import axios     from 'axios';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { fileURLToPath } from 'url';
import path      from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Config ───────────────────────────────────────────────────────────────────

const BASE_URL    = 'https://e-fornas.kemkes.go.id/api/daftar-obat';
const DELAY_MS    = 350;   // ms between each API call
const MAX_RETRIES = 3;

const INPUT_FILE   = path.join(__dirname, 'fornas-all.json');
const OUTPUT_FILE  = path.join(__dirname, 'fornas-enriched.json');
const PROGRESS_FILE = path.join(__dirname, '.enrich-progress.json'); // checkpoint

/** Limit to N drugs for testing (0 = all) */
const TEST_LIMIT = Number(process.argv[2] ?? 0);

// ── Helpers ──────────────────────────────────────────────────────────────────

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function get(params, attempt = 1) {
  try {
    const res = await axios.get(BASE_URL, {
      params,
      headers: {
        Accept:       'application/json',
        Referer:      'https://e-fornas.kemkes.go.id/guest/daftar-obat',
        'User-Agent': 'Mozilla/5.0 (compatible; fornas-research/1.0)',
      },
      timeout: 20_000,
    });
    return res.data;
  } catch (err) {
    const status  = err?.response?.status;
    const isRetry = !status || status >= 500;
    if (isRetry && attempt < MAX_RETRIES) {
      const wait = DELAY_MS * 2 ** attempt;
      console.warn(`    ⚠  retry ${attempt}/${MAX_RETRIES} (${err.message}) +${wait}ms`);
      await sleep(wait);
      return get(params, attempt + 1);
    }
    throw err;
  }
}

/**
 * Safely extract data array from wrapped response { message, status, data: [...] }
 * or bare array response.
 */
function extractArray(raw) {
  if (Array.isArray(raw))               return raw;
  if (Array.isArray(raw?.data))         return raw.data;
  if (raw && typeof raw === 'object') {
    const k = Object.keys(raw).find(k => Array.isArray(raw[k]));
    if (k) return raw[k];
  }
  return [];
}

function extractSingle(raw) {
  const arr = extractArray(raw);
  return arr[0] ?? null;
}

// ── Load checkpoint (resume interrupted runs) ─────────────────────────────────

function loadProgress() {
  if (existsSync(PROGRESS_FILE)) {
    try { return JSON.parse(readFileSync(PROGRESS_FILE, 'utf-8')); } catch {}
  }
  return { done: {}, results: [] };  // done: { id_obat: true }
}

function saveProgress(progress) {
  writeFileSync(PROGRESS_FILE, JSON.stringify(progress), 'utf-8');
}

// ── Core fetch ────────────────────────────────────────────────────────────────

/**
 * Fetch all sediaan variants for one drug, then fetch obatsks for each variant.
 * Returns array of fully enriched records.
 */
async function enrichDrug(baseDrug) {
  const idObat = baseDrug._id_obat;

  // Step 1: byidobat → sediaan variants
  const raw1 = await get({ type: 'byidobat', value: idObat });
  await sleep(DELAY_MS);

  const variants = extractArray(raw1);
  if (!variants.length) {
    // No sediaan data — keep base record with nulls
    return [{
      ...baseDrug,
      _kode_sediaan: null, _sediaan: null, _kekuatan: null,
      _kode_satuan: null, _satuan: null, _label: null,
      _enrich_status: 'no_variants',
    }];
  }

  const enriched = [];

  for (const variant of variants) {
    // Step 2: obatsks → full classification + flags
    const sksParams = {
      type:         'obatsks',
      _id_obat:     idObat,
      _kekuatan:    variant._kekuatan,
      _kode_satuan: variant._kode_satuan,
      _kode_sediaan: variant._kode_sediaan,
    };

    let sksRecord = null;
    try {
      const raw2 = await get(sksParams);
      sksRecord = extractSingle(raw2);
    } catch (err) {
      console.warn(`    ⚠  obatsks failed for id=${idObat} sed=${variant._kode_sediaan}: ${err.message}`);
    }
    await sleep(DELAY_MS);

    enriched.push({
      // Base identity
      _id_obat:                 baseDrug._id_obat,
      _nama_obat:               baseDrug._nama_obat,
      _nama_obat_internasional: baseDrug._nama_obat_internasional,
      // Sediaan variant (from byidobat)
      _kode_sediaan:  variant._kode_sediaan,
      _sediaan:       variant._sediaan,
      _kekuatan:      variant._kekuatan,
      _kode_satuan:   variant._kode_satuan,
      _satuan:        variant._satuan,
      _label:         variant._label,
      // Classification & flags (from obatsks) — spread everything
      ...(sksRecord ?? {}),
      // Overwrite overlapping name fields to keep consistent and avoid confusion
      _nama_obat:               baseDrug._nama_obat,
      _nama_obat_internasional: baseDrug._nama_obat_internasional,
      // Track obatsks unique ID
      _sks_id:        sksRecord?._id ?? null,
      _enrich_status: sksRecord ? 'ok' : 'no_sks',
    });
  }

  return enriched;
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Fornas Detail Enricher — Phase 2');
  console.log('='.repeat(60));

  // Load base drug list
  let drugs;
  try {
    drugs = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
  } catch (err) {
    console.error(`✗ Cannot read ${INPUT_FILE}: ${err.message}`);
    console.error('  Run fetch-fornas.js first.');
    process.exit(1);
  }

  if (TEST_LIMIT > 0) {
    console.log(`⚠  TEST MODE: processing only first ${TEST_LIMIT} drugs`);
    drugs = drugs.slice(0, TEST_LIMIT);
  }

  console.log(`Base drugs      : ${drugs.length}`);
  console.log(`Delay per call  : ${DELAY_MS}ms`);

  const progress = loadProgress();
  const alreadyDone = Object.keys(progress.done).length;
  if (alreadyDone > 0) {
    console.log(`\n↩  Resuming — ${alreadyDone} drugs already done, ${progress.results.length} records saved`);
  }

  const pending = drugs.filter(d => !progress.done[d._id_obat]);
  console.log(`Pending         : ${pending.length} drugs\n`);

  let i = 0;
  let errCount = 0;

  for (const drug of pending) {
    i++;
    const pct = ((alreadyDone + i) / drugs.length * 100).toFixed(1);
    process.stdout.write(`[${String(alreadyDone + i).padStart(3)}/${drugs.length}] ${pct.padStart(5)}%  ${drug._nama_obat.slice(0, 30).padEnd(31)}`);

    try {
      const records = await enrichDrug(drug);
      progress.results.push(...records);
      progress.done[drug._id_obat] = true;
      process.stdout.write(`→ ${records.length} variant(s)\n`);
    } catch (err) {
      process.stdout.write(`✗ ERROR: ${err.message}\n`);
      errCount++;
      progress.done[drug._id_obat] = 'error';
    }

    // Save checkpoint every 20 drugs
    if (i % 20 === 0) saveProgress(progress);
    await sleep(DELAY_MS);
  }

  saveProgress(progress);

  // ── Summary ────────────────────────────────────────────────────────────────

  const all = progress.results;
  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total drug variants : ${all.length}`);
  console.log(`Errors              : ${errCount}`);

  // Unique sediaan / forms
  const forms = [...new Set(all.map(r => r._sediaan).filter(Boolean))].sort();
  console.log(`Distinct forms      : ${forms.length}`);
  console.log(`  ${forms.slice(0, 10).join(', ')}${forms.length > 10 ? '...' : ''}`);

  writeFileSync(OUTPUT_FILE, JSON.stringify(all, null, 2), 'utf-8');
  console.log(`\n✓ Saved ${all.length} enriched records → ${OUTPUT_FILE}`);

  if (errCount > 0) {
    console.warn(`\n⚠  ${errCount} drug(s) had errors. Re-run to retry failed items.`);
    console.warn('   (Progress is saved — completed drugs will be skipped)');
  }

  if (all[0]) {
    console.log('\nSample enriched record keys:');
    console.log(' ', Object.keys(all[0]).join(', '));
    console.log('\nRun: node normalize-fornas.js fornas-enriched.json');
  }
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
