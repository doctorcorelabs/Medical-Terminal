// cloudflare/session-worker/src/index.js

export default {
  async fetch(request, env, ctx) {
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Max-Age": "86400",
    };

    // 1. Handle Preflight OPTIONS
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    const url = new URL(request.url);

    // Helper to return JSON with CORS
    const jsonResponse = (data, status = 200) => {
      return new Response(JSON.stringify(data), {
        status,
        headers: {
          ...corsHeaders,
          "Content-Type": "application/json",
        },
      });
    };

    if (url.pathname !== "/heartbeat" || request.method !== "POST") {
      return new Response("Not Found", { status: 404, headers: corsHeaders });
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) {
        return jsonResponse({ error: "Unauthorized" }, 401);
      }

      const body = await request.json();
      const { session_id, user_id, device_id } = body;

      if (!session_id || !user_id) {
        return jsonResponse({ 
          error: "Missing parameters", 
          received: { session_id: !!session_id, user_id: !!user_id } 
        }, 400);
      }

      // 2. Update Supabase
      const supabaseUrl = env.SUPABASE_URL;
      const supabaseKey = env.SUPABASE_ANON_KEY; 

      // PENTING: Gunakan session_id=eq., bukan id=eq. karena session_id adalah TEXT (UUID custom)
      const response = await fetch(`${supabaseUrl}/rest/v1/user_login_sessions?session_id=eq.${session_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": authHeader,
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ 
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return jsonResponse({ error: "Supabase sync failed", detail: error }, response.status);
      }

      const data = await response.json();
      const session = data[0];

      // 3. Cek apakah sesi ini masih aktif (tidak di-kick)
      if (!session || !session.is_active) {
        return jsonResponse({ 
          status: "kicked", 
          reason: session?.revoke_reason 
        }, 200);
      }

      // 4. Cek Konflik Eksklusif
      let conflictQuery = `user_id=eq.${user_id}&is_active=eq.true&session_id=neq.${session_id}&last_activity_at=gt.${new Date(Date.now() - 7 * 60 * 1000).toISOString()}&select=id`;
      
      if (device_id) {
        conflictQuery += `&device_id=neq.${device_id}`;
      }

      const conflictCheck = await fetch(
        `${supabaseUrl}/rest/v1/user_login_sessions?${conflictQuery}`,
        {
          headers: { "apikey": supabaseKey, "Authorization": authHeader }
        }
      );

      if (!conflictCheck.ok) {
        return jsonResponse({ error: "Conflict check failed" }, conflictCheck.status);
      }

      const otherActive = await conflictCheck.json();
      const is_locked = otherActive.length > 0;

      return jsonResponse({ 
        status: "ok", 
        is_locked,
        session_state: "active"
      }, 200);

    } catch (err) {
      return jsonResponse({ error: "Internal Server Error", message: err.message }, 500);
    }
  },
};
