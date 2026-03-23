import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import { useState, useEffect, useCallback } from 'react';
import { supabase } from '../services/supabaseClient';
import { generateReceiptPDF } from '../services/receiptService';

export default function Subscription() {
    const navigate = useNavigate();
    const { user, profile, isSpecialist, isIntern } = useAuth();
    const { addToast } = useToast();
    const [loading, setLoading] = useState(false);
    const [showSuccess, setShowSuccess] = useState(false);
    const [receiptData, setReceiptData] = useState(null);
    const [verifying, setVerifying] = useState(false);

    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        if (params.get('success')) {
            handleSuccessRedirect();
            window.history.replaceState({}, document.title, window.location.pathname);
        }
    }, [profile, handleSuccessRedirect]);

    const handleSuccessRedirect = useCallback(async () => {
        if (!profile?.id) return;
        setVerifying(true);
        
        // Use a ref-like variable for polling state within closure
        let attempts = 0;
        const maxAttempts = 5;
        let isDownloaded = false;
        
        const fetchTransaction = async () => {
            const { data } = await supabase
                .from('user_subscriptions')
                .select('*, subscription_plans(name)')
                .eq('user_id', profile.id)
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (data && data.status === 'active') {
                const { id: _id, subscription_plans: _plans, ...subData } = data; // Destructure to prefix unused 'id' and 'subscription_plans'
                const receiptInfo = {
                    order_id: subData.gateway_order_id,
                    user_name: profile.username || user?.email,
                    user_email: user?.email,
                    plan_name: _plans?.name || 'Specialist',
                    amount: subData.amount_paid,
                    payment_method: subData.payment_method || 'QRIS/Transfer',
                    date: subData.updated_at
                };
                setReceiptData(receiptInfo);
                setShowSuccess(true);
                setVerifying(false);
                
                // Trigger auto-download only once
                if (!isDownloaded) {
                    isDownloaded = true;
                    setTimeout(() => generateReceiptPDF(receiptInfo), 1000);
                }
                return true;
            }
            return false;
        };

        // Initial check
        const initialSuccess = await fetchTransaction();
        if (initialSuccess) return; // if already active, no need to poll

        // Poll every 2 seconds for up to 10 seconds
        const interval = setInterval(async () => {
            const success = await fetchTransaction();
            attempts++;
            if (success || attempts >= maxAttempts) {
                clearInterval(interval);
                if (!success) {
                    setVerifying(false);
                    setShowSuccess(true); // Still show success modal, but without auto-download
                }
            }
        }, 2000);
    }, [profile, user?.email]);

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
                    <div className="bg-linear-to-r from-primary to-teal-500 rounded-2xl p-6 text-white shadow-lg flex items-center justify-between">
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
                                Beragam Tools medis pembantu
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-green-500 text-lg shrink-0">check_circle</span>
                                Reguler Medx AI Agent
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
                                <span className="text-4xl font-black text-slate-900 dark:text-white">60.000</span>
                                <span className="text-slate-500 font-medium">/bln</span>
                            </div>
                            <p className="text-slate-500 text-sm mt-4">Perpanjangan setiap bulan. Batalkan kapan saja.</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Pasien aktif tanpa batas
                            </li>
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Advanced Medx AI Agent
                            </li>
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Export Output Pasien Detail di Medx AI Agent
                            </li>
                            <li className="flex gap-3 text-sm font-semibold text-slate-700 dark:text-slate-300">
                                <span className="material-symbols-outlined text-primary text-lg shrink-0">check_circle</span>
                                Data selalu disimpan di database
                            </li>
                        </ul>
                        <button 
                            onClick={() => handleCheckout('specialist_monthly', 60000)} 
                            disabled={loading} 
                            className={`w-full py-3 rounded-xl font-bold transition shadow-lg flex justify-center items-center gap-2 group ${
                                isSpecialist 
                                    ? 'bg-white dark:bg-slate-800 border-2 border-primary text-primary hover:bg-primary/5 shadow-primary/10' 
                                    : 'bg-primary text-white hover:bg-primary/90 shadow-primary/30'
                            }`}
                        >
                            {loading ? <span className="material-symbols-outlined animate-spin">refresh</span> : (
                                <>
                                    {isSpecialist && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-primary/10 rounded-full">
                                            <span className="size-1.5 rounded-full bg-primary animate-pulse"></span>
                                            <span className="text-[10px] font-black uppercase tracking-tighter">Aktif</span>
                                        </div>
                                    )}
                                    <span>{isSpecialist ? 'Tambah Durasi' : 'Mulai Langganan'}</span>
                                </>
                            )}
                        </button>
                    </div>

                    {/* Specialist Enthusiast Card */}
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 flex flex-col hover:border-slate-300 dark:hover:border-slate-700 transition relative overflow-hidden">
                        <div className="absolute top-4 right-4 bg-red-500 text-white text-xs font-black uppercase tracking-wider py-1 px-3 rounded-full animate-pulse shadow-lg shadow-red-500/30 transform rotate-3">
                            Hemat 17%
                        </div>
                        <div className="mb-8">
                            <h3 className="text-xl font-bold text-slate-900 dark:text-white mb-2">Specialist Enthusiast</h3>
                            <div className="flex items-baseline gap-1 relative">
                                <span className="text-xl font-bold text-slate-500">Rp</span>
                                <span className="text-4xl font-black text-slate-900 dark:text-white">150.000</span>
                            </div>
                            <div className="text-xs text-slate-400 line-through mt-1">Harga Normal: Rp 180.000</div>
                            <p className="text-slate-500 text-sm mt-4">Paket 3 Bulan Specialist.</p>
                        </div>
                        <ul className="space-y-4 mb-8 flex-1">
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-teal-500 text-lg shrink-0">check_circle</span>
                                Semua fitur Specialist
                            </li>
                            <li className="flex gap-3 text-sm text-slate-600 dark:text-slate-400">
                                <span className="material-symbols-outlined text-teal-500 text-lg shrink-0">check_circle</span>
                                Lebih hemat dibanding bulanan
                            </li>
                        </ul>
                        <button 
                            onClick={() => handleCheckout('specialist_enthusiast', 150000)}
                            disabled={loading}
                            className={`w-full py-3.5 rounded-xl font-bold transition flex items-center justify-center gap-2 border-2 ${
                                isSpecialist && profile?.subscription_plans?.code === 'specialist_enthusiast'
                                    ? 'border-teal-500 bg-teal-50/30 dark:bg-teal-900/10 text-teal-600 dark:text-teal-400'
                                    : 'border-slate-200 dark:border-slate-700 text-slate-700 dark:text-slate-300 hover:border-slate-300 dark:hover:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-800'
                            }`}
                        >
                            {loading ? <span className="material-symbols-outlined animate-spin">refresh</span> : (
                                <>
                                    {isSpecialist && profile?.subscription_plans?.code === 'specialist_enthusiast' && (
                                        <div className="flex items-center gap-1.5 px-2 py-0.5 bg-teal-500/10 rounded-full">
                                            <span className="size-1.5 rounded-full bg-teal-500 animate-pulse"></span>
                                            <span className="text-[10px] font-black uppercase tracking-tighter">Aktif</span>
                                        </div>
                                    )}
                                    <span>{isSpecialist ? 'Tambah Durasi' : 'Beli Paket'}</span>
                                </>
                            )}
                        </button>
                    </div>

                </div>

            </div>

            {/* Verifying Overlay */}
            {verifying && (
                <div className="fixed inset-0 z-110 flex flex-col items-center justify-center bg-slate-900/40 backdrop-blur-md">
                    <div className="bg-white dark:bg-slate-900 p-8 rounded-3xl shadow-2xl flex flex-col items-center gap-4 border border-slate-200 dark:border-slate-800">
                        <span className="material-symbols-outlined text-5xl text-primary animate-spin">progress_activity</span>
                        <div className="text-center">
                            <h3 className="text-lg font-bold">Memverifikasi Pembayaran...</h3>
                            <p className="text-sm text-slate-500">Mohon tunggu sebentar, sistem sedang memproses transaksi Anda.</p>
                        </div>
                    </div>
                </div>
            )}

            {/* Success Celebration Modal */}
            {showSuccess && (
                <div className="fixed inset-0 z-100 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm animate-[fadeIn_0.3s_ease-out]">
                    <div className="bg-white dark:bg-slate-900 rounded-3xl p-8 max-w-sm w-full text-center shadow-2xl border border-slate-200 dark:border-slate-800 relative overflow-hidden">
                        {/* Confetti Particles (CSS Only) */}
                        <div className="absolute inset-0 pointer-events-none opacity-50">
                            {[...Array(12)].map((_, i) => (
                                <div 
                                    key={i} 
                                    className="absolute size-2 rounded-full animate-[confetti_3s_ease-in-out_infinite]"
                                    style={{
                                        left: `${Math.random() * 100}%`,
                                        top: `-20px`,
                                        backgroundColor: ['#6366f1', '#10b981', '#f59e0b', '#ec4899'][i % 4],
                                        animationDelay: `${Math.random() * 2}s`
                                    }}
                                />
                            ))}
                        </div>

                        <div className="size-20 bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-full flex items-center justify-center mx-auto mb-6 relative z-10">
                            <span className="material-symbols-outlined text-[40px] animate-bounce">verified</span>
                        </div>
                        
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2 relative z-10">Pembayaran Berhasil!</h2>
                        <p className="text-slate-500 dark:text-slate-400 mb-8 relative z-10 leading-relaxed text-sm">
                            {receiptData 
                                ? `Terima kasih telah berlangganan! Kuitansi pembayaran #${receiptData.order_id} telah diunduh secara otomatis.`
                                : "Terima kasih telah berlangganan! Akun Anda sedang diperbarui ke level **Specialist**. Nikmati akses tanpa batas ke semua fitur klinis."
                            }
                        </p>
                        
                        <div className="space-y-3 relative z-10">
                            {receiptData && (
                                <button 
                                    onClick={() => generateReceiptPDF(receiptData)}
                                    className="w-full py-4 rounded-xl font-bold border-2 border-green-500 text-green-600 hover:bg-green-50 transition-all flex items-center justify-center gap-2"
                                >
                                    <span className="material-symbols-outlined">download_done</span>
                                    Cetak Ulang Kuitansi
                                </button>
                            )}
                            
                            <button 
                                onClick={() => setShowSuccess(false)}
                                className="w-full py-4 rounded-xl font-bold bg-green-500 text-white hover:bg-green-600 transition-all shadow-lg shadow-green-500/30 active:scale-95"
                            >
                                Ke Dashboard Utama
                            </button>
                        </div>
                    </div>
                    
                    {/* Add required CSS directly if needed or assume styles exist. Adding inline for reliability. */}
                    <style dangerouslySetInnerHTML={{ __html: `
                        @keyframes confetti {
                            0% { transform: translateY(0) rotate(0deg); opacity: 1; }
                            100% { transform: translateY(500px) rotate(720deg); opacity: 0; }
                        }
                    `}} />
                </div>
            )}
        </div>
    );
}
