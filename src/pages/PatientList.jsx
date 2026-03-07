import { useState, useMemo } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { calculateDaysInHospital, getRelativeTime } from '../services/dataService';

export default function PatientList() {
    const navigate = useNavigate();
    const { patients, deletePatient } = usePatients();
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    const [sortBy, setSortBy] = useState('updatedAt');

    const filteredPatients = useMemo(() => {
        let result = [...patients];
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
            if (sortBy === 'name') return (a.name || '').localeCompare(b.name || '');
            if (sortBy === 'admission') return new Date(b.admissionDate || 0) - new Date(a.admissionDate || 0);
            return new Date(b.updatedAt || 0) - new Date(a.updatedAt || 0);
        });
        return result;
    }, [patients, search, filter, sortBy]);

    const tabCounts = {
        all: patients.length,
        active: patients.filter(p => p.status !== 'discharged').length,
        critical: patients.filter(p => p.condition === 'critical').length,
        improving: patients.filter(p => p.condition === 'improving').length,
    };

    return (
        <div className="flex-1 flex flex-col p-4 md:p-6 lg:p-8 gap-5 lg:gap-6 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Judul */}
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-slate-900 dark:text-white text-2xl md:text-3xl font-black leading-tight tracking-tight">Daftar Pasien</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Dashboard klinis real-time dengan AI diagnostik.</p>
                </div>
                <div className="flex gap-2 sm:gap-3 flex-shrink-0">
                    <button
                        onClick={() => {
                            const data = JSON.stringify(patients, null, 2);
                            const blob = new Blob([data], { type: 'application/json' });
                            const url = URL.createObjectURL(blob);
                            const a = document.createElement('a');
                            a.href = url; a.download = `medterminal_export_${new Date().toISOString().split('T')[0]}.json`; a.click();
                            URL.revokeObjectURL(url);
                        }}
                        className="flex items-center gap-2 px-3 lg:px-4 py-2 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-200 rounded-lg text-sm font-bold border border-slate-200 dark:border-slate-700 hover:bg-slate-200 transition-colors"
                    >
                        <span className="material-symbols-outlined text-lg">download</span>
                        <span className="hidden sm:inline">Ekspor Data</span>
                    </button>
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
                            <div className="text-slate-400 flex items-center justify-center pl-4 flex-shrink-0">
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
                        className="h-11 px-3 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl text-xs font-semibold text-slate-600 dark:text-slate-400 flex-shrink-0"
                    >
                        <option value="updatedAt">Urutkan: Terbaru</option>
                        <option value="admission">Urutkan: Tanggal Masuk</option>
                        <option value="name">Urutkan: Nama</option>
                    </select>
                </div>
            </div>

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
                    <div className="hidden md:block bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                        <div className="overflow-x-auto custom-scrollbar">
                            <table className="w-full text-left border-collapse min-w-[900px]">
                                <thead>
                                    <tr className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-800">
                                        <th className="px-4 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-52">Info Pasien</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-14 text-center">Umur</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-32">Tanda Vital</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-44">Keluhan Utama</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-36">Diagnosis</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-24">Kondisi</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider w-16">Rawat</th>
                                        <th className="px-3 py-3 text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider text-right w-14">Aksi</th>
                                    </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                                    {filteredPatients.map(p => (
                                        <tr
                                            key={p.id}
                                            onClick={() => navigate(`/patient/${p.id}`)}
                                            className="hover:bg-slate-50/80 dark:hover:bg-slate-800/30 transition-colors cursor-pointer"
                                        >
                                            <td className="px-4 py-3">
                                                <div className="flex items-center gap-3">
                                                    <div className="size-8 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                                        <span className="material-symbols-outlined text-slate-500 text-lg">person</span>
                                                    </div>
                                                    <div className="min-w-0">
                                                        <p className="text-sm font-bold text-slate-900 dark:text-white truncate">{p.name}</p>
                                                        <p className="text-[10px] text-slate-500">{p.gender === 'female' ? 'P' : 'L'} • {getRelativeTime(p.updatedAt)}</p>
                                                    </div>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3 text-xs text-center font-medium">{p.age || '-'}</td>
                                            <td className="px-3 py-3">
                                                <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[10px] font-semibold">
                                                    <span className={parseInt(p.bloodPressure) > 140 ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}>TD {p.bloodPressure || '-'}</span>
                                                    <span className="text-slate-400">DJ {p.heartRate || '-'}</span>
                                                    <span className={parseFloat(p.temperature) > 37.5 ? 'text-red-500' : 'text-slate-600 dark:text-slate-400'}>S {p.temperature || '-'}°C</span>
                                                    <span className={parseFloat(p.spO2) < 95 ? 'text-red-500' : 'text-primary'}>SpO2 {p.spO2 || '-'}%</span>
                                                </div>
                                            </td>
                                            <td className="px-3 py-3"><p className="text-xs font-medium truncate max-w-[180px]">{p.chiefComplaint || '-'}</p></td>
                                            <td className="px-3 py-3">
                                                {p.diagnosis ? (
                                                    <span className="text-xs font-bold text-slate-700 dark:text-slate-300 bg-slate-100 dark:bg-slate-800 px-2 py-0.5 rounded inline-block truncate max-w-[140px]">{p.diagnosis}</span>
                                                ) : <span className="text-xs text-slate-400">-</span>}
                                            </td>
                                            <td className="px-3 py-3"><KondisiBadge kondisi={p.condition} /></td>
                                            <td className="px-3 py-3 text-xs text-slate-500 font-medium">
                                                {p.admissionDate ? `H${calculateDaysInHospital(p.admissionDate)}` : '-'}
                                            </td>
                                            <td className="px-3 py-3 text-right">
                                                <button
                                                    onClick={(e) => { e.stopPropagation(); if (confirm('Hapus pasien ini?')) deletePatient(p.id); }}
                                                    className="p-1.5 rounded hover:bg-red-50 dark:hover:bg-red-900/20 text-slate-400 hover:text-red-500 transition-colors"
                                                >
                                                    <span className="material-symbols-outlined text-lg">delete</span>
                                                </button>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                        <div className="px-4 lg:px-6 py-3 border-t border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900">
                            <span className="text-xs font-medium text-slate-500 dark:text-slate-400">Menampilkan {filteredPatients.length} dari {patients.length} pasien</span>
                        </div>
                    </div>

                    {/* Kartu Mobile */}
                    <div className="md:hidden space-y-3">
                        {filteredPatients.map(p => (
                            <div
                                key={p.id}
                                onClick={() => navigate(`/patient/${p.id}`)}
                                className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 cursor-pointer hover:border-primary/30 transition-all"
                            >
                                <div className="flex items-start justify-between gap-3 mb-3">
                                    <div className="flex items-center gap-3 min-w-0">
                                        <div className="size-10 rounded-full bg-slate-200 dark:bg-slate-700 flex items-center justify-center flex-shrink-0">
                                            <span className="material-symbols-outlined text-slate-500">person</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-sm font-bold truncate">{p.name}</p>
                                            <p className="text-[10px] text-slate-500">{p.age ? `${p.age} th` : '-'} • {p.gender === 'female' ? 'Perempuan' : 'Laki-laki'} • {getRelativeTime(p.updatedAt)}</p>
                                        </div>
                                    </div>
                                    <KondisiBadge kondisi={p.condition} />
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
        <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0 ${styles[kondisi] || styles.stable}`}>
            {labels[kondisi] || 'Stabil'}
        </span>
    );
}
