import { useState, useEffect } from 'react';
import { supabase } from '../../services/supabaseClient';
import { useToast } from '../../context/ToastContext';
import { generateReceiptPDF } from '../../services/receiptService';

export default function AdminSubscriptions() {
    const [transactions, setTransactions] = useState([]);
    const [loading, setLoading] = useState(true);
    const [searchTerm, setSearchTerm] = useState('');
    const { addToast } = useToast();

    useEffect(() => {
        fetchTransactions();
    }, []);

    async function fetchTransactions() {
        setLoading(true);
        try {
            // Fetch transactions
            const { data: subData, error: subError } = await supabase
                .from('user_subscriptions')
                .select(`
                    *,
                    subscription_plans (name)
                `)
                .order('created_at', { ascending: false });

            if (subError) throw subError;

            // Fetch profiles to map usernames (Supabase join can be tricky without direct FK)
            const userIds = [...new Set(subData.map(s => s.user_id))];
            const { data: profData, error: profError } = await supabase
                .from('profiles')
                .select('user_id, username')
                .in('user_id', userIds);

            if (profError) {
                console.error('Error fetching profiles:', profError);
            }

            const profileMap = (profData || []).reduce((acc, p) => {
                acc[p.user_id] = p.username;
                return acc;
            }, {});

            const merged = subData.map(s => ({
                ...s,
                display_user: profileMap[s.user_id] || 'Unknown User'
            }));

            setTransactions(merged);
        } catch (err) {
            addToast('Gagal memuat data transaksi: ' + err.message, 'error');
        } finally {
            setLoading(false);
        }
    }

    const filteredTransactions = transactions.filter(t => 
        t.gateway_order_id?.toLowerCase().includes(searchTerm.toLowerCase()) ||
        t.display_user?.toLowerCase().includes(searchTerm.toLowerCase())
    );

    const handlePrintReceipt = (t) => {
        const receiptInfo = {
            order_id: t.gateway_order_id,
            user_name: t.display_user,
            user_email: '-', // Email not available in public profiles for security
            plan_name: t.subscription_plans?.name || 'Specialist',
            amount: t.amount_paid,
            payment_method: t.payment_method || 'Unknown',
            date: t.updated_at
        };
        generateReceiptPDF(receiptInfo);
        addToast('Kuitansi sedang diproses...', 'success');
    };

    return (
        <div className="p-4 md:p-6 lg:p-10 max-w-[1400px] mx-auto animate-[fadeIn_0.3s_ease-out]">
            <div className="mb-8">
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Manajemen Langganan</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Pantau semua transaksi masuk dan cetak ulang bukti pembayaran.</p>
            </div>

            <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="p-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col md:flex-row md:items-center justify-between gap-4">
                    <div className="relative flex-1 max-w-md">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-[20px]">search</span>
                        <input 
                            type="text" 
                            placeholder="Cari Order ID, Username, atau Email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="w-full pl-10 pr-4 py-2.5 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm transition-all"
                        />
                    </div>
                    <button 
                        onClick={fetchTransactions}
                        className="flex items-center gap-2 px-4 py-2.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 dark:hover:bg-slate-700 transition-all"
                    >
                        <span className={`material-symbols-outlined text-lg ${loading ? 'animate-spin' : ''}`}>refresh</span>
                        Refresh
                    </button>
                </div>

                <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                        <thead>
                            <tr className="bg-slate-50/50 dark:bg-slate-800/50 text-[10px] uppercase tracking-widest text-slate-500 font-black">
                                <th className="px-6 py-4">Waktu</th>
                                <th className="px-6 py-4">User</th>
                                <th className="px-6 py-4">Paket</th>
                                <th className="px-6 py-4">Order ID</th>
                                <th className="px-6 py-4">Total</th>
                                <th className="px-6 py-4">Status</th>
                                <th className="px-6 py-4 text-right">Aksi</th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                            {loading && transactions.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2">
                                            <span className="material-symbols-outlined animate-spin text-4xl text-primary">progress_activity</span>
                                            <p className="text-slate-500 text-sm">Memuat data transaksi...</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : filteredTransactions.length === 0 ? (
                                <tr>
                                    <td colSpan="7" className="px-6 py-20 text-center">
                                        <div className="flex flex-col items-center gap-2 opacity-30">
                                            <span className="material-symbols-outlined text-5xl">receipt_long</span>
                                            <p className="text-sm font-bold">Tidak ada transaksi ditemukan</p>
                                        </div>
                                    </td>
                                </tr>
                            ) : (
                                filteredTransactions.map((t) => (
                                    <tr key={t.id} className="hover:bg-slate-50/50 dark:hover:bg-slate-800/30 transition-colors group">
                                        <td className="px-6 py-4 whitespace-nowrap">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                                {new Date(t.created_at).toLocaleDateString('id-ID', { day: 'numeric', month: 'short' })}
                                            </p>
                                            <p className="text-[10px] text-slate-400 font-medium uppercase tracking-tight">
                                                {new Date(t.created_at).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit' })}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-bold text-slate-700 dark:text-slate-200">{t.display_user}</p>
                                        </td>
                                        <td className="px-6 py-4">
                                            <span className="px-2 py-1 rounded-md bg-primary/5 text-primary text-[11px] font-black uppercase tracking-wider border border-primary/10">
                                                {t.subscription_plans?.name || 'N/A'}
                                            </span>
                                        </td>
                                        <td className="px-6 py-4">
                                            <code className="text-[11px] font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                                                {t.gateway_order_id}
                                            </code>
                                        </td>
                                        <td className="px-6 py-4">
                                            <p className="text-sm font-black text-slate-900 dark:text-white">
                                                Rp {Number(t.amount_paid).toLocaleString('id-ID')}
                                            </p>
                                        </td>
                                        <td className="px-6 py-4">
                                            {t.status === 'active' ? (
                                                <span className="inline-flex items-center gap-1 text-green-500 font-bold text-xs">
                                                    <span className="size-1.5 rounded-full bg-green-500 animate-pulse"></span>
                                                    ACTIVE
                                                </span>
                                            ) : t.status === 'pending' ? (
                                                <span className="inline-flex items-center gap-1 text-amber-500 font-bold text-xs text-amber-500">
                                                    <span className="size-1.5 rounded-full bg-amber-500"></span>
                                                    PENDING
                                                </span>
                                            ) : (
                                                <span className="inline-flex items-center gap-1 text-slate-400 font-bold text-xs">
                                                    <span className="size-1.5 rounded-full bg-slate-400"></span>
                                                    {t.status.toUpperCase()}
                                                </span>
                                            )}
                                        </td>
                                        <td className="px-6 py-4 text-right">
                                            {t.status === 'active' && (
                                                <button 
                                                    onClick={() => handlePrintReceipt(t)}
                                                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-primary text-white text-[11px] font-black uppercase tracking-wider rounded-lg hover:bg-blue-600 transition-all opacity-0 group-hover:opacity-100 shadow-lg shadow-primary/20"
                                                >
                                                    <span className="material-symbols-outlined text-[16px]">print</span>
                                                    Cetak Kuitansi
                                                </button>
                                            )}
                                        </td>
                                    </tr>
                                ))
                            )}
                        </tbody>
                    </table>
                </div>
            </div>
        </div>
    );
}
