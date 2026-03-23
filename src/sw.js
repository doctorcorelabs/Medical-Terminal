/**
 * src/sw.js — Custom Service Worker for MedxTerminal
 *
 * Strategy: injectManifest (vite-plugin-pwa)
 * Workbox injects the precache manifest at build time (__WB_MANIFEST).
 * We add our own Background Sync logic on top.
 *
 * Handles:
 *   - Precaching (Workbox)
 *   - Navigate fallback for SPA routing
 *   - Background Sync: 'sync-medterminal' tag
 *   - Per-patient conflict detection before each upsert
 *   - postMessage to notify the page of sync results
 */

// ── All imports at the top (ES modules — hoisted regardless of position) ──
import { clientsClaim } from 'workbox-core';
import { precacheAndRoute, cleanupOutdatedCaches, createHandlerBoundToURL } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';
import { NetworkFirst, CacheFirst, NetworkOnly } from 'workbox-strategies';
import { ExpirationPlugin } from 'workbox-expiration';
import { CacheableResponsePlugin } from 'workbox-cacheable-response';
// IDB helpers — canonical schema lives in idbQueue.js (bundled by Vite injectManifest)
import { openDB, peekQueue, dequeue, addConflict } from './services/idbQueue';
import { mergeSchedules } from './utils/scheduleSync';

// ── Workbox boilerplate ──────────────────────────────────────────
self.skipWaiting();
clientsClaim();

// Injected by vite-plugin-pwa at build time
precacheAndRoute(self.__WB_MANIFEST || []);
cleanupOutdatedCaches();

// SPA Navigation fallback
registerRoute(
    new NavigationRoute(createHandlerBoundToURL('/index.html'), {
        denylist: [/^\/.netlify\//, /^\/api\//],
    })
);

// ── Runtime caching ──────────────────────────────────────────────

// Supabase Auth — NEVER cache (session/refresh must be live)
registerRoute(
    ({ url }) =>
        url.hostname.includes('supabase.co')
        && /\/auth\//.test(url.pathname),
    new NetworkOnly()
);

// Supabase REST/Functions — NetworkFirst
registerRoute(
    ({ url }) =>
        url.hostname.includes('supabase.co')
        && /\/(rest|functions)\//.test(url.pathname),
    new NetworkFirst({
        cacheName: 'medx-supabase-api',
        networkTimeoutSeconds: 15,
        plugins: [
            new ExpirationPlugin({ maxEntries: 100, maxAgeSeconds: 86400 }),
            new CacheableResponsePlugin({ statuses: [200] }),
        ],
    })
);

// ICD-10 CSV — CacheFirst 30 days
registerRoute(
    ({ url }) => url.pathname.endsWith('/data/icd10.csv'),
    new CacheFirst({
        cacheName: 'medx-icd10-data',
        plugins: [
            new ExpirationPlugin({ maxAgeSeconds: 60 * 60 * 24 * 30 }),
            new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
    })
);

// Google Fonts — CacheFirst 1 year
registerRoute(
    ({ url }) => ['fonts.googleapis.com', 'fonts.gstatic.com'].includes(url.hostname),
    new CacheFirst({
        cacheName: 'medx-google-fonts',
        plugins: [
            new ExpirationPlugin({ maxEntries: 10, maxAgeSeconds: 60 * 60 * 24 * 365 }),
            new CacheableResponsePlugin({ statuses: [0, 200] }),
        ],
    })
);

// ── Broadcast to page clients ────────────────────────────────────
async function broadcastToClients(message) {
    const allClients = await self.clients.matchAll({ includeUncontrolled: true, type: 'window' });
    allClients.forEach(client => client.postMessage(message));
}

// ── Background Sync processor ─────────────────────────────────────
async function processQueue() {
    const items = await peekQueue();
    if (items.length === 0) return;
    const syncWarnings = [];

    // Group by userId + type to batch into single upsert per group
    const groups = {};
    for (const item of items) {
        const key = `${item.userId}::${item.type}`;
        if (!groups[key]) groups[key] = { userId: item.userId, type: item.type, items: [] };
        groups[key].items.push(item);
    }

    let allOk = true;
    for (const group of Object.values(groups)) {
        try {
            await flushGroup(group, syncWarnings);
            for (const item of group.items) {
                await dequeue(item.id);
            }
        } catch (err) {
            console.error('[SW] flushGroup failed:', group.type, err);
            allOk = false;
        }
    }

    await broadcastToClients({
        type: 'SYNC_COMPLETE',
        success: allOk,
        degraded: syncWarnings.length > 0,
        warningCount: syncWarnings.length,
        warnings: syncWarnings.slice(0, 10),
        processedAt: new Date().toISOString(),
    });
}

// ── Fetch current server row ──────────────────────────────────────
async function fetchServerRow(supabaseUrl, supabaseKey, table, userId, accessToken, warningSink = null) {
    try {
        const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer ${supabaseKey}`;
        const res = await fetch(
            `${supabaseUrl}/rest/v1/${table}?user_id=eq.${userId}&select=*&limit=1&t=${Date.now()}`,
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                },
                cache: 'no-store'
            }
        );
        if (!res.ok) {
            warningSink?.push({
                scope: 'sw',
                code: 'server_row_fetch_failed',
                table,
                userId,
                status: res.status,
            });
            return null;
        }
        const rows = await res.json();
        return rows.length > 0 ? rows[0] : null;
    } catch (err) {
        warningSink?.push({
            scope: 'sw',
            code: 'server_row_fetch_error',
            table,
            userId,
            error: err?.message || String(err || 'unknown'),
        });
        return null;
    }
}

// ── Per-patient conflict detection ───────────────────────────────
/**
 * Compare each patient by `id`.
 * - Local-only  → keep IF it's newer than server row, else DROP (deleted elsewhere)
 * - Server newer + real field diff → record conflict in IDB, use server version
 * - Local newer or equal → keep local
 * - Server-only → keep (added from another device)
 */
async function mergePatients(localPayload, serverRow, userId) {
    const localPatients  = localPayload.patients_data  || [];
    const serverPatients = serverRow?.patients_data    || [];
    const serverUpdatedAt = serverRow?.updated_at ? Date.parse(serverRow.updated_at) : 0;
    
    const serverMap = new Map(serverPatients.map(p => [p.id, p]));
    const localMap  = new Map(localPatients.map(p => [p.id, p]));

    const merged = [];
    const checkFields = ['name', 'age', 'gender', 'bloodType', 'rhesus', 'diagnosis', 'notes', 'prescriptions', 'symptoms', 'physicalExams', 'supportingExams', 'vitalSigns', 'dailyReports'];

    for (const local of localPatients) {
        const server = serverMap.get(local.id);
        const localTs = Date.parse(local.updatedAt || local.updated_at || '1970-01-01T00:00:00.000Z');

        if (!server) {
            // Deletion Check: If server row exists and is newer than our local item, 
            // but our item is missing from server row → it was deleted elsewhere.
            if (serverUpdatedAt > 0 && localTs < serverUpdatedAt) {
                continue; // DROP (Deleted)
            }
            merged.push(local);
            continue;
        }

        const serverTs = Date.parse(server.updatedAt || server.updated_at || '1970-01-01T00:00:00.000Z');

        if (serverTs > localTs) {
            const changedFields = checkFields.filter(
                f => JSON.stringify(local[f]) !== JSON.stringify(server[f])
            );
            if (changedFields.length > 0) {
                await addConflict({
                    id: `${userId}_${local.id}_${Date.now()}`,
                    userId,
                    type: 'patients',
                    entityId: local.id,
                    entityName: local.name || local.id,
                    localSnapshot: local,
                    serverSnapshot: server,
                    changedFields,
                });
            }
            merged.push(server);
        } else {
            merged.push(local);
        }
    }

    // Append server-only patients (added from another device)
    for (const server of serverPatients) {
        if (!localMap.has(server.id)) merged.push(server);
    }

    return { ...localPayload, patients_data: merged };
}

/**
 * Per-item merge by `id` with timestamp comparison.
 * - Local-only + older than server row → DROP (deleted elsewhere)
 * - Both exist → keep the one with newer individual timestamp
 * - Server-only → keep (added from another device)
 */
function mergeSimple(dataKey, localPayload, serverRow) {
    const local    = localPayload[dataKey] || [];
    const server   = serverRow?.[dataKey]  || [];
    const serverUpdatedAt = serverRow?.updated_at ? Date.parse(serverRow.updated_at) : 0;

    const serverMap = new Map();
    for (const item of server) {
        if (item?.id) serverMap.set(item.id, item);
    }

    const merged = [];
    const mergedIds = new Set();

    for (const item of local) {
        const id = item?.id;
        if (!id) { merged.push(item); continue; }

        const serverItem = serverMap.get(id);
        const localTs = Date.parse(item.updatedAt || item.updated_at || item.createdAt || item.created_at || '1970-01-01');

        if (!serverItem) {
            if (serverUpdatedAt > 0 && localTs < serverUpdatedAt) {
                continue; // DROP (deleted on another device)
            }
            merged.push(item);
            mergedIds.add(id);
            continue;
        }

        const serverTs = Date.parse(serverItem.updatedAt || serverItem.updated_at || serverItem.createdAt || serverItem.created_at || '1970-01-01');
        merged.push(serverTs > localTs ? serverItem : item);
        mergedIds.add(id);
    }

    for (const item of server) {
        if (item?.id && !mergedIds.has(item.id)) merged.push(item);
    }

    return { ...localPayload, [dataKey]: merged };
}

// ── Dispatch to correct merge strategy ───────────────────────────
async function mergeWithConflictDetection(type, localPayload, serverRow, userId) {
    if (type === 'patients')  return mergePatients(localPayload, serverRow, userId);
    if (type === 'stases')    return mergeSimple('stases_data',    localPayload, serverRow);
    if (type === 'schedules') {
        const mergedSchedules = mergeSchedules(
            localPayload?.schedules_data || [],
            serverRow?.schedules_data || [],
            serverRow?.updated_at,
            localPayload?.deleted_schedules_state || {},
        );
        return { schedules_data: mergedSchedules };
    }
    return localPayload;
}

/**
 * Flush a group of queue items for a specific entity type to Supabase.
 * Fetches the server row first, merges with conflict detection, then upserts.
 */
async function flushGroup(group, warningSink = null) {
    const config = await getSwConfig(warningSink);
    if (!config || !config.supabaseUrl || !config.supabaseKey) {
        throw new Error('[SW] Missing Supabase config. Page must call storeSwConfig() first.');
    }

    const { supabaseUrl, supabaseKey, accessToken } = config;
    const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer ${supabaseKey}`;
    
    const tableMap = {
        patients:  'user_patients',
        stases:    'user_stases',
        schedules: 'user_schedules',
    };
    const table = tableMap[group.type];
    if (!table) throw new Error(`[SW] Unknown type: ${group.type}`);

    const deletes = group.items.filter(i => i.op === 'delete');
    const upserts = group.items.filter(i => i.op === 'upsert');

    // ── Upserts ──────────────────────────────────────────────────
    if (upserts.length > 0) {
        upserts.sort((a, b) => a.enqueuedAt.localeCompare(b.enqueuedAt));
        const lastPayload = upserts[upserts.length - 1].payload;

        // 1. Fetch current server state
        const serverRow = await fetchServerRow(supabaseUrl, supabaseKey, table, group.userId, accessToken, warningSink);

        // 2. Merge (records conflict in IDB when needed)
        const mergedPayload = await mergeWithConflictDetection(
            group.type, lastPayload, serverRow, group.userId
        );

        // 3. Upsert merged result
        const body = { user_id: group.userId, ...mergedPayload, updated_at: new Date().toISOString() };
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}?on_conflict=user_id`, {
            method: 'POST',
            headers: {
                'apikey': supabaseKey,
                'Authorization': authHeader,
                'Content-Type': 'application/json',
                'Prefer': 'resolution=merge-duplicates,return=minimal',
            },
            body: JSON.stringify(body),
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`[SW] Upsert failed (${table}): ${err}`);
        }
    }

    // ── Deletes ──────────────────────────────────────────────────
    for (const del of deletes) {
        const res = await fetch(`${supabaseUrl}/rest/v1/${table}?user_id=eq.${del.userId}`, {
            method: 'DELETE',
            headers: {
                'apikey': supabaseKey,
                'Authorization': authHeader,
            },
        });
        if (!res.ok) {
            const err = await res.text();
            throw new Error(`[SW] Delete failed (${table}): ${err}`);
        }
    }
}

// ── SW Config store (set from page) ─────────────────────────────
function getSwConfig(warningSink = null) {
    return openDB().then(db => new Promise((resolve) => {
        if (!db.objectStoreNames.contains('swConfig')) { resolve(null); return; }
        try {
            const tx = db.transaction('swConfig', 'readonly');
            const req = tx.objectStore('swConfig').get('config');
            req.onsuccess = () => resolve(req.result?.data || null);
            req.onerror = () => {
                warningSink?.push({
                    scope: 'sw',
                    code: 'sw_config_read_failed',
                    error: req.error?.message || 'unknown',
                });
                resolve(null);
            };
        } catch (err) {
            warningSink?.push({
                scope: 'sw',
                code: 'sw_config_read_error',
                error: err?.message || String(err || 'unknown'),
            });
            resolve(null);
        }
    }));
}

// ── Sync event ────────────────────────────────────────────────────
self.addEventListener('sync', (event) => {
    if (event.tag === 'sync-medterminal') {
        event.waitUntil(processQueue());
    }
});

// ── Message from page ─────────────────────────────────────────────
self.addEventListener('message', (event) => {
    if (event.data?.type === 'TRIGGER_SYNC') {
        // Page-initiated immediate sync (e.g., when coming back online)
        event.waitUntil(processQueue());
    }
    if (event.data?.type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});
