import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { useStase } from '../context/StaseContext';
import { useSchedule } from '../context/ScheduleContext';
import { calculateRecoveryProgress, getRelativeTime } from '../services/dataService';

const SCHED_CATS = [
    { id: 'pasien',  label: 'Pasien',  color: '#3b82f6', pill: 'bg-blue-100 text-blue-700 dark:bg-blue-900/50 dark:text-blue-300'    },
    { id: 'operasi', label: 'Operasi', color: '#ef4444', pill: 'bg-red-100 text-red-700 dark:bg-red-900/50 dark:text-red-300'          },
    { id: 'rapat',   label: 'Rapat',   color: '#8b5cf6', pill: 'bg-violet-100 text-violet-700 dark:bg-violet-900/50 dark:text-violet-300' },
    { id: 'jaga',    label: 'Jaga',    color: '#f97316', pill: 'bg-orange-100 text-orange-700 dark:bg-orange-900/50 dark:text-orange-300' },
    { id: 'pribadi', label: 'Pribadi', color: '#22c55e', pill: 'bg-green-100 text-green-700 dark:bg-green-900/50 dark:text-green-300'   },
    { id: 'lainnya', label: 'Lainnya', color: '#64748b', pill: 'bg-slate-100 text-slate-700 dark:bg-slate-700/50 dark:text-slate-300'   },
];
function getScat(id) { return SCHED_CATS.find(c => c.id === id) || SCHED_CATS[5]; }

import { useRef, useLayoutEffect, useState } from 'react';

export default function Dashboard() {
    const navigate = useNavigate();
    const { patients } = usePatients();
    const { pinnedStase, stases } = useStase();
    const { schedules } = useSchedule();

    const aksiRef = useRef(null);
    const leftColRef = useRef(null);
    const jadwalContentRef = useRef(null);
    const [aksiHeight, setAksiHeight] = useState(null);
    const [jadwalContentMax, setJadwalContentMax] = useState(null);

    useLayoutEffect(() => {
        const measureAll = () => {
            if (aksiRef.current) {
                setAksiHeight(Math.round(aksiRef.current.getBoundingClientRect().height));
            }
            if (leftColRef.current && jadwalContentRef.current) {
                const leftRect = leftColRef.current.getBoundingClientRect();
                const contentRect = jadwalContentRef.current.getBoundingClientRect();
                const padding = 16; // small gap
                const maxH = Math.max(0, Math.floor(leftRect.bottom - contentRect.top - padding));
                setJadwalContentMax(maxH);
            }
        };

        measureAll();
        let ro = null;
        if (window.ResizeObserver) {
            ro = new ResizeObserver(() => measureAll());
            if (aksiRef.current) ro.observe(aksiRef.current);
            if (leftColRef.current) ro.observe(leftColRef.current);
            if (jadwalContentRef.current) ro.observe(jadwalContentRef.current);
        }
        window.addEventListener('resize', measureAll);
        return () => {
            window.removeEventListener('resize', measureAll);
            if (ro) ro.disconnect();
        };
    }, [aksiRef.current, leftColRef.current, jadwalContentRef.current]);

    const todayStr = (() => {
        const d = new Date();
        return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,'0')}-${String(d.getDate()).padStart(2,'0')}`;
    })();
    const todaySchedules = schedules
        .filter(ev => ev.date === todayStr)
        .sort((a, b) => {
            if (a.isAllDay && !b.isAllDay) return -1;
            if (!a.isAllDay && b.isAllDay) return 1;
            return (a.startTime || '').localeCompare(b.startTime || '');
        });

    const activePatients = patients.filter(p => p.status !== 'discharged');
    const criticalPatients = patients.filter(p => p.condition === 'critical');
    const todayReports = patients.reduce((acc, p) => {
        const today = new Date().toDateString();
        return acc + (p.dailyReports || []).filter(r => new Date(r.date).toDateString() === today).length;
    }, 0);
    // UI-only: Treat patients with condition 'improving' as "Pasien Pulang" on the Dashboard.
    // This does NOT modify the underlying `status` field or persisted data — it's a display rule only.
    const dischargedCount = patients.filter(p => p.condition === 'improving').length;

    const dayName = new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long' });

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Hero */}
            <section>
                <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
                    <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                            <h2 className="text-2xl md:text-3xl font-black tracking-tight text-slate-900 dark:text-white">Ringkasan Klinis</h2>
                            {pinnedStase ? (
                                <span className="inline-flex items-center gap-1.5 text-xs font-bold px-2.5 py-1 rounded-full text-white shadow-sm" style={{ backgroundColor: pinnedStase.color }}>
                                    <span className="material-symbols-outlined text-[14px]">push_pin</span>
                                    {pinnedStase.name}
                                </span>
                            ) : stases.length > 0 ? (
                                <button
                                    onClick={() => navigate('/stase')}
                                    className="inline-flex items-center gap-1 text-xs font-semibold px-2.5 py-1 rounded-full border border-dashed border-slate-300 dark:border-slate-600 text-slate-400 hover:text-primary hover:border-primary/50 transition-colors"
                                >
                                    <span className="material-symbols-outlined text-[14px]">keep</span>
                                    Pin stase aktif
                                </button>
                            ) : null}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 mt-1 text-sm">Selamat datang kembali. Dashboard Anda untuk {dayName}.</p>
                    </div>
                    <button
                        onClick={() => navigate('/add-patient')}
                        className="bg-primary text-white px-4 py-2.5 rounded-lg font-semibold flex items-center justify-center gap-2 shadow-lg shadow-primary/20 hover:bg-primary/90 transition-all text-sm shrink-0 w-full sm:w-auto"
                    >
                        <span className="material-symbols-outlined text-xl">add</span>
                        Pasien Baru
                    </button>
                </div>

                {/* Stats Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4 lg:gap-6">
                    {/* Pasien Aktif */}
                    <div className="bg-white dark:bg-slate-900 p-5 lg:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-primary/50 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400 rounded-lg">
                                <span className="material-symbols-outlined">assignment_ind</span>
                            </div>
                            {activePatients.length > 0 && (
                                <span className="text-xs font-bold px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">trending_up</span>
                                    Aktif
                                </span>
                            )}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Pasien Aktif</p>
                        <h3 className="text-3xl font-bold mt-1">{String(activePatients.length).padStart(2, '0')}</h3>
                        <p className="text-xs text-slate-400 mt-3">{todayReports} laporan hari ini</p>
                    </div>

                    {/* Pasien Risiko Tinggi */}
                    <div className="bg-white dark:bg-slate-900 p-5 lg:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-red-500/50 transition-all">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400 rounded-lg">
                                <span className="material-symbols-outlined">emergency</span>
                            </div>
                            {criticalPatients.length > 0 && (
                                <span className="text-xs font-bold px-2 py-1 bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-full flex items-center gap-1">
                                    <span className="material-symbols-outlined text-sm">priority_high</span>
                                    Darurat
                                </span>
                            )}
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Risiko Tinggi</p>
                        <h3 className={`text-3xl font-bold mt-1 ${criticalPatients.length > 0 ? 'text-red-600 dark:text-red-500' : ''}`}>
                            {String(criticalPatients.length).padStart(2, '0')}
                        </h3>
                        <p className="text-xs text-slate-400 mt-3">Butuh tindak lanjut segera</p>
                    </div>

                    {/* Pasien Pulang */}
                    <div className="bg-white dark:bg-slate-900 p-5 lg:p-6 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm hover:border-green-500/50 transition-all sm:col-span-2 md:col-span-1">
                        <div className="flex justify-between items-start mb-4">
                            <div className="p-3 bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400 rounded-lg">
                                <span className="material-symbols-outlined">task_alt</span>
                            </div>
                            <span className="text-xs font-bold px-2 py-1 bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-400 rounded-full flex items-center gap-1">
                                <span className="material-symbols-outlined text-sm">done_all</span>
                                Selesai
                            </span>
                        </div>
                        <p className="text-slate-500 dark:text-slate-400 font-medium text-sm">Pasien Pulang</p>
                        <h3 className="text-3xl font-bold mt-1">{String(dischargedCount).padStart(2, '0')}</h3>
                        <div className="w-full bg-slate-100 dark:bg-slate-800 h-1.5 rounded-full mt-3 overflow-hidden">
                            <div className="bg-green-500 h-full rounded-full transition-all duration-1000" style={{ width: `${patients.length > 0 ? Math.round((dischargedCount / patients.length) * 100) : 0}%` }} />
                        </div>
                    </div>
                </div>
            </section>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6 lg:gap-8">
                {/* Kolom Kiri */}
                <div ref={leftColRef} className="md:col-span-2 space-y-6 lg:space-y-8 min-w-0">
                    {/* Aksi Cepat */}
                    <section ref={aksiRef}>
                        <h3 className="text-lg lg:text-xl font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">edit_square</span>
                            Aksi Cepat
                        </h3>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:gap-4">
                            {[
                                { icon: 'person_add', title: 'Pasien Baru', desc: 'Mulai sesi diagnostik baru', path: '/add-patient' },
                                { icon: 'description', title: 'Catatan Klinis', desc: 'Catat observasi atau temuan', path: '/patients' },
                                { icon: 'prescriptions', title: 'Resep Obat', desc: 'Kelola resep dan pengobatan', path: '/patients' },
                                { icon: 'labs', title: 'Pemeriksaan Lab', desc: 'Pesan pemeriksaan darah atau pencitraan', path: '/patients' },
                            ].map(item => (
                                <button
                                    key={item.title}
                                    onClick={() => navigate(item.path)}
                                    className="flex flex-col items-start p-4 lg:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-all text-left group"
                                >
                                    <div className="size-10 rounded-lg bg-primary/10 text-primary flex items-center justify-center mb-3 group-hover:scale-110 transition-transform shrink-0">
                                        <span className="material-symbols-outlined">{item.icon}</span>
                                    </div>
                                    <span className="font-bold text-slate-900 dark:text-white text-sm">{item.title}</span>
                                    <span className="text-xs text-slate-500 mt-1">{item.desc}</span>
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Aktivitas Terbaru */}
                    <section>
                        <h3 className="text-lg lg:text-xl font-bold mb-4 flex items-center justify-between">
                            <span className="flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">history</span>
                                Aktivitas Terbaru
                            </span>
                            <button onClick={() => navigate('/patients')} className="text-sm text-primary font-semibold hover:underline">Lihat Semua</button>
                        </h3>
                        <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 divide-y divide-slate-100 dark:divide-slate-800 overflow-hidden">
                            {patients.length === 0 ? (
                                <div className="p-8 text-center">
                                    <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2 block">person_search</span>
                                    <p className="text-sm text-slate-400">Belum ada data pasien. Mulai dengan menambahkan pasien baru.</p>
                                </div>
                            ) : (
                                [...patients].sort((a, b) => new Date(b.updatedAt) - new Date(a.updatedAt)).slice(0, 5).map(patient => (
                                    <div
                                        key={patient.id}
                                        onClick={() => navigate(`/patient/${patient.id}`)}
                                        className="p-3 lg:p-4 flex items-center gap-3 lg:gap-4 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors cursor-pointer"
                                    >
                                        <div className="size-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-primary shrink-0">
                                            <span className="material-symbols-outlined">person</span>
                                        </div>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate">{patient.name}</p>
                                            <p className="text-xs text-slate-500 truncate">{patient.chiefComplaint || patient.diagnosis || 'Belum ada keluhan'} • {getRelativeTime(patient.updatedAt)}</p>
                                        </div>
                                        <KondisiBadge kondisi={patient.condition} />
                                    </div>
                                ))
                            )}
                        </div>
                    </section>
                </div>

                {/* Kolom Kanan */}
                <div className="space-y-6 min-w-0">
                    {/* Jadwal Hari Ini */}
                    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col overflow-hidden" style={aksiHeight ? { minHeight: aksiHeight } : undefined}>
                        <div className="flex items-center justify-between px-5 lg:px-6 pt-5 lg:pt-6 pb-3 shrink-0">
                            <h3 className="text-base lg:text-lg font-bold flex items-center gap-2">
                                <span className="material-symbols-outlined text-primary">today</span>
                                Jadwal Hari Ini
                            </h3>
                            <button onClick={() => navigate('/schedule')} className="text-sm text-primary font-semibold hover:underline shrink-0">
                                Lihat Semua
                            </button>
                        </div>

                        <p className="text-xs text-slate-400 dark:text-slate-500 px-5 lg:px-6 pb-3 shrink-0">
                            {new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
                        </p>

                        {todaySchedules.length === 0 ? (
                            <div className="flex flex-col items-center justify-center py-10 text-center px-5">
                                <div className="w-14 h-14 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mb-3">
                                    <span className="material-symbols-outlined text-2xl text-slate-300 dark:text-slate-600">event_busy</span>
                                </div>
                                <p className="text-sm font-medium text-slate-500 dark:text-slate-400">Tidak ada jadwal hari ini</p>
                                <button
                                    onClick={() => navigate('/schedule')}
                                    className="mt-3 text-xs font-semibold text-primary hover:underline flex items-center gap-1"
                                >
                                    <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                    Tambah Jadwal
                                </button>
                            </div>
                        ) : (
                            <div ref={jadwalContentRef} className="overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800/70" style={jadwalContentMax ? { maxHeight: jadwalContentMax } : undefined}>
                                {todaySchedules.map(ev => {
                                    const cat = getScat(ev.category);
                                    return (
                                        <div
                                            key={ev.id}
                                            onClick={() => navigate('/schedule')}
                                            className="flex items-center gap-3 px-5 lg:px-6 py-3 hover:bg-slate-50 dark:hover:bg-slate-800/40 cursor-pointer transition-colors border-l-4 group"
                                            style={{ borderLeftColor: cat.color }}
                                        >
                                            <div className="flex-1 min-w-0">
                                                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100 truncate group-hover:text-primary transition-colors">{ev.title}</p>
                                                <div className="flex items-center gap-2 mt-0.5 flex-wrap">
                                                    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${cat.pill}`}>{cat.label}</span>
                                                    {ev.isAllDay ? (
                                                        <span className="text-[10px] text-slate-400">Seharian</span>
                                                    ) : ev.startTime ? (
                                                        <span className="text-[11px] text-slate-400 flex items-center gap-0.5">
                                                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                            {ev.startTime}{ev.endTime ? `–${ev.endTime}` : ''}
                                                        </span>
                                                    ) : null}
                                                </div>
                                            </div>
                                        </div>
                                    );
                                })}
                            </div>
                        )}

                        {todaySchedules.length > 0 && (
                            <div className="px-5 lg:px-6 py-3 border-t border-slate-100 dark:border-slate-800 shrink-0">
                                <p className="text-xs text-slate-400">
                                    {todaySchedules.length} jadwal ·
                                    <span className="text-primary font-semibold cursor-pointer hover:underline ml-1" onClick={() => navigate('/schedule')}>Kelola jadwal →</span>
                                </p>
                            </div>
                        )}
                    </section>

                    {/* Peringatan Kritis */}
                    {criticalPatients.length > 0 && (
                        <section className="bg-red-50 dark:bg-red-900/10 rounded-xl border border-red-100 dark:border-red-900/30 p-5 lg:p-6">
                            <h3 className="text-red-800 dark:text-red-400 font-bold mb-4 flex items-center gap-2">
                                <span className="material-symbols-outlined text-red-600">report</span>
                                Peringatan Kritis ({criticalPatients.length})
                            </h3>
                            <div className="space-y-3">
                                {criticalPatients.slice(0, 3).map(p => (
                                    <div key={p.id} onClick={() => navigate(`/patient/${p.id}`)} className="bg-white dark:bg-slate-900/50 p-3 rounded-lg border border-red-200 dark:border-red-800/50 cursor-pointer hover:shadow-sm transition-shadow">
                                        <p className="text-xs font-bold text-red-600 uppercase mb-1 tracking-wider">Kritis</p>
                                        <p className="text-sm font-bold">{p.name}</p>
                                        <p className="text-xs text-slate-500 mt-1 truncate">{p.diagnosis || p.chiefComplaint || '-'}</p>
                                    </div>
                                ))}
                            </div>
                        </section>
                    )}

                    {/* Tips AI — removed, replaced by Jadwal Hari Ini above */}
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
