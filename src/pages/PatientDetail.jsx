import { useState, useEffect, useMemo } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { usePatients } from '../context/PatientContext';
import { calculateRecoveryProgress, formatDate, formatDateTime, checkLabValue, labReferences, labCategories } from '../services/dataService';
import LabReferenceModal from '../components/LabReferenceModal';
import ICD10Picker from '../components/ICD10Picker';
import { getSmartSummary, getSymptomInsight, getDailyEvaluation, getPhysicalExamInsight, getSupportingExamInsight, getMedicationRecommendation, getSOAPNote } from '../services/aiService';
import SymptomGraph from '../components/visualization/SymptomGraph';
import TimelineChart from '../components/visualization/TimelineChart';
import VitalSignsChart from '../components/visualization/VitalSignsChart';
import DDxRadar from '../components/visualization/DDxRadar';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { exportPatientPDF } from '../services/pdfExportService';
import BloodGroupPicker from '../components/BloodGroupPicker';
import FornasDrugPicker from '../components/FornasDrugPicker';
import { useCopilotContext } from '../context/CopilotContext';

function getNowLocalISO() {
    const now = new Date();
    return new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}

export default function PatientDetail() {
    const { id } = useParams();
    const navigate = useNavigate();
    const { user } = useAuth();
    const { patients, canEditPatient, updatePatient, addSymptom, removeSymptom, updateSymptom, addDailyReport, removeDailyReport, updateDailyReport, addPhysicalExam, removePhysicalExam, updatePhysicalExam, addSupportingExam, removeSupportingExam, updateSupportingExam, addPrescription, removePrescription, updatePrescription, addVitalSign, updateVitalSign, removeVitalSign } = usePatients();
    const patient = patients.find(p => p.id === id);
    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('patientDetailActiveTab') || 'overview';
    });

    useEffect(() => {
        localStorage.setItem('patientDetailActiveTab', activeTab);
    }, [activeTab]);
    const [aiLoading, setAiLoading] = useState({});
    const [aiResults, setAiResults] = useState(patient?.aiInsights || {});

    const { setPageContext, clearPageContext } = useCopilotContext();

    // Berikan konteks pasien ke CopilotChat (Menjangkau 8 Tab: Ringkasan, Vital, Gejala, Fisik, Lab, Obat, Harian, AI)
    useEffect(() => {
        if (patient) {
            const sympText = (patient.symptoms || []).map(s => `- ${s.name} (${s.severity}): ${s.notes || ''}`).join('\n');
            const physText = (patient.physicalExams || []).map(e => `- [${e.system}] ${e.findings}`).join('\n');
            const labText = (patient.supportingExams || []).map(l => `- ${l.testName}: ${l.value} ${l.unit} (${l.result || 'Normal'})`).join('\n');
            const medText = (patient.prescriptions || []).map(m => `- ${m.name} ${m.dosage} (${m.frequency}) via ${m.route}`).join('\n');
            const reportText = (patient.dailyReports || []).map(r => `- [${formatDate(r.date)}] Kondisi: ${r.condition}. Catatan: ${r.notes}`).join('\n');
            
            // Format AI Insights (Jika ada)
            const aiText = Object.entries(patient.aiInsights || {}).map(([key, val]) => `> [${key.toUpperCase()}] ${val}`).join('\n\n');

            // Format riwayat vital signs
            const vitalHistory = (patient.vitalSigns || [])
                .sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))
                .slice(0, 5)
                .map(v => `- [${formatDateTime(v.recordedAt)}] HR: ${v.heartRate || '-'}, BP: ${v.bloodPressure || '-'}, Temp: ${v.temperature || '-'}, SpO2: ${v.spO2 || '-'}`).join('\n');

            const latestV = (patient.vitalSigns || []).sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0] || {};

            const contextText = `=== RINGKASAN PASIEN ===
Nama: ${patient.name} (${patient.gender === 'female' ? 'P' : 'L'})
Umur: ${patient.age}th | Ruang: ${patient.room || '-'}
Kondisi Saat Ini: ${patient.condition}
Diagnosis: ${patient.diagnosis || 'Belum ada'}
Keluhan Utama: ${patient.chiefComplaint || 'Tidak ada'}
Riwayat & Alergi: ${patient.medicalHistory || '-'} | Alergi: ${patient.allergies || 'Tidak ada'}
Fisik: BB ${patient.weight || '-'}kg, TB ${patient.height || '-'}cm
Vital Terkahir: HR ${latestV.heartRate || patient.heartRate || '-'}, BP ${latestV.bloodPressure || patient.bloodPressure || '-'}, Temp ${latestV.temperature || patient.temperature || '-'}, SpO2 ${latestV.spO2 || patient.spO2 || '-'}

=== RIWAYAT VITAL SIGNS (5 Terkini) ===
${vitalHistory || 'Kosong'}

=== GEJALA (TAB GEJALA) ===
${sympText || 'Kosong'}

=== TEMUAN FISIK (TAB FISIK) ===
${physText || 'Kosong'}

=== HASIL LABORATORIUM (TAB LAB) ===
${labText || 'Kosong'}

=== REJIMEN OBAT (TAB OBAT) ===
${medText || 'Kosong'}

=== LAPORAN HARIAN (TAB HARIAN) ===
${reportText || 'Kosong'}

=== EVALUASI AI (TAB AI) ===
${aiText || 'Belum ada evaluasi AI'}`;
            
            setPageContext(contextText, patient);
        }
        return () => clearPageContext();
    }, [patient, setPageContext, clearPageContext]);

    // Sinkronisasi data AI jika pasien berubah
    useEffect(() => {
        if (patient?.aiInsights) {
            setAiResults(patient.aiInsights);
        } else {
            setAiResults({});
        }
    }, [patient?.id]); // eslint-disable-line react-hooks/exhaustive-deps
    const [symptomInput, setSymptomInput] = useState({ name: '', severity: 'sedang', notes: '', recordedAt: getNowLocalISO() });
    const [examInput, setExamInput] = useState({ findings: '', system: 'umum', date: getNowLocalISO() });
    const [labInput, setLabInput] = useState({ testName: '', value: '', unit: '', labKey: '', date: getNowLocalISO() });
    const [prescInput, setPrescInput] = useState({ name: '', dosage: '', frequency: '', route: 'oral', date: getNowLocalISO(), fornas_source: false, fornas_form: '', fornas_category: '' });
    const [reportInput, setReportInput] = useState({ notes: '', condition: '', date: getNowLocalISO() });

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
        { key: 'vitals', label: 'Vital', icon: 'ecg_heart' },
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
                    <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
                        <span className="material-symbols-outlined">arrow_back</span>
                    </button>
                    <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">{patient.name}</h1>
                    <KondisiBadge kondisi={patient.condition} />
                    <button onClick={() => exportPatientPDF(patient, user?.user_metadata?.pdf_export_prefs)}
                        className="ml-auto flex items-center gap-1.5 px-3 py-2 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800 hover:bg-red-100 dark:hover:bg-red-900/40 transition-colors text-sm font-semibold shrink-0"
                        title="Export laporan medis ke PDF">
                        <span className="material-symbols-outlined text-lg">picture_as_pdf</span>
                        <span className="hidden sm:inline">Export PDF</span>
                    </button>
                </div>
                <nav className="flex text-sm text-slate-500 gap-2 ml-12">
                    <span>Pasien</span><span>/</span><span className="text-primary font-medium truncate">{patient.name}</span>
                </nav>
            </div>

            
            {!canEditPatient && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-2xl p-4 flex items-start gap-3 shadow-sm mb-2">
                    <span className="material-symbols-outlined mt-0.5">lock</span>
                    <div>
                        <h3 className="font-bold text-sm">Mode Read-Only (Langganan Specialist Berakhir)</h3>
                        <p className="text-xs opacity-90 mt-0.5">Anda tidak dapat mengubah data medis Anda karena paket Specialist telah habis. Silakan perpanjang.</p>
                    </div>
                </div>
            )}

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
            <div className="flex border-b border-white/50 dark:border-slate-700/50 gap-1 overflow-x-auto bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-t-3xl px-3 pt-2">
                {tabs.map(tab => (
                    <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                        className={`flex items-center gap-2 px-4 sm:px-5 py-3.5 text-xs sm:text-sm font-semibold whitespace-nowrap border-b-2 transition-all shrink-0 rounded-t-xl ${activeTab === tab.key ? 'border-primary text-primary bg-white/50 dark:bg-slate-800/50 shadow-[0_-4px_10px_rgb(0,0,0,0.02)]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/30 dark:hover:bg-slate-800/30'
                            }`}>
                        <span className="material-symbols-outlined text-[16px] sm:text-[18px]">{tab.icon}</span>
                        <span>{tab.label}</span>
                    </button>
                ))}
            </div>

            {/* Konten */}
            {/* Konten */}
            <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-b-3xl rounded-tr-3xl border border-white/50 dark:border-slate-700/50 p-5 lg:p-7 min-h-125 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none">
                {activeTab === 'overview' && <TabRingkasan patient={patient} navigate={navigate} updatePatient={updatePatient} canEditPatient={canEditPatient} />}
                {activeTab === 'vitals' && <TabVitalSigns patient={patient}
                    onAdd={(vitals) => addVitalSign(patient.id, vitals)}
                    onUpdate={(vsId, updates) => updateVitalSign(patient.id, vsId, updates)}
                    onRemove={(vsId) => removeVitalSign(patient.id, vsId)} />}
                {activeTab === 'symptoms' && <TabGejala patient={patient} input={symptomInput} setInput={setSymptomInput}
                    onAdd={(e) => { e.preventDefault(); if (!symptomInput.name.trim()) return; addSymptom(patient.id, { ...symptomInput, recordedAt: symptomInput.recordedAt ? new Date(symptomInput.recordedAt).toISOString() : new Date().toISOString() }); setSymptomInput({ name: '', severity: 'sedang', notes: '', recordedAt: getNowLocalISO() }); }}
                    onRemove={(symptomId) => removeSymptom(patient.id, symptomId)}
                    onUpdate={(symptomId, updates) => updateSymptom(patient.id, symptomId, updates)}
                    onAI={() => callAI('symptoms', () => getSymptomInsight((patient.symptoms || []).map(s => s.name), `${patient.name}, ${patient.age} tahun`))}
                    aiResult={aiResults.symptoms} aiLoading={aiLoading.symptoms} />}
                {activeTab === 'physical' && <TabDataUmum judul="Pemeriksaan Fisik" storageKey="physical" items={patient.physicalExams || []} input={examInput} setInput={setExamInput}
                    fields={[
                        { key: 'system', type: 'select', label: 'Sistem', options: ['umum', 'kepala', 'leher', 'thorax', 'abdomen', 'ekstremitas', 'neurologis', 'kulit'] },
                        { key: 'findings', type: 'textarea', label: 'Temuan', placeholder: 'Temuan pemeriksaan fisik...' },
                    ]}
                    onAdd={(e) => { e.preventDefault(); if (!examInput.findings.trim()) return; addPhysicalExam(patient.id, { ...examInput, date: examInput.date ? new Date(examInput.date).toISOString() : new Date().toISOString() }); setExamInput({ findings: '', system: 'umum', date: getNowLocalISO() }); }}
                    onRemove={(examId) => removePhysicalExam(patient.id, examId)}
                    onUpdate={(examId, updates) => updatePhysicalExam(patient.id, examId, updates)}
                    renderItem={(item) => <div className="min-w-0"><span className="text-xs font-bold text-primary uppercase">{item.system}</span><p className="text-sm text-slate-600 dark:text-slate-400 mt-1 break-words leading-relaxed">{item.findings}</p></div>}
                    onAI={() => callAI('physical', () => getPhysicalExamInsight((patient.physicalExams || []).map(e => e.findings).join('; '), (patient.symptoms || []).map(s => s.name).join(', ')))}
                    aiResult={aiResults.physical} aiLoading={aiLoading.physical} />}
                {activeTab === 'labs' && <TabLab patient={patient} input={labInput} setInput={setLabInput}
                    onAdd={(e) => { e.preventDefault(); if (!labInput.testName.trim() && labInput.labKey !== 'custom') return; addSupportingExam(patient.id, { type: 'lab', ...labInput, date: labInput.date ? new Date(labInput.date).toISOString() : new Date().toISOString(), result: checkLabValue(labInput.labKey, labInput.value, patient.gender) }); setLabInput({ testName: '', value: '', unit: '', labKey: '', date: getNowLocalISO() }); }}
                    onRemove={(examId) => removeSupportingExam(patient.id, examId)}
                    onUpdate={(examId, updates) => updateSupportingExam(patient.id, examId, updates)}
                    onAI={() => callAI('labs', () => getSupportingExamInsight((patient.supportingExams || []).map(e => `${e.testName}: ${e.value} ${e.unit}`).join(', '), patient.diagnosis || ''))}
                    aiResult={aiResults.labs} aiLoading={aiLoading.labs} />}
                {activeTab === 'prescriptions' && <TabObat patient={patient} input={prescInput} setInput={setPrescInput}
                    onAdd={(e) => { e.preventDefault(); if (!prescInput.name.trim()) return; addPrescription(patient.id, { ...prescInput, date: prescInput.date ? new Date(prescInput.date).toISOString() : new Date().toISOString() }); setPrescInput({ name: '', dosage: '', frequency: '', route: 'oral', date: getNowLocalISO(), fornas_source: false, fornas_form: '', fornas_category: '' }); }}
                    onRemove={(prescId) => removePrescription(patient.id, prescId)}
                    onUpdate={(prescId, updates) => updatePrescription(patient.id, prescId, updates)}
                    onAI={() => callAI('drugs', () => getMedicationRecommendation(patient.diagnosis, (patient.symptoms || []).map(s => s.name).join(', ')))}
                    aiResult={aiResults.drugs} aiLoading={aiLoading.drugs} />}
                {activeTab === 'reports' && <TabLaporan patient={patient} input={reportInput} setInput={setReportInput}
                    onAdd={(e) => { e.preventDefault(); if (!reportInput.notes.trim()) return; addDailyReport(patient.id, { ...reportInput, date: reportInput.date ? new Date(reportInput.date).toISOString() : new Date().toISOString() }); if (reportInput.condition) updatePatient(patient.id, { condition: reportInput.condition }); setReportInput({ notes: '', condition: '', date: getNowLocalISO() }); }}
                    onRemove={(reportId) => removeDailyReport(patient.id, reportId)}
                    onUpdate={(reportId, updates) => updateDailyReport(patient.id, reportId, updates)}
                    onAI={() => { const r = patient.dailyReports || []; callAI('daily', () => getDailyEvaluation(r[r.length - 1] || {}, r[r.length - 2] || {})); }}
                    aiResult={aiResults.daily} aiLoading={aiLoading.daily} />}
                {activeTab === 'ai' && <TabAI patient={patient} callAI={callAI} aiResults={aiResults} aiLoading={aiLoading} onSaveAI={handleSaveAI} canEditPatient={canEditPatient} />}
            </div>
        </div>
    );
}

/* ====== TAB RINGKASAN ====== */
function TabRingkasan({ patient, navigate: _navigate, updatePatient, canEditPatient }) {
    const [headerEditing, setHeaderEditing] = useState(false);
    const [headerTemp, setHeaderTemp] = useState({});

    const latestVitals = useMemo(() => {
        const vs = patient.vitalSigns || [];
        if (vs.length === 0) return {
            heartRate: patient.heartRate,
            bloodPressure: patient.bloodPressure,
            temperature: patient.temperature,
            respRate: patient.respRate,
            spO2: patient.spO2,
        };
        return [...vs].sort((a, b) => new Date(b.recordedAt) - new Date(a.recordedAt))[0];
    }, [patient]);
    const startHeaderEdit = () => {
        setHeaderTemp({
            name: patient.name || '',
            age: patient.age || '',
            gender: patient.gender || 'male',
            admissionDate: patient.admissionDate ? (new Date(patient.admissionDate)).toISOString().slice(0, 10) : '',
            room: patient.room || '',
            bloodType: patient.bloodType || '',
            rhesus: patient.rhesus || '',
            condition: patient.condition || 'stable',
            weight: patient.weight || '',
            height: patient.height || '',
            targetDays: patient.targetDays || '',
            allergies: patient.allergies || '',
            heartRate: patient.heartRate || '',
            bloodPressure: patient.bloodPressure || '',
            temperature: patient.temperature || '',
            respRate: patient.respRate || '',
            spO2: patient.spO2 || '',
            chiefComplaint: patient.chiefComplaint || '',
            diagnosis: patient.diagnosis || '',
            medicalHistory: patient.medicalHistory || '',
        });
        setHeaderEditing(true);
    };

    const cancelHeaderEdit = () => setHeaderEditing(false);

    const saveHeaderEdit = () => {
        const toNum = (v) => v === '' ? null : (isNaN(Number(v)) ? v : Number(v));
        const payload = {
            name: headerTemp.name || patient.name,
            age: toNum(String(headerTemp.age)),
            gender: headerTemp.gender,
            admissionDate: headerTemp.admissionDate || null,
            room: headerTemp.room || null,
            bloodType: headerTemp.bloodType || null,
            rhesus: headerTemp.rhesus || null,
            condition: headerTemp.condition || patient.condition,
            weight: toNum(String(headerTemp.weight)),
            height: toNum(String(headerTemp.height)),
            targetDays: toNum(String(headerTemp.targetDays)),
            allergies: headerTemp.allergies || null,
            heartRate: toNum(String(headerTemp.heartRate)),
            bloodPressure: headerTemp.bloodPressure || null,
            temperature: toNum(String(headerTemp.temperature)),
            respRate: toNum(String(headerTemp.respRate)),
            spO2: toNum(String(headerTemp.spO2)),
            chiefComplaint: headerTemp.chiefComplaint || null,
            diagnosis: headerTemp.diagnosis || null,
            medicalHistory: headerTemp.medicalHistory || null,
        };
        updatePatient(patient.id, payload);
        setHeaderEditing(false);
    };

    return (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 lg:gap-6">
            {headerEditing && (
                <EditPatientModal
                    patient={patient}
                    headerTemp={headerTemp}
                    setHeaderTemp={setHeaderTemp}
                    onSave={saveHeaderEdit}
                    onCancel={cancelHeaderEdit}
                />
            )}
            <div className="lg:col-span-8 space-y-5 lg:space-y-6 min-w-0">
                {/* Kartu Pasien */}
                <div className="relative bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none border border-white/50 dark:border-slate-700/50 p-6 lg:p-8">
                    <div className="absolute top-4 right-4 z-10">
                        <button onClick={startHeaderEdit} title="Edit data pasien" className={`p-1.5 rounded-lg transition-colors border border-transparent ${canEditPatient ? 'text-slate-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20' : 'text-slate-300 cursor-not-allowed opacity-50'}`} disabled={!canEditPatient}>
                            <span className="material-symbols-outlined text-base">edit</span>
                        </button>
                    </div>
                    <div className="flex flex-col sm:flex-row items-start gap-4 sm:gap-6 mb-6">
                        <div className="size-16 sm:size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-white dark:border-slate-800 shadow-sm shrink-0">
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
                                { label: 'J. Kelamin', value: patient.gender === 'female' ? 'Perempuan' : 'Laki-laki' },
                                { label: 'Tgl Masuk', value: formatDate(patient.admissionDate) },
                                { label: 'Gol. Darah', value: patient.bloodType ? `${patient.bloodType}${patient.rhesus || ''}` : '-', className: 'text-red-500 font-bold' },
                            ].map(item => (
                                <div key={item.label} className="min-w-0">
                                    <p className="text-[10px] sm:text-xs text-slate-400 font-medium truncate">{item.label}</p>
                                    <p className={`font-semibold text-sm truncate ${item.className || ''}`}>{item.value}</p>
                                </div>
                            ))}
                            <div className="col-span-2 sm:col-span-4 min-w-0 pt-1">
                                <p className="text-[10px] sm:text-xs text-slate-400 font-medium mb-0.5">Ruang Rawat</p>
                                <p className="font-bold text-sm text-primary bg-primary/10 px-2 py-0.5 rounded-md inline-block max-w-full truncate">{patient.room || '-'}</p>
                            </div>
                        </div>
                        </div>
                    </div>
                    {/* Tanda Vital */}
                    <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tanda Vital</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                        {[
                            { label: 'Detak Jantung', value: latestVitals.heartRate, unit: 'bpm' },
                            { label: 'Tekanan Darah', value: latestVitals.bloodPressure, unit: 'mmHg' },
                            { label: 'Suhu', value: latestVitals.temperature, unit: '°C' },
                            { label: 'Frek. Napas', value: latestVitals.respRate, unit: '/min' },
                            { label: 'SpO2', value: latestVitals.spO2, unit: '%' },
                        ].map(v => (
                            <div key={v.label} className="p-2 lg:p-3 bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/10 text-center flex flex-col h-full">
                                <p className="text-[10px] sm:text-xs text-primary font-bold leading-tight min-h-7 flex items-start justify-center mb-1">{v.label}</p>
                                <div className="flex flex-col items-center justify-center mt-auto min-h-11">
                                    <span className="text-base sm:text-[1.1rem] font-black text-slate-800 dark:text-slate-100 leading-none mb-0.5">{v.value || '-'}</span>
                                    <span className="text-[9px] sm:text-[10px] text-slate-500 font-bold tracking-wide">{v.unit}</span>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>

                {/* Keluhan Utama */}
                <Kartu judul="Keluhan Utama" aksi={
                    <button onClick={startHeaderEdit}
                        className={`p-1.5 rounded-lg transition-colors border border-transparent ${canEditPatient ? 'text-slate-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20' : 'text-slate-300 cursor-not-allowed opacity-50'}`} disabled={!canEditPatient}
                        title="Edit keluhan utama">
                        <span className="material-symbols-outlined text-sm">edit</span>
                    </button>
                }>
                    <p className="text-sm text-slate-600 dark:text-slate-400">{patient.chiefComplaint || 'Belum dicatat'}</p>
                </Kartu>

                {/* Visualisasi */}
                {(patient.symptoms || []).length > 0 && (
                    <>
                        <Kartu judul="Peta Gejala" headerIcon="hub" id="grafik-gejala">
                            <div className="h-75 lg:h-87.5"><SymptomGraph symptoms={patient.symptoms} aiResult={patient.aiInsights?.symptoms} /></div>
                        </Kartu>
                        <Kartu judul="Timeline Gejala" headerIcon="timeline" id="timeline-gejala">
                            <TimelineChart symptoms={patient.symptoms} admissionDate={patient.admissionDate} />
                        </Kartu>
                    </>
                )}
            </div>

            {/* Kolom Kanan */}
            <div className="lg:col-span-4 space-y-5 lg:space-y-6 min-w-0">
                <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none border border-white/50 dark:border-slate-700/50 overflow-hidden">
                    <div className="px-5 py-4 border-b border-white/30 dark:border-slate-700/30 bg-white/40 dark:bg-slate-800/40 flex items-center justify-between gap-3 backdrop-blur-md">
                        <h3 className="font-bold text-sm">Ringkasan Pasien</h3>
                        <button onClick={startHeaderEdit}
                            className={`p-1.5 rounded-lg transition-colors border border-transparent ${canEditPatient ? 'text-slate-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20' : 'text-slate-300 cursor-not-allowed opacity-50'}`} disabled={!canEditPatient}
                            title="Edit data pasien">
                            <span className="material-symbols-outlined text-sm">edit</span>
                        </button>
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
                            { label: 'Tren Vital', value: (patient.vitalSigns || []).length },
                        ].map(item => (
                            <div key={item.label} className="flex justify-between items-start gap-2 p-2 rounded-lg hover:bg-slate-50 dark:hover:bg-slate-800 text-sm">
                                <span className="text-slate-500 shrink-0 text-xs">{item.label}</span>
                                <span className="font-semibold text-right break-words min-w-0 max-w-[60%] text-xs leading-snug">{item.value}</span>
                            </div>
                        ))}
                    </div>
                </div>
                <div className="bg-primary/5 dark:bg-primary/10 backdrop-blur-md rounded-2xl border border-primary/20 p-6 shadow-sm">
                    <h4 className="font-bold text-primary mb-2 flex items-center gap-2 text-sm">
                        <span className="material-symbols-outlined text-lg">lightbulb</span>Tips Klinis
                    </h4>
                    <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                        Gunakan tab di atas untuk menambahkan data klinis. Tab AI akan menganalisis semua data dan memberikan saran diagnostik.
                    </p>
                </div>
            </div>

            {/* Tren Vital Signs — full width */}
            <div className="lg:col-span-12">
                <Kartu judul="Tren Vital Signs" headerIcon="show_chart">
                    <VitalSignsChart vitalSigns={patient.vitalSigns} />
                </Kartu>
            </div>
        </div>
    );
}

/* ====== EDIT PATIENT MODAL ====== */
function EditPatientModal({ patient, headerTemp, setHeaderTemp, onSave, onCancel }) {
    const set = (key) => (e) => setHeaderTemp(p => ({ ...p, [key]: e.target.value }));
    const setVal = (key, val) => setHeaderTemp(p => ({ ...p, [key]: val }));
    const [showDiagnosisPicker, setShowDiagnosisPicker] = useState(false);

    return (
        <div
            className="fixed inset-0 z-50 flex items-start justify-center bg-black/60 backdrop-blur-sm overflow-y-auto p-3 sm:p-5 lg:p-8"
            onClick={(e) => { if (e.target === e.currentTarget) onCancel(); }}
        >
            <div className="relative bg-white dark:bg-slate-900 rounded-2xl shadow-2xl w-full max-w-5xl my-2 border border-slate-200 dark:border-slate-800 animate-[fadeIn_0.2s_ease-out]">

                {/* Modal Header */}
                <div className="sticky top-0 z-10 flex items-center justify-between px-5 sm:px-7 py-4 border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 rounded-t-2xl gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                        <div className="size-9 sm:size-10 rounded-xl bg-primary/10 flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-primary text-[20px]">edit_square</span>
                        </div>
                        <div className="min-w-0">
                            <h2 className="text-base sm:text-lg font-black text-slate-900 dark:text-slate-100 truncate">Edit Data Pasien</h2>
                            <p className="text-xs text-slate-500 truncate">{patient.name}</p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 shrink-0">
                        <button onClick={onCancel}
                            className="flex items-center gap-1.5 px-3 sm:px-4 py-2 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 hover:bg-slate-100 dark:hover:bg-slate-800 font-semibold text-sm transition-all">
                            <span className="material-symbols-outlined text-sm">close</span>
                            <span className="hidden sm:inline">Batal</span>
                        </button>
                        <button onClick={onSave}
                            className="flex items-center gap-1.5 bg-primary text-white px-4 sm:px-6 py-2 rounded-xl font-bold text-sm hover:brightness-110 transition-all shadow-lg shadow-primary/20 active:scale-[0.98]">
                            <span className="material-symbols-outlined text-sm">save</span>
                            Simpan
                        </button>
                    </div>
                </div>

                {/* Modal Body */}
                <div className="p-5 sm:p-6 lg:p-8 space-y-7 lg:space-y-8">

                    {/* Row 1: Data Dasar / Detail Medis / Registrasi */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5 lg:gap-6">
                        <EditSection title="Data Dasar" icon="person">
                            <div className="space-y-4">
                                <EditInput label="Nama Lengkap" value={headerTemp.name || ''} onChange={set('name')} placeholder="Nama pasien" />
                                <EditInput label="Ruang Rawat (Kamar)" value={headerTemp.room || ''} onChange={set('room')} placeholder="Cth: Mawar - Bed 3" />
                                <div className="grid grid-cols-2 gap-3">
                                    <EditInput label="Umur (Tahun)" type="number" value={headerTemp.age || ''} onChange={set('age')} placeholder="56" min="0" />
                                    <div>
                                        <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">J. Kelamin</label>
                                        <div className="flex p-1 bg-slate-50 dark:bg-slate-800 rounded-xl gap-1 border border-slate-100 dark:border-slate-700 h-10.5">
                                            {[{ v: 'male', i: 'male', l: 'Laki-laki' }, { v: 'female', i: 'female', l: 'Perempuan' }].map(opt => (
                                                <button key={opt.v} type="button" onClick={() => setVal('gender', opt.v)} title={opt.l}
                                                    className={`flex-1 rounded-lg transition-all flex items-center justify-center ${headerTemp.gender === opt.v ? 'bg-white dark:bg-slate-700 text-primary shadow-sm' : 'text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700'}`}>
                                                    <span className="material-symbols-outlined text-[20px]">{opt.i}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                </div>
                            </div>
                        </EditSection>

                        <EditSection title="Detail Medis" icon="clinical_notes">
                            <div className="space-y-4">
                                <div className="grid grid-cols-2 gap-3">
                                    <BloodGroupPicker label="Gol. Darah"
                                        valueType={headerTemp.bloodType || ''}
                                        valueRhesus={headerTemp.rhesus || ''}
                                        onChangeType={(val) => setVal('bloodType', val)}
                                        onChangeRhesus={(val) => setVal('rhesus', val)} />
                                    <EditSelect label="Kondisi" value={headerTemp.condition || 'stable'} onChange={set('condition')}
                                        options={[{ v: 'stable', l: 'Stabil' }, { v: 'improving', l: 'Membaik' }, { v: 'urgent', l: 'Mendesak' }, { v: 'critical', l: 'Kritis' }]} />
                                </div>
                                <div className="grid grid-cols-2 gap-3">
                                    <EditInput label="BB (kg)" type="number" value={headerTemp.weight || ''} onChange={set('weight')} placeholder="70" min="0" />
                                    <EditInput label="TB (cm)" type="number" value={headerTemp.height || ''} onChange={set('height')} placeholder="170" min="0" />
                                </div>
                                <EditInput label="Alergi" value={headerTemp.allergies || ''} onChange={set('allergies')} placeholder="Cth: Penicillin" />
                            </div>
                        </EditSection>

                        <EditSection title="Registrasi" icon="calendar_today">
                            <div className="space-y-4">
                                <EditInput label="Tgl Masuk" type="date" value={headerTemp.admissionDate || ''} onChange={set('admissionDate')} />
                                <EditInput label="Target Sembuh (Hari)" type="number" value={headerTemp.targetDays || ''} onChange={set('targetDays')} placeholder="7" min="1" />
                            </div>
                        </EditSection>
                    </div>

                    {/* Row 2: Tanda Vital */}
                    <EditSection title="Tanda Vital" icon="ecg">
                        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 sm:gap-4">
                            {[
                                { key: 'heartRate', label: 'Detak Jantung', unit: 'bpm', placeholder: '80' },
                                { key: 'bloodPressure', label: 'Tek. Darah', unit: 'mmHg', placeholder: '120/80' },
                                { key: 'temperature', label: 'Suhu', unit: '°C', placeholder: '36.5' },
                                { key: 'respRate', label: 'Frek. Napas', unit: '/min', placeholder: '18' },
                                { key: 'spO2', label: 'SpO2', unit: '%', placeholder: '98' },
                            ].map(v => (
                                <div key={v.key} className="flex flex-col items-center p-3 sm:p-4 bg-slate-50 dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-2 text-center leading-tight">{v.label}</span>
                                    <input
                                        type="text"
                                        value={headerTemp[v.key] || ''}
                                        onChange={set(v.key)}
                                        placeholder={v.placeholder}
                                        className="w-full bg-transparent border-none p-0 text-center font-black text-xl focus:ring-0 text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600"
                                    />
                                    <span className="text-[9px] text-slate-400 font-bold mt-1">{v.unit}</span>
                                </div>
                            ))}
                        </div>
                    </EditSection>

                    {/* Row 3: Keluhan + Diagnosis */}
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                        <EditTextArea label="Keluhan Utama" value={headerTemp.chiefComplaint || ''} onChange={set('chiefComplaint')} rows={4} placeholder="Jelaskan alasan utama pasien masuk..." />
                        <div>
                            <div className="flex items-center justify-between mb-1.5 ml-1">
                                <label className="block text-[10px] font-bold text-slate-400 uppercase">Diagnosis</label>
                                <button type="button" onClick={() => setShowDiagnosisPicker(true)}
                                    className="flex items-center gap-1 text-[11px] text-primary hover:text-primary/80 font-medium transition px-2 py-1 rounded-lg hover:bg-primary/10">
                                    <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
                                    ICD-10
                                </button>
                            </div>
                            <textarea value={headerTemp.diagnosis || ''} onChange={set('diagnosis')} rows={4} placeholder="Diagnosis awal atau temuan utama..."
                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3 px-4 shadow-sm hover:shadow-md resize-none leading-relaxed" />
                            {showDiagnosisPicker && (
                                <ICD10Picker
                                    onSelect={(code, display) => { set('diagnosis')({ target: { value: headerTemp.diagnosis ? `${headerTemp.diagnosis}\n${display} (${code})` : `${display} (${code})` } }); setShowDiagnosisPicker(false); }}
                                    onClose={() => setShowDiagnosisPicker(false)}
                                />
                            )}
                        </div>
                    </div>

                    {/* Row 4: Riwayat */}
                    <EditTextArea label="Riwayat Penyakit Dahulu" value={headerTemp.medicalHistory || ''} onChange={set('medicalHistory')} rows={3} placeholder="Riwayat medis relevan, komorbiditas, dll..." />
                </div>
            </div>
        </div>
    );
}

/* ====== EDIT HELPER COMPONENTS ====== */
function EditSection({ title, icon, children }) {
    return (
        <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[2px]">
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                {title}
            </h3>
            {children}
        </div>
    );
}

function EditInput({ label, ...props }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">{label}</label>
            <input {...props} className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3 px-4 shadow-sm hover:shadow-md" />
        </div>
    );
}

function EditTextArea({ label, ...props }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">{label}</label>
            <textarea {...props} className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3 px-4 shadow-sm hover:shadow-md resize-none leading-relaxed" />
        </div>
    );
}

function EditSelect({ label, options, ...props }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1.5 ml-1">{label}</label>
            <select {...props} className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3 px-4 shadow-sm hover:shadow-md appearance-none">
                {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
        </div>
    );
}

/* ====== TAB VITAL SIGNS ====== */
function TabVitalSigns({ patient, onAdd, onUpdate, onRemove, canEditPatient }) {
    const now = new Date();
    const localISO = new Date(now - now.getTimezoneOffset() * 60000).toISOString().slice(0, 16);

    const [vitalInput, setVitalInput] = useState({
        recordedAt: localISO,
        heartRate: '', bloodPressure: '', temperature: '', respRate: '', spO2: '',
    });
    const [confirmingId, setConfirmingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});

    const sorted = useMemo(() =>
        [...(patient.vitalSigns || [])].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt)),
        [patient.vitalSigns]
    );

    const setV = (key) => (e) => setVitalInput(p => ({ ...p, [key]: e.target.value }));
    const setEd = (key) => (e) => setEditData(p => ({ ...p, [key]: e.target.value }));

    const handleAdd = (e) => {
        e.preventDefault();
        const { heartRate, bloodPressure, temperature, respRate, spO2 } = vitalInput;
        if (!heartRate && !bloodPressure && !temperature && !respRate && !spO2) return;
        onAdd({ ...vitalInput, recordedAt: new Date(vitalInput.recordedAt).toISOString() });
        const newNow = new Date();
        const newLocal = new Date(newNow - newNow.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setVitalInput({ recordedAt: newLocal, heartRate: '', bloodPressure: '', temperature: '', respRate: '', spO2: '' });
    };

    const startEdit = (vs) => {
        setEditingId(vs.id);
        const dt = vs.recordedAt ? new Date(vs.recordedAt) : new Date();
        const localDt = new Date(dt - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEditData({
            recordedAt: localDt,
            heartRate: vs.heartRate ?? '',
            bloodPressure: vs.bloodPressure ?? '',
            temperature: vs.temperature ?? '',
            respRate: vs.respRate ?? '',
            spO2: vs.spO2 ?? '',
        });
    };

    const saveEdit = () => {
        onUpdate(editingId, { ...editData, recordedAt: editData.recordedAt ? new Date(editData.recordedAt).toISOString() : undefined });
        setEditingId(null);
    };

    const vitalFields = [
        { key: 'heartRate', label: 'Detak Jantung', unit: 'bpm', placeholder: '80' },
        { key: 'bloodPressure', label: 'Tekanan Darah', unit: 'mmHg', placeholder: '120/80' },
        { key: 'temperature', label: 'Suhu', unit: '°C', placeholder: '36.5' },
        { key: 'respRate', label: 'Frek. Napas', unit: '/min', placeholder: '18' },
        { key: 'spO2', label: 'SpO2', unit: '%', placeholder: '98' },
    ];

    return (
        <div className="space-y-5 lg:space-y-6">
            {/* Input Form */}
            <Kartu judul="Catat Vital Signs" className="border-primary/20 bg-primary/5">
                {canEditPatient && (<form onSubmit={handleAdd} className="space-y-4">
                    <div className="space-y-5">
                        <div className="space-y-1.5 px-1">
                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">calendar_month</span> Waktu Pencatatan</label>
                            <input type="datetime-local" value={vitalInput.recordedAt} onChange={setV('recordedAt')}
                                className="w-full sm:w-auto rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3 px-4 shadow-sm hover:shadow-md" />
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                            {[
                                { k: 'heartRate', l: 'Jantung', u: 'bpm', i: 'favorite', c: 'text-red-500' },
                                { k: 'bloodPressure', l: 'TD', u: 'mmHg', i: 'rebase_edit', c: 'text-blue-500' },
                                { k: 'temperature', l: 'Suhu', u: '°C', i: 'thermostat', c: 'text-amber-500' },
                                { k: 'respRate', l: 'Napas', u: '/min', i: 'air', c: 'text-teal-500' },
                                { k: 'spO2', l: 'SpO2', u: '%', i: 'lungs', c: 'text-indigo-500' },
                            ].map(f => (
                                <div key={f.k} className="p-4 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-2xl border border-white/50 dark:border-slate-700/50 flex flex-col items-center group hover:border-primary/40 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all duration-300 shadow-sm hover:shadow-md">
                                    <div className={`p-2 rounded-xl bg-white/60 dark:bg-slate-900 mb-2 group-hover:scale-110 shadow-sm transition-transform ${f.c}`}>
                                        <span className="material-symbols-outlined text-[16px] block">{f.i}</span>
                                    </div>
                                    <span className="text-[9px] font-bold text-slate-400 uppercase mb-2 tracking-widest text-center">{f.l}</span>
                                    <div className="flex items-baseline gap-1 relative">
                                        <input type="text" value={vitalInput[f.k]} onChange={setV(f.k)} placeholder="-" className="w-16 bg-transparent border-none p-0 text-center font-bold text-xl text-slate-900 dark:text-white focus:ring-0 placeholder:text-slate-200" />
                                        <span className="text-[7px] text-slate-400 font-bold uppercase tracking-tighter absolute -right-3 bottom-1">{f.u}</span>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                    <button type="submit" 
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined font-bold">add_circle</span> Simpan Data Vital
                    </button>
                </form>)}
            </Kartu>

            {/* Chart tren */}
            {(patient.vitalSigns || []).length > 0 && (
                <Kartu judul="Tren Vital Signs" headerIcon="show_chart">
                    <VitalSignsChart vitalSigns={patient.vitalSigns} />
                </Kartu>
            )}

            {/* Riwayat */}
            <Kartu judul={`Riwayat Vital Signs (${sorted.length})`} headerIcon="history">
                {sorted.length === 0 ? <Kosong /> : (
                    <div className="max-h-[360px] overflow-y-auto custom-scrollbar pr-2 space-y-3">
                        {sorted.map(vs => (
                            <div key={vs.id}>
                                {editingId === vs.id ? (
                                    <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                        <div>
                                            <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1.5 block">Waktu</label>
                                            <input type="datetime-local" value={editData.recordedAt} onChange={setEd('recordedAt')}
                                                className="rounded-2xl border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-2.5 px-4 w-full sm:w-auto shadow-sm" />
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-3">
                                            {vitalFields.map(f => (
                                                <div key={f.key} className="flex flex-col items-center p-3 sm:p-4 bg-white dark:bg-slate-800 rounded-xl border border-slate-100 dark:border-slate-700">
                                                    <span className="text-[9px] font-black text-slate-400 uppercase tracking-wide mb-2 text-center leading-tight">{f.label}</span>
                                                    <input type="text" value={editData[f.key]} onChange={setEd(f.key)} placeholder={f.placeholder}
                                                        className="w-full bg-transparent border-none p-0 text-center font-black text-xl focus:ring-0 text-slate-800 dark:text-slate-100 placeholder:text-slate-300 dark:placeholder:text-slate-600" />
                                                    <span className="text-[9px] text-slate-400 font-bold mt-1">{f.unit}</span>
                                                </div>
                                            ))}
                                        </div>
                                        <div className="flex gap-2 justify-end pt-1">
                                            <button type="button" onClick={() => setEditingId(null)}
                                                className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">
                                                Batal
                                            </button>
                                            <button type="button" onClick={saveEdit}
                                                className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20">
                                                Simpan
                                            </button>
                                        </div>
                                    </div>
                                ) : (
                                    <div className="p-3 rounded-xl bg-slate-50 dark:bg-slate-800 border border-slate-100 dark:border-slate-700">
                                        <div className="flex items-center justify-between gap-2 mb-3">
                                            <span className="flex items-center gap-1.5 text-xs font-bold text-slate-500">
                                                <span className="material-symbols-outlined text-sm">schedule</span>
                                                {formatDateTime(vs.recordedAt)}
                                            </span>
                                            <div className="flex gap-1">
                                                <button type="button" onClick={() => startEdit(vs)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors"
                                                    title="Edit">
                                                    <span className="material-symbols-outlined text-sm">edit</span>
                                                </button>
                                                <button type="button" onClick={() => setConfirmingId(vs.id)}
                                                    className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                                                    title="Hapus">
                                                    <span className="material-symbols-outlined text-sm">close</span>
                                                </button>
                                            </div>
                                        </div>
                                        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2">
                                            {[
                                                { label: 'Detak Jantung', value: vs.heartRate, unit: 'bpm' },
                                                { label: 'Tekanan Darah', value: vs.bloodPressure, unit: 'mmHg' },
                                                { label: 'Suhu', value: vs.temperature, unit: '°C' },
                                                { label: 'Frek. Napas', value: vs.respRate, unit: '/min' },
                                                { label: 'SpO2', value: vs.spO2, unit: '%' },
                                            ].map(v => (
                                                <div key={v.label} className="text-center p-2 bg-white dark:bg-slate-900 rounded-lg border border-slate-100 dark:border-slate-700">
                                                    <p className="text-[9px] text-slate-400 font-bold uppercase leading-tight mb-0.5">{v.label}</p>
                                                    <p className="font-black text-sm text-slate-800 dark:text-slate-100">{v.value || '-'}</p>
                                                    <p className="text-[9px] text-slate-400">{v.unit}</p>
                                                </div>
                                            ))}
                                        </div>
                                    </div>
                                )}
                                {confirmingId === vs.id && (
                                    <ConfirmPanel
                                        onCancel={() => setConfirmingId(null)}
                                        onConfirm={() => { onRemove(vs.id); setConfirmingId(null); }}
                                        label="Hapus data vital signs ini?"
                                    />
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </Kartu>
        </div>
    );
}

/* ====== TAB GEJALA ====== */
function TabGejala({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient }) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});

    const startEdit = (s) => {
        setEditingId(s.id);
        const dt = s.recordedAt ? new Date(s.recordedAt) : new Date();
        const localDt = new Date(dt - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEditData({ name: s.name, severity: s.severity, notes: s.notes || '', recordedAt: localDt });
    };

    const saveEdit = () => {
        onUpdate(editingId, { ...editData, recordedAt: editData.recordedAt ? new Date(editData.recordedAt).toISOString() : undefined });
        setEditingId(null);
    };

    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                <div className="space-y-5 min-w-0">
                    <Kartu judul="Tambah Gejala" className="border-primary/20 bg-primary/5">
                        <form onSubmit={onAdd} className="space-y-4">
                            <div className="space-y-4">
                                <div className="relative group">
                                    <input type="text" value={input.name} onChange={e => setInput(p => ({ ...p, name: e.target.value }))} required placeholder="Nama gejala (cth. Demam, Sesak)"
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all shadow-sm px-4 py-3.5 placeholder:text-slate-400" />
                                </div>

                                <div className="relative group">
                                    <textarea value={input.notes || ''} onChange={e => setInput(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Catatan penyakit (opsional)"
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all resize-none shadow-sm px-4 py-3.5 placeholder:text-slate-400 leading-relaxed" />
                                </div>

                                <div className="space-y-2.5 px-1">
                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">warning</span> Tingkat Keparahan</label>
                                    <div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl gap-1 border border-slate-100 dark:border-slate-800">
                                        {[{ v: 'ringan', l: 'Ringan' }, { v: 'sedang', l: 'Sedang' }, { v: 'berat', l: 'Berat' }].map(opt => (
                                            <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, severity: opt.v }))}
                                                className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${input.severity === opt.v ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                                {opt.l}
                                            </button>
                                        ))}
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-1.5 ml-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">calendar_month</span> Waktu Pencatatan</label>
                                <div className="relative group">
                                    <input type="datetime-local" value={input.recordedAt} onChange={e => setInput(p => ({ ...p, recordedAt: e.target.value }))}
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3.5 px-4 shadow-sm" />
                                </div>
                            </div>

                            <button type="submit" 
                                className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined font-bold">add_circle</span> Simpan Gejala
                            </button>
                        </form>
                    </Kartu>
                </div>
                <div className="space-y-5 min-w-0">
                    <Kartu judul={`Daftar Gejala (${(patient.symptoms || []).length})`}>
                        <div className="max-h-[360px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                            {(patient.symptoms || []).length === 0 ? <Kosong /> :
                                [...(patient.symptoms || [])].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt)).map(s => (
                                    <div key={s.id}>
                                        {editingId === s.id ? (
                                            <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                                <input type="text" value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} placeholder="Nama gejala (cth. Demam, Sesak)"
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-sm px-4 py-3.5 placeholder:text-slate-400" />
                                                <textarea value={editData.notes || ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Catatan penyakit (opsional)"
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all resize-none shadow-sm px-4 py-3.5 placeholder:text-slate-400 leading-relaxed" />
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Keparahan</label>
                                                    <div className="flex p-1 bg-slate-100 dark:bg-slate-800/50 rounded-xl gap-1">
                                                        {[
                                                            { v: 'ringan', l: 'Ringan', c: 'text-green-600 bg-green-50 border-green-200' },
                                                            { v: 'sedang', l: 'Sedang', c: 'text-amber-600 bg-amber-50 border-amber-200' },
                                                            { v: 'berat', l: 'Berat', c: 'text-red-600 bg-red-50 border-red-200' }
                                                        ].map(opt => (
                                                            <button key={opt.v} type="button" onClick={() => setEditData(p => ({ ...p, severity: opt.v }))}
                                                                className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all border ${editData.severity === opt.v ? `${opt.c} shadow-sm` : 'text-slate-500 border-transparent hover:bg-white/50 dark:hover:bg-slate-800'}`}>
                                                                {opt.l}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                                <div>
                                                    <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Waktu</label>
                                                    <input type="datetime-local" value={editData.recordedAt} onChange={e => setEditData(p => ({ ...p, recordedAt: e.target.value }))}
                                                        className="w-full rounded-xl border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm font-semibold transition-all py-2.5 px-4" />
                                                </div>
                                                <div className="flex gap-2 justify-end pt-1">
                                                    <button type="button" onClick={() => setEditingId(null)}
                                                        className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
                                                    <button type="button" onClick={saveEdit}
                                                        className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20">Simpan</button>
                                                </div>
                                            </div>
                                        ) : (
                                            <div className="p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm group hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                    <div className="flex-1 min-w-0">
                                                        <div className="flex items-start gap-2.5 mb-1">
                                                            <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${s.severity === 'berat' ? 'bg-red-500' : s.severity === 'sedang' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                                            <span className="text-sm font-bold flex-1 min-w-0 break-words leading-snug">{s.name}</span>
                                                        </div>
                                                        {s.notes && <p className="text-xs text-slate-500 ml-4.5 mb-2 break-words leading-relaxed">{s.notes}</p>}
                                                        <div className="flex items-center gap-2.5 ml-4.5 mt-2">
                                                            <BadgeKeparahan keparahan={s.severity} />
                                                            <span className="text-[10px] font-medium text-slate-400">{formatDateTime(s.recordedAt)}</span>
                                                        </div>
                                                    </div>
                                                    
                                                    <div className="flex items-center self-end sm:self-start gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                        <button type="button" onClick={() => startEdit(s)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                                                            <span className="material-symbols-outlined text-[16px]">edit</span>
                                                        </button>
                                                        <button type="button" onClick={() => setConfirmingId(s.id)}
                                                            className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                                            <span className="material-symbols-outlined text-[16px]">close</span>
                                                        </button>
                                                    </div>
                                                </div>
                                            </div>
                                        )}
                                        {confirmingId === s.id && (
                                            <div className="mt-1 flex items-center justify-end gap-2 px-3 py-2 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800">
                                                <span className="text-xs text-red-600 dark:text-red-400 font-medium flex-1">Hapus gejala <strong>{s.name}</strong>?</span>
                                                <button type="button" onClick={() => setConfirmingId(null)}
                                                    className="px-3 py-1 text-xs font-semibold rounded-md bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-700 transition-colors">Batal</button>
                                                <button type="button" onClick={() => { onRemove(s.id); setConfirmingId(null); }}
                                                    className="px-3 py-1 text-xs font-bold rounded-md bg-red-500 text-white hover:bg-red-600 transition-colors">Hapus</button>
                                            </div>
                                        )}
                                    </div>
                                ))}
                        </div>
                    </Kartu>
                </div>
            </div>

            <TombolAI label="Analisis Gejala" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={(patient.symptoms || []).length === 0} storageKey="gejala" />

            {(patient.symptoms || []).length > 0 && (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                    <Kartu judul="Node Gejala" id="grafik-gejala-tab"><div className="h-70 lg:h-75"><SymptomGraph symptoms={patient.symptoms} aiResult={aiResult} /></div></Kartu>
                    <Kartu judul="Timeline Gejala" id="timeline-gejala-tab"><TimelineChart symptoms={patient.symptoms} admissionDate={patient.admissionDate} /></Kartu>
                </div>
            )}
        </div>
    );
}

/* ====== TAB DATA UMUM ====== */
function TabDataUmum({ judul, items, input, setInput, fields, onAdd, onRemove, onUpdate, renderItem, onAI, aiResult, aiLoading, storageKey }) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});

    const startEdit = (item) => {
        setEditingId(item.id);
        const dt = item.date ? new Date(item.date) : new Date();
        const localDt = new Date(dt - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        const base = { date: localDt };
        fields.forEach(f => { base[f.key] = item[f.key] ?? ''; });
        setEditData(base);
    };

    const saveEdit = () => {
        const updates = { ...editData, date: editData.date ? new Date(editData.date).toISOString() : undefined };
        onUpdate(editingId, updates);
        setEditingId(null);
    };

    const sorted = useMemo(() =>
        [...items].sort((a, b) => new Date(a.date) - new Date(b.date)),
        [items]
    );

    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                <div className="space-y-5 min-w-0">
                    <Kartu judul={`Tambah ${judul}`} className="border-secondary/20 bg-secondary/5">
                        <form onSubmit={onAdd} className="space-y-4">
                            <div className="space-y-4">
                                {fields.map(f => f.type === 'select' ? (
                                    <div key={f.key} className="space-y-2.5 px-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">category</span> {f.label}</label>
                                        <div className="grid grid-cols-4 gap-1 p-1 bg-white/40 dark:bg-slate-950/40 backdrop-blur-md rounded-xl border border-white/50 dark:border-slate-800">
                                            {f.options.map(o => (
                                                <button key={o} type="button" onClick={() => setInput(p => ({ ...p, [f.key]: o }))}
                                                    className={`py-2 text-[9px] font-bold uppercase rounded-lg transition-all ${input[f.key] === o ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                                    {o}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                ) : (
                                    <div key={f.key} className="relative group">
                                        <textarea value={input[f.key]} onChange={e => setInput(p => ({ ...p, [f.key]: e.target.value }))} rows={4} required placeholder={f.placeholder}
                                            className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all resize-none shadow-sm px-4 py-4 placeholder:text-slate-400 leading-relaxed" />
                                    </div>
                                ))}
                            </div>
                            <div className="space-y-2 ml-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5 ml-1"><span className="material-symbols-outlined text-[15px] opacity-80">calendar_month</span> Waktu Pencatatan</label>
                                <div className="relative group">
                                    <input type="datetime-local" value={input.date} onChange={e => setInput(p => ({ ...p, date: e.target.value }))}
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3.5 px-4 shadow-sm" />
                                </div>
                            </div>
                            <button type="submit" 
                                className="w-full bg-secondary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-secondary/25 hover:shadow-secondary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined font-bold">save</span> Simpan {judul}
                            </button>
                        </form>
                    </Kartu>
                </div>
                <div className="min-w-0">
                    <Kartu judul={`Riwayat (${items.length})`}>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-3">
                            {items.length === 0 ? <Kosong /> : [...items].sort((a, b) => new Date(a.date) - new Date(b.date)).map(item => (
                                <div key={item.id}>
                                    {editingId === item.id ? (
                                        <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                            {fields.map(f => f.type === 'select' ? (
                                                <div key={f.key}>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">{f.label}</label>
                                                    <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 p-1 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 rounded-xl">
                                                        {f.options.map(o => (
                                                            <button key={o} type="button" onClick={() => setEditData(p => ({ ...p, [f.key]: o }))}
                                                                className={`py-1.5 text-[10px] font-bold uppercase rounded-lg transition-all ${editData[f.key] === o ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-white/50 dark:hover:bg-slate-800 border border-transparent'}`}>
                                                                {o}
                                                            </button>
                                                        ))}
                                                    </div>
                                                </div>
                                            ) : (
                                                <div key={f.key}>
                                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">{f.label}</label>
                                                    <textarea value={editData[f.key] || ''} onChange={e => setEditData(p => ({ ...p, [f.key]: e.target.value }))} rows={3}
                                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all resize-none shadow-sm px-4 py-3" />
                                                </div>
                                            ))}
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Waktu</label>
                                                <input type="datetime-local" value={editData.date} onChange={e => setEditData(p => ({ ...p, date: e.target.value }))}
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-2.5 px-4 shadow-sm" />
                                            </div>
                                            <div className="flex gap-2 justify-end pt-1">
                                                <button type="button" onClick={() => setEditingId(null)}
                                                    className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
                                                <button type="button" onClick={saveEdit}
                                                    className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20">Simpan</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm relative group hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                            <div className="flex justify-between items-center mb-2">
                                                <span className="flex items-center gap-1 text-[10px] text-slate-400">
                                                    <span className="material-symbols-outlined text-[11px]">schedule</span>
                                                    {formatDateTime(item.date)}
                                                </span>
                                                <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-all">
                                                    <button type="button" onClick={() => startEdit(item)}
                                                        className="p-1 rounded text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmingId(item.id)}
                                                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <div className="min-w-0">{renderItem(item)}</div>
                                        </div>
                                    )}
                                    {confirmingId === item.id && (
                                        <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(item.id); setConfirmingId(null); }} label="Hapus data ini?" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </Kartu>
                </div>
            </div>

            <TombolAI label="Analisis AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={items.length === 0} storageKey={storageKey} />

            {items.length > 0 && (
                <Kartu judul={`Timeline ${judul}`} headerIcon="timeline">
                    <div className="relative max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                        <div className="space-y-3">
                            {sorted.map((item, index) => (
                                <div key={item.id} className="relative flex items-start gap-4 pl-4 animate-[slideIn_0.3s_ease-out]" style={{ animationDelay: `${index * 50}ms` }}>
                                    <div className="absolute left-2.75 w-3 h-3 rounded-full bg-primary border-2 border-white dark:border-slate-900 z-10" />
                                    <div className="ml-6 flex-1 p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                        <div className="flex items-center justify-between gap-2 mb-1">
                                            <span className="text-[10px] text-slate-400">{formatDateTime(item.date)}</span>
                                        </div>
                                        {renderItem(item)}
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Kartu>
            )}
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
function TabLab({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient }) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});
    const [showRefModal, setShowRefModal] = useState(false);
    const [activeLabCat, setActiveLabCat] = useState(labCategories[0].key);

    const selectedRef = input.labKey && input.labKey !== 'custom' ? labReferences[input.labKey] : null;

    function getRefDisplay(ref, gender = patient.gender || 'male') {
        if (!ref) return null;
        if (ref.qualitative) return { text: ref.normalValue || 'Negatif', type: 'qualitative' };
        if (ref.infoRanges) return { text: ref.infoRanges.map(r => `${r.label}: ${r.value}`).join(' | '), type: 'info' };
        const range = (ref.male && ref.female) ? (ref[gender] || ref.male) : ref;
        if (!range) return null;
        if (range.low === 0 && range.high === 999) return { text: `≥ ${range.low} ${ref.unit}`, type: 'range' };
        return { text: `${range.low} – ${range.high} ${ref.unit}`, type: 'range' };
    }

    const startEdit = (e) => {
        setEditingId(e.id);
        const dt = e.date ? new Date(e.date) : new Date();
        const localDt = new Date(dt - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEditData({ testName: e.testName, value: e.value, unit: e.unit || '', date: localDt });
    };

    const saveEdit = () => {
        onUpdate(editingId, { ...editData, date: editData.date ? new Date(editData.date).toISOString() : undefined });
        setEditingId(null);
    };

    const refDisplay = selectedRef ? getRefDisplay(selectedRef) : null;
    const catItems = labCategories.find(c => c.key === activeLabCat)?.key
        ? Object.entries(labReferences).filter(([, v]) => v.category === activeLabCat)
        : [];

    const sortedLab = useMemo(() =>
        [...(patient.supportingExams || [])].sort((a, b) => new Date(a.date) - new Date(b.date)),
        [patient.supportingExams]
    );

    return (
        <div className="space-y-5 lg:space-y-6">
            {showRefModal && <LabReferenceModal onClose={() => setShowRefModal(false)} />}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                <div className="space-y-5 min-w-0">
                    <Kartu judul="Input Hasil Lab" className="border-indigo-500/20 bg-indigo-50/5" aksi={
                        <button
                            type="button"
                            onClick={() => setShowRefModal(true)}
                            className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-indigo-500/10 hover:text-indigo-600 border border-slate-200 dark:border-slate-700 hover:border-indigo-500/30 transition-all text-[11px] font-black uppercase tracking-wider shadow-xs"
                            title="Lihat tabel nilai rujukan resmi"
                        >
                            <span className="material-symbols-outlined text-[16px]">fact_check</span>
                            Nilai Rujukan
                        </button>
                    }>
                        <form onSubmit={onAdd} className="space-y-4">
                            <div className="space-y-4">
                                <div className="space-y-2.5 px-1">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">category</span> Kategori Pemeriksaan</label>
                                    <div className="flex gap-1 overflow-x-auto pb-2 custom-scrollbar no-scrollbar">
                                        {labCategories.map(cat => (
                                            <button key={cat.key} type="button" onClick={() => setActiveLabCat(cat.key)}
                                                className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap shrink-0 transition-all border ${activeLabCat === cat.key ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-100 dark:hover:bg-slate-750'}`}>
                                                <span className="material-symbols-outlined text-[14px]">{cat.icon}</span>
                                                {cat.label}
                                            </button>
                                        ))}
                                        <button type="button" onClick={() => setActiveLabCat('custom')}
                                            className={`flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-bold uppercase whitespace-nowrap shrink-0 transition-all border ${activeLabCat === 'custom' ? 'bg-indigo-500 text-white border-indigo-500 shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-100'}`}>
                                            <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                            Lainnya
                                        </button>
                                    </div>
                                </div>

                                {activeLabCat === 'custom' ? (
                                    <div className="relative group">
                                        <input type="text" value={input.testName} onChange={e => setInput(p => ({ ...p, testName: e.target.value, labKey: 'custom' }))} placeholder="Nama pemeriksaan kustom..." required className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 text-sm py-3.5 px-4 transition-all shadow-sm placeholder:text-slate-400" />
                                    </div>
                                ) : (
                                    <div className="space-y-2.5 px-1">
                                        <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">list_alt</span> Pilih Parameter</label>
                                        <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-white/40 dark:bg-slate-950/40 backdrop-blur-md rounded-2xl border border-white/50 dark:border-slate-800 max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                                            {catItems.map(([k, v]) => (
                                                <button key={k} type="button" onClick={() => setInput(p => ({ ...p, labKey: k, testName: v.name, unit: v.unit, value: v.qualitative ? '' : p.value }))}
                                                    className={`py-2 px-3 text-xs font-bold text-left rounded-xl transition-all flex justify-between items-center gap-2 ${input.labKey === k ? 'bg-white dark:bg-slate-800 border-primary/50 border text-primary shadow-sm scale-[1.02]' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:shadow-xs'}`}>
                                                    <span className="truncate text-[11px] font-black tracking-tight">{v.name}</span>
                                                    <span className={`text-[9px] font-mono shrink-0 px-1.5 py-0.5 rounded-md ${input.labKey === k ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-500'}`}>{v.unit !== '-' ? v.unit : ''}</span>
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                )}

                                {selectedRef && refDisplay && (
                                    <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-indigo-50 dark:bg-indigo-900/10 border border-indigo-200 dark:border-indigo-800/30 animate-[slideUp_0.2s_ease-out]">
                                        <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                            <span className="material-symbols-outlined text-indigo-500 text-[16px] block">info</span>
                                        </div>
                                        <div className="min-w-0">
                                            <p className="text-[9px] text-indigo-600 dark:text-indigo-400 font-black uppercase tracking-wider">Nilai Rujukan</p>
                                            <p className="text-sm text-slate-700 dark:text-slate-200 font-bold mt-0.5">{refDisplay.text}</p>
                                            {selectedRef.metode && <p className="text-[10px] text-slate-400 mt-0.5 font-medium italic">Metode: {selectedRef.metode}</p>}
                                        </div>
                                    </div>
                                )}

                                {(input.labKey || activeLabCat === 'custom') && (
                                    <div className="flex gap-3">
                                        <div className="relative group flex-1">
                                            <input
                                                type="text"
                                                value={input.value}
                                                onChange={e => setInput(p => ({ ...p, value: e.target.value }))}
                                                placeholder={selectedRef?.qualitative ? `Hasil (cth: ${selectedRef.normalValue || 'Negatif'})` : 'Hasil Pengukuran'}
                                                required
                                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 py-3.5 px-4 transition-all shadow-sm placeholder:text-slate-400"
                                            />
                                        </div>
                                        <div className="relative group w-28">
                                            <input
                                                type="text"
                                                value={input.unit}
                                                onChange={e => setInput(p => ({ ...p, unit: e.target.value }))}
                                                placeholder="Satuan"
                                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-xs font-semibold text-slate-800 dark:text-slate-200 py-3.5 px-4 transition-all shadow-sm placeholder:text-slate-400"
                                            />
                                        </div>
                                    </div>
                                )}
                            </div>

                            <div className="space-y-1.5 ml-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">calendar_month</span> Waktu Pencatatan</label>
                                <div className="relative group">
                                    <input type="datetime-local" value={input.date} onChange={e => setInput(p => ({ ...p, date: e.target.value }))}
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3.5 px-4 shadow-sm" />
                                </div>
                            </div>

                            <button type="submit" disabled={!input.value || (!input.testName && activeLabCat !== 'custom')} 
                                className="w-full bg-indigo-600 text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-indigo-600/25 hover:shadow-indigo-600/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider">
                                <span className="material-symbols-outlined font-bold">add_chart</span> Simpan Hasil Laboratorium
                            </button>
                        </form>
                    </Kartu>
                </div>
                <div className="min-w-0">
                    <Kartu judul={`Hasil Lab (${(patient.supportingExams || []).length})`} aksi={
                        <button type="button" onClick={() => setShowRefModal(true)}
                            className="flex items-center gap-1 px-2 py-1 rounded-lg text-[10px] font-bold text-slate-400 hover:text-primary hover:bg-primary/5 transition-colors">
                            <span className="material-symbols-outlined text-[14px]">open_in_new</span>
                            Rujukan
                        </button>
                    }>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-2">
                            {(patient.supportingExams || []).length === 0 ? <Kosong /> : [...(patient.supportingExams || [])].sort((a, b) => new Date(a.date) - new Date(b.date)).map(e => (
                                <div key={e.id}>
                                    {editingId === e.id ? (
                                        <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                            <input type="text" value={editData.testName} onChange={ev => setEditData(p => ({ ...p, testName: ev.target.value }))}
                                                placeholder="Nama pemeriksaan"
                                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold py-2.5 px-4 transition-all shadow-sm" />
                                            <div className="flex gap-3">
                                                <input type="text" value={editData.value} onChange={ev => setEditData(p => ({ ...p, value: ev.target.value }))}
                                                    placeholder="Nilai"
                                                    className="flex-1 rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold py-2.5 px-4 min-w-0 transition-all shadow-sm" />
                                                <input type="text" value={editData.unit} onChange={ev => setEditData(p => ({ ...p, unit: ev.target.value }))}
                                                    placeholder="Satuan"
                                                    className="w-24 rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold py-2.5 px-4 shrink-0 transition-all shadow-sm" />
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Waktu</label>
                                                <input type="datetime-local" value={editData.date} onChange={ev => setEditData(p => ({ ...p, date: ev.target.value }))}
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-2.5 px-4 shadow-sm" />
                                            </div>
                                            <div className="flex gap-2 justify-end pt-1">
                                                <button type="button" onClick={() => setEditingId(null)}
                                                    className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
                                                <button type="button" onClick={saveEdit}
                                                    className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20">Simpan</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm group hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-bold leading-snug break-words mb-1.5">{e.testName}</p>
                                                    <div className="mt-1 flex flex-wrap items-baseline gap-x-2 gap-y-1">
                                                        <span className="text-sm font-black">{e.value}</span>
                                                        {e.unit && <span className="text-[10px] font-medium text-slate-500">{e.unit}</span>}
                                                        {e.result && (
                                                            <span className={`text-[10px] font-bold px-2 py-0.5 rounded-md self-center ${
                                                                e.result.status === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                                                e.result.status === 'low' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                                                e.result.status === 'normal' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                                                'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                                                            }`}>{e.result.label}</span>
                                                        )}
                                                    </div>
                                                    <div className="mt-2.5 flex items-center gap-1.5 text-[10px] font-medium text-slate-400">
                                                        <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                        <span>{formatDateTime(e.date)}</span>
                                                    </div>
                                                </div>
                                                <div className="flex items-center self-end sm:self-start gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button type="button" onClick={() => startEdit(e)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmingId(e.id)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {confirmingId === e.id && (
                                        <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(e.id); setConfirmingId(null); }} label={`Hapus hasil ${e.testName}?`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </Kartu>
                </div>
            </div>
            <TombolAI label="Analisis Lab AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={(patient.supportingExams || []).length === 0} storageKey="labs" />

            {(patient.supportingExams || []).length > 0 && (
                <Kartu judul="Timeline Hasil Lab" headerIcon="timeline">
                    <div className="relative max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                        <div className="space-y-3">
                            {sortedLab.map((e, index) => (
                                <div key={e.id} className="relative flex items-start gap-4 pl-4 animate-[slideIn_0.3s_ease-out]" style={{ animationDelay: `${index * 50}ms` }}>
                                    <div className={`absolute left-2.75 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 z-10 ${
                                        e.result?.status === 'high' ? 'bg-red-500' : e.result?.status === 'low' ? 'bg-amber-500' : e.result?.status === 'normal' ? 'bg-green-500' : 'bg-primary'
                                    }`} />
                                    <div className="ml-6 flex-1 p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all min-w-0">
                                        <div className="flex items-start justify-between gap-2 mb-1">
                                            <span className="text-sm font-bold leading-snug break-words min-w-0 flex-1">{e.testName}</span>
                                            <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(e.date)}</span>
                                        </div>
                                        <div className="flex items-center gap-2 flex-wrap">
                                            <span className="text-sm font-black text-slate-700 dark:text-slate-200">{e.value} <span className="text-[10px] font-medium text-slate-400">{e.unit}</span></span>
                                            {e.result && <span className={`text-[10px] font-bold px-1.5 py-0.5 rounded-full ${
                                                e.result.status === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' : e.result.status === 'low' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' : e.result.status === 'normal' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' : 'bg-slate-100 text-slate-500'
                                            }`}>{e.result.label}</span>}
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Kartu>
            )}
        </div>
    );
}

/* ====== TAB OBAT ====== */
function TabObat({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient }) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});
    const [showFornasPicker, setShowFornasPicker] = useState(false);
    const [showEditFornasPicker, setShowEditFornasPicker] = useState(false);

    const routeOptions = [
        { v: 'oral', l: 'Oral', i: 'pill' },
        { v: 'iv', l: 'IV', i: 'vaccines' },
        { v: 'im', l: 'IM', i: 'syringe' },
        { v: 'sc', l: 'SC', i: 'colorize' },
        { v: 'topikal', l: 'Topikal', i: 'dermatology' },
        { v: 'inhalasi', l: 'Inhalasi', i: 'air' }
    ];

    const startEdit = (p) => {
        setEditingId(p.id);
        const dt = p.date ? new Date(p.date) : new Date();
        const localDt = new Date(dt - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEditData({ name: p.name, dosage: p.dosage || '', frequency: p.frequency || '', route: p.route || 'oral', date: localDt, fornas_source: p.fornas_source || false, fornas_form: p.fornas_form || '', fornas_category: p.fornas_category || '' });
    };

    const saveEdit = () => {
        onUpdate(editingId, { ...editData, date: editData.date ? new Date(editData.date).toISOString() : undefined });
        setEditingId(null);
    };

    const sortedPresc = useMemo(() =>
        [...(patient.prescriptions || [])].sort((a, b) => new Date(a.date) - new Date(b.date)),
        [patient.prescriptions]
    );

    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                <div className="space-y-5 min-w-0">
                    <Kartu judul="Tambah Resep Obat" className="border-primary/20 bg-primary/5">
                        <form onSubmit={onAdd} className="space-y-4">
                            <div className="space-y-4">
                                {/* Fornas shortcut row */}
                                <div className="flex items-center justify-between gap-2">
                                    <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">medication</span> Nama Obat</label>
                                    <button
                                        type="button"
                                        onClick={() => setShowFornasPicker(true)}
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl text-[10px] font-bold border border-teal-200 dark:border-teal-800/50 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition active:scale-95"
                                    >
                                        <span className="material-symbols-outlined text-[13px]">local_pharmacy</span>
                                        Pilih dari Fornas
                                    </button>
                                </div>
                                {/* Fornas selected indicator */}
                                {input.fornas_source && (
                                    <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800/20 animate-[slideUp_0.2s_ease-out]">
                                        <span className="material-symbols-outlined text-teal-500 text-[14px] shrink-0">verified</span>
                                        <div className="flex-1 min-w-0">
                                            <p className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">Dari Fornas</p>
                                            {input.fornas_category && <p className="text-[11px] text-teal-600 dark:text-teal-400 truncate font-semibold">{input.fornas_category}</p>}
                                        </div>
                                        <button
                                            type="button"
                                            onClick={() => setInput(p => ({ ...p, fornas_source: false, fornas_form: '', fornas_category: '' }))}
                                            className="shrink-0 p-1 rounded-lg text-teal-400 hover:text-teal-700 dark:hover:text-teal-200 hover:bg-teal-100/50 transition"
                                        >
                                            <span className="material-symbols-outlined text-sm">close</span>
                                        </button>
                                    </div>
                                )}
                                <div className="relative group">
                                    <input
                                        type="text"
                                        value={input.name}
                                        onChange={e => setInput(p => ({ ...p, name: e.target.value, fornas_source: false, fornas_form: '' }))}
                                        placeholder="Nama obat (cth. Amoxicillin)"
                                        required
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-sm placeholder:text-slate-400"
                                    />
                                </div>
                                <div className="flex flex-col sm:flex-row gap-3">
                                    <div className="relative group flex-1">
                                        <input type="text" value={input.dosage} onChange={e => setInput(p => ({ ...p, dosage: e.target.value }))} placeholder="Dosis (cth. 500mg)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-sm placeholder:text-slate-400" />
                                    </div>
                                    <div className="relative group flex-1">
                                        <input type="text" value={input.frequency} onChange={e => setInput(p => ({ ...p, frequency: e.target.value }))} placeholder="Frek (3x/hari)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-sm placeholder:text-slate-400" />
                                    </div>
                                </div>
                            </div>

                            <div className="space-y-3">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">route</span> Rute Pemberian</label>
                                <div className="grid grid-cols-3 gap-2">
                                    {routeOptions.map(opt => (
                                        <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, route: opt.v }))}
                                            className={`flex flex-col items-center py-2.5 px-1 rounded-xl border transition-all ${input.route === opt.v ? 'bg-primary/10 border-primary text-primary shadow-sm scale-[1.02]' : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-800 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800/60'}`}>
                                            <span className="material-symbols-outlined text-xl mb-1">{opt.i}</span>
                                            <span className="text-[9px] font-bold uppercase tracking-tighter">{opt.l}</span>
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1.5 ml-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">calendar_month</span> Waktu Pencatatan</label>
                                <input type="datetime-local" value={input.date} onChange={e => setInput(p => ({ ...p, date: e.target.value }))}
                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3.5 px-4 shadow-sm" />
                            </div>

                            <button type="submit" 
                                className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined font-bold">add_circle</span>
                                Simpan Resep Obat
                            </button>
                        </form>
                    </Kartu>
                </div>
                <div className="min-w-0">
                    <Kartu judul={`Daftar Obat (${(patient.prescriptions || []).length})`}>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-3">
                            {(patient.prescriptions || []).length === 0 ? <Kosong /> : [...(patient.prescriptions || [])].sort((a, b) => new Date(a.date) - new Date(b.date)).map(p => (
                                <div key={p.id}>
                                    {editingId === p.id ? (
                                        <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                            {/* Edit — Fornas shortcut */}
                                            <div className="flex items-center justify-between gap-2">
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest">Nama Obat</label>
                                                <button
                                                    type="button"
                                                    onClick={() => setShowEditFornasPicker(true)}
                                                    className="flex items-center gap-1.5 px-2 py-1 rounded-lg text-[10px] font-bold border border-teal-200 dark:border-teal-800/50 bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-400 hover:bg-teal-100 dark:hover:bg-teal-900/40 transition"
                                                >
                                                    <span className="material-symbols-outlined text-[12px]">local_pharmacy</span>
                                                    Pilih dari Fornas
                                                </button>
                                            </div>
                                            {/* Edit — Fornas indicator */}
                                            {editData.fornas_source && (
                                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/20 border border-teal-200 dark:border-teal-800/40">
                                                    <span className="material-symbols-outlined text-teal-500 text-[13px] shrink-0">verified</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase">Dari Fornas</p>
                                                        {editData.fornas_category && <p className="text-[11px] text-teal-600 dark:text-teal-400 truncate">{editData.fornas_category}</p>}
                                                    </div>
                                                    <button type="button" onClick={() => setEditData(d => ({ ...d, fornas_source: false, fornas_form: '', fornas_category: '' }))} className="shrink-0 p-0.5 rounded text-teal-400 hover:text-teal-700 transition">
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                            )}
                                            <input type="text" value={editData.name} onChange={e => setEditData(d => ({ ...d, name: e.target.value, fornas_source: false, fornas_form: '' }))}
                                                placeholder="Nama obat" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold py-2.5 px-4 transition-all shadow-sm" />
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <input type="text" value={editData.dosage} onChange={e => setEditData(d => ({ ...d, dosage: e.target.value }))}
                                                    placeholder="Dosis" className="flex-1 rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold py-3 px-4 min-w-0 transition-all shadow-sm" />
                                                <input type="text" value={editData.frequency} onChange={e => setEditData(d => ({ ...d, frequency: e.target.value }))}
                                                    placeholder="Frekuensi" className="flex-1 rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold py-3 px-4 min-w-0 transition-all shadow-sm" />
                                            </div>
                                            <div className="grid grid-cols-3 gap-2">
                                                {routeOptions.map(opt => (
                                                    <button key={opt.v} type="button" onClick={() => setEditData(d => ({ ...d, route: opt.v }))}
                                                        className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all text-[10px] font-bold uppercase ${editData.route === opt.v ? 'bg-primary/10 border-primary text-primary shadow-sm' : 'bg-white/40 dark:bg-slate-800/40 border border-white/50 dark:border-slate-800 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800/60'}`}>
                                                        <span className="material-symbols-outlined text-base mb-0.5">{opt.i}</span>{opt.l}
                                                    </button>
                                                ))}
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Waktu</label>
                                                <input type="datetime-local" value={editData.date} onChange={e => setEditData(d => ({ ...d, date: e.target.value }))}
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-2.5 px-4 shadow-sm" />
                                            </div>
                                            <div className="flex gap-2 justify-end pt-1">
                                                <button type="button" onClick={() => setEditingId(null)}
                                                    className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
                                                <button type="button" onClick={saveEdit}
                                                    className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20">Simpan</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md rounded-xl border border-white/50 dark:border-slate-700/50 shadow-sm group hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                            <div className="flex items-start justify-between gap-2 mb-1">
                                                <div className="min-w-0 flex-1">
                                                    <div className="flex items-center gap-1.5 flex-wrap">
                                                        <p className="font-semibold text-sm break-words leading-snug">{p.name}{p.dosage ? ` ${p.dosage}` : ''}</p>
                                                        {p.fornas_source && (
                                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800/40 rounded-full px-1.5 py-0.5 uppercase shrink-0">
                                                                <span className="material-symbols-outlined text-[10px]">verified</span>
                                                                Fornas
                                                            </span>
                                                        )}
                                                    </div>
                                                </div>
                                                <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-all shrink-0">
                                                    <button type="button" onClick={() => startEdit(p)}
                                                        className="p-1 rounded text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                                                        <span className="material-symbols-outlined text-sm">edit</span>
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmingId(p.id)}
                                                        className="p-1 rounded text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                            </div>
                                            <p className="text-xs text-slate-500">{p.frequency} • {p.route}{p.fornas_form ? ` • ${p.fornas_form}` : ''}</p>
                                            <p className="text-[10px] text-slate-400 flex items-center gap-1 mt-0.5"><span className="material-symbols-outlined text-[11px]">schedule</span>{formatDateTime(p.date)}</p>
                                        </div>
                                    )}
                                    {confirmingId === p.id && (
                                        <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(p.id); setConfirmingId(null); }} label={`Hapus resep ${p.name}?`} />
                                    )}
                                </div>
                            ))}
                        </div>
                    </Kartu>
                </div>
            </div>
            <TombolAI label="Rekomendasi Obat AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={!(patient.symptoms || []).length && !patient.diagnosis} storageKey="drugs" />

            {(patient.prescriptions || []).length > 0 && (
                <Kartu judul="Timeline Pemberian Obat" headerIcon="timeline">
                    <div className="relative max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                        <div className="space-y-3">
                            {sortedPresc.map((p, index) => (
                                <div key={p.id} className="relative flex items-start gap-4 pl-4 animate-[slideIn_0.3s_ease-out]" style={{ animationDelay: `${index * 50}ms` }}>
                                    <div className="absolute left-2.75 w-3 h-3 rounded-full bg-primary border-2 border-white dark:border-slate-900 z-10" />
                                    <div className="ml-6 flex-1 p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                        <div className="flex items-center justify-between gap-2">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-bold">{p.name}</span>
                                                {p.fornas_source && (
                                                    <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800/40 rounded-full px-1.5 py-0.5 uppercase">
                                                        <span className="material-symbols-outlined text-[10px]">verified</span>Fornas
                                                    </span>
                                                )}
                                                {p.dosage && <span className="text-xs text-slate-500">{p.dosage}</span>}
                                                {p.frequency && <span className="text-xs bg-primary/10 text-primary px-1.5 py-0.5 rounded-full font-semibold">{p.frequency}</span>}
                                                {p.route && <span className="text-[10px] font-bold uppercase text-slate-400 bg-slate-100 dark:bg-slate-700 px-1.5 py-0.5 rounded-full">{p.route}</span>}
                                                {p.fornas_form && <span className="text-[10px] font-bold uppercase text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/20 px-1.5 py-0.5 rounded-full">{p.fornas_form}</span>}
                                            </div>
                                            <span className="text-[10px] text-slate-400 shrink-0">{formatDateTime(p.date)}</span>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                </Kartu>
            )}

            {/* Fornas picker — add mode */}
            {showFornasPicker && (
                <FornasDrugPicker
                    onSelect={fields => setInput(p => ({ ...p, ...fields }))}
                    onClose={() => setShowFornasPicker(false)}
                />
            )}
            {/* Fornas picker — edit mode */}
            {showEditFornasPicker && (
                <FornasDrugPicker
                    onSelect={fields => setEditData(d => ({ ...d, ...fields }))}
                    onClose={() => setShowEditFornasPicker(false)}
                />
            )}
        </div>
    );
}

/* ====== TAB LAPORAN ====== */
function TabLaporan({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient }) {
    const [confirmingId, setConfirmingId] = useState(null);
    const [editingId, setEditingId] = useState(null);
    const [editData, setEditData] = useState({});

    const conditionOptions = [
        { v: 'critical', l: 'Kritis', c: 'border-red-500 text-red-500 bg-red-50 dark:bg-red-900/20' },
        { v: 'urgent', l: 'Mendesak', c: 'border-amber-500 text-amber-500 bg-amber-50 dark:bg-amber-900/20' },
        { v: 'stable', l: 'Stabil', c: 'border-blue-500 text-blue-500 bg-blue-50 dark:bg-blue-900/20' },
        { v: 'improving', l: 'Membaik', c: 'border-green-500 text-green-500 bg-green-50 dark:bg-green-900/20' }
    ];

    const startEdit = (r) => {
        setEditingId(r.id);
        const dt = r.date ? new Date(r.date) : new Date();
        const localDt = new Date(dt - dt.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
        setEditData({ notes: r.notes, condition: r.condition || '', date: localDt });
    };

    const saveEdit = () => {
        onUpdate(editingId, { ...editData, date: editData.date ? new Date(editData.date).toISOString() : undefined });
        setEditingId(null);
    };

    const sortedReports = useMemo(() =>
        [...(patient.dailyReports || [])].sort((a, b) => new Date(a.date) - new Date(b.date)),
        [patient.dailyReports]
    );

    return (
        <div className="space-y-5 lg:space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-5 lg:gap-6">
                <div className="space-y-5 min-w-0">
                    <Kartu judul="Laporan Harian Baru">
                        <form onSubmit={onAdd} className="space-y-4">
                            <textarea value={input.notes} onChange={e => setInput(p => ({ ...p, notes: e.target.value }))} rows={5} required placeholder="Catatan perkembangan pasien hari ini..."
                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-sm transition-all px-4 py-4 placeholder:text-slate-400 shadow-sm leading-relaxed" />

                            <div className="space-y-2">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Perbarui Kondisi Pasien</label>
                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                    {conditionOptions.map(opt => (
                                        <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, condition: opt.v }))}
                                            className={`py-2 px-1 text-[10px] font-bold uppercase rounded-xl border transition-all ${input.condition === opt.v ? opt.c : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-800 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800/60'}`}>
                                            {opt.l}
                                        </button>
                                    ))}
                                </div>
                            </div>

                            <div className="space-y-1">
                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1">Waktu Pencatatan</label>
                                <input type="datetime-local" value={input.date} onChange={e => setInput(p => ({ ...p, date: e.target.value }))}
                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-3.5 px-4 shadow-sm" />
                            </div>

                            <button type="submit" 
                                className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                <span className="material-symbols-outlined font-bold">add_circle</span> Simpan Laporan
                            </button>
                        </form>
                    </Kartu>
                </div>
                <div className="min-w-0">
                    <Kartu judul={`Riwayat Laporan (${(patient.dailyReports || []).length})`}>
                        <div className="max-h-[400px] overflow-y-auto custom-scrollbar pr-2 space-y-3">
                            {(patient.dailyReports || []).length === 0 ? <Kosong /> : [...(patient.dailyReports || [])].sort((a, b) => new Date(a.date) - new Date(b.date)).map(r => (
                                <div key={r.id}>
                                    {editingId === r.id ? (
                                        <div className="space-y-4 animate-[fadeIn_0.2s_ease-out]">
                                            <textarea value={editData.notes} onChange={e => setEditData(d => ({ ...d, notes: e.target.value }))} rows={4}
                                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold resize-none px-4 py-3 shadow-sm leading-relaxed" />
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Kondisi</label>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    {conditionOptions.map(opt => (
                                                        <button key={opt.v} type="button" onClick={() => setEditData(d => ({ ...d, condition: opt.v }))}
                                                            className={`py-2 px-1 text-[10px] font-bold uppercase rounded-xl border transition-all ${editData.condition === opt.v ? opt.c : 'bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-800 text-slate-500 hover:bg-white/60 dark:hover:bg-slate-800/60'}`}>
                                                            {opt.l}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                            <div>
                                                <label className="text-[10px] font-bold text-slate-400 uppercase tracking-widest ml-1 mb-1 block">Waktu</label>
                                                <input type="datetime-local" value={editData.date} onChange={e => setEditData(d => ({ ...d, date: e.target.value }))}
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold transition-all py-2.5 px-4 shadow-sm" />
                                            </div>
                                            <div className="flex gap-2 justify-end pt-1">
                                                <button type="button" onClick={() => setEditingId(null)}
                                                    className="px-4 py-2 text-sm font-semibold rounded-xl border border-slate-200 dark:border-slate-700 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors">Batal</button>
                                                <button type="button" onClick={saveEdit}
                                                    className="px-4 py-2 text-sm font-bold rounded-xl bg-primary text-white hover:brightness-110 transition-all shadow-lg shadow-primary/20">Simpan</button>
                                            </div>
                                        </div>
                                    ) : (
                                        <div className="p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm group hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                            <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-start gap-2.5 mb-2">
                                                        <div className={`w-2 h-2 rounded-full shrink-0 mt-1.5 ${
                                                            r.condition === 'critical' ? 'bg-red-500' : 
                                                            r.condition === 'urgent' ? 'bg-amber-500' : 
                                                            r.condition === 'improving' ? 'bg-green-500' : 'bg-primary'
                                                        }`} />
                                                        <p className="text-sm font-bold leading-relaxed break-words flex-1 text-slate-700 dark:text-slate-200">{r.notes}</p>
                                                    </div>
                                                    <div className="flex items-center gap-2.5 ml-4.5 mt-2">
                                                        {r.condition && <KondisiBadge kondisi={r.condition} />}
                                                        <span className="text-[10px] font-medium text-slate-400 flex items-center gap-1">
                                                            <span className="material-symbols-outlined text-[12px]">schedule</span>
                                                            {formatDateTime(r.date)}
                                                        </span>
                                                    </div>
                                                </div>
                                                
                                                <div className="flex items-center self-end sm:self-start gap-1 shrink-0 opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                                    <button type="button" onClick={() => startEdit(r)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary/10 transition-colors">
                                                        <span className="material-symbols-outlined text-[16px]">edit</span>
                                                    </button>
                                                    <button type="button" onClick={() => setConfirmingId(r.id)}
                                                        className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors">
                                                        <span className="material-symbols-outlined text-[16px]">close</span>
                                                    </button>
                                                </div>
                                            </div>
                                        </div>
                                    )}
                                    {confirmingId === r.id && (
                                        <ConfirmPanel onCancel={() => setConfirmingId(null)} onConfirm={() => { onRemove(r.id); setConfirmingId(null); }} label="Hapus laporan ini?" />
                                    )}
                                </div>
                            ))}
                        </div>
                    </Kartu>
                </div>
            </div>
            <TombolAI label="Evaluasi Harian AI" onGenerate={onAI} loading={aiLoading} result={aiResult} disabled={(patient.dailyReports || []).length < 1} storageKey="daily" />

            {(patient.dailyReports || []).length > 0 && (
                <Kartu judul="Timeline Laporan Harian" headerIcon="timeline">
                    <div className="relative max-h-[400px] overflow-y-auto custom-scrollbar pr-2">
                        <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-slate-200 dark:bg-slate-700" />
                        <div className="space-y-3">
                            {sortedReports.map((r, index) => {
                                const condOpt = conditionOptions.find(o => o.v === r.condition);
                                return (
                                    <div key={r.id} className="relative flex items-start gap-4 pl-4 animate-[slideIn_0.3s_ease-out]" style={{ animationDelay: `${index * 50}ms` }}>
                                        <div className={`absolute left-2.75 w-3 h-3 rounded-full border-2 border-white dark:border-slate-900 z-10 ${
                                            r.condition === 'critical' ? 'bg-red-500' : r.condition === 'urgent' ? 'bg-amber-500' : r.condition === 'improving' ? 'bg-green-500' : 'bg-primary'
                                        }`} />
                                        <div className="ml-6 flex-1 p-4 rounded-xl bg-white/40 dark:bg-slate-800/40 backdrop-blur-md border border-white/50 dark:border-slate-700/50 shadow-sm hover:border-primary/30 hover:bg-white/60 dark:hover:bg-slate-800/60 transition-all">
                                            <div className="flex items-center justify-between gap-2 mb-1">
                                                <div className="flex items-center gap-2">
                                                    <span className="text-[10px] text-slate-400">{formatDateTime(r.date)}</span>
                                                    {condOpt && <KondisiBadge kondisi={r.condition} />}
                                                </div>
                                            </div>
                                            <p className="text-sm text-slate-600 dark:text-slate-400">{r.notes}</p>
                                        </div>
                                    </div>
                                );
                            })}
                        </div>
                    </div>
                </Kartu>
            )}
        </div>
    );
}

/* ====== TAB AI ====== */
function TabAI({ patient, callAI, aiResults, aiLoading, onSaveAI, canEditPatient }) {
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
                        className="flex flex-row sm:flex-col items-center sm:items-start gap-3 sm:gap-0 p-4 lg:p-5 bg-white/50 dark:bg-slate-900/50 backdrop-blur-md border border-white/60 dark:border-slate-700/50 rounded-2xl hover:bg-white/80 dark:hover:bg-slate-800/80 hover:border-primary/30 hover:shadow-lg transition-all text-left group disabled:opacity-50 shadow-sm">
                        <div className={`size-10 rounded-xl bg-linear-to-br ${item.color} text-white flex items-center justify-center sm:mb-3 group-hover:scale-110 transition-transform shadow-md shrink-0`}>
                            <span className="material-symbols-outlined">{item.icon}</span>
                        </div>
                        <div className="flex flex-col min-w-0">
                            <span className="font-bold text-sm leading-snug">{item.title}</span>
                            <span className="text-xs text-slate-500 mt-0.5 sm:mt-1 leading-snug">{item.desc}</span>
                        </div>
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
                        storageKey={key}
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
function Kartu({ judul, headerIcon, aksi, children, id, className = "" }) {
    return (
        <div id={id} className={`bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/50 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden flex flex-col items-stretch transition-all ${className}`}>
            <div className="px-5 py-4 lg:px-6 lg:py-5 border-b border-white/30 dark:border-slate-700/30 bg-white/40 dark:bg-slate-800/40 backdrop-blur-md flex justify-between items-center gap-3">
                <h3 className="font-bold text-slate-800 dark:text-slate-100 text-[13px] uppercase tracking-wide truncate">{judul}</h3>
                {aksi || (headerIcon && <span className="material-symbols-outlined text-slate-400 shrink-0">{headerIcon}</span>)}
            </div>
            <div className="p-5 lg:p-7">{children}</div>
        </div>
    );
}

function TombolAI({ label, onGenerate, loading, result, disabled, storageKey }) {
    const [isMinimized, setIsMinimized] = useState(() =>
        storageKey ? localStorage.getItem(`ai-section-${storageKey}`) === 'true' : false
    );

    const handleToggle = () => {
        const next = !isMinimized;
        setIsMinimized(next);
        if (storageKey) localStorage.setItem(`ai-section-${storageKey}`, String(next));
    };

    return (
        <div className="bg-primary/5 dark:bg-primary/10 backdrop-blur-md rounded-2xl border border-primary/20 p-5 lg:p-6 shadow-sm transition-all">
            <div className="flex justify-between items-center mb-3">
                <h4 className="font-bold text-primary flex items-center gap-2 text-sm">
                    <span className="material-symbols-outlined text-lg">auto_awesome</span>Analisis AI
                </h4>
                <button onClick={handleToggle} title={isMinimized ? "Perbesar" : "Perkecil"} className="p-1 rounded-lg text-primary/60 hover:text-primary hover:bg-primary/10 transition-colors">
                    <span className="material-symbols-outlined text-sm">{isMinimized ? 'expand_more' : 'expand_less'}</span>
                </button>
            </div>

            {!isMinimized && (
                <div className="animate-[fadeIn_0.2s_ease-out]">
                    <button onClick={onGenerate} disabled={disabled || loading}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-bold text-sm shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2 mb-3 disabled:opacity-50 disabled:cursor-not-allowed">
                        {loading ? <><span className="material-symbols-outlined animate-spin text-lg">progress_activity</span>Menganalisis...</> :
                            <><span className="material-symbols-outlined text-lg">auto_awesome</span>{label}</>}
                    </button>
                    {result && (
                        <div className="mt-3 p-3 lg:p-4 bg-white dark:bg-slate-900 rounded-lg border border-slate-200 dark:border-slate-800 prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-0.5 text-justify">
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    table: ({node, ...props}) => (
                                        <div className="overflow-x-auto my-4 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <table {...props} className="min-w-full divide-y divide-slate-200 dark:divide-slate-800" />
                                        </div>
                                    )
                                }}
                            >
                                {result}
                            </ReactMarkdown>
                        </div>
                    )}
                </div>
            )}
        </div>
    );
}

function KartuAIDetail({ judul, result, loading, onUpdate, onSave, storageKey }) {
    const [isMinimized, setIsMinimized] = useState(() =>
        storageKey ? localStorage.getItem(`ai-kartu-${storageKey}`) === 'true' : false
    );
    const [isEditing, setIsEditing] = useState(false);
    const [editText, setEditText] = useState(result || '');

    useEffect(() => {
        setEditText(result || '');
    }, [result]);

    const handleToggle = () => {
        const next = !isMinimized;
        setIsMinimized(next);
        if (storageKey) localStorage.setItem(`ai-kartu-${storageKey}`, String(next));
    };

    return (
        <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/50 dark:border-slate-700/50 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none overflow-hidden transition-all">
            <div className="px-5 py-4 lg:px-6 lg:py-5 border-b border-white/30 dark:border-slate-700/30 flex flex-col sm:flex-row sm:items-center bg-white/40 dark:bg-slate-800/40 backdrop-blur-md gap-3">
                <div className="flex items-center gap-2 flex-1 min-w-0 pr-10 sm:pr-0 relative">
                    <span className="material-symbols-outlined text-primary text-lg shrink-0">auto_awesome</span>
                    <h3 className="font-bold text-slate-800 dark:text-slate-100 text-sm truncate">{judul}</h3>
                    
                    {/* Toggle button moved to absolute on mobile to save space if needed, or just let it flow */}
                    <button onClick={handleToggle} title={isMinimized ? "Perbesar" : "Perkecil"} className="sm:hidden absolute right-0 top-1/2 -translate-y-1/2 p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 transition-colors border border-slate-200 dark:border-slate-700">
                        <span className="material-symbols-outlined text-sm">{isMinimized ? 'expand_more' : 'expand_less'}</span>
                    </button>
                </div>

                <div className="flex gap-1.5 justify-start sm:justify-end items-center shrink-0">
                    {!isEditing && !loading && result && (
                        <>
                            <button onClick={onUpdate} title="Update AI" className="flex items-center gap-1.5 p-1.5 px-2.5 sm:px-3 rounded-lg text-slate-500 border border-slate-200 dark:border-slate-700 hover:text-primary hover:bg-primary/5 transition-all font-bold text-[10px] sm:text-[11px] bg-white dark:bg-slate-800 shadow-sm">
                                <span className="material-symbols-outlined text-[14px] sm:text-[16px]">refresh</span>
                                <span className="hidden xs:inline">Update</span>
                            </button>
                            <button onClick={() => setIsEditing(true)} title="Edit Manual" className="flex items-center gap-1.5 p-1.5 px-2.5 sm:px-3 rounded-lg text-slate-500 border border-slate-200 dark:border-slate-700 hover:text-amber-600 hover:bg-amber-50 dark:hover:bg-amber-900/10 transition-all font-bold text-[10px] sm:text-[11px] bg-white dark:bg-slate-800 shadow-sm">
                                <span className="material-symbols-outlined text-[14px] sm:text-[16px]">edit</span>
                                <span className="hidden xs:inline">Edit</span>
                            </button>
                        </>
                    )}
                    {isEditing && (
                        <>
                            <button onClick={() => { setIsEditing(false); setEditText(result); }} title="Batal" className="p-1.5 rounded-lg text-slate-400 hover:text-red-500 hover:bg-red-50 transition-colors">
                                <span className="material-symbols-outlined text-[16px]">close</span>
                            </button>
                            <button onClick={() => { onSave(editText); setIsEditing(false); }} title="Simpan" className="flex items-center gap-1.5 p-1.5 px-4 rounded-lg text-white bg-green-500 hover:bg-green-600 transition-all font-bold text-[10px] sm:text-[11px] shadow-sm">
                                <span className="material-symbols-outlined text-[14px] sm:text-[16px]">save</span> Simpan
                            </button>
                        </>
                    )}
                    <button onClick={handleToggle} title={isMinimized ? "Perbesar" : "Perkecil"} className="hidden sm:flex p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-200 dark:hover:text-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 transition-colors border border-slate-200 dark:border-slate-700">
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
                            className="w-full min-h-[350px] p-5 text-sm rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 leading-relaxed shadow-sm transition-all resize-y"
                        />
                    ) : (
                        <div className="prose prose-sm dark:prose-invert max-w-none prose-p:leading-relaxed prose-li:my-0.5 text-justify">
                            <ReactMarkdown 
                                remarkPlugins={[remarkGfm]}
                                components={{
                                    table: ({node, ...props}) => (
                                        <div className="overflow-x-auto my-4 rounded-lg border border-slate-100 dark:border-slate-800 shadow-sm">
                                            <table {...props} className="min-w-full divide-y divide-slate-200 dark:divide-slate-800" />
                                        </div>
                                    )
                                }}
                            >
                                {result}
                            </ReactMarkdown>
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
    return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-bold uppercase shrink-0 ${styles[kondisi] || styles.stable}`}>{labels[kondisi] || 'Stabil'}</span>;
}

function BadgeKeparahan({ keparahan }) {
    const styles = { berat: 'bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400', sedang: 'bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400', ringan: 'bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400' };
    const labels = { berat: 'Berat', sedang: 'Sedang', ringan: 'Ringan' };
    return <span className={`text-[10px] font-bold uppercase px-2 py-0.5 rounded-full shrink-0 ${styles[keparahan] || styles.sedang}`}>{labels[keparahan] || keparahan}</span>;
}

function Kosong() {
    return <p className="text-sm text-slate-400 text-center py-6">Belum ada data yang tercatat</p>;
}
