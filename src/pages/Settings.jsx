import { useState, useEffect, useCallback, useMemo, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePatients } from '../context/PatientContext';
import { useStase } from '../context/StaseContext';
import { useToast } from '../context/ToastContext';
import ConfirmDialog from '../components/ConfirmDialog';
import { deleteAllPatientsData, deleteAllStasesData, deleteAllSchedulesData, syncToSupabase, getAllStases, syncStasesToSupabase, bulkSavePatients, bulkSaveStases, getAllSchedules, getAllPatients, upsertSchedulesBulk, syncSchedulesToSupabase, setScheduleStorageScope } from '../services/dataService';
import StaseMappingModal from '../components/StaseMappingModal';
import ConflictManager from '../components/ConflictManager';
import { supabase } from '../services/supabaseClient';
import { generateReceiptPDF } from '../services/receiptService';
import { parseBackupPayload, validateBackupPayload, buildBackupPayload } from '../utils/backupFormat';
import ImportWindowBox from '../components/ImportWindowBox';
import SyncQueueManager from '../components/SyncQueueManager';

const PDF_PREFS_LEGACY_KEY = 'medterminal_pdf_prefs';
const DEFAULT_PDF_PREFS = {
    includeSummary: true,
    includeVitals: true,
    includeSymptoms: true,
    includePhysical: true,
    includeLabs: true,
    includeMedicine: true,
    includeDaily: true,
    includeAiSummary: true,
    includeAiSoap: true,
    includeAiSymptoms: true,
    includeAiRadar: true,
    includeAiPhysical: true,
    includeAiLabs: true,
    includeAiMedicine: true,
    includeAiDaily: true
};

function getPdfPrefsStorageKey(userId) {
    return userId ? `${PDF_PREFS_LEGACY_KEY}_${userId}` : PDF_PREFS_LEGACY_KEY;
}

function parseStoredPdfPrefs(rawValue) {
    if (!rawValue) return null;
    try {
        const parsed = JSON.parse(rawValue);
        if (!parsed || typeof parsed !== 'object') return null;
        return parsed;
    } catch {
        return null;
    }
}

export default function Settings() {
    const { user, profile, updateProfile, isUsernameAvailable, isAdmin, isSpecialist } = useAuth();
    const { patients, canAddXPatients, refreshPatients } = usePatients();
    const { refreshStases } = useStase();
    const navigate = useNavigate();
    const { addToast } = useToast();

    // PDF Export Preferences State
    const [pdfPrefs, setPdfPrefs] = useState(DEFAULT_PDF_PREFS);
    const [savingPrefs, setSavingPrefs] = useState(false);

    useEffect(() => {
        if (!user?.id) {
            setPdfPrefs(DEFAULT_PDF_PREFS);
            return;
        }

        const metadataPrefs = user?.user_metadata?.pdf_export_prefs;
        const scopedKey = getPdfPrefsStorageKey(user.id);

        if (metadataPrefs && typeof metadataPrefs === 'object') {
            const merged = { ...DEFAULT_PDF_PREFS, ...metadataPrefs };
            setPdfPrefs(merged);
            localStorage.setItem(scopedKey, JSON.stringify(merged));
            localStorage.removeItem(PDF_PREFS_LEGACY_KEY);
            return;
        }

        const scopedPrefs = parseStoredPdfPrefs(localStorage.getItem(scopedKey));
        if (scopedPrefs) {
            setPdfPrefs({ ...DEFAULT_PDF_PREFS, ...scopedPrefs });
            localStorage.removeItem(PDF_PREFS_LEGACY_KEY);
            return;
        }

        // One-time migration from legacy global key into active user scope.
        const legacyPrefs = parseStoredPdfPrefs(localStorage.getItem(PDF_PREFS_LEGACY_KEY));
        if (legacyPrefs) {
            const migrated = { ...DEFAULT_PDF_PREFS, ...legacyPrefs };
            localStorage.setItem(scopedKey, JSON.stringify(migrated));
            localStorage.removeItem(PDF_PREFS_LEGACY_KEY);
            setPdfPrefs(migrated);
            return;
        }

        setPdfPrefs(DEFAULT_PDF_PREFS);
    }, [user?.id, user?.user_metadata?.pdf_export_prefs]);

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
    const isApplyingImportRef = useRef(false);
    const [pendingImport, setPendingImport] = useState(null); // { patients: [], stases: [], schedules: [], version }
    const [importDialog, setImportDialog] = useState({
        open: false,
        variant: 'info',
        title: '',
        message: '',
        highlights: [],
        primaryLabel: 'OK',
        secondaryLabel: null,
        onPrimary: null,
    });

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

    const _handleCancelDelete = () => {
        setShowConfirm(false);
        setShowFinalConfirm(false);
    };

    const saveUsername = async () => {
        // ... (existing validation)
        if (!/^[a-zA-Z0-9_]{3,20}$/.test(username)) {
            addToast('Username harus 3-20 karakter (huruf, angka, atau _)', 'error');
            return;
        }
        const available = await isUsernameAvailable(username);
        if (available === false) {
            addToast('Username sudah digunakan', 'error');
            return;
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

    const savePdfPrefs = async () => {
        if (!user?.id) {
            addToast('Sesi user tidak ditemukan. Silakan login ulang.', 'error');
            return;
        }
        setSavingPrefs(true);
        try {
            const { error } = await updateProfile({ pdf_export_prefs: pdfPrefs });
            if (error) throw error;
            localStorage.setItem(getPdfPrefsStorageKey(user.id), JSON.stringify(pdfPrefs));
            localStorage.removeItem(PDF_PREFS_LEGACY_KEY);
            addToast('Pengaturan PDF berhasil disimpan', 'success');
        } catch (err) {
            addToast(err.message || 'Gagal menyimpan pengaturan PDF', 'error');
        } finally {
            setSavingPrefs(false);
        }
    };

    const togglePdfPref = (key) => {
        setPdfPrefs(prev => ({ ...prev, [key]: !prev[key] }));
    };

    const getTs = useCallback((item) => {
        const raw = item?.updatedAt || item?.updated_at || item?.createdAt || item?.created_at || 0;
        const ts = new Date(raw).getTime();
        return Number.isFinite(ts) ? ts : 0;
    }, []);

    const patientContentKey = (patient) => {
        if (!patient || typeof patient !== 'object') return '';
        const clone = { ...patient };
        delete clone.updatedAt;
        delete clone.updated_at;
        delete clone.createdAt;
        delete clone.created_at;
        return JSON.stringify(clone);
    };

    const mergeStasesById = useCallback((base, incoming) => {
        const map = new Map((base || []).filter(Boolean).map(s => [s.id, s]));
        for (const item of (incoming || [])) {
            if (!item || typeof item !== 'object') continue;
            const id = item.id || crypto.randomUUID();
            const prev = map.get(id);
            if (!prev) {
                map.set(id, {
                    ...item,
                    id,
                    createdAt: item.createdAt || item.created_at || new Date().toISOString(),
                });
                continue;
            }
            const shouldUseIncoming = getTs(item) > getTs(prev);
            map.set(id, shouldUseIncoming ? { ...prev, ...item, id } : prev);
        }
        return Array.from(map.values());
    }, [getTs]);

    const localStasesForImport = useMemo(() => {
        if (!pendingImport?.stases?.length) return getAllStases();
        return mergeStasesById(getAllStases(), pendingImport.stases);
    }, [pendingImport, mergeStasesById]);

    const exportData = () => {
        setScheduleStorageScope(user?.id || null);
        const payload = buildBackupPayload({
            patients: getAllPatients(),
            stases: getAllStases(),
            schedules: getAllSchedules(),
            userId: user?.id || null,
        });
        const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' });
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
                const parsed = parseBackupPayload(imported);
                const validated = validateBackupPayload(parsed);
                const skippedInfo = [];

                if (validated.totalInvalid > 0) {
                    if (validated.invalid.patients > 0) skippedInfo.push(`${validated.invalid.patients} pasien invalid dilewati`);
                    if (validated.invalid.stases > 0) skippedInfo.push(`${validated.invalid.stases} stase invalid dilewati`);
                    if (validated.invalid.schedules > 0) skippedInfo.push(`${validated.invalid.schedules} jadwal invalid dilewati`);
                }

                if (
                    validated.patients.length === 0 &&
                    validated.stases.length === 0 &&
                    validated.schedules.length === 0
                ) {
                    throw new Error('Tidak ada item valid di file backup.');
                }

                // Ensure every patient has an id
                const normalizedPatients = validated.patients.map(p => ({ ...p, id: p.id || crypto.randomUUID() }));
                const normalizedStases = validated.stases.map(s => ({
                    ...s,
                    id: s.id || crypto.randomUUID(),
                    createdAt: s.createdAt || s.created_at || new Date().toISOString(),
                }));
                const normalizedSchedules = validated.schedules.map(sc => ({
                    ...sc,
                    id: sc.id || crypto.randomUUID(),
                }));
                // Open mapping modal (it auto-skips if no unknown stases)
                setPendingImport({
                    version: validated.version,
                    patients: normalizedPatients,
                    stases: normalizedStases,
                    schedules: normalizedSchedules,
                    skippedInfo,
                });
            } catch (err) {
                setImportDialog({
                    open: true,
                    variant: 'error',
                    title: 'Impor JSON gagal',
                    message: 'File tidak bisa diproses. Pastikan format backup sesuai.',
                    highlights: [err?.message || 'Format JSON tidak valid atau tidak didukung.'],
                    primaryLabel: 'Mengerti',
                    secondaryLabel: null,
                    onPrimary: null,
                });
            }
        };
        reader.readAsText(file);
    };

    const applyImport = async (mappedPatients, newStases) => {
        if (isApplyingImportRef.current) return;
        isApplyingImportRef.current = true;
        const importBundle = pendingImport;
        setPendingImport(null);
        setImporting(true);
        try {
            const importedStases = importBundle?.stases || [];
            const importedSchedules = importBundle?.schedules || [];

            // 1. Merge stases from local + backup + mapping-created stases
            const mergedStases = mergeStasesById(getAllStases(), [...importedStases, ...newStases]);
            if (mergedStases.length > 0) {
                bulkSaveStases(mergedStases);
            }
            // 2. Smart Merge patients
            const existing = getAllPatients();
            const existingMap = new Map(existing.map(p => [p.id, p]));
            
            const incoming = [];
            const updated = [];
            const skipped = [];
            let contentConflictUpdatedCount = 0;

            for (const p of mappedPatients) {
                const local = existingMap.get(p.id);
                if (!local) {
                    // Stamp with current time so merge algorithm won't delete it
                    incoming.push({ ...p, updatedAt: new Date().toISOString() });
                } else {
                    // Compare timestamps to decide whether to update
                    const localTs = getTs(local);
                    const importTs = getTs(p);
                    
                    if (importTs > localTs) {
                        // Stamp with current time so merge algorithm keeps the updated version
                        updated.push({ ...p, updatedAt: new Date().toISOString() });
                    } else if (importTs === localTs && patientContentKey(local) !== patientContentKey(p)) {
                        // If timestamps tie but content differs (manual edited JSON), accept import.
                        updated.push({ ...p, updatedAt: new Date().toISOString() });
                        contentConflictUpdatedCount += 1;
                    } else {
                        skipped.push(p);
                    }
                }
            }

            if (incoming.length > 0 && !canAddXPatients(incoming.length)) {
                setImportDialog({
                    open: true,
                    variant: 'error',
                    title: 'Kuota pasien tidak cukup',
                    message: `Impor menambahkan ${incoming.length} pasien baru dan akan melewati batas paket saat ini.`,
                    highlights: ['Upgrade paket untuk melanjutkan impor skala besar.', 'Data lokal saat ini tidak diubah.'],
                    primaryLabel: 'Upgrade Specialist',
                    secondaryLabel: 'Tutup',
                    onPrimary: () => {
                        setImportDialog(prev => ({ ...prev, open: false }));
                        navigate('/subscription');
                    },
                });
                setImporting(false);
                return;
            }

            // Construct new array: 
            // 1. Existing patients that were NOT updated
            // 2. Updated patients
            // 3. New incoming patients
            const updatedIds = new Set(updated.map(p => p.id));
            const finalPatients = [
                ...existing.filter(p => !updatedIds.has(p.id)),
                ...updated,
                ...incoming
            ];

            bulkSavePatients(finalPatients);

            if (importedSchedules.length > 0) {
                setScheduleStorageScope(user?.id || null);
                upsertSchedulesBulk(importedSchedules);
            }

            // 3. Sync to Supabase with isolated per-entity attempts to prevent chain abort.
            let syncStatus = {
                stases: mergedStases.length === 0 ? 'skip' : 'pending',
                patients: finalPatients.length === 0 ? 'skip' : 'pending',
                schedules: importedSchedules.length === 0 ? 'skip' : 'pending',
            };

            if (user?.id) {
                if (mergedStases.length > 0) {
                    try {
                        await syncStasesToSupabase(user.id);
                        syncStatus.stases = 'ok';
                    } catch {
                        syncStatus.stases = 'failed';
                    }
                }

                if (finalPatients.length > 0) {
                    try {
                        await syncToSupabase(user.id);
                        syncStatus.patients = 'ok';
                    } catch {
                        syncStatus.patients = 'failed';
                    }
                }

                if (importedSchedules.length > 0) {
                    try {
                        await syncSchedulesToSupabase(user.id);
                        syncStatus.schedules = 'ok';
                    } catch {
                        syncStatus.schedules = 'failed';
                    }
                }

                if (Object.values(syncStatus).includes('failed')) {
                    const failedTargets = Object.entries(syncStatus)
                        .filter(([, state]) => state === 'failed')
                        .map(([key]) => key);
                    const failedLabels = {
                        stases: 'stase',
                        patients: 'pasien',
                        schedules: 'jadwal',
                    };
                    const failedReadable = failedTargets.map(key => failedLabels[key] || key).join(', ');
                    importBundle.syncWarning = `Sinkron server parsial gagal pada: ${failedReadable}. Data lokal tetap tersimpan.`;
                }
            }

            // Update context AFTER sync attempts (skip background sync since we just did it manually)
            refreshStases();
            refreshPatients(true);

            if (incoming.length === 0 && updated.length === 0) {
                const highlights = [
                    `Total pasien lokal tetap ${finalPatients.length}.`,
                ];
                if (importBundle?.skippedInfo?.length) highlights.push(...importBundle.skippedInfo);
                if (importBundle?.syncWarning) highlights.push(importBundle.syncWarning);
                setImportDialog({
                    open: true,
                    variant: 'info',
                    title: 'Tidak ada data baru untuk diimpor',
                    message: 'Semua data pasien pada file sudah sinkron dengan data lokal Anda.',
                    highlights,
                    primaryLabel: 'OK',
                    secondaryLabel: null,
                    onPrimary: null,
                });
            } else {
                let msg = [];
                if (incoming.length > 0) msg.push(`${incoming.length} baru`);
                if (updated.length > 0) msg.push(`${updated.length} diperbarui`);
                if (importedSchedules.length > 0) msg.push(`${importedSchedules.length} jadwal diproses`);

                const highlights = [
                    `Ringkasan impor: ${msg.join(', ')}.`,
                    `Total pasien lokal sekarang ${finalPatients.length}.`,
                ];
                if (contentConflictUpdatedCount > 0) {
                    highlights.push(`${contentConflictUpdatedCount} pasien diperbarui karena konten berbeda meski timestamp sama.`);
                }
                if (importBundle?.skippedInfo?.length) highlights.push(...importBundle.skippedInfo);
                if (importBundle?.syncWarning) highlights.push(importBundle.syncWarning);

                setImportDialog({
                    open: true,
                    variant: importBundle?.syncWarning ? 'warning' : 'success',
                    title: importBundle?.syncWarning ? 'Impor selesai dengan catatan' : 'Impor JSON berhasil',
                    message: importBundle?.syncWarning
                        ? 'Sebagian sinkronisasi server mengalami kendala, namun data lokal sudah diperbarui.'
                        : 'Semua data valid berhasil diproses dan disimpan.',
                    highlights,
                    primaryLabel: 'Mengerti',
                    secondaryLabel: null,
                    onPrimary: null,
                });
            }
        } finally {
            isApplyingImportRef.current = false;
            setImporting(false);
        }
    };

    // Subscription Countdown Logic
    const subInfo = useMemo(() => {
        if (!profile?.subscription_expires_at) return null;
        
        const end = new Date(profile.subscription_expires_at);
        const now = new Date();
        const diff = end - now;
        const days = Math.ceil(diff / (1000 * 60 * 60 * 24));
        
        // Let's assume a standard 30-day or 90-day cycle for the progress bar
        // We can check the created_at vs expires_at to find the total duration
        const start = profile.created_at ? new Date(profile.created_at) : new Date(now.getTime() - (30 * 24 * 60 * 60 * 1000));
        const totalDuration = end - start;
        const elapsed = now - start;
        const progress = Math.max(0, Math.min(100, (elapsed / totalDuration) * 100));
        const remainingPercent = 100 - progress;

        const formatDate = (date) => {
            return new Intl.DateTimeFormat('id-ID', {
                day: 'numeric',
                month: 'long',
                year: 'numeric'
            }).format(date);
        };

        return {
            expiresAt: formatDate(end),
            daysLeft: Math.max(0, days),
            progress: remainingPercent, // percentage of time LEFT
            isExpiringSoon: days > 0 && days <= 7,
            isExpired: days <= 0
        };
    }, [profile]);

    const [downloadingReceipt, setDownloadingReceipt] = useState(false);

    const handleDownloadLatestReceipt = async () => {
        if (!profile?.id) return;
        setDownloadingReceipt(true);
        try {
            const { data, error } = await supabase
                .from('user_subscriptions')
                .select('*, subscription_plans(name)')
                .eq('user_id', profile.user_id)
                .eq('status', 'active')
                .order('created_at', { ascending: false })
                .limit(1)
                .maybeSingle();

            if (error) throw error;
            if (!data) {
                addToast('Tidak ditemukan riwayat pembayaran aktif.', 'info');
                return;
            }

            const receiptInfo = {
                order_id: data.gateway_order_id,
                user_name: profile.username || user?.email,
                user_email: user?.email,
                plan_name: data.subscription_plans?.name || 'Specialist',
                amount: data.amount_paid,
                payment_method: data.payment_method || 'QRIS/Transfer',
                date: data.updated_at
            };

            generateReceiptPDF(receiptInfo);
            addToast('Invoice berhasil diunduh.', 'success');
        } catch (err) {
            addToast('Gagal mengunduh invoice: ' + err.message, 'error');
        } finally {
            setDownloadingReceipt(false);
        }
    };

    return (
        <div className="flex-1 overflow-y-auto">
            <div className="p-4 md:p-6 lg:p-10 max-w-350 mx-auto animate-[fadeIn_0.3s_ease-out]">
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
                                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Profil Akun — {patients.length} Pasien</h3>
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
                                                {isAdmin ? 'Administrator' : isSpecialist ? 'Specialist Member' : 'Intern'}
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

                                <div className="pt-2 border-t border-slate-100 dark:border-slate-800">
                                    <div className="p-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                                        <div>
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-1">Keamanan Device</p>
                                            <p className="text-sm text-slate-600 dark:text-slate-300">Lihat device aktif dan keluarkan device lama yang tidak dikenal.</p>
                                        </div>
                                        <button
                                            onClick={() => navigate('/settings/devices')}
                                            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-primary text-white text-xs font-black uppercase tracking-wider hover:bg-blue-600 transition-all"
                                        >
                                            <span className="material-symbols-outlined text-[16px]">devices</span>
                                            Kelola Device
                                        </button>
                                    </div>
                                </div>

                                {/* Subscription Status Section - Unique UI */}
                                {(isSpecialist || isAdmin) && subInfo && (
                                    <div className="mt-8 border-t border-slate-100 dark:border-slate-800 pt-8">
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1">Manajemen Langganan</h4>
                                        <div className="bg-slate-50 dark:bg-slate-800/40 rounded-2xl p-6 border border-slate-100 dark:border-slate-700/50 relative overflow-hidden group">
                                            {/* Background glow for flair */}
                                            <div className="absolute top-0 right-0 w-32 h-32 bg-primary/5 rounded-full blur-3xl -mr-16 -mt-16 group-hover:bg-primary/10 transition-all duration-700" />
                                            
                                            <div className="flex flex-col md:flex-row gap-8 items-center relative z-10">
                                                {/* Unique Countdown Visual: Ring/Circle */}
                                                <div className="relative size-32 shrink-0">
                                                    <svg className="size-full -rotate-90" viewBox="0 0 100 100">
                                                        {/* Background circle */}
                                                        <circle 
                                                            cx="50" cy="50" r="45" 
                                                            fill="transparent" 
                                                            stroke="currentColor" 
                                                            strokeWidth="8"
                                                            className="text-slate-200 dark:text-slate-700"
                                                        />
                                                        {/* Progress circle */}
                                                        <circle 
                                                            cx="50" cy="50" r="45" 
                                                            fill="transparent" 
                                                            stroke="currentColor" 
                                                            strokeWidth="8"
                                                            strokeDasharray="282.7"
                                                            strokeDashoffset={282.7 - (282.7 * subInfo.progress) / 100}
                                                            strokeLinecap="round"
                                                            className={`${subInfo.isExpiringSoon ? 'text-amber-500' : 'text-primary'} transition-all duration-1000`}
                                                        />
                                                    </svg>
                                                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
                                                        <span className={`text-2xl font-black ${subInfo.isExpiringSoon ? 'text-amber-600' : 'text-slate-900 dark:text-white'}`}>
                                                            {subInfo.daysLeft}
                                                        </span>
                                                        <span className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Hari Lagi</span>
                                                    </div>
                                                </div>

                                                {/* Text Info */}
                                                <div className="flex-1 space-y-4 text-center md:text-left">
                                                    <div>
                                                        <h5 className="font-black text-slate-900 dark:text-white text-lg flex items-center justify-center md:justify-start gap-2">
                                                            Specialist Access
                                                            <span className="size-2 rounded-full bg-green-500 animate-pulse" />
                                                        </h5>
                                                        <p className="text-sm text-slate-500">Masa berlaku paket hingga <span className="font-bold text-slate-700 dark:text-slate-300">{subInfo.expiresAt}</span></p>
                                                    </div>

                                                    <div className="flex flex-wrap justify-center md:justify-start gap-4">
                                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                            <span className="material-symbols-outlined text-primary text-sm">auto_awesome</span>
                                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Advanced AI Active</span>
                                                        </div>
                                                        <div className="flex items-center gap-2 px-3 py-1.5 bg-white dark:bg-slate-800 rounded-lg border border-slate-200 dark:border-slate-700 shadow-sm">
                                                            <span className="material-symbols-outlined text-primary text-sm">cloud_done</span>
                                                            <span className="text-[11px] font-bold text-slate-600 dark:text-slate-400">Sync On</span>
                                                        </div>
                                                    </div>

                                                    {/* Manual Receipt Download */}
                                                    <div className="pt-2">
                                                        <button 
                                                            onClick={handleDownloadLatestReceipt}
                                                            disabled={downloadingReceipt}
                                                            className="text-[11px] font-bold text-primary hover:text-blue-600 flex items-center gap-1.5 transition-colors group/btn"
                                                        >
                                                            <span className={`material-symbols-outlined text-[16px] ${downloadingReceipt ? 'animate-spin' : 'group-hover/btn:translate-y-0.5 transition-transform'}`}>
                                                                {downloadingReceipt ? 'refresh' : 'receipt_long'}
                                                            </span>
                                                            {downloadingReceipt ? 'Menyiapkan Invoice...' : 'Download Invoice Terakhir'}
                                                        </button>
                                                    </div>
                                                </div>

                                                {/* Action */}
                                                <button 
                                                    onClick={() => navigate('/subscription')}
                                                    className="w-full md:w-auto px-6 py-3 bg-white dark:bg-slate-800 border-2 border-slate-200 dark:border-slate-700 rounded-xl font-black text-xs uppercase tracking-wider text-slate-600 dark:text-slate-300 hover:border-primary hover:text-primary transition-all active:scale-95 shadow-sm shrink-0"
                                                >
                                                    Kelola Paket
                                                </button>
                                            </div>

                                            {subInfo.isExpiringSoon && (
                                                <div className="mt-6 flex items-center gap-3 p-3 bg-amber-50 dark:bg-amber-900/20 border border-amber-100 dark:border-amber-900/30 rounded-xl animate-bounce-short">
                                                    <span className="material-symbols-outlined text-amber-600 text-[20px]">notification_important</span>
                                                    <p className="text-xs font-bold text-amber-700 dark:text-amber-400">Masa langganan hampir habis. Segera perpanjang paket Anda.</p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Pengaturan Export PDF */}
                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                            <div className="px-5 lg:px-8 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                <div className="flex items-center gap-3">
                                    <span className="material-symbols-outlined text-primary">picture_as_pdf</span>
                                    <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Pengaturan Export PDF</h3>
                                </div>
                            </div>
                            <div className="p-5 lg:p-8">
                                <p className="text-xs text-slate-500 mb-6 ml-1">Tentukan bagian mana saja yang akan ditampilkan saat mengekspor Laporan Medis Pasien ke PDF.</p>
                                
                                <div className="space-y-8">
                                    {/* Medical Data Category */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                            <span className="size-1.5 rounded-full bg-blue-500"></span>
                                            Data Medis Utama
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[
                                                { key: 'includeSummary', label: 'Ringkasan Pasien', icon: 'person' },
                                                { key: 'includeVitals', label: 'Tanda Vital', icon: 'monitor_heart' },
                                                { key: 'includeSymptoms', label: 'Riwayat & Peta Gejala', icon: 'ulna_radius' },
                                                { key: 'includePhysical', label: 'Pemeriksaan Fisik', icon: 'stethoscope' },
                                                { key: 'includeLabs', label: 'Hasil Lab & Penunjang', icon: 'lab_research' },
                                                { key: 'includeMedicine', label: 'Resep Obat', icon: 'prescriptions' },
                                                { key: 'includeDaily', label: 'Laporan Harian', icon: 'assignment' },
                                            ].map((item) => (
                                                <div key={item.key} 
                                                    onClick={() => togglePdfPref(item.key)}
                                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none ${pdfPrefs[item.key] ? 'bg-primary/5 border-primary/20 dark:bg-primary/10' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 opacity-60'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`material-symbols-outlined text-[20px] ${pdfPrefs[item.key] ? 'text-primary' : 'text-slate-400'}`}>{item.icon}</span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
                                                    </div>
                                                    <div className={`size-5 rounded-md flex items-center justify-center border transition-all ${pdfPrefs[item.key] ? 'bg-primary border-primary text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                                        {pdfPrefs[item.key] && <span className="material-symbols-outlined text-[16px] font-bold">check</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>

                                    {/* AI Features Category */}
                                    <div>
                                        <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest mb-4 ml-1 flex items-center gap-2">
                                            <span className="size-1.5 rounded-full bg-violet-500"></span>
                                            Analisis & Insight AI
                                        </h4>
                                        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                            {[
                                                { key: 'includeAiSummary', label: 'Ringkasan Cerdas AI', icon: 'psychology' },
                                                { key: 'includeAiSoap', label: 'Catatan SOAP AI', icon: 'description' },
                                                { key: 'includeAiSymptoms', label: 'Diagnosis Banding AI', icon: 'troubleshoot' },
                                                { key: 'includeAiRadar', label: 'Radar Diagnosis AI', icon: 'radar' },
                                                { key: 'includeAiPhysical', label: 'Analisis Fisik AI', icon: 'accessibility_new' },
                                                { key: 'includeAiLabs', label: 'Analisis Lab AI', icon: 'experiment' },
                                                { key: 'includeAiMedicine', label: 'Rekomendasi Obat AI', icon: 'prescriptions' },
                                                { key: 'includeAiDaily', label: 'Evaluasi Harian AI', icon: 'history_edu' },
                                            ].map((item) => (
                                                <div key={item.key} 
                                                    onClick={() => togglePdfPref(item.key)}
                                                    className={`flex items-center justify-between p-4 rounded-xl border transition-all cursor-pointer select-none ${pdfPrefs[item.key] ? 'bg-violet-500/5 border-violet-500/20 dark:bg-violet-500/10' : 'bg-slate-50 dark:bg-slate-800 border-slate-100 dark:border-slate-700 opacity-60'}`}>
                                                    <div className="flex items-center gap-3">
                                                        <span className={`material-symbols-outlined text-[20px] ${pdfPrefs[item.key] ? 'text-violet-500' : 'text-slate-400'}`}>{item.icon}</span>
                                                        <span className="text-sm font-bold text-slate-700 dark:text-slate-200">{item.label}</span>
                                                    </div>
                                                    <div className={`size-5 rounded-md flex items-center justify-center border transition-all ${pdfPrefs[item.key] ? 'bg-violet-500 border-violet-500 text-white' : 'border-slate-300 dark:border-slate-600'}`}>
                                                        {pdfPrefs[item.key] && <span className="material-symbols-outlined text-[16px] font-bold">check</span>}
                                                    </div>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                    
                                    <div className="pt-4 mt-6 border-t border-slate-100 dark:border-slate-800">
                                        <button 
                                            onClick={savePdfPrefs}
                                            disabled={savingPrefs}
                                            className="w-full sm:w-auto px-10 py-3.5 bg-primary text-white rounded-xl text-sm font-black hover:bg-blue-600 transition-all hover:shadow-lg hover:shadow-primary/20 active:scale-95 flex items-center justify-center gap-3 disabled:opacity-50 disabled:active:scale-100"
                                        >
                                            {savingPrefs ? (
                                                <><span className="material-symbols-outlined animate-spin">sync</span> Menyimpan...</>
                                            ) : (
                                                <><span className="material-symbols-outlined">verified</span> Simpan Pengaturan PDF</>
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

                <div className="mt-6 lg:mt-10 space-y-6 lg:space-y-10">
                    <SyncQueueManager />
                    <ConflictManager />
                </div>
            </div>

            {/* Modal-modal */}
            <ConfirmDialog 
                open={showConfirm} 
                onCancel={() => setShowConfirm(false)} 
                onConfirm={handleConfirmTyped}
                title="Hapus Semua Data?"
                message="Anda akan menghapus seluruh data pasien, stase, dan jadwal secara permanen. Ketik 'HAPUS' untuk melanjutkan."
                confirmLabel="HAPUS"
                requireTypedConfirmation="HAPUS"
            />

            <ConfirmDialog 
                open={showFinalConfirm} 
                onCancel={() => setShowFinalConfirm(false)} 
                onConfirm={handleFinalDelete}
                title="Peringatan Terakhir"
                message="Apakah Anda benar-benar yakin? Data yang sudah dihapus tidak dapat dipulihkan kembali dari server."
                confirmLabel={deleting ? "Menghapus..." : "Ya, Hapus Permanen"}
                danger={true}
            />

            {pendingImport && (
                <StaseMappingModal
                    open={!!pendingImport}
                    importedPatients={pendingImport.patients}
                    localStases={localStasesForImport}
                    onApply={applyImport}
                    onCancel={() => setPendingImport(null)}
                />
            )}

            <ImportWindowBox
                open={importDialog.open}
                variant={importDialog.variant}
                title={importDialog.title}
                message={importDialog.message}
                highlights={importDialog.highlights}
                primaryLabel={importDialog.primaryLabel}
                secondaryLabel={importDialog.secondaryLabel}
                onPrimary={importDialog.onPrimary || (() => setImportDialog(prev => ({ ...prev, open: false })))}
                onSecondary={() => setImportDialog(prev => ({ ...prev, open: false }))}
                onClose={() => setImportDialog(prev => ({ ...prev, open: false }))}
            />
        </div>
    );
}
