// ICD-10 data loader — lazy fetch from public/data/icd10.csv
// Module-level cache so CSV is only fetched once per session

let cache = null;
let loadingPromise = null;

function parseCSV(text) {
  const lines = text.split('\n');
  const results = [];
  // Skip header row (CODE,DISPLAY,VERSION)
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i].trim();
    if (!line) continue;
    // Handle quoted fields (some DISPLAY values contain commas)
    let code, display;
    if (line.startsWith('"')) {
      // Unlikely for CODE field but handle gracefully
      const match = line.match(/^"([^"]*)",(".*?"|[^,]*)/);
      if (match) { code = match[1]; display = match[2].replace(/^"|"$/g, ''); }
    } else {
      const firstComma = line.indexOf(',');
      const secondComma = line.indexOf(',', firstComma + 1);
      if (firstComma === -1) continue;
      code = line.substring(0, firstComma).trim();
      // DISPLAY may be quoted if it contains commas
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

export function loadICD10() {
  if (cache) return Promise.resolve(cache);
  if (loadingPromise) return loadingPromise;

  loadingPromise = fetch('/data/icd10.csv')
    .then(res => {
      if (!res.ok) throw new Error(`Failed to load ICD-10 data: ${res.status}`);
      return res.text();
    })
    .then(text => {
      cache = parseCSV(text);
      loadingPromise = null;
      return cache;
    })
    .catch(err => {
      loadingPromise = null;
      throw err;
    });

  return loadingPromise;
}

export function searchICD10(data, query) {
  if (!query || !query.trim()) return data;
  const q = query.trim().toLowerCase();
  return data.filter(
    item =>
      item.code.toLowerCase().includes(q) ||
      item.display.toLowerCase().includes(q)
  );
}
