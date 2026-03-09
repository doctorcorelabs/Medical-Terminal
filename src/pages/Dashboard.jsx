import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { useStase } from '../context/StaseContext';
import { calculateRecoveryProgress, getRelativeTime } from '../services/dataService';

export default function Dashboard() {
    const navigate = useNavigate();
    const { patients } = usePatients();
    const { pinnedStase, stases } = useStase();

    const activePatients = patients.filter(p => p.status !== 'discharged');
    const criticalPatients = patients.filter(p => p.condition === 'critical');
    const todayReports = patients.reduce((acc, p) => {
        const today = new Date().toDateString();
        return acc + (p.dailyReports || []).filter(r => new Date(r.date).toDateString() === today).length;
    }, 0);
    const dischargedCount = patients.filter(p => p.status === 'discharged').length;

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
                <div className="md:col-span-2 space-y-6 lg:space-y-8 min-w-0">
                    {/* Aksi Cepat */}
                    <section>
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
                    {/* Tracking Pemulihan */}
                    <section className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-5 lg:p-6">
                        <h3 className="text-base lg:text-lg font-bold mb-4 flex items-center gap-2">
                            <span className="material-symbols-outlined text-primary">trending_up</span>
                            Tracking Pemulihan
                        </h3>
                        <div className="space-y-4">
                            {patients.filter(p => p.admissionDate && p.targetDays).length === 0 ? (
                                <p className="text-sm text-slate-400 text-center py-4">Belum ada data tracking</p>
                            ) : (
                                patients.filter(p => p.admissionDate && p.targetDays).slice(0, 4).map(patient => {
                                    const recovery = calculateRecoveryProgress(patient.admissionDate, patient.targetDays);
                                    return (
                                        <div key={patient.id} className="space-y-1.5 cursor-pointer" onClick={() => navigate(`/patient/${patient.id}`)}>
                                            <div className="flex justify-between text-xs gap-2">
                                                <span className="font-bold truncate min-w-0">{patient.name}</span>
                                                <span className="text-slate-400 shrink-0">Hari {recovery.daysIn}/{recovery.targetDays}</span>
                                            </div>
                                            <div className="w-full h-1.5 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                                <div
                                                    className={`h-full rounded-full transition-all ${recovery.progress > 100 ? 'bg-red-500' : recovery.progress > 70 ? 'bg-amber-500' : 'bg-primary'}`}
                                                    style={{ width: `${Math.min(100, recovery.progress)}%` }}
                                                />
                                            </div>
                                        </div>
                                    );
                                })
                            )}
                        </div>
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

                    {/* Tips AI */}
                    <section className="bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 p-5 lg:p-6">
                        <h4 className="font-bold text-primary mb-2 flex items-center gap-2">
                            <span className="material-symbols-outlined text-lg">lightbulb</span>
                            Tips Klinis
                        </h4>
                        <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                            Gunakan fitur AI Insight pada halaman detail pasien untuk mendapatkan analisis gejala, kemungkinan diagnosis, dan rekomendasi pemeriksaan secara otomatis.
                        </p>
                    </section>
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
