import { usePatients } from '../context/PatientContext';
import { formatDate, calculateDaysInHospital } from '../services/dataService';

export default function Reports() {
    const { patients } = usePatients();

    const stats = {
        total: patients.length,
        active: patients.filter(p => p.status !== 'discharged').length,
        critical: patients.filter(p => p.condition === 'critical').length,
        urgent: patients.filter(p => p.condition === 'urgent').length,
        stable: patients.filter(p => p.condition === 'stable').length,
        improving: patients.filter(p => p.condition === 'improving').length,
        totalSymptoms: patients.reduce((a, p) => a + (p.symptoms || []).length, 0),
        totalExams: patients.reduce((a, p) => a + (p.supportingExams || []).length, 0),
        totalPrescriptions: patients.reduce((a, p) => a + (p.prescriptions || []).length, 0),
    };

    const exportLogbook = () => {
        let text = 'LOGBOOK COASS - MedxTerminal\n';
        text += `Dibuat: ${new Date().toLocaleDateString('id-ID', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}\n\n`;
        patients.forEach((p, i) => {
            text += `${i + 1}. ${p.name} (${p.age || '-'} th, ${p.gender === 'female' ? 'P' : 'L'})\n`;
            text += `   Masuk: ${formatDate(p.admissionDate)} | Hari ke-${calculateDaysInHospital(p.admissionDate)}\n`;
            text += `   Dx: ${p.diagnosis || '-'}\n`;
            text += `   KU: ${p.chiefComplaint || '-'}\n`;
            text += `   VS: DJ ${p.heartRate || '-'}, TD ${p.bloodPressure || '-'}, S ${p.temperature || '-'}°C, RR ${p.respRate || '-'}, SpO2 ${p.spO2 || '-'}%\n`;
            text += `   Gejala: ${(p.symptoms || []).map(s => s.name).join(', ') || '-'}\n`;
            text += `   Obat: ${(p.prescriptions || []).map(rx => `${rx.name} ${rx.dosage}`).join(', ') || '-'}\n\n`;
        });
        const blob = new Blob([text], { type: 'text/plain' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a'); a.href = url; a.download = 'logbook_coass.txt'; a.click();
        URL.revokeObjectURL(url);
    };

    return (
        <div className="p-4 md:p-6 lg:p-8 space-y-6 lg:space-y-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
                <div className="min-w-0">
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-white tracking-tight">Laporan</h1>
                    <p className="text-slate-500 dark:text-slate-400 text-sm mt-1">Ringkasan data klinis dan ekspor logbook.</p>
                </div>
                <button onClick={exportLogbook} className="flex items-center justify-center gap-2 px-4 py-2.5 bg-primary text-white rounded-lg text-sm font-bold hover:bg-blue-600 transition-colors shadow-lg shadow-primary/20 flex-shrink-0 w-full sm:w-auto">
                    <span className="material-symbols-outlined text-lg">download</span>Ekspor Logbook
                </button>
            </div>

            {/* Grid Statistik */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 lg:gap-4">
                {[
                    { label: 'Total Pasien', value: stats.total, icon: 'group', color: 'bg-blue-50 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400' },
                    { label: 'Aktif', value: stats.active, icon: 'person', color: 'bg-green-50 dark:bg-green-900/30 text-green-600 dark:text-green-400' },
                    { label: 'Kritis', value: stats.critical, icon: 'emergency', color: 'bg-red-50 dark:bg-red-900/30 text-red-600 dark:text-red-400' },
                    { label: 'Membaik', value: stats.improving, icon: 'trending_up', color: 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-600 dark:text-emerald-400' },
                ].map(s => (
                    <div key={s.label} className="bg-white dark:bg-slate-900 p-4 lg:p-5 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                        <div className={`p-2.5 ${s.color} rounded-lg w-fit mb-3`}><span className="material-symbols-outlined">{s.icon}</span></div>
                        <p className="text-xs text-slate-500 font-medium">{s.label}</p>
                        <h3 className="text-2xl font-black mt-0.5">{s.value}</h3>
                    </div>
                ))}
            </div>

            {/* Detail Grid */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
                {/* Distribusi Kondisi */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-sm uppercase tracking-wider">Distribusi Kondisi</h3>
                    </div>
                    <div className="p-5 lg:p-6 space-y-3">
                        {[
                            { label: 'Kritis', value: stats.critical, color: 'bg-red-500' },
                            { label: 'Mendesak', value: stats.urgent, color: 'bg-amber-500' },
                            { label: 'Stabil', value: stats.stable, color: 'bg-slate-400' },
                            { label: 'Membaik', value: stats.improving, color: 'bg-green-500' },
                        ].map(item => (
                            <div key={item.label} className="space-y-1">
                                <div className="flex justify-between text-xs gap-3">
                                    <span className="font-medium text-slate-600 dark:text-slate-400">{item.label}</span>
                                    <span className="font-bold flex-shrink-0">{item.value}</span>
                                </div>
                                <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                                    <div className={`h-full ${item.color} rounded-full transition-all`} style={{ width: `${stats.total > 0 ? (item.value / stats.total) * 100 : 0}%` }} />
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Ringkasan Data Klinis */}
                <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm overflow-hidden">
                    <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-sm uppercase tracking-wider">Ringkasan Data Klinis</h3>
                    </div>
                    <div className="divide-y divide-slate-100 dark:divide-slate-800">
                        {[
                            { label: 'Total Gejala Tercatat', value: stats.totalSymptoms, icon: 'symptoms' },
                            { label: 'Hasil Laboratorium', value: stats.totalExams, icon: 'biotech' },
                            { label: 'Resep Obat Aktif', value: stats.totalPrescriptions, icon: 'medication' },
                            { label: 'Rata-rata Lama Rawat', value: patients.filter(p => p.admissionDate).length > 0 ? `${Math.round(patients.filter(p => p.admissionDate).reduce((a, p) => a + calculateDaysInHospital(p.admissionDate), 0) / patients.filter(p => p.admissionDate).length)} hari` : '-', icon: 'schedule' },
                        ].map(item => (
                            <div key={item.label} className="px-5 lg:px-6 py-4 flex items-center justify-between gap-3 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
                                <div className="flex items-center gap-3 min-w-0">
                                    <span className="material-symbols-outlined text-primary text-xl flex-shrink-0">{item.icon}</span>
                                    <span className="text-sm font-medium truncate">{item.label}</span>
                                </div>
                                <span className="text-sm font-bold flex-shrink-0">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
            </div>
        </div>
    );
}
