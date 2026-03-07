// Cloudflare Worker - Medical Terminal AI Gateway
// Deploy this to Cloudflare Workers to proxy AI requests to OpenRouter

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';


const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        if (request.method !== 'POST') {
            return new Response(JSON.stringify({ error: 'Method not allowed' }), {
                status: 405,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        try {
            const body = await request.json();

            // Forward to OpenRouter
            const response = await fetch(OPENROUTER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${env.OPENROUTER_API_KEY}`,
                    'HTTP-Referer': 'https://medterminal.app',
                    'X-Title': 'MedTerminal Clinical AI',
                },
                body: JSON.stringify({
                    model: body.model || 'google/gemini-2.5-flash-lite-preview-09-2025',
                    messages: body.messages,
                    max_tokens: body.max_tokens || 2048,
                    temperature: body.temperature || 0.3,
                }),
            });

            const data = await response.json();

            return new Response(JSON.stringify(data), {
                status: response.status,
                headers: {
                    ...corsHeaders,
                    'Content-Type': 'application/json',
                },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: error.message }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }
    },
};
