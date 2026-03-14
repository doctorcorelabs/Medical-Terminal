const internalOpsKey = process.env.OPS_INTERNAL_KEY || process.env.INTERNAL_FUNCTIONS_KEY || '';

export function getHeader(event, key) {
  const headers = event?.headers || {};
  const direct = headers[key];
  if (direct != null) return direct;
  const lower = headers[key.toLowerCase()];
  if (lower != null) return lower;
  const upper = headers[key.toUpperCase()];
  if (upper != null) return upper;
  return null;
}

export function getBearerToken(event) {
  const raw = String(getHeader(event, 'authorization') || '').trim();
  const match = raw.match(/^Bearer\s+(.+)$/i);
  return match ? match[1].trim() : null;
}

export function isInternalInvocation(event) {
  return event?.internalCall === true;
}

export function isScheduledInvocation(event) {
  const marker = String(
    getHeader(event, 'x-nf-event')
    || getHeader(event, 'x-netlify-event')
    || '',
  ).toLowerCase();
  return marker === 'schedule';
}

export function hasValidInternalKey(event) {
  if (!internalOpsKey) return false;
  const incoming = String(getHeader(event, 'x-internal-key') || '').trim();
  return incoming.length > 0 && incoming === internalOpsKey;
}

async function isAdminBearer(event, supabase) {
  if (!supabase) return false;
  const token = getBearerToken(event);
  if (!token) return false;

  const { data: userData, error: userErr } = await supabase.auth.getUser(token);
  if (userErr || !userData?.user?.id) return false;

  const { data: profile, error: profileErr } = await supabase
    .from('profiles')
    .select('role')
    .eq('user_id', userData.user.id)
    .maybeSingle();

  if (profileErr) return false;
  return profile?.role === 'admin';
}

export async function requireOperationalAccess(event, options = {}) {
  const {
    allowInternal = true,
    allowSchedule = true,
    allowAdminBearer = false,
    supabase = null,
  } = options;

  if (allowInternal && isInternalInvocation(event)) {
    return { ok: true, mode: 'internal-call' };
  }

  if (allowSchedule && isScheduledInvocation(event)) {
    return { ok: true, mode: 'scheduled' };
  }

  if (hasValidInternalKey(event)) {
    return { ok: true, mode: 'internal-key' };
  }

  if (allowAdminBearer && await isAdminBearer(event, supabase)) {
    return { ok: true, mode: 'admin-bearer' };
  }

  return {
    ok: false,
    statusCode: 401,
    error: 'Unauthorized operational invocation',
  };
}
