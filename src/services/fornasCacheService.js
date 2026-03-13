import { supabase } from './supabaseClient';
import { openDB } from './idbQueue';

const FORNAS_TABLE = 'fornas_drugs';
const FORNAS_STORE = 'fornasCacheUser';
const FORNAS_META_STORE = 'fornasMetaUser';

const FORNAS_SELECT = 'id,source_id,sks_id,name,name_international,label,form_code,form,strength,unit_code,unit,category_l1,category_l2,category_l3,category_l4,restriction_drug,restriction_form,restriction_note_l1,restriction_note_l2,restriction_note_l3,restriction_note_l4,max_prescription,komposisi,flag_fpktl,flag_fpktp,flag_pp,flag_prb,flag_oen,flag_program,flag_kanker';

function normalizeUserId(userId) {
  const id = String(userId ?? '').trim();
  if (!id) throw new Error('User tidak valid untuk cache Fornas.');
  return id;
}

function userMetaKey(userId) {
  return `fornasCacheMeta:${normalizeUserId(userId)}`;
}

function stripInternalFields(row) {
  if (!row) return row;
  const { cacheKey: _cacheKey, userId: _userId, ...clean } = row;
  return clean;
}

function runTransaction(storeNames, mode, runner) {
  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction(storeNames, mode);
    runner(tx, resolve, reject);
    tx.onerror = () => reject(tx.error);
  }));
}

export function getFornasCacheMeta(userId) {
  const key = userMetaKey(userId);
  return runTransaction([FORNAS_META_STORE], 'readonly', (tx, resolve) => {
    const req = tx.objectStore(FORNAS_META_STORE).get(key);
    req.onsuccess = () => resolve(req.result ?? null);
    req.onerror = () => resolve(null);
  });
}

export async function isFornasCached(userId) {
  const meta = await getFornasCacheMeta(userId);
  return Boolean(meta?.count > 0);
}

export function getCachedFornasAll(userId) {
  const uid = normalizeUserId(userId);
  return runTransaction([FORNAS_STORE], 'readonly', (tx, resolve, reject) => {
    const store = tx.objectStore(FORNAS_STORE);
    let req;
    try {
      req = store.index('by_userId').getAll(IDBKeyRange.only(uid));
      req.onsuccess = () => resolve((req.result ?? []).map(stripInternalFields));
      req.onerror = () => reject(req.error);
    } catch (_) {
      // Fallback if index is missing for any reason.
      const rows = [];
      req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          resolve(rows.map(stripInternalFields));
          return;
        }
        if (cursor.value?.userId === uid) rows.push(cursor.value);
        cursor.continue();
      };
      req.onerror = () => reject(req.error);
    }
  });
}

function upsertFornasBatch(rows, userId) {
  const uid = normalizeUserId(userId);
  return runTransaction([FORNAS_STORE], 'readwrite', (tx, resolve) => {
    const store = tx.objectStore(FORNAS_STORE);
    rows.forEach((row) => {
      store.put({
        ...row,
        userId: uid,
        cacheKey: `${uid}:${row.id}`,
      });
    });
    tx.oncomplete = () => resolve();
  });
}

function setCacheMeta(userId, meta) {
  const uid = normalizeUserId(userId);
  const key = userMetaKey(uid);
  return runTransaction([FORNAS_META_STORE], 'readwrite', (tx, resolve) => {
    tx.objectStore(FORNAS_META_STORE).put({ key, userId: uid, ...meta });
    tx.oncomplete = () => resolve();
  });
}

async function fetchAllFornasRows(onProgress) {
  const batch = 1000;
  let from = 0;
  let allRows = [];

  while (true) {
    const { data, error } = await supabase
      .from(FORNAS_TABLE)
      .select(FORNAS_SELECT)
      .order('name')
      .range(from, from + batch - 1);

    if (error) throw new Error(error.message);

    const rows = data ?? [];
    if (rows.length === 0) break;

    allRows = allRows.concat(rows);
    from += rows.length;

    if (typeof onProgress === 'function') {
      onProgress({ downloaded: allRows.length, finished: false });
    }

    if (rows.length < batch) break;
  }

  return allRows;
}

async function persistFornasRowsForUser(userId, rows, onProgress, syncSource = 'manual') {
  await clearFornasCacheDataOnly(userId);

  const chunkSize = 500;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    await upsertFornasBatch(chunk, userId);
    if (typeof onProgress === 'function') {
      onProgress({
        downloaded: rows.length,
        cached: Math.min(i + chunk.length, rows.length),
        finished: false,
      });
    }
  }

  const updatedAt = new Date().toISOString();
  const forms = [...new Set(rows.map(r => r.form).filter(Boolean))].sort();
  const meta = { updatedAt, count: rows.length, forms, syncSource };
  await setCacheMeta(userId, meta);

  if (typeof onProgress === 'function') {
    onProgress({ downloaded: rows.length, cached: rows.length, finished: true });
  }

  return { rows, meta };
}

export async function cacheAllFornasFromSupabase(userId, onProgress) {
  const rows = await fetchAllFornasRows(onProgress);
  return persistFornasRowsForUser(userId, rows, onProgress, 'manual');
}

export async function refreshFornasCacheForUser(userId) {
  const rows = await fetchAllFornasRows();
  return persistFornasRowsForUser(userId, rows, undefined, 'auto');
}

function clearFornasCacheDataOnly(userId) {
  const uid = normalizeUserId(userId);
  return runTransaction([FORNAS_STORE], 'readwrite', (tx, resolve) => {
    const store = tx.objectStore(FORNAS_STORE);
    let done = false;

    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };

    try {
      const req = store.index('by_userId').openCursor(IDBKeyRange.only(uid));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          finish();
          return;
        }
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => finish();
      tx.oncomplete = () => finish();
    } catch (_) {
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          finish();
          return;
        }
        if (cursor.value?.userId === uid) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => finish();
      tx.oncomplete = () => finish();
    }
  });
}

export async function clearFornasCache(userId) {
  const uid = normalizeUserId(userId);
  const key = userMetaKey(uid);
  await runTransaction([FORNAS_STORE, FORNAS_META_STORE], 'readwrite', (tx, resolve) => {
    const store = tx.objectStore(FORNAS_STORE);
    const metaStore = tx.objectStore(FORNAS_META_STORE);
    let done = false;

    const finish = () => {
      if (!done) {
        done = true;
        resolve();
      }
    };

    metaStore.delete(key);

    try {
      const req = store.index('by_userId').openCursor(IDBKeyRange.only(uid));
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          finish();
          return;
        }
        cursor.delete();
        cursor.continue();
      };
      req.onerror = () => finish();
      tx.oncomplete = () => finish();
    } catch (_) {
      const req = store.openCursor();
      req.onsuccess = (e) => {
        const cursor = e.target.result;
        if (!cursor) {
          finish();
          return;
        }
        if (cursor.value?.userId === uid) cursor.delete();
        cursor.continue();
      };
      req.onerror = () => finish();
      tx.oncomplete = () => finish();
    }
  });
}

// ── Index-aware offline query ─────────────────────────────────────────────────

/**
 * Maps flag filter keys (as used in drug objects) to their IDB index names.
 * Indexes are defined in idbQueue.js on the fornasCache store.
 */
const FLAG_INDEX_MAP = {
  flag_oen:     'by_user_flag_oen',
  flag_fpktl:   'by_user_flag_fpktl',
  flag_fpktp:   'by_user_flag_fpktp',
  flag_prb:     'by_user_flag_prb',
  flag_pp:      'by_user_flag_pp',
  flag_program: 'by_user_flag_program',
  flag_kanker:  'by_user_flag_kanker',
};

/**
 * Query the local IDB cache using the most selective available index.
 *
 * Strategy:
 *  1. flag-only  → cursor on by_flag_X index (visits only drugs with flag=true)
 *  2. form-only  → cursor on by_form index (visits only that form)
 *  3. query-only → full user-scoped alphabetical scan so substring search matches online mode
 *  4. combined   → most selective index as entry point, remaining filters in JS
 *  5. no filter  → cursor on by_name index (alphabetical, all rows)
 *
 * The cursor scans every match to return an exact `total` count while only
 * keeping the first `limit` rows in memory—keeping React state small on
 * low-end devices without sacrificing accurate result counts.
 *
 * @param {{ userId: string, query?: string, flagKey?: string|null, form?: string, limit?: number }} opts
 * @returns {Promise<{ rows: object[], hasMore: boolean, total: number }>}
 */
export function queryFornasFromIDB({ userId, query = '', flagKey = null, form = '', limit = 100 } = {}) {
  const uid = normalizeUserId(userId);
  const q = query.trim().toUpperCase();

  return openDB().then((db) => new Promise((resolve, reject) => {
    const tx = db.transaction([FORNAS_STORE], 'readonly');
    const store = tx.objectStore(FORNAS_STORE);
    const rows = [];
    let total = 0;
    let cursorReq;

    // Pick the most selective IDB index as the cursor entry point.
    try {
      if (flagKey && FLAG_INDEX_MAP[flagKey] && !q && !form) {
        cursorReq = store.index(FLAG_INDEX_MAP[flagKey]).openCursor(IDBKeyRange.only([uid, true]));
      } else if (form && !q && !flagKey) {
        cursorReq = store.index('by_user_form').openCursor(IDBKeyRange.only([uid, form]));
      } else if (q && !flagKey && !form) {
        // Offline search should behave like online search, which uses substring
        // matching across multiple fields. A prefix-bounded name index misses
        // valid hits when the full query is present later in the string.
        cursorReq = store.index('by_user_name').openCursor(IDBKeyRange.bound([uid, ''], [uid, '\uffff']));
      } else {
        // Combined filters or no filter: full user-scoped alphabetical scan.
        cursorReq = store.index('by_user_name').openCursor(IDBKeyRange.bound([uid, ''], [uid, '\uffff']));
      }
    } catch (_) {
      // Index may not exist yet on older cached IDB (pre-v3 schema). Fall back gracefully.
      cursorReq = store.openCursor();
    }

    cursorReq.onsuccess = (e) => {
      const cursor = e.target.result;
      if (!cursor) {
        resolve({ rows, hasMore: total > limit, total });
        return;
      }

      const drug = cursor.value;
      let match = true;

  if (drug.userId !== uid) match = false;

      // Remaining JS filters (applied on top of the index entry point).
      if (flagKey && drug[flagKey] !== true) match = false;
      if (match && form && drug.form !== form) match = false;
      if (match && q) {
        const up = (s) => (s ? String(s).toUpperCase() : '');
        const nameOk  = up(drug.name).includes(q);
        const intlOk  = up(drug.name_international).includes(q);
        const labelOk = up(drug.label).includes(q);
        const cat1Ok  = up(drug.category_l1).includes(q);
        const cat2Ok  = up(drug.category_l2).includes(q);
        const cat3Ok  = up(drug.category_l3).includes(q);
        const formOk  = up(drug.form).includes(q);
        if (!nameOk && !intlOk && !labelOk && !cat1Ok && !cat2Ok && !cat3Ok && !formOk) match = false;
      }

      if (match) {
        total++;
        if (rows.length < limit) rows.push(stripInternalFields(drug));
      }

      cursor.continue();
    };

    cursorReq.onerror = () => reject(cursorReq.error);
    tx.onerror = () => reject(tx.error);
  }));
}
