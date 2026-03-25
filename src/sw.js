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
import {
    openDB,
    peekQueue,
    dequeue,
    addConflict,
    markQueueItemSynced,
    markQueueItemSyncFailure,
    compactSyncedQueueItems,
} from './services/idbQueue';
import { mergeSchedules } from './utils/scheduleSync';
import { getQueueRetryState } from './utils/syncRetry';

// ── Workbox boilerplate ──────────────────────────────────────────
self.skipWaiting();
clientsClaim();

// Injected by vite-plugin-pwa at build time
const PRECACHE_MANIFEST = self.__WB_MANIFEST || [];
precacheAndRoute(PRECACHE_MANIFEST);
cleanupOutdatedCaches();

// SPA Navigation fallback
const NAVIGATION_DENYLIST = [/^\/.netlify\//, /^\/api\//];

const hasPrecachedIndex = PRECACHE_MANIFEST.some((entry) => {
    const url = typeof entry === 'string' ? entry : entry?.url;
    return url === '/index.html' || url === 'index.html';
});

if (hasPrecachedIndex) {
    registerRoute(
        new NavigationRoute(createHandlerBoundToURL('/index.html'), {
            denylist: NAVIGATION_DENYLIST,
        })
    );
} else {
    registerRoute(
        ({ request, url }) => request.mode === 'navigate' && !NAVIGATION_DENYLIST.some((regex) => regex.test(url.pathname)),
        async () => {
            // Dev mode fallback: index.html may not be in precache manifest.
            return fetch('/index.html');
        }
    );
}

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
let processQueueInFlight = null;
const PROCESS_QUEUE_TIMEOUT_MS = 30_000;
const MAX_SYNC_ATTEMPTS = 8;
const SW_QUEUE_RETRY_OPTIONS = {
    baseDelayMs: 2_000,
    maxDelayMs: 5 * 60_000,
    jitterRatio: 0.25,
};

async function processQueueOnce() {
    await compactSyncedQueueItems().catch((err) => {
        console.warn('[SW] compactSyncedQueueItems failed:', err);
    });

    const config = await getSwConfig().catch(() => null);
    const activeUserId = config?.userId || null;

    const allPendingItems = await peekQueue();
    // Only process items for the currently logged-in user to avoid ghost warnings 
    // from previous sessions or other accounts on the same device.
    const items = allPendingItems.filter(item => item.userId === activeUserId);
    
    if (items.length === 0) {
        // If we found 0 items for the active user, we still broadcast success 
        // to clear any 'isSyncing' signals on the page.
        await broadcastToClients({
            type: 'SYNC_COMPLETE',
            success: true,
            degraded: false,
            hasStuckItems: false,
            warningCount: 0,
            warnings: [],
            userId: activeUserId,
            processedAt: new Date().toISOString(),
        });
        return;
    }
    const syncWarnings = [];

    const retryableItems = [];
    const deferredItems = [];
    const maxAttemptItems = [];
    const nowMs = Date.now();

    for (const item of items) {
        const attempts = Number(item?.attemptCount || 0);
        if (attempts >= MAX_SYNC_ATTEMPTS) {
            maxAttemptItems.push({
                id: item.id,
                userId: item.userId,
                type: item.type,
                attemptCount: attempts,
            });
            continue;
        }

        const retryState = getQueueRetryState(item, SW_QUEUE_RETRY_OPTIONS, nowMs);
        if (retryState.ready) {
            retryableItems.push(item);
            continue;
        }
        deferredItems.push({
            id: item.id,
            userId: item.userId,
            type: item.type,
            waitMs: retryState.waitMs,
            attemptCount: retryState.attemptCount,
        });
    }

    if (retryableItems.length === 0) {
        const warnings = [];
        if (deferredItems.length > 0) {
            warnings.push({
                scope: 'sw',
                code: 'retry_backoff_deferred',
                deferredCount: deferredItems.length,
                minWaitMs: Math.min(...deferredItems.map((item) => item.waitMs || 0)),
            });
        }
        if (maxAttemptItems.length > 0) {
            warnings.push({
                scope: 'sw',
                code: 'retry_max_attempts_reached',
                itemCount: maxAttemptItems.length,
                maxAttempts: MAX_SYNC_ATTEMPTS,
            });
        }

        await broadcastToClients({
            type: 'SYNC_COMPLETE',
            success: true,
            degraded: warnings.some(w => w.code === 'retry_backoff_deferred'),
            hasStuckItems: warnings.some(w => w.code === 'retry_max_attempts_reached'),
            warningCount: warnings.length,
            warnings: warnings.slice(0, 10),
            userId: activeUserId,
            processedAt: new Date().toISOString(),
        });
        return;
    }

    // Group by userId + type to batch into single upsert per group
    const groups = {};
    for (const item of retryableItems) {
        const key = `${item.userId}::${item.type}`;
        if (!groups[key]) groups[key] = { userId: item.userId, type: item.type, items: [] };
        groups[key].items.push(item);
    }

    let allOk = true;
    const failedDequeue = [];
    for (const group of Object.values(groups)) {
        try {
            await flushGroup(group, syncWarnings);
            for (const item of group.items) {
                try {
                    await markQueueItemSynced(item.id, {
                        syncedBy: 'sw',
                    });
                    await dequeue(item.id);
                } catch (dequeueErr) {
                    failedDequeue.push(item.id);
                    console.error('[SW] dequeue failed for item:', item.id, dequeueErr);
                    allOk = false;
                    syncWarnings.push({
                        scope: 'sw',
                        code: 'dequeue_failed',
                        itemId: item.id,
                        error: dequeueErr?.message,
                    });
                }
            }
        } catch (err) {
            console.error('[SW] flushGroup failed:', group.type, err);
            allOk = false;
            for (const item of group.items) {
                await markQueueItemSyncFailure(item.id, err?.message || String(err || 'flush_failed')).catch(() => {
                    // Best effort metadata only.
                });
            }
        }
    }

    await broadcastToClients({
        type: 'SYNC_COMPLETE',
        success: allOk,
        degraded: syncWarnings.length > 0 || deferredItems.length > 0,
        hasStuckItems: maxAttemptItems.length > 0,
        warningCount: syncWarnings.length + (deferredItems.length > 0 ? 1 : 0),
        failedDequeueCount: failedDequeue.length,
        userId: activeUserId,
        warnings: [
            ...syncWarnings,
            ...(deferredItems.length > 0
                ? [{
                    scope: 'sw',
                    code: 'retry_backoff_deferred',
                    deferredCount: deferredItems.length,
                    minWaitMs: Math.min(...deferredItems.map((item) => item.waitMs || 0)),
                }]
                : []),
            ...(maxAttemptItems.length > 0
                ? [{
                    scope: 'sw',
                    code: 'retry_max_attempts_reached',
                    itemCount: maxAttemptItems.length,
                    maxAttempts: MAX_SYNC_ATTEMPTS,
                }]
                : []),
        ].slice(0, 10),
        processedAt: new Date().toISOString(),
    });
}

function processQueue() {
    if (processQueueInFlight) {
        return processQueueInFlight;
    }

    processQueueInFlight = (async () => {
        let timeoutHandle = null;
        try {
            await Promise.race([
                processQueueOnce(),
                new Promise((_, reject) => {
                    timeoutHandle = setTimeout(() => {
                        reject(new Error(`[SW] processQueue timed out after ${PROCESS_QUEUE_TIMEOUT_MS}ms`));
                    }, PROCESS_QUEUE_TIMEOUT_MS);
                }),
            ]);
        } catch (err) {
            console.error('[SW] processQueue failed:', err);
            await broadcastToClients({
                type: 'SYNC_COMPLETE',
                success: false,
                degraded: true,
                warningCount: 1,
                userId: activeUserId,
                warnings: [{
                    scope: 'sw',
                    code: 'process_queue_failed',
                    error: err?.message || String(err || 'unknown'),
                }],
                processedAt: new Date().toISOString(),
            });
        } finally {
            if (timeoutHandle) clearTimeout(timeoutHandle);
            processQueueInFlight = null;
        }
    })();

    return processQueueInFlight;
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

function getTimestampForMerge(item) {
    const parsed = Date.parse(item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at || '1970-01-01T00:00:00.000Z');
    return Number.isFinite(parsed) ? parsed : 0;
}

function getSyncMetaForMerge(item) {
    const deviceId =
        item?._device_id
        || item?._sync?.deviceId
        || item?.deviceId
        || 'legacy';
    const sequence = Number(
        item?._sequence
        ?? item?._sync?.sequenceNum
        ?? item?.sequenceNum
        ?? 0
    );
    return {
        deviceId: typeof deviceId === 'string' ? deviceId : 'legacy',
        sequence: Number.isFinite(sequence) ? sequence : 0,
    };
}

function choosePreferredForMerge(localItem, serverItem) {
    const localTs = getTimestampForMerge(localItem);
    const serverTs = getTimestampForMerge(serverItem);
    if (localTs !== serverTs) {
        return serverTs > localTs ? serverItem : localItem;
    }

    const localMeta = getSyncMetaForMerge(localItem);
    const serverMeta = getSyncMetaForMerge(serverItem);
    if (localMeta.sequence !== serverMeta.sequence) {
        return serverMeta.sequence > localMeta.sequence ? serverItem : localItem;
    }

    const deviceCmp = String(serverMeta.deviceId).localeCompare(String(localMeta.deviceId));
    if (deviceCmp !== 0) {
        return deviceCmp > 0 ? serverItem : localItem;
    }

    return localItem;
}

async function fetchCurrentProfileRole(supabaseUrl, supabaseKey, userId, accessToken, warningSink = null) {
    try {
        const authHeader = accessToken ? `Bearer ${accessToken}` : `Bearer ${supabaseKey}`;
        const res = await fetch(
            `${supabaseUrl}/rest/v1/profiles?user_id=eq.${userId}&select=role&limit=1`,
            {
                headers: {
                    'apikey': supabaseKey,
                    'Authorization': authHeader,
                    'Accept': 'application/json',
                },
                cache: 'no-store',
            }
        );
        if (!res.ok) {
            warningSink?.push({
                scope: 'sw',
                code: 'profile_role_fetch_failed',
                userId,
                status: res.status,
            });
            return null;
        }
        const rows = await res.json();
        if (!Array.isArray(rows) || rows.length === 0) return null;
        return typeof rows[0]?.role === 'string' ? rows[0].role : null;
    } catch (err) {
        warningSink?.push({
            scope: 'sw',
            code: 'profile_role_fetch_error',
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

        const preferred = choosePreferredForMerge(local, server);

        if (preferred === server) {
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

        merged.push(choosePreferredForMerge(item, serverItem));
        mergedIds.add(id);
    }

    for (const item of server) {
        if (item?.id && !mergedIds.has(item.id)) merged.push(item);
    }

    return { ...localPayload, [dataKey]: merged };
}

function diffObjectKeys(left, right) {
    const keys = new Set([
        ...Object.keys(left || {}),
        ...Object.keys(right || {}),
    ]);
    const changed = [];
    for (const key of keys) {
        if (JSON.stringify(left?.[key]) !== JSON.stringify(right?.[key])) {
            changed.push(key);
        }
    }
    return changed;
}

async function captureNonPatientConflicts(type, localItems = [], serverItems = [], userId) {
    const serverMap = new Map(serverItems.map((item) => [item?.id, item]).filter(([id]) => Boolean(id)));
    const now = Date.now();

    for (const local of localItems) {
        if (!local?.id) continue;
        const server = serverMap.get(local.id);
        if (!server) continue;
        if (JSON.stringify(local) === JSON.stringify(server)) continue;

        const preferred = choosePreferredForMerge(local, server);
        if (preferred !== server) continue;

        const changedFields = diffObjectKeys(local, server).slice(0, 30);
        if (changedFields.length === 0) continue;

        await addConflict({
            id: `${userId}_${type}_${local.id}_${now}`,
            userId,
            type,
            entityId: local.id,
            entityName: local.title || local.name || local.id,
            localSnapshot: local,
            serverSnapshot: server,
            changedFields,
        });
    }
}

// ── Dispatch to correct merge strategy ───────────────────────────
async function mergeWithConflictDetection(type, localPayload, serverRow, userId) {
    if (type === 'patients')  return mergePatients(localPayload, serverRow, userId);
    if (type === 'stases') {
        await captureNonPatientConflicts(
            'stases',
            localPayload?.stases_data || [],
            serverRow?.stases_data || [],
            userId,
        );
        return mergeSimple('stases_data', localPayload, serverRow);
    }
    if (type === 'schedules') {
        await captureNonPatientConflicts(
            'schedules',
            localPayload?.schedules_data || [],
            serverRow?.schedules_data || [],
            userId,
        );
        const mergedSchedules = mergeSchedules(
            localPayload?.schedules_data || [],
            serverRow?.schedules_data || [],
            serverRow?.updated_at,
            localPayload?.deleted_schedules_state || {},
        );
        return { ...localPayload, schedules_data: mergedSchedules };
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

    const { supabaseUrl, supabaseKey, accessToken, accessTokenExpiresAt } = config;
    const nowEpochSec = Math.floor(Date.now() / 1000);
    if (accessToken && accessTokenExpiresAt && accessTokenExpiresAt <= (nowEpochSec + 30)) {
        warningSink?.push({
            scope: 'sw',
            code: 'auth_expired_deferred',
            userId: group.userId,
            expiresAt: accessTokenExpiresAt,
        });
        throw new Error('[SW] Deferred sync due to expired access token');
    }
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
        const lastUpsert = upserts[upserts.length - 1];
        const lastPayload = lastUpsert.payload;
        const roleSnapshot = typeof lastUpsert.roleSnapshot === 'string' && lastUpsert.roleSnapshot
            ? lastUpsert.roleSnapshot
            : null;
        const deviceId = typeof lastUpsert.deviceId === 'string' && lastUpsert.deviceId
            ? lastUpsert.deviceId
            : 'legacy';
        const sequenceNum = Number.isFinite(Number(lastUpsert.sequenceNum))
            ? Number(lastUpsert.sequenceNum)
            : 0;

        if (roleSnapshot) {
            const currentRole = await fetchCurrentProfileRole(
                supabaseUrl,
                supabaseKey,
                group.userId,
                accessToken,
                warningSink,
            );
            if (currentRole && currentRole !== roleSnapshot) {
                warningSink?.push({
                    scope: 'sw',
                    code: 'role_mismatch_deferred',
                    userId: group.userId,
                    queuedRole: roleSnapshot,
                    currentRole,
                });
                throw new Error(`[SW] Deferred sync due to role mismatch (${roleSnapshot} -> ${currentRole})`);
            }
        }

        // 1. Fetch current server state
        const serverRow = await fetchServerRow(supabaseUrl, supabaseKey, table, group.userId, accessToken, warningSink);

        // 2. Merge (records conflict in IDB when needed)
        const mergedPayload = await mergeWithConflictDetection(
            group.type, lastPayload, serverRow, group.userId
        );

        // 3. Upsert merged result
        const body = {
            user_id: group.userId,
            ...mergedPayload,
            updated_at: new Date().toISOString(),
            _device_id: deviceId,
            _sequence: sequenceNum,
        };
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
