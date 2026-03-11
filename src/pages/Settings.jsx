import { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { deleteAllPatientsData, syncToSupabase, getAllStases, addStase, syncStasesToSupabase } from '../services/dataService';
import StaseMappingModal from '../components/StaseMappingModal';

export default function Settings() {
    const { user, updateProfile, isUsernameAvailable } = useAuth();
    const [workerUrl, setWorkerUrl] = useState(() => localStorage.getItem('ai_worker_url') || '');
    const [saved, setSaved] = useState(false);
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
        <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 pb-20 lg:pb-8 max-w-3xl md:max-w-4xl animate-[fadeIn_0.3s_ease-out]">
            <div>
                <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Pengaturan</h1>
                <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Konfigurasi aplikasi dan manajemen data.</p>
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
                        <label className={`flex-1 flex items-center justify-center gap-2 px-4 py-3 bg-slate-100 dark:bg-slate-800 rounded-lg text-sm font-bold transition-colors border border-slate-200 dark:border-slate-700 ${importing ? 'opacity-50 cursor-not-allowed' : 'hover:bg-slate-200 dark:hover:bg-slate-700 cursor-pointer'}`}>
                            <span className="material-symbols-outlined text-lg">{importing ? 'sync' : 'upload'}</span>{importing ? 'Mengimpor…' : 'Impor JSON'}
                            <input type="file" accept=".json" onChange={importData} disabled={importing} className="hidden" />
                        </label>
                    </div>
                    <div className="border-t border-slate-100 dark:border-slate-800 pt-4">
                        <button onClick={() => setShowConfirm(true)}
                            className="flex items-center gap-2 text-red-500 text-sm font-semibold hover:underline">
                            <span className="material-symbols-outlined text-lg">delete_forever</span>Hapus Semua Data
                        </button>
                    </div>
                </div>
            </div>

            {/* Stase mapping modal — shown after a JSON file is loaded */}
            <StaseMappingModal
                open={!!pendingImport}
                importedPatients={pendingImport?.patients ?? []}
                localStases={getAllStases()}
                onApply={applyImport}
                onCancel={() => setPendingImport(null)}
            />

            {/* Step 1: typed confirmation */}
            <ConfirmDialog
                open={showConfirm}
                title="Hapus Semua Data"
                message="Ketik frasa di bawah untuk melanjutkan. Tindakan ini tidak dapat dibatalkan."
                requireTypedConfirmation="Hapus Semua Data"
                confirmLabel="Lanjutkan"
                cancelLabel="Batal"
                onConfirm={handleConfirmTyped}
                onCancel={handleCancelDelete}
            />

            {/* Step 2: final irreversible warning */}
            <ConfirmDialog
                open={showFinalConfirm}
                danger
                title="Peringatan Terakhir"
                message={`Data yang dihapus akan hilang permanen dari database${user ? ' dan server' : ''}. Tindakan ini tidak dapat dikembalikan.`}
                confirmLabel={deleting ? 'Menghapus…' : 'Ya, Hapus Permanen'}
                cancelLabel="Tidak, Batalkan"
                onConfirm={handleFinalDelete}
                onCancel={handleCancelDelete}
            />

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
