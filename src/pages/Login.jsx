import { useState, useEffect, useCallback } from 'react';
import { Turnstile } from '@marsidev/react-turnstile';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

const TURNSTILE_TELEMETRY_KEY = 'medterminal_turnstile_events';

export default function Login() {
    const {
        signIn,
        signUp,
        resetPassword,
        updatePassword,
        isRecoveryMode,
        setIsRecoveryMode,
        isUsernameAvailable,
        signInWithGoogle,
        authDenial,
        clearAuthDenial,
    } = useAuth();
    const { addToast } = useToast();
    const [mode, setMode] = useState('login'); // 'login' | 'signup' | 'forgot' | 'recovery'
    const [email, setEmail] = useState('');
    const [username, setUsername] = useState('');
    const [password, setPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');
    const [captchaToken, setCaptchaToken] = useState();
    const [captchaKey, setCaptchaKey] = useState(0);
    const [isCaptchaReady, setIsCaptchaReady] = useState(false);
    const [captchaLoadError, setCaptchaLoadError] = useState('');
    const [loading, setLoading] = useState(false);
    const [error, setError] = useState('');
    const [message, setMessage] = useState('');
    const turnstileSiteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY;
    const requiresCaptcha = mode === 'login' || mode === 'signup' || mode === 'forgot';

    const logCaptchaTelemetry = useCallback((eventName, detail = {}) => {
        const payload = {
            eventName,
            mode,
            timestamp: new Date().toISOString(),
            online: typeof navigator !== 'undefined' ? navigator.onLine : undefined,
            userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : undefined,
            siteKeyPresent: Boolean(turnstileSiteKey),
            ...detail,
        };

        try {
            const raw = localStorage.getItem(TURNSTILE_TELEMETRY_KEY);
            const parsed = raw ? JSON.parse(raw) : [];
            const items = Array.isArray(parsed) ? parsed : [];
            const next = [...items.slice(-49), payload];
            localStorage.setItem(TURNSTILE_TELEMETRY_KEY, JSON.stringify(next));
        } catch (_err) {
            // non-fatal telemetry failure
        }

        if (/error|timeout|unsupported|expired/.test(eventName)) {
            console.warn('[Turnstile]', payload);
        } else {
            console.info('[Turnstile]', payload);
        }
    }, [mode, turnstileSiteKey]);

    const remountCaptcha = useCallback((reason) => {
        setCaptchaToken(undefined);
        setIsCaptchaReady(false);
        setCaptchaLoadError('');
        setCaptchaKey((prev) => prev + 1);
        if (reason) logCaptchaTelemetry('widget_remount', { reason });
    }, [logCaptchaTelemetry]);

    useEffect(() => {
        if (isRecoveryMode) setMode('recovery');
    }, [isRecoveryMode]);

    useEffect(() => {
        if (!requiresCaptcha || !turnstileSiteKey || isCaptchaReady) return;

        const timer = window.setTimeout(() => {
            setCaptchaLoadError((prev) => prev || 'Captcha belum termuat. Silakan muat ulang captcha.');
            logCaptchaTelemetry('widget_load_timeout');
        }, 12000);

        return () => window.clearTimeout(timer);
    }, [requiresCaptcha, turnstileSiteKey, isCaptchaReady, captchaKey, logCaptchaTelemetry]);

    // Remove automated remount on focus/visibility as it can be too aggressive and clears valid tokens.
    // Cloudflare Turnstile's own expiration is already handled by onExpire callback.

    const handleSubmit = async (e) => {
        e.preventDefault();
        setLoading(true);
        setError('');
        setMessage('');

        try {
            if (requiresCaptcha && !turnstileSiteKey) {
                throw new Error('Konfigurasi CAPTCHA belum aktif. Hubungi admin aplikasi.');
            }
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
                if (newPassword.length < 8) throw new Error('Password minimal 8 karakter.');
                const { error } = await updatePassword(newPassword);
                if (error) throw error;
                setMessage('Password berhasil diperbarui! Anda akan diarahkan ke halaman login.');
                setIsRecoveryMode(false);
            }
        } catch (err) {
            setError(err.message || 'Terjadi kesalahan');
            // Reset captcha on form failure so the user gets a fresh challenge for the next attempt
            if (requiresCaptcha) {
                remountCaptcha('form_error');
            }
        } finally {
            setLoading(false);
        }
    };

    const switchMode = (newMode) => {
        clearAuthDenial();
        setMode(newMode);
        setError('');
        setMessage('');
        setEmail('');
        setUsername('');
        setPassword('');
        setNewPassword('');
        setConfirmPassword('');
        remountCaptcha('switch_mode');
    };

    const modeConfig = {
        login: { title: 'Masuk', subtitle: 'Masuk untuk melanjutkan ke terminal klinis Anda.', icon: 'login' },
        signup: { title: 'Daftar Akun', subtitle: 'Buat akun baru untuk mengakses MedxTerminal.', icon: 'person_add' },
        forgot: { title: 'Lupa Password', subtitle: 'Masukkan email Anda dan kami akan mengirim link untuk mereset password.', icon: 'lock_reset' },
        recovery: { title: 'Atur Password Baru', subtitle: 'Masukkan password baru Anda di bawah ini.', icon: 'lock_open' },
    };

    const cfg = modeConfig[mode];

    if (authDenial && mode !== 'recovery') {
        return (
            <div className="min-h-screen bg-slate-100 dark:bg-slate-950 flex items-center justify-center p-4">
                <div className="w-full max-w-xl rounded-3xl border border-red-200 dark:border-red-900/60 bg-white dark:bg-slate-900 shadow-2xl overflow-hidden">
                    <div className="bg-red-50 dark:bg-red-950/40 border-b border-red-200 dark:border-red-900/60 p-6">
                        <div className="inline-flex size-14 items-center justify-center rounded-2xl bg-red-100 dark:bg-red-900/60 text-red-600 dark:text-red-300 mb-3">
                            <span className="material-symbols-outlined text-3xl">gpp_maybe</span>
                        </div>
                        <h1 className="text-2xl font-black text-red-700 dark:text-red-300 tracking-tight">
                            {authDenial.title || 'Akses Ditolak'}
                        </h1>
                        <p className="mt-2 text-sm font-semibold text-red-700/90 dark:text-red-300/90">
                            {authDenial.type === 'ban'
                                ? 'Akun Anda tidak dapat masuk sampai status ban dicabut oleh admin.'
                                : 'Perangkat ini sedang tidak diizinkan untuk masuk ke akun ini.'}
                        </p>
                    </div>

                    <div className="p-6 space-y-4">
                        <div className="rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 p-4">
                            <p className="text-[11px] uppercase tracking-wider font-black text-slate-500 dark:text-slate-400">Alasan</p>
                            <p className="mt-2 text-sm font-bold text-slate-800 dark:text-slate-100 leading-relaxed">
                                {authDenial.message || 'Akun dibatasi oleh admin. Hubungi administrator.'}
                            </p>
                        </div>

                        <div className="flex flex-col sm:flex-row gap-3">
                            <button
                                type="button"
                                onClick={() => {
                                    clearAuthDenial();
                                    setError('');
                                    setMessage('');
                                    setMode('login');
                                }}
                                className="flex-1 py-3 px-4 rounded-xl bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 font-black hover:opacity-90 transition-opacity"
                            >
                                Kembali ke Login
                            </button>
                            <button
                                type="button"
                                onClick={() => {
                                    clearAuthDenial();
                                    switchMode('forgot');
                                }}
                                className="flex-1 py-3 px-4 rounded-xl border border-slate-300 dark:border-slate-600 text-slate-700 dark:text-slate-200 font-black hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                            >
                                Coba Reset Password
                            </button>
                        </div>

                        <p className="text-xs text-slate-500 dark:text-slate-400">
                            Jika Anda merasa ini tidak sesuai, hubungi administrator klinik untuk verifikasi akun.
                        </p>
                    </div>
                </div>
            </div>
        );
    }

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
                                    <input type="password" value={password} onChange={(e) => setPassword(e.target.value)} required minLength={8}
                                        className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                        placeholder="••••••••" />
                                </div>
                            )}

                            {/* New Password fields - shown for recovery */}
                            {mode === 'recovery' && (
                                <>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Password Baru</label>
                                        <input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} required minLength={8}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                            placeholder="Min. 8 karakter" />
                                    </div>
                                    <div className="space-y-1.5">
                                        <label className="text-[11px] font-black uppercase text-slate-400 tracking-wider">Konfirmasi Password</label>
                                        <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} required minLength={8}
                                            className="w-full px-4 py-3 bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl text-sm focus:ring-2 focus:ring-primary/20 focus:border-primary transition-all outline-none text-slate-900 dark:text-slate-100"
                                            placeholder="Ulangi password baru" />
                                    </div>
                                </>
                            )}
                        </div>

                        {requiresCaptcha && (
                            <div className="pt-2 w-full flex flex-col items-center gap-2">
                                {turnstileSiteKey ? (
                                    <Turnstile
                                        key={captchaKey}
                                        siteKey={turnstileSiteKey}
                                        onLoadScript={() => logCaptchaTelemetry('script_loaded')}
                                        onWidgetLoad={(widgetId) => {
                                            setIsCaptchaReady(true);
                                            setCaptchaLoadError('');
                                            logCaptchaTelemetry('widget_loaded', { widgetId });
                                        }}
                                        onSuccess={(token) => {
                                            setCaptchaToken(token);
                                            setCaptchaLoadError('');
                                            logCaptchaTelemetry('challenge_success', { tokenLength: token?.length || 0 });
                                        }}
                                        onExpire={() => {
                                            setCaptchaToken(undefined);
                                            logCaptchaTelemetry('token_expired');
                                            remountCaptcha('token_expired');
                                        }}
                                        onError={(errorCode) => {
                                            setCaptchaToken(undefined);
                                            setCaptchaLoadError('Captcha gagal diverifikasi. Silakan muat ulang captcha.');
                                            logCaptchaTelemetry('challenge_error', { errorCode });
                                        }}
                                        onTimeout={() => {
                                            setCaptchaToken(undefined);
                                            setCaptchaLoadError('Waktu verifikasi captcha habis. Silakan coba lagi.');
                                            logCaptchaTelemetry('challenge_timeout');
                                            remountCaptcha('challenge_timeout');
                                        }}
                                        onUnsupported={() => {
                                            setCaptchaToken(undefined);
                                            setCaptchaLoadError('Browser tidak didukung oleh captcha Turnstile.');
                                            logCaptchaTelemetry('unsupported_browser');
                                        }}
                                        scriptOptions={{
                                            onError: () => {
                                                setCaptchaLoadError('Script captcha gagal dimuat. Periksa koneksi atau pemblokir konten.');
                                                logCaptchaTelemetry('script_error');
                                            },
                                        }}
                                    />
                                ) : (
                                    <div className="w-full p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold text-center">
                                        CAPTCHA tidak aktif karena site key belum dikonfigurasi.
                                    </div>
                                )}

                                {captchaLoadError && (
                                    <div className="w-full max-w-90 p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 text-xs font-semibold text-center space-y-2">
                                        <p>{captchaLoadError}</p>
                                        <button
                                            type="button"
                                            onClick={() => remountCaptcha('manual_retry')}
                                            className="px-3 py-1.5 rounded-lg bg-amber-100 hover:bg-amber-200 transition-colors font-bold"
                                        >
                                            Muat Ulang CAPTCHA
                                        </button>
                                    </div>
                                )}
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
