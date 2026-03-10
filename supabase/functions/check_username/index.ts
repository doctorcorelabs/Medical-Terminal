// supabase-functions/check_username/index.ts
// Example Supabase Edge Function (Deno) to check username availability.
// Deploy with Supabase CLI: supabase functions deploy check_username
// @ts-nocheck — this file runs in Deno (Supabase Edge Runtime), not Node.js/tsc

import { serve } from 'https://deno.land/std@0.177.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_ROLE_KEY = Deno.env.get('SERVICE_ROLE_KEY')!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

serve(async (req) => {
  try {
    const { username } = await req.json();
    if (!username || typeof username !== 'string') {
      return new Response(JSON.stringify({ error: 'username required' }), { status: 400 });
    }

    const clean = username.trim();
    if (!/^[A-Za-z0-9_]{3,20}$/.test(clean)) {
      return new Response(JSON.stringify({ available: false, reason: 'invalid_format' }), { status: 200 });
    }

    // Check profiles table first
    const { data, error } = await supabase
      .from('profiles')
      .select('id')
      .ilike('username', clean)
      .limit(1);

    if (error) {
      // If profiles table doesn't exist or query fails, fallback to checking auth.users email/metadata
      console.error('profiles check error', error.message);
    } else {
      if (data && data.length > 0) {
        return new Response(JSON.stringify({ available: false }), { status: 200 });
      }
      // no entry in profiles, username available
      return new Response(JSON.stringify({ available: true }), { status: 200 });
    }

    // Fallback: try checking auth.users metadata for username
    const { data: usersData, error: usersError } = await supabase
      .from('users')
      .select('id, raw_user_meta_data')
      .ilike('raw_user_meta_data->>username', clean)
      .limit(1);

    if (usersError) {
      console.error('users metadata check error', usersError.message);
      return new Response(JSON.stringify({ available: null, error: 'check_failed' }), { status: 200 });
    }

    if (usersData && usersData.length > 0) {
      return new Response(JSON.stringify({ available: false }), { status: 200 });
    }

    return new Response(JSON.stringify({ available: true }), { status: 200 });
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(msg);
    return new Response(JSON.stringify({ error: msg }), { status: 500 });
  }
});
