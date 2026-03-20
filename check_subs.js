import { createClient } from '@supabase/supabase-js';

// No 'dotenv' import needed. We will run this with:
// node --env-file=.env check_subs.js

const supabaseUrl = process.env.VITE_SUPABASE_URL || 'https://hvhsoscduqektunuryky.supabase.co';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!supabaseKey) {
  console.error('❌ Error: SUPABASE_SERVICE_ROLE_KEY info not found in process.env');
  console.log('💡 Note: Please run this script with: node --env-file=.env check_subs.js');
  process.exit(1);
}

const supabase = createClient(supabaseUrl, supabaseKey);

async function checkLatestTransactions() {
  console.log('--- Checking user_subscriptions (Database Version) ---');
  try {
    const { data: subs, error: subError } = await supabase
      .from('user_subscriptions')
      .select('*, subscription_plans(name)')
      .order('created_at', { ascending: false })
      .limit(5);

    if (subError) {
      console.error('❌ Database error:', subError.message);
      return;
    }

    if (!subs || subs.length === 0) {
      console.log('ℹ️ No transactions found in user_subscriptions table.');
    } else {
      console.table(subs.map(s => ({
        ID: s.id.slice(0, 8),
        Status: s.status,
        Amount: s.amount_paid,
        Plan: s.subscription_plans?.name || 'Unknown',
        OrderID: s.gateway_order_id,
        Created: new Date(s.created_at).toLocaleString('id-ID')
      })));
    }

    // Check one user's profile to verify role
    if (subs && subs.length > 0) {
      const latestUserId = subs[0].user_id;
      const { data: profile, error: profError } = await supabase
          .from('profiles')
          .select('username, role, subscription_expires_at')
          .eq('id', latestUserId)
          .single();
      
      if (!profError) {
        console.log('\n--- Current Profile Status for Latest User ---');
        console.log(`Username: ${profile.username}`);
        console.log(`Role    : ${profile.role}`);
        console.log(`Expires : ${profile.subscription_expires_at || 'Lifetime/None'}`);
      }
    }
  } catch (err) {
    console.error('❌ Unexpected error:', err.message);
  }
}

checkLatestTransactions();
