/**
 * test-call.js
 * Run ONCE before fetch-fornas.js to inspect the real API response structure.
 *
 * Usage:  node test-call.js
 *         node test-call.js B          <- test a different letter
 *         node test-call.js A 2        <- test with page param
 */

import axios from 'axios';

const BASE_URL = 'https://e-fornas.kemkes.go.id/api/daftar-obat';
const letter   = process.argv[2] ?? 'A';
const page     = process.argv[3] ?? null;

const params = { type: 'byname', value: letter };
if (page) params.page = page;

console.log(`\nCalling: GET ${BASE_URL}`);
console.log('Params:', params, '\n');

try {
  const res = await axios.get(BASE_URL, {
    params,
    headers: {
      Accept:     'application/json',
      Referer:    'https://e-fornas.kemkes.go.id/guest/daftar-obat',
      'User-Agent': 'Mozilla/5.0 (compatible; fornas-research/1.0)',
    },
    timeout: 15_000,
  });

  console.log('HTTP Status  :', res.status);
  console.log('Content-Type :', res.headers['content-type'] ?? '(none)');
  console.log('');

  const data = res.data;

  if (Array.isArray(data)) {
    console.log('[Response is a flat ARRAY]');
    console.log('Length           :', data.length);
    console.log('First-item keys  :', Object.keys(data[0] ?? {}).join(', '));
    console.log('\n--- First item ---');
    console.log(JSON.stringify(data[0], null, 2));
    if (data[1]) {
      console.log('\n--- Second item ---');
      console.log(JSON.stringify(data[1], null, 2));
    }
  } else if (typeof data === 'object' && data !== null) {
    console.log('[Response is an OBJECT]');
    console.log('Top-level keys   :', Object.keys(data).join(', '));

    // Find the first array-valued key (likely the data payload)
    const arrayKey = Object.keys(data).find(k => Array.isArray(data[k]));
    if (arrayKey) {
      const arr = data[arrayKey];
      console.log(`\nArray found at "${arrayKey}", length: ${arr.length}`);
      if (arr[0]) {
        console.log('First-item keys  :', Object.keys(arr[0]).join(', '));
        console.log('\n--- First item ---');
        console.log(JSON.stringify(arr[0], null, 2));
        if (arr[1]) {
          console.log('\n--- Second item ---');
          console.log(JSON.stringify(arr[1], null, 2));
        }
      }
    }

    // Print non-array top-level keys (pagination meta, etc.)
    const metaKeys = Object.keys(data).filter(k => !Array.isArray(data[k]));
    if (metaKeys.length) {
      console.log('\n--- Pagination / meta fields ---');
      metaKeys.forEach(k => console.log(`  ${k}: ${JSON.stringify(data[k])}`));
    }
  } else {
    console.log('[Unexpected response type:', typeof data, ']');
    console.log(data);
  }

  console.log('\n--- FULL RAW RESPONSE (first 3000 chars) ---');
  const raw = JSON.stringify(data);
  console.log(raw.length > 3000 ? raw.slice(0, 3000) + '\n...(truncated)' : raw);

} catch (err) {
  console.error('Request failed:', err.message);
  if (err.response) {
    console.error('  HTTP Status :', err.response.status);
    console.error('  Body        :', JSON.stringify(err.response.data)?.slice(0, 500));
  }
  process.exit(1);
}
