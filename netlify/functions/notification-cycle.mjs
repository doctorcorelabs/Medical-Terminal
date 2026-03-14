import { handler as enqueueAlertsHandler } from './enqueue-alert-notifications.mjs';
import { handler as enqueueSchedulesHandler } from './enqueue-schedule-reminders.mjs';
import { handler as sendTelegramHandler } from './send-telegram-notifications.mjs';

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type',
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

  try {
    const enqueueSchedulesRes = await enqueueSchedulesHandler({ httpMethod: 'GET' });
    const enqueueAlertsRes = await enqueueAlertsHandler({ httpMethod: 'GET' });
    const sendRes = await sendTelegramHandler({ httpMethod: 'GET' });

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
