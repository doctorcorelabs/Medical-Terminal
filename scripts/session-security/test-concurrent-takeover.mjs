import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.SUPABASE_URL;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY.');
  process.exit(1);
}

const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function buildSession(testRunId, userId, suffix) {
  return {
    user_id: userId,
    device_id: `dev-${testRunId}-${suffix}`,
    session_id: `sess-${testRunId}-${suffix}`,
    user_agent: `test-agent-${suffix}`,
    is_active: true,
    session_started_at: new Date().toISOString(),
    last_activity_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

async function main() {
  const testRunId = `takeover-${Date.now()}`;
  const testEmail = `${testRunId}@example.test`;
  let createdUserId = null;

  try {
    const { data: createdUser, error: createUserError } = await client.auth.admin.createUser({
      email: testEmail,
      password: 'Tmp#Session1234',
      email_confirm: true,
      user_metadata: { source: 'session-security-concurrency-test' },
    });

    if (createUserError) throw createUserError;
    createdUserId = createdUser.user?.id;
    if (!createdUserId) throw new Error('Failed to create temporary test user');

    const sessions = [
      buildSession(testRunId, createdUserId, 'a'),
      buildSession(testRunId, createdUserId, 'b'),
      buildSession(testRunId, createdUserId, 'c'),
    ];

    const { error: insertSessionsError } = await client.from('user_login_sessions').insert(sessions);
    if (insertSessionsError) throw insertSessionsError;

    const takeoverTargets = [sessions[1].session_id, sessions[2].session_id];

    const takeoverResults = await Promise.all(
      takeoverTargets.map((targetSessionId) =>
        client.rpc('takeover_exclusive_session', {
          p_user_id: createdUserId,
          p_current_session_id: targetSessionId,
        })
      )
    );

    for (const result of takeoverResults) {
      if (result.error) throw result.error;
    }

    const normalizedResults = takeoverResults.map((result) =>
      Array.isArray(result.data) ? result.data[0] : result.data
    );

    const { data: finalSessions, error: finalSessionsError } = await client
      .from('user_login_sessions')
      .select('session_id, is_active, revoke_reason, updated_at')
      .eq('user_id', createdUserId)
      .order('updated_at', { ascending: false });

    if (finalSessionsError) throw finalSessionsError;

    const activeSessions = (finalSessions || []).filter((row) => row.is_active === true);

    const report = {
      testRunId,
      userId: createdUserId,
      takeoverResults: normalizedResults,
      activeCount: activeSessions.length,
      activeSessions,
      allSessions: finalSessions,
      passed: activeSessions.length === 1,
    };

    console.log(JSON.stringify(report, null, 2));

    if (!report.passed) {
      throw new Error(`Expected exactly 1 active session after concurrent takeover, got ${activeSessions.length}`);
    }
  } finally {
    if (createdUserId) {
      await client.from('user_login_sessions').delete().eq('user_id', createdUserId);
      await client.from('user_devices').delete().eq('user_id', createdUserId);
      await client.auth.admin.deleteUser(createdUserId);
    }
  }
}

main().catch((err) => {
  console.error('[test-concurrent-takeover] FAILED:', err?.message || err);
  process.exit(1);
});
