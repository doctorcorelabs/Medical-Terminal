// cloudflare/session-worker/src/index.js

export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // 1. CORS Preflight
    if (request.method === "OPTIONS") {
      return new Response(null, {
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (url.pathname !== "/heartbeat" || request.method !== "POST") {
      return new Response("Not Found", { status: 404 });
    }

    try {
      const authHeader = request.headers.get("Authorization");
      if (!authHeader) return new Response("Unauthorized", { status: 401 });

      const body = await request.json();
      const { session_id, user_id } = body;

      if (!session_id || !user_id) {
        return new Response("Missing parameters", { status: 400 });
      }

      // 2. Update Supabase
      // Kita menggunakan direct POST ke REST API Supabase (PostgREST) untuk kecepatan maksimal.
      const supabaseUrl = env.SUPABASE_URL;
      const supabaseKey = env.SUPABASE_ANON_KEY; 

      const response = await fetch(`${supabaseUrl}/rest/v1/user_login_sessions?id=eq.${session_id}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          "apikey": supabaseKey,
          "Authorization": authHeader, // Teruskan JWT User untuk RLS
          "Prefer": "return=representation"
        },
        body: JSON.stringify({ 
          last_activity_at: new Date().toISOString(),
          updated_at: new Date().toISOString()
        })
      });

      if (!response.ok) {
        const error = await response.text();
        return new Response(`Sync Error: ${error}`, { status: response.status });
      }

      const data = await response.json();
      const session = data[0];

      // 3. Cek apakah sesi ini masih aktif (tidak di-kick)
      if (!session || !session.is_active) {
        return new Response(JSON.stringify({ status: "kicked", reason: session?.revoke_reason }), {
          status: 200,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" }
        });
      }

      // 4. Cek Konflik Eksklusif (Cari sesi lain yang lebih baru/panas)
      // Query sesi aktif lain milik user yang sama
      const conflictCheck = await fetch(
        `${supabaseUrl}/rest/v1/user_login_sessions?user_id=eq.${user_id}&is_active=eq.true&id=neq.${session_id}&last_activity_at=gt.${new Date(Date.now() - 7 * 60 * 1000).toISOString()}&select=id`,
        {
          headers: { "apikey": supabaseKey, "Authorization": authHeader }
        }
      );

      const otherActive = await conflictCheck.json();
      const is_locked = otherActive.length > 0;

      return new Response(JSON.stringify({ 
        status: "ok", 
        is_locked,
        is_exclusive: session.is_exclusive // Jika kita nanti butuh flag ini
      }), {
        status: 200,
        headers: { 
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*" 
        }
      });

    } catch (err) {
      return new Response(err.message, { status: 500 });
    }
  },
};
