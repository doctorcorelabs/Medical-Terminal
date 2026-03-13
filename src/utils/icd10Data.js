// ICD-10 data loader — lazy fetch from public/data/icd10.csv
// Module-level cache so CSV is only fetched once per session

import {
  cacheAllICD10FromSource,
  getCachedICD10All,
  getICD10CacheMeta,
  refreshICD10Cache,
} from '../services/icd10CacheService';

let cache = null;
let loadingPromise = null;

export function loadICD10() {
  if (cache) return Promise.resolve(cache);
  if (loadingPromise) return loadingPromise;

  loadingPromise = Promise.all([
    getICD10CacheMeta(),
    getCachedICD10All(),
  ])
    .then(async ([meta, cachedRows]) => {
      const hasPersistentCache = Boolean(meta?.count > 0 && cachedRows.length > 0);

      if (hasPersistentCache) {
        cache = cachedRows;

        // Keep cache warm in background when online without delaying first paint.
        refreshICD10Cache().catch(() => {});

        return cache;
      }

      const { rows } = await cacheAllICD10FromSource();
      cache = rows;
      return cache;
    })
    .catch(err => {
      loadingPromise = null;
      throw err;
    })
    .finally(() => {
      loadingPromise = null;
    });

  return loadingPromise;
}

export async function forceRefreshICD10() {
  const { rows } = await refreshICD10Cache();
  cache = rows;
  return cache;
}

export function clearICD10MemoryCache() {
  cache = null;
  loadingPromise = null;
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
