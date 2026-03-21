import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { useStase } from '../context/StaseContext';
import { checkLabValue, labReferences, labCategories, getComprehensiveTemplate } from '../services/dataService';
import { useToast } from '../context/ToastContext';
import LabReferenceModal from '../components/LabReferenceModal';
import ICD10Picker from '../components/ICD10Picker';
import BloodGroupPicker from '../components/BloodGroupPicker';
import FornasDrugPicker from '../components/FornasDrugPicker';
import CustomSelect from '../components/common/CustomSelect';

export default function AddPatient() {
    const navigate = useNavigate();
    const { addPatient, patients, canAddPatient } = usePatients();
    const { addToast } = useToast();
    const { stases, pinnedStaseId } = useStase();

    const [activeTab, setActiveTab] = useState(() => {
        return localStorage.getItem('addPatientActiveTab') || 'ringkasan';
    });

    useEffect(() => {
        localStorage.setItem('addPatientActiveTab', activeTab);
    }, [activeTab]);
    const [form, setForm] = useState({
        name: '', age: '', gender: 'male', room: '', bloodType: '', admissionDate: new Date().toISOString().split('T')[0],
        rhesus: '',
        targetDays: '', chiefComplaint: '', diagnosis: '', condition: 'stable', status: 'active',
        heartRate: '', bloodPressure: '', temperature: '', respRate: '', spO2: '',
        weight: '', height: '', allergies: '', medicalHistory: '',
        stase_id: pinnedStaseId || '',
        symptoms: [], dailyReports: [], physicalExams: [], supportingExams: [], prescriptions: [],
    });

    // Sub-states for adding multiple items during registration
    const [symptomInput, setSymptomInput] = useState({ name: '', severity: 'sedang', notes: '' });
    const [examInput, setExamInput] = useState({ findings: '', system: 'umum' });
    const [labInput, setLabInput] = useState({ testName: '', value: '', unit: '', labKey: '' });
    const [prescInput, setPrescInput] = useState({ name: '', dosage: '', frequency: '', route: 'oral', fornas_source: false, fornas_form: '', fornas_category: '' });
    const [reportInput, setReportInput] = useState({ notes: '', condition: '' });
    const [showDiagnosisPicker, setShowDiagnosisPicker] = useState(false);
    const [showFornasPicker, setShowFornasPicker] = useState(false);

    const handleFornasPrescSelect = (fields) => {
        setPrescInput(p => ({ ...p, ...fields }));
    };

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const downloadTemplate = (templateData) => {
        const blob = new Blob([JSON.stringify(templateData, null, 2)], { type: 'application/json' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `patient_template_${new Date().toISOString().split('T')[0]}.json`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    };

    const handleImportJSON = (e) => {
        const file = e.target.files[0];
        if (!file) return;

        const reader = new FileReader();
        reader.onload = (event) => {
            try {
                const data = JSON.parse(event.target.result);
                const patients = Array.isArray(data) ? data : [data];
                
                if (patients.length > 0) {
                    const p = patients[0]; // Take first patient as template for current form
                    
                    // Map patient data to form state
                    setForm(prev => ({
                        ...prev,
                        name: p.name || prev.name,
                        age: p.age?.toString() || prev.age,
                        gender: p.gender || prev.gender,
                        room: p.room || prev.room,
                        bloodType: p.bloodType || prev.bloodType,
                        rhesus: p.rhesus || prev.rhesus,
                        admissionDate: p.admissionDate || prev.admissionDate,
                        targetDays: p.targetDays?.toString() || prev.targetDays,
                        status: p.status || prev.status,
                        condition: p.condition || prev.condition,
                        chiefComplaint: p.chiefComplaint || prev.chiefComplaint,
                        diagnosis: p.diagnosis || prev.diagnosis,
                        heartRate: p.heartRate || prev.heartRate,
                        bloodPressure: p.bloodPressure || prev.bloodPressure,
                        temperature: p.temperature || prev.temperature,
                        respRate: p.respRate || prev.respRate,
                        spO2: p.spO2 || prev.spO2,
                        weight: p.weight || prev.weight,
                        height: p.height || prev.height,
                        allergies: p.allergies || prev.allergies,
                        medicalHistory: p.medicalHistory || prev.medicalHistory,
                        
                        // Arrays: normalize with new IDs to avoid conflicts
                        symptoms: (p.symptoms || []).map(s => ({ ...s, id: crypto.randomUUID() })),
                        physicalExams: (p.physicalExams || []).map(e => ({ ...e, id: crypto.randomUUID() })),
                        supportingExams: (p.supportingExams || []).map(l => ({ ...l, id: crypto.randomUUID() })),
                        prescriptions: (p.prescriptions || []).map(pr => ({ ...pr, id: crypto.randomUUID() })),
                        dailyReports: (p.dailyReports || []).map(r => ({ ...r, id: crypto.randomUUID() })),
                    }));

                    addToast('Data berhasil dimuat dari JSON', 'success');
                }
            } catch (err) {
                console.error('Import error:', err);
                addToast('Gagal membaca file JSON', 'error');
            }
        };
        reader.readAsText(file);
        e.target.value = ''; // Reset input
    };

    const addItem = (key, data, setInputFn, initialInput) => {
        const id = crypto.randomUUID();
        const recordedAt = new Date().toISOString();
        const date = recordedAt;
        setForm(prev => ({ ...prev, [key]: [...(prev[key] || []), { ...data, id, recordedAt, date }] }));
        setInputFn(initialInput);
    };

    const removeItem = (key, id) => {
        setForm(prev => ({ ...prev, [key]: prev[key].filter(item => item.id !== id) }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        const newPatient = addPatient({
            ...form,
            age: parseInt(form.age) || null,
            targetDays: parseInt(form.targetDays) || null,
            updatedAt: new Date().toISOString()
        });
        localStorage.setItem('patientDetailActiveTab', 'overview');
        navigate(`/patient/${newPatient.id}`);
    };

    const tabs = [
        { key: 'ringkasan', label: 'Ringkasan', icon: 'person_outline' },
        { key: 'gejala', label: 'Gejala', icon: 'symptoms' },
        { key: 'fisik', label: 'Fisik', icon: 'stethoscope' },
        { key: 'lab', label: 'Lab', icon: 'biotech' },
        { key: 'obat', label: 'Obat', icon: 'medication' },
        { key: 'harian', label: 'Harian', icon: 'description' },
    ];

    if (!canAddPatient) {
        return (
            <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 flex items-center justify-center animate-[fadeIn_0.3s_ease-out]">
                <div className="max-w-md w-full bg-white dark:bg-slate-900 rounded-3xl p-8 border border-slate-200 dark:border-slate-800 shadow-xl text-center space-y-6">
                    <div className="w-20 h-20 bg-amber-50 dark:bg-amber-900/30 text-amber-500 rounded-full flex items-center justify-center mx-auto mb-4 border border-amber-100 dark:border-amber-800/50">
                        <span className="material-symbols-outlined text-4xl">lock</span>
                    </div>
                    <div>
                        <h2 className="text-2xl font-black text-slate-900 dark:text-white mb-2">Batas Pasien Tercapai</h2>
                        <p className="text-slate-500 text-sm leading-relaxed">Anda saat ini menggunakan paket <b className="text-slate-700 dark:text-slate-300">Intern</b> dengan batas maksimal 2 pasien. Tingkatkan ke paket <b className="text-primary">Specialist</b> untuk menambahkan tanpa batas.</p>
                    </div>
                    <div className="pt-4 flex gap-3">
                        <button onClick={() => navigate(-1)} className="flex-1 py-3 px-4 rounded-xl border border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300 font-bold hover:bg-slate-50 dark:hover:bg-slate-800 transition active:scale-95">Kembali</button>
                        <button onClick={() => navigate('/subscription')} className="flex-1 py-3 px-4 rounded-xl bg-primary text-white font-bold hover:bg-primary/90 transition shadow-lg shadow-primary/30 flex items-center justify-center gap-2 active:scale-95">
                            <span className="material-symbols-outlined text-[18px]">workspace_premium</span>
                            Upgrade
                        </button>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-32 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors shrink-0">
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                            <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Registrasi Pasien</h1>
                        </div>
                        <nav className="flex text-sm text-slate-500 gap-2 ml-12">
                            <span>Pasien</span><span>/</span><span className="text-primary font-medium">Tambah Baru</span>
                        </nav>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="hidden sm:flex items-center gap-2 mr-2">
                            <button 
                                onClick={() => downloadTemplate(getComprehensiveTemplate())}
                                className="px-4 py-2.5 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 hover:bg-slate-50 dark:hover:bg-slate-800 transition-all flex items-center gap-2"
                            >
                                <span className="material-symbols-outlined text-[18px]">description</span>
                                Template
                            </button>
                            <label className="cursor-pointer px-4 py-2.5 rounded-xl text-xs font-bold text-primary border border-primary/20 bg-primary/5 hover:bg-primary/10 transition-all flex items-center gap-2">
                                <span className="material-symbols-outlined text-[18px]">upload_file</span>
                                Impor JSON
                                <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                            </label>
                        </div>
                        <button onClick={handleSubmit}
                            className="bg-slate-950 dark:bg-slate-50 text-white dark:text-slate-950 px-6 py-3.5 rounded-xl font-black text-sm flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-xl shadow-slate-900/20 dark:shadow-none active:scale-[0.98]">
                            <span className="material-symbols-outlined text-lg">save</span>
                            Simpan Registrasi
                        </button>
                    </div>
                </div>

                {/* Mobile Import/Template actions */}
                <div className="flex sm:hidden items-center gap-2">
                    <button 
                        onClick={() => downloadTemplate(getComprehensiveTemplate())}
                        className="flex-1 px-4 py-3 rounded-xl text-xs font-bold text-slate-600 dark:text-slate-400 border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 flex items-center justify-center gap-2"
                    >
                        <span className="material-symbols-outlined text-[18px]">description</span>
                        Template
                    </button>
                    <label className="flex-1 cursor-pointer px-4 py-3 rounded-xl text-xs font-bold text-primary border border-primary/20 bg-primary/5 flex items-center justify-center gap-2">
                        <span className="material-symbols-outlined text-[18px]">upload_file</span>
                        Impor
                        <input type="file" accept=".json" onChange={handleImportJSON} className="hidden" />
                    </label>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-white/50 dark:border-slate-700/50 gap-1 overflow-x-auto bg-white/70 dark:bg-slate-900/70 backdrop-blur-md rounded-t-3xl px-3 pt-2">
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-5 py-3.5 text-sm font-semibold whitespace-nowrap border-b-2 transition-all shrink-0 rounded-t-xl ${activeTab === tab.key ? 'border-primary text-primary bg-white/50 dark:bg-slate-800/50 shadow-[0_-4px_10px_rgb(0,0,0,0.02)]' : 'border-transparent text-slate-500 hover:text-slate-700 hover:bg-white/30 dark:hover:bg-slate-800/30'}`}>
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            <span>{tab.label}</span>
                            {form[tab.key === 'ringkasan' ? 'none' : tab.key === 'gejala' ? 'symptoms' : tab.key === 'fisik' ? 'physicalExams' : tab.key === 'lab' ? 'supportingExams' : tab.key === 'obat' ? 'prescriptions' : 'dailyReports']?.length > 0 &&
                                <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">{form[tab.key === 'gejala' ? 'symptoms' : tab.key === 'fisik' ? 'physicalExams' : tab.key === 'lab' ? 'supportingExams' : tab.key === 'obat' ? 'prescriptions' : 'dailyReports']?.length}</span>
                            }
                        </button>
                    ))}
                </div>

                <div className="bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-b-3xl rounded-tr-3xl border border-white/50 dark:border-slate-700/50 p-6 lg:p-8 min-h-125 shadow-[0_8px_30px_rgb(0,0,0,0.04)] dark:shadow-none">
                    {activeTab === 'ringkasan' && (
                        <div className="space-y-8 animate-[fadeIn_0.2s_ease-out]">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormSection title="Data Dasar" icon="person">
                                    <div className="space-y-4 lg:space-y-5">
                                        <InputGroup label="Nama Lengkap *" name="name" value={form.name} onChange={handleChange} required placeholder="Masukkan nama" icon="badge" />
                                        <InputGroup label="Kamar / Bed" name="room" value={form.room} onChange={handleChange} placeholder="Mawar - Bed 3" icon="bed" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputGroup label="Umur" name="age" type="number" value={form.age} onChange={handleChange} placeholder="Tahun" icon="numbers" />
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-2 ml-1 tracking-widest">J. Kelamin</label>
                                                <div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800 h-11">
                                                    {[{ v: 'male', l: 'Laki-laki', i: 'male' }, { v: 'female', l: 'Perempuan', i: 'female' }].map(opt => (
                                                        <button key={opt.v} type="button" onClick={() => setForm(p => ({ ...p, gender: opt.v }))}
                                                            title={opt.l}
                                                            className={`flex-1 rounded-lg transition-all flex items-center justify-center ${form.gender === opt.v ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500 hover:text-slate-700'}`}>
                                                            <span className="material-symbols-outlined text-[20px]">{opt.i}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </FormSection>
                                <FormSection title="Detail Medis" icon="clinical_notes">
                                    <div className="space-y-4 lg:space-y-5">
                                        <CustomSelect 
                                            label="Kondisi Pasien" 
                                            name="condition" 
                                            value={form.condition} 
                                            onChange={handleChange} 
                                            icon="monitoring"
                                            options={[
                                                { v: 'stable', l: 'Stabil', name: 'condition' },
                                                { v: 'improving', l: 'Membaik', name: 'condition' },
                                                { v: 'urgent', l: 'Mendesak', name: 'condition' },
                                                { v: 'critical', l: 'Kritis', name: 'condition' }
                                            ]} 
                                        />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputGroup label="BB (kg)" name="weight" type="number" value={form.weight} onChange={handleChange} placeholder="70" icon="weight" />
                                            <InputGroup label="TB (cm)" name="height" type="number" value={form.height} onChange={handleChange} placeholder="170" icon="height" />
                                        </div>
                                        <div className="grid grid-cols-12 gap-3">
                                            <div className="col-span-5">
                                                <CustomSelect 
                                                    label="Gol. Darah" 
                                                    value={form.bloodType} 
                                                    onChange={(e) => setForm(p => ({ ...p, bloodType: e.target.value }))} 
                                                    icon="bloodtype"
                                                    options={[
                                                        { v: '', l: '-' }, { v: 'A', l: 'A' }, { v: 'B', l: 'B' }, { v: 'AB', l: 'AB' }, { v: 'O', l: 'O' }
                                                    ]} 
                                                />
                                            </div>
                                            <div className="col-span-7">
                                                <CustomSelect 
                                                    label="Rhesus" 
                                                    value={form.rhesus} 
                                                    onChange={(e) => setForm(p => ({ ...p, rhesus: e.target.value }))} 
                                                    options={[
                                                        { v: '', l: '(no rhesus)' }, { v: '+', l: '+' }, { v: '-', l: '-' }
                                                    ]} 
                                                />
                                            </div>
                                        </div>
                                    </div>
                                </FormSection>
                                <FormSection title="Registrasi" icon="calendar_today">
                                    <div className="space-y-4 lg:space-y-5">
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputGroup label="Tgl Masuk" name="admissionDate" type="date" value={form.admissionDate} onChange={handleChange} icon="today" />
                                            <InputGroup label="Estimasi" name="targetDays" type="number" value={form.targetDays} onChange={handleChange} placeholder="Hari" icon="timer" />
                                        </div>
                                        {stases.length > 0 && (
                                            <CustomSelect
                                                label="Stase Aktif"
                                                name="stase_id"
                                                value={form.stase_id}
                                                onChange={handleChange}
                                                placeholder="Pilih stase"
                                                options={stases.map(s => ({ v: s.id, l: s.name, name: 'stase_id' }))}
                                                icon="push_pin"
                                            />
                                        )}
                                        <div className="p-3 bg-primary/5 rounded-xl border border-primary/10 flex items-center gap-3">
                                            <span className="material-symbols-outlined text-primary text-xl">info</span>
                                            <p className="text-[10px] text-slate-500 leading-tight"><b className="text-primary uppercase block mb-0.5 tracking-wider">Info Registrasi</b> Pastikan data sesuai dengan berkas pendaftaran pasien.</p>
                                        </div>
                                    </div>
                                </FormSection>
                            </div>

                            <FormSection title="Tanda Vital Awal" icon="ecg">
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                    <VitalInput label="Jantung" name="heartRate" value={form.heartRate} unit="bpm" onChange={handleChange} icon="favorite" color="text-red-500" />
                                    <VitalInput label="Tek. Darah" name="bloodPressure" value={form.bloodPressure} unit="mmHg" onChange={handleChange} icon="rebase_edit" color="text-blue-500" />
                                    <VitalInput label="Suhu" name="temperature" value={form.temperature} unit="°C" onChange={handleChange} icon="thermostat" color="text-amber-500" />
                                    <VitalInput label="Napas" name="respRate" value={form.respRate} unit="/min" onChange={handleChange} icon="air" color="text-teal-500" />
                                    <VitalInput label="SpO2" name="spO2" value={form.spO2} unit="%" onChange={handleChange} icon="lungs" color="text-indigo-500" />
                                </div>
                            </FormSection>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <TextAreaGroup label="Keluhan Utama" name="chiefComplaint" value={form.chiefComplaint} onChange={handleChange} rows={4} placeholder="Jelaskan alasan utama pasien masuk..." icon="history_edu" />
                                <div className="space-y-1.5">
                                    <div className="flex items-center justify-between mb-1 px-1">
                                        <label className="block text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">diagnosis</span> Diagnosis / Riwayat</label>
                                        <button type="button" onClick={() => setShowDiagnosisPicker(true)}
                                            className="flex items-center gap-1.5 text-[10px] text-primary hover:text-primary hover:bg-primary/10 font-black uppercase transition-all px-2.5 py-1 rounded-xl border border-primary/20">
                                            <span className="material-symbols-outlined text-[14px]">qr_code_2</span>
                                            Picker ICD-10
                                        </button>
                                    </div>
                                    <div className="relative group">
                                        <textarea name="diagnosis" value={form.diagnosis} onChange={handleChange} rows={4} placeholder="Diagnosis awal atau riwayat medis dasar..."
                                            className="w-full rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary focus:ring-4 focus:ring-primary/10 text-sm font-bold text-slate-800 dark:text-slate-200 transition-all py-3 px-4 placeholder:text-slate-300 shadow-sm leading-relaxed" />
                                    </div>
                                </div>
                                {showDiagnosisPicker && (
                                    <ICD10Picker
                                        onSelect={(code, display) => setForm(prev => ({ ...prev, diagnosis: prev.diagnosis ? `${prev.diagnosis}\n${display} (${code})` : `${display} (${code})` }))}
                                        onClose={() => setShowDiagnosisPicker(false)}
                                    />
                                )}
                            </div>
                        </div>
                    )}

                    {activeTab === 'gejala' && (
                        <TabContent title="Kelola Gejala Pasien" icon="symptoms"
                            onAdd={() => { if (!symptomInput.name) return; addItem('symptoms', symptomInput, setSymptomInput, { name: '', severity: 'sedang', notes: '' }) }}
                            items={form.symptoms} onRemove={(id) => removeItem('symptoms', id)}
                            renderForm={
                                <div className="space-y-4">
                                    <div className="space-y-4 lg:space-y-5">
                                        <div className="relative group">
                                            <input type="text" value={symptomInput.name} onChange={e => setSymptomInput(p => ({ ...p, name: e.target.value }))} placeholder="Nama gejala (cth. Demam, Sesak)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 placeholder:text-slate-400 shadow-sm" />
                                        </div>
                                        <div className="relative group">
                                            <textarea value={symptomInput.notes || ''} onChange={e => setSymptomInput(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Catatan penyakit (opsional)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 resize-none placeholder:text-slate-400 shadow-sm leading-relaxed" />
                                        </div>
                                        <div className="space-y-2 px-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">warning</span> Tingkat Keparahan</label>
                                            <div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl gap-1 border border-slate-100 dark:border-slate-800">
                                                {[{ v: 'ringan', l: 'Ringan' }, { v: 'sedang', l: 'Sedang' }, { v: 'berat', l: 'Berat' }].map(opt => (
                                                    <button key={opt.v} type="button" onClick={() => setSymptomInput(p => ({ ...p, severity: opt.v }))}
                                                        className={`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all ${symptomInput.severity === opt.v ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                                        {opt.l}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                    </div>
                                    <button onClick={() => { if (!symptomInput.name) return; addItem('symptoms', symptomInput, setSymptomInput, { name: '', severity: 'sedang', notes: '' }) }} type="button" 
                                        className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-primary/30 hover:shadow-primary/40 active:scale-[0.98] flex items-center justify-center gap-2 transition-all">
                                        <span className="material-symbols-outlined font-black">add_circle</span> Tambah Gejala Ke List
                                    </button>
                                </div>
                            }
                            renderItem={(s) => (
                                <div className="w-full min-w-0">
                                    <div className="flex items-start gap-2 w-full min-w-0 mb-0.5">
                                        <div className={`size-2 rounded-full shrink-0 mt-1.5 ${s.severity === 'berat' ? 'bg-red-500' : s.severity === 'sedang' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                        <span className="text-sm font-bold flex-1 min-w-0 break-words leading-snug">{s.name}</span>
                                        <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded shrink-0 ${s.severity === 'berat' ? 'bg-red-50 text-red-600' : s.severity === 'sedang' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>{s.severity}</span>
                                    </div>
                                    {s.notes && <p className="text-xs text-slate-400 ml-4 break-words leading-snug">{s.notes}</p>}
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'fisik' && (
                        <TabContent title="Pemeriksaan Fisik Awal" icon="stethoscope"
                            onAdd={() => { if (!examInput.findings) return; addItem('physicalExams', examInput, setExamInput, { findings: '', system: 'umum' }) }}
                            items={form.physicalExams} onRemove={(id) => removeItem('physicalExams', id)}
                            renderForm={
                                <div className="space-y-4">
                                    <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-sm">
                                        <div className="space-y-2.5 px-1">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">body_system</span> Pilih Sistem Tubuh</label>
                                            <div className="grid grid-cols-4 gap-1.5 p-1 bg-slate-50 dark:bg-slate-950 rounded-xl border border-slate-200 dark:border-slate-800">
                                                {['umum', 'kepala', 'leher', 'thorax', 'abdomen', 'ekstremitas', 'neurologis', 'kulit'].map(o => (
                                                    <button key={o} type="button" onClick={() => setExamInput(p => ({ ...p, system: o }))}
                                                        className={`py-2 text-[8px] font-black uppercase rounded-lg transition-all ${examInput.system === o ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}`}>
                                                        {o}
                                                    </button>
                                                ))}
                                            </div>
                                        </div>
                                        <div className="relative group">
                                            <input type="text" value={examInput.findings} onChange={e => setExamInput(p => ({ ...p, findings: e.target.value }))} placeholder="Hasil temuan pemeriksaan fisik..." className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 placeholder:text-slate-400 shadow-sm" />
                                        </div>
                                    </div>
                                    <button onClick={() => { if (!examInput.findings) return; addItem('physicalExams', examInput, setExamInput, { findings: '', system: 'umum' }) }} type="button" 
                                        className="w-full bg-slate-900 dark:bg-slate-50 text-white dark:text-slate-900 py-4 rounded-2xl font-black text-xs uppercase tracking-widest flex items-center justify-center gap-2 hover:opacity-90 transition-all active:scale-[0.98] shadow-xl shadow-slate-900/10">
                                        <span className="material-symbols-outlined text-sm">add_circle</span> Tambah Temuan Fisik
                                    </button>
                                </div>
                            }
                            renderItem={(e) => <div className="text-sm min-w-0 break-words"><span className="font-bold text-primary mr-1 uppercase">{e.system}:</span><span className="text-slate-600 dark:text-slate-400">{e.findings}</span></div>}
                        />
                    )}

                    {activeTab === 'lab' && (
                        <LabTabAddPatient
                            form={form}
                            labInput={labInput}
                            setLabInput={setLabInput}
                            addItem={addItem}
                            removeItem={removeItem}
                        />
                    )}

                    {activeTab === 'obat' && (
                        <TabContent title="Resep Obat" icon="medication"
                            onAdd={() => { if (!prescInput.name) return; addItem('prescriptions', prescInput, setPrescInput, { name: '', dosage: '', frequency: '', route: 'oral', fornas_source: false, fornas_form: '', fornas_category: '' }) }}
                            items={form.prescriptions} onRemove={(id) => removeItem('prescriptions', id)}
                            renderForm={
                                    <div className="space-y-4">
                                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-4 shadow-sm">
                                            {/* Fornas shortcut */}
                                            <div className="flex items-center justify-between gap-2">
                                                <p className="text-[10px] font-black text-slate-400 uppercase tracking-widest flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">medication</span> Nama Obat</p>
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
                                            {prescInput.fornas_source && (
                                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-teal-50 dark:bg-teal-900/10 border border-teal-200 dark:border-teal-800/20 animate-[slideUp_0.2s_ease-out]">
                                                    <span className="material-symbols-outlined text-teal-500 text-[14px] shrink-0">verified</span>
                                                    <div className="flex-1 min-w-0">
                                                        <p className="text-[10px] font-bold text-teal-700 dark:text-teal-400 uppercase tracking-wide">Dari Fornas</p>
                                                        {prescInput.fornas_category && <p className="text-[11px] text-teal-600 dark:text-teal-400 truncate font-semibold">{prescInput.fornas_category}</p>}
                                                    </div>
                                                    <button
                                                        type="button"
                                                        onClick={() => setPrescInput(p => ({ ...p, fornas_source: false, fornas_form: '', fornas_category: '' }))}
                                                        className="shrink-0 p-1 rounded-lg text-teal-400 hover:text-teal-700 dark:hover:text-teal-200 hover:bg-teal-100/50 transition"
                                                    >
                                                        <span className="material-symbols-outlined text-sm">close</span>
                                                    </button>
                                                </div>
                                            )}
                                            <div className="relative group">
                                                <input type="text" value={prescInput.name} onChange={e => setPrescInput(p => ({ ...p, name: e.target.value, fornas_source: false, fornas_form: '' }))} placeholder="Nama obat (cth. Paracetamol)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 placeholder:text-slate-400 shadow-sm" />
                                            </div>
                                            <div className="flex flex-col sm:flex-row gap-3">
                                                <div className="relative group flex-1">
                                                    <input type="text" value={prescInput.dosage} onChange={e => setPrescInput(p => ({ ...p, dosage: e.target.value }))} placeholder="Dosis (500mg)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 placeholder:text-slate-400 shadow-sm" />
                                                </div>
                                                <div className="relative group flex-1">
                                                    <input type="text" value={prescInput.frequency} onChange={e => setPrescInput(p => ({ ...p, frequency: e.target.value }))} placeholder="Frek (3x/hari)" className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 placeholder:text-slate-400 shadow-sm" />
                                                </div>
                                            </div>
                                        </div>

                                        <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-4 space-y-3 shadow-sm">
                                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">route</span> Rute Pemberian</label>
                                            <div className="grid grid-cols-3 gap-2">
                                                {[
                                                    { v: 'oral', l: 'Oral', i: 'pill' },
                                                    { v: 'iv', l: 'IV', i: 'vaccines' },
                                                    { v: 'im', l: 'IM', i: 'syringe' },
                                                    { v: 'sc', l: 'SC', i: 'colorize' },
                                                    { v: 'topikal', l: 'Top', i: 'dermatology' },
                                                    { v: 'inhalasi', l: 'Inh', i: 'air' }
                                                ].map(opt => (
                                                    <button key={opt.v} type="button" onClick={() => setPrescInput(p => ({ ...p, route: opt.v }))}
                                                        className={`flex flex-col items-center py-2 px-1 rounded-xl border transition-all ${prescInput.route === opt.v ? 'bg-primary/10 border-primary text-primary shadow-sm scale-[1.02]' : 'bg-slate-50 dark:bg-slate-800 border-transparent text-slate-500 hover:bg-slate-100 hover:text-slate-700'}`}>
                                                        <span className="material-symbols-outlined text-lg mb-0.5">{opt.i}</span>
                                                        <span className="text-[9px] font-black uppercase tracking-tighter">{opt.l}</span>
                                                    </button>
                                                ))}
                                            </div>
                                        </div>

                                        <button onClick={() => { if (!prescInput.name) return; addItem('prescriptions', prescInput, setPrescInput, { name: '', dosage: '', frequency: '', route: 'oral', fornas_source: false, fornas_form: '', fornas_category: '' }) }} type="button" 
                                            className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-primary/25 hover:shadow-primary/40 hover:brightness-110 active:scale-[0.98] transition-all flex items-center justify-center gap-2">
                                            <span className="material-symbols-outlined font-black">add_circle</span>
                                            Tambah Obat Ke Daftar
                                        </button>
                                    </div>
                            }
                            renderItem={(o) => (
                                <div className="text-sm min-w-0">
                                    <div className="flex items-start gap-1.5 flex-wrap">
                                        <p className="font-bold break-words leading-snug">{o.name}{o.dosage ? ` ${o.dosage}` : ''}</p>
                                        {o.fornas_source && (
                                            <span className="inline-flex items-center gap-0.5 text-[9px] font-bold text-teal-700 dark:text-teal-400 bg-teal-50 dark:bg-teal-900/30 border border-teal-200 dark:border-teal-800/40 rounded-full px-1.5 py-0.5 uppercase shrink-0">
                                                <span className="material-symbols-outlined text-[10px]">verified</span>
                                                Fornas
                                            </span>
                                        )}
                                    </div>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{o.frequency} • {o.route}</p>
                                </div>
                            )}
                        />
                    )}
                    {showFornasPicker && (
                        <FornasDrugPicker
                            onSelect={handleFornasPrescSelect}
                            onClose={() => setShowFornasPicker(false)}
                        />
                    )}

                    {activeTab === 'harian' && (
                        <TabContent title="Laporan Awal" icon="description"
                            onAdd={() => { if (!reportInput.notes) return; addItem('dailyReports', reportInput, setReportInput, { notes: '', condition: '' }) }}
                            items={form.dailyReports} onRemove={(id) => removeItem('dailyReports', id)}
                            renderForm={
                                <div className="space-y-4">
                                    <div className="space-y-4 lg:space-y-5">
                                        <div className="relative group">
                                            <textarea value={reportInput.notes} onChange={e => setReportInput(p => ({ ...p, notes: e.target.value }))} rows={4} placeholder="Tuliskan catatan perkembangan harian atau laporan awal..." className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-4 px-4 placeholder:text-slate-400 shadow-sm leading-relaxed" />
                                        </div>
                                    </div>
                                    <button onClick={() => addItem('dailyReports', reportInput, setReportInput, { notes: '', condition: '' })} type="button" 
                                        className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 py-4 rounded-2xl font-black text-xs uppercase tracking-widest border border-slate-200 dark:border-slate-700 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all active:scale-[0.98] flex items-center justify-center gap-2 shadow-sm">
                                        <span className="material-symbols-outlined text-sm">post_add</span> Simpan Catatan Harian
                                    </button>
                                </div>
                            }
                            renderItem={(r) => <p className="text-sm italic text-slate-600 break-words leading-snug">"{r.notes}"</p>}
                        />
                    )}
                </div>
            </div>
        </div>
    );
}

/* --- Sub-Components --- */

function FormSection({ title, icon, children }) {
    return (
        <div className="space-y-4">
            <h3 className="flex items-center gap-2 text-[11px] font-bold text-slate-500 uppercase tracking-widest">
                <span className="material-symbols-outlined text-[18px] opacity-70">{icon}</span>
                {title}
            </h3>
            {children}
        </div>
    );
}

function InputGroup({ label, icon, ...props }) {
    return (
        <div className="space-y-2 ml-0.5">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 ml-1"><span className="material-symbols-outlined text-[15px] opacity-80">{icon}</span> {label}</label>
            <div className="relative group">
                <input {...props} className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all px-4 py-3 placeholder:text-slate-400 placeholder:font-medium shadow-sm hover:shadow-md" />
            </div>
        </div>
    );
}

function TextAreaGroup({ label, icon, ...props }) {
    return (
        <div className="space-y-2 ml-1">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 ml-1"><span className="material-symbols-outlined text-[15px] opacity-80">{icon}</span> {label}</label>
            <div className="relative group">
                <textarea {...props} className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all px-4 py-3 placeholder:text-slate-400 placeholder:font-medium shadow-sm hover:shadow-md leading-relaxed" />
            </div>
        </div>
    );
}

function SelectGroup({ label, options, icon, ...props }) {
    return (
        <div className="space-y-2 ml-0.5">
            <label className="block text-[10px] font-bold text-slate-500 uppercase tracking-widest flex items-center gap-1.5 ml-1"><span className="material-symbols-outlined text-[15px] opacity-80">{icon}</span> {label}</label>
            <div className="relative group">
                <select {...props} className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all px-4 py-3 shadow-sm hover:shadow-md appearance-none">
                    {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
                </select>
                <span className="material-symbols-outlined absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none">expand_more</span>
            </div>
        </div>
    );
}

function VitalInput({ label, unit, icon, color, ...props }) {
    return (
        <div className="p-4 bg-white/60 dark:bg-slate-900/60 backdrop-blur-xl rounded-2xl border border-white/50 dark:border-slate-700/50 flex flex-col items-center group hover:border-primary/40 focus-within:border-primary/40 focus-within:ring-8 focus-within:ring-primary/5 transition-all duration-300 shadow-[0_4px_20px_rgb(0,0,0,0.03)] hover:shadow-[0_8px_30px_rgb(0,0,0,0.06)]">
            <div className={`p-2 rounded-xl bg-white/50 dark:bg-slate-800/50 backdrop-blur-md mb-3 group-hover:scale-110 transition-transform ${color || 'text-primary'}`}>
                <span className="material-symbols-outlined text-[18px] block">{icon}</span>
            </div>
            <span className="text-[9px] font-bold text-slate-500 uppercase mb-2 tracking-widest text-center">{label}</span>
            <div className="flex items-baseline gap-1 relative">
                <input {...props} className="w-16 bg-transparent border-none p-0 text-center font-bold text-2xl text-slate-800 dark:text-white focus:ring-0 placeholder:text-slate-300" placeholder="-" />
                <span className="text-[8px] text-slate-400 font-bold uppercase tracking-tighter absolute -right-3 bottom-1.5">{unit}</span>
            </div>
        </div>
    );
}

function TabContent({ title, icon, onAdd: _onAdd, items, onRemove, renderForm, renderItem }) {
    return (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-8 animate-[fadeIn_0.2s_ease-out]">
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-bold text-slate-800 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">{icon}</span>
                        {title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1 font-medium">Gunakan form di bawah untuk menambahkan data awal.</p>
                </div>
                <div className="mt-4">
                    {renderForm}
                </div>
            </div>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data yang Akan Disimpan ({items?.length || 0})</h4>
                </div>
                <div className="space-y-2 max-h-100 overflow-y-auto pr-2">
                    {items?.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 opacity-50">
                            <span className="material-symbols-outlined text-4xl mb-2">empty_dashboard</span>
                            <p className="text-xs font-bold">Belum ada data ditambahkan</p>
                        </div>
                    ) : items.map(item => (
                        <div key={item.id} className="group relative flex items-start gap-3 p-4 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200/80 dark:border-slate-700/50 shadow-md shadow-slate-200/40 dark:shadow-none hover:border-primary/50 transition-all">
                            <div className="flex-1 min-w-0">{renderItem(item)}</div>
                            <button onClick={() => onRemove(item.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all shrink-0">
                                <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

/* ====== LAB TAB (AddPatient) ====== */
function LabTabAddPatient({ form, labInput, setLabInput, addItem, removeItem }) {
    const [showRefModal, setShowRefModal] = useState(false);
    const [activeLabCat, setActiveLabCat] = useState(labCategories[0].key);

    const selectedRef = labInput.labKey && labInput.labKey !== 'custom' ? labReferences[labInput.labKey] : null;

    function getRefDisplay(ref, gender) {
        gender = gender || form.gender || 'male';
        if (!ref) return null;
        if (ref.qualitative) return { text: ref.normalValue || 'Negatif', type: 'qualitative' };
        if (ref.infoRanges) return { text: ref.infoRanges.map(r => r.label + ': ' + r.value).join(' | '), type: 'info' };
        const range = (ref.male && ref.female) ? (ref[gender] || ref.male) : ref;
        if (!range) return null;
        if (range.low === 0 && range.high === 999) return { text: '>= ' + range.low + ' ' + ref.unit, type: 'range' };
        return { text: range.low + ' - ' + range.high + ' ' + ref.unit, type: 'range' };
    }

    const refDisplay = selectedRef ? getRefDisplay(selectedRef) : null;
    const catItems = Object.entries(labReferences).filter(function(entry) { return entry[1].category === activeLabCat; });

    function doAdd() {
        if (!labInput.value) return;
        if (!labInput.testName && activeLabCat !== 'custom') return;
        addItem('supportingExams',
            Object.assign({ type: 'lab' }, labInput, { result: checkLabValue(labInput.labKey, labInput.value, form.gender) }),
            setLabInput,
            { testName: '', value: '', unit: '', labKey: '' }
        );
    }

    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-[fadeIn_0.2s_ease-out]">
            {showRefModal && <LabReferenceModal onClose={() => setShowRefModal(false)} />}
            <div className="space-y-6">
                <div className="space-y-1 mb-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2 shrink-0">
                            <span className="material-symbols-outlined text-primary">biotech</span>
                            Hasil Laboratorium
                        </h3>
                        <button type="button" onClick={() => setShowRefModal(true)}
                            className="flex items-center gap-1.5 px-3 py-2 rounded-xl bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-primary/10 hover:text-primary border border-transparent hover:border-primary/20 transition-all text-[11px] font-bold shrink-0 self-start sm:self-auto">
                            <span className="material-symbols-outlined text-[16px]">fact_check</span>
                            Nilai Rujukan
                        </button>
                    </div>
                    <p className="text-sm text-slate-500">Gunakan form di bawah untuk menambahkan data awal.</p>
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 p-5 space-y-5 shadow-sm">
                    <div className="space-y-2.5 px-1">
                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">category</span> Kategori Pemeriksaan</label>
                        <div className="flex gap-1 overflow-x-auto pb-1 custom-scrollbar no-scrollbar">
                            {labCategories.map(cat => (
                                <button key={cat.key} type="button"
                                    onClick={() => { setActiveLabCat(cat.key); setLabInput(p => ({ ...p, labKey: '', testName: '', unit: '' })); }}
                                    className={"flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap shrink-0 transition-all border " + (activeLabCat === cat.key ? 'bg-primary text-white border-primary shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-100 dark:hover:bg-slate-700')}>
                                    <span className="material-symbols-outlined text-[14px]">{cat.icon}</span>
                                    {cat.label}
                                </button>
                            ))}
                            <button type="button"
                                onClick={() => { setActiveLabCat('custom'); setLabInput(p => ({ ...p, labKey: 'custom', testName: '', unit: '' })); }}
                                className={"flex items-center gap-1.5 px-3 py-2 rounded-xl text-[10px] font-black uppercase whitespace-nowrap shrink-0 transition-all border " + (activeLabCat === 'custom' ? 'bg-primary text-white border-primary shadow-md' : 'bg-slate-50 dark:bg-slate-800 text-slate-500 border-transparent hover:bg-slate-100')}>
                                <span className="material-symbols-outlined text-[14px]">add_circle</span>
                                Lainnya
                            </button>
                        </div>
                    </div>

                    {activeLabCat === 'custom' ? (
                        <div className="relative group">
                            <input type="text" value={labInput.testName}
                                onChange={e => setLabInput(p => ({ ...p, testName: e.target.value, labKey: 'custom' }))}
                                placeholder="Nama pemeriksaan kustom..."
                                className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all py-3.5 px-4 placeholder:text-slate-400 shadow-sm" />
                        </div>
                    ) : (
                        <div className="space-y-2.5 px-1">
                            <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1 flex items-center gap-1.5"><span className="material-symbols-outlined text-sm">list_alt</span> Pilih Parameter</label>
                            <div className="grid grid-cols-2 gap-1.5 p-1.5 bg-slate-50 dark:bg-slate-950 rounded-2xl border border-slate-200 dark:border-slate-800 max-h-48 overflow-y-auto custom-scrollbar shadow-inner">
                                {catItems.map(([k, v]) => (
                                    <button key={k} type="button"
                                        onClick={() => setLabInput(p => ({ ...p, labKey: k, testName: v.name, unit: v.unit }))}
                                        className={"py-2 px-3 text-xs font-bold text-left rounded-xl transition-all flex justify-between items-center gap-2 " + (labInput.labKey === k ? 'bg-white dark:bg-slate-800 border-primary/50 border text-primary shadow-sm scale-[1.02]' : 'text-slate-600 dark:text-slate-400 hover:bg-white dark:hover:bg-slate-800 border border-transparent hover:shadow-xs')}>
                                        <span className="truncate text-[11px] font-black tracking-tight">{v.name}</span>
                                        <span className={"text-[9px] font-mono shrink-0 px-1.5 py-0.5 rounded-md " + (labInput.labKey === k ? 'bg-primary/10 text-primary' : 'bg-slate-200 dark:bg-slate-700 text-slate-500')}>{v.unit !== '-' ? v.unit : ''}</span>
                                    </button>
                                ))}
                            </div>
                        </div>
                    )}

                    {selectedRef && refDisplay && (
                        <div className="flex items-start gap-3 px-4 py-3 rounded-2xl bg-primary/5 border border-primary/15 animate-[slideUp_0.2s_ease-out]">
                            <div className="p-1.5 bg-white dark:bg-slate-800 rounded-lg shadow-sm">
                                <span className="material-symbols-outlined text-primary text-[16px] block">info</span>
                            </div>
                            <div className="min-w-0">
                                <p className="text-[9px] text-primary font-black uppercase tracking-wider">Nilai Rujukan</p>
                                <p className="text-xs text-slate-600 dark:text-slate-300 font-bold mt-0.5 wrap-break-word">{refDisplay.text}</p>
                                {selectedRef.metode && <p className="text-[10px] text-slate-400 mt-0.5 font-medium italic">Metode: {selectedRef.metode}</p>}
                            </div>
                        </div>
                    )}

                    {(labInput.labKey || activeLabCat === 'custom') && (
                        <div className="flex gap-3">
                            <div className="relative group flex-1">
                                <input type="text" value={labInput.value}
                                    onChange={e => setLabInput(p => ({ ...p, value: e.target.value }))}
                                    placeholder={selectedRef && selectedRef.qualitative ? 'Hasil (cth: ' + (selectedRef.normalValue || 'Negatif') + ')' : 'Hasil Pengukuran'}
                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200 transition-all placeholder:text-slate-400 shadow-sm" />
                            </div>
                            <div className="relative group w-28">
                                <input type="text" value={labInput.unit}
                                    onChange={e => setLabInput(p => ({ ...p, unit: e.target.value }))}
                                    placeholder="Satuan"
                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-xs py-3.5 px-4 font-semibold text-slate-800 dark:text-slate-200 transition-all placeholder:text-slate-400 shrink-0 shadow-sm" />
                            </div>
                        </div>
                    )}

                    <button type="button" onClick={doAdd}
                        disabled={!labInput.value || (!labInput.testName && activeLabCat !== 'custom')}
                        className="w-full bg-primary text-white py-4 rounded-2xl font-black text-sm shadow-xl shadow-primary/30 hover:shadow-primary/40 active:scale-[0.98] transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed uppercase tracking-wider">
                        <span className="material-symbols-outlined font-black">add_chart</span> Simpan Hasil Laboratorium
                    </button>
                </div>
            </div>

            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">
                        Data yang Akan Disimpan ({(form.supportingExams && form.supportingExams.length) || 0})
                    </h4>
                </div>
                <div className="space-y-2 max-h-100 overflow-y-auto pr-2">
                    {(!form.supportingExams || !form.supportingExams.length) ? (
                        <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 opacity-50">
                            <span className="material-symbols-outlined text-4xl mb-2">biotech</span>
                            <p className="text-xs font-bold">Belum ada hasil lab ditambahkan</p>
                        </div>
                    ) : form.supportingExams.map(l => (
                        <div key={l.id} className="group relative p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 transition-all">
                            {/* Row 1: name + delete */}
                            <div className="flex items-start justify-between gap-2 mb-1.5">
                                <span className="text-sm font-bold break-words leading-snug min-w-0 flex-1">{l.testName}</span>
                                <button type="button" onClick={() => removeItem('supportingExams', l.id)}
                                    className="opacity-0 group-hover:opacity-100 p-1.5 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all shrink-0">
                                    <span className="material-symbols-outlined text-sm">delete</span>
                                </button>
                            </div>
                            {/* Row 2: value + status */}
                            <div className="flex items-center gap-2">
                                <span className="text-sm font-black">{l.value} <span className="text-[10px] font-medium text-slate-400">{l.unit}</span></span>
                                {l.result && (
                                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${
                                        l.result.status === 'high' ? 'bg-red-100 text-red-600 dark:bg-red-900/30 dark:text-red-400' :
                                        l.result.status === 'low' ? 'bg-amber-100 text-amber-600 dark:bg-amber-900/30 dark:text-amber-400' :
                                        l.result.status === 'normal' ? 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400' :
                                        'bg-slate-100 text-slate-500'
                                    }`}>{l.result.label}</span>
                                )}
                            </div>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
