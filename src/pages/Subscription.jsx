import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useState, useEffect } from 'react';
import { supabase } from '../services/supabaseClient';

export default function Subscription() {
    const navigate = useNavigate();
    const { profile, isSpecialist, isIntern } = useAuth();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success')) {
            addToast('Pembayaran Anda sedang diproses. Jika berhasil, status langganan akan otomatis diperbarui dalam beberapa saat.', 'success');
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [addToast]);

    const handleCheckout = async (planCode, amount) => {
        setLoading(true);
        try {
            const pakasirSlug = import.meta.env.VITE_PAKASIR_PROJECT_SLUG;
            if (!pakasirSlug) {
                addToast('Sistem pembayaran belum dikonfigurasi (Missing Slug ENV). Hubungi Admin.', 'error');
                setLoading(false);
                return;
            }

            // 1. Get Plan ID
            const { data: planData, error: planError } = await supabase
                .from('subscription_plans')
                .select('id')
                .eq('code', planCode)
                .single();

            if (planError || !planData) throw new Error('Paket berlangganan tidak ditemukan di database.');

            // 2. Generate Order ID
            const orderId = `INV-${profile?.id?.substring(0, 5).toUpperCase() || 'USR'}-${Date.now()}`;

            // 3. Insert Pending Subscription
            const { error: insertError } = await supabase
                .from('user_subscriptions')
                .insert({
                    user_id: profile?.id,
                    plan_id: planData.id,
                    status: 'pending',
                    gateway_order_id: orderId,
                    amount_paid: amount
                });

            if (insertError) throw insertError;

            // 4. Redirect to Pakasir
            const redirectUrl = encodeURIComponent(`${window.location.origin}/subscription?success=true`);
            const checkoutUrl = `https://app.pakasir.com/pay/${pakasirSlug}/${amount}?order_id=${orderId}&redirect=${redirectUrl}`;
            
            window.location.href = checkoutUrl;

        } catch (error) {
            console.error('Checkout error:', error);
            addToast(`Gagal memulai pembayaran: ${error.message}`, 'error');
            setLoading(false);
        }
    };

    const calculateDaysLeft = () => {
        if (!profile?.subscription_expires_at) return null;
        const diff = new Date(profile.subscription_expires_at) - new Date();
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        return days > 0 ? days : 0;
    };

    const daysLeft = calculateDaysLeft();
    const hasLifetime = isSpecialist && !profile?.subscription_expires_at;

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 bg-slate-50 dark:bg-slate-900/50">
            <div className="max-w-5xl mx-auto space-y-10 animate-[fadeIn_0.3s_ease-out]">
                
                {/* Header */}
                <div className="text-center space-y-4 max-w-2xl mx-auto">
                    <button onClick={() => navigate(-1)} className="inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-primary transition mb-4">
                        <span className="material-symbols-outlined text-base">arrow_back</span>
                        Kembali
                    </button>
                    <h1 className="text-3xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Pilih Paket Anda</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-lg">Tingkatkan produktivitas klinis Anda dengan manajemen pasien tanpa batas.</p>
                </div>

                {/* Active Subscription Banner */}
                {isSpecialist && (
                    <div className="bg-gradient-to-r from-primary to-teal-500 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between">
                        <div>
                            <div className="flex items-center gap-2 mb-1">
                                <span className="material-symbols-outlined">workspace_premium</span>
                                <h3 className="font-bold text-lg">Status: Specialist Aktif</h3>
                            </div>
                            <p className="text-white/80 text-sm">
                                {hasLifetime ? 'Paket Specialist Lifetime (Tanpa Batas Waktu)' : `Paket bulanan aktif. Tersisa ${daysLeft} hari.`}
                            </p>
                        </div>
                    </div>
                )}
                {isIntern && profile?.subscription_expires_at && daysLeft === 0 && (
                     <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-2xl p-6 flex items-center justify-between">
                     <div>
                         <div className="flex items-center gap-2 mb-1">
                             <span className="material-symbols-outlined">error</span>
                             <h3 className="font-bold text-lg">Langganan Kedaluwarsa</h3>
                         </div>
                         <p className="text-sm opacity-80">
                             Paket Specialist Anda telah berakhir. Anda kembali ke paket Intern.
                         </p>
                     </div>
                 </div>
                )}

                {/* Pricing Cards */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    
                    {/* Intern Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition">
                        <div className="mb-8">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Intern</h3>
                            <div className="flex items-baseline gap-1">
                                <span className="text-4xl font-black text-slate-900 dark:text-white">Gratis</span>
                            </div>
                            <p className="text-slate-500 text-sm mt-4">Ideal untuk mencoba fitur dasar aplikasi.</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-green-500 text-lg shrink-0">check_circle</span>
                                Maksimal 2 pasien aktif
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-green-500 text-lg shrink-0">check_circle</span>
                                Fitur kalkulator medis
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-green-500 text-lg shrink-0">check_circle</span>
                                Pencarian ICD-10 dasar
                            </li>
                        </ul>
                        <button disabled className="w-full py-3 rounded-xl font-bold bg-slate-100 dark:bg-slate-800 text-slate-400 cursor-not-allowed">
                            {isIntern ? 'Paket Saat Ini' : 'Plan Dasar'}
                        </button>
                    </div>

                    {/* Specialist (Monthly) Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border-2 border-primary relative flex flex-col shadow-xl shadow-primary/10 transform md:-translate-y-4">
                        <div className="absolute top-0 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-primary text-white text-xs font-black uppercase tracking-widest py-1 px-4 rounded-full">
                            Populer
                        </div>
                        <div className="mb-8">
                            <h3 className="text-xl font-bold text-primary mb-2 flex items-center gap-2">
                                <span className="material-symbols-outlined">workspace_premium</span>
                                Specialist
                            </h3>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-bold text-slate-500">Rp</span>
                                <span className="text-4xl font-black text-slate-900 dark:text-white">49.000</span>
                                <span className="text-slate-500 font-medium">/bln</span>
                            </div>
                            <p className="text-slate-500 text-sm mt-4">Perpanjangan setiap bulan.</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Pasien aktif tanpa batas
                            </li>
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Asisten AI Medis Lanjutan
                            </li>
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Export Rekam Medis & PDF
                            </li>
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Prioritas akses fitur baru
                            </li>
                        </ul>
                        <button onClick={() => handleCheckout('specialist_monthly', 49000)} disabled={loading} className="w-full py-3 rounded-xl font-bold bg-primary text-white hover:bg-primary/90 transition shadow-lg shadow-primary/30 flex justify-center items-center">
                            {loading ? <span className="material-symbols-outlined animate-spin">refresh</span> : 'Mulai Langganan'}
                        </button>
                    </div>

                    {/* Specialist (Lifetime) Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col hover:border-primary/50 transition">
                        <div className="mb-8">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Lifetime</h3>
                            <div className="flex items-baseline gap-1">
                                <span className="text-xl font-bold text-slate-500">Rp</span>
                                <span className="text-4xl font-black text-slate-900 dark:text-white">999.000</span>
                            </div>
                            <p className="text-slate-500 text-sm mt-4">Sekali bayar untuk selamanya.</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-teal-500 text-lg shrink-0">check_circle</span>
                                Semua fitur Specialist
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-teal-500 text-lg shrink-0">check_circle</span>
                                Tanpa biaya bulanan
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-teal-500 text-lg shrink-0">check_circle</span>
                                Dukungan eksklusif 24/7
                            </li>
                        </ul>
                        <button onClick={() => handleCheckout('specialist_lifetime', 999000)} disabled={loading} className="w-full py-3 rounded-xl font-bold border-2 border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 transition flex justify-center items-center">
                            {loading ? <span className="material-symbols-outlined animate-spin">refresh</span> : 'Beli Lifetime'}
                        </button>
                    </div>

                </div>

            </div>
        </div>
    );
}
