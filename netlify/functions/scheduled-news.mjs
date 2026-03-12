// netlify/functions/scheduled-news.mjs
// Scheduled RSS fetcher — runs automatically every day at 05:00 UTC (12:00 WIB)
// Also callable via HTTP GET for manual triggering / debugging
// Configured in netlify.toml: [[scheduled_functions]] name = "scheduled-news"
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const supabaseAnonKey = process.env.VITE_SUPABASE_ANON_KEY;
const supabase = createClient(supabaseUrl, supabaseAnonKey);

const RSS_SOURCES = [
    // Google News RSS - very reliable, proxied globally
    {
        name: 'Google News Health',
        url: 'https://news.google.com/rss/search?q=medical+health+medicine&hl=en-US&gl=US&ceid=US:en',
        category: 'Berita Medis',
        color: '#136dec',
    },
    {
        name: 'Google News Research',
        url: 'https://news.google.com/rss/search?q=medical+research+clinical+trial&hl=en-US&gl=US&ceid=US:en',
        category: 'Riset',
        color: '#7c3aed',
    },
    {
        name: 'Google News WHO',
        url: 'https://news.google.com/rss/search?q=WHO+world+health+organization&hl=en-US&gl=US&ceid=US:en',
        category: 'Kesehatan Global',
        color: '#2f855a',
    },
    {
        name: 'Google News Drug',
        url: 'https://news.google.com/rss/search?q=FDA+drug+approval+treatment&hl=en-US&gl=US&ceid=US:en',
        category: 'Farmasi',
        color: '#b45309',
    },
    {
        name: 'Google News Disease',
        url: 'https://news.google.com/rss/search?q=disease+outbreak+pandemic+epidemic&hl=en-US&gl=US&ceid=US:en',
        category: 'Penyakit',
        color: '#dc2626',
    },
    // The Lancet - confirmed working
    {
        name: 'The Lancet',
        url: 'https://www.thelancet.com/rssfeed/lancet_online.xml',
        category: 'Jurnal',
        color: '#c05621',
    },
    // WHO - try directly
    {
        name: 'WHO News',
        url: 'https://www.who.int/rss-feeds/news-english.xml',
        category: 'Kesehatan Global',
        color: '#2f855a',
    },
    // ScienceDaily - lightweight and open
    {
        name: 'ScienceDaily',
        url: 'https://www.sciencedaily.com/rss/health_medicine.xml',
        category: 'Sains & Medis',
        color: '#0ea5e9',
    },
    // medRxiv - open-access preprint server
    {
        name: 'medRxiv',
        url: 'https://connect.medrxiv.org/medrxiv_xml.php?subject=all',
        category: 'Preprint',
        color: '#059669',
    },
    // PubMed
    {
        name: 'PubMed',
        url: 'https://pubmed.ncbi.nlm.nih.gov/rss/pubmed/?term=medicine%5BMeSH%5D&limit=20',
        category: 'Riset',
        color: '#2b6cb0',
    },
    // Pemerintah & Institusi Resmi
    {
        name: 'CDC Newsroom',
        url: 'https://tools.cdc.gov/api/v2/resources/media/316398.rss',
        category: 'Kesehatan Publik',
        color: '#3b82f6',
    },
    {
        name: 'NIH News',
        url: 'https://www.nih.gov/news-events/news-releases/rss.xml',
        category: 'Riset',
        color: '#10b981',
    },
    {
        name: 'FDA Press Releases',
        url: 'https://www.fda.gov/about-fda/contact-fda/stay-informed/rss-feeds/press-releases/rss.xml',
        category: 'Farmasi',
        color: '#eab308',
    },
    {
        name: 'WebMD Health News',
        url: 'https://rssfeeds.webmd.com/rss/rss.aspx?RSSSource=RSS_PUBLIC',
        category: 'Berita Kesehatan',
        color: '#0ea5e9',
    },
];

async function fetchDirect(url) {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    try {
        const res = await fetch(url, {
            signal: controller.signal,
            headers: {
                'User-Agent': 'Mozilla/5.0 (compatible; MedxTerminalBot/1.0)',
                'Accept': 'application/rss+xml, application/xml, application/atom+xml, text/xml, */*',
                'Accept-Language': 'en-US,en;q=0.9',
                'Cache-Control': 'no-cache',
            },
            redirect: 'follow',
        });
        if (!res.ok) throw new Error(`HTTP ${res.status} ${res.statusText}`);
        return res.text();
    } finally {
        clearTimeout(timeout);
    }
}

function decodeHtml(str) {
    return str
        .replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>')
        .replace(/&quot;/g, '"').replace(/&#39;/g, "'").replace(/&apos;/g, "'")
        .replace(/&nbsp;/g, ' ').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n))
        .replace(/&#x([\da-f]+);/gi, (_, h) => String.fromCharCode(parseInt(h, 16)));
}

function parseRSS(xml, source) {
    const items = [];
    const itemRegex = /<item[^>]*>([\s\S]*?)<\/item>|<entry[^>]*>([\s\S]*?)<\/entry>/gi;
    let match;

    while ((match = itemRegex.exec(xml)) !== null) {
        const block = match[1] || match[2] || '';
        if (!block.trim()) continue;

        const getTag = (...tags) => {
            for (const tag of tags) {
                // Try with CDATA
                const r1 = new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
                const m1 = block.match(r1);
                if (m1 && m1[1].trim()) return m1[1].trim();
                // Try plain text
                const r2 = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`, 'i');
                const m2 = block.match(r2);
                if (m2 && m2[1].trim()) return m2[1].trim();
                // Try multiline
                const r3 = new RegExp(`<${tag}(?:\\s[^>]*)?>([\\s\\S]*?)<\\/${tag}>`, 'i');
                const m3 = block.match(r3);
                if (m3 && m3[1].trim()) return m3[1].trim();
            }
            return '';
        };

        const getLinkHref = () => {
            const r = /<link[^>]+href=["']([^"']+)["']/i;
            const m = block.match(r);
            return m ? m[1] : '';
        };

        const title = decodeHtml(getTag('title')).replace(/<[^>]*>/g, '').trim();
        if (!title || title.length < 5) continue;

        const rawLink = getTag('link') || getLinkHref() || getTag('guid') || getTag('id');
        // Google News links are redirect URLs — use them as-is
        const link = rawLink.trim() || '#';

        const rawDesc = getTag('description', 'summary', 'content');
        const description = decodeHtml(rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 280);

        const pubDate = getTag('pubDate', 'published', 'updated', 'dc:date');
        const parsedDate = pubDate ? new Date(pubDate) : null;
        const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();

        const raw = `${source.name}::${link || title}`;
        const id = Buffer.from(raw.slice(0, 120)).toString('base64url').slice(0, 32);

        items.push({
            id,
            title,
            link,
            description,
            pubDate: validDate.toISOString(),
            source: source.name,
            category: source.category,
            color: source.color,
        });
    }

    return items;
}

async function fetchSource(source) {
    try {
        const xml = await fetchDirect(source.url);
        const items = parseRSS(xml, source);
        console.log(`[scheduled-news] ✓ ${source.name}: ${items.length} items`);
        return { source: source.name, count: items.length, items };
    } catch (err) {
        console.warn(`[scheduled-news] ✗ ${source.name}: ${err.message}`);
        return { source: source.name, count: 0, items: [], error: err.message };
    }
}

async function runFetch(debugSource) {
    const sourcesToFetch = debugSource
        ? RSS_SOURCES.filter(s => s.name.toLowerCase().includes(debugSource.toLowerCase()))
        : RSS_SOURCES;

    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1. Hapus berita yang sudah lebih dari 7 hari (awaited — tidak fire-and-forget)
    const { error: deleteError } = await supabase
        .from('news_articles')
        .delete()
        .lt('pub_date', sevenDaysAgo.toISOString());
    if (deleteError) {
        console.error('[scheduled-news] Gagal menghapus berita lama:', deleteError.message);
    } else {
        console.log('[scheduled-news] Berita lama (>7 hari) berhasil dihapus.');
    }

    // 2. Fetch semua sumber RSS secara paralel
    const results = await Promise.allSettled(
        sourcesToFetch.map(src => fetchSource(src))
    );

    const allArticles = [];
    const seenIds = new Set();
    const seenTitles = new Set();
    const sourceReport = [];

    for (const result of results) {
        if (result.status === 'fulfilled') {
            const { source, count, items, error } = result.value;
            sourceReport.push({ source, fetched: count, error: error || null });
            for (const article of items) {
                const articleDate = new Date(article.pubDate);
                const titleKey = article.title.slice(0, 60).toLowerCase();
                if (
                    articleDate >= sevenDaysAgo &&
                    !seenIds.has(article.id) &&
                    !seenTitles.has(titleKey)
                ) {
                    seenIds.add(article.id);
                    seenTitles.add(titleKey);
                    allArticles.push(article);
                }
            }
        } else {
            sourceReport.push({ source: 'unknown', fetched: 0, error: result.reason?.message });
        }
    }

    // 3. Upsert semua artikel baru ke Supabase
    if (allArticles.length > 0) {
        const upsertData = allArticles.map(a => ({
            id: a.id,
            title: a.title,
            link: a.link,
            description: a.description,
            pub_date: a.pubDate,
            source: a.source,
            category: a.category,
            color: a.color,
        }));

        const { error: upsertError } = await supabase
            .from('news_articles')
            .upsert(upsertData, { onConflict: 'id' });
        if (upsertError) {
            console.error('[scheduled-news] Gagal menyimpan berita:', upsertError.message);
        } else {
            console.log(`[scheduled-news] ✅ ${allArticles.length} artikel di-upsert ke Supabase.`);
        }
    }

    return {
        fetchedAt: new Date().toISOString(),
        totalFetched: allArticles.length,
        sources: sourceReport,
    };
}

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
    };

    // Handle CORS preflight
    if (event?.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    // Support ?source=xxx for testing a single source
    const debugSource = event?.queryStringParameters?.source;

    try {
        const report = await runFetch(debugSource);

        console.log(`[scheduled-news] ✅ Selesai. Total: ${report.totalFetched} artikel baru/diperbarui.`);

        // Scheduled invocations don't need an HTTP response body, but return 200 for manual triggers
        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                ...report,
            }),
        };
    } catch (error) {
        console.error('[scheduled-news] Fatal error:', error.message);
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    }
};
