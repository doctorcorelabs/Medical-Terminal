import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '../services/supabaseClient';

export default function ResetPassword() {
    const navigate = useNavigate();
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(true);
    const [submitting, setSubmitting] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const [sessionReady, setSessionReady] = useState(false);

    useEffect(() => {
        const code = new URLSearchParams(window.location.search).get('code');
        if (code) {
            supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
                if (error) {
                    setError('Link reset password tidak valid atau sudah kadaluarsa. Silakan minta link baru.');
                } else {
                    setSessionReady(true);
                }
                setLoading(false);
            });
        } else {
            // Fallback: maybe session already set via legacy hash flow
            supabase.auth.getSession().then(({ data: { session } }) => {
                if (session) {
                    setSessionReady(true);
                } else {
                    setError('Link reset password tidak valid. Silakan minta link baru.');
                }
                setLoading(false);
            });
        }
    }, []);

    const handleSubmit = async (e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) {
            setError('Konfirmasi password tidak cocok.');
            return;
        }
        if (newPassword.length < 8) {
            setError('Password minimal 8 karakter.');
            return;
        }

        setSubmitting(true);
        setError('');

        const { error } = await supabase.auth.updateUser({ password: newPassword });
        if (error) {
            setError(error.message);
            setSubmitting(false);
        } else {
            setMessage('Password berhasil diperbarui! Anda akan diarahkan ke halaman login...');
            await supabase.auth.signOut();
            setTimeout(() => navigate('/'), 2500);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-8 lg:p-10 space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary mb-4 shadow-sm border border-primary/20">
                            <span className="material-symbols-outlined text-4xl">lock_open</span>
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Atur Password Baru</h1>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Masukkan password baru Anda di bawah ini.</p>
                    </div>

                    {/* Loading state */}
                    {loading && (
                        <div className="flex flex-col items-center gap-3 py-6">
                            <span className="material-symbols-outlined animate-spin text-primary text-4xl">progress_activity</span>
                            <p className="text-sm text-slate-500 font-medium">Memverifikasi link reset password...</p>
                        </div>
                    )}

                    {/* Error — invalid/expired link */}
                    {!loading && error && !sessionReady && (
                        <div className="space-y-5">
                            <div className="p-4 rounded-xl text-xs font-bold bg-red-50 text-red-700 border border-red-200 text-center">
                                {error}
                            </div>
                            <button
                                onClick={() => navigate('/')}
                                className="w-full py-3.5 px-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20">
                                Kembali ke Halaman Login
                            </button>
                        </div>
                    )}

                    {/* Password form */}
                    {!loading && sessionReady && (
                        <form onSubmit={handleSubmit} className="space-y-5">
                            {(error || message) && (
                                <div className={`p-4 rounded-xl text-xs font-bold ${message ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'} text-center animate-[fadeIn_0.3s_ease-out]`}>
                                    {message || error}
                                </div>
                            )}

                            <div className="space-y-4">
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Password Baru</label>
                                    <input
                                        type="password"
                                        value={newPassword}
                                        onChange={(e) => setNewPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        disabled={!!message}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100 disabled:opacity-50"
                                        placeholder="Min. 6 karakter" />
                                </div>
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Konfirmasi Password</label>
                                    <input
                                        type="password"
                                        value={confirmPassword}
                                        onChange={(e) => setConfirmPassword(e.target.value)}
                                        required
                                        minLength={6}
                                        disabled={!!message}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100 disabled:opacity-50"
                                        placeholder="Ulangi password baru" />
                                </div>
                            </div>

                            <button
                                type="submit"
                                disabled={submitting || !!message}
                                className="w-full py-3.5 px-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-70 disabled:cursor-not-allowed">
                                {submitting && <span className="material-symbols-outlined animate-spin align-middle mr-2">progress_activity</span>}
                                Simpan Password Baru
                            </button>
                        </form>
                    )}
                </div>

                <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 p-6 text-center">
                    <p className="text-xs font-medium text-slate-500">
                        <span className="material-symbols-outlined text-xs align-middle mr-1">info</span>
                        Link ini hanya dapat digunakan sekali dan akan kadaluarsa.
                    </p>
                </div>
            </div>
        </div>
    );
}
