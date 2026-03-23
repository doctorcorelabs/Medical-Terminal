import { createClient } from '@supabase/supabase-js';
import { handleNewsFetch } from './news.js';
import { handleNotificationCycle, handleTestNotification } from './notifications.js';
import { handleAlertEvaluation } from './alerts.js';
import { handleCleanup } from './cleanup.js';
import { handleCreateBroadcast, handleResetHistory } from './admin.js';

async function checkAuth(request, env) {
    const supabase = createClient(env.SUPABASE_URL || '', env.SUPABASE_SERVICE_ROLE_KEY || '');
    
    // 1. Check Internal Key
    const internalKey = request.headers.get('x-internal-key');
    if (env.OPS_INTERNAL_KEY && internalKey === env.OPS_INTERNAL_KEY) return { ok: true, mode: 'internal-key' };
    
    // 2. Check Bearer Token (Supabase Auth)
    const authHeader = request.headers.get('Authorization');
    if (authHeader?.startsWith('Bearer ')) {
        const token = authHeader.substring(7);
        const { data, error } = await supabase.auth.getUser(token);
        if (!error && data?.user) return { ok: true, mode: 'user-bearer', user: data.user };
    }
    
    return { ok: false };
}

export default {
    async scheduled(event, env, ctx) {
        console.log(`[worker] Scheduled event triggered: ${event.cron}`);
        
        switch (event.cron) {
            case "* * * * *":
                ctx.waitUntil(handleNotificationCycle(env));
                break;
                
            case "*/5 * * * *":
                ctx.waitUntil(handleAlertEvaluation(env));
                break;
                
            case "0 5 * * *":
                ctx.waitUntil(handleNewsFetch(env));
                ctx.waitUntil(handleCleanup(env));
                break;
                
            default:
                console.warn(`[worker] Unknown cron trigger: ${event.cron}`);
        }
    },
    
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        
        // --- 1. Handle CORS Pre-flight ---
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                status: 204,
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
                    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-internal-key',
                    'Access-Control-Max-Age': '86400',
                }
            });
        }

        const corsHeaders = {
            'Access-Control-Allow-Origin': '*',
            'Content-Type': 'application/json'
        };

        // --- 2. Security Check ---
        const auth = await checkAuth(request, env);
        const protectedPaths = ['/run-news', '/run-notifications', '/run-alerts', '/run-cleanup', '/test-notification', '/create-broadcast', '/reset-broadcast-history'];
        
        if (protectedPaths.includes(url.pathname)) {
            if (!auth.ok) {
                return new Response(JSON.stringify({ ok: false, error: 'Unauthorized' }), { 
                    status: 401, 
                    headers: corsHeaders
                });
            }
        }

        // --- 3. Routing ---
        try {
            if (url.pathname === '/run-news') {
                ctx.waitUntil(handleNewsFetch(env));
                return new Response(JSON.stringify({ ok: true, message: 'News fetch triggered' }), { headers: corsHeaders });
            }
            
            if (url.pathname === '/run-notifications') {
                ctx.waitUntil(handleNotificationCycle(env));
                return new Response(JSON.stringify({ ok: true, message: 'Notification cycle triggered' }), { headers: corsHeaders });
            }

            if (url.pathname === '/run-alerts') {
                ctx.waitUntil(handleAlertEvaluation(env));
                return new Response(JSON.stringify({ ok: true, message: 'Alert evaluation triggered' }), { headers: corsHeaders });
            }

            if (url.pathname === '/run-cleanup') {
                ctx.waitUntil(handleCleanup(env));
                return new Response(JSON.stringify({ ok: true, message: 'Cleanup triggered' }), { headers: corsHeaders });
            }

            if (url.pathname === '/create-broadcast') {
                if (auth.mode !== 'user-bearer') return new Response(JSON.stringify({ ok: false, error: 'User context required' }), { status: 400, headers: corsHeaders });
                const result = await handleCreateBroadcast(request, env, auth.user.id);
                return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers: corsHeaders });
            }

            if (url.pathname === '/reset-broadcast-history') {
                if (auth.mode !== 'user-bearer') return new Response(JSON.stringify({ ok: false, error: 'User context required' }), { status: 400, headers: corsHeaders });
                const result = await handleResetHistory(request, env, auth.user.id);
                return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers: corsHeaders });
            }

            if (url.pathname === '/test-notification') {
                if (auth.mode !== 'user-bearer') return new Response(JSON.stringify({ ok: false, error: 'User context required' }), { status: 400, headers: corsHeaders });
                const result = await handleTestNotification(env, auth.user.id);
                return new Response(JSON.stringify(result), { status: result.ok ? 200 : 400, headers: corsHeaders });
            }
            
            return new Response('Medical Terminal Notification Worker', { status: 200, headers: { 'Content-Type': 'text/plain' } });
        } catch (err) {
            return new Response(JSON.stringify({ ok: false, error: err.message }), { status: 500, headers: corsHeaders });
        }
    }
};
