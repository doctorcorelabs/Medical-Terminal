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

function formatDate(dateStr) {
    const date = new Date(dateStr);
    return date.toLocaleDateString('id-ID', {
        day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit'
    });
}

const SOURCE_ICONS = {
    'Google News Health': 'health_and_safety',
    'Google News Research': 'biotech',
    'Google News WHO': 'public',
    'Google News Drug': 'medication',
    'Google News Disease': 'coronavirus',
    'ScienceDaily Health': 'science',
    'ScienceDaily': 'science',
    'WHO News': 'public',
    'NIH News': 'biotech',
    'CDC Newsroom': 'health_and_safety',
    'EurekAlert': 'emoji_objects',
    'STAT News': 'newspaper',
    'The Lancet': 'menu_book',
    'medRxiv': 'description',
    'PubMed': 'search',
    'FDA Press Releases': 'medication',
    'WebMD Health News': 'health_and_safety',
};

function NewsCard({ article, featured = false }) {
    const catStyles = CATEGORY_COLORS[article.category] || CATEGORY_COLORS['Berita Medis'];
    const icon = SOURCE_ICONS[article.source] || 'article';

    if (featured) {
        return (
            <a
                href={article.link}
                target="_blank"
                rel="noopener noreferrer"
                className="group block rounded-2xl overflow-hidden bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-xl hover:border-primary/40 transition-all duration-300 hover:-translate-y-1"
            >
                <div className="relative h-48 overflow-hidden" style={{ background: `linear-gradient(135deg, ${article.color}18, ${article.color}35)` }}>
                    <div className="absolute inset-0 flex items-center justify-center">
                        <span
                            className="material-symbols-outlined text-[80px] opacity-20 group-hover:opacity-30 transition-opacity"
                            style={{ color: article.color }}
                        >
                            {icon}
                        </span>
                    </div>
                    <div className="absolute inset-0 bg-gradient-to-t from-black/50 to-transparent" />
                    <div className="absolute bottom-4 left-4 right-4">
                        <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold ${catStyles.bg} ${catStyles.text} backdrop-blur-sm`}>
                            <span className={`size-1.5 rounded-full ${catStyles.dot}`} />
                            {article.category}
                        </span>
                    </div>
                    {/* Decorative DNA helix pattern */}
                    <div className="absolute top-3 right-3 opacity-20">
                        <svg width="60" height="60" viewBox="0 0 60 60" fill="none">
                            <circle cx="30" cy="30" r="28" stroke={article.color} strokeWidth="1.5" strokeDasharray="4 3" />
                            <circle cx="30" cy="30" r="18" stroke={article.color} strokeWidth="1" strokeDasharray="3 4" />
                            <circle cx="30" cy="30" r="8" fill={article.color} opacity="0.4" />
                        </svg>
                    </div>
                </div>
                <div className="p-5">
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-base leading-snug mb-2 group-hover:text-primary transition-colors line-clamp-3">
                        {article.title}
                    </h3>
                    {article.description && (
                        <p className="text-sm text-slate-500 dark:text-slate-400 line-clamp-2 mb-4">
                            {article.description}
                        </p>
                    )}
                    <div className="flex items-center justify-between pt-3 border-t border-slate-100 dark:border-slate-800">
                        <div className="flex items-center gap-1.5">
                            <span className="material-symbols-outlined text-[14px] text-slate-400">{icon}</span>
                            <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">{article.source}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-400">
                            <span className="material-symbols-outlined text-[13px]">schedule</span>
                            <span className="text-xs">{getRelativeTime(article.pubDate)}</span>
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
            className="group flex gap-4 p-4 rounded-xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-lg hover:border-primary/40 transition-all duration-300 hover:-translate-y-0.5"
        >
            <div
                className="flex-shrink-0 size-12 rounded-xl flex items-center justify-center"
                style={{ background: `${article.color}15` }}
            >
                <span className="material-symbols-outlined text-[22px]" style={{ color: article.color }}>{icon}</span>
            </div>
            <div className="min-w-0 flex-1">
                <h3 className="font-semibold text-slate-800 dark:text-slate-100 text-sm leading-snug mb-1 group-hover:text-primary transition-colors line-clamp-2">
                    {article.title}
                </h3>
                <div className="flex items-center gap-2 flex-wrap">
                    <span className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full text-[10px] font-semibold ${catStyles.bg} ${catStyles.text}`}>
                        {article.category}
                    </span>
                    <span className="text-xs text-slate-400">{article.source}</span>
                    <span className="text-slate-300 dark:text-slate-700 text-xs">•</span>
                    <span className="text-xs text-slate-400">{getRelativeTime(article.pubDate)}</span>
                </div>
            </div>
            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 group-hover:text-primary self-center transition-colors flex-shrink-0">
                open_in_new
            </span>
        </a>
    );
}

function StatsBadge({ articles }) {
    const sources = [...new Set(articles.map(a => a.source))].length;
    const categories = [...new Set(articles.map(a => a.category))].length;
    const today = articles.filter(a => {
        const diff = Date.now() - new Date(a.pubDate);
        return diff < 24 * 60 * 60 * 1000;
    }).length;

    return (
        <div className="grid grid-cols-3 gap-3 mb-6">
            {[
                { label: 'Total Berita', value: articles.length, icon: 'article', color: 'text-primary' },
                { label: 'Sumber Aktif', value: sources, icon: 'source', color: 'text-emerald-600 dark:text-emerald-400' },
                { label: 'Hari Ini', value: today, icon: 'today', color: 'text-amber-600 dark:text-amber-400' },
            ].map(stat => (
                <div key={stat.label} className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl p-4 text-center">
                    <span className={`material-symbols-outlined text-[20px] ${stat.color} mb-1`}>{stat.icon}</span>
                    <p className={`text-2xl font-bold ${stat.color}`}>{stat.value}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">{stat.label}</p>
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
                    className={`flex-shrink-0 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selected === src
                        ? 'bg-primary text-white shadow-sm shadow-primary/30'
                        : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/50'
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
                        className={`flex-shrink-0 inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold transition-all ${selected === cat
                            ? styles
                                ? `${styles.bg} ${styles.text} ring-2 ring-offset-1 ring-current`
                                : 'bg-primary text-white'
                            : 'bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-400 hover:border-primary/50'
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
    const [updatedAt, setUpdatedAt] = useState(null);
    const [selectedSource, setSelectedSource] = useState('Semua');
    const [selectedCategory, setSelectedCategory] = useState('Semua');
    const [searchQuery, setSearchQuery] = useState('');
    const [viewMode, setViewMode] = useState('grid'); // 'grid' | 'list'
    const [isMock, setIsMock] = useState(false);

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
                setUpdatedAt(data.updatedAt);
                setIsMock(false);
            } else {
                throw new Error('Tidak ada artikel tersedia');
            }
        } catch {
            // Fallback to mock data in development
            setArticles(MOCK_ARTICLES);
            setUpdatedAt(new Date().toISOString());
            setIsMock(true);
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
        <div className="min-h-full bg-[#f6f7f8] dark:bg-[#101822]">
            {/* Hero Header */}
            <div className="relative overflow-hidden bg-gradient-to-br from-primary to-blue-800 dark:from-blue-950 dark:to-slate-900 px-6 pt-8 pb-12">
                {/* Decorative background elements */}
                <div className="absolute inset-0 overflow-hidden pointer-events-none">
                    <div className="absolute -top-16 -right-16 size-64 rounded-full bg-white/5 blur-2xl" />
                    <div className="absolute -bottom-20 -left-10 size-80 rounded-full bg-white/5 blur-3xl" />
                    <svg className="absolute top-4 right-8 opacity-10" width="120" height="120" viewBox="0 0 120 120">
                        <defs>
                            <pattern id="crosshatch" x="0" y="0" width="12" height="12" patternUnits="userSpaceOnUse">
                                <line x1="0" y1="0" x2="12" y2="12" stroke="white" strokeWidth="0.5" />
                                <line x1="12" y1="0" x2="0" y2="12" stroke="white" strokeWidth="0.5" />
                            </pattern>
                        </defs>
                        <rect width="120" height="120" fill="url(#crosshatch)" />
                    </svg>
                    {/* ECG line decoration */}
                    <svg className="absolute bottom-0 left-0 right-0 opacity-10" height="60" preserveAspectRatio="none" viewBox="0 0 1200 60">
                        <polyline
                            points="0,30 200,30 240,5 260,55 280,5 300,30 400,30 450,30 470,10 490,50 510,30 700,30 750,30 790,10 820,50 840,30 1200,30"
                            stroke="white" strokeWidth="2" fill="none"
                        />
                    </svg>
                </div>

                <div className="relative max-w-5xl mx-auto">
                    <div className="flex items-center gap-3 mb-2">
                        <div className="bg-white/10 backdrop-blur-sm rounded-xl p-2">
                            <span className="material-symbols-outlined text-white text-[24px]">newspaper</span>
                        </div>
                        <div>
                            <h1 className="text-2xl font-bold text-white">Berita Medis</h1>
                            <p className="text-blue-200 text-sm">Informasi kesehatan & kedokteran terkini</p>
                        </div>
                    </div>

                    {updatedAt && (
                        <div className="flex items-center gap-2 mt-4">
                            <span className="inline-flex items-center gap-1.5 bg-white/10 backdrop-blur-sm text-blue-100 text-xs px-3 py-1.5 rounded-full border border-white/20">
                                <span className="material-symbols-outlined text-[13px]">update</span>
                                Diperbarui: {formatDate(updatedAt)}
                                {isMock && <span className="ml-1 text-yellow-300 font-semibold">(Demo)</span>}
                            </span>
                            <span className="inline-flex items-center gap-1.5 bg-emerald-500/20 text-emerald-200 text-xs px-3 py-1.5 rounded-full border border-emerald-500/30">
                                <span className="size-1.5 rounded-full bg-emerald-400 animate-pulse" />
                                Refresh otomatis 12:00 WIB
                            </span>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="max-w-5xl mx-auto px-4 -mt-6 pb-20">
                {/* Search + Controls card */}
                <div className="bg-white dark:bg-slate-900 rounded-2xl shadow-lg border border-slate-200 dark:border-slate-700 p-4 mb-6">
                    <div className="flex gap-3 mb-4">
                        <div className="flex-1 relative">
                            <span className="material-symbols-outlined absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 text-[18px]">search</span>
                            <input
                                type="text"
                                placeholder="Cari berita, sumber, atau topik..."
                                value={searchQuery}
                                onChange={e => setSearchQuery(e.target.value)}
                                className="w-full pl-9 pr-4 py-2.5 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 text-sm text-slate-800 dark:text-slate-200 placeholder-slate-400 focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
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
                                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 mb-6">
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
                                Menampilkan {filtered.length} dari {articles.length} berita · Sumber: ScienceDaily, WHO, CDC, NIH, FDA, WebMD, EurekAlert, STAT News, The Lancet, medRxiv, PubMed
                            </p>
                        </div>
                    </>
                )}
            </div>
        </div>
    );
}
