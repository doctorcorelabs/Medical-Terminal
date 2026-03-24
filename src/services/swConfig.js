/**
 * swConfig.js — Stores Supabase runtime config into IndexedDB
 * so the service worker (which cannot import env vars) can read it.
 *
 * This runs from the page context only, called once on app boot.
 * Uses the canonical openDB from idbQueue.js to avoid schema version skew.
 */

import { openDB } from './idbQueue.js';
import { getDeviceFingerprint, getBrowserName } from '../utils/deviceDetection.js';

const DEVICE_ID_KEY = 'medterminal_device_id';
const SESSION_ID_KEY = 'medterminal_session_id';

export function getOrCreateDeviceId() {
    try {
        let deviceId = localStorage.getItem(DEVICE_ID_KEY);
        const fingerprint = getDeviceFingerprint();

        if (!deviceId || !deviceId.startsWith('hw-')) {
            deviceId = fingerprint;
            localStorage.setItem(DEVICE_ID_KEY, deviceId);
        }
        
        return deviceId;
    } catch {
        return `fallback-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
    }
}

export function getOrCreateSessionId() {
    try {
        let sessionId = localStorage.getItem(SESSION_ID_KEY);
        const deviceId = getOrCreateDeviceId();
        const browser = getBrowserName().replace(/\s+/g, '');
        
        // Session ID is device-specific AND browser-specific
        const expectedPrefix = `${deviceId}-${browser}`;

        if (!sessionId || !sessionId.startsWith(expectedPrefix)) {
            sessionId = `${expectedPrefix}-${crypto.randomUUID().slice(0, 8)}`;
            localStorage.setItem(SESSION_ID_KEY, sessionId);
        }
        
        return sessionId;
    } catch {
        return `sess-fallback-${Date.now()}`;
    }
}

/**
 * Store Supabase URL + anon key into IDB so the service worker can read them.
 * Call this once after the app boots (e.g., in main.jsx or OfflineContext).
 */
export async function storeSwConfig(sessionOrToken = null) {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_ANON_KEY;
    if (!supabaseUrl || !supabaseKey) return;
    const deviceId = getOrCreateDeviceId();
    const accessToken = typeof sessionOrToken === 'string'
        ? sessionOrToken
        : (sessionOrToken?.access_token || null);
    const accessTokenExpiresAt = Number(sessionOrToken?.expires_at || 0) || null;

    try {
        const db = await openDB();
        await new Promise((resolve, reject) => {
            const tx = db.transaction('swConfig', 'readwrite');
            tx.objectStore('swConfig').put({ 
                key: 'config', 
                data: {
                    supabaseUrl,
                    supabaseKey,
                    accessToken,
                    accessTokenExpiresAt,
                    deviceId,
                }
            });
            tx.oncomplete = resolve;
            tx.onerror = () => reject(tx.error);
        });
    } catch (err) {
        console.warn('[swConfig] Failed to store SW config:', err);
    }
}

/**
 * Trigger the service worker to start a sync immediately.
 * Useful when the page detects it came back online.
 */
export async function triggerSwSync() {
    if (!('serviceWorker' in navigator)) return;
    try {
        const reg = await navigator.serviceWorker.ready;
        // Try Background Sync first (Chrome/Edge/Android)
        if ('sync' in reg) {
            await reg.sync.register('sync-medterminal');
            return;
        }
        // Fallback: send message to active SW
        if (reg.active) {
            reg.active.postMessage({ type: 'TRIGGER_SYNC' });
        }
    } catch (err) {
        console.warn('[swConfig] triggerSwSync failed:', err);
    }
}

/**
 * Register a listener for SYNC_COMPLETE messages from the SW.
 * Returns an unsubscribe function.
 */
export function onSwSyncComplete(callback) {
    if (!('serviceWorker' in navigator)) return () => {};
    const handler = (event) => {
        if (event.data?.type === 'SYNC_COMPLETE') {
            callback(event.data);
        }
    };
    navigator.serviceWorker.addEventListener('message', handler);
    return () => navigator.serviceWorker.removeEventListener('message', handler);
}
