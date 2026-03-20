import { createClient } from '@supabase/supabase-js';
import * as dotenv from 'dotenv';
dotenv.config();

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseKey = process.env.VITE_SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseUrl || !supabaseKey) {
    console.error('Missing Supabase credentials in .env');
    process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function run() {
    console.log('Updating subscription plans...');
    
    // First, try an upsert for all three
    const plans = [
        { name: 'Intern', code: 'intern', price: 0, duration_days: null, max_patients: 2, features: {can_export: false, ai_agent: 'regular', advanced_analytics: false} },
        { name: 'Specialist Monthly', code: 'specialist_monthly', price: 60000, duration_days: 30, max_patients: null, features: {can_export: true, ai_agent: 'advanced', advanced_analytics: true} },
        { name: 'Specialist Enthusiast', code: 'specialist_enthusiast', price: 150000, duration_days: 90, max_patients: null, features: {can_export: true, ai_agent: 'advanced', advanced_analytics: true} }
    ];

    for (const plan of plans) {
        const { error } = await supabase.from('subscription_plans').upsert(plan, { onConflict: 'code' });
        if (error) {
            console.error(`Error updating plan ${plan.code}:`, error.message);
        } else {
             console.log(`Successfully updated ${plan.code}`);
        }
    }
    
    // Set lifetime to inactive just in case
    const { error: errorLT } = await supabase.from('subscription_plans').update({ is_active: false }).eq('code', 'specialist_lifetime');
    if(errorLT) {
        console.error('Error disabling lifetime plan:', errorLT.message);
    } else {
        console.log('Successfully disabled specialist_lifetime');
    }

    console.log('Done updating plans.');
    process.exit(0);
}

run();
