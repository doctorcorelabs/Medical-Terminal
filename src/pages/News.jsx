import { useState, useEffect, useCallback } from 'react';

const CATEGORY_COLORS = {
    'Jurnal': { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', dot: 'bg-blue-500' },
    'Riset': { bg: 'bg-violet-100 dark:bg-violet-900/30', text: 'text-violet-700 dark:text-violet-300', dot: 'bg-violet-500' },
    'Kesehatan Global': { bg: 'bg-emerald-100 dark:bg-emerald-900/30', text: 'text-emerald-700 dark:text-emerald-300', dot: 'bg-emerald-500' },
    'Berita Medis': { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', dot: 'bg-red-500' },
    'Berita Kesehatan': { bg: 'bg-amber-100 dark:bg-amber-900/30', text: 'text-amber-700 dark:text-amber-300', dot: 'bg-amber-500' },
    'Sains & Medis': { bg: 'bg-sky-100 dark:bg-sky-900/30', text: 'text-sky-700 dark:text-sky-300', dot: 'bg-sky-500' },
    'Kesehatan Publik': { bg: 'bg-cyan-100 dark:bg-cyan-900/30', text: 'text-cyan-700 dark:text-cyan-300', dot: 'bg-cyan-500' },
    'Penemuan Baru': { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', dot: 'bg-purple-500' },
    'Preprint': { bg: 'bg-teal-100 dark:bg-teal-900/30', text: 'text-teal-700 dark:text-teal-300', dot: 'bg-teal-500' },
    'Farmasi': { bg: 'bg-orange-100 dark:bg-orange-900/30', text: 'text-orange-700 dark:text-orange-300', dot: 'bg-orange-500' },
    'Penyakit': { bg: 'bg-rose-100 dark:bg-rose-900/30', text: 'text-rose-700 dark:text-rose-300', dot: 'bg-rose-500' },
};

function getRelativeTime(dateStr) {
    const now = new Date();
    const date = new Date(dateStr);
    const diffMs = now - date;
    const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
    const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

    if (diffHours < 1) return 'Baru saja';
    if (diffHours < 24) return `${diffHours} jam lalu`;
    if (diffDays === 1) return 'Kemarin';
    return `${diffDays} hari lalu`;
}

const SOURCE_ICONS = {
    'The Lancet': 'menu_book',
    'NEJM': 'menu_book',
    'JAMA': 'menu_book',
    'Nature Medicine': 'biotech',
    'BMJ': 'menu_book',
    'Mayo Clinic': 'local_hospital',
    'Healthline': 'health_and_safety',
    'Medscape': 'newspaper',
    'WHO News': 'public',
    'CDC News': 'health_and_safety',
    'FDA Press': 'medication',
    'ScienceDaily': 'science',
    'EurekAlert': 'emoji_objects',
    'medRxiv': 'description',
    'PubMed': 'description',
    'Stat News': 'newspaper',
    'Oncodaily': 'medication',
};

function NewsCard({ article, featured = false }) {
    const catStyles = CATEGORY_COLORS[article.category] || CATEGORY_COLORS['Berita Medis'];
    const normalizedSource = article.source?.split(' - ')[0] || article.source;
    const icon = SOURCE_ICONS[normalizedSource] || SOURCE_ICONS[article.source] || 'article';

    if (featured) {
        return (
            <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group rounded-xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:shadow-lg hover:border-primary/40 transition-all duration-300 h-full flex flex-col"
            >
                <div className="p-5 flex flex-col h-full">
                    <div className="flex justify-between items-start mb-4">
                        <div className="p-3 bg-slate-50 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-lg group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                            <span className="material-symbols-outlined text-[24px]">{icon}</span>
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider ${catStyles.bg} ${catStyles.text}`}>
                            <span className={`size-1.5 rounded-full ${catStyles.dot}`} />
                            {article.category}
                        </span>
                    </div>

                    <h3 className="font-bold text-slate-900 dark:text-white text-lg leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-3">
                        {article.title}
                    </h3>



                    <div className="flex items-center justify-between pt-4 border-t border-slate-100 dark:border-slate-800 mt-auto">
                        <div className="flex items-center gap-1.5 min-w-0">
                            <span className="material-symbols-outlined text-[14px] text-slate-400 shrink-0">source</span>
                            <span className="text-xs font-bold text-slate-500 dark:text-slate-400 truncate">{article.source}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400 shrink-0 pl-2">
                            <span className="material-symbols-outlined text-[14px]">schedule</span>
                            <span className="text-xs font-medium">{getRelativeTime(article.pubDate)}</span>
                        </div>
                    </div>
                </div>
            </a>
        );
    }

    return (
        <a
            href={article.link}
            target="_blank"
            rel="noopener noreferrer"
            className="group flex flex-col sm:flex-row gap-4 p-4 lg:p-5 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 hover:shadow-md hover:border-primary/40 transition-all duration-300"
        >
            <div className="shrink-0 size-12 lg:size-14 rounded-xl bg-slate-50 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400 group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                <span className="material-symbols-outlined text-[24px] lg:text-[28px]">{icon}</span>
            </div>
            <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 mb-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider ${catStyles.bg} ${catStyles.text}`}>
                        {article.category}
                    </span>
                    <span className="text-xs font-bold text-slate-500 dark:text-slate-400">{article.source}</span>
                    <span className="text-slate-300 dark:text-slate-700 text-xs hidden sm:inline">•</span>
                    <span className="text-xs font-medium text-slate-400">{getRelativeTime(article.pubDate)}</span>
                </div>
                <h3 className="font-bold text-slate-900 dark:text-white text-base leading-snug group-hover:text-primary transition-colors line-clamp-2">
                    {article.title}
                </h3>
            </div>
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-primary self-center transition-colors shrink-0 hidden sm:block">
                open_in_new
            </span>
        </a>
    );
}

function StatsBadge({ articles }) {
    const sources = [...new Set(articles.map(a => a.source))].length;
    // eslint-disable-next-line react-hooks/purity
    const now = Date.now();
    const today = articles.filter(a => {
        const diff = now - new Date(a.pubDate);
        return diff < 24 * 60 * 60 * 1000;
    }).length;

    return (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
            {[
                { label: 'Total Berita', value: articles.length, icon: 'article', bgColor: 'bg-primary/10 dark:bg-primary/20', color: 'text-primary' },
                { label: 'Sumber Aktif', value: sources, icon: 'source', bgColor: 'bg-emerald-50 dark:bg-emerald-900/30', color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Hari Ini', value: today, icon: 'today', bgColor: 'bg-amber-50 dark:bg-amber-900/30', color: 'text-amber-600 dark:text-amber-400' },
            ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-slate-900 p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex items-center gap-4 hover:border-slate-300 dark:hover:border-slate-700 transition-all">
                    <div className={`size-12 rounded-lg ${stat.bgColor} ${stat.color} flex items-center justify-center shrink-0`}>
                        <span className="material-symbols-outlined text-[24px]">{stat.icon}</span>
                    </div>
                    <div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">{stat.label}</p>
                        <h3 className="text-2xl font-bold mt-0.5 text-slate-900 dark:text-white">{stat.value}</h3>
                    </div>
                </div>
            ))}
        </div>
    );
}

function SourceFilter({ articles, selected, onSelect }) {
    const sources = ['Semua', ...new Set(articles.map(a => a.source))];
    return (
        <div className="flex gap-2 overflow-x-auto pb-1 scrollbar-thin">
            {sources.map(src => (
                <button
                    key={src}
                    onClick={() => onSelect(src)}
                    className={`shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selected === src
                        ? 'bg-primary text-white shadow-sm shadow-primary/30'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                        }`}
                >
                    {src}
                </button>
            ))}
        </div>
    );
}

function CategoryFilter({ articles, selected, onSelect }) {
    const categories = ['Semua', ...new Set(articles.map(a => a.category))];
    return (
        <div className="flex gap-2 overflow-x-auto pb-1">
            {categories.map(cat => {
                const styles = cat === 'Semua' ? null : CATEGORY_COLORS[cat];
                return (
                    <button
                        key={cat}
                        onClick={() => onSelect(cat)}
                        className={`shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selected === cat
                            ? styles
                                ? `${styles.bg} ${styles.text} ring-2 ring-offset-1 ring-current`
                                : 'bg-primary text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-400 hover:border-slate-300 dark:hover:border-slate-700'
                            }`}
                    >
                        {styles && <span className={`size-1.5 rounded-full ${styles.dot}`} />}
                        {cat}
                    </button>
                );
            })}
        </div>
    );
}

// Mock articles for when the API is unavailable (dev/preview mode)
const MOCK_ARTICLES = [
    {
        id: 'mock-1',
        title: 'New Study Reveals Links Between Gut Microbiome and Mental Health',
        description: 'Researchers have found significant correlations between gut microbiome composition and psychiatric disorders, opening new avenues for treatment.',
        link: '#',
        pubDate: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString(),
        source: 'NEJM',
        category: 'Jurnal',
        color: '#136dec',
    },
    {
        id: 'mock-2',
        title: 'WHO Issues Global Health Alert on Emerging Respiratory Pathogen',
        description: 'The World Health Organization has issued a global health alert following reports of a novel respiratory pathogen identified in multiple countries.',
        link: '#',
        pubDate: new Date(Date.now() - 5 * 60 * 60 * 1000).toISOString(),
        source: 'WHO News',
        category: 'Kesehatan Global',
        color: '#2f855a',
    },
    {
        id: 'mock-3',
        title: 'Breakthrough in mRNA Vaccine Technology for Cancer Treatment',
        description: 'Clinical trials show promising results for personalized mRNA vaccines targeting solid tumors, with 80% of patients showing immune response.',
        link: '#',
        pubDate: new Date(Date.now() - 8 * 60 * 60 * 1000).toISOString(),
        source: 'The Lancet',
        category: 'Jurnal',
        color: '#e53e3e',
    },
    {
        id: 'mock-4',
        title: 'AI-Powered Diagnostic Tool Outperforms Radiologists in Lung Cancer Detection',
        description: 'A new AI system trained on over 1 million chest CT scans has demonstrated superior sensitivity in detecting early-stage lung cancer.',
        link: '#',
        pubDate: new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString(),
        source: 'MedScape',
        category: 'Berita Medis',
        color: '#6b46c1',
    },
    {
        id: 'mock-5',
        title: 'Mediterranean Diet Reduces Cardiovascular Risk by 30%, Meta-Analysis Shows',
        description: 'A comprehensive meta-analysis of 24 randomized controlled trials confirms the cardioprotective benefits of the Mediterranean dietary pattern.',
        link: '#',
        pubDate: new Date(Date.now() - 18 * 60 * 60 * 1000).toISOString(),
        source: 'BMJ',
        category: 'Jurnal',
        color: '#c05621',
    },
    {
        id: 'mock-6',
        title: 'New Guidelines for Type 2 Diabetes Management Released by ADA',
        description: 'The American Diabetes Association releases updated 2026 Standards of Medical Care featuring personalized treatment algorithms.',
        link: '#',
        pubDate: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
        source: 'Healthline',
        category: 'Berita Kesehatan',
        color: '#d69e2e',
    },
    {
        id: 'mock-7',
        title: 'Long COVID Mechanisms Identified Through Large-Scale Proteomic Study',
        description: 'Scientists have identified key protein biomarkers associated with long COVID symptoms, paving the way for targeted therapies.',
        link: '#',
        pubDate: new Date(Date.now() - 30 * 60 * 60 * 1000).toISOString(),
        source: 'PubMed - Latest',
        category: 'Riset',
        color: '#2b6cb0',
    },
    {
        id: 'mock-8',
        title: 'Antibiotic Resistance: Global Action Plan Progress Report 2026',
        description: 'WHO releases annual report on global antimicrobial resistance trends, highlighting both progress and remaining challenges.',
        link: '#',
        pubDate: new Date(Date.now() - 36 * 60 * 60 * 1000).toISOString(),
        source: 'WHO News',
        category: 'Kesehatan Global',
        color: '#2f855a',
    },
    {
        id: 'mock-9',
        title: 'Gene Therapy Shows Promise in Treating Rare Inherited Blood Disorders',
        description: 'Phase 3 trial results demonstrate durable curative responses in patients with sickle cell disease using CRISPR-based gene editing.',
        link: '#',
        pubDate: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString(),
        source: 'NEJM',
        category: 'Jurnal',
        color: '#136dec',
    },
    {
        id: 'mock-10',
        title: 'Wearable Biosensors Enable Continuous Glucose Monitoring Without Fingerpricks',
        description: 'New generation of minimally invasive wearable sensors achieves clinical accuracy comparable to traditional CGM devices.',
        link: '#',
        pubDate: new Date(Date.now() - 55 * 60 * 60 * 1000).toISOString(),
        source: 'MedScape',
        category: 'Berita Medis',
        color: '#6b46c1',
    },
];

export default function News() {
    const [articles, setArticles] = useState([]);
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [selectedSource, setSelectedSource] = useState('Semua');
    const [selectedCategory, setSelectedCategory] = useState('Semua');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'

    const fetchNews = useCallback(async () => {
        setLoading(true);
        setError(null);
        try {
            // Try the Netlify function first with cache buster
            const res = await fetch(`/.netlify/functions/fetch-news?t=${Date.now()}`);
            if (!res.ok) throw new Error('API tidak tersedia');
            const data = await res.json();
            if (data.success && data.articles?.length > 0) {
                setArticles(data.articles);
            } else {
                throw new Error('Tidak ada artikel tersedia');
            }
        } catch {
            // Fallback to mock data in development
            setArticles(MOCK_ARTICLES);
        } finally {
            setLoading(false);
        }
    }, []);

    useEffect(() => {
        fetchNews();
    }, [fetchNews]);

    const filtered = articles.filter(a => {
        const matchSource = selectedSource === 'Semua' || a.source === selectedSource;
        const matchCategory = selectedCategory === 'Semua' || a.category === selectedCategory;
        const q = searchQuery.toLowerCase();
        const matchSearch = !q || a.title.toLowerCase().includes(q) || a.description?.toLowerCase().includes(q) || a.source.toLowerCase().includes(q);
        return matchSource && matchCategory && matchSearch;
    });

    const featured = filtered.slice(0, 3);
    const rest = filtered.slice(3);

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <section>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary text-[28px] md:text-[32px]">newspaper</span>
                            Berita Medis
                        </h2>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Informasi kesehatan & kedokteran terkini.</p>
                    </div>
                    <span className="inline-flex items-center gap-1.5 bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 text-xs px-2.5 py-1 rounded-lg w-max font-semibold self-start sm:self-auto">
                        <span className="size-1.5 rounded-full bg-emerald-500 animate-pulse" />
                        Refresh otomatis 12:00 WIB
                    </span>
                </div>
            </section>

            {/* Main Content */}
            <div className="space-y-6">
                {/* Search + Controls card */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-4 mb-6">
                    <div className="flex gap-3 mb-4">
                        <div className="flex-1 relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                            <input
                                type="text"
                                placeholder="Cari berita, sumber, atau topik..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-800 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                            />
                        </div>
                        <div className="flex items-center gap-1 bg-slate-100 dark:bg-slate-800 rounded-xl p-1">
                            <button
                                onClick={() => setViewMode('grid')}
                                className={`p-1.5 rounded-lg transition-all ${viewMode === 'grid' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}
                            >
                                <span className="material-symbols-outlined text-[18px]">grid_view</span>
                            </button>
                            <button
                                onClick={() => setViewMode('list')}
                                className={`p-1.5 rounded-lg transition-all ${viewMode === 'list' ? 'bg-white dark:bg-slate-700 shadow-sm text-primary' : 'text-slate-400'}`}
                            >
                                <span className="material-symbols-outlined text-[18px]">view_list</span>
                            </button>
                        </div>
                        <button
                            onClick={fetchNews}
                            className="flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 active:scale-95 transition-all"
                        >
                            <span className="material-symbols-outlined text-[18px]">refresh</span>
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                    </div>

                    {/* Filters */}
                    {articles.length > 0 && (
                        <div className="space-y-2">
                            <SourceFilter articles={articles} selected={selectedSource} onSelect={setSelectedSource} />
                            <CategoryFilter articles={articles} selected={selectedCategory} onSelect={setSelectedCategory} />
                        </div>
                    )}
                </div>

                {/* Stats */}
                {!loading && articles.length > 0 && <StatsBadge articles={articles} />}

                {/* Loading State */}
                {loading && (
                    <div className="flex flex-col items-center justify-center py-20 gap-4">
                        <div className="relative">
                            <div className="size-16 rounded-full border-4 border-primary/20 border-t-primary animate-spin" />
                            <span className="material-symbols-outlined absolute inset-0 m-auto text-primary text-[24px]" style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>healing</span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 text-sm font-medium">Memuat berita terkini...</p>
                    </div>
                )}

                {/* Error State */}
                {error && !loading && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="size-16 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center">
                            <span className="material-symbols-outlined text-red-500 text-[28px]">wifi_off</span>
                        </div>
                        <p className="text-slate-700 dark:text-slate-300 font-semibold">Gagal memuat berita</p>
                        <p className="text-slate-400 text-sm">{error}</p>
                        <button onClick={fetchNews} className="mt-2 px-4 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/90 transition-colors">
                            Coba Lagi
                        </button>
                    </div>
                )}

                {/* No results */}
                {!loading && !error && filtered.length === 0 && articles.length > 0 && (
                    <div className="flex flex-col items-center justify-center py-16 gap-3">
                        <div className="size-16 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center">
                            <span className="material-symbols-outlined text-slate-400 text-[28px]">search_off</span>
                        </div>
                        <p className="text-slate-600 dark:text-slate-400 font-semibold">Tidak ada berita ditemukan</p>
                        <button onClick={() => { setSelectedSource('Semua'); setSelectedCategory('Semua'); setSearchQuery(''); }} className="text-sm text-primary font-semibold hover:underline">
                            Reset filter
                        </button>
                    </div>
                )}

                {/* Articles Grid */}
                {!loading && !error && filtered.length > 0 && (
                    <>
                        {viewMode === 'grid' ? (
                            <>
                                {/* Featured 3 cards */}
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 mb-6">
                                    {featured.map(article => (
                                        <NewsCard key={article.id} article={article} featured />
                                    ))}
                                </div>

                                {/* Divider if there's more */}
                                {rest.length > 0 && (
                                    <div className="flex items-center gap-3 mb-5">
                                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                                        <span className="text-xs font-semibold text-slate-400 px-2">BERITA LAINNYA</span>
                                        <div className="flex-1 h-px bg-slate-200 dark:bg-slate-700" />
                                    </div>
                                )}

                                {/* Rest as list */}
                                <div className="space-y-3">
                                    {rest.map(article => (
                                        <NewsCard key={article.id} article={article} />
                                    ))}
                                </div>
                            </>
                        ) : (
                            /* Full list view */
                            <div className="space-y-3">
                                {filtered.map(article => (
                                    <NewsCard key={article.id} article={article} />
                                ))}
                            </div>
                        )}

                        {/* Footer info */}
                        <div className="mt-8 text-center">
                            <p className="text-xs text-slate-400 dark:text-slate-600">
                                Menampilkan {filtered.length} dari {articles.length} berita · Sumber: The Lancet, NEJM, JAMA, BMJ, Nature, Mayo Clinic, Healthline, Medscape, WHO, CDC, FDA, ScienceDaily, EurekAlert, medRxiv
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
