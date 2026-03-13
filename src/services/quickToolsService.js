import { supabase } from './supabaseClient';

export const QUICK_TOOLS_STORAGE_PREFIX = 'mt.quickTools.v2';
export const QUICK_TOOLS_STORAGE_LEGACY_KEY = 'mt.quickTools.v1';
const QUICK_TOOLS_REMOTE_TABLE = 'user_quick_tools';
const QUICK_TOOLS_MAX = 3;

function nowIso() {
  return new Date().toISOString();
}

export function getQuickToolsStorageKey(userId) {
  return userId
    ? `${QUICK_TOOLS_STORAGE_PREFIX}:${userId}`
    : `${QUICK_TOOLS_STORAGE_PREFIX}:anonymous`;
}

function normalizeIds(rawIds, allowedIds, fallbackIds) {
  const allowed = new Set(Array.isArray(allowedIds) ? allowedIds : []);
  const fallback = Array.isArray(fallbackIds) ? fallbackIds : [];

  const source = Array.isArray(rawIds) ? rawIds : [];
  const cleaned = [];
  const seen = new Set();

  for (const id of source) {
    if (typeof id !== 'string') continue;
    if (!allowed.has(id)) continue;
    if (seen.has(id)) continue;
    seen.add(id);
    cleaned.push(id);
    if (cleaned.length >= QUICK_TOOLS_MAX) break;
  }

  if (cleaned.length > 0) return cleaned;

  const fallbackCleaned = [];
  const fallbackSeen = new Set();
  for (const id of fallback) {
    if (typeof id !== 'string') continue;
    if (!allowed.has(id)) continue;
    if (fallbackSeen.has(id)) continue;
    fallbackSeen.add(id);
    fallbackCleaned.push(id);
    if (fallbackCleaned.length >= QUICK_TOOLS_MAX) break;
  }
  return fallbackCleaned;
}

function sanitizeTimestamp(value) {
  if (typeof value !== 'string' || value.length === 0) return null;
  const ts = Date.parse(value);
  if (Number.isNaN(ts)) return null;
  return new Date(ts).toISOString();
}

function readRawLocalStorage(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function writeRawLocalStorage(key, payload) {
  localStorage.setItem(key, JSON.stringify(payload));
}

function emitQuickToolsUpdated(userId, ids) {
  window.dispatchEvent(new CustomEvent('quick-tools-updated', {
    detail: { userId: userId || null, ids },
  }));
}

function readLocalState(key, { allowedIds, fallbackIds }) {
  const raw = readRawLocalStorage(key);
  if (raw == null) return null;

  // Backward compatibility for old array-only format.
  if (Array.isArray(raw)) {
    const ids = normalizeIds(raw, allowedIds, fallbackIds);
    return {
      ids,
      dirty: false,
      updatedAt: null,
      lastSyncedAt: null,
      touched: true,
    };
  }

  if (typeof raw !== 'object') return null;

  const ids = normalizeIds(raw.ids, allowedIds, fallbackIds);
  return {
    ids,
    dirty: Boolean(raw.dirty),
    updatedAt: sanitizeTimestamp(raw.updatedAt),
    lastSyncedAt: sanitizeTimestamp(raw.lastSyncedAt),
    touched: Boolean(raw.touched),
  };
}

function writeLocalState(key, state) {
  const payload = {
    ids: Array.isArray(state.ids) ? state.ids.slice(0, QUICK_TOOLS_MAX) : [],
    dirty: Boolean(state.dirty),
    updatedAt: sanitizeTimestamp(state.updatedAt) || nowIso(),
    lastSyncedAt: sanitizeTimestamp(state.lastSyncedAt),
    touched: Boolean(state.touched),
  };
  writeRawLocalStorage(key, payload);
  return payload;
}

function toTs(value) {
  const ts = Date.parse(value || '');
  return Number.isNaN(ts) ? 0 : ts;
}

export function loadLocalQuickToolIds({ userId, allowedIds, fallbackIds }) {
  const key = getQuickToolsStorageKey(userId);
  const localState = readLocalState(key, { allowedIds, fallbackIds });

  if (localState != null) {
    return localState.ids;
  }

  // For logged-out/anonymous mode only, keep backward compatibility with legacy key.
  if (!userId) {
    const legacyParsed = readRawLocalStorage(QUICK_TOOLS_STORAGE_LEGACY_KEY);
    if (legacyParsed != null) {
      const legacyNormalized = normalizeIds(legacyParsed, allowedIds, fallbackIds);
      writeLocalState(key, {
        ids: legacyNormalized,
        dirty: false,
        updatedAt: null,
        lastSyncedAt: null,
        touched: true,
      });
      return legacyNormalized;
    }
  }

  return normalizeIds([], allowedIds, fallbackIds);
}

export function saveLocalQuickToolIds({
  userId,
  ids,
  allowedIds,
  fallbackIds,
  markDirty = false,
  touched = true,
  updatedAt,
  lastSyncedAt,
}) {
  const key = getQuickToolsStorageKey(userId);
  const previousState = readLocalState(key, { allowedIds, fallbackIds }) || {
    ids: normalizeIds([], allowedIds, fallbackIds),
    dirty: false,
    updatedAt: null,
    lastSyncedAt: null,
    touched: false,
  };
  const normalized = normalizeIds(ids, allowedIds, fallbackIds);

  const nextState = writeLocalState(key, {
    ids: normalized,
    dirty: markDirty,
    touched,
    updatedAt: updatedAt || nowIso(),
    lastSyncedAt: lastSyncedAt || previousState.lastSyncedAt,
  });

  emitQuickToolsUpdated(userId, normalized);
  return nextState;
}

export async function fetchRemoteQuickToolIds({ userId, allowedIds, fallbackIds }) {
  if (!userId) return null;

  const { data, error } = await supabase
    .from(QUICK_TOOLS_REMOTE_TABLE)
    .select('tool_ids, updated_at')
    .eq('user_id', userId)
    .maybeSingle();

  if (error) throw error;
  if (!data || !Array.isArray(data.tool_ids)) return null;

  return {
    ids: normalizeIds(data.tool_ids, allowedIds, fallbackIds),
    updatedAt: sanitizeTimestamp(data.updated_at) || nowIso(),
  };
}

export async function upsertRemoteQuickToolIds({ userId, ids, allowedIds, fallbackIds }) {
  if (!userId) return;

  const normalized = normalizeIds(ids, allowedIds, fallbackIds);
  const updatedAt = nowIso();
  const { error } = await supabase
    .from(QUICK_TOOLS_REMOTE_TABLE)
    .upsert({
      user_id: userId,
      tool_ids: normalized,
      updated_at: updatedAt,
    }, { onConflict: 'user_id' });

  if (error) throw error;
  return { ids: normalized, updatedAt };
}

export async function resolveQuickToolIds({ userId, allowedIds, fallbackIds, isOnline }) {
  const key = getQuickToolsStorageKey(userId);
  const localState = readLocalState(key, { allowedIds, fallbackIds }) || {
    ids: normalizeIds([], allowedIds, fallbackIds),
    dirty: false,
    updatedAt: null,
    lastSyncedAt: null,
    touched: false,
  };
  const localIds = localState.ids;

  if (!userId || !isOnline) return localIds;

  try {
    // If local has unsynced edits (usually from offline), push it first to avoid remote overwrite.
    if (localState.dirty) {
      const synced = await upsertRemoteQuickToolIds({ userId, ids: localIds, allowedIds, fallbackIds });
      saveLocalQuickToolIds({
        userId,
        ids: synced.ids,
        allowedIds,
        fallbackIds,
        markDirty: false,
        touched: true,
        updatedAt: synced.updatedAt,
        lastSyncedAt: synced.updatedAt,
      });
      return synced.ids;
    }

    const remoteState = await fetchRemoteQuickToolIds({ userId, allowedIds, fallbackIds });

    if (!remoteState) {
      // Backfill remote only when local was explicitly customized.
      if (localState.touched && localIds.length > 0) {
        const synced = await upsertRemoteQuickToolIds({ userId, ids: localIds, allowedIds, fallbackIds });
        saveLocalQuickToolIds({
          userId,
          ids: synced.ids,
          allowedIds,
          fallbackIds,
          markDirty: false,
          touched: true,
          updatedAt: synced.updatedAt,
          lastSyncedAt: synced.updatedAt,
        });
        return synced.ids;
      }
      return localIds;
    }

    const remoteTs = toTs(remoteState.updatedAt);
    const localTs = toTs(localState.updatedAt);

    // Prefer whichever is newer if both sides have timestamps; otherwise keep remote.
    const shouldUseLocal = localTs > 0 && localTs > remoteTs;
    if (shouldUseLocal && localIds.length > 0) {
      const synced = await upsertRemoteQuickToolIds({ userId, ids: localIds, allowedIds, fallbackIds });
      saveLocalQuickToolIds({
        userId,
        ids: synced.ids,
        allowedIds,
        fallbackIds,
        markDirty: false,
        touched: true,
        updatedAt: synced.updatedAt,
        lastSyncedAt: synced.updatedAt,
      });
      return synced.ids;
    }

    saveLocalQuickToolIds({
      userId,
      ids: remoteState.ids,
      allowedIds,
      fallbackIds,
      markDirty: false,
      touched: localState.touched,
      updatedAt: remoteState.updatedAt,
      lastSyncedAt: remoteState.updatedAt,
    });
    return remoteState.ids;
  } catch {
    return localIds;
  }
}

export async function persistQuickToolIds({ userId, ids, allowedIds, fallbackIds, isOnline }) {
  const localState = saveLocalQuickToolIds({
    userId,
    ids,
    allowedIds,
    fallbackIds,
    markDirty: true,
    touched: true,
    updatedAt: nowIso(),
  });
  const normalized = localState.ids;

  if (!userId || !isOnline) {
    return { ids: normalized, synced: false };
  }

  try {
    const synced = await upsertRemoteQuickToolIds({ userId, ids: normalized, allowedIds, fallbackIds });
    saveLocalQuickToolIds({
      userId,
      ids: synced.ids,
      allowedIds,
      fallbackIds,
      markDirty: false,
      touched: true,
      updatedAt: synced.updatedAt,
      lastSyncedAt: synced.updatedAt,
    });
    return { ids: normalized, synced: true };
  } catch {
    return { ids: normalized, synced: false };
  }
}
