import { useState, useEffect } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Login() {
    const { signIn, signUp, resetPassword, updatePassword, isRecoveryMode, setIsRecoveryMode, isUsernameAvailable, signInWithGoogle } = useAuth();
    const { addToast } = useToast();
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot' | 'recovery'
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [captchaToken, setCaptchaToken] = useState();
    const [captchaKey, setCaptchaKey] = useState(() => Date.now());
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
                if (!captchaToken) throw new Error('Silakan selesaikan CAPTCHA sebelum masuk.');
                const { error } = await signIn(email, password, captchaToken);
                if (error) throw error;
            } else if (mode === 'signup') {
                // validate username
                if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
                    throw new Error('Username harus 3-20 karakter (huruf, angka, atau _)');
                }
                // check availability if possible
                const available = await isUsernameAvailable(username);
                if (available === false) {
                    throw new Error('Username sudah digunakan');
                }
                if (available === null) {
                    addToast('Tidak dapat memeriksa ketersediaan username, melanjutkan pendaftaran.', 'info');
                }
                if (!captchaToken) throw new Error('Silakan selesaikan CAPTCHA sebelum mendaftar.');
                const { error } = await signUp(email, password, username, captchaToken);
                if (error) throw error;
                setMessage('Pendaftaran berhasil! Silakan periksa email Anda untuk konfirmasi pendaftaran (cek dibagian spam apabila tidak muncul)');
            } else if (mode === 'forgot') {
                if (!captchaToken) throw new Error('Silakan selesaikan CAPTCHA terlebih dahulu.');
                const { error } = await resetPassword(email, captchaToken);
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
        setUsername('');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        setCaptchaToken(undefined);
        setCaptchaKey(Date.now());
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
                                    {mode === 'signup' && (
                                        <div className="space-y-1.5">
                                            <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Username</label>
                                            <input value={username} onChange={(e) => setUsername(e.target.value)} required={mode === 'signup'}
                                                className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                                placeholder="username" />
                                        </div>
                                    )}
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

                        {(mode === 'login' || mode === 'signup' || mode === 'forgot') && (
                            <div className="pt-2 w-full flex justify-center">
                                <Turnstile
                                    key={captchaKey}
                                    siteKey={import.meta.env.VITE_TURNSTILE_SITE_KEY}
                                    onSuccess={(token) => setCaptchaToken(token)}
                                    onExpire={() => { setCaptchaToken(undefined); setCaptchaKey(Date.now()); }}
                                    onError={() => { setCaptchaToken(undefined); setCaptchaKey(Date.now()); }}
                                />
                            </div>
                        )}

                        <button type="submit" disabled={loading}
                            className="w-full py-3.5 px-4 bg-primary hover:bg-blue-600 text-white font-bold rounded-xl transition-all shadow-lg shadow-primary/20 disabled:opacity-70 disabled:cursor-not-allowed">
                            {loading ? <span className="material-symbols-outlined animate-spin align-middle mr-2">progress_activity</span> : null}
                            {mode === 'login' && 'Masuk'}
                            {mode === 'signup' && 'Daftar Akun'}
                            {mode === 'forgot' && 'Kirim Link Reset'}
                            {mode === 'recovery' && 'Simpan Password Baru'}
                        </button>

                        {(mode === 'login' || mode === 'signup') && (
                            <>
                                <div className="relative flex items-center">
                                    <div className="grow border-t border-slate-200 dark:border-slate-700" />
                                    <span className="mx-3 text-[11px] font-bold uppercase text-slate-400 tracking-wider">atau</span>
                                    <div className="grow border-t border-slate-200 dark:border-slate-700" />
                                </div>
                                <button
                                    type="button"
                                    onClick={async () => {
                                        setLoading(true);
                                        const { error } = await signInWithGoogle();
                                        if (error) { setError(error.message); setLoading(false); }
                                    }}
                                    disabled={loading}
                                    className="w-full flex items-center justify-center gap-3 py-3 px-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm font-bold text-slate-700 dark:text-slate-200 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all shadow-sm disabled:opacity-70 disabled:cursor-not-allowed"
                                >
                                    <svg className="size-5" viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">
                                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                                    </svg>
                                    Lanjutkan dengan Google
                                </button>
                            </>
                        )}
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
