import { createClient } from '@supabase/supabase-js';
import { handler as enqueueAlertsHandler } from './enqueue-alert-notifications.mjs';
import { handler as enqueueSchedulesHandler } from './enqueue-schedule-reminders.mjs';
import { handler as sendTelegramHandler } from './send-telegram-notifications.mjs';
import { requireOperationalAccess } from './_operation-auth.mjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-key',
    },
    body: JSON.stringify(body),
  };
}

function parseBody(res) {
  try {
    return typeof res?.body === 'string' ? JSON.parse(res.body) : (res?.body || {});
  } catch {
    return {};
  }
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const supabase = (supabaseUrl && serviceRoleKey)
    ? createClient(supabaseUrl, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

  const access = await requireOperationalAccess(event, {
    allowInternal: true,
    allowSchedule: true,
    allowAdminBearer: false,
    allowUserBearer: true,
    supabase,
  });
  if (!access.ok) {
    return json(access.statusCode || 401, { ok: false, error: access.error || 'Unauthorized' });
  }

  try {
    const enqueueSchedulesRes = await enqueueSchedulesHandler({ httpMethod: 'GET', internalCall: true });
    const enqueueAlertsRes = await enqueueAlertsHandler({ httpMethod: 'GET', internalCall: true });
    const sendRes = await sendTelegramHandler({ httpMethod: 'GET', internalCall: true });

    const schedulesBody = parseBody(enqueueSchedulesRes);
    const alertsBody = parseBody(enqueueAlertsRes);
    const sendBody = parseBody(sendRes);

    const ok = (enqueueSchedulesRes.statusCode < 400)
      && (enqueueAlertsRes.statusCode < 400)
      && (sendRes.statusCode < 400)
      && schedulesBody.ok !== false
      && alertsBody.ok !== false
      && sendBody.ok !== false;

    return json(ok ? 200 : 500, {
      ok,
      summary: {
        schedules: schedulesBody,
        alerts: alertsBody,
        dispatch: sendBody,
      },
    });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to run notification cycle' });
  }
};
