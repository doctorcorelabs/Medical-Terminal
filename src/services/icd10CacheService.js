import { openDB } from './idbQueue';

const ICD10_STORE = 'icd10Cache';
const ICD10_META_STORE = 'icd10Meta';
const ICD10_META_KEY = 'icd10CacheMeta';
const ICD10_SOURCE_PATH = '/data/icd10.csv';

function parseCSV(text) {
  const lines = text.split('\n');
  const results = [];

  // Skip header row (CODE,DISPLAY,VERSION)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;

    let code;
    let display;

    if (line.startsWith('"')) {
      const match = line.match(/^"([^"]*)",(".*?"|[^,]*)/);
      if (match) {
        code = match[1];
        display = match[2].replace(/^"|"$/g, '');
      }
    } else {
      const firstComma = line.indexOf(',');
      const secondComma = line.indexOf(',', firstComma + 1);
      if (firstComma === -1) continue;
      code = line.substring(0, firstComma).trim();
      const rawDisplay = secondComma !== -1
        ? line.substring(firstComma + 1, secondComma)
        : line.substring(firstComma + 1);
      display = rawDisplay.replace(/^"|"$/g, '').trim();
    }

    if (code && display) {
      results.push({ code, display });
    }
  }

  return results;
}

function runTransaction(storeNames, mode, runner) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    runner(tx, resolve, reject);
    tx.onerror = () => reject(tx.error);
  }));
}

async function clearICD10DataOnly() {
  await runTransaction([ICD10_STORE], 'readwrite', (tx, resolve) => {
    tx.objectStore(ICD10_STORE).clear();
    tx.oncomplete = () => resolve();
  });
}

function setMeta(meta) {
  return runTransaction([ICD10_META_STORE], 'readwrite', (tx, resolve) => {
    tx.objectStore(ICD10_META_STORE).put({ key: ICD10_META_KEY, ...meta });
    tx.oncomplete = () => resolve();
  });
}

function persistBatch(rows) {
  return runTransaction([ICD10_STORE], 'readwrite', (tx, resolve) => {
    const store = tx.objectStore(ICD10_STORE);
    rows.forEach((row) => store.put(row));
    tx.oncomplete = () => resolve();
  });
}

export function getICD10CacheMeta() {
  return runTransaction([ICD10_META_STORE], 'readonly', (tx, resolve) => {
    const req = tx.objectStore(ICD10_META_STORE).get(ICD10_META_KEY);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function isICD10Cached() {
  const meta = await getICD10CacheMeta();
  return Boolean(meta?.count > 0);
}

export function getCachedICD10All() {
  return runTransaction([ICD10_STORE], 'readonly', (tx, resolve, reject) => {
    const req = tx.objectStore(ICD10_STORE).getAll();
    req.onsuccess = () => resolve(req.result ?? []);
    req.onerror = () => reject(req.error);
  });
}

async function fetchICD10Rows() {
  const res = await fetch(ICD10_SOURCE_PATH, { cache: 'no-cache' });
  if (!res.ok) throw new Error(`Failed to load ICD-10 data: ${res.status}`);
  const text = await res.text();
  return parseCSV(text);
}

export async function cacheAllICD10FromSource() {
  const rows = await fetchICD10Rows();
  await clearICD10DataOnly();

  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await persistBatch(chunk);
  }

  const meta = {
    updatedAt: new Date().toISOString(),
    count: rows.length,
    syncSource: 'manual',
  };
  await setMeta(meta);

  return { rows, meta };
}

export async function refreshICD10Cache() {
  const rows = await fetchICD10Rows();
  await clearICD10DataOnly();

  const chunkSize = 1000;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await persistBatch(chunk);
  }

  const meta = {
    updatedAt: new Date().toISOString(),
    count: rows.length,
    syncSource: 'auto',
  };
  await setMeta(meta);

  return { rows, meta };
}

export async function clearICD10Cache() {
  await runTransaction([ICD10_STORE, ICD10_META_STORE], 'readwrite', (tx, resolve) => {
    tx.objectStore(ICD10_STORE).clear();
    tx.objectStore(ICD10_META_STORE).delete(ICD10_META_KEY);
    tx.oncomplete = () => resolve();
  });
}
