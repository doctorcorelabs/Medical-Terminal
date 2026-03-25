import { useState, useEffect, useCallback } from 'react';
import { peekAllQueueItems, dequeue, resetQueueItemRetry, clearQueueForUser } from '../services/idbQueue';
import { useAuth } from '../context/AuthContext';
import { useOffline } from '../context/OfflineContext';
import { useToast } from '../context/ToastContext';
import { triggerSwSync } from '../services/swConfig';

export default function SyncQueueManager() {
    const { user } = useAuth();
    const { refreshPendingStatus, isOnline, clearSyncQueue } = useOffline();
    const { addToast } = useToast();
    const [items, setItems] = useState([]);
    const [loading, setLoading] = useState(true);
    const [isProcessing, setIsProcessing] = useState(false);

    const loadItems = useCallback(async () => {
        setLoading(true);
        try {
            const allItems = await peekAllQueueItems();
            // Filter by current user
            setItems(allItems.filter(item => item.userId === user?.id));
        } catch (err) {
            console.error('[SyncQueueManager] Failed to load items:', err);
        } finally {
            setLoading(false);
        }
    }, [user?.id]);

    useEffect(() => {
        loadItems();
    }, [loadItems]);

    const handleRemove = async (id) => {
        if (!window.confirm('Hapus item ini dari antrean? Data lokal ini tidak akan dikirim ke server.')) return;
        try {
            await dequeue(id);
            addToast('Item dihapus dari antrean', 'success');
            loadItems();
            refreshPendingStatus();
        } catch (err) {
            addToast('Gagal menghapus item: ' + err.message, 'error');
        }
    };

    const handleResetRetry = async (id) => {
        try {
            await resetQueueItemRetry(id);
            addToast('Percobaan ulang dijadwalkan', 'success');
            loadItems();
            if (isOnline) triggerSwSync();
        } catch (err) {
            addToast('Gagal mereset percobaan: ' + err.message, 'error');
        }
    };

    const handleClearAll = async () => {
        if (!window.confirm('Hapus SEMUA item di antrean? Tindakan ini tidak dapat dibatalkan.')) return;
        setIsProcessing(true);
        try {
            await clearSyncQueue();
            addToast('Antrean berhasil dibersihkan', 'success');
            loadItems();
        } catch (err) {
            addToast('Gagal membersihkan antrean: ' + err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    const handleSyncNow = async () => {
        if (!isOnline) {
            addToast('Anda sedang offline. Hubungkan ke internet untuk sinkronisasi.', 'warning');
            return;
        }
        setIsProcessing(true);
        try {
            await triggerSwSync();
            addToast('Sinkronisasi dipicu...', 'info');
            // Give it a moment to process then reload
            setTimeout(loadItems, 2000);
        } catch (err) {
            addToast('Gagal memicu sinkronisasi: ' + err.message, 'error');
        } finally {
            setIsProcessing(false);
        }
    };

    if (loading) {
        return (
            <div className="p-8 text-center bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800">
                <span className="material-symbols-outlined animate-spin text-slate-400">sync</span>
                <p className="text-xs text-slate-400 mt-2 font-bold uppercase tracking-widest">Memuat antrean...</p>
            </div>
        );
    }

    const pendingItems = items.filter(i => !i.syncedAt);
    const syncedItems = items.filter(i => i.syncedAt);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
            <div className="px-5 lg:px-8 py-5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                    <span className="material-symbols-outlined text-amber-500">sync_problem</span>
                    <div>
                        <h3 className="font-black text-xs uppercase tracking-widest text-slate-500">Antrean Sinkronisasi (Offline Queue)</h3>
                        <p className="text-[10px] font-bold text-slate-400">Total: {pendingItems.length} tertunda, {syncedItems.length} riwayat</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    <button 
                        onClick={handleSyncNow}
                        disabled={isProcessing || pendingItems.length === 0}
                        className="px-4 py-2 bg-primary text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-blue-600 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">sync</span>
                        Sync Now
                    </button>
                    <button 
                        onClick={handleClearAll}
                        disabled={isProcessing || pendingItems.length === 0}
                        className="px-4 py-2 bg-rose-500 text-white rounded-lg text-xs font-black uppercase tracking-wider hover:bg-rose-600 disabled:opacity-50 transition-all flex items-center gap-2"
                    >
                        <span className="material-symbols-outlined text-sm">delete_sweep</span>
                        Clear All
                    </button>
                </div>
            </div>

            <div className="p-5 lg:p-8">
                {pendingItems.length === 0 ? (
                    <div className="py-10 text-center bg-slate-50 dark:bg-slate-800/40 rounded-xl border border-dashed border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-slate-300 text-4xl mb-2">cloud_done</span>
                        <p className="text-sm font-bold text-slate-500">Semua data telah tersinkronisasi.</p>
                        <p className="text-[10px] text-slate-400 mt-1">Antrean sinkronisasi kosong.</p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {pendingItems.map((item) => (
                            <div key={item.id} className="p-4 rounded-xl border border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900/60 shadow-sm group">
                                <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
                                    <div className="flex items-start gap-4">
                                        <div className={`size-10 rounded-xl flex items-center justify-center shrink-0 ${item.attemptCount >= 8 ? 'bg-red-50 text-red-500' : 'bg-amber-50 text-amber-500'}`}>
                                            <span className="material-symbols-outlined">
                                                {item.type === 'patients' ? 'person' : item.type === 'stases' ? 'apartment' : 'event'}
                                            </span>
                                        </div>
                                        <div>
                                            <div className="flex items-center gap-2">
                                                <h4 className="font-black text-sm text-slate-800 dark:text-slate-100 uppercase tracking-tight">
                                                    {item.op === 'upsert' ? 'Update/Add' : 'Delete'} {item.type}
                                                </h4>
                                                {item.attemptCount >= 8 && (
                                                    <span className="px-2 py-0.5 rounded bg-red-500 text-white text-[9px] font-black uppercase tracking-widest">Stuck (Max Retries)</span>
                                                )}
                                            </div>
                                            <p className="text-[10px] text-slate-500 font-mono mt-0.5">ID: {item.entityId} | Enqueued: {new Date(item.enqueuedAt).toLocaleString('id-ID')}</p>
                                            
                                            {item.lastError && (
                                                <div className="mt-2 p-2 rounded bg-red-50 dark:bg-red-900/20 border border-red-100 dark:border-red-900/20">
                                                    <p className="text-[10px] font-bold text-red-600 dark:text-red-400 leading-tight">
                                                        <span className="material-symbols-outlined text-[12px] align-middle mr-1">error</span>
                                                        Error: {item.lastError}
                                                    </p>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-2 self-end md:self-center">
                                        <div className="text-right mr-2 hidden md:block">
                                            <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest leading-none">Retry Count</p>
                                            <p className={`text-sm font-black ${item.attemptCount >= 5 ? 'text-red-500' : 'text-slate-700 dark:text-slate-300'}`}>{item.attemptCount} / 8</p>
                                        </div>
                                        <button 
                                            onClick={() => handleResetRetry(item.id)}
                                            title="Coba sinkronkan ulang sekarang"
                                            className="size-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-primary hover:border-primary/50 transition-all flex items-center justify-center active:scale-90"
                                        >
                                            <span className="material-symbols-outlined text-lg">refresh</span>
                                        </button>
                                        <button 
                                            onClick={() => handleRemove(item.id)}
                                            title="Hapus dari antrean"
                                            className="size-9 rounded-lg border border-slate-200 dark:border-slate-700 text-slate-400 hover:text-rose-500 hover:border-rose-500/50 transition-all flex items-center justify-center active:scale-90"
                                        >
                                            <span className="material-symbols-outlined text-lg">delete</span>
                                        </button>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                )}
            </div>
            
            {(syncedItems.length > 0) && (
                <div className="px-5 lg:px-8 py-4 border-t border-slate-100 dark:border-slate-800 bg-slate-50/30 dark:bg-slate-800/10">
                    <details className="group">
                        <summary className="text-[10px] font-black text-slate-400 uppercase tracking-widest cursor-pointer hover:text-slate-600 transition-colors flex items-center gap-2 select-none">
                            <span className="material-symbols-outlined text-sm transition-transform group-open:rotate-180">expand_more</span>
                            Lihat Riwayat Sync ({syncedItems.length} item terakhir)
                        </summary>
                        <div className="mt-4 space-y-2 opacity-60">
                            {syncedItems.slice(-10).reverse().map(item => (
                                <div key={item.id} className="text-[10px] flex items-center justify-between p-2 rounded bg-white dark:bg-slate-900 border border-slate-100 dark:border-slate-800">
                                    <span className="font-bold text-slate-600 dark:text-slate-400">{item.op} {item.type} - {item.entityId.slice(0, 8)}...</span>
                                    <span className="text-emerald-500 font-bold flex items-center gap-1">
                                        <span className="material-symbols-outlined text-xs">check_circle</span>
                                        Synced @ {new Date(item.syncedAt).toLocaleTimeString('id-ID')}
                                    </span>
                                </div>
                            ))}
                        </div>
                    </details>
                </div>
            )}
        </div>
    );
}
