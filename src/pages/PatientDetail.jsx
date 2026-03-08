import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { calculateRecoveryProgress, formatDate, formatDateTime, checkLabValue, labReferences, labCategories } from '../services/dataService';
import LabReferenceModal from '../components/LabReferenceModal';
import { getSmartSummary, getSymptomInsight, getDailyEvaluation, getPhysicalExamInsight, getSupportingExamInsight, getMedicationRecommendation, getSOAPNote } from '../services/aiService';
import SymptomGraph from '../components/visualization/SymptomGraph';
import TimelineChart from '../components/visualization/TimelineChart';
import DDxRadar from '../components/visualization/DDxRadar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportPatientPDF } from '../services/pdfExportService';

export default function PatientDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { patients, updatePatient, addSymptom, removeSymptom, addDailyReport, removeDailyReport, addPhysicalExam, removePhysicalExam, addSupportingExam, removeSupportingExam, addPrescription, removePrescription } = usePatients();
    const patient = patients.find(p => p.id === id);
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('patientDetailActiveTab') || 'overview';
    });

    useEffect(() => {
        localStorage.setItem('patientDetailActiveTab', activeTab);
    }, [activeTab]);
    const [aiLoading, setAiLoading] = useState({});
    const [aiResults, setAiResults] = useState(patient?.aiInsights || {});

    // Sinkronisasi data AI jika pasien berubah
    useEffect(() => {
        if (patient?.aiInsights) {
            setAiResults(patient.aiInsights);
        } else {
            setAiResults({});
        }
    }, [patient?.id]);
    const [symptomInput, setSymptomInput] = useState({ name: '', severity: 'sedang', notes: '' });
    const [examInput, setExamInput] = useState({ findings: '', system: 'umum' });
    const [labInput, setLabInput] = useState({ testName: '', value: '', unit: '', labKey: '' });
    const [prescInput, setPrescInput] = useState({ name: '', dosage: '', frequency: '', route: 'oral' });
    const [reportInput, setReportInput] = useState({ notes: '', condition: '' });

    if (!patient) {
        return (
            <div className="p-8 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300 mb-3 block">person_off</span>
                <p className="text-lg font-semibold text-slate-400">Pasien tidak ditemukan</p>
                <button onClick={() => navigate('/patients')} className="mt-4 text-primary font-semibold hover:underline">Kembali ke Daftar Pasien</button>
            </div>
        );
    }

    const recovery = patient.admissionDate && patient.targetDays ? calculateRecoveryProgress(patient.admissionDate, patient.targetDays) : null;

    const callAI = async (key, fn) => {
        setAiLoading(prev => ({ ...prev, [key]: true }));
        try {
            const result = await fn();
            setAiResults(prev => ({ ...prev, [key]: result }));

            // Auto save to patient object context so it goes to Supabase
            if (patient) {
                updatePatient(patient.id, {
                    aiInsights: {
                        ...(patient.aiInsights || {}),
                        [key]: result
                    }
                });
            }
        } catch (err) {
            setAiResults(prev => ({ ...prev, [key]: `Error: ${err.message}` }));
        } finally {
            setAiLoading(prev => ({ ...prev, [key]: false }));
        }
    };

    const handleSaveAI = (key, text) => {
        setAiResults(prev => ({ ...prev, [key]: text }));
        if (patient) {
            updatePatient(patient.id, {
                aiInsights: {
                    ...(patient.aiInsights || {}),
                    [key]: text
                }
            });
        }
    };

    const tabs = [
        { key: 'overview', label: 'Ringkasan', icon: 'dashboard' },
        { key: 'symptoms', label: 'Gejala', icon: 'symptoms' },
        { key: 'physical', label: 'Fisik', icon: 'stethoscope' },
        { key: 'labs', label: 'Lab', icon: 'biotech' },
        { key: 'prescriptions', label: 'Obat', icon: 'medication' },
        { key: 'reports', label: 'Harian', icon: 'description' },
        { key: 'ai', label: 'AI', icon: 'auto_awesome' },
    ];

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 space-y-5 lg:space-y-6 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            {/* Header */}
            <div>
                <div className="flex items-center gap-3 mb-1 flex-wrap">
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{patient.name}</h1>
                    <KondisiBadge kondisi={patient.condition} />
                    <button onClick={() => exportPatientPDF(patient)}
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm font-semibold flex-shrink-0"
                        title="Export laporan medis ke PDF">
                        <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                        <span className="hidden sm:inline">Export PDF</span>
                    </button>
                </div>
                <nav className="flex text-sm text-slate-500 gap-2 ml-12">
                    <span>Pasien</span><span>/</span><span className="text-primary font-medium truncate">{patient.name}</span>
                </nav>
            </div>

            {/* Progress Pemulihan */}
            {recovery && (
                <div className="bg-white dark:bg-slate-900 p-4 rounded-xl border border-slate-200 dark:border-slate-800 shadow-sm">
                    <div className="flex items-center justify-between mb-2 gap-4 flex-wrap">
                        <span className="text-sm font-bold">Progres Pemulihan</span>
                        <span className="text-xs text-slate-500">Hari {recovery.daysIn} dari {recovery.targetDays} ({recovery.remaining > 0 ? `${recovery.remaining} hari lagi` : 'target terlampaui'})</span>
                    </div>
                    <div className="w-full h-2 bg-slate-100 dark:bg-slate-800 rounded-full overflow-hidden">
                        <div className={`h-full rounded-full transition-all duration-1000 ${recovery.progress > 100 ? 'bg-red-500' : recovery.progress > 70 ? 'bg-amber-500' : 'bg-green-500'}`}
                            style={{ width: `${Math.min(100, recovery.progress)}%` }} />
                    </div>
                </div>
            )}

            {/* Tab */}
            <div className="flex border-b border-slate-200 dark:border-slate-800 gap-0.5 overflow-x-auto">
                {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-1 px-2.5 sm:px-3 py-2.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700 dark:hover:text-slate-300'
                            }`}>
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Konten */}
            {activeTab === 'overview' && <TabRingkasan patient={patient} navigate={navigate} />}
            {activeTab === 'symptoms' && <TabGejala patient={patient} input={symptomInput} setInput={setSymptomInput}
                onAdd={(e) => { e.preventDefault(); if (!symptomInput.name.trim()) return; addSymptom(patient.id, symptomInput); setSymptomInput({ name: '', severity: 'sedang', notes: '' }); }}
                onRemove={(symptomId) => removeSymptom(patient.id, symptomId)}
                onAI={() => callAI('symptoms', () => getSymptomInsight((patient.symptoms || []).map(s => s.name), `${patient.name}, ${patient.age} tahun`))}
                aiResult={aiResults.symptoms} aiLoading={aiLoading.symptoms} />}
            {activeTab === 'physical' && <TabDataUmum judul="Pemeriksaan Fisik" items={patient.physicalExams || []} input={examInput} setInput={setExamInput}
                fields={[
                    { key: 'system', type: 'select', label: 'Sistem', options: ['umum', 'kepala', 'leher', 'thorax', 'abdomen', 'ekstremitas', 'neurologis', 'kulit'] },
                    { key: 'findings', type: 'textarea', label: 'Temuan', placeholder: 'Temuan pemeriksaan fisik...' },
                ]}
                onAdd={(e) => { e.preventDefault(); if (!examInput.findings.trim()) return; addPhysicalExam(patient.id, examInput); setExamInput({ findings: '', system: 'umum' }); }}
                onRemove={(examId) => removePhysicalExam(patient.id, examId)}
                renderItem={(item) => <><span className="text-xs font-bold text-primary uppercase">{item.system}</span><p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.findings}</p></>}
                onAI={() => callAI('physical', () => getPhysicalExamInsight((patient.physicalExams || []).map(e => e.findings).join('; '), (patient.symptoms || []).map(s => s.name).join(', ')))}
                aiResult={aiResults.physical} aiLoading={aiLoading.physical} />}
            {activeTab === 'labs' && <TabLab patient={patient} input={labInput} setInput={setLabInput}
                onAdd={(e) => { e.preventDefault(); if (!labInput.testName.trim() && labInput.labKey !== 'custom') return; addSupportingExam(patient.id, { type: 'lab', ...labInput, result: checkLabValue(labInput.labKey, labInput.value, patient.gender) }); setLabInput({ testName: '', value: '', unit: '', labKey: '' }); }}
                onRemove={(examId) => removeSupportingExam(patient.id, examId)}
                onAI={() => callAI('labs', () => getSupportingExamInsight((patient.supportingExams || []).map(e => `${e.testName}: ${e.value} ${e.unit}`).join(', '), patient.diagnosis || ''))}
                aiResult={aiResults.labs} aiLoading={aiLoading.labs} />}
            {activeTab === 'prescriptions' && <TabObat patient={patient} input={prescInput} setInput={setPrescInput}
                onAdd={(e) => { e.preventDefault(); if (!prescInput.name.trim()) return; addPrescription(patient.id, prescInput); setPrescInput({ name: '', dosage: '', frequency: '', route: 'oral' }); }}
                onRemove={(prescId) => removePrescription(patient.id, prescId)}
                onAI={() => callAI('drugs', () => getMedicationRecommendation(patient.diagnosis, (patient.symptoms || []).map(s => s.name).join(', ')))}
                aiResult={aiResults.drugs} aiLoading={aiLoading.drugs} />}
            {activeTab === 'reports' && <TabLaporan patient={patient} input={reportInput} setInput={setReportInput}
                onAdd={(e) => { e.preventDefault(); if (!reportInput.notes.trim()) return; addDailyReport(patient.id, reportInput); if (reportInput.condition) updatePatient(patient.id, { condition: reportInput.condition }); setReportInput({ notes: '', condition: '' }); }}
                onRemove={(reportId) => removeDailyReport(patient.id, reportId)}
                onAI={() => { const r = patient.dailyReports || []; callAI('daily', () => getDailyEvaluation(r[r.length - 1] || {}, r[r.length - 2] || {})); }}
                aiResult={aiResults.daily} aiLoading={aiLoading.daily} />}
            {activeTab === 'ai' && <TabAI patient={patient} callAI={callAI} aiResults={aiResults} aiLoading={aiLoading} onSaveAI={handleSaveAI} />}
        </div>
    );
}

/* ====== TAB RINGKASAN ====== */
function TabRingkasan({ patient, navigate }) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
            <div className="lg:col-span-8 space-y-5 lg:space-y-6 min-w-0">
                {/* Kartu Pasien */}
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 lg:p-6">
                    <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-6">
                        <div className="size-16 sm:size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-white dark:border-slate-800 shadow-sm flex-shrink-0">
                            <span className="text-xl sm:text-2xl font-black">{patient.name?.substring(0, 2).toUpperCase()}</span>
                        </div>
                        <div className="flex-1 min-w-0 w-full">
                            <div className="flex flex-wrap gap-x-4 gap-y-1 mb-3">
                                {patient.height && <span className="flex items-center gap-1 text-xs text-slate-500"><span className="material-symbols-outlined text-sm">straighten</span>{patient.height} cm</span>}
                                {patient.weight && <span className="flex items-center gap-1 text-xs text-slate-500"><span className="material-symbols-outlined text-sm">monitor_weight</span>{patient.weight} kg</span>}
                                {patient.allergies && <span className="flex items-center gap-1 text-xs text-red-500 font-bold"><span className="material-symbols-outlined text-sm">warning</span>{patient.allergies}</span>}
                            </div>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-4 gap-y-2">
                                {[
                                    { label: 'Umur', value: patient.age ? `${patient.age} Tahun` : '-' },
                                    { label: 'Jenis Kelamin', value: patient.gender === 'female' ? 'Perempuan' : 'Laki-laki' },
                                    { label: 'Tanggal Masuk', value: formatDate(patient.admissionDate) },
                                    { label: 'Gol. Darah', value: patient.bloodType || '-', className: 'text-red-500 font-bold' },
                                ].map(item => (
                                    <div key={item.label} className="min-w-0">
                                        <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate">{item.label}</p>
                                        <p className={`font-semibold text-sm truncate ${item.className || ''}`}>{item.value}</p>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>
                    {/* Tanda Vital */}
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tanda Vital</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                        {[
                            { label: 'Detak Jantung', value: patient.heartRate, unit: 'bpm' },
                            { label: 'Tekanan Darah', value: patient.bloodPressure, unit: 'mmHg' },
                            { label: 'Suhu', value: patient.temperature, unit: '°C' },
                            { label: 'Frek. Napas', value: patient.respRate, unit: '/min' },
                            { label: 'SpO2', value: patient.spO2, unit: '%' },
                        ].map(v => (
                            <div key={v.label} className="p-2 lg:p-3 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/10 text-center flex flex-col h-full">
                                <p className="text-[10px] sm:text-xs text-primary font-bold leading-tight min-h-[1.75rem] flex items-start justify-center mb-1">{v.label}</p>
                                <div className="flex flex-col items-center justify-center mt-auto">
                                    <span className="text-base sm:text-[1.1rem] font-black text-slate-800 dark:text-slate-100 leading-none mb-0.5">{v.value || '-'}</span>
                                    <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold tracking-wide">{v.unit}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Keluhan Utama */}
                <Kartu judul="Keluhan Utama">
                    <p className="text-sm text-slate-600 dark:text-slate-400">{patient.chiefComplaint || 'Belum dicatat'}</p>
                </Kartu>

                {/* Visualisasi */}
                {(patient.symptoms || []).length > 0 && (
                    <>
                        <Kartu judul="Peta Gejala" headerIcon="hub" id="grafik-gejala">
                            <div className="h-[300px] lg:h-[350px]"><SymptomGraph symptoms={patient.symptoms} aiResult={patient.aiInsights?.symptoms} /></div>
                        </Kartu>
                        <Kartu judul="Timeline Gejala" headerIcon="timeline" id="timeline-gejala">
                            <TimelineChart symptoms={patient.symptoms} admissionDate={patient.admissionDate} />
                        </Kartu>
                    </>
                )}
            </div>

            {/* Kolom Kanan */}
            <div className="lg:col-span-4 space-y-5 lg:space-y-6 min-w-0">
                <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                    <div className="px-5 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                        <h3 className="font-bold text-sm">Ringkasan Pasien</h3>
                    </div>
                    <div className="p-4 space-y-1">
                        {[
                            { label: 'Diagnosis', value: patient.diagnosis || '-' },
                            { label: 'Riwayat', value: patient.medicalHistory || '-' },
                            { label: 'Gejala', value: (patient.symptoms || []).length },
                            { label: 'Pemeriksaan Fisik', value: (patient.physicalExams || []).length },
                            { label: 'Hasil Lab', value: (patient.supportingExams || []).length },
                            { label: 'Resep Obat', value: (patient.prescriptions || []).length },
                            { label: 'Laporan Harian', value: (patient.dailyReports || []).length },
                        ].map(item => (
                            <div key={item.label} className="flex justify-between items-start gap-3 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
                                <span className="text-slate-500 flex-shrink-0">{item.label}</span>
                                <span className="font-semibold text-right truncate min-w-0">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 p-5">
                    <h4 className="font-bold text-primary mb-2 flex items-center gap-2 text-sm">
                        <span className="material-symbols-outlined text-lg">lightbulb</span>Tips Klinis
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        Gunakan tab di atas untuk menambahkan data klinis. Tab AI akan menganalisis semua data dan memberikan saran diagnostik.
                    </p>
                </div>
            </div>
        </div>
    );
}

/* ====== TAB GEJALA ====== */
function TabGejala({ patient, input, setInput, onAdd, onRemove, onAI, aiResult, aiLoading }) {
    const [confirmingId, setConfirmingId] = useState(null);

    const handleDeleteClick = (id) => setConfirmingId(id);
    const handleConfirmDelete = (id) => { onRemove(id); setConfirmingId(null); };
    const handleCancelDelete = () => setConfirmingId(null);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
            <div className="space-y-5">
                <Kartu judul="Tambah Gejala" aksi={<button className="p-1 rounded-full text-slate-400 hover:text-primary transition-colors hover:bg-slate-50"><span className="material-symbols-outlined text-xl">add_circle</span></button>}>
                    <form onSubmit={onAdd} className="space-y-4">
                        <textarea value={input.name} onChange={e => setInput(p => ({ ...p, name: e.target.value }))} rows={2} required placeholder="Nama gejala (cth. Demam, Batuk, Nyeri Dada)"
                            className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm transition-all resize-none shadow-sm" />

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Keparahan</label>
                            <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl gap-1">
                                {[
                                    { v: 'ringan', l: 'Ringan', c: 'text-green-600 bg-green-50 border-green-200' },
                                    { v: 'sedang', l: 'Sedang', c: 'text-amber-600 bg-amber-50 border-amber-200' },
                                    { v: 'berat', l: 'Berat', c: 'text-red-600 bg-red-50 border-red-200' }
                                ].map(opt => (
                                    <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, severity: opt.v }))}
                                        className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all border ${input.severity === opt.v ? `${opt.c} shadow-sm scale-[1.02]` : 'text-slate-500 border-transparent hover:bg-white/50 dark:hover:bg-slate-800'}`}>
                                        {opt.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm hover:brightness-110 active:scale-[0.98] transition-all shadow-lg shadow-primary/20">Tambah Gejala</button>
                    </form>
                </Kartu>
                <Kartu judul={`Daftar Gejala (${(patient.symptoms || []).length})`}>
                    <div className="space-y-2">
                        {(patient.symptoms || []).length === 0 ? <Kosong /> :
                            (patient.symptoms || []).map(s => (
                                <div key={s.id}>
                                    <div className="flex items-center gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                        <div className={`w-2 h-2 rounded-full flex-shrink-0 ${s.severity === 'berat' ? 'bg-red-500' : s.severity === 'sedang' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                        <div className="flex-1 min-w-0">
                                            <p className="text-sm font-bold truncate">{s.name}</p>
                                            {s.notes && <p className="text-xs text-slate-400 truncate">{s.notes}</p>}
                                        </div>
                                        <BadgeKeparahan keparahan={s.severity} />
                                        <span className="text-[10px] text-slate-400 flex-shrink-0 hidden sm:block">{formatDateTime(s.recordedAt)}</span>
                                        <button type="button" onClick={() => handleDeleteClick(s.id)}
                                            className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex-shrink-0">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                    {confirmingId === s.id && (
                                        <div className="mt-1 flex items-center justify-end gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                            <span className="text-xs text-red-600 dark:text-red-400 font-medium flex-1">Hapus gejala <strong>{s.name}</strong>?</span>
                                            <button type="button" onClick={handleCancelDelete}
                                                className="px-3 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                                                Batal
                                            </button>
                                            <button type="button" onClick={() => handleConfirmDelete(s.id)}
                                                className="px-3 py-1 text-xs font-bold rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors">
                                                Hapus
                                            </button>
                                        </div>
                                    )}
                                </div>
                            ))}
                    </div>
                </Kartu>
                <TombolAI label="Analisis Gejala" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={(patient.symptoms || []).length === 0} />
            </div>
            <div className="lg:col-span-5 space-y-5 min-w-0">
                {(patient.symptoms || []).length > 0 && (
                    <>
                        <Kartu judul="Node Gejala" id="grafik-gejala-tab"><div className="h-[280px] lg:h-[300px]"><SymptomGraph symptoms={patient.symptoms} aiResult={aiResult} /></div></Kartu>
                        <Kartu judul="Timeline" id="timeline-gejala-tab"><TimelineChart symptoms={patient.symptoms} admissionDate={patient.admissionDate} /></Kartu>
                    </>
                )}
            </div>
        </div>
    );
}

/* ====== TAB DATA UMUM ====== */
function TabDataUmum({ judul, items, input, setInput, fields, onAdd, onRemove, renderItem, onAI, aiResult, aiLoading }) {
    const [confirmingId, setConfirmingId] = useState(null);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
            <div className="space-y-5 min-w-0">
                <Kartu judul={`Tambah ${judul}`}>
                    <form onSubmit={onAdd} className="space-y-4">
                        {fields.map(f => f.type === 'select' ? (
                            <div key={f.key} className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{f.label}</label>
                                <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl">
                                    {f.options.map(o => (
                                        <button key={o} type="button" onClick={() => setInput(p => ({ ...p, [f.key]: o }))}
                                            className={`py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${input[f.key] === o ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800 border border-transparent'}`}>
                                            {o}
                                        </button>
                                    ))}
                                </div>
                            </div>
                        ) : (
                            <div key={f.key} className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">{f.label}</label>
                                <textarea value={input[f.key]} onChange={e => setInput(p => ({ ...p, [f.key]: e.target.value }))} rows={4} required placeholder={f.placeholder}
                                    className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm transition-all resize-none shadow-sm" />
                            </div>
                        ))}
                        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 transition-all active:scale-[0.98]">Simpan</button>
                    </form>
                </Kartu>
                <TombolAI label="Analisis AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={items.length === 0} />
            </div>
            <div className="min-w-0">
                <Kartu judul={`Riwayat (${items.length})`}>
                    <div className="space-y-3">
                        {items.length === 0 ? <Kosong /> : items.map(item => (
                            <div key={item.id}>
                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1 relative group">
                                    <div className="flex justify-between items-start">
                                        <span className="text-[10px] text-slate-400">{formatDateTime(item.date)}</span>
                                        <button type="button" onClick={() => setConfirmingId(item.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all flex-shrink-0">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                    {renderItem(item)}
                                </div>
                                {confirmingId === item.id && (
                                    <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(item.id); setConfirmingId(null); }} label="Hapus data ini?" />
                                )}
                            </div>
                        ))}
                    </div>
                </Kartu>
            </div>
        </div>
    );
}

function ConfirmPanel({ onCancel, onConfirm, label }) {
    return (
        <div className="mt-1 flex items-center justify-end gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
            <span className="text-xs text-red-600 dark:text-red-400 font-medium flex-1">{label}</span>
            <button type="button" onClick={onCancel}
                className="px-3 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">
                Batal
            </button>
            <button type="button" onClick={onConfirm}
                className="px-3 py-1 text-xs font-bold rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors">
                Hapus
            </button>
        </div>
    );
}

/* ====== TAB LAB ====== */
function TabLab({ patient, input, setInput, onAdd, onRemove, onAI, aiResult, aiLoading }) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [showRefModal, setShowRefModal] = useState(false);
    const [activeLabCat, setActiveLabCat] = useState(labCategories[0].key);

    const selectedRef = input.labKey && input.labKey !== 'custom' ? labReferences[input.labKey] : null;

    // Get display range for the selected test
    function getRefDisplay(ref, gender = patient.gender || 'male') {
        if (!ref) return null;
        if (ref.qualitative) return { text: ref.normalValue || 'Negatif', type: 'qualitative' };
        if (ref.infoRanges) return { text: ref.infoRanges.map(r => `${r.label}: ${r.value}`).join(' | '), type: 'info' };
        const range = (ref.male && ref.female) ? (ref[gender] || ref.male) : ref;
        if (!range) return null;
        if (range.low === 0 && range.high === 999) return { text: `≥ ${range.low} ${ref.unit}`, type: 'range' };
        return { text: `${range.low} – ${range.high} ${ref.unit}`, type: 'range' };
    }

    const refDisplay = selectedRef ? getRefDisplay(selectedRef) : null;
    const catItems = labCategories.find(c => c.key === activeLabCat)?.key
        ? Object.entries(labReferences).filter(([, v]) => v.category === activeLabCat)
        : [];

    return (
        <>
            {showRefModal && <LabReferenceModal onClose={() => setShowRefModal(false)} />}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
                <div className="space-y-5 min-w-0">
                    <Kartu judul="Input Hasil Lab" aksi={
                        <button
                            type="button"
                            onClick={() => setShowRefModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20 transition-all text-[11px] font-bold"
                            title="Lihat tabel nilai rujukan resmi"
                        >
                            <span className="material-symbols-outlined text-[16px]">fact_check</span>
                            Nilai Rujukan
                        </button>
                    }>
                        <form onSubmit={onAdd} className="space-y-4">
                            <div className="space-y-2">
                                <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Kategori Pemeriksaan</label>
                                <div className="flex gap-1 overflow-x-auto pb-1">
                                    {labCategories.map(cat => (
                                        <button key={cat.key} type="button" onClick={() => setActiveLabCat(cat.key)}
                                            className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap flex-shrink-0 transition-all border ${activeLabCat === cat.key ? 'bg-primary/10 text-primary border-primary/30 shadow-sm' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700'}`}>
                                            <span className="material-symbols-outlined text-[12px]">{cat.icon}</span>
                                            {cat.label.split(' ')[0]}
                                        </button>
                                    ))}
                                    <button type="button" onClick={() => setActiveLabCat('custom')}
                                        className={`flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-[10px] font-black uppercase whitespace-nowrap flex-shrink-0 transition-all border ${activeLabCat === 'custom' ? 'bg-primary/10 text-primary border-primary/30' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-100'}`}>
                                        <span className="material-symbols-outlined text-[12px]">add</span>
                                        Custom
                                    </button>
                                </div>
                            </div>

                            {activeLabCat === 'custom' ? (
                                <input type="text" value={input.testName} onChange={e => setInput(p => ({ ...p, testName: e.target.value, labKey: 'custom' }))} placeholder="Nama pemeriksaan" required className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm py-3 transition-all shadow-sm" />
                            ) : (
                                <div className="space-y-2">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Parameter</label>
                                    <div className="grid grid-cols-2 gap-1 p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl max-h-44 overflow-y-auto custom-scrollbar">
                                        {catItems.map(([k, v]) => (
                                            <button key={k} type="button" onClick={() => setInput(p => ({ ...p, labKey: k, testName: v.name, unit: v.unit, value: v.qualitative ? '' : p.value }))}
                                                className={`py-2 px-3 text-xs font-bold text-left rounded-lg transition-all flex justify-between items-center gap-1 ${input.labKey === k ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-white/80 dark:hover:bg-slate-800 border border-transparent'}`}>
                                                <span className="truncate text-[11px]">{v.name}</span>
                                                <span className={`text-[9px] font-mono flex-shrink-0 ${input.labKey === k ? 'text-white/70' : 'text-slate-400'}`}>{v.unit !== '-' ? v.unit : ''}</span>
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Inline reference hint */}
                            {selectedRef && refDisplay && (
                                <div className="flex items-start gap-2 px-3 py-2 rounded-lg bg-primary/5 border border-primary/15">
                                    <span className="material-symbols-outlined text-primary text-[14px] mt-0.5 flex-shrink-0">info</span>
                                    <div className="min-w-0">
                                        <p className="text-[10px] text-primary font-black uppercase tracking-wide">Nilai Rujukan</p>
                                        <p className="text-xs text-slate-600 dark:text-slate-300 font-semibold mt-0.5 break-words">{refDisplay.text}</p>
                                        {selectedRef.metode && <p className="text-[10px] text-slate-400 mt-0.5">Metode: {selectedRef.metode}</p>}
                                    </div>
                                </div>
                            )}

                            {/* Value input */}
                            {(input.labKey || activeLabCat === 'custom') && (
                                <div className="flex gap-3">
                                    <input
                                        type="text"
                                        value={input.value}
                                        onChange={e => setInput(p => ({ ...p, value: e.target.value }))}
                                        placeholder={selectedRef?.qualitative ? `Nilai (cth: ${selectedRef.normalValue || 'Negatif/Positif'})` : 'Nilai (Hasil)'}
                                        required
                                        className="flex-1 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm py-3 min-w-0 transition-all shadow-sm"
                                    />
                                    <input
                                        type="text"
                                        value={input.unit}
                                        onChange={e => setInput(p => ({ ...p, unit: e.target.value }))}
                                        placeholder="Satuan"
                                        className="w-24 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm py-3 flex-shrink-0 transition-all shadow-sm"
                                    />
                                </div>
                            )}

                            <button type="submit" disabled={!input.value || (!input.testName && activeLabCat !== 'custom')} className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20 transition-all active:scale-[0.98] disabled:opacity-50 disabled:cursor-not-allowed">Simpan Hasil</button>
                        </form>
                    </Kartu>
                    <TombolAI label="Analisis Lab AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={(patient.supportingExams || []).length === 0} />
                </div>
                <div className="min-w-0">
                    <Kartu judul={`Hasil Lab (${(patient.supportingExams || []).length})`} aksi={
                        <button type="button" onClick={() => setShowRefModal(true)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors">
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            Rujukan
                        </button>
                    }>
                        <div className="space-y-2">
                            {(patient.supportingExams || []).length === 0 ? <Kosong /> : (patient.supportingExams || []).map(e => (
                                <div key={e.id}>
                                    <div className="flex items-center justify-between gap-3 p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 group">
                                        <div className="min-w-0 flex-1">
                                            <p className="text-sm font-semibold truncate">{e.testName}</p>
                                            <p className="text-[10px] text-slate-400">{formatDateTime(e.date)}</p>
                                        </div>
                                        <div className="text-right flex-shrink-0 flex items-center gap-3">
                                            <div>
                                                <span className="text-sm font-bold block">{e.value} <span className="text-[10px] font-medium text-slate-400">{e.unit}</span></span>
                                                {e.result && (
                                                    <span className={`block text-[10px] font-bold ${e.result.status === 'high' ? 'text-red-500' :
                                                        e.result.status === 'low' ? 'text-amber-500' :
                                                            e.result.status === 'normal' ? 'text-green-500' : 'text-slate-400'
                                                        }`}>{e.result.label}</span>
                                                )}
                                            </div>
                                            <button type="button" onClick={() => setConfirmingId(e.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                    </div>
                                    {confirmingId === e.id && (
                                        <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(e.id); setConfirmingId(null); }} label={`Hapus hasil ${e.testName}?`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </Kartu>
                </div>
            </div>
        </>
    );
}

/* ====== TAB OBAT ====== */
function TabObat({ patient, input, setInput, onAdd, onRemove, onAI, aiResult, aiLoading }) {
    const [confirmingId, setConfirmingId] = useState(null);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
            <div className="space-y-5 min-w-0">
                <Kartu judul="Tambah Obat">
                    <form onSubmit={onAdd} className="space-y-3">
                        <input type="text" value={input.name} onChange={e => setInput(p => ({ ...p, name: e.target.value }))} placeholder="Nama obat (cth. Amoxicillin)" required className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-sm" />
                        <div className="flex gap-3">
                            <input type="text" value={input.dosage} onChange={e => setInput(p => ({ ...p, dosage: e.target.value }))} placeholder="Dosis (500mg)" className="flex-1 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm" />
                            <input type="text" value={input.frequency} onChange={e => setInput(p => ({ ...p, frequency: e.target.value }))} placeholder="Frekuensi (3x/hari)" className="flex-1 rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-sm" />
                        </div>

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rute Pemberian</label>
                            <div className="grid grid-cols-3 gap-2">
                                {[
                                    { v: 'oral', l: 'Oral', i: 'pill' },
                                    { v: 'iv', l: 'IV', i: 'vaccines' },
                                    { v: 'im', l: 'IM', i: 'syringe' },
                                    { v: 'sc', l: 'SC', i: 'colorize' },
                                    { v: 'topikal', l: 'Topikal', i: 'dermatology' },
                                    { v: 'inhalasi', l: 'Inhalasi', i: 'air' }
                                ].map(opt => (
                                    <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, route: opt.v }))}
                                        className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all ${input.route === opt.v ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 hover:bg-slate-100'}`}>
                                        <span className="material-symbols-outlined text-lg mb-0.5">{opt.i}</span>
                                        <span className="text-[10px] font-black uppercase">{opt.l}</span>
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20">Tambah Obat</button>
                    </form>
                </Kartu>
                <TombolAI label="Rekomendasi Obat AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={!(patient.symptoms || []).length && !patient.diagnosis} />
            </div>
            <div className="min-w-0">
                <Kartu judul={`Daftar Obat (${(patient.prescriptions || []).length})`}>
                    <div className="space-y-3">
                        {(patient.prescriptions || []).length === 0 ? <Kosong /> : (patient.prescriptions || []).map(p => (
                            <div key={p.id}>
                                <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700 flex items-start justify-between gap-3 group">
                                    <div className="min-w-0">
                                        <p className="font-semibold text-sm truncate">{p.name} {p.dosage}</p>
                                        <p className="text-xs text-slate-500">{p.frequency} • {p.route}</p>
                                    </div>
                                    <div className="flex items-center gap-2">
                                        <button type="button" onClick={() => setConfirmingId(p.id)}
                                            className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                        <span className="material-symbols-outlined text-slate-400 text-sm flex-shrink-0 group-hover:hidden">info</span>
                                    </div>
                                </div>
                                {confirmingId === p.id && (
                                    <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(p.id); setConfirmingId(null); }} label={`Hapus resep ${p.name}?`} />
                                )}
                            </div>
                        ))}
                    </div>
                </Kartu>
            </div>
        </div>
    );
}

/* ====== TAB LAPORAN ====== */
function TabLaporan({ patient, input, setInput, onAdd, onRemove, onAI, aiResult, aiLoading }) {
    const [confirmingId, setConfirmingId] = useState(null);

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-5 lg:gap-6">
            <div className="space-y-5 min-w-0">
                <Kartu judul="Laporan Harian Baru">
                    <form onSubmit={onAdd} className="space-y-4">
                        <textarea value={input.notes} onChange={e => setInput(p => ({ ...p, notes: e.target.value }))} rows={5} required placeholder="Catatan perkembangan pasien hari ini..."
                            className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm" />

                        <div className="space-y-2">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Perbarui Kondisi Pasien</label>
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                {[
                                    { v: 'critical', l: 'Kritis', c: 'border-red-500 text-red-500 bg-red-50' },
                                    { v: 'urgent', l: 'Mendesak', c: 'border-amber-500 text-amber-500 bg-amber-50' },
                                    { v: 'stable', l: 'Stabil', c: 'border-blue-500 text-blue-500 bg-blue-50' },
                                    { v: 'improving', l: 'Membaik', c: 'border-green-500 text-green-500 bg-green-50' }
                                ].map(opt => (
                                    <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, condition: opt.v }))}
                                        className={`py-2 px-1 text-[10px] font-black uppercase rounded-xl border transition-all ${input.condition === opt.v ? opt.c : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500'}`}>
                                        {opt.l}
                                    </button>
                                ))}
                            </div>
                        </div>

                        <button type="submit" className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-lg shadow-primary/20">Simpan Laporan</button>
                    </form>
                </Kartu>
                <TombolAI label="Evaluasi Harian AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={(patient.dailyReports || []).length < 1} />
            </div>
            <div className="min-w-0">
                <Kartu judul={`Riwayat Laporan (${(patient.dailyReports || []).length})`}>
                    <div className="space-y-3">
                        {(patient.dailyReports || []).length === 0 ? <Kosong /> : [...(patient.dailyReports || [])].reverse().map(r => (
                            <div key={r.id}>
                                <div className="p-3 rounded-lg bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700 space-y-1 relative group">
                                    <div className="flex justify-between items-center gap-3">
                                        <span className="text-[10px] text-slate-400">{formatDateTime(r.date)}</span>
                                        <div className="flex items-center gap-2">
                                            {r.condition && <KondisiBadge kondisi={r.condition} />}
                                            <button type="button" onClick={() => setConfirmingId(r.id)}
                                                className="opacity-0 group-hover:opacity-100 p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-all">
                                                <span className="material-symbols-outlined text-sm">close</span>
                                            </button>
                                        </div>
                                    </div>
                                    <p className="text-sm text-slate-600 dark:text-slate-400">{r.notes}</p>
                                </div>
                                {confirmingId === r.id && (
                                    <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(r.id); setConfirmingId(null); }} label="Hapus laporan ini?" />
                                )}
                            </div>
                        ))}
                    </div>
                </Kartu>
            </div>
        </div>
    );
}

/* ====== TAB AI ====== */
function TabAI({ patient, callAI, aiResults, aiLoading, onSaveAI }) {
    const aiMethods = [
        {
            key: 'summary', icon: 'auto_awesome', color: 'from-primary to-blue-600', title: 'Ringkasan Cerdas', desc: 'Kondisi, temuan kritis, tindakan',
            disabled: false,
            fn: () => callAI('summary', () => getSmartSummary(patient))
        },
        {
            key: 'soap', icon: 'clinical_notes', color: 'from-emerald-500 to-teal-500', title: 'Catatan SOAP', desc: 'Generate catatan SOAP otomatis',
            disabled: false,
            fn: () => callAI('soap', () => getSOAPNote(patient))
        },
        {
            key: 'symptoms', icon: 'diagnosis', color: 'from-amber-500 to-orange-500', title: 'Diagnosis Banding', desc: 'Analisis kemungkinan diagnosis',
            disabled: (patient.symptoms || []).length === 0,
            fn: () => callAI('symptoms', () => getSymptomInsight((patient.symptoms || []).map(s => s.name), `${patient.name}, ${patient.age} tahun, Diagnosis: ${patient.diagnosis}`))
        },
    ];

    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 lg:gap-4">
                {aiMethods.map(item => (
                    <button key={item.key} onClick={item.fn} disabled={item.disabled || aiLoading[item.key]}
                        className="flex flex-col items-start p-4 lg:p-5 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-primary/5 hover:border-primary/30 transition-all text-left group disabled:opacity-50">
                        <div className={`size-10 rounded-lg bg-gradient-to-br ${item.color} text-white flex items-center justify-center mb-3 group-hover:scale-110 transition-transform flex-shrink-0`}>
                            <span className="material-symbols-outlined">{item.icon}</span>
                        </div>
                        <span className="font-bold text-sm">{item.title}</span>
                        <span className="text-xs text-slate-500 mt-1">{item.desc}</span>
                    </button>
                ))}
            </div>

            {(patient.symptoms || []).length > 0 && (
                <Kartu judul="Radar Diagnosis Banding" id="radar-diagnosis"><DDxRadar symptoms={patient.symptoms} aiResult={aiResults.symptoms} /></Kartu>
            )}

            {['summary', 'soap', 'symptoms'].map(key => {
                if (!aiResults[key] && !aiLoading[key]) return null;
                const m = aiMethods.find(x => x.key === key);

                return (
                    <KartuAIDetail
                        key={key}
                        judul={m.title}
                        result={aiResults[key]}
                        loading={aiLoading[key]}
                        onUpdate={m.fn}
                        onSave={(text) => onSaveAI(key, text)}
                    />
                );
            })}
        </div>
    );
}

/* ====== KOMPONEN BERSAMA ====== */
function Kartu({ judul, headerIcon, aksi, children, id }) {
    return (
        <div id={id} className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 lg:px-6 py-3 lg:py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 gap-3">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{judul}</h3>
                {aksi || (headerIcon && <span className="material-symbols-outlined text-slate-400 flex-shrink-0">{headerIcon}</span>)}
            </div>
            <div className="p-4 lg:p-6">{children}</div>
        </div>
    );
}

function TombolAI({ label, onGenerate, loading, result, disabled }) {
    return (
        <div className="bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 p-4 lg:p-5">
            <h4 className="font-bold text-primary mb-3 flex items-center gap-2 text-sm">
                <span className="material-symbols-outlined text-lg">auto_awesome</span>Analisis AI
            </h4>
            <button onClick={onGenerate} disabled={disabled || loading}
                className="w-full bg-primary text-white py-2.5 rounded-lg font-bold text-sm hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 mb-3">
                {loading ? <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>Menganalisis...</> :
                    <><span className="material-symbols-outlined text-lg">auto_awesome</span>{label}</>}
            </button>
            {result && <div className="mt-3 p-3 lg:p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-0.5 text-justify"><ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown></div>}
        </div>
    );
}

function KartuAIDetail({ judul, result, loading, onUpdate, onSave }) {
    const [isMinimized, setIsMinimized] = useState(false);
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(result || '');

    useEffect(() => {
        setEditText(result || '');
    }, [result]);

    return (
        <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
            <div className="px-4 lg:px-6 py-3 lg:py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50 gap-3">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate flex items-center gap-2">
                    <span className="material-symbols-outlined text-primary text-lg">auto_awesome</span>
                    {judul}
                </h3>
                <div className="flex gap-1 justify-end items-center flex-wrap">
                    {!isEditing && !loading && result && (
                        <>
                            <button onClick={onUpdate} title="Update AI (Generate Ulang)" className="flex items-center gap-1 p-1.5 px-3 rounded-lg text-slate-500 border border-slate-200 dark:border-slate-700 hover:text-primary hover:border-primary/30 hover:bg-primary/5 transition-colors font-semibold text-[11px] bg-white dark:bg-slate-800">
                                <span className="material-symbols-outlined text-sm">refresh</span> Update
                            </button>
                            <button onClick={() => setIsEditing(true)} title="Edit Manual" className="flex items-center gap-1 p-1.5 px-3 rounded-lg text-slate-500 border border-slate-200 dark:border-slate-700 hover:text-amber-600 hover:border-amber-500/30 hover:bg-amber-50 dark:hover:bg-amber-900/20 transition-colors font-semibold text-[11px] bg-white dark:bg-slate-800 ml-1">
                                <span className="material-symbols-outlined text-sm">edit</span> Edit
                            </button>
                        </>
                    )}
                    {isEditing && (
                        <>
                            <button onClick={() => { setIsEditing(false); setEditText(result); }} title="Batal Edit" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors border border-transparent">
                                <span className="material-symbols-outlined text-sm">close</span>
                            </button>
                            <button onClick={() => { onSave(editText); setIsEditing(false); }} title="Simpan Perubahan" className="flex items-center gap-1 p-1.5 px-4 rounded-lg text-white bg-green-500 hover:bg-green-600 border border-green-600 transition-colors font-bold text-[11px] shadow-sm ml-1">
                                <span className="material-symbols-outlined text-sm">save</span> Simpan
                            </button>
                        </>
                    )}
                    <button onClick={() => setIsMinimized(!isMinimized)} title={isMinimized ? "Perbesar" : "Perkecil"} className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors ml-2 border border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-sm">{isMinimized ? 'expand_more' : 'expand_less'}</span>
                    </button>
                </div>
            </div>

            {!isMinimized && (
                <div className="p-4 lg:p-6 bg-white dark:bg-slate-900">
                    {loading ? (
                        <div className="flex flex-col items-center gap-3 py-10 justify-center">
                            <span className="material-symbols-outlined animate-spin text-primary text-3xl">progress_activity</span>
                            <span className="text-sm font-semibold text-slate-400">Menyusun analisis AI...</span>
                        </div>
                    ) : isEditing ? (
                        <textarea
                            value={editText}
                            onChange={(e) => setEditText(e.target.value)}
                            placeholder="Ketik detail diagnosis/catatan di sini..."
                            className="w-full min-h-[350px] p-4 text-sm rounded-xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-slate-700 dark:text-slate-300 font-mono leading-relaxed"
                        />
                    ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-0.5 text-justify">
                            <ReactMarkdown remarkPlugins={[remarkGfm]}>{result}</ReactMarkdown>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function KondisiBadge({ kondisi }) {
    const styles = { critical: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', urgent: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', stable: 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-400', improving: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    const labels = { critical: 'Kritis', urgent: 'Mendesak', stable: 'Stabil', improving: 'Membaik' };
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase flex-shrink-0 ${styles[kondisi] || styles.stable}`}>{labels[kondisi] || 'Stabil'}</span>;
}

function BadgeKeparahan({ keparahan }) {
    const styles = { berat: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', sedang: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', ringan: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    const labels = { berat: 'Berat', sedang: 'Sedang', ringan: 'Ringan' };
    return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full flex-shrink-0 ${styles[keparahan] || styles.sedang}`}>{labels[keparahan] || keparahan}</span>;
}

function Kosong() {
    return <p className="text-sm text-slate-400 text-center py-6">Belum ada data yang tercatat</p>;
}
