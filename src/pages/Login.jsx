import { useState } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { signIn, signUp } = useAuth();
    const [isLogin, setIsLogin] = useState(true);
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');

        try {
            if (isLogin) {
                const { error } = await signIn(email, password);
                if (error) throw error;
            } else {
                const { error } = await signUp(email, password);
                if (error) throw error;
                // Supabase might require email confirmation, handle that message here
                setError('Pendaftaran berhasil! Silakan periksa email Anda (jika diperlukan) atau langsung login.');
            }
        } catch (err) {
            setError(err.message || 'Terjadi kesalahan');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-8 lg:p-10 space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary mb-4 shadow-sm border border-primary/20">
                            <span className="material-symbols-outlined text-4xl">medical_services</span>
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">MedxTerminal</h1>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">
                            Masuk untuk melanjutkan ke terminal klinis Anda.
                        </p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {error && (
                            <div className={`p-4 rounded-xl text-xs font-bold ${error.includes('berhasil') ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'} text-center animate-[fadeIn_0.3s_ease-out]`}>
                                {error}
                            </div>
                        )}
                        <div className="space-y-4">
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Email</label>
                                <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                    placeholder="dokter@rs.com" />
                            </div>
                            <div className="space-y-1.5">
                                <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Password</label>
                                <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                                    className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                    placeholder="••••••••" />
                            </div>
                        </div>

                        <button type="submit" disabled={loading}
                            className="w-full py-3.5 px-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-70 disabled:cursor-not-allowed">
                            {loading ? <span className="material-symbols-outlined animate-spin align-middle mr-2">progress_activity</span> : null}
                            {isLogin ? 'Masuk' : 'Daftar Akun'}
                        </button>
                    </form>
                </div>

                {/* Footer Toggle */}
                <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 p-6 text-center">
                    <p className="text-sm font-medium text-slate-500">
                        {isLogin ? "Belum punya akun?" : "Sudah punya akun?"}
                        <button onClick={() => { setIsLogin(!isLogin); setError(''); }} type="button"
                            className="ml-2 font-bold text-primary hover:underline transition-all">
                            {isLogin ? 'Daftar sekarang' : 'Masuk di sini'}
                        </button>
                    </p>
                </div>
            </div>
        </div>
    );
}
