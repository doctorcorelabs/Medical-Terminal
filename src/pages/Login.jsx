import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';

export default function Login() {
    const { signIn, signUp, resetPassword, updatePassword, isRecoveryMode, setIsRecoveryMode } = useAuth();
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot' | 'recovery'
    const [email, setEmail] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');

    useEffect(() => {
        if (isRecoveryMode) setMode('recovery');
    }, [isRecoveryMode]);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            if (mode === 'login') {
                const { error } = await signIn(email, password);
                if (error) throw error;
            } else if (mode === 'signup') {
                const { error } = await signUp(email, password);
                if (error) throw error;
                setMessage('Pendaftaran berhasil! Silakan periksa email Anda untuk konfirmasi pendaftaran (cek dibagian spam apabila tidak muncul)');
            } else if (mode === 'forgot') {
                const { error } = await resetPassword(email);
                if (error) throw error;
                setMessage('Link reset password telah dikirim ke email Anda. Silakan periksa kotak masuk Anda (cek dibagian spam apabila tidak muncul).');
            } else if (mode === 'recovery') {
                if (newPassword !== confirmPassword) throw new Error('Konfirmasi password tidak cocok.');
                if (newPassword.length < 6) throw new Error('Password minimal 6 karakter.');
                const { error } = await updatePassword(newPassword);
                if (error) throw error;
                setMessage('Password berhasil diperbarui! Anda akan diarahkan ke halaman login.');
                setIsRecoveryMode(false);
            }
        } catch (err) {
            setError(err.message || 'Terjadi kesalahan');
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (newMode) => {
        setMode(newMode);
        setError('');
        setMessage('');
        setEmail('');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
    };

    const modeConfig = {
        login: { title: 'Masuk', subtitle: 'Masuk untuk melanjutkan ke terminal klinis Anda.', icon: 'login' },
        signup: { title: 'Daftar Akun', subtitle: 'Buat akun baru untuk mengakses MedxTerminal.', icon: 'person_add' },
        forgot: { title: 'Lupa Password', subtitle: 'Masukkan email Anda dan kami akan mengirim link untuk mereset password.', icon: 'lock_reset' },
        recovery: { title: 'Atur Password Baru', subtitle: 'Masukkan password baru Anda di bawah ini.', icon: 'lock_open' },
    };

    const cfg = modeConfig[mode];

    return (
        <div className="min-h-screen bg-slate-50 dark:bg-slate-900 flex items-center justify-center p-4 animate-[fadeIn_0.3s_ease-out]">
            <div className="w-full max-w-md bg-white dark:bg-slate-800 rounded-3xl shadow-xl border border-slate-100 dark:border-slate-700 overflow-hidden">
                <div className="p-8 lg:p-10 space-y-8">
                    {/* Header */}
                    <div className="text-center space-y-2">
                        <div className="inline-flex items-center justify-center size-16 rounded-2xl bg-primary/10 text-primary mb-4 shadow-sm border border-primary/20">
                            <span className="material-symbols-outlined text-4xl">{cfg.icon}</span>
                        </div>
                        <h1 className="text-2xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{cfg.title}</h1>
                        <p className="text-sm font-medium text-slate-500 dark:text-slate-400">{cfg.subtitle}</p>
                    </div>

                    {/* Form */}
                    <form onSubmit={handleSubmit} className="space-y-5">
                        {(error || message) && (
                            <div className={`p-4 rounded-xl text-xs font-bold ${message ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-red-50 text-red-700 border border-red-200'} text-center animate-[fadeIn_0.3s_ease-out]`}>
                                {message || error}
                            </div>
                        )}

                        <div className="space-y-4">
                            {/* Email - shown for login, signup, forgot */}
                            {mode !== 'recovery' && (
                                <div className="space-y-1.5">
                                    <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Email</label>
                                    <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                        placeholder="dokter@rs.com" />
                                </div>
                            )}

                            {/* Password - shown for login and signup */}
                            {(mode === 'login' || mode === 'signup') && (
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between">
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Password</label>
                                        {mode === 'login' && (
                                            <button type="button" onClick={() => switchMode('forgot')}
                                                className="text-[11px] font-bold text-primary hover:underline transition-all">
                                                Lupa password?
                                            </button>
                                        )}
                                    </div>
                                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={6}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                        placeholder="••••••••" />
                                </div>
                            )}

                            {/* New Password fields - shown for recovery */}
                            {mode === 'recovery' && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Password Baru</label>
                                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={6}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                            placeholder="Min. 6 karakter" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Konfirmasi Password</label>
                                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={6}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                            placeholder="Ulangi password baru" />
                                    </div>
                                </>
                            )}
                        </div>

                        <button type="submit" disabled={loading}
                            className="w-full py-3.5 px-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-70 disabled:cursor-not-allowed">
                            {loading ? <span className="material-symbols-outlined animate-spin align-middle mr-2">progress_activity</span> : null}
                            {mode === 'login' && 'Masuk'}
                            {mode === 'signup' && 'Daftar Akun'}
                            {mode === 'forgot' && 'Kirim Link Reset'}
                            {mode === 'recovery' && 'Simpan Password Baru'}
                        </button>
                    </form>
                </div>

                {/* Footer Toggle */}
                <div className="bg-slate-50 dark:bg-slate-900 border-t border-slate-100 dark:border-slate-700 p-6 text-center">
                    {mode === 'login' && (
                        <p className="text-sm font-medium text-slate-500">
                            Belum punya akun?
                            <button onClick={() => switchMode('signup')} type="button"
                                className="ml-2 font-bold text-primary hover:underline transition-all">
                                Daftar sekarang
                            </button>
                        </p>
                    )}
                    {mode === 'signup' && (
                        <p className="text-sm font-medium text-slate-500">
                            Sudah punya akun?
                            <button onClick={() => switchMode('login')} type="button"
                                className="ml-2 font-bold text-primary hover:underline transition-all">
                                Masuk di sini
                            </button>
                        </p>
                    )}
                    {mode === 'forgot' && (
                        <p className="text-sm font-medium text-slate-500">
                            Ingat password Anda?
                            <button onClick={() => switchMode('login')} type="button"
                                className="ml-2 font-bold text-primary hover:underline transition-all">
                                Kembali masuk
                            </button>
                        </p>
                    )}
                    {mode === 'recovery' && (
                        <p className="text-xs font-medium text-slate-500">
                            <span className="material-symbols-outlined text-xs align-middle mr-1">info</span>
                            Sesi pemulihan aktif. Silakan atur password baru Anda.
                        </p>
                    )}
                </div>
            </div>
        </div>
    );
}
