import { createClient } from '@supabase/supabase-js';

const url = 'https://hvhsoscduqektunuryky.supabase.co';
const key = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6Imh2aHNvc2NkdXFla3R1bnVyeWt5Iiwicm9sZSI6InNlcnZpY2Vfcm9sZSIsImlhdCI6MTc3Mjg1MjUxMSwiZXhwIjoyMDg4NDI4NTExfQ.6cCCgY8viXH1TV3OosUhzHv54eYgOKk8l3qBM0ZdQ50';

const supabase = createClient(url, key);

async function run() {
    console.log('--- Checking user_subscriptions ---');
    const { data: subs, error: err1 } = await supabase
        .from('user_subscriptions')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(3);
        
    if (err1) {
        console.error('Error fetching subs:', err1.message);
        return;
    }
    console.log(JSON.stringify(subs, null, 2));

    if (subs && subs.length > 0) {
        console.log('\n--- Checking profile for latest transaction owner ---');
        const { data: prof } = await supabase.from('profiles').select('id, username, role, subscription_expires_at').eq('id', subs[0].user_id).single();
        console.log(prof);
    }
}
run();
