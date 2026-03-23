import { createClient } from '@supabase/supabase-js';

export async function handleCleanup(env) {
    console.log('[cleanup] Starting activity event cleanup...');
    const supabase = createClient(env.SUPABASE_URL || '', env.SUPABASE_SERVICE_ROLE_KEY || '');
    const cutoff = new Date(Date.now() - (14 * 24 * 60 * 60 * 1000));
    
    try {
        const { data, error } = await supabase
            .from('user_activity_events')
            .delete()
            .lt('occurred_at', cutoff.toISOString())
            .select('id');
            
        if (error) throw error;
        console.log(`[cleanup] Deleted ${data?.length || 0} rows from user_activity_events`);
    } catch (err) {
        console.error('[cleanup] fatal error:', err.message);
    }
}
