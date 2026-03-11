/**
 * upsert-to-supabase.js
 * Reads fornas-normalized.json and upserts all records into
 * the public.fornas_drugs table in Supabase.
 *
 * Pre-requisites:
 *   1. Run supabase_fornas_setup.sql in Supabase SQL Editor first
 *   2. Copy .env.example → .env and fill in your credentials
 *   3. Run: node upsert-to-supabase.js
 *
 * Options:
 *   node upsert-to-supabase.js --dry-run     <- print stats, don't write to DB
 *   node upsert-to-supabase.js --batch 50    <- change batch size (default: 100)
 */

import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';
import { readFileSync }  from 'fs';
import { fileURLToPath } from 'url';
import path from 'path';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Args ──────────────────────────────────────────────────────────────────────
const args      = process.argv.slice(2);
const DRY_RUN   = args.includes('--dry-run');
const batchArg  = args.indexOf('--batch');
const BATCH_SIZE = batchArg !== -1 ? Number(args[batchArg + 1]) : 100;

// ── Env validation ────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('✗ Missing environment variables.');
  console.error('  Copy .env.example → .env and fill in SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY');
  process.exit(1);
}
if (!SUPABASE_URL.startsWith('https://')) {
  console.error('✗ SUPABASE_URL must start with https://');
  process.exit(1);
}

// ── Supabase client ───────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY, {
  auth: { persistSession: false },
});

// ── Load data ─────────────────────────────────────────────────────────────────
const INPUT_FILE = path.join(__dirname, 'fornas-normalized.json');
let records;
try {
  records = JSON.parse(readFileSync(INPUT_FILE, 'utf-8'));
} catch (err) {
  console.error(`✗ Cannot read ${INPUT_FILE}: ${err.message}`);
  console.error('  Run: node normalize-fornas.js fornas-enriched.json');
  process.exit(1);
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function chunk(arr, size) {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

/**
 * Map a normalized record to DB columns.
 * Drops the 'raw' field from the JSON root (it's kept inside raw JSONB).
 */
function toRow(r) {
  return {
    source_id:           r.source_id,
    sks_id:              r.sks_id,
    name:                r.name,
    name_international:  r.name_international,
    label:               r.label,
    form_code:           r.form_code,
    form:                r.form,
    strength:            r.strength,
    unit_code:           r.unit_code,
    unit:                r.unit,
    category_l1:         r.category_l1,
    category_l2:         r.category_l2,
    category_l3:         r.category_l3,
    category_l4:         r.category_l4,
    restriction_drug:    r.restriction_drug,
    restriction_form:    r.restriction_form,
    restriction_note_l1: r.restriction_note_l1,
    restriction_note_l2: r.restriction_note_l2,
    restriction_note_l3: r.restriction_note_l3,
    restriction_note_l4: r.restriction_note_l4,
    max_prescription:    r.max_prescription,
    komposisi:           r.komposisi,
    flag_fpktl:          r.flag_fpktl,
    flag_fpktp:          r.flag_fpktp,
    flag_pp:             r.flag_pp,
    flag_prb:            r.flag_prb,
    flag_oen:            r.flag_oen,
    flag_program:        r.flag_program,
    flag_kanker:         r.flag_kanker,
    raw:                 r.raw,
  };
}

// ── Dry run summary ───────────────────────────────────────────────────────────

function dryRunReport(rows) {
  console.log('\n[DRY RUN — no data written to database]\n');
  console.log(`Records       : ${rows.length}`);
  console.log(`Batch size    : ${BATCH_SIZE}`);
  console.log(`Batches needed: ${Math.ceil(rows.length / BATCH_SIZE)}`);
  console.log(`\nSample row (first):`);
  const sample = { ...rows[0] };
  if (sample.raw) sample.raw = '{ ...raw omitted... }';
  console.log(JSON.stringify(sample, null, 2));

  // Quick stats
  const withSks   = rows.filter(r => r.sks_id != null).length;
  const withRestr = rows.filter(r => r.restriction_drug != null).length;
  const oen       = rows.filter(r => r.flag_oen  === true).length;
  const fpktl     = rows.filter(r => r.flag_fpktl === true).length;
  const kanker    = rows.filter(r => r.flag_kanker === true).length;
  const forms     = [...new Set(rows.map(r => r.form).filter(Boolean))].sort();

  console.log('\nData statistics:');
  console.log(`  With sks_id        : ${withSks}/${rows.length}`);
  console.log(`  With restriction   : ${withRestr}/${rows.length}`);
  console.log(`  OEN drugs          : ${oen}`);
  console.log(`  FPKTL drugs        : ${fpktl}`);
  console.log(`  Kanker drugs       : ${kanker}`);
  console.log(`  Distinct forms (${forms.length}): ${forms.slice(0,8).join(', ')}${forms.length>8?'...':''}`);
}

// ── Upsert ────────────────────────────────────────────────────────────────────

async function upsertBatch(rows, batchNum, total, conflictCol) {
  const { error } = await supabase
    .from('fornas_drugs')
    .upsert(rows, {
      onConflict:        conflictCol,
      ignoreDuplicates:  false,   // always update existing rows
    });

  if (error) throw new Error(`Batch ${batchNum}: ${error.message} (code: ${error.code})`);
}

async function main() {
  console.log('='.repeat(60));
  console.log('Fornas → Supabase Upsert');
  console.log('='.repeat(60));
  console.log(`Input      : ${INPUT_FILE}`);
  console.log(`Supabase   : ${SUPABASE_URL}`);
  console.log(`Batch size : ${BATCH_SIZE}`);
  console.log(`Dry run    : ${DRY_RUN}`);
  console.log(`Records    : ${records.length}\n`);

  const allRows = records.map(toRow);

  // Deduplicate by sks_id — keep last occurrence (most complete data)
  const seenSks = new Map();
  for (const row of allRows) {
    const key = row.sks_id != null ? `sks:${row.sks_id}` : `compound:${row.source_id}|${row.form_code}|${row.strength}|${row.unit_code}`;
    seenSks.set(key, row);
  }
  const rows = [...seenSks.values()];
  const dedupRemoved = allRows.length - rows.length;
  if (dedupRemoved > 0) console.log(`Deduped ${dedupRemoved} duplicate records → ${rows.length} unique rows\n`);

  if (DRY_RUN) {
    dryRunReport(rows);
    return;
  }

  // ── Verify table exists ──────────────────────────────────────────────────
  const { error: tableErr } = await supabase
    .from('fornas_drugs')
    .select('id')
    .limit(1);

  if (tableErr) {
    console.error('✗ Cannot access fornas_drugs table:', tableErr.message);
    console.error('  Run supabase_fornas_setup.sql in Supabase SQL Editor first.');
    process.exit(1);
  }

  // Split: records with sks_id (conflict on sks_id) vs without (compound key)
  const withSks    = rows.filter(r => r.sks_id != null);
  const withoutSks = rows.filter(r => r.sks_id == null);

  console.log(`Records with sks_id    : ${withSks.length}`);
  console.log(`Records without sks_id : ${withoutSks.length}\n`);

  let upserted   = 0;
  let errCount   = 0;
  let batchNum   = 0;

  // ── Upsert with sks_id ──────────────────────────────────────────────────
  if (withSks.length > 0) {
    const batches = chunk(withSks, BATCH_SIZE);
    process.stdout.write(`Upserting ${withSks.length} records (conflict: sks_id)\n`);

    for (const batch of batches) {
      batchNum++;
      const pct = ((upserted / rows.length) * 100).toFixed(1);
      process.stdout.write(`  Batch ${String(batchNum).padStart(3)} [${pct.padStart(5)}%] ${upserted}/${rows.length} done\r`);

      try {
        await upsertBatch(batch, batchNum, batches.length, 'sks_id');
        upserted += batch.length;
      } catch (err) {
        console.error(`\n  ✗ ${err.message}`);
        errCount++;
      }
    }
    process.stdout.write(`  Done — ${upserted} records upserted\n`);
  }

  // ── Upsert without sks_id (compound key) ────────────────────────────────
  if (withoutSks.length > 0) {
    console.log(`\nUpserting ${withoutSks.length} records without sks_id (conflict: source_id,form_code,strength,unit_code)`);
    const batches = chunk(withoutSks, BATCH_SIZE);

    for (const batch of batches) {
      batchNum++;
      try {
        await upsertBatch(batch, batchNum, batches.length, 'source_id,form_code,strength,unit_code');
        upserted += batch.length;
      } catch (err) {
        console.error(`  ✗ ${err.message}`);
        errCount++;
      }
    }
    console.log(`  Done — ${withoutSks.length} records upserted`);
  }

  // ── Final report ─────────────────────────────────────────────────────────
  console.log('\n' + '='.repeat(60));
  console.log('Done');
  console.log('='.repeat(60));
  console.log(`Total upserted : ${upserted}`);
  console.log(`Batch errors   : ${errCount}`);

  if (errCount === 0) {
    console.log('\n✓ All records successfully upserted to Supabase!');
    console.log(`  Table: public.fornas_drugs`);
    console.log(`  Verify: SELECT COUNT(*), COUNT(DISTINCT source_id) FROM public.fornas_drugs;`);
  } else {
    console.warn(`\n⚠  ${errCount} batch(es) failed. Check errors above and re-run.`);
  }
}

main().catch(err => {
  console.error('\nFatal:', err.message);
  process.exit(1);
});
