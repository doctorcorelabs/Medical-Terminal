import { useState, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useStase } from '../context/StaseContext';
import { usePatients } from '../context/PatientContext';

const COLOR_PALETTE = [
    '#3b82f6', // blue
    '#22c55e', // green
    '#ef4444', // red
    '#a855f7', // purple
    '#f97316', // orange
    '#14b8a6', // teal
    '#ec4899', // pink
    '#eab308', // yellow
];

export default function Stase() {
    const navigate = useNavigate();
    const { stases, pinnedStaseId, addStase, updateStase, deleteStase, pinStase, reorderStase } = useStase();
    const { patients } = usePatients();

    const [showCreateForm, setShowCreateForm] = useState(false);
    const [newName, setNewName] = useState('');
    const [newColor, setNewColor] = useState(COLOR_PALETTE[0]);

    const [editingId, setEditingId] = useState(null);
    const [editName, setEditName] = useState('');
    const [editColor, setEditColor] = useState('');

    const [deleteConfirmId, setDeleteConfirmId] = useState(null);
    const [deleteNameInput, setDeleteNameInput] = useState('');
    const createInputRef = useRef(null);
    const editInputRef = useRef(null);
    const deleteInputRef = useRef(null);

    useEffect(() => {
        if (showCreateForm) createInputRef.current?.focus();
    }, [showCreateForm]);

    useEffect(() => {
        if (editingId) editInputRef.current?.focus();
    }, [editingId]);

    useEffect(() => {
        if (deleteConfirmId) {
            setDeleteNameInput('');
            setTimeout(() => deleteInputRef.current?.focus(), 50);
        }
    }, [deleteConfirmId]);

    const patientCountForStase = (staseId) =>
        patients.filter(p => p.stase_id === staseId).length;

    const handleCreate = () => {
        if (!newName.trim()) return;
        addStase(newName.trim(), newColor);
        setNewName('');
        setNewColor(COLOR_PALETTE[0]);
        setShowCreateForm(false);
    };

    const handleEditStart = (stase) => {
        setEditingId(stase.id);
        setEditName(stase.name);
        setEditColor(stase.color);
    };

    const handleEditSave = () => {
        if (!editName.trim()) return;
        updateStase(editingId, { name: editName.trim(), color: editColor });
        setEditingId(null);
    };

    const handleDelete = (staseId) => {
        setDeleteConfirmId(staseId);
    };

    const confirmDelete = () => {
        if (deleteNameInput !== staseToDelete?.name) return;
        deleteStase(deleteConfirmId);
        setDeleteConfirmId(null);
        setDeleteNameInput('');
    };

    const cancelDelete = () => {
        setDeleteConfirmId(null);
        setDeleteNameInput('');
    };

    const staseToDelete = stases.find(s => s.id === deleteConfirmId);
    const deleteCount = staseToDelete ? patientCountForStase(staseToDelete.id) : 0;

    return (
        <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 gap-6 pb-24 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
                <div>
                    <h1 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Manajemen Stase</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">
                        Kelola rotasi stase coass Anda. Pin satu stase sebagai aktif.
                    </p>
                </div>
                <button
                    onClick={() => setShowCreateForm(v => !v)}
                    className="flex items-center gap-2 px-4 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all shrink-0"
                >
                    <span className="material-symbols-outlined text-lg">{showCreateForm ? 'close' : 'add'}</span>
                    {showCreateForm ? 'Batal' : 'Buat Stase Baru'}
                </button>
            </div>

            {/* Create Form */}
            {showCreateForm && (
                <div className="bg-white dark:bg-slate-900 border border-primary/30 rounded-2xl p-5 shadow-lg shadow-primary/5 animate-[fadeIn_0.2s_ease-out]">
                    <h3 className="font-bold text-slate-800 dark:text-white mb-4 flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">assignment_add</span>
                        Stase Baru
                    </h3>
                    <div className="flex flex-col sm:flex-row gap-4 items-end">
                        <div className="flex-1">
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Nama Stase</label>
                            <input
                                ref={createInputRef}
                                type="text"
                                value={newName}
                                onChange={e => setNewName(e.target.value)}
                                onKeyDown={e => e.key === 'Enter' && handleCreate()}
                                placeholder="Cth: Penyakit Dalam, Bedah, Anak..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                            />
                        </div>
                        <div>
                            <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Warna</label>
                            <ColorPicker value={newColor} onChange={setNewColor} />
                        </div>
                        <button
                            onClick={handleCreate}
                            disabled={!newName.trim()}
                            className="flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all disabled:opacity-40 disabled:cursor-not-allowed shrink-0 h-10.5"
                        >
                            <span className="material-symbols-outlined text-lg">check</span>
                            Simpan
                        </button>
                    </div>
                </div>
            )}

            {/* Empty State */}
            {stases.length === 0 && !showCreateForm && (
                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-dashed border-slate-300 dark:border-slate-700 p-12 text-center">
                    <div className="size-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                        <span className="material-symbols-outlined text-3xl text-primary">assignment</span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-700 dark:text-slate-200 mb-2">Belum Ada Stase</h3>
                    <p className="text-sm text-slate-400 mb-6 max-w-xs mx-auto">
                        Buat stase pertama Anda untuk mulai mengelompokkan pasien sesuai rotasi.
                    </p>
                    <button
                        onClick={() => setShowCreateForm(true)}
                        className="inline-flex items-center gap-2 px-5 py-2.5 bg-primary text-white rounded-xl font-bold text-sm shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all"
                    >
                        <span className="material-symbols-outlined text-lg">add</span>
                        Buat Stase Pertama
                    </button>
                </div>
            )}

            {/* Stase List */}
            {stases.length > 0 && (
                <div className="space-y-3">
                    {stases.map((stase, index) => {
                        const count = patientCountForStase(stase.id);
                        const isPinned = stase.id === pinnedStaseId;
                        const isEditing = editingId === stase.id;
                        const isFirst = index === 0;
                        const isLast = index === stases.length - 1;

                        return (
                            <div
                                key={stase.id}
                                className={`bg-white dark:bg-slate-900 rounded-2xl border transition-all overflow-hidden ${isPinned
                                    ? 'border-primary/50 shadow-md shadow-primary/10 ring-1 ring-primary/20'
                                    : 'border-slate-200 dark:border-slate-800 shadow-sm'
                                    }`}
                            >
                                {/* Color accent bar */}
                                <div className="h-1 w-full rounded-t-2xl" style={{ backgroundColor: stase.color }} />

                                <div className="p-4 sm:p-5">
                                    {isEditing ? (
                                        /* Edit Mode */
                                        <div className="flex flex-col sm:flex-row gap-3 items-end">
                                            <div className="flex-1">
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Nama Stase</label>
                                                <input
                                                    ref={editInputRef}
                                                    type="text"
                                                    value={editName}
                                                    onChange={e => setEditName(e.target.value)}
                                                    onKeyDown={e => {
                                                        if (e.key === 'Enter') handleEditSave();
                                                        if (e.key === 'Escape') setEditingId(null);
                                                    }}
                                                    className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-primary/40 focus:border-primary transition-all"
                                                />
                                            </div>
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase tracking-wider mb-1.5 ml-1">Warna</label>
                                                <ColorPicker value={editColor} onChange={setEditColor} />
                                            </div>
                                            <div className="flex gap-2 shrink-0">
                                                <button
                                                    onClick={handleEditSave}
                                                    className="flex items-center gap-1.5 px-4 py-2.5 bg-primary text-white rounded-xl font-bold text-sm hover:bg-primary/90 transition-all h-10.5"
                                                >
                                                    <span className="material-symbols-outlined text-lg">check</span>
                                                    Simpan
                                                </button>
                                                <button
                                                    onClick={() => setEditingId(null)}
                                                    className="px-3 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all h-10.5"
                                                >
                                                    <span className="material-symbols-outlined text-lg">close</span>
                                                </button>
                                            </div>
                                        </div>
                                    ) : (
                                        /* Display Mode */
                                        <div className="flex items-center gap-3 sm:gap-4">
                                            {/* Color dot */}
                                            <div
                                                className="size-10 rounded-xl shrink-0 flex items-center justify-center text-white shadow-sm"
                                                style={{ backgroundColor: stase.color }}
                                            >
                                                <span className="material-symbols-outlined text-[20px]">assignment</span>
                                            </div>

                                            {/* Info */}
                                            <div className="flex-1 min-w-0">
                                                <div className="flex items-center gap-2 flex-wrap">
                                                    <h3 className="font-bold text-slate-900 dark:text-white text-base truncate">{stase.name}</h3>
                                                    {isPinned && (
                                                        <span className="inline-flex items-center gap-1 text-[10px] font-black uppercase px-2 py-0.5 rounded-full text-white shrink-0" style={{ backgroundColor: stase.color }}>
                                                            <span className="material-symbols-outlined text-[12px]">push_pin</span>
                                                            Aktif
                                                        </span>
                                                    )}
                                                </div>
                                                <p className="text-xs text-slate-500 mt-0.5">
                                                    <span className="font-semibold" style={{ color: stase.color }}>{count}</span>
                                                    <span className="text-slate-400"> pasien terdaftar</span>
                                                    <span className="text-slate-300 dark:text-slate-700 mx-1.5">•</span>
                                                    <span className="text-slate-400">Dibuat {new Date(stase.createdAt).toLocaleDateString('id-ID', { day: 'numeric', month: 'short', year: 'numeric' })}</span>
                                                </p>
                                            </div>

                                            {/* Actions */}
                                            <div className="flex items-center gap-1 shrink-0">
                                                {/* Reorder up */}
                                                {!isFirst && (
                                                    <button
                                                        onClick={() => reorderStase(stase.id, 'up')}
                                                        title="Pindah ke Atas"
                                                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">arrow_upward</span>
                                                    </button>
                                                )}
                                                {isFirst && <div className="w-9" />}

                                                {/* Reorder down */}
                                                {!isLast && (
                                                    <button
                                                        onClick={() => reorderStase(stase.id, 'down')}
                                                        title="Pindah ke Bawah"
                                                        className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                    >
                                                        <span className="material-symbols-outlined text-xl">arrow_downward</span>
                                                    </button>
                                                )}
                                                {isLast && <div className="w-9" />}

                                                {/* View patients */}
                                                <button
                                                    onClick={() => navigate('/patients')}
                                                    title="Lihat Pasien"
                                                    className="p-2 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-xl">group</span>
                                                </button>

                                                {/* Edit */}
                                                <button
                                                    onClick={() => handleEditStart(stase)}
                                                    title="Edit Stase"
                                                    className="p-2 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-xl">edit</span>
                                                </button>

                                                {/* Pin toggle */}
                                                <button
                                                    onClick={() => pinStase(stase.id)}
                                                    title={isPinned ? 'Lepas Pin' : 'Pin sebagai Stase Aktif'}
                                                    className={`p-2 rounded-lg transition-colors ${isPinned
                                                        ? 'text-white shadow-sm'
                                                        : 'text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800'
                                                        }`}
                                                    style={isPinned ? { backgroundColor: stase.color } : {}}
                                                >
                                                    <span className="material-symbols-outlined text-xl">
                                                        {isPinned ? 'push_pin' : 'keep'}
                                                    </span>
                                                </button>

                                                {/* Delete */}
                                                <button
                                                    onClick={() => handleDelete(stase.id)}
                                                    title="Hapus Stase"
                                                    className="p-2 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-xl">delete</span>
                                                </button>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>
                        );
                    })}

                    {/* Create new at bottom */}
                    {!showCreateForm && (
                        <button
                            onClick={() => setShowCreateForm(true)}
                            className="w-full flex items-center justify-center gap-2 p-4 rounded-2xl border-2 border-dashed border-slate-200 dark:border-slate-700 text-slate-400 hover:border-primary/50 hover:text-primary hover:bg-primary/5 transition-all font-semibold text-sm"
                        >
                            <span className="material-symbols-outlined text-xl">add_circle</span>
                            Buat Stase Baru
                        </button>
                    )}
                </div>
            )}

            {/* Tips */}
            {stases.length > 0 && (
                <div className="bg-blue-50/70 dark:bg-blue-900/10 border border-blue-100 dark:border-blue-900/30 rounded-xl p-4 flex gap-3">
                    <span className="material-symbols-outlined text-blue-500 shrink-0 mt-0.5">info</span>
                    <div className="text-xs text-blue-700 dark:text-blue-300 space-y-1">
                        <p><strong>Pin stase aktif</strong> untuk menampilkan pasien stase tersebut secara default di Daftar Pasien.</p>
                        <p>Pasien baru yang ditambahkan akan otomatis masuk ke stase yang sedang di-pin.</p>
                        <p className="text-red-500 dark:text-red-400"><strong>Perhatian:</strong> Menghapus stase akan menghapus semua pasien di dalamnya secara permanen.</p>
                    </div>
                </div>
            )}

            {/* Delete Confirmation Modal */}
            {deleteConfirmId && (
                <div className="fixed inset-0 bg-black/60 z-50 flex items-center justify-center p-4 animate-[fadeIn_0.15s_ease-out]">
                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-2xl p-6 max-w-sm w-full">
                        <div className="flex items-center gap-3 mb-4">
                            <div className="size-11 bg-red-100 dark:bg-red-900/30 rounded-xl flex items-center justify-center shrink-0">
                                <span className="material-symbols-outlined text-red-500 text-2xl">warning</span>
                            </div>
                            <div>
                                <h3 className="font-bold text-slate-900 dark:text-white text-base">Hapus Stase</h3>
                                <p className="text-xs text-red-500 font-semibold mt-0.5">Tindakan ini tidak dapat dibatalkan</p>
                            </div>
                        </div>

                        <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">
                            Anda akan menghapus stase <strong className="text-slate-900 dark:text-white">"{staseToDelete?.name}"</strong>.
                        </p>

                        {deleteCount > 0 && (
                            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-xl p-3 mb-4">
                                <p className="text-sm font-bold text-red-700 dark:text-red-400 flex items-center gap-2">
                                    <span className="material-symbols-outlined text-base">person_remove</span>
                                    {deleteCount} pasien akan ikut terhapus
                                </p>
                                <p className="text-xs text-red-500 mt-1">Semua data pasien di stase ini akan hilang permanen.</p>
                            </div>
                        )}

                        <div className="mb-4">
                            <label className="block text-xs font-bold text-slate-500 dark:text-slate-400 mb-1.5">
                                Ketik nama stase untuk konfirmasi:
                                <span className="font-black text-slate-800 dark:text-white ml-1">{staseToDelete?.name}</span>
                            </label>
                            <input
                                ref={deleteInputRef}
                                type="text"
                                value={deleteNameInput}
                                onChange={e => setDeleteNameInput(e.target.value)}
                                onKeyDown={e => {
                                    if (e.key === 'Enter') confirmDelete();
                                    if (e.key === 'Escape') cancelDelete();
                                }}
                                placeholder="Ketik nama stase di sini..."
                                className="w-full bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl px-4 py-2.5 text-sm focus:ring-2 focus:ring-red-400/40 focus:border-red-400 transition-all"
                            />
                        </div>

                        <div className="flex gap-3">
                            <button
                                onClick={cancelDelete}
                                className="flex-1 px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-xl font-bold text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                            >
                                Batal
                            </button>
                            <button
                                onClick={confirmDelete}
                                disabled={deleteNameInput !== staseToDelete?.name}
                                className="flex-1 px-4 py-2.5 bg-red-500 text-white rounded-xl font-bold text-sm hover:bg-red-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                            >
                                Hapus Permanen
                            </button>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
}

function ColorPicker({ value, onChange }) {
    return (
        <div className="flex items-center gap-1.5 p-1.5 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-200 dark:border-slate-700 h-10.5">
            {COLOR_PALETTE.map(color => (
                <button
                    key={color}
                    type="button"
                    onClick={() => onChange(color)}
                    title={color}
                    className={`size-5 rounded-full transition-all shrink-0 ${value === color ? 'ring-2 ring-offset-1 ring-offset-slate-50 dark:ring-offset-slate-800 scale-110' : 'hover:scale-110'}`}
                    style={{ backgroundColor: color, ringColor: color }}
                />
            ))}
        </div>
    );
}
