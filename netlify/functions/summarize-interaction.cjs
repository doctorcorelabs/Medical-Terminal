// netlify/functions/summarize-interaction.cjs
// Summarises a drug-interaction description into Indonesian using OpenRouter AI.
// Requires OPENROUTER_API_KEY set as a Netlify environment variable.

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

const handler = async (event) => {
    if (event.httpMethod !== 'POST') {
        return { statusCode: 405, body: JSON.stringify({ error: 'Method Not Allowed' }) };
    }

    const apiKey = process.env.OPENROUTER_API_KEY;
    if (!apiKey) {
        return { statusCode: 500, body: JSON.stringify({ error: 'API key tidak tersedia di server.' }) };
    }

    let body;
    try {
        body = JSON.parse(event.body || '{}');
    } catch {
        return { statusCode: 400, body: JSON.stringify({ error: 'Invalid JSON payload.' }) };
    }

    const { text, pair } = body;
    if (!text || typeof text !== 'string' || text.trim().length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: 'Teks interaksi tidak boleh kosong.' }) };
    }

    const pairLabel =
        Array.isArray(pair) && pair.length === 2
            ? `${pair[0]} dan ${pair[1]}`
            : 'obat-obatan tersebut';

    const messages = [
        {
            role: 'system',
            content: `Anda adalah asisten farmakologi klinis. Buat ringkasan singkat dan padat DALAM BAHASA INDONESIA dari teks interaksi obat yang diberikan. Fokuskan pada tiga hal:
1. Mekanisme interaksi
2. Efek klinis yang mungkin terjadi
3. Rekomendasi penanganan atau pemantauan

Format dengan poin-poin singkat. Maksimal 150 kata. Jangan gunakan format LaTeX atau simbol matematika.`,
        },
        {
            role: 'user',
            content: `Ringkas informasi interaksi antara ${pairLabel} berikut ini:\n\n${text.trim()}`,
        },
    ];

    try {
        const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': `Bearer ${apiKey}`,
                'HTTP-Referer': 'https://medterminal.app',
                'X-Title': 'MedxTerminal Interaction Checker',
            },
            body: JSON.stringify({
                model: 'google/gemini-2.5-flash-lite-preview-09-2025',
                messages,
                max_tokens: 400,
                temperature: 0.3,
            }),
        });

        const data = await res.json();
        if (!res.ok) {
            return {
                statusCode: 502,
                body: JSON.stringify({ error: (data.error && data.error.message) || 'OpenRouter error.' }),
            };
        }

        const summary =
            data.choices && data.choices[0] && data.choices[0].message && data.choices[0].message.content
                ? data.choices[0].message.content
                : 'Tidak ada ringkasan tersedia.';

        return {
            statusCode: 200,
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ summary }),
        };
    } catch (err) {
        console.error('summarize-interaction error:', err);
        return {
            statusCode: 500,
            body: JSON.stringify({ error: err.message || 'Terjadi kesalahan tidak terduga.' }),
        };
    }
};

module.exports = { handler };
