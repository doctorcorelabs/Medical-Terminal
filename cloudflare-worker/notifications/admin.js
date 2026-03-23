import { createClient } from '@supabase/supabase-js';
import { handleNotificationCycle } from './notifications.js';

async function isAdmin(supabase, userId) {
    const { data: profile } = await supabase.from('profiles').select('role').eq('user_id', userId).maybeSingle();
    return profile?.role === 'admin';
}

export async function handleCreateBroadcast(request, env, userId) {
    const supabase = createClient(env.SUPABASE_URL || '', env.SUPABASE_SERVICE_ROLE_KEY || '');
    if (!await isAdmin(supabase, userId)) return { ok: false, error: 'Access denied' };

    const body = await request.json();
    const { title, message, level, channels, critical_override } = body;
    const correlationId = crypto.randomUUID();
    const nowIso = new Date().toISOString();

    try {
        let announcementId = null;
        if (channels.in_app) {
            const { data: ann } = await supabase.from('admin_announcements').insert({
                title, message, level, target: 'all', active: true, created_by: userId, updated_at: nowIso, 
                source_type: 'admin_alert_broadcast', correlation_id: correlationId,
                end_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
            }).select('id').single();
            announcementId = ann?.id;
        }

        let alertEventId = null;
        if (channels.telegram) {
            const { data: alert } = await supabase.from('alert_events').insert({
                level, title, message, status: 'open', source: 'admin-broadcast', rule_key: 'admin_broadcast',
                payload: { is_admin_broadcast: true, audience_scope: 'all', channels, correlation_id: correlationId, critical_override, created_by: userId, in_app_announcement_id: announcementId },
                created_by: userId, is_admin_broadcast: true, audience_scope: 'all', correlation_id: correlationId, updated_at: nowIso
            }).select('id').single();
            alertEventId = alert?.id;
        }

        if (alertEventId) {
            // Trigger cycle to enqueue and send immediately
            await handleNotificationCycle(env);
        }

        return { ok: true, correlationId, announcementId, alertEventId };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}

export async function handleResetHistory(request, env, userId) {
    const supabase = createClient(env.SUPABASE_URL || '', env.SUPABASE_SERVICE_ROLE_KEY || '');
    if (!await isAdmin(supabase, userId)) return { ok: false, error: 'Access denied' };

    try {
        const { data: alerts } = await supabase.from('alert_events').select('id, payload').eq('source', 'admin-broadcast').limit(1000);
        const alertIds = (alerts || []).map(r => String(r.id));
        const correlationIds = (alerts || []).map(r => r.payload?.correlation_id).filter(Boolean);
        const announcementIds = (alerts || []).map(r => r.payload?.in_app_announcement_id).filter(Boolean);

        if (alertIds.length > 0) {
            await supabase.from('notification_dispatch_logs').delete().eq('source_type', 'alert').in('source_id', alertIds);
            await supabase.from('notification_dispatch_queue').delete().eq('source_type', 'alert').in('source_id', alertIds);
            await supabase.from('alert_events').delete().in('id', alertIds);
        }
        if (announcementIds.length > 0) await supabase.from('admin_announcements').delete().in('id', announcementIds);
        if (correlationIds.length > 0) await supabase.from('admin_announcements').delete().in('correlation_id', correlationIds);

        return { ok: true, deletedCount: alertIds.length };
    } catch (err) {
        return { ok: false, error: err.message };
    }
}
