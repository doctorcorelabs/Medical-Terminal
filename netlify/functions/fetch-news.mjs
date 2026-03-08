// netlify/functions/fetch-news.mjs
// Server-side RSS fetcher (Node.js — no CORS restriction)
// Uses proven-accessible RSS feeds with multiple fallback strategies
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
        console.log(`[fetch-news] ✓ ${source.name}: ${items.length} items`);
        return items;
    } catch (err) {
        console.warn(`[fetch-news] ✗ ${source.name}: ${err.message}`);
        return [];
    }
}

export const handler = async (event) => {
    const headers = {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Content-Type': 'application/json',
        'Cache-Control': 'no-cache, no-store, must-revalidate',
    };

    if (event?.httpMethod === 'OPTIONS') {
        return { statusCode: 200, headers, body: '' };
    }

    const debugSource = event?.queryStringParameters?.source;
    const sourcesToFetch = debugSource
        ? RSS_SOURCES.filter(s => s.name.toLowerCase().includes(debugSource.toLowerCase()))
        : RSS_SOURCES;

    try {
        const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

        // 1. Hapus berita yang sudah lebih dari 7 hari di background
        supabase.from('news_articles').delete().lt('pub_date', sevenDaysAgo.toISOString()).then(({ error }) => {
            if (error) console.error('[fetch-news] Gagal menghapus berita lama:', error);
        });

        // 2. Ambil RSS feeds baru
        const results = await Promise.allSettled(
            sourcesToFetch.map(src => fetchSource(src))
        );

        const allArticles = [];
        const seenIds = new Set();
        const seenTitles = new Set();

        for (const result of results) {
            if (result.status === 'fulfilled') {
                for (const article of result.value) {
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
            }
        }

        // 3. Simpan RSS baru ke Supabase jika ada
        if (allArticles.length > 0) {
            const upsertData = allArticles.map(a => ({
                id: a.id,
                title: a.title,
                link: a.link,
                description: a.description,
                pub_date: a.pubDate,
                source: a.source,
                category: a.category,
                color: a.color
            }));

            const { error: upsertError } = await supabase.from('news_articles').upsert(upsertData, { onConflict: 'id' });
            if (upsertError) console.error('[fetch-news] Gagal menyimpan berita:', upsertError);
        }

        // 4. Ambil 30 berita terbaru dari Supabase
        const { data: dbArticles, error: dbError } = await supabase
            .from('news_articles')
            .select('*')
            .order('pub_date', { ascending: false })
            .limit(30);

        let finalArticles = [];
        if (dbError) {
            console.warn('[fetch-news] Tabel belum ada/Error DB, menggunakan data fetch langsung:', dbError.message);
            allArticles.sort((a, b) => new Date(b.pubDate) - new Date(a.pubDate));
            finalArticles = allArticles.slice(0, 30);
        } else {
            finalArticles = (dbArticles || []).map(row => ({
                id: row.id,
                title: row.title,
                link: row.link,
                description: row.description,
                pubDate: row.pub_date,
                source: row.source,
                category: row.category,
                color: row.color,
            }));
        }

        const sourceStats = {};
        finalArticles.forEach(row => {
            sourceStats[row.source] = (sourceStats[row.source] || 0) + 1;
        });

        console.log(`[fetch-news] ✅ Total: ${finalArticles.length} berita. (${allArticles.length} di-fetch)`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                count: finalArticles.length,
                sources: sourceStats,
                updatedAt: new Date().toISOString(),
                articles: finalArticles,
            }),
        };
    } catch (error) {
        return {
            statusCode: 500,
            headers,
            body: JSON.stringify({ success: false, error: error.message }),
        };
    }
};
