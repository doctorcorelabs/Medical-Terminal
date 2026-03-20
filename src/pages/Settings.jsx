import { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { deleteAllPatientsData, deleteAllStasesData, deleteAllSchedulesData, syncToSupabase, getAllStases, syncStasesToSupabase } from '../services/dataService';
import StaseMappingModal from '../components/StaseMappingModal';
import ConflictManager from '../components/ConflictManager';

export default function Settings() {
    const { user, updateProfile, isUsernameAvailable, isAdmin, isSpecialist } = useAuth();
    // ... rest of state ...

    // Use effect to handle hash scrolling
    useEffect(() => {
        if (window.location.hash === '#data-conflicts') {
            const element = document.getElementById('data-conflicts');
            if (element) {
                element.scrollIntoView({ behavior: 'smooth' });
            }
        }
    }, []);
    const [username, setUsername] = useState(() => user?.user_metadata?.username || '');
    const [savedUser, setSavedUser] = useState(false);
    const [showConfirm, setShowConfirm] = useState(false);
    const [showFinalConfirm, setShowFinalConfirm] = useState(false);
    const [deleting, setDeleting] = useState(false);
    const [importing, setImporting] = useState(false);
    const [pendingImport, setPendingImport] = useState(null); // { patients: [] } while mapping modal is open
    const { addToast } = useToast();

    // Step 1: user typed the phrase → advance to final warning
    const handleConfirmTyped = () => {
        setShowConfirm(false);
        setShowFinalConfirm(true);
    };

    // Step 2: user confirmed final warning → delete everywhere
    const handleFinalDelete = async () => {
        setDeleting(true);
        try {
            await deleteAllPatientsData(user?.id);
            await deleteAllStasesData(user?.id);
            await deleteAllSchedulesData(user?.id);
            addToast('Semua data telah dihapus permanen', 'success');
            setTimeout(() => window.location.reload(), 300);
        } catch (err) {
            addToast('Gagal menghapus data dari server: ' + (err.message || ''), 'error');
            setDeleting(false);
            setShowFinalConfirm(false);
        }
    };

    const handleCancelDelete = () => {
        setShowConfirm(false);
        setShowFinalConfirm(false);
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
        // Reset input so the same file can be re-selected after cancel
        e.target.value = '';
        const reader = new FileReader();
        reader.onload = (ev) => {
            try {
                const imported = JSON.parse(ev.target.result);
                if (!Array.isArray(imported)) throw new Error('Bukan array');
                // Ensure every patient has an id
                const normalized = imported.map(p => ({ ...p, id: p.id || crypto.randomUUID() }));
                // Open mapping modal (it auto-skips if no unknown stases)
                setPendingImport({ patients: normalized });
            } catch { addToast('File JSON tidak valid atau format tidak didukung', 'error'); }
        };
        reader.readAsText(file);
    };

    const applyImport = async (mappedPatients, newStases) => {
        setPendingImport(null);
        setImporting(true);
        try {
            // 1. Create new stases locally first
            if (newStases.length > 0) {
                const current = getAllStases();
                const merged = [...current, ...newStases];
                localStorage.setItem('medterminal_stases', JSON.stringify(merged));
            }
            // 2. Merge patients (deduplicated by id)
            const existing = JSON.parse(localStorage.getItem('medterminal_patients') || '[]');
            const existingIds = new Set(existing.map(p => p.id));
            const incoming = mappedPatients.filter(p => !existingIds.has(p.id));
            const mergedPatients = [...existing, ...incoming];
            localStorage.setItem('medterminal_patients', JSON.stringify(mergedPatients));
            addToast(`${incoming.length} pasien berhasil diimpor.`, 'success');
            // 3. Sync to Supabase
            if (user?.id) {
                addToast('Menyinkronkan data ke server…', 'info');
                try {
                    if (newStases.length > 0) await syncStasesToSupabase(user.id);
                    await syncToSupabase(user.id);
                } catch {
                    addToast('Data tersimpan lokal, tapi gagal sinkron ke server.', 'error');
                }
            }
        } finally {
            window.location.reload();
        }
    };

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 lg:p-10 max-w-[1400px] mx-auto animate-[fadeIn_0.3s_ease-out]">
                <div className="mb-6 lg:mb-10">
                    <h1 className="text-2xl md:text-4xl font-black text-slate-900 dark:text-white tracking-tight">Pengaturan</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm md:text-base mt-1">Konfigurasi aplikasi dan manajemen data.</p>
                </div>

                <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-10">
                    {/* Left Column: Settings Content */}
                    <div className="lg:col-span-8 space-y-6 lg:space-y-8">
                        {/* Akun */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-5 lg:px-8 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">account_circle</span>
                                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Profil Akun</h3>
                                </div>
                            </div>
                            <div className="p-5 lg:p-8 space-y-6">
                                {/* Role badge */}
                                <div className="flex items-center justify-between p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <div className="flex items-center gap-3">
                                        <div className="size-10 rounded-full bg-primary/10 flex items-center justify-center">
                                            <span className="material-symbols-outlined text-primary">verified_user</span>
                                        </div>
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none mb-1">Status Keanggotaan</p>
                                            <p className="font-bold text-slate-700 dark:text-slate-200">
                                                {isAdmin ? 'Administrator' : isSpecialist ? 'Specialist Member' : 'Pengguna Standar (Intern)'}
                                            </p>
                                        </div>
                                    </div>
                                    {isAdmin ? (
                                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-violet-100 dark:bg-violet-900/30 text-violet-700 dark:text-violet-400 text-xs font-black uppercase tracking-wider">
                                            <span className="material-symbols-outlined text-[16px]">admin_panel_settings</span>
                                            Admin
                                        </span>
                                    ) : isSpecialist ? (
                                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-primary/10 text-primary text-xs font-black uppercase tracking-wider shadow-sm border border-primary/20">
                                            <span className="material-symbols-outlined text-[16px]">workspace_premium</span>
                                            Specialist
                                        </span>
                                    ) : (
                                        <span className="inline-flex items-center gap-1.5 px-4 py-1.5 rounded-full bg-slate-100 dark:bg-slate-700 text-slate-600 dark:text-slate-400 text-xs font-black uppercase tracking-wider">
                                            <span className="material-symbols-outlined text-[16px]">person</span>
                                            Intern
                                        </span>
                                    )}
                                </div>

                                <div>
                                    <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest mb-2 ml-1">Username</label>
                                    <p className="text-xs text-slate-500 mb-4 ml-1">Nama pengguna yang akan ditampilkan di sidebar. Jika kosong, email akan digunakan.</p>
                                    <div className="flex flex-col sm:flex-row gap-3">
                                        <div className="relative flex-1">
                                            <span className="absolute left-3 top-1/2 -translate-y-1/2 material-symbols-outlined text-slate-400 text-[20px]">person</span>
                                            <input type="text" value={username} onChange={e => setUsername(e.target.value)} placeholder="Masukkan username"
                                                className="w-full pl-10 pr-4 py-3 rounded-xl border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm font-bold transition-all" />
                                        </div>
                                        <button onClick={saveUsername} className="px-8 py-3 bg-primary text-white rounded-xl text-sm font-black hover:bg-blue-600 transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-95 shrink-0 flex items-center justify-center gap-2">
                                            {savedUser ? (
                                                <><span className="material-symbols-outlined text-lg">check_circle</span> Tersimpan</>
                                            ) : (
                                                <><span className="material-symbols-outlined text-lg">save</span> Simpan Perubahan</>
                                            )}
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>

                        {/* Manajemen Data */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-5 lg:px-8 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">database</span>
                                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Manajemen Data</h3>
                                </div>
                            </div>
                            <div className="p-5 lg:p-8 space-y-8">
                                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 md:gap-4">
                                    <button onClick={exportData}
                                        className="flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl text-sm font-black text-slate-700 dark:text-slate-300 hover:bg-white dark:hover:bg-slate-800 transition-all border border-slate-100 dark:border-slate-700/50 hover:border-primary/30 group">
                                        <div className="size-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">download</span>
                                        </div>
                                        <span>Ekspor JSON</span>
                                    </button>

                                    <label className={`flex flex-col items-center justify-center gap-3 p-6 bg-slate-50 dark:bg-slate-800/40 rounded-2xl text-sm font-black text-slate-700 dark:text-slate-300 transition-all border border-slate-100 dark:border-slate-700/50 hover:border-primary/30 group ${importing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-white dark:hover:bg-slate-800 cursor-pointer'}`}>
                                        <div className="size-12 rounded-xl bg-white dark:bg-slate-800 flex items-center justify-center text-primary shadow-sm group-hover:scale-110 transition-transform">
                                            <span className="material-symbols-outlined text-2xl">{importing ? 'sync' : 'upload'}</span>
                                        </div>
                                        <span>{importing ? 'Mengimpor…' : 'Impor JSON'}</span>
                                        <input type="file" accept=".json" onChange={importData} disabled={importing} className="hidden" />
                                    </label>
                                </div>

                                <div className="border-t border-slate-100 dark:border-slate-800 pt-6">
                                    <div className="p-4 bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/20 flex flex-col sm:flex-row items-center justify-between gap-4">
                                        <div className="flex items-center gap-3">
                                            <div className="size-10 rounded-full bg-red-100 dark:bg-red-900/30 flex items-center justify-center text-red-500">
                                                <span className="material-symbols-outlined">warning</span>
                                            </div>
                                            <div>
                                                <p className="text-sm font-bold text-slate-900 dark:text-white">Hapus Semua Data</p>
                                                <p className="text-xs text-red-600/70 dark:text-red-400">Tindakan ini permanen dan tidak dapat dibatalkan.</p>
                                            </div>
                                        </div>
                                        <button onClick={() => setShowConfirm(true)}
                                            className="px-6 py-2.5 bg-red-500 text-white text-xs font-black uppercase tracking-wider rounded-xl hover:bg-red-600 transition-all active:scale-95 shadow-lg shadow-red-500/20">
                                            Bersihkan Semua
                                        </button>
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Right Column: Info & About */}
                    <div className="lg:col-span-4 space-y-6">
                        <div className="bg-primary/5 dark:bg-primary/10 rounded-2xl border border-primary/20 p-6 lg:p-8 relative overflow-hidden">
                            <div className="absolute -right-4 -top-4 size-24 bg-primary/10 rounded-full blur-2xl" />
                            <div className="relative">
                                <div className="flex items-center gap-3 mb-6">
                                    <div className="size-12 rounded-2xl bg-primary text-white flex items-center justify-center shadow-lg shadow-primary/30">
                                        <span className="material-symbols-outlined">info</span>
                                    </div>
                                    <div>
                                        <h4 className="font-black text-slate-900 dark:text-white uppercase text-xs tracking-widest">Tentang</h4>
                                        <p className="text-primary font-bold text-sm">MedxTerminal</p>
                                    </div>
                                </div>
                                <div className="space-y-4">
                                    <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white dark:border-slate-700">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Versi Current</p>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">1.2.0-MVP (localStorage)</p>
                                    </div>
                                    <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white dark:border-slate-700">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mesin AI Aktif</p>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200">Gemini & ChatGPT</p>
                                    </div>
                                    <div className="p-4 bg-white/50 dark:bg-slate-800/50 rounded-xl border border-white dark:border-slate-700">
                                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Mode Penyimpanan</p>
                                        <p className="text-sm font-bold text-slate-700 dark:text-slate-200 flex items-center gap-2">
                                            <span className="size-2 rounded-full bg-green-500 animate-pulse" />
                                            Lokal & Terenkripsi
                                        </p>
                                    </div>
                                </div>
                                <div className="mt-8 pt-6 border-t border-primary/10">
                                    <p className="text-[11px] text-slate-500 text-center italic">"Efisiensi dalam setiap catatan medis."</p>
                                </div>
                            </div>
                        </div>

                        {/* Extra Tip or Card for Balance */}
                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl border border-dashed border-slate-200 dark:border-slate-700 p-6">
                            <h5 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-3">Tips Keamanan</h5>
                            <p className="text-xs text-slate-500 leading-relaxed">Selalu lakukan ekspor JSON secara rutin untuk mencadangkan data pasien Anda secara offline dan aman.</p>
                        </div>
                    </div>
                </div>

                <div className="mt-6 lg:mt-10">
                    <ConflictManager />
                </div>
            </div>
        </div>
    );
}
