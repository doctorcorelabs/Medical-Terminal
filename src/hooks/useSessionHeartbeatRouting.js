function normalizePercent(value) {
  const numeric = Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.min(100, Math.max(0, numeric));
}

function hashStringToBucket(value) {
  const source = String(value || '');
  let hash = 0;
  for (let i = 0; i < source.length; i += 1) {
    hash = (hash * 31 + source.charCodeAt(i)) | 0;
  }
  return Math.abs(hash) % 100;
}

export function selectSessionWorkerUrlForUser({ userId, primaryUrl, canaryUrl, canaryPercent }) {
  const safePrimary = String(primaryUrl || '').trim();
  const safeCanary = String(canaryUrl || '').trim();
  const percent = normalizePercent(canaryPercent);

  if (!safePrimary) return '';
  if (!safeCanary || percent <= 0 || !userId) return safePrimary;

  const bucket = hashStringToBucket(userId);
  return bucket < percent ? safeCanary : safePrimary;
}

export function __testOnlyHashStringToBucket(value) {
  return hashStringToBucket(value);
}
