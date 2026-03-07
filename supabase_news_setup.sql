-- Panduan Setup Tabel Berita RSS (news_articles)

-- 1. Jalankan script ini secara terpisah di menu "SQL Editor" pada dashboard Supabase Anda.
-- Tabel ini digunakan untuk menyimpan caching berita RSS yang didapat dari background function sehingga tidak memuat ulang dari internet setiap kali halaman direfresh.

CREATE TABLE public.news_articles (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    link TEXT NOT NULL,
    description TEXT,
    pub_date TIMESTAMP WITH TIME ZONE NOT NULL,
    source TEXT NOT NULL,
    category TEXT NOT NULL,
    color TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now())
);

-- Buka akses read untuk publik jika diperlukan (karena dipanggil oleh backend Node.js Netlify dengan Anon Key)
ALTER TABLE public.news_articles ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Public can view news articles" ON public.news_articles FOR SELECT USING (true);
CREATE POLICY "Public can insert news articles" ON public.news_articles FOR INSERT WITH CHECK (true);
CREATE POLICY "Public can update news articles" ON public.news_articles FOR UPDATE USING (true) WITH CHECK (true);
CREATE POLICY "Public can delete news articles" ON public.news_articles FOR DELETE USING (true);
