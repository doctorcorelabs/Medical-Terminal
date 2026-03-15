import { createClient } from '@supabase/supabase-js';
import { requireOperationalAccess } from './_operation-auth.mjs';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;
const telegramBotToken = process.env.TELEGRAM_BOT_TOKEN || '';

const BATCH_SIZE = Math.max(1, Number(process.env.TELEGRAM_MAX_BATCH_SIZE || 100));
const MAX_ATTEMPTS = Math.max(1, Number(process.env.NOTIFICATION_MAX_ATTEMPTS || 3));
const REQUEST_TIMEOUT_MS = Math.max(1000, Number(process.env.TELEGRAM_SEND_TIMEOUT_MS || 7000));
const BASE_BACKOFF_MS = Math.max(500, Number(process.env.NOTIFICATION_BACKOFF_BASE_MS || 5000));
const STALE_LOCK_MINUTES = Math.max(1, Number(process.env.NOTIFICATION_STALE_LOCK_MINUTES || 2));

function json(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Headers': 'Content-Type, x-internal-key',
    },
    body: JSON.stringify(body),
  };
}

function isRetryableStatus(httpStatus) {
  return httpStatus === 429 || httpStatus >= 500;
}

function computeBackoffMs(attempt) {
  return BASE_BACKOFF_MS * Math.pow(2, Math.max(0, attempt - 1));
}

async function sendTelegramMessage(chatId, text, parseMode) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    const res = await fetch(`https://api.telegram.org/bot${telegramBotToken}/sendMessage`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: chatId,
        text,
        parse_mode: parseMode || 'HTML',
        disable_web_page_preview: true,
      }),
      signal: controller.signal,
    });

    let body = null;
    try {
      body = await res.json();
    } catch {
      body = null;
    }

    return {
      ok: res.ok && body?.ok,
      httpStatus: res.status,
      body,
      retryable: isRetryableStatus(res.status),
    };
  } catch (err) {
    return {
      ok: false,
      httpStatus: 0,
      body: { message: err.message || 'Network error' },
      retryable: true,
    };
  } finally {
    clearTimeout(timer);
  }
}

function isInQuietHours(nowUtc, quietStart, quietEnd, timeZone) {
  if (!quietStart || !quietEnd) return false;

  const localTimeText = nowUtc.toLocaleTimeString('en-GB', {
    timeZone,
    hour12: false,
    hour: '2-digit',
    minute: '2-digit',
  });

  const toMinutes = (value) => {
    const [h, m] = String(value).split(':').map(Number);
    if (!Number.isFinite(h) || !Number.isFinite(m)) return null;
    return h * 60 + m;
  };

  const nowMinutes = toMinutes(localTimeText);
  const startMinutes = toMinutes(quietStart);
  const endMinutes = toMinutes(quietEnd);

  if (nowMinutes === null || startMinutes === null || endMinutes === null) return false;
  if (startMinutes === endMinutes) return true;

  if (startMinutes < endMinutes) {
    return nowMinutes >= startMinutes && nowMinutes < endMinutes;
  }

  return nowMinutes >= startMinutes || nowMinutes < endMinutes;
}

async function writeLog(supabase, row, status, options = {}) {
  await supabase.from('notification_dispatch_logs').insert({
    queue_id: row.id,
    source_type: row.source_type,
    source_id: row.source_id,
    user_id: row.user_id,
    channel: row.channel,
    status,
    attempt_number: row.attempt_count + 1,
    provider_message_id: options.providerMessageId || null,
    provider_http_status: options.providerHttpStatus || null,
    error_message: options.errorMessage || null,
    payload: row.payload,
  });
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return json(200, { ok: true });

  const access = await requireOperationalAccess(event, {
    allowInternal: true,
    allowSchedule: true,
    allowAdminBearer: false,
  });
  if (!access.ok) {
    return json(access.statusCode || 401, { ok: false, error: access.error || 'Unauthorized' });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return json(500, { ok: false, error: 'Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY' });
  }
  if (!telegramBotToken) {
    return json(500, { ok: false, error: 'Missing TELEGRAM_BOT_TOKEN' });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const runId = `send-telegram-${Date.now()}`;
    const now = new Date();

    // Recover stale locks (crashed previous workers).
    const staleBeforeIso = new Date(now.getTime() - STALE_LOCK_MINUTES * 60 * 1000).toISOString();
    await supabase
      .from('notification_dispatch_queue')
      .update({ status: 'failed', last_error: 'Recovered stale processing lock', updated_at: now.toISOString() })
      .eq('status', 'processing')
      .lt('locked_at', staleBeforeIso);

    const { data: candidates, error: candidateError } = await supabase
      .from('notification_dispatch_queue')
      .select('id, source_type, source_id, user_id, channel, payload, status, attempt_count')
      .eq('status', 'pending')
      .lte('next_attempt_at', now.toISOString())
      .order('created_at', { ascending: true })
      .limit(BATCH_SIZE);

    if (candidateError) throw candidateError;

    if (!candidates || candidates.length === 0) {
      return json(200, { ok: true, claimed: 0, sent: 0, failed: 0, skippedQuiet: 0, skippedOptOut: 0, dead: 0 });
    }

    const claimed = [];
    for (const item of candidates) {
      const { data: lockedRow, error: lockError } = await supabase
        .from('notification_dispatch_queue')
        .update({
          status: 'processing',
          locked_at: now.toISOString(),
          lock_owner: runId,
          updated_at: now.toISOString(),
        })
        .eq('id', item.id)
        .eq('status', 'pending')
        .select('id, source_type, source_id, user_id, channel, payload, attempt_count')
        .maybeSingle();

      if (lockError) throw lockError;
      if (lockedRow) claimed.push(lockedRow);
    }

    if (claimed.length === 0) {
      return json(200, { ok: true, claimed: 0, sent: 0, failed: 0, skippedQuiet: 0, skippedOptOut: 0, dead: 0 });
    }

    const userIds = [...new Set(claimed.map((row) => row.user_id))];
    const { data: channels, error: channelsError } = await supabase
      .from('notification_channels')
      .select('user_id, telegram_chat_id, is_enabled, is_verified, schedule_enabled, alert_enabled, quiet_hours_start, quiet_hours_end, timezone')
      .eq('channel', 'telegram')
      .in('user_id', userIds);

    if (channelsError) throw channelsError;
    const channelMap = new Map((channels || []).map((row) => [row.user_id, row]));

    const summary = { claimed: claimed.length, sent: 0, failed: 0, skippedQuiet: 0, skippedOptOut: 0, dead: 0 };

    for (const row of claimed) {
      const channel = channelMap.get(row.user_id);
      const payload = row.payload || {};
      const sourceType = row.source_type;
      const forceSend = sourceType === 'alert' && payload.force_send === true;

      const hasChannelIssue = !channel
        || !channel.is_enabled
        || !channel.is_verified
        || !channel.telegram_chat_id
        || (sourceType === 'schedule' && !channel.schedule_enabled);

      const alertOptOut = sourceType === 'alert' && !channel?.alert_enabled && !forceSend;
      const isOptedOut = hasChannelIssue || alertOptOut;

      if (isOptedOut) {
        const reason = hasChannelIssue
          ? 'Channel disabled, not verified, or no telegram chat id'
          : 'Alert preference disabled by user';
        await writeLog(supabase, row, 'skipped_opt_out', { errorMessage: 'Channel disabled, not verified, or preference disabled' });
        await supabase
          .from('notification_dispatch_queue')
          .update({ status: 'skipped_opt_out', last_error: reason, updated_at: new Date().toISOString(), lock_owner: null, locked_at: null })
          .eq('id', row.id);
        summary.skippedOptOut += 1;
        continue;
      }

      const tz = channel.timezone || 'Asia/Jakarta';
      if (isInQuietHours(new Date(), channel.quiet_hours_start, channel.quiet_hours_end, tz)) {
        await writeLog(supabase, row, 'skipped_quiet_hours', { errorMessage: `Quiet hours in timezone ${tz}` });
        await supabase
          .from('notification_dispatch_queue')
          .update({ status: 'skipped_quiet_hours', updated_at: new Date().toISOString(), lock_owner: null, locked_at: null })
          .eq('id', row.id);
        summary.skippedQuiet += 1;
        continue;
      }

      const text = String(payload.text || '').trim();
      if (!text) {
        await writeLog(supabase, row, 'failed', { errorMessage: 'Missing payload.text' });
        await supabase
          .from('notification_dispatch_queue')
          .update({
            status: 'failed',
            last_error: 'Missing payload.text',
            attempt_count: row.attempt_count + 1,
            next_attempt_at: new Date(Date.now() + computeBackoffMs(row.attempt_count + 1)).toISOString(),
            updated_at: new Date().toISOString(),
            lock_owner: null,
            locked_at: null,
          })
          .eq('id', row.id);
        summary.failed += 1;
        continue;
      }

      const sendResult = await sendTelegramMessage(channel.telegram_chat_id, text, payload.parse_mode || 'HTML');
      const nextAttemptCount = row.attempt_count + 1;

      if (sendResult.ok) {
        const providerId = sendResult.body?.result?.message_id ? String(sendResult.body.result.message_id) : null;
        await writeLog(supabase, row, 'sent', {
          providerMessageId: providerId,
          providerHttpStatus: sendResult.httpStatus,
        });
        await supabase
          .from('notification_dispatch_queue')
          .update({
            status: 'sent',
            provider_message_id: providerId,
            last_error: null,
            attempt_count: nextAttemptCount,
            updated_at: new Date().toISOString(),
            lock_owner: null,
            locked_at: null,
          })
          .eq('id', row.id);
        summary.sent += 1;
      } else {
        const errMsg = sendResult.body?.description || sendResult.body?.message || `HTTP ${sendResult.httpStatus}`;
        const shouldRetry = sendResult.retryable && nextAttemptCount < MAX_ATTEMPTS;

        await writeLog(supabase, row, shouldRetry ? 'failed' : 'dead', {
          providerHttpStatus: sendResult.httpStatus,
          errorMessage: errMsg,
        });

        await supabase
          .from('notification_dispatch_queue')
          .update({
            status: shouldRetry ? 'failed' : 'dead',
            attempt_count: nextAttemptCount,
            next_attempt_at: shouldRetry ? new Date(Date.now() + computeBackoffMs(nextAttemptCount)).toISOString() : null,
            last_error: errMsg,
            updated_at: new Date().toISOString(),
            lock_owner: null,
            locked_at: null,
          })
          .eq('id', row.id);

        if (shouldRetry) summary.failed += 1;
        else summary.dead += 1;
      }
    }

    return json(200, { ok: true, ...summary });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to send Telegram notifications' });
  }
};
