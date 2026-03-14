import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SERVICE_ROLE_KEY || process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

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

function avg(values) {
  if (!values.length) return 0;
  return values.reduce((a, b) => a + b, 0) / values.length;
}

function percentile(values, p) {
  if (!values.length) return 0;
  const sorted = [...values].sort((a, b) => a - b);
  const idx = Math.ceil((p / 100) * sorted.length) - 1;
  return sorted[Math.max(0, idx)];
}

async function getOrCreateRuleState(supabase, ruleKey) {
  const { data, error } = await supabase
    .from('alert_rule_states')
    .select('rule_key, last_status, consecutive_breach, consecutive_normal, last_value, last_evaluated_at, cooldown_until')
    .eq('rule_key', ruleKey)
    .maybeSingle();

  if (error) throw error;

  if (data) return data;

  const { data: inserted, error: insertError } = await supabase
    .from('alert_rule_states')
    .insert({ rule_key: ruleKey })
    .select('rule_key, last_status, consecutive_breach, consecutive_normal, last_value, last_evaluated_at, cooldown_until')
    .single();

  if (insertError) throw insertError;
  return inserted;
}

async function saveRuleState(supabase, ruleKey, patch) {
  const { error } = await supabase
    .from('alert_rule_states')
    .update(patch)
    .eq('rule_key', ruleKey);
  if (error) throw error;
}

async function evaluateRule(supabase, rule) {
  const now = new Date();
  const windowStart = new Date(now.getTime() - (rule.window_minutes * 60 * 1000)).toISOString();

  let currentValue = 0;
  let sampleSize = 0;

  if (rule.condition_type === 'error_rate_pct') {
    const { data, error } = await supabase
      .from('system_health_metrics')
      .select('metric_value')
      .eq('metric_name', 'error_rate')
      .gte('measured_at', windowStart)
      .limit(5000);
    if (error) throw error;
    const values = (data || []).map((r) => Number(r.metric_value)).filter((v) => Number.isFinite(v));
    currentValue = avg(values);
    sampleSize = values.length;
  } else if (rule.condition_type === 'latency_p95_ms') {
    const { data, error } = await supabase
      .from('system_health_metrics')
      .select('metric_value')
      .eq('metric_name', 'latency_ms')
      .gte('measured_at', windowStart)
      .limit(5000);
    if (error) throw error;
    const values = (data || []).map((r) => Number(r.metric_value)).filter((v) => Number.isFinite(v));
    currentValue = percentile(values, 95);
    sampleSize = values.length;
  } else if (rule.condition_type === 'sync_fail_count') {
    const { count, error } = await supabase
      .from('user_activity_events')
      .select('id', { count: 'exact', head: true })
      .eq('event_type', 'sync_failed')
      .gte('occurred_at', windowStart);
    if (error) throw error;
    currentValue = count || 0;
    sampleSize = count || 0;
  } else if (rule.condition_type === 'usage_event_count') {
    const { count, error } = await supabase
      .from('user_activity_events')
      .select('id', { count: 'exact', head: true })
      .gte('occurred_at', windowStart);
    if (error) throw error;
    currentValue = count || 0;
    sampleSize = count || 0;
  } else {
    return {
      ruleKey: rule.rule_key,
      skipped: true,
      reason: `Unknown condition_type: ${rule.condition_type}`,
    };
  }

  const breached = currentValue >= Number(rule.threshold);
  const breachConfirmations = Math.max(1, Number(rule.breach_confirmations || 2));
  const resolveConfirmations = Math.max(1, Number(rule.resolve_confirmations || 2));
  const cooldownMinutes = Math.max(0, Number(rule.cooldown_minutes || 10));
  const dedupWindowMinutes = Math.max(0, Number(rule.dedup_window_minutes || 30));

  const ruleState = await getOrCreateRuleState(supabase, rule.rule_key);
  const cooldownUntil = ruleState.cooldown_until ? new Date(ruleState.cooldown_until) : null;
  const isInCooldown = cooldownUntil && cooldownUntil > now;

  const nextConsecutiveBreach = breached ? Number(ruleState.consecutive_breach || 0) + 1 : 0;
  const nextConsecutiveNormal = breached ? 0 : Number(ruleState.consecutive_normal || 0) + 1;

  const { data: activeAlerts, error: activeError } = await supabase
    .from('alert_events')
    .select('id, status')
    .eq('rule_key', rule.rule_key)
    .in('status', ['open', 'ack', 'snoozed'])
    .order('created_at', { ascending: false })
    .limit(1);

  if (activeError) throw activeError;

  const existing = activeAlerts?.[0] || null;
  let action = 'none';

  // Dedup: do not reopen alert if a recent resolved alert exists in dedup window
  let hasRecentResolved = false;
  if (!existing && breached && dedupWindowMinutes > 0) {
    const dedupSince = new Date(now.getTime() - (dedupWindowMinutes * 60 * 1000)).toISOString();
    const { data: resolvedRows, error: resolvedError } = await supabase
      .from('alert_events')
      .select('id')
      .eq('rule_key', rule.rule_key)
      .eq('status', 'resolved')
      .gte('updated_at', dedupSince)
      .limit(1);
    if (resolvedError) throw resolvedError;
    hasRecentResolved = (resolvedRows || []).length > 0;
  }

  if (breached && !existing && !isInCooldown && !hasRecentResolved && nextConsecutiveBreach >= breachConfirmations) {
    const { error: insertError } = await supabase.from('alert_events').insert({
      level: rule.level,
      title: rule.title,
      message: `${rule.title}: nilai ${currentValue.toFixed(2)} melewati ambang ${Number(rule.threshold).toFixed(2)} pada window ${rule.window_minutes} menit.`,
      status: 'open',
      source: 'evaluate-alerts',
      rule_key: rule.rule_key,
      payload: {
        condition_type: rule.condition_type,
        threshold: Number(rule.threshold),
        current_value: currentValue,
        window_minutes: rule.window_minutes,
        sample_size: sampleSize,
        evaluated_at: now.toISOString(),
      },
      created_at: now.toISOString(),
      updated_at: now.toISOString(),
    });
    if (insertError) throw insertError;
    action = 'opened';
  }

  if (!breached && existing && nextConsecutiveNormal >= resolveConfirmations) {
    const { error: resolveError } = await supabase
      .from('alert_events')
      .update({
        status: 'resolved',
        handled_at: now.toISOString(),
        updated_at: now.toISOString(),
      })
      .eq('id', existing.id);
    if (resolveError) throw resolveError;
    action = 'resolved';
  }

  await saveRuleState(supabase, rule.rule_key, {
    last_status: action === 'opened' ? 'open' : breached ? 'breached' : isInCooldown ? 'cooldown' : 'normal',
    consecutive_breach: nextConsecutiveBreach,
    consecutive_normal: nextConsecutiveNormal,
    last_value: currentValue,
    last_evaluated_at: now.toISOString(),
    cooldown_until: action === 'opened'
      ? new Date(now.getTime() + (cooldownMinutes * 60 * 1000)).toISOString()
      : ruleState.cooldown_until,
  });

  return {
    ruleKey: rule.rule_key,
    conditionType: rule.condition_type,
    threshold: Number(rule.threshold),
    currentValue,
    sampleSize,
    breached,
    consecutiveBreach: nextConsecutiveBreach,
    consecutiveNormal: nextConsecutiveNormal,
    isInCooldown,
    hasRecentResolved,
    action,
  };
}

export const handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') {
    return json(200, { ok: true });
  }

  if (!supabaseUrl || !serviceRoleKey) {
    const missing = [];
    if (!supabaseUrl) missing.push('VITE_SUPABASE_URL or SUPABASE_URL');
    if (!serviceRoleKey) missing.push('SUPABASE_SERVICE_ROLE_KEY or SERVICE_ROLE_KEY');
    return json(500, {
      ok: false,
      error: `Missing Supabase env: ${missing.join(', ')}`,
    });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  try {
    const { data: rules, error: rulesError } = await supabase
      .from('alert_rules')
      .select('id, rule_key, title, level, condition_type, threshold, window_minutes, breach_confirmations, resolve_confirmations, cooldown_minutes, dedup_window_minutes, active')
      .eq('active', true)
      .order('created_at', { ascending: true });

    if (rulesError) throw rulesError;

    const results = [];
    for (const rule of rules || []) {
      // Sequential to reduce concurrent DB pressure for scheduled function
      // eslint-disable-next-line no-await-in-loop
      const result = await evaluateRule(supabase, rule);
      results.push(result);
    }

    const summary = {
      totalRules: results.length,
      opened: results.filter((r) => r.action === 'opened').length,
      resolved: results.filter((r) => r.action === 'resolved').length,
      breached: results.filter((r) => r.breached).length,
    };

    return json(200, { ok: true, summary, results });
  } catch (err) {
    return json(500, { ok: false, error: err.message || 'Failed to evaluate alerts' });
  }
};
