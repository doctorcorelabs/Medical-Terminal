import { useState } from 'react';
import { useTheme } from '../context/ThemeContext';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';

export default function Settings() {
    const { isDark, toggleTheme } = useTheme();
    const { user, updateProfile, isUsernameAvailable } = useAuth();
    const [workerUrl, setWorkerUrl] = useState(() => localStorage.getItem('ai_worker_url') || '');
    const [saved, setSaved] = useState(false);
    const [username, setUsername] = useState(() => user?.user_metadata?.username || '');
    const [savedUser, setSavedUser] = useState(false);
    const { addToast } = useToast();

    const saveWorkerUrl = () => {
        localStorage.setItem('ai_worker_url', workerUrl);
        setSaved(true);
        setTimeout(() => setSaved(false), 2000);
    };

    const saveUsername = async () => {
        // validation: 3-20 chars, alphanumeric + underscore
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            addToast('Username harus 3-20 karakter (huruf, angka, atau _)', 'error');
            return;
        }
        // availability check if possible
        const available = await isUsernameAvailable(username);
        if (available === false) {
            addToast('Username sudah digunakan', 'error');
            return;
        }
        if (available === null) {
            addToast('Tidak dapat memeriksa ketersediaan username, menyimpan tanpa verifikasi.', 'info');
        }
        try {
            const { error } = await updateProfile({ username });
            if (error) throw error;
            setSavedUser(true);
            addToast('Username tersimpan', 'success');
            setTimeout(() => setSavedUser(false), 2000);
        } catch (err) {
            addToast(err.message || 'Gagal menyimpan username', 'error');
        }
    };

    const exportData = () => {
        const data = localStorage.getItem('medterminal_patients') || '[]';
        const blob = new Blob([data], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = `medterminal_backup_${new Date().toISOString().split('T')[0]}.json`; a.click();
        URL.revokeObjectURL(url);
    };

    const importData = (e) => {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                JSON.parse(ev.target.result);
                localStorage.setItem('medterminal_patients', ev.target.result);
                window.location.reload();
            } catch { addToast('File JSON tidak valid', 'error'); }
        };
        reader.readAsText(file);
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 pb-20 lg:pb-8 max-w-3xl md:max-w-4xl animate-[fadeIn_0.3s_ease-out]">
            <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Pengaturan</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Konfigurasi aplikasi dan manajemen data.</p>
            </div>

            {/* Tampilan */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Tampilan</h3>
                </div>
                <div className="p-5 lg:p-6">
                    <div className="flex items-center justify-between gap-4">
                        <div className="min-w-0">
                            <p className="font-semibold text-sm">Mode Gelap</p>
                            <p className="text-xs text-slate-500 mt-0.5">Ganti antara tema terang dan gelap.</p>
                        </div>
                        <button onClick={toggleTheme} className={`relative w-12 h-7 rounded-full transition-colors shrink-0 ${isDark ? 'bg-primary' : 'bg-slate-300'}`}>
                            <span className={`absolute top-0.5 left-0.5 w-6 h-6 rounded-full bg-white shadow transition-transform ${isDark ? 'translate-x-5' : ''}`} />
                        </button>
                    </div>
                </div>
            </div>

            {/* Akun */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Akun</h3>
                </div>
                <div className="p-5 lg:p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-2">Username</label>
                        <p className="text-xs text-slate-500 mb-2">Nama pengguna yang akan ditampilkan di sidebar. Jika kosong, email akan digunakan.</p>
                        <div className="flex gap-2">
                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="username"
                                className="flex-1 min-w-0 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm" />
                            <button onClick={saveUsername} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors shrink-0">
                                {savedUser ? '✓ Tersimpan' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Konfigurasi AI */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Konfigurasi AI</h3>
                </div>
                <div className="p-5 lg:p-6 space-y-4">
                    <div>
                        <label className="block text-sm font-semibold mb-2">URL Cloudflare Worker</label>
                        <p className="text-xs text-slate-500 mb-2">Masukkan URL worker yang sudah di-deploy untuk permintaan AI. Kosongkan untuk memanggil OpenRouter langsung.</p>
                        <div className="flex gap-2">
                            <input type="url" value={workerUrl} onChange={e => setWorkerUrl(e.target.value)} placeholder="https://worker-anda.workers.dev"
                                className="flex-1 min-w-0 rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm" />
                            <button onClick={saveWorkerUrl} className="px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors shrink-0">
                                {saved ? '✓ Tersimpan' : 'Simpan'}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {/* Manajemen Data */}
            <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                    <h3 className="font-bold text-sm uppercase tracking-wider">Manajemen Data</h3>
                </div>
                <div className="p-5 lg:p-6 space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3">
                        <button onClick={exportData}
                            className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
                            <span className="material-symbols-outlined text-lg">download</span>Ekspor JSON
                        </button>
                        <label className="flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-bold hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors cursor-pointer border border-slate-200 dark:border-slate-700">
                            <span className="material-symbols-outlined text-lg">upload</span>Impor JSON
                            <input type="file" accept=".json" onChange={importData} className="hidden" />
                        </label>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                        <button onClick={() => { if (confirm('Apakah Anda yakin? Semua data akan dihapus.')) { localStorage.removeItem('medterminal_patients'); window.location.reload(); } }}
                            className="flex items-center gap-2 text-red-500 text-sm font-semibold hover:underline">
                            <span className="material-symbols-outlined text-lg">delete_forever</span>Hapus Semua Data
                        </button>
                    </div>
                </div>
            </div>

            {/* Info */}
            <div className="bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 p-5 lg:p-6">
                <h4 className="font-bold text-primary mb-2 flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-lg">info</span>Tentang MedxTerminal
                </h4>
                <div className="text-sm text-slate-600 dark:text-slate-400 space-y-1">
                    <p>Versi: 1.0.0-MVP (localStorage)</p>
                    <p>Mesin AI: OpenRouter (Gemini 2.5 Flash)</p>
                    <p>Data disimpan secara lokal di peramban Anda.</p>
                </div>
            </div>
        </div>
    );
}
