import { useState, useMemo, useRef, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { useStase } from '../context/StaseContext';
import { useAuth } from '../context/AuthContext';
import { calculateDaysInHospital, getRelativeTime } from '../services/dataService';
import { exportPatientListPDF, exportMultiplePatientsPDF } from '../services/pdfExportService';
import ConfirmDialog from '../components/ConfirmDialog';

export default function PatientList() {
    const navigate = useNavigate();
    const { patients, deletePatient, updatePatient } = usePatients();
    const { stases, pinnedStaseId } = useStase();
    const { user } = useAuth();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('updatedAt');
    const [showExportMenu, setShowExportMenu] = useState(false);
    const exportMenuRef = useRef(null);
    const exportMenuFixedRef = useRef(null);
    const [exportMenuPos, setExportMenuPos] = useState(null);

    // Stase filter: array of selected stase IDs, null = show all
    const [selectedStaseIds, setSelectedStaseIds] = useState(() =>
        pinnedStaseId ? [pinnedStaseId] : null
    );
    // Keep selectedStaseIds in sync when pinned stase changes from another page
    useEffect(() => {
        if (pinnedStaseId && selectedStaseIds === null) {
            // don't override explicit "show all" choice; only set if user hasn't changed it
        }
    }, [pinnedStaseId]); // eslint-disable-line

    // Transfer dropdown — uses position:fixed to escape overflow:auto clipping
    const [transferPatientId, setTransferPatientId] = useState(null);
    const [dropdownPos, setDropdownPos] = useState(null);
    const transferDropdownRef = useRef(null);
    const [openCardMenuId, setOpenCardMenuId] = useState(null);
    const cardMenuRef = useRef(null);
    const [selectionMode, setSelectionMode] = useState(false);
    const [selectedIds, setSelectedIds] = useState(new Set());
    const [showReorderModal, setShowReorderModal] = useState(false);
    const [reorderList, setReorderList] = useState([]);
    const [deleteTargetPatient, setDeleteTargetPatient] = useState(null);

    useEffect(() => {
        if (!transferPatientId) return;
        const handler = (e) => {
            if (transferDropdownRef.current && !transferDropdownRef.current.contains(e.target)) {
                setTransferPatientId(null);
                setDropdownPos(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, [transferPatientId]);

    useEffect(() => {
        const handler = (e) => {
            if (cardMenuRef.current && !cardMenuRef.current.contains(e.target)) {
                setOpenCardMenuId(null);
            }
        };
        document.addEventListener('mousedown', handler);
        return () => document.removeEventListener('mousedown', handler);
    }, []);

    const openTransfer = (e, patientId) => {
        e.stopPropagation();
        if (transferPatientId === patientId) {
            setTransferPatientId(null);
            setDropdownPos(null);
            return;
        }
        const rect = e.currentTarget.getBoundingClientRect();
        setDropdownPos({ top: rect.bottom + 4, right: window.innerWidth - rect.right });
        setTransferPatientId(patientId);
    };

    const handleTransfer = (patientId, newStaseId) => {
        updatePatient(patientId, { stase_id: newStaseId || null });
        setTransferPatientId(null);
        setDropdownPos(null);
        // Switch view to the target stase so transfer is visually confirmed
        if (newStaseId) {
            setSelectedStaseIds([newStaseId]);
        }
    };

    useEffect(() => {
        const handleClickOutside = (e) => {
            const insideButton = exportMenuRef.current && exportMenuRef.current.contains(e.target);
            const insideMenu = exportMenuFixedRef.current && exportMenuFixedRef.current.contains(e.target);
            if (!insideButton && !insideMenu) {
                setShowExportMenu(false);
                setExportMenuPos(null);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    const filteredPatients = useMemo(() => {
        let result = [...patients];

        // Stase filter
        if (selectedStaseIds !== null) {
            result = result.filter(p => selectedStaseIds.includes(p.stase_id));
        }

        if (search) {
            const q = search.toLowerCase();
            result = result.filter(p =>
                p.name?.toLowerCase().includes(q) ||
                p.chiefComplaint?.toLowerCase().includes(q) ||
                p.diagnosis?.toLowerCase().includes(q)
            );
        }
        if (filter === 'critical') result = result.filter(p => p.condition === 'critical');
        else if (filter === 'urgent') result = result.filter(p => p.condition === 'urgent');
        else if (filter === 'stable') result = result.filter(p => p.condition === 'stable');
        else if (filter === 'improving') result = result.filter(p => p.condition === 'improving');
        else if (filter === 'active') result = result.filter(p => p.status !== 'discharged');

        result.sort((a, b) => {
            // Normalize values
            const nameA = (a.name || '').toLowerCase();
            const nameB = (b.name || '').toLowerCase();
            const updatedA = a.updatedAt ? new Date(a.updatedAt).getTime() : 0;
            const updatedB = b.updatedAt ? new Date(b.updatedAt).getTime() : 0;
            const admitA = a.admissionDate ? new Date(a.admissionDate).getTime() : 0;
            const admitB = b.admissionDate ? new Date(b.admissionDate).getTime() : 0;

            if (sortBy === 'name') return nameA.localeCompare(nameB);
            if (sortBy === 'admission') return admitB - admitA; // newest admission first
            // default: updatedAt (Terbaru)
            return updatedB - updatedA;
        });
        return result;
    }, [patients, search, filter, sortBy, selectedStaseIds]);

    const toggleStaseFilter = (staseId) => {
        if (staseId === null) {
            // "Semua Stase" chip
            setSelectedStaseIds(null);
            return;
        }
        if (selectedStaseIds === null) {
            setSelectedStaseIds([staseId]);
        } else if (selectedStaseIds.includes(staseId)) {
            const next = selectedStaseIds.filter(id => id !== staseId);
            setSelectedStaseIds(next.length === 0 ? null : next);
        } else {
            setSelectedStaseIds([...selectedStaseIds, staseId]);
        }
    };

    const tabCounts = {
        all: patients.length,
        active: patients.filter(p => p.status !== 'discharged').length,
        critical: patients.filter(p => p.condition === 'critical').length,
        improving: patients.filter(p => p.condition === 'improving').length,
    };

    // Patient for the open transfer dropdown
    const transferPatient = transferPatientId ? patients.find(p => p.id === transferPatientId) : null;

    const toggleSelect = (id) => {
        setSelectedIds(prev => {
            const next = new Set(prev);
            next.has(id) ? next.delete(id) : next.add(id);
            return next;
        });
    };
    const openDeleteDialog = (patient) => setDeleteTargetPatient(patient);
    const closeDeleteDialog = () => setDeleteTargetPatient(null);
    const confirmDeletePatient = () => {
        if (!deleteTargetPatient?.id) return;
        deletePatient(deleteTargetPatient.id);
        setDeleteTargetPatient(null);
    };

    const selectAll = () => setSelectedIds(new Set(filteredPatients.map(p => p.id)));
    const clearAll = () => setSelectedIds(new Set());
    const exitSelection = () => { setSelectionMode(false); setSelectedIds(new Set()); };

    return (
        <div className={`flex-1 flex flex-col p-4 md:p-6 lg:p-8 gap-5 lg:gap-6 ${selectionMode ? 'pb-40 lg:pb-28' : 'pb-20 lg:pb-8'} animate-[fadeIn_0.3s_ease-out]`}>

            {/* Fixed-position transfer dropdown — outside all overflow containers */}
            {transferPatient && dropdownPos && (
                <div
                    ref={transferDropdownRef}
                    style={{ position: 'fixed', top: dropdownPos.top, right: dropdownPos.right, zIndex: 9999 }}
                    className="w-56 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-2xl overflow-hidden animate-[fadeIn_0.15s_ease-out]"
                >
                    <div className="px-3 py-2.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                        <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Pindah Stase</p>
                        <p className="text-xs font-bold text-slate-700 dark:text-slate-200 truncate mt-0.5">{transferPatient.name}</p>
                    </div>
                    {stases.filter(s => s.id !== transferPatient.stase_id).map(s => (
                        <button
                            key={s.id}
                            onClick={() => handleTransfer(transferPatient.id, s.id)}
                            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                        >
                            <span className="size-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                            <span className="text-sm font-semibold text-slate-700 dark:text-slate-200">{s.name}</span>
                        </button>
                    ))}
                    {stases.filter(s => s.id !== transferPatient.stase_id).length === 0 && (
                        <p className="text-xs text-slate-400 px-3 py-2.5">Tidak ada stase lain</p>
                    )}
                    {transferPatient.stase_id && (
                        <button
                            onClick={() => handleTransfer(transferPatient.id, null)}
                            className="flex items-center gap-2.5 w-full px-3 py-2.5 text-left hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border-t border-slate-100 dark:border-slate-800"
                        >
                            <span className="material-symbols-outlined text-sm text-red-400">link_off</span>
                            <span className="text-sm font-semibold text-red-500">Lepas dari stase</span>
                        </button>
                    )}
                </div>
            )}
            {/* Judul */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-slate-900 dark:text-white text-2xl md:text-3xl font-black leading-tight tracking-tight">Daftar Pasien</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Dashboard klinis real-time dengan AI diagnostik.</p>
                </div>
                <div className="flex gap-2 sm:gap-3 shrink-0">
                    <button
                        onClick={() => { if (selectionMode) { setSelectionMode(false); setSelectedIds(new Set()); } else { setSelectionMode(true); } }}
                        className={`flex items-center gap-2 px-3 lg:px-4 py-2 rounded-lg text-sm font-bold border transition-colors ${selectionMode ? 'bg-primary/10 text-primary border-primary/30' : 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700'}`}
                    >
                        <span className="material-symbols-outlined text-lg">{selectionMode ? 'check_box' : 'check_box_outline_blank'}</span>
                        <span className="hidden sm:inline">Pilih</span>
                    </button>
                    <div className="relative" ref={exportMenuRef}>
                        <button
                            onClick={(e) => {
                                e.stopPropagation();
                                if (showExportMenu) {
                                    setShowExportMenu(false);
                                    setExportMenuPos(null);
                                    return;
                                }
                                const rect = exportMenuRef.current.getBoundingClientRect();
                                const menuWidth = 224; // w-56 approx
                                const top = rect.bottom + 8;
                                // if opening would overflow right edge, align to right side of button
                                if (rect.left + menuWidth > window.innerWidth) {
                                    const right = window.innerWidth - rect.right;
                                    setExportMenuPos({ top, right });
                                } else {
                                    setExportMenuPos({ top, left: rect.left });
                                }
                                setShowExportMenu(true);
                            }}
                            className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-colors"
                        >
                            <span className="material-symbols-outlined text-lg">download</span>
                            <span className="hidden sm:inline">Ekspor Data</span>
                            <span className="material-symbols-outlined text-sm transition-transform" style={{ transform: showExportMenu ? 'rotate(180deg)' : 'rotate(0deg)' }}>expand_more</span>
                        </button>
                        {showExportMenu && exportMenuPos && (
                            <div
                                ref={exportMenuFixedRef}
                                style={{ position: 'fixed', top: exportMenuPos.top, ...(exportMenuPos.left != null ? { left: exportMenuPos.left } : { right: exportMenuPos.right }), zIndex: 9999 }}
                                className="w-64 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-700 shadow-xl overflow-hidden animate-[fadeIn_0.15s_ease-out]"
                            >
                                {/* Header label */}
                                <div className="px-4 py-2 border-b border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50">
                                    <p className="text-[10px] font-black text-slate-400 uppercase tracking-wider">Opsi Ekspor</p>
                                </div>

                                {/* 1. PDF Laporan — instant summary list */}
                                <button
                                    onClick={() => {
                                        exportPatientListPDF(filteredPatients);
                                        setShowExportMenu(false);
                                        setExportMenuPos(null);
                                    }}
                                    className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors border-b border-slate-100 dark:border-slate-800"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-red-50 dark:bg-red-900/20 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-red-500 text-[18px]">summarize</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">PDF Laporan</p>
                                        <p className="text-[10px] text-slate-400">Ringkasan {filteredPatients.length} pasien</p>
                                    </div>
                                </button>

                                {/* 2. PDF Detail Pasien — enters selection mode */}
                                <button
                                    onClick={() => {
                                        setShowExportMenu(false);
                                        setExportMenuPos(null);
                                        setSelectionMode(true);
                                    }}
                                    className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-primary/5 dark:hover:bg-primary/10 transition-colors border-b border-slate-100 dark:border-slate-800"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-primary text-[18px]">clinical_notes</span>
                                    </div>
                                    <div className="min-w-0 flex-1">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">PDF Detail Pasien</p>
                                        <p className="text-[10px] text-slate-400">Pilih pasien, ekspor laporan lengkap</p>
                                    </div>
                                    <span className="material-symbols-outlined text-slate-300 text-base shrink-0">chevron_right</span>
                                </button>

                                {/* 3. Export JSON — instant raw data */}
                                <button
                                    onClick={() => {
                                        const isSelective = selectionMode && selectedIds.size > 0;
                                        const exportList = isSelective
                                            ? filteredPatients.filter(p => selectedIds.has(p.id))
                                            : filteredPatients;

                                        const data = JSON.stringify(exportList, null, 2);
                                        const blob = new Blob([data], { type: 'application/json' });
                                        const url = URL.createObjectURL(blob);
                                        const a = document.createElement('a');
                                        a.href = url; 
                                        const dateStr = new Date().toISOString().split('T')[0];
                                        a.download = isSelective ? `medterminal_selective_export_${dateStr}.json` : `medterminal_export_${dateStr}.json`;
                                        a.click();
                                        URL.revokeObjectURL(url);
                                        setShowExportMenu(false);
                                        setExportMenuPos(null);
                                    }}
                                    className="flex items-center gap-3 w-full px-4 py-3 text-left hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                                >
                                    <div className="w-8 h-8 rounded-lg bg-blue-50 dark:bg-blue-900/20 flex items-center justify-center shrink-0">
                                        <span className="material-symbols-outlined text-blue-500 text-[18px]">data_object</span>
                                    </div>
                                    <div className="min-w-0">
                                        <p className="text-sm font-bold text-slate-800 dark:text-white">Export JSON</p>
                                        <p className="text-[10px] text-slate-400">Data mentah untuk backup</p>
                                    </div>
                                </button>
                            </div>
                        )}
                    </div>
                    <button
                        onClick={() => navigate('/add-patient')}
                        className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-primary text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors shadow-lg shadow-primary/20"
                    >
                        <span className="material-symbols-outlined text-lg">person_add</span>
                        <span className="hidden sm:inline">Tambah Pasien</span>
                    </button>
                </div>
            </div>

            {/* Tab & Filter */}
            <div className="flex flex-col gap-4">

                {/* Stase Filter Bar */}
                {stases.length > 0 && (
                    <div className="flex flex-col gap-2">
                        <div className="flex items-center gap-2 overflow-x-auto pb-1 no-scrollbar">
                            {/* Semua Stase chip */}
                            <button
                                onClick={() => setSelectedStaseIds(null)}
                                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 border ${
                                    selectedStaseIds === null
                                        ? 'bg-slate-800 dark:bg-slate-100 text-white dark:text-slate-900 border-transparent shadow-sm'
                                        : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-slate-400'
                                }`}
                            >
                                <span className="material-symbols-outlined text-[14px]">layers</span>
                                Semua Stase
                            </button>

                            {stases.map(stase => {
                                const isActive = selectedStaseIds?.includes(stase.id);
                                const count = patients.filter(p => p.stase_id === stase.id).length;
                                return (
                                    <button
                                        key={stase.id}
                                        onClick={() => toggleStaseFilter(stase.id)}
                                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap transition-all shrink-0 border ${
                                            isActive
                                                ? 'text-white border-transparent shadow-sm'
                                                : 'bg-white dark:bg-slate-900 text-slate-500 border-slate-200 dark:border-slate-700 hover:border-current'
                                        }`}
                                        style={isActive ? { backgroundColor: stase.color, borderColor: stase.color } : { '--tw-ring-color': stase.color }}
                                    >
                                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: isActive ? 'rgba(255,255,255,0.7)' : stase.color }} />
                                        {stase.name}
                                        {count > 0 && (
                                            <span className={`px-1.5 py-0 rounded-full text-[10px] font-black ${
                                                isActive ? 'bg-white/20 text-white' : 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                            }`}>{count}</span>
                                        )}
                                    </button>
                                );
                            })}

                            {/* Create new stase shortcut */}
                            <button
                                onClick={() => navigate('/stase')}
                                className="flex items-center gap-1 px-3 py-1.5 rounded-full text-xs font-bold whitespace-nowrap text-slate-400 border border-dashed border-slate-300 dark:border-slate-700 hover:text-primary hover:border-primary/50 hover:bg-primary/5 transition-all shrink-0"
                            >
                                <span className="material-symbols-outlined text-[14px]">add</span>
                                Buat Stase
                            </button>
                        </div>
                    </div>
                )}
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-2 sm:gap-4 md:gap-6 overflow-x-auto">
                    {[
                        { key: 'all', label: 'Semua', count: tabCounts.all },
                        { key: 'active', label: 'Aktif', count: tabCounts.active },
                        { key: 'critical', label: 'Prioritas Tinggi', count: tabCounts.critical, color: 'bg-red-100 text-red-600' },
                        { key: 'improving', label: 'Membaik', count: tabCounts.improving, color: 'bg-green-100 text-green-600' },
                    ].map(tab => (
                        <button
                            key={tab.key}
                            onClick={() => setFilter(tab.key)}
                            className={`flex items-center gap-1.5 border-b-2 pb-3 px-1 transition-all whitespace-nowrap ${filter === tab.key
                                ? 'border-primary text-primary'
                                : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                                }`}
                        >
                            <span className="text-xs sm:text-sm font-bold">{tab.label}</span>
                            {tab.count > 0 && (
                                <span className={`px-1.5 py-0.5 rounded-full text-[10px] font-bold ${filter === tab.key
                                    ? 'bg-primary/10 text-primary'
                                    : tab.color || 'bg-slate-100 dark:bg-slate-800 text-slate-500'
                                    }`}>{tab.count}</span>
                            )}
                        </button>
                    ))}
                </div>

                {/* Pencarian & Sortir */}
                <div className="flex flex-col sm:flex-row gap-3 items-stretch sm:items-center sm:justify-between">
                    <div className="flex-1 min-w-0 max-w-xl">
                        <div className="flex w-full items-stretch rounded-xl h-11 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 shadow-sm overflow-hidden">
                            <div className="text-slate-400 flex items-center justify-center pl-4 shrink-0">
                                <span className="material-symbols-outlined text-xl">search</span>
                            </div>
                            <input
                                type="text"
                                value={search}
                                onChange={e => setSearch(e.target.value)}
                                className="flex w-full border-none bg-transparent text-slate-900 dark:text-slate-100 focus:ring-0 h-full placeholder:text-slate-400 px-3 text-sm min-w-0"
                                placeholder="Cari berdasarkan nama, diagnosis, atau gejala..."
                            />
                        </div>
                    </div>
                    <select
                        value={sortBy}
                        onChange={e => setSortBy(e.target.value)}
                        className="h-11 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 shrink-0"
                    >
                        <option value="updatedAt">Urutkan: Terbaru</option>
                        <option value="admission">Urutkan: Tanggal Masuk</option>
                        <option value="name">Urutkan: Nama</option>
                    </select>
                </div>
            </div>

            {/* Mode ekspor detail — hint banner */}
            {selectionMode && (
                <div className="flex items-center gap-2.5 px-4 py-2.5 bg-primary/5 border border-primary/20 rounded-xl animate-[fadeIn_0.2s_ease-out]">
                    <span className="material-symbols-outlined text-primary text-[18px] shrink-0">touch_app</span>
                    <span className="text-sm font-semibold text-primary/80">Mode ekspor detail aktif — ketuk pasien untuk memilih</span>
                </div>
            )}

            {/* Tabel Data */}
            {filteredPatients.length === 0 ? (
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-12 text-center">
                    <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-3 block">person_search</span>
                    <p className="text-sm font-semibold text-slate-400">{search ? 'Tidak ada pasien yang cocok' : 'Belum ada data pasien'}</p>
                    <p className="text-xs text-slate-400 mt-1">{search ? 'Coba kata kunci lain' : 'Mulai dengan menambahkan pasien baru'}</p>
                </div>
            ) : (
                <>
                    {/* Tabel Desktop */}
                    <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse min-w-175">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                        {selectionMode && <th className="pl-3 pr-0 py-3 w-8"></th>}
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">Info Pasien</th>
                                        <th className="px-2 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-10 text-center">Umur</th>
                                        <th className="px-2 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32.5">Tanda Vital</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider min-w-45">Keluhan & Gejala</th>
                                        <th className="px-2 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-28">Diagnosis</th>
                                        <th className="px-2 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-20">Kondisi</th>
                                        <th className="px-2 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-12">Rawat</th>
                                        <th className="px-2 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-10">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredPatients.map(p => (
                                        <tr
                                            key={p.id}
                                            onClick={() => selectionMode ? toggleSelect(p.id) : navigate(`/patient/${p.id}`)}
                                            className={`hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors cursor-pointer ${selectionMode && selectedIds.has(p.id) ? 'bg-primary/5 dark:bg-primary/10' : ''}`}
                                        >
                                            {selectionMode && (
                                                <td className="pl-3 pr-0 py-3 align-middle w-8" onClick={e => e.stopPropagation()}>
                                                    <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded accent-primary cursor-pointer" />
                                                </td>
                                            )}
                                            <td className="px-3 py-3 align-top">
                                                <div className="flex items-start gap-2 mt-1">
                                                    <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0 border border-slate-300 dark:border-slate-600 shadow-sm">
                                                        <span className="material-symbols-outlined text-slate-500 text-lg">person</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <div className="flex items-center gap-2">
                                                            <p className="text-sm font-bold text-slate-900 dark:text-white truncate" title={p.name}>{p.name}</p>
                                                            {p.allergies && (
                                                                <span className="bg-red-100 text-red-600 text-[9px] font-bold px-1.5 py-0.5 rounded border border-red-200 shrink-0 shadow-sm">Alergi</span>
                                                            )}
                                                        </div>
                                                        <p className="text-[10px] text-slate-500 truncate mt-0.5 font-medium">
                                                            {p.gender === 'female' ? 'P' : 'L'}
                                                            {p.medicalRecordNo && ` • RM: ${p.medicalRecordNo}`}
                                                            <span className="text-slate-400"> • {getRelativeTime(p.updatedAt)}</span>
                                                        </p>
                                                        {(() => {
                                                            const s = stases.find(st => st.id === p.stase_id);
                                                            return s ? (
                                                                <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white mt-1" style={{ backgroundColor: s.color }}>
                                                                    <span className="material-symbols-outlined text-[10px]">assignment</span>
                                                                    {s.name}
                                                                </span>
                                                            ) : null;
                                                        })()}
                                                        {(p.room || p.dpjp) && (
                                                            <div className="flex items-center gap-1 mt-1 truncate">
                                                                {p.room && <span className="text-[10px] text-primary font-bold bg-primary/10 px-1.5 py-0.5 rounded shrink-0">{p.room}</span>}
                                                                {p.dpjp && <span className="text-[10px] font-semibold text-slate-600 dark:text-slate-300 shrink-0">{p.dpjp}</span>}
                                                            </div>
                                                        )}
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 align-top"><div className="mt-1"><p className="text-xs text-center font-bold text-slate-700 dark:text-slate-300">{p.age || '-'}</p></div></td>
                                            <td className="px-2 py-3 align-top">
                                                <div className="flex flex-wrap gap-1 mt-1">
                                                    <span className={`whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${parseInt(p.bloodPressure) > 140 ? 'text-red-600 bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800' : 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>TD {p.bloodPressure || '-'}</span>
                                                    <span className="whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-md bg-slate-50 dark:bg-slate-800/50 border border-slate-100 dark:border-slate-800 text-slate-500">DJ {p.heartRate || '-'}</span>
                                                    <span className={`whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${parseFloat(p.temperature) > 37.5 ? 'text-red-600 bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800' : 'text-slate-600 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/50 border-slate-100 dark:border-slate-800'}`}>S {p.temperature || '-'}°</span>
                                                    <span className={`whitespace-nowrap text-[10px] font-bold px-1.5 py-0.5 rounded-md border ${parseFloat(p.spO2) < 95 ? 'text-red-600 bg-red-50 border-red-100 dark:bg-red-900/20 dark:border-red-800' : 'text-primary bg-primary/5 border-primary/20'}`}>SpO2 {p.spO2 || '-'}%</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 align-top pr-6">
                                                <div className="space-y-2.5">
                                                    {p.chiefComplaint && (
                                                        <div>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-0.5">Keluhan Utama</p>
                                                            <p className="text-xs font-semibold text-slate-700 dark:text-slate-300 leading-relaxed text-wrap">{p.chiefComplaint}</p>
                                                        </div>
                                                    )}
                                                    {p.symptoms && p.symptoms.length > 0 && (
                                                        <div>
                                                            <p className="text-[9px] font-black text-slate-400 uppercase tracking-widest mb-1.5 flex items-center gap-1"><span className="material-symbols-outlined text-[10px]">symptoms</span> Gejala ({p.symptoms.length})</p>
                                                            <div className="flex flex-wrap gap-1.5">
                                                                {p.symptoms.slice(0, 3).map((s, i) => (
                                                                    <span key={i} title={s.severity} className={`text-[9px] px-1.5 py-0.5 rounded font-bold border shadow-sm ${s.severity === 'berat' ? 'bg-red-50 text-red-600 border-red-100' : s.severity === 'sedang' ? 'bg-amber-50 text-amber-600 border-amber-100' : 'bg-green-50 text-green-600 border-green-100'}`}>
                                                                        {s.name}
                                                                    </span>
                                                                ))}
                                                                {p.symptoms.length > 3 && (
                                                                    <span className="text-[9px] px-1.5 py-0.5 rounded font-bold bg-slate-100 dark:bg-slate-800 text-slate-500 shadow-sm border border-slate-200 dark:border-slate-700">
                                                                        +{p.symptoms.length - 3}
                                                                    </span>
                                                                )}
                                                            </div>
                                                        </div>
                                                    )}
                                                    {(!p.chiefComplaint && (!p.symptoms || p.symptoms.length === 0)) && <span className="text-xs text-slate-400 italic">Belum ada catatan utama</span>}
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 align-top">
                                                <div className="mt-1">
                                                    {p.diagnosis ? (
                                                        <span title={p.diagnosis} className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-1.5 rounded-lg inline-block text-wrap border border-slate-200 dark:border-slate-700 shadow-sm leading-relaxed max-w-full">{p.diagnosis}</span>
                                                    ) : <span className="text-xs text-slate-400 italic">-</span>}
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 align-top"><div className="mt-1"><KondisiBadge kondisi={p.condition} /></div></td>
                                            <td className="px-2 py-3 align-top">
                                                <div className="mt-1 text-xs text-slate-500 font-bold bg-slate-50 dark:bg-slate-800 px-2 py-0.5 text-center rounded-md border border-slate-100 dark:border-slate-800 w-fit shrink-0">
                                                    {p.admissionDate ? `H${calculateDaysInHospital(p.admissionDate)}` : '-'}
                                                </div>
                                            </td>
                                            <td className="px-2 py-3 align-top text-right">
                                                <div className="mt-1 flex justify-end gap-0.5">
                                                    {stases.length > 0 && (
                                                        <button
                                                            onClick={(e) => openTransfer(e, p.id)}
                                                            className={`p-1.5 rounded-lg transition-colors ${
                                                                transferPatientId === p.id
                                                                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'
                                                                    : 'hover:bg-blue-50 dark:hover:bg-blue-900/20 text-slate-400 hover:text-blue-500'
                                                            }`}
                                                            title="Pindah ke Stase Lain"
                                                        >
                                                            <span className="material-symbols-outlined text-lg">swap_horiz</span>
                                                        </button>
                                                    )}
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openDeleteDialog(p); }}
                                                        className="p-1.5 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                                                        title="Hapus Pasien"
                                                    >
                                                        <span className="material-symbols-outlined text-lg">delete</span>
                                                    </button>
                                                </div>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 lg:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Menampilkan {filteredPatients.length} dari {patients.length} pasien{selectedStaseIds !== null && stases.length > 0 ? ` (filter stase aktif)` : ''}</span>
                        </div>
                    </div>

                    {/* Kartu Mobile */}
                    <div className="md:hidden space-y-3">
                        {filteredPatients.map(p => (
                            <div
                                key={p.id}
                                onClick={() => selectionMode ? toggleSelect(p.id) : navigate(`/patient/${p.id}`)}
                                className={`relative bg-white dark:bg-slate-900 rounded-xl border p-4 cursor-pointer transition-all ${selectionMode && selectedIds.has(p.id) ? 'border-primary ring-2 ring-primary/20 bg-primary/5 dark:bg-primary/10' : 'border-slate-200 dark:border-slate-800 hover:border-primary/30'}`}
                            >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        {selectionMode && (
                                            <div onClick={e => e.stopPropagation()}>
                                                <input type="checkbox" checked={selectedIds.has(p.id)} onChange={() => toggleSelect(p.id)} className="w-4 h-4 rounded accent-primary cursor-pointer shrink-0" />
                                            </div>
                                        )}
                                        <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center shrink-0">
                                            <span className="material-symbols-outlined text-slate-500">person</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold truncate">{p.name}</p>
                                            <p className="text-[10px] text-slate-500">{p.age ? `${p.age} th` : '-'} • {p.gender === 'female' ? 'Perempuan' : 'Laki-laki'} • {getRelativeTime(p.updatedAt)}</p>
                                            {/* Stase badge on mobile card */}
                                            {p.stase_id && (() => {
                                                const s = stases.find(st => st.id === p.stase_id);
                                                return s ? (
                                                    <span className="inline-flex items-center gap-1 text-[9px] font-bold px-1.5 py-0.5 rounded-full text-white mt-0.5" style={{ backgroundColor: s.color }}>
                                                        <span className="material-symbols-outlined text-[10px]">assignment</span>
                                                        {s.name}
                                                    </span>
                                                ) : null;
                                            })()}
                                        </div>
                                    </div>
                                    <div className="flex items-start gap-1 shrink-0">
                                        <KondisiBadge kondisi={p.condition} />
                                        {/* Mobile transfer button */}
                                        {stases.length > 0 && (
                                            <button
                                                onClick={(e) => openTransfer(e, p.id)}
                                                className={`p-1 rounded-lg transition-colors ${
                                                    transferPatientId === p.id
                                                        ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-500'
                                                        : 'text-slate-400 hover:text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20'
                                                }`}
                                                title="Pindah ke Stase Lain"
                                            >
                                                <span className="material-symbols-outlined text-base">swap_horiz</span>
                                            </button>
                                        )}
                                        {/* Mobile card action menu (three-dots) */}
                                        <div className="relative">
                                            <button
                                                onClick={(e) => { e.stopPropagation(); setOpenCardMenuId(openCardMenuId === p.id ? null : p.id); }}
                                                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 transition-colors"
                                                title="Menu"
                                            >
                                                <span className="material-symbols-outlined text-base">more_vert</span>
                                            </button>
                                            {openCardMenuId === p.id && (
                                                <div ref={cardMenuRef} className="absolute top-9 right-0 w-40 bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-lg z-40 overflow-hidden">
                                                    <button
                                                        onClick={(e) => { e.stopPropagation(); openDeleteDialog(p); setOpenCardMenuId(null); }}
                                                        className="w-full text-left px-3 py-2 hover:bg-red-50 dark:hover:bg-red-900/10 text-sm text-red-600"
                                                    >
                                                        Hapus
                                                    </button>
                                                </div>
                                            )}
                                        </div>
                                    </div>
                                </div>
                                {(p.chiefComplaint || p.diagnosis) && (
                                    <div className="space-y-1 mb-3">
                                        {p.chiefComplaint && <p className="text-xs text-slate-600 dark:text-slate-400 truncate"><span className="font-semibold">KU:</span> {p.chiefComplaint}</p>}
                                        {p.diagnosis && <p className="text-xs text-slate-600 dark:text-slate-400 truncate"><span className="font-semibold">Dx:</span> {p.diagnosis}</p>}
                                    </div>
                                )}
                                <div className="grid grid-cols-4 gap-2">
                                    {[
                                        { label: 'TD', value: p.bloodPressure, warn: parseInt(p.bloodPressure) > 140 },
                                        { label: 'DJ', value: p.heartRate },
                                        { label: 'Suhu', value: p.temperature ? `${p.temperature}°` : null, warn: parseFloat(p.temperature) > 37.5 },
                                        { label: 'SpO2', value: p.spO2 ? `${p.spO2}%` : null, warn: parseFloat(p.spO2) < 95 },
                                    ].map(v => (
                                        <div key={v.label} className="text-center p-1.5 bg-slate-50 dark:bg-slate-800 rounded-lg">
                                            <p className="text-[9px] text-slate-400 uppercase font-bold">{v.label}</p>
                                            <p className={`text-xs font-bold ${v.warn ? 'text-red-500' : ''}`}>{v.value || '-'}</p>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        ))}
                        <p className="text-xs text-center text-slate-400 py-2">Menampilkan {filteredPatients.length} dari {patients.length} pasien</p>
                    </div>
                </>
            )}

            {/* Widget Bawah */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Total Data</h3>
                        <span className="material-symbols-outlined text-slate-400 text-xl">bar_chart</span>
                    </div>
                    <div className="space-y-2">
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Total Gejala</span>
                            <span className="font-bold">{patients.reduce((a, p) => a + (p.symptoms || []).length, 0)}</span>
                        </div>
                        <div className="flex justify-between items-center text-xs">
                            <span className="text-slate-500">Total Pemeriksaan</span>
                            <span className="font-bold">{patients.reduce((a, p) => a + (p.supportingExams || []).length, 0)}</span>
                        </div>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">Rata-rata Rawat</h3>
                        <span className="material-symbols-outlined text-slate-400 text-xl">schedule</span>
                    </div>
                    <div className="flex items-baseline gap-2">
                        <span className="text-3xl font-black">
                            {patients.filter(p => p.admissionDate).length > 0
                                ? Math.round(patients.filter(p => p.admissionDate).reduce((a, p) => a + calculateDaysInHospital(p.admissionDate), 0) / patients.filter(p => p.admissionDate).length)
                                : 0}
                        </span>
                        <span className="text-sm font-medium text-slate-500">hari</span>
                    </div>
                </div>
                <div className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-3">
                        <h3 className="text-xs font-bold text-slate-900 dark:text-white uppercase tracking-wider">AI Insights</h3>
                        <span className="material-symbols-outlined text-primary text-xl">verified</span>
                    </div>
                    <p className="text-xs text-slate-500">Klik pasien untuk melihat analisis AI pada halaman detail.</p>
                </div>
            </div>

            {/* Fixed bottom selection action bar */}
            {selectionMode && (
                <SelectionActionBar
                    selectedCount={selectedIds.size}
                    totalCount={filteredPatients.length}
                    onSelectAll={selectAll}
                    onClear={clearAll}
                    onExport={() => {
                        // Open reorder modal with selected patients in current display order
                        const ordered = filteredPatients.filter(p => selectedIds.has(p.id)).map(p => p.id);
                        setReorderList(ordered);
                        setShowReorderModal(true);
                    }}
                    onExportJSON={() => {
                        const selectedPatients = filteredPatients.filter(p => selectedIds.has(p.id));
                        const data = JSON.stringify(selectedPatients, null, 2);
                        const blob = new Blob([data], { type: 'application/json' });
                        const url = URL.createObjectURL(blob);
                        const a = document.createElement('a');
                        a.href = url;
                        a.download = `medterminal_selective_export_${new Date().toISOString().split('T')[0]}.json`;
                        a.click();
                        URL.revokeObjectURL(url);
                    }}
                    onExit={exitSelection}
                />
            )}

            {/* Reorder modal */}
            {showReorderModal && (
                <ReorderModal
                    patients={patients}
                    reorderList={reorderList}
                    setReorderList={setReorderList}
                    onConfirm={() => {
                        const ordered = reorderList.map(id => patients.find(p => p.id === id)).filter(Boolean);
                        exportMultiplePatientsPDF(ordered, user?.user_metadata?.pdf_export_prefs || {});
                        setShowReorderModal(false);
                        exitSelection();
                    }}
                    onClose={() => setShowReorderModal(false)}
                />
            )}

            <ConfirmDialog
                open={Boolean(deleteTargetPatient)}
                title="Hapus pasien dari daftar?"
                message={deleteTargetPatient
                    ? `Data pasien ${deleteTargetPatient.name || 'tanpa nama'} akan dihapus permanen dari daftar pasien. Tindakan ini tidak bisa dibatalkan.`
                    : ''}
                confirmLabel="Ya, Hapus"
                cancelLabel="Batal"
                danger
                onCancel={closeDeleteDialog}
                onConfirm={confirmDeletePatient}
            />
        </div>
    );
}

function ReorderModal({ patients, reorderList, setReorderList, onConfirm, onClose }) {
    const dragIdx = useRef(null);
    const [draggingIdx, setDraggingIdx] = useState(null);
    const orderedPatients = reorderList.map(id => patients.find(p => p.id === id)).filter(Boolean);

    const moveUp = (idx) => {
        if (idx === 0) return;
        const next = [...reorderList];
        [next[idx - 1], next[idx]] = [next[idx], next[idx - 1]];
        setReorderList(next);
    };
    const moveDown = (idx) => {
        if (idx === reorderList.length - 1) return;
        const next = [...reorderList];
        [next[idx], next[idx + 1]] = [next[idx + 1], next[idx]];
        setReorderList(next);
    };
    const handleDragStart = (idx) => {
        dragIdx.current = idx;
        setDraggingIdx(idx);
    };
    const handleDragOver = (e, idx) => {
        e.preventDefault();
        if (dragIdx.current === null || dragIdx.current === idx) return;
        const next = [...reorderList];
        const [dragged] = next.splice(dragIdx.current, 1);
        next.splice(idx, 0, dragged);
        dragIdx.current = idx;
        setDraggingIdx(idx);
        setReorderList(next);
    };
    const handleDragEnd = () => {
        dragIdx.current = null;
        setDraggingIdx(null);
    };

    return (
            <div className="fixed inset-0 z-60 flex items-end sm:items-center justify-center">
            {/* Backdrop */}
            <div className="absolute inset-0 bg-black/50 backdrop-blur-sm" onClick={onClose} />

            {/* Modal card — bottom sheet on mobile, centered on sm+ */}
            <div className="relative bg-white dark:bg-slate-900 w-full sm:max-w-md rounded-t-2xl sm:rounded-2xl shadow-2xl flex flex-col max-h-[88dvh] sm:max-h-[80dvh] animate-[fadeIn_0.2s_ease-out]">

                {/* Header */}
                <div className="flex items-center justify-between px-5 py-4 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <div>
                        <h2 className="text-base font-bold text-slate-900 dark:text-white">Atur Urutan Halaman PDF</h2>
                        <p className="text-xs text-slate-400 mt-0.5">Seret atau gunakan tombol panah untuk mengubah urutan</p>
                    </div>
                    <button
                        onClick={onClose}
                        className="w-8 h-8 rounded-full flex items-center justify-center hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">close</span>
                    </button>
                </div>

                {/* Info bar */}
                <div className="px-5 py-2 bg-primary/5 border-b border-slate-100 dark:border-slate-800 shrink-0">
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                        <span className="font-bold text-primary">{reorderList.length} pasien</span>
                        {' — setiap pasien menjadi satu set halaman dalam PDF'}
                    </p>
                </div>

                {/* Scrollable list */}
                <div className="flex-1 overflow-y-auto py-2.5 px-3">
                    {orderedPatients.map((p, idx) => (
                        <div
                            key={p.id}
                            draggable
                            onDragStart={() => handleDragStart(idx)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDragEnd={handleDragEnd}
                            className={`flex items-center gap-2.5 px-3 py-2.5 mb-1.5 rounded-xl border select-none transition-all ${
                                draggingIdx === idx
                                    ? 'opacity-40 bg-primary/5 border-primary/30 scale-[0.98]'
                                    : 'bg-white dark:bg-slate-800/60 border-slate-100 dark:border-slate-700/60 hover:border-slate-300 dark:hover:border-slate-600'
                            }`}
                        >
                            {/* Page number badge */}
                            <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                <span className="text-[11px] font-black text-primary">{idx + 1}</span>
                            </div>

                            {/* Drag handle — desktop only visual, drag still works everywhere */}
                            <span className="material-symbols-outlined text-slate-300 dark:text-slate-600 text-[18px] shrink-0 cursor-grab active:cursor-grabbing">drag_indicator</span>

                            {/* Patient info */}
                            <div className="flex-1 min-w-0">
                                <p className="text-sm font-bold text-slate-800 dark:text-slate-100 truncate">{p.name || '-'}</p>
                                <p className="text-[10px] text-slate-400 truncate mt-0.5">{p.diagnosis || 'Tidak ada diagnosis'}</p>
                            </div>

                            {/* Condition badge */}
                            <KondisiBadge kondisi={p.condition} />

                            {/* Up / Down buttons */}
                            <div className="flex flex-col gap-0.5 shrink-0">
                                <button
                                    onClick={() => moveUp(idx)}
                                    disabled={idx === 0}
                                    className="w-6 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[14px]">expand_less</span>
                                </button>
                                <button
                                    onClick={() => moveDown(idx)}
                                    disabled={idx === reorderList.length - 1}
                                    className="w-6 h-5 flex items-center justify-center rounded hover:bg-slate-100 dark:hover:bg-slate-700 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 disabled:opacity-20 disabled:cursor-not-allowed transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[14px]">expand_more</span>
                                </button>
                            </div>
                        </div>
                    ))}
                </div>

                {/* Footer */}
                <div className="shrink-0 px-5 py-4 border-t border-slate-100 dark:border-slate-800 flex gap-3">
                    <button
                        onClick={onClose}
                        className="flex-1 px-4 py-2.5 rounded-xl text-sm font-semibold text-slate-600 dark:text-slate-300 border border-slate-200 dark:border-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors"
                    >
                        Kembali
                    </button>
                    <button
                        onClick={onConfirm}
                        className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl text-sm font-bold bg-primary text-white hover:bg-blue-600 shadow-lg shadow-primary/25 active:scale-95 transition-all"
                    >
                        <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                        <span>Export PDF ({reorderList.length})</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

function SelectionActionBar({ selectedCount, totalCount, onSelectAll, onClear, onExport, onExportJSON, onExit }) {
    return (
        <div className="fixed bottom-0 left-0 right-0 z-50 animate-[fadeIn_0.2s_ease-out]">
            <div className="bg-white dark:bg-slate-900 border-t-2 border-primary/30 shadow-2xl shadow-slate-900/20">
                <div className="max-w-screen-2xl mx-auto px-4 md:px-6 lg:px-8 py-3 sm:py-4">
                    <div className="flex flex-col sm:flex-row sm:items-center gap-2.5 sm:gap-4">

                        {/* Count + bulk controls */}
                        <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0 flex-wrap">
                            <div className="flex items-center gap-2">
                                <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center shrink-0">
                                    <span className="material-symbols-outlined text-primary text-[14px]">check_circle</span>
                                </div>
                                <span className="text-sm font-bold text-slate-700 dark:text-slate-200">
                                    {selectedCount > 0 ? `${selectedCount} pasien dipilih` : 'Ketuk pasien untuk memilih'}
                                </span>
                            </div>
                            {selectedCount < totalCount && (
                                <button onClick={onSelectAll} className="text-xs font-bold text-primary hover:text-blue-700 hover:underline transition-colors shrink-0">
                                    Pilih Semua ({totalCount})
                                </button>
                            )}
                            {selectedCount > 0 && (
                                <button onClick={onClear} className="text-xs font-semibold text-slate-400 hover:text-slate-600 dark:hover:text-slate-300 hover:underline transition-colors shrink-0">
                                    Batal Pilih
                                </button>
                            )}
                        </div>

                        {/* Action buttons */}
                        <div className="flex items-center gap-2 shrink-0">
                            <button
                                onClick={onExit}
                                className="flex items-center gap-1.5 px-3 py-2 rounded-lg text-sm font-semibold text-slate-500 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-700 transition-colors"
                            >
                                <span className="material-symbols-outlined text-base">close</span>
                                <span>Batal</span>
                            </button>
                            <button
                                onClick={onExport}
                                disabled={selectedCount === 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 sm:flex-none justify-center whitespace-nowrap ${
                                    selectedCount > 0
                                        ? 'bg-primary text-white hover:bg-blue-600 shadow-lg shadow-primary/25 active:scale-95'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">picture_as_pdf</span>
                                <span>PDF ({selectedCount})</span>
                            </button>
                            <button
                                onClick={onExportJSON}
                                disabled={selectedCount === 0}
                                className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-bold transition-all flex-1 sm:flex-none justify-center whitespace-nowrap ${
                                    selectedCount > 0
                                        ? 'bg-blue-500 text-white hover:bg-blue-600 shadow-lg shadow-blue-500/25 active:scale-95'
                                        : 'bg-slate-100 dark:bg-slate-800 text-slate-400 dark:text-slate-600 cursor-not-allowed'
                                }`}
                            >
                                <span className="material-symbols-outlined text-base">data_object</span>
                                <span>JSON ({selectedCount})</span>
                            </button>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}

function KondisiBadge({ kondisi }) {
    const styles = {
        critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400',
        urgent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
        stable: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400',
        improving: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    };
    const labels = { critical: 'Kritis', urgent: 'Mendesak', stable: 'Stabil', improving: 'Membaik' };
    return (
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${styles[kondisi] || styles.stable}`}>
            {labels[kondisi] || 'Stabil'}
        </span>
    );
}
