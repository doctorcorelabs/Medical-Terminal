import { createClient } from '@supabase/supabase-js';

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
        const { data, error } = await supabase.from('system_health_metrics').select('metric_value').eq('metric_name', 'error_rate').gte('measured_at', windowStart).limit(2000);
        if (error) throw error;
        const values = (data || []).map(r => Number(r.metric_value)).filter(v => Number.isFinite(v));
        currentValue = avg(values);
        sampleSize = values.length;
    } else if (rule.condition_type === 'latency_p95_ms') {
        const { data, error } = await supabase.from('system_health_metrics').select('metric_value').eq('metric_name', 'latency_ms').gte('measured_at', windowStart).limit(2000);
        if (error) throw error;
        const values = (data || []).map(r => Number(r.metric_value)).filter(v => Number.isFinite(v));
        currentValue = percentile(values, 95);
        sampleSize = values.length;
    } else if (rule.condition_type === 'sync_fail_count') {
        const { count, error } = await supabase.from('user_activity_events').select('id', { count: 'exact', head: true }).eq('event_type', 'sync_failed').gte('occurred_at', windowStart);
        if (error) throw error;
        currentValue = count || 0;
        sampleSize = count || 0;
    } else if (rule.condition_type === 'usage_event_count') {
        const { count, error } = await supabase.from('user_activity_events').select('id', { count: 'exact', head: true }).gte('occurred_at', windowStart);
        if (error) throw error;
        currentValue = count || 0;
        sampleSize = count || 0;
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

    const { data: activeAlerts } = await supabase.from('alert_events').select('id, status').eq('rule_key', rule.rule_key).in('status', ['open', 'ack', 'snoozed']).order('created_at', { ascending: false }).limit(1);
    const existing = activeAlerts?.[0] || null;
    let action = 'none';

    if (breached && !existing && !isInCooldown && nextConsecutiveBreach >= breachConfirmations) {
        await supabase.from('alert_events').insert({
            level: rule.level,
            title: rule.title,
            message: `${rule.title}: nilai ${currentValue.toFixed(2)} melewati ambang ${Number(rule.threshold).toFixed(2)}`,
            status: 'open',
            source: 'evaluate-alerts-cf',
            rule_key: rule.rule_key,
            payload: { current_value: currentValue, threshold: Number(rule.threshold), evaluated_at: now.toISOString() }
        });
        action = 'opened';
    } else if (!breached && existing && nextConsecutiveNormal >= resolveConfirmations) {
        await supabase.from('alert_events').update({ status: 'resolved', handled_at: now.toISOString() }).eq('id', existing.id);
        action = 'resolved';
    }

    await saveRuleState(supabase, rule.rule_key, {
        last_status: action === 'opened' ? 'open' : breached ? 'breached' : 'normal',
        consecutive_breach: nextConsecutiveBreach,
        consecutive_normal: nextConsecutiveNormal,
        last_value: currentValue,
        last_evaluated_at: now.toISOString(),
        cooldown_until: action === 'opened' ? new Date(now.getTime() + (cooldownMinutes * 60 * 1000)).toISOString() : ruleState.cooldown_until
    });

    return { ruleKey: rule.rule_key, action };
}

export async function handleAlertEvaluation(env) {
    console.log('[alerts] Evaluation started...');
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    try {
        const { data: rules } = await supabase.from('alert_rules').select('*').eq('active', true);
        for (const rule of rules || []) {
            await evaluateRule(supabase, rule);
        }
    } catch (err) {
        console.error('[alerts] fatal error:', err.message);
    }
}
