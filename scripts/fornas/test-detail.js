/**
 * test-detail.js — inspect byidobat and obatsks endpoints
 * Usage: node test-detail.js [id_obat]
 */
import axios from 'axios';

const idObat = process.argv[2] ?? 7;
const headers = {
  Accept: 'application/json',
  Referer: 'https://e-fornas.kemkes.go.id/guest/daftar-obat',
  'User-Agent': 'Mozilla/5.0 (compatible; fornas-research/1.0)',
};

function inspect(label, data) {
  console.log(`\n${'='.repeat(60)}`);
  console.log(label);
  console.log('='.repeat(60));
  if (Array.isArray(data)) {
    console.log(`Type          : ARRAY  (length: ${data.length})`);
    if (data[0]) {
      console.log(`Item keys     : ${Object.keys(data[0]).join(', ')}`);
      console.log('\n--- Item[0] ---');
      console.log(JSON.stringify(data[0], null, 2));
      if (data[1]) { console.log('\n--- Item[1] ---'); console.log(JSON.stringify(data[1], null, 2)); }
    }
  } else {
    const wrapped = typeof data === 'object' && data !== null;
    const topKeys = wrapped ? Object.keys(data).join(', ') : typeof data;
    console.log(`Type          : OBJECT`);
    console.log(`Top keys      : ${topKeys}`);
    // find nested arrays
    const arrKey = wrapped && Object.keys(data).find(k => Array.isArray(data[k]));
    if (arrKey) {
      console.log(`Array at "${arrKey}" length: ${data[arrKey].length}`);
      if (data[arrKey][0]) { console.log('Item keys:', Object.keys(data[arrKey][0]).join(', ')); console.log(JSON.stringify(data[arrKey][0], null, 2)); }
    } else {
      console.log(JSON.stringify(data, null, 2).slice(0, 2000));
    }
  }
}

// ── Step 1: byidobat ─────────────────────────────────────────────────────────
console.log(`\nTesting detail endpoints for _id_obat = ${idObat}`);

const r1 = await axios.get('https://e-fornas.kemkes.go.id/api/daftar-obat', {
  params: { type: 'byidobat', value: idObat },
  headers, timeout: 15000,
});
inspect('ENDPOINT: type=byidobat', r1.data);

// get first sediaan variant to use for obatsks test
const variants = Array.isArray(r1.data) ? r1.data : (r1.data?.data ?? [r1.data]);
const v = variants[0];
const sksParams = v
  ? { type: 'obatsks', _id_obat: v._id_obat ?? idObat, _kekuatan: v._kekuatan, _kode_satuan: v._kode_satuan, _kode_sediaan: v._kode_sediaan }
  : null;

if (!sksParams) { console.error('Could not extract sediaan params from byidobat'); process.exit(1); }

await new Promise(r => setTimeout(r, 400));

// ── Step 2: obatsks ──────────────────────────────────────────────────────────
const r2 = await axios.get('https://e-fornas.kemkes.go.id/api/daftar-obat', {
  params: sksParams,
  headers, timeout: 15000,
});
inspect(`ENDPOINT: type=obatsks  params=${JSON.stringify(sksParams)}`, r2.data);

// show if obatsks returns multiple variants or a single record
if (Array.isArray(r2.data)) {
  console.log(`\n>>> obatsks returns ARRAY of ${r2.data.length} items — one per drug-sediaan combination`);
} else {
  console.log(`\n>>> obatsks returns a single OBJECT`);
}

// Also try a drug that might have multiple sediaan (ketamine, paracetamol, insulin)
// to see if byidobat returns one or many
console.log('\n--- Testing a drug likely to have multiple sediaan (searching for "K" to find ketamin id) ---');
const rk = await axios.get('https://e-fornas.kemkes.go.id/api/daftar-obat', {
  params: { type: 'byname', value: 'ketam' },
  headers, timeout: 15000,
});
const ketaminList = Array.isArray(rk.data) ? rk.data : (rk.data?.data ?? []);
console.log('Ketamin list:', ketaminList.map(x => `${x._id_obat}:${x._nama_obat}`).join(', '));

if (ketaminList[0]) {
  await new Promise(r => setTimeout(r, 400));
  const rk2 = await axios.get('https://e-fornas.kemkes.go.id/api/daftar-obat', {
    params: { type: 'byidobat', value: ketaminList[0]._id_obat },
    headers, timeout: 15000,
  });
  inspect(`byidobat for ${ketaminList[0]._nama_obat} (id=${ketaminList[0]._id_obat})`, rk2.data);
}
