import { createClient } from '@supabase/supabase-js';

const RSS_SOURCES = [
    { name: 'The Lancet', url: 'https://news.google.com/rss/search?q=site:thelancet.com&hl=en-US&gl=US&ceid=US:en', category: 'Jurnal', color: '#c05621' },
    { name: 'NEJM', url: 'https://news.google.com/rss/search?q=site:nejm.org&hl=en-US&gl=US&ceid=US:en', category: 'Jurnal', color: '#136dec' },
    { name: 'JAMA', url: 'https://news.google.com/rss/search?q=site:jamanetwork.com&hl=en-US&gl=US&ceid=US:en', category: 'Jurnal', color: '#dc2626' },
    { name: 'Nature Medicine', url: 'https://news.google.com/rss/search?q=site:nature.com/nm&hl=en-US&gl=US&ceid=US:en', category: 'Jurnal', color: '#7c3aed' },
    { name: 'BMJ', url: 'https://news.google.com/rss/search?q=site:bmj.com&hl=en-US&gl=US&ceid=US:en', category: 'Jurnal', color: '#2b6cb0' },
    { name: 'Mayo Clinic', url: 'https://news.google.com/rss/search?q=site:mayoclinic.org&hl=en-US&gl=US&ceid=US:en', category: 'Berita Medis', color: '#1e40af' },
    { name: 'Healthline', url: 'https://news.google.com/rss/search?q=site:healthline.com&hl=en-US&gl=US&ceid=US:en', category: 'Berita Kesehatan', color: '#0ea5e9' },
    { name: 'Medscape', url: 'https://news.google.com/rss/search?q=site:medscape.com&hl=en-US&gl=US&ceid=US:en', category: 'Berita Medis', color: '#7c3aed' },
    { name: 'WHO News', url: 'https://news.google.com/rss/search?q=WHO+site:who.int&hl=en-US&gl=US&ceid=US:en', category: 'Kesehatan Global', color: '#2f855a' },
    { name: 'CDC News', url: 'https://news.google.com/rss/search?q=CDC+site:cdc.gov&hl=en-US&gl=US&ceid=US:en', category: 'Kesehatan Publik', color: '#0891b2' },
    { name: 'FDA Press', url: 'https://news.google.com/rss/search?q=FDA+site:fda.gov&hl=en-US&gl=US&ceid=US:en', category: 'Farmasi', color: '#b45309' },
    { name: 'ScienceDaily', url: 'https://news.google.com/rss/search?q=site:sciencedaily.com+medical&hl=en-US&gl=US&ceid=US:en', category: 'Sains & Medis', color: '#0ea5e9' },
    { name: 'EurekAlert', url: 'https://news.google.com/rss/search?q=site:eurekalert.org+medicine&hl=en-US&gl=US&ceid=US:en', category: 'Penemuan Baru', color: '#10b981' },
    { name: 'medRxiv', url: 'https://news.google.com/rss/search?q=site:medrxiv.org&hl=en-US&gl=US&ceid=US:en', category: 'Preprint', color: '#059669' },
];

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
                const r1 = new RegExp(`<${tag}(?:\\s[^>]*)?>\\s*<!\\[CDATA\\[([\\s\\S]*?)\\]\\]>\\s*<\\/${tag}>`, 'i');
                const m1 = block.match(r1);
                if (m1 && m1[1].trim()) return m1[1].trim();
                const r2 = new RegExp(`<${tag}(?:\\s[^>]*)?>([^<]*)<\\/${tag}>`, 'i');
                const m2 = block.match(r2);
                if (m2 && m2[1].trim()) return m2[1].trim();
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
        const link = rawLink.trim() || '#';

        const rawDesc = getTag('description', 'summary', 'content');
        const description = decodeHtml(rawDesc.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim()).slice(0, 280);

        const pubDate = getTag('pubDate', 'published', 'updated', 'dc:date');
        const parsedDate = pubDate ? new Date(pubDate) : null;
        const validDate = parsedDate && !isNaN(parsedDate.getTime()) ? parsedDate : new Date();

        const raw = `${source.name}::${link || title}`;
        const id = btoa(raw.slice(0, 120)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '').slice(0, 32);

        items.push({
            id,
            title,
            link,
            description,
            pub_date: validDate.toISOString(),
            source: source.name,
            category: source.category,
            color: source.color,
        });
    }
    return items;
}

export async function handleNewsFetch(env) {
    console.log('[news] Starting news fetch...');
    const supabase = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY);
    const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);

    // 1. Cleanup old news
    await supabase.from('news_articles').delete().lt('pub_date', sevenDaysAgo.toISOString());

    const allArticles = [];
    const seenIds = new Set();
    const seenTitles = new Set();

    for (const source of RSS_SOURCES) {
        try {
            const res = await fetch(source.url, {
                headers: { 'User-Agent': 'Mozilla/5.0 MedicalTerminalBot/1.0' }
            });
            if (!res.ok) continue;
            const xml = await res.text();
            const items = parseRSS(xml, source);
            
            for (const article of items) {
                const titleKey = article.title.slice(0, 60).toLowerCase();
                if (new Date(article.pub_date) < sevenDaysAgo) continue;
                if (seenIds.has(article.id) || seenTitles.has(titleKey)) continue;
                
                seenIds.add(article.id);
                seenTitles.add(titleKey);
                allArticles.push(article);
            }
            console.log(`[news] ✓ ${source.name}: ${items.length} items parsed`);
        } catch (err) {
            console.error(`[news] ✗ ${source.name}: ${err.message}`);
        }
    }

    if (allArticles.length > 0) {
        const { error } = await supabase.from('news_articles').upsert(allArticles, { onConflict: 'id' });
        if (error) console.error('[news] Upsert error:', error.message);
        else console.log(`[news] ✅ ${allArticles.length} articles upserted.`);
    }
}
