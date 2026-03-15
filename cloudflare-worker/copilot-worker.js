/**
 * Cloudflare Worker: GitHub Copilot Chat Gateway
 * 
 * This worker acts as an OpenAI-compatible bridge to GitHub Copilot.
 * It uses a GitHub token (gho_... or ghu_...) to obtain short-lived Copilot tokens
 * and proxies chat completion requests.
 */

const COPILOT_TOKEN_URL = 'https://api.github.com/copilot_internal/v2/token';
const COPILOT_CHAT_URL = 'https://api.githubcopilot.com/chat/completions';

const corsHeaders = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, x-requested-with, x-internal-key',
};


async function getCopilotToken(githubToken) {
    const response = await fetch(COPILOT_TOKEN_URL, {
        headers: {
            'Authorization': `token ${githubToken}`,
            'User-Agent': 'GitHubCopilotChat/0.1.0',
            'Accept': 'application/json',
        },
    });

    if (!response.ok) {
        const error = await response.text();
        throw new Error(`Failed to get Copilot token: ${response.status} ${error}`);
    }

    return await response.json();
}

export default {
    async fetch(request, env) {
        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, { status: 204, headers: corsHeaders });
        }

        const url = new URL(request.url);

        // Health check or info
        if (url.pathname === '/' || url.pathname === '/health') {
            return new Response(JSON.stringify({ status: 'ok', message: 'Copilot Gateway is running' }), {
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Only allow /v1/chat/completions
        if (request.method !== 'POST' || !url.pathname.endsWith('/chat/completions')) {
            return new Response(JSON.stringify({ error: 'Only POST /v1/chat/completions is supported' }), {
                status: 404,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        // Security Check
        const authHeader = request.headers.get('Authorization');
        const internalKey = request.headers.get('x-internal-key');
        const expectedKey = env.INTERNAL_OPS_KEY || env.OPS_INTERNAL_KEY;

        if (!expectedKey) {
            return new Response(JSON.stringify({ error: 'Worker configuration error: Missing internal key secret' }), {
                status: 500,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }

        const isAuthorized = (authHeader === `Bearer ${expectedKey}`) || (internalKey === expectedKey);

        if (!isAuthorized) {
            return new Response(JSON.stringify({ 
                error: 'Missing Bearer token or internal key',
                request_id: `mt-copilot-${Date.now()}`
            }), {
                status: 401,
                headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            });
        }


        try {
            const githubToken = env.GITHUB_TOKEN;
            if (!githubToken) {
                return new Response(JSON.stringify({ error: 'GITHUB_TOKEN secret is not configured in Worker' }), {
                    status: 500,
                    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                });
            }

            // 1. Get short-lived Copilot token
            const { token: copilotToken } = await getCopilotToken(githubToken);

            // 2. Forward request to Copilot
            const body = await request.json();
            
            // Map common models if necessary, or pass through
            // Copilot usually accepts 'gpt-4o', 'gpt-4', 'gpt-3.5-turbo'
            const model = body.model || 'gpt-4o';

            const copilotResponse = await fetch(COPILOT_CHAT_URL, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${copilotToken}`,
                    'Content-Type': 'application/json',
                    'User-Agent': 'GitHubCopilotChat/0.1.0',
                    'Editor-Version': 'vscode/1.92.0',
                    'Editor-Plugin-Version': 'copilot-chat/0.18.0',
                    'Openai-Organization': 'github-copilot',
                    'Openai-Intent': 'conversation-panel',
                },
                body: JSON.stringify({
                    messages: body.messages,
                    model: model,
                    temperature: body.temperature || 0.1,
                    top_p: body.top_p || 1,
                    n: body.n || 1,
                    stream: body.stream || false,
                    max_tokens: body.max_tokens || 4096,
                }),
            });

            // 3. Return response to client
            const data = await copilotResponse.text();
            
            return new Response(data, {
                status: copilotResponse.status,
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
