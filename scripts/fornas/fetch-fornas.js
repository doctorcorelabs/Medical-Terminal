/**
 * fetch-fornas.js
 * Fetches the full national drug formulary (Fornas) from e-fornas.kemkes.go.id
 * by querying every letter A–Z (and configurable extras).
 *
 * Outputs:
 *   fornas-all.json  — raw records, one object per drug
 *   fornas-all.csv   — flat CSV for Excel inspection
 *
 * Usage:  node fetch-fornas.js
 *
 * ──────────────────────────────────────────────────────────
 * IMPORTANT: Run test-call.js first and update DATA_KEY and
 * ID_FIELD below based on the actual API response structure.
 * ──────────────────────────────────────────────────────────
 */

import axios    from 'axios';
import { writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import path     from 'path';

// ── Configuration ────────────────────────────────────────────────────────────

const BASE_URL = 'https://e-fornas.kemkes.go.id/api/daftar-obat';

/**
 * Key inside the response object that holds the array of drug records.
 * Set to null if the response itself IS the array (not wrapped in an object).
 *
 * Examples after running test-call.js:
 *   { data: [...] }      → DATA_KEY = 'data'
 *   { items: [...] }     → DATA_KEY = 'items'
 *   { obat: [...] }      → DATA_KEY = 'obat'
 *   [ {...}, {...} ]     → DATA_KEY = null
 */
// ✓ Confirmed from test-call.js output:
//   Response shape: { message, status, data: [...] }
//   Record fields:  _id_obat, _nama_obat, _nama_obat_internasional
const DATA_KEY = 'data';

/**
 * Field name used as unique ID for deduplication.
 */
const ID_FIELD = '_id_obat';

/**
 * Pagination: not present in this API.
 */
const TOTAL_FIELD = null;

/** Not used (no pagination), kept for compatibility */
const PAGE_SIZE = 20;

/** Letters and other prefixes to query */
const SEARCH_VALUES = [
  ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'.split(''),
  // Add digits if needed: ...'0123456789'.split(''),
];

/** Delay (ms) between requests — be polite to the server */
const DELAY_MS = 400;

/** Max retry attempts on transient errors (5xx, timeout, network) */
const MAX_RETRIES = 3;

// ─────────────────────────────────────────────────────────────────────────────

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

async function fetchPage(value, page = 1, attempt = 1) {
  const params = { type: 'byname', value };
  if (TOTAL_FIELD) params.page = page;

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
    const isRetry = !status || status >= 500;   // retry on network/5xx

    if (isRetry && attempt < MAX_RETRIES) {
      const wait = DELAY_MS * 2 ** attempt;     // exponential back-off
      console.warn(`  ⚠  Retry ${attempt}/${MAX_RETRIES} for "${value}" p${page} (${err.message}) — waiting ${wait}ms`);
      await delay(wait);
      return fetchPage(value, page, attempt + 1);
    }

    throw err;
  }
}

/**
 * Extract the array of drug records from the raw response.
 * Handles flat array responses and wrapped-object responses.
 */
function extractRecords(data) {
  if (Array.isArray(data)) return data;
  if (DATA_KEY && Array.isArray(data?.[DATA_KEY])) return data[DATA_KEY];

  // Auto-detect: find the first array-valued key
  if (typeof data === 'object' && data !== null) {
    const key = Object.keys(data).find(k => Array.isArray(data[k]));
    if (key) {
      if (!DATA_KEY) {
        console.warn(`  ℹ  Auto-detected data key: "${key}". Set DATA_KEY = '${key}' to silence this.`);
      }
      return data[key];
    }
  }

  console.warn('  ⚠  Could not detect records array in response:', JSON.stringify(data)?.slice(0, 200));
  return [];
}

/**
 * Return total count from response (for pagination), or null if unavailable.
 */
function extractTotal(data) {
  if (!TOTAL_FIELD) return null;
  if (Array.isArray(data))                   return null;
  return data?.[TOTAL_FIELD] ?? null;
}

async function fetchAllForLetter(letter) {
  process.stdout.write(`  ${letter}: `);

  const firstData = await fetchPage(letter, 1);
  const firstRecords = extractRecords(firstData);
  const total = extractTotal(firstData);

  let all = [...firstRecords];

  // Pagination: if total > page_size, fetch remaining pages
  if (total && total > firstRecords.length) {
    const totalPages = Math.ceil(total / PAGE_SIZE);
    for (let p = 2; p <= totalPages; p++) {
      await delay(DELAY_MS);
      const pageData = await fetchPage(letter, p);
      const recs = extractRecords(pageData);
      all = all.concat(recs);
      process.stdout.write(`p${p}(${recs.length}) `);
    }
  }

  process.stdout.write(`→ ${all.length} records\n`);
  return all;
}

function toCSV(records) {
  if (!records.length) return '';

  // Flatten nested objects one level deep (common in government APIs)
  const flat = records.map(r => {
    const obj = {};
    for (const [k, v] of Object.entries(r)) {
      if (v !== null && typeof v === 'object' && !Array.isArray(v)) {
        for (const [kk, vv] of Object.entries(v)) {
          obj[`${k}.${kk}`] = vv;
        }
      } else {
        obj[k] = Array.isArray(v) ? JSON.stringify(v) : v;
      }
    }
    return obj;
  });

  const keys = [...new Set(flat.flatMap(r => Object.keys(r)))];

  const escapeCell = v => {
    if (v == null) return '';
    const s = String(v).replace(/"/g, '""');
    return /[,"\n\r]/.test(s) ? `"${s}"` : s;
  };

  const lines = [
    keys.join(','),
    ...flat.map(r => keys.map(k => escapeCell(r[k])).join(',')),
  ];
  return lines.join('\r\n');
}

// ── Main ─────────────────────────────────────────────────────────────────────

async function main() {
  console.log('='.repeat(60));
  console.log('Fornas Extractor — e-fornas.kemkes.go.id');
  console.log('='.repeat(60));
  console.log(`Querying ${SEARCH_VALUES.length} search values with ${DELAY_MS}ms delay\n`);

  const seen   = new Map();   // id → record (dedup)
  const perLetter = {};
  let totalFetched = 0;
  let dupCount  = 0;
  let errorCount = 0;

  for (const value of SEARCH_VALUES) {
    try {
      const records = await fetchAllForLetter(value);
      totalFetched += records.length;
      perLetter[value] = records.length;

      for (const rec of records) {
        if (ID_FIELD && rec[ID_FIELD] != null) {
          const key = String(rec[ID_FIELD]);
          if (seen.has(key)) { dupCount++; continue; }
          seen.set(key, rec);
        } else {
          // No ID field — use index-based key (no dedup)
          seen.set(seen.size, rec);
        }
      }
    } catch (err) {
      console.error(`  ✗  Failed for "${value}": ${err.message}`);
      perLetter[value] = 'ERROR';
      errorCount++;
    }

    await delay(DELAY_MS);
  }

  const allRecords = [...seen.values()];

  console.log('\n' + '='.repeat(60));
  console.log('Summary');
  console.log('='.repeat(60));
  console.log(`Total fetched (with dupes) : ${totalFetched}`);
  console.log(`Duplicates removed         : ${dupCount}`);
  console.log(`Unique records             : ${allRecords.length}`);
  console.log(`Errors                     : ${errorCount}`);
  console.log('');
  console.log('Per letter:', JSON.stringify(perLetter, null, 2));

  // Write JSON
  const jsonPath = path.join(__dirname, 'fornas-all.json');
  writeFileSync(jsonPath, JSON.stringify(allRecords, null, 2), 'utf-8');
  console.log(`\n✓ Saved JSON: ${jsonPath}`);

  // Write CSV
  const csvPath = path.join(__dirname, 'fornas-all.csv');
  writeFileSync(csvPath, toCSV(allRecords), 'utf-8');
  console.log(`✓ Saved CSV : ${csvPath}`);

  if (errorCount > 0) {
    console.warn(`\n⚠  ${errorCount} letter(s) failed. Re-run or handle manually.`);
  }

  // Show first record as a reference for normalize-fornas.js
  if (allRecords[0]) {
    console.log('\nSample record keys:', Object.keys(allRecords[0]).join(', '));
    console.log('Update DATA_KEY, ID_FIELD, TOTAL_FIELD in this file and FIELD_MAP in normalize-fornas.js accordingly.');
  }
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
