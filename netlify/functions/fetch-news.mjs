// netlify/functions/fetch-news.mjs
// Read-only DB query — returns cached articles from Supabase.
// RSS fetching is handled by the scheduled function: scheduled-news.mjs (runs daily at 05:00 UTC / 12:00 WIB)
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY || '';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

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

    try {
        // Ambil semua artikel dari Supabase dengan timeout protection
        const newsPromise = supabase
            .from('news_articles')
            .select('*')
            .order('pub_date', { ascending: false })
            .limit(200);
        
        // Add 15-second timeout to prevent hanging
        const timeoutPromise = new Promise((_, reject) => 
            setTimeout(() => reject(new Error('News fetch timeout after 15s')), 15000)
        );
        
        const { data: dbArticles, error: dbError } = await Promise.race([
            newsPromise,
            timeoutPromise,
        ]);

        if (dbError) {
            console.error('[fetch-news] Error membaca dari Supabase:', dbError.message);
            return {
                statusCode: 500,
                headers,
                body: JSON.stringify({ success: false, error: dbError.message }),
            };
        }

        const articles = (dbArticles || []).map(row => ({
            id: row.id,
            title: row.title,
            link: row.link,
            description: row.description,
            pubDate: row.pub_date,
            source: row.source,
            category: row.category,
            color: row.color,
        }));

        const sourceStats = {};
        articles.forEach(a => {
            sourceStats[a.source] = (sourceStats[a.source] || 0) + 1;
        });

        // updatedAt = pub_date artikel terbaru (mencerminkan kapan scheduled fetch terakhir berjalan)
        const updatedAt = articles.length > 0 ? articles[0].pubDate : new Date().toISOString();

        console.log(`[fetch-news] ✅ Mengembalikan ${articles.length} berita dari DB.`);

        return {
            statusCode: 200,
            headers,
            body: JSON.stringify({
                success: true,
                count: articles.length,
                sources: sourceStats,
                updatedAt,
                articles,
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
