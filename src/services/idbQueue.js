/**
 * idbQueue.js — IndexedDB-backed sync queue & conflict store
 *
 * DB: medterminal-db  v5
 * Stores:
 *   syncQueue    — pending write operations to flush to Supabase
 *   conflicts    — data conflicts detected during sync (multi-device)
 *   fornasCache  — legacy global Fornas cache (kept for backward compatibility)
 *   fornasMeta   — legacy global Fornas cache metadata
 *   fornasCacheUser — per-user Fornas rows for offline search/filtering
 *   fornasMetaUser  — per-user Fornas cache metadata (count, updatedAt, forms[])
 *   icd10Cache      — ICD-10 rows for offline search/filtering
 *   icd10Meta       — ICD-10 cache metadata (count, updatedAt, syncSource)
 *
 * Both stores are accessible from the page AND from the service worker,
 * because IndexedDB is available in both contexts.
 */

const DB_NAME = 'medterminal-db';
const DB_VERSION = 5;

// ── Open / upgrade ──────────────────────────────────────────────
// Single canonical openDB — creates ALL stores in one place.
// Imported by swConfig.js and sw.js to avoid version skew.
export function openDB() {
    return new Promise((resolve, reject) => {
        const req = indexedDB.open(DB_NAME, DB_VERSION);

        req.onupgradeneeded = (e) => {
            const db = e.target.result;

            // syncQueue: { id (auto), type, op, entityId, payload, userId, enqueuedAt }
            if (!db.objectStoreNames.contains('syncQueue')) {
                const sq = db.createObjectStore('syncQueue', { keyPath: 'id', autoIncrement: true });
                sq.createIndex('by_type', 'type');
                sq.createIndex('by_userId', 'userId');
            }

            // conflicts: { id (uuid), type, entityId, localSnapshot, serverSnapshot, detectedAt, resolved }
            if (!db.objectStoreNames.contains('conflicts')) {
                const co = db.createObjectStore('conflicts', { keyPath: 'id' });
                co.createIndex('by_resolved', 'resolved');
                co.createIndex('by_type', 'type');
            }

            // swConfig: Supabase URL/key stored here so the service worker can read it
            if (!db.objectStoreNames.contains('swConfig')) {
                db.createObjectStore('swConfig', { keyPath: 'key' });
            }

            // fornasCache: full Fornas rows for offline search/filtering
            if (!db.objectStoreNames.contains('fornasCache')) {
                const fc = db.createObjectStore('fornasCache', { keyPath: 'id' });
                fc.createIndex('by_name', 'name');
                fc.createIndex('by_category_l1', 'category_l1');
                // v3: index-aware query indexes
                fc.createIndex('by_form', 'form');
                fc.createIndex('by_flag_oen',     'flag_oen');
                fc.createIndex('by_flag_fpktl',   'flag_fpktl');
                fc.createIndex('by_flag_fpktp',   'flag_fpktp');
                fc.createIndex('by_flag_prb',     'flag_prb');
                fc.createIndex('by_flag_pp',      'flag_pp');
                fc.createIndex('by_flag_program', 'flag_program');
                fc.createIndex('by_flag_kanker',  'flag_kanker');
            }

            // fornasMeta: cache metadata (count, updatedAt, forms[])
            if (!db.objectStoreNames.contains('fornasMeta')) {
                db.createObjectStore('fornasMeta', { keyPath: 'key' });
            }

            // v2 → v3: add performance indexes to existing fornasCache
            if (e.oldVersion < 3 && e.oldVersion >= 2 && db.objectStoreNames.contains('fornasCache')) {
                const fc3 = e.target.transaction.objectStore('fornasCache');
                if (!fc3.indexNames.contains('by_form'))         fc3.createIndex('by_form', 'form');
                if (!fc3.indexNames.contains('by_flag_oen'))     fc3.createIndex('by_flag_oen',     'flag_oen');
                if (!fc3.indexNames.contains('by_flag_fpktl'))   fc3.createIndex('by_flag_fpktl',   'flag_fpktl');
                if (!fc3.indexNames.contains('by_flag_fpktp'))   fc3.createIndex('by_flag_fpktp',   'flag_fpktp');
                if (!fc3.indexNames.contains('by_flag_prb'))     fc3.createIndex('by_flag_prb',     'flag_prb');
                if (!fc3.indexNames.contains('by_flag_pp'))      fc3.createIndex('by_flag_pp',      'flag_pp');
                if (!fc3.indexNames.contains('by_flag_program')) fc3.createIndex('by_flag_program', 'flag_program');
                if (!fc3.indexNames.contains('by_flag_kanker'))  fc3.createIndex('by_flag_kanker',  'flag_kanker');
            }

            // fornasCacheUser: per-account Fornas cache rows
            // keyPath: cacheKey = `${userId}:${id}`
            if (!db.objectStoreNames.contains('fornasCacheUser')) {
                const fcu = db.createObjectStore('fornasCacheUser', { keyPath: 'cacheKey' });
                fcu.createIndex('by_userId', 'userId');
                fcu.createIndex('by_user_name', ['userId', 'name']);
                fcu.createIndex('by_user_form', ['userId', 'form']);
                fcu.createIndex('by_user_flag_oen', ['userId', 'flag_oen']);
                fcu.createIndex('by_user_flag_fpktl', ['userId', 'flag_fpktl']);
                fcu.createIndex('by_user_flag_fpktp', ['userId', 'flag_fpktp']);
                fcu.createIndex('by_user_flag_prb', ['userId', 'flag_prb']);
                fcu.createIndex('by_user_flag_pp', ['userId', 'flag_pp']);
                fcu.createIndex('by_user_flag_program', ['userId', 'flag_program']);
                fcu.createIndex('by_user_flag_kanker', ['userId', 'flag_kanker']);
            }

            // fornasMetaUser: metadata per user
            // key: fornasCacheMeta:<userId>
            if (!db.objectStoreNames.contains('fornasMetaUser')) {
                const fmu = db.createObjectStore('fornasMetaUser', { keyPath: 'key' });
                fmu.createIndex('by_userId', 'userId');
            }

            // icd10Cache: ICD-10 rows (global, not per-user)
            // keyPath: code
            if (!db.objectStoreNames.contains('icd10Cache')) {
                const ic = db.createObjectStore('icd10Cache', { keyPath: 'code' });
                ic.createIndex('by_code', 'code');
            }

            // icd10Meta: cache metadata
            // key: icd10CacheMeta
            if (!db.objectStoreNames.contains('icd10Meta')) {
                db.createObjectStore('icd10Meta', { keyPath: 'key' });
            }
        };

        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    });
}

// ── Generic helpers ─────────────────────────────────────────────
function withStore(storeName, mode, fn) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction(storeName, mode);
        const store = tx.objectStore(storeName);
        const reqOrValue = fn(store);
        // If fn returns an IDB request, wait for it; otherwise wait for tx to complete
        if (reqOrValue && typeof reqOrValue.onsuccess !== 'undefined') {
            reqOrValue.onsuccess = () => resolve(reqOrValue.result);
            reqOrValue.onerror = () => reject(reqOrValue.error);
        } else {
            tx.oncomplete = () => resolve(reqOrValue);
            tx.onerror = () => reject(tx.error);
        }
    }));
}

// ── syncQueue API ────────────────────────────────────────────────

/**
 * Enqueue a write operation.
 * @param {{ type: 'patients'|'stases'|'schedules', op: 'upsert'|'delete', entityId: string, payload: any, userId: string }} item
 */
export function enqueue(item) {
    return withStore('syncQueue', 'readwrite', store =>
        store.add({ ...item, enqueuedAt: new Date().toISOString() })
    );
}

/** Get all pending queue items */
export function peekQueue() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('syncQueue', 'readonly');
        const req = tx.objectStore('syncQueue').getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

/** Remove a single queue item by its auto-increment id */
export function dequeue(id) {
    return withStore('syncQueue', 'readwrite', store => store.delete(id));
}

/** Remove all queue items for a userId */
export function clearQueueForUser(userId) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('syncQueue', 'readwrite');
        const index = tx.objectStore('syncQueue').index('by_userId');
        const req = index.openCursor(IDBKeyRange.only(userId));
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

/** Remove all queue items of a specific type for a userId */
export function clearQueueByType(userId, type) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('syncQueue', 'readwrite');
        const store = tx.objectStore('syncQueue');
        const index = store.index('by_userId');
        const req = index.openCursor(IDBKeyRange.only(userId));
        req.onsuccess = (e) => {
            const cursor = e.target.result;
            if (cursor) {
                if (cursor.value.type === type) cursor.delete();
                cursor.continue();
            }
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

/** Returns true if there are pending items */
export function hasQueue() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('syncQueue', 'readonly');
        const req = tx.objectStore('syncQueue').count();
        req.onsuccess = () => resolve(req.result > 0);
        req.onerror = () => reject(req.error);
    }));
}

// ── conflicts API ────────────────────────────────────────────────

/**
 * Save a detected conflict.
 * @param {{ id: string, type: string, entityId: string, entityName: string, localSnapshot: any, serverSnapshot: any, changedFields: string[] }} item
 */
export function addConflict(item) {
    return withStore('conflicts', 'readwrite', store =>
        store.put({ ...item, detectedAt: new Date().toISOString(), resolved: false })
    );
}

/** Get all unresolved conflicts */
export function listConflicts() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('conflicts', 'readonly');
        const index = tx.objectStore('conflicts').index('by_resolved');
        const req = index.getAll(IDBKeyRange.only(false));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

/** Count unresolved conflicts */
export function countConflicts() {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('conflicts', 'readonly');
        const index = tx.objectStore('conflicts').index('by_resolved');
        const req = index.count(IDBKeyRange.only(false));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
    }));
}

/** Mark a conflict as resolved */
export function resolveConflict(id) {
    return openDB().then(db => new Promise((resolve, reject) => {
        const tx = db.transaction('conflicts', 'readwrite');
        const store = tx.objectStore('conflicts');
        const getReq = store.get(id);
        getReq.onsuccess = () => {
            const item = getReq.result;
            if (!item) { resolve(); return; }
            store.put({ ...item, resolved: true, resolvedAt: new Date().toISOString() });
        };
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
    }));
}

/** Delete a conflict entry entirely */
export function deleteConflict(id) {
    return withStore('conflicts', 'readwrite', store => store.delete(id));
}
