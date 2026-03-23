import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.VITE_SUPABASE_URL || '',
  process.env.SUPABASE_SERVICE_ROLE_KEY || '',
);

/**
 * Test Telegram notification endpoint
 * POST /.netlify/functions/send-telegram-test
 * 
 * Purpose: Send a test Telegram notification to verify Telegram integration works
 * Authentication: Bearer token required
 * Returns: { ok: boolean, message?: string, error?: string }
 */
export default async (req, context) => {
  // CORS headers
  if (req.method === 'OPTIONS') {
    return new Response('OK', {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
      },
    });
  }

  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'Method not allowed' }), {
      status: 405,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  try {
    // Extract auth token
    const authHeader = req.headers.get('Authorization') || '';
    const token = authHeader.replace('Bearer ', '');

    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Verify JWT token
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: 'Invalid token' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    // Get user profile with Telegram ID
    const { data: profile, error: profileError } = await supabase
      .from('profiles')
      .select('telegram_id')
      .eq('id', user.id)
      .maybeSingle();

    if (profileError) {
      return new Response(
        JSON.stringify({ error: 'Failed to fetch user profile', details: profileError.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const telegramId = profile?.telegram_id;
    if (!telegramId) {
      return new Response(
        JSON.stringify({ 
          ok: false, 
          error: 'Telegram ID not configured. Please link your Telegram account in settings.' 
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Get Telegram bot token
    const botToken = process.env.TELEGRAM_BOT_TOKEN;
    if (!botToken) {
      return new Response(
        JSON.stringify({ error: 'Telegram bot not configured' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Send test message via Telegram API
    const telegramApiUrl = `https://api.telegram.org/bot${botToken}/sendMessage`;
    const testMessage = `✅ Test Notification from Medical Terminal\n\nIf you see this message, your Telegram integration is working correctly!\n\nTimestamp: ${new Date().toISOString()}`;

    const telegramResponse = await fetch(telegramApiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        chat_id: telegramId,
        text: testMessage,
        parse_mode: 'HTML',
      }),
    });

    const telegramData = await telegramResponse.json();

    if (!telegramResponse.ok || !telegramData.ok) {
      return new Response(
        JSON.stringify({
          ok: false,
          error: `Telegram API error: ${telegramData.description || 'Unknown error'}`,
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      );
    }

    // Log successful test notification
    await supabase
      .from('notification_dispatch_logs')
      .insert({
        user_id: user.id,
        channel: 'telegram',
        recipient: telegramId,
        message_type: 'test',
        status: 'sent',
        external_id: telegramData.result.message_id?.toString() || null,
        metadata: {
          test: true,
          requestedAt: new Date().toISOString(),
        },
      })
      .throwOnError();

    return new Response(
      JSON.stringify({
        ok: true,
        message: 'Test notification sent successfully to Telegram',
        messageId: telegramData.result.message_id,
      }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    console.error('send-telegram-test error:', err);

    return new Response(
      JSON.stringify({
        ok: false,
        error: err instanceof Error ? err.message : 'Internal server error',
      }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
};
