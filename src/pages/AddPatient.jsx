import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';
import { checkLabValue, labReferences, formatDateTime } from '../services/dataService';

export default function AddPatient() {
    const navigate = useNavigate();
    const { addPatient } = usePatients();

    const [activeTab, setActiveTab] = useState('ringkasan');
    const [form, setForm] = useState({
        name: '', age: '', gender: 'male', bloodType: '', admissionDate: new Date().toISOString().split('T')[0],
        targetDays: '', chiefComplaint: '', diagnosis: '', condition: 'stable', status: 'active',
        heartRate: '', bloodPressure: '', temperature: '', respRate: '', spO2: '',
        weight: '', height: '', allergies: '', medicalHistory: '',
        symptoms: [], dailyReports: [], physicalExams: [], supportingExams: [], prescriptions: [],
    });

    // Sub-states for adding multiple items during registration
    const [symptomInput, setSymptomInput] = useState({ name: '', severity: 'sedang', notes: '' });
    const [examInput, setExamInput] = useState({ findings: '', system: 'umum' });
    const [labInput, setLabInput] = useState({ testName: '', value: '', unit: '', labKey: '' });
    const [prescInput, setPrescInput] = useState({ name: '', dosage: '', frequency: '', route: 'oral' });
    const [reportInput, setReportInput] = useState({ notes: '', condition: '' });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
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

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-32 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-6xl mx-auto space-y-6">
                {/* Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-3 mb-1">
                            <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0">
                                <span className="material-symbols-outlined">arrow_back</span>
                            </button>
                            <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Registrasi Pasien</h1>
                        </div>
                        <nav className="flex text-sm text-slate-500 gap-2 ml-12">
                            <span>Pasien</span><span>/</span><span className="text-primary font-medium">Tambah Baru</span>
                        </nav>
                    </div>
                    <button onClick={handleSubmit}
                        className="bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 px-6 py-3 rounded-xl font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-all shadow-lg active:scale-95">
                        <span className="material-symbols-outlined text-xl">save</span>
                        Simpan Registrasi
                    </button>
                </div>

                {/* Tab Navigation */}
                <div className="flex border-b border-slate-200 dark:border-slate-800 gap-0.5 overflow-x-auto bg-white dark:bg-slate-900 rounded-t-xl px-2">
                    {tabs.map(tab => (
                        <button key={tab.key} onClick={() => setActiveTab(tab.key)}
                            className={`flex items-center gap-2 px-4 py-4 text-sm font-bold whitespace-nowrap border-b-2 transition-all flex-shrink-0 ${activeTab === tab.key ? 'border-primary text-primary' : 'border-transparent text-slate-500 hover:text-slate-700'}`}>
                            <span className="material-symbols-outlined text-[18px]">{tab.icon}</span>
                            <span>{tab.label}</span>
                            {form[tab.key === 'ringkasan' ? 'none' : tab.key === 'gejala' ? 'symptoms' : tab.key === 'fisik' ? 'physicalExams' : tab.key === 'lab' ? 'supportingExams' : tab.key === 'obat' ? 'prescriptions' : 'dailyReports']?.length > 0 &&
                                <span className="bg-primary/10 text-primary text-[10px] px-1.5 py-0.5 rounded-full">{form[tab.key === 'gejala' ? 'symptoms' : tab.key === 'fisik' ? 'physicalExams' : tab.key === 'lab' ? 'supportingExams' : tab.key === 'obat' ? 'prescriptions' : 'dailyReports']?.length}</span>
                            }
                        </button>
                    ))}
                </div>

                <div className="bg-white dark:bg-slate-900 rounded-b-xl border-x border-b border-slate-200 dark:border-slate-800 p-5 lg:p-8 min-h-[500px]">
                    {activeTab === 'ringkasan' && (
                        <div className="space-y-8 animate-[fadeIn_0.2s_ease-out]">
                            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                                <FormSection title="Data Dasar" icon="person">
                                    <div className="space-y-4">
                                        <InputGroup label="Nama Lengkap *" name="name" value={form.name} onChange={handleChange} required placeholder="Masukkan nama" />
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputGroup label="Umur" name="age" type="number" value={form.age} onChange={handleChange} placeholder="Tahun" />
                                            <div>
                                                <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">J. Kelamin</label>
                                                <div className="flex p-1 bg-slate-50 dark:bg-slate-900 rounded-xl gap-1 border border-slate-100 dark:border-slate-800 h-[42px]">
                                                    {[{ v: 'male', l: 'Laki-laki', i: 'male' }, { v: 'female', l: 'Perempuan', i: 'female' }].map(opt => (
                                                        <button key={opt.v} type="button" onClick={() => setForm(p => ({ ...p, gender: opt.v }))}
                                                            title={opt.l}
                                                            className={`flex-1 rounded-lg transition-all flex items-center justify-center ${form.gender === opt.v ? 'bg-white dark:bg-slate-800 text-primary shadow-sm' : 'text-slate-500 hover:bg-slate-200 dark:hover:bg-slate-800 hover:text-slate-700'}`}>
                                                            <span className="material-symbols-outlined text-[20px]">{opt.i}</span>
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        </div>
                                    </div>
                                </FormSection>
                                <FormSection title="Detail Medis" icon="clinical_notes">
                                    <div className="space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            <SelectGroup label="Gol. Darah" name="bloodType" value={form.bloodType} onChange={handleChange} options={[{ v: '', l: '-' }, { v: 'A+', l: 'A+' }, { v: 'B+', l: 'B+' }, { v: 'AB+', l: 'AB+' }, { v: 'O+', l: 'O+' }, { v: 'A-', l: 'A-' }, { v: 'B-', l: 'B-' }, { v: 'AB-', l: 'AB-' }, { v: 'O-', l: 'O-' }]} />
                                            <SelectGroup label="Kondisi" name="condition" value={form.condition} onChange={handleChange} options={[
                                                { v: 'stable', l: 'Stabil' },
                                                { v: 'improving', l: 'Membaik' },
                                                { v: 'urgent', l: 'Mendesak' },
                                                { v: 'critical', l: 'Kritis' }
                                            ]} />
                                        </div>
                                        <div className="grid grid-cols-2 gap-4">
                                            <InputGroup label="BB (kg)" name="weight" type="number" value={form.weight} onChange={handleChange} placeholder="70" />
                                            <InputGroup label="TB (cm)" name="height" type="number" value={form.height} onChange={handleChange} placeholder="170" />
                                        </div>
                                    </div>
                                </FormSection>
                                <FormSection title="Registrasi" icon="calendar_today">
                                    <div className="space-y-4">
                                        <InputGroup label="Tgl Masuk" name="admissionDate" type="date" value={form.admissionDate} onChange={handleChange} />
                                        <InputGroup label="Target Sembuh" name="targetDays" type="number" value={form.targetDays} onChange={handleChange} placeholder="Hari" />
                                    </div>
                                </FormSection>
                            </div>

                            <FormSection title="Tanda Vital" icon="ecg">
                                <div className="grid grid-cols-2 sm:grid-cols-5 gap-4">
                                    <VitalInput label="Jantung" name="heartRate" value={form.heartRate} unit="bpm" onChange={handleChange} />
                                    <VitalInput label="Tekanan Darah" name="bloodPressure" value={form.bloodPressure} unit="mmHg" onChange={handleChange} />
                                    <VitalInput label="Suhu" name="temperature" value={form.temperature} unit="°C" onChange={handleChange} />
                                    <VitalInput label="Napas" name="respRate" value={form.respRate} unit="/min" onChange={handleChange} />
                                    <VitalInput label="SpO2" name="spO2" value={form.spO2} unit="%" onChange={handleChange} />
                                </div>
                            </FormSection>

                            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                                <TextAreaGroup label="Keluhan Utama" name="chiefComplaint" value={form.chiefComplaint} onChange={handleChange} rows={4} placeholder="Jelaskan alasan utama pasien masuk..." />
                                <TextAreaGroup label="Diagnosis / Riwayat" name="diagnosis" value={form.diagnosis} onChange={handleChange} rows={4} placeholder="Diagnosis awal atau riwayat medis dasar..." />
                            </div>
                        </div>
                    )}

                    {activeTab === 'gejala' && (
                        <TabContent title="Kelola Gejala Pasien" icon="symptoms"
                            onAdd={() => { if (!symptomInput.name) return; addItem('symptoms', symptomInput, setSymptomInput, { name: '', severity: 'sedang', notes: '' }) }}
                            items={form.symptoms} onRemove={(id) => removeItem('symptoms', id)}
                            renderForm={
                                <div className="space-y-4">
                                    <input type="text" value={symptomInput.name} onChange={e => setSymptomInput(p => ({ ...p, name: e.target.value }))} placeholder="Nama gejala" className="w-full rounded-xl border-slate-200 dark:border-slate-800 text-sm py-3" />
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Keparahan</label>
                                        <div className="flex p-1 bg-white dark:bg-slate-900 rounded-xl gap-1 border border-slate-100 dark:border-slate-800">
                                            {[{ v: 'ringan', l: 'Ringan' }, { v: 'sedang', l: 'Sedang' }, { v: 'berat', l: 'Berat' }].map(opt => (
                                                <button key={opt.v} type="button" onClick={() => setSymptomInput(p => ({ ...p, severity: opt.v }))}
                                                    className={`flex-1 py-1.5 text-xs font-bold rounded-lg transition-all ${symptomInput.severity === opt.v ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50'}`}>
                                                    {opt.l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => { if (!symptomInput.name) return; addItem('symptoms', symptomInput, setSymptomInput, { name: '', severity: 'sedang', notes: '' }) }} type="button" className="w-full bg-primary text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"><span className="material-symbols-outlined">add</span> Tambah Gejala</button>
                                </div>
                            }
                            renderItem={(s) => (
                                <div className="flex items-center gap-3 w-full">
                                    <div className={`size-2 rounded-full ${s.severity === 'berat' ? 'bg-red-500' : s.severity === 'sedang' ? 'bg-amber-500' : 'bg-green-500'}`} />
                                    <span className="text-sm font-bold flex-1">{s.name}</span>
                                    <span className={`text-[9px] uppercase font-black px-1.5 py-0.5 rounded ${s.severity === 'berat' ? 'bg-red-50 text-red-600' : s.severity === 'sedang' ? 'bg-amber-50 text-amber-600' : 'bg-green-50 text-green-600'}`}>{s.severity}</span>
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
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Sistem Tubuh</label>
                                        <div className="grid grid-cols-3 sm:grid-cols-4 gap-1 p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800">
                                            {['umum', 'kepala', 'leher', 'thorax', 'abdomen', 'ekstremitas', 'neurologis', 'kulit'].map(o => (
                                                <button key={o} type="button" onClick={() => setExamInput(p => ({ ...p, system: o }))}
                                                    className={`py-1.5 text-[9px] font-black uppercase rounded-lg transition-all ${examInput.system === o ? 'bg-primary text-white shadow-sm' : 'text-slate-500 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'}`}>
                                                    {o}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <textarea value={examInput.findings} onChange={e => setExamInput(p => ({ ...p, findings: e.target.value }))} rows={2} placeholder="Temuan pemeriksaan..." className="w-full rounded-xl border-slate-200 dark:border-slate-800 text-sm py-3 transition-all" />
                                    <button onClick={() => { if (!examInput.findings) return; addItem('physicalExams', examInput, setExamInput, { findings: '', system: 'umum' }) }} type="button" className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold py-3 rounded-xl text-sm flex items-center justify-center gap-2 hover:bg-slate-200 dark:hover:bg-slate-700 transition-all"><span className="material-symbols-outlined text-sm">add</span> Tambah Temuan</button>
                                </div>
                            }
                            renderItem={(e) => <div className="text-sm"><span className="font-bold text-primary mr-2 uppercase">{e.system}:</span> {e.findings}</div>}
                        />
                    )}

                    {activeTab === 'lab' && (
                        <TabContent title="Hasil Laboratorium" icon="biotech"
                            onAdd={() => { if (!labInput.testName && labInput.labKey !== 'custom') return; addItem('supportingExams', { type: 'lab', ...labInput, result: checkLabValue(labInput.labKey, labInput.value, form.gender) }, setLabInput, { testName: '', value: '', unit: '', labKey: '' }) }}
                            items={form.supportingExams} onRemove={(id) => removeItem('supportingExams', id)}
                            renderForm={
                                <div className="space-y-4">
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Jenis Pemeriksaan</label>
                                        <div className="grid grid-cols-2 gap-1 p-1 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 max-h-48 overflow-y-auto custom-scrollbar">
                                            {Object.entries(labReferences).map(([k, v]) => (
                                                <button key={k} type="button" onClick={() => setLabInput(p => ({ ...p, labKey: k, testName: v.name, unit: v.unit }))}
                                                    className={`py-2 px-3 text-xs font-bold text-left rounded-lg transition-all flex justify-between items-center ${labInput.labKey === k ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'}`}>
                                                    <span className="truncate">{v.name}</span>
                                                    <span className={`text-[9px] font-black ml-2 ${labInput.labKey === k ? 'text-white/80' : 'text-slate-400'}`}>{v.unit}</span>
                                                </button>
                                            ))}
                                            <button type="button" onClick={() => setLabInput(p => ({ ...p, labKey: 'custom', testName: '', unit: '' }))}
                                                className={`py-2 px-3 text-xs font-bold text-left rounded-lg transition-all flex justify-between items-center ${labInput.labKey === 'custom' ? 'bg-primary text-white shadow-sm' : 'text-slate-600 dark:text-slate-300 hover:bg-slate-50 dark:hover:bg-slate-800 border border-transparent'}`}>
                                                Lainnya (Custom)
                                            </button>
                                        </div>
                                    </div>
                                    {labInput.labKey === 'custom' && <input type="text" value={labInput.testName} onChange={e => setLabInput(p => ({ ...p, testName: e.target.value }))} placeholder="Nama pemeriksaan" required className="w-full rounded-xl border-slate-200 dark:border-slate-800 text-sm py-3 transition-all" />}
                                    <div className="flex gap-2">
                                        <input type="text" value={labInput.value} onChange={e => setLabInput(p => ({ ...p, value: e.target.value }))} placeholder="Nilai (Hasil)" className="flex-1 rounded-xl border-slate-200 dark:border-slate-800 text-sm py-3" />
                                        <input type="text" value={labInput.unit} onChange={e => setLabInput(p => ({ ...p, unit: e.target.value }))} placeholder="Satuan" className="w-24 rounded-xl border-slate-200 dark:border-slate-800 text-sm py-3 flex-shrink-0" />
                                    </div>
                                    <button onClick={() => { if (!labInput.testName && labInput.labKey !== 'custom') return; addItem('supportingExams', { type: 'lab', ...labInput, result: checkLabValue(labInput.labKey, labInput.value, form.gender) }, setLabInput, { testName: '', value: '', unit: '', labKey: '' }) }} type="button" className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold py-3 rounded-xl text-sm hover:bg-slate-200 dark:hover:bg-slate-700 transition-all flex items-center justify-center gap-2"><span className="material-symbols-outlined text-sm">add</span> Tambah Lab</button>
                                </div>
                            }
                            renderItem={(l) => (
                                <div className="flex justify-between items-center w-full">
                                    <span className="text-sm font-bold">{l.testName}</span>
                                    <div className="text-right">
                                        <span className="text-sm font-black">{l.value} {l.unit}</span>
                                        {l.result && <span className={`block text-[8px] font-bold ${l.result.status === 'high' ? 'text-red-500' : l.result.status === 'low' ? 'text-amber-500' : 'text-green-500'}`}>{l.result.label}</span>}
                                    </div>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'obat' && (
                        <TabContent title="Resep Obat" icon="medication"
                            onAdd={() => { if (!prescInput.name) return; addItem('prescriptions', prescInput, setPrescInput, { name: '', dosage: '', frequency: '', route: 'oral' }) }}
                            items={form.prescriptions} onRemove={(id) => removeItem('prescriptions', id)}
                            renderForm={
                                <div className="space-y-4">
                                    <input type="text" value={prescInput.name} onChange={e => setPrescInput(p => ({ ...p, name: e.target.value }))} placeholder="Nama obat" className="w-full rounded-xl border-slate-200 dark:border-slate-800 text-sm py-3" />
                                    <div className="flex gap-2">
                                        <input type="text" value={prescInput.dosage} onChange={e => setPrescInput(p => ({ ...p, dosage: e.target.value }))} placeholder="Dosis" className="flex-1 rounded-xl border-slate-200 dark:border-slate-800 text-sm" />
                                        <input type="text" value={prescInput.frequency} onChange={e => setPrescInput(p => ({ ...p, frequency: e.target.value }))} placeholder="Frekuensi" className="flex-1 rounded-xl border-slate-200 dark:border-slate-800 text-sm" />
                                    </div>
                                    <div className="space-y-2">
                                        <label className="text-[10px] font-black text-slate-400 uppercase tracking-widest ml-1">Rute</label>
                                        <div className="grid grid-cols-3 gap-1">
                                            {[{ v: 'oral', l: 'Oral' }, { v: 'iv', l: 'IV' }, { v: 'im', l: 'IM' }, { v: 'sc', l: 'SC' }, { v: 'topikal', l: 'Top' }, { v: 'inhalasi', l: 'Inh' }].map(opt => (
                                                <button key={opt.v} type="button" onClick={() => setPrescInput(p => ({ ...p, route: opt.v }))}
                                                    className={`py-1.5 text-[9px] font-black uppercase rounded-lg border transition-all ${prescInput.route === opt.v ? 'bg-primary text-white border-primary shadow-sm' : 'bg-white dark:bg-slate-900 border-slate-100 dark:border-slate-800 text-slate-500'}`}>
                                                    {opt.l}
                                                </button>
                                            ))}
                                        </div>
                                    </div>
                                    <button onClick={() => { if (!prescInput.name) return; addItem('prescriptions', prescInput, setPrescInput, { name: '', dosage: '', frequency: '', route: 'oral' }) }} type="button" className="w-full bg-primary text-white py-3 rounded-xl font-bold text-sm shadow-md">Tambah Obat</button>
                                </div>
                            }
                            renderItem={(o) => (
                                <div className="text-sm">
                                    <p className="font-bold">{o.name} {o.dosage}</p>
                                    <p className="text-[10px] font-bold text-slate-400 uppercase">{o.frequency} • {o.route}</p>
                                </div>
                            )}
                        />
                    )}

                    {activeTab === 'harian' && (
                        <TabContent title="Laporan Awal" icon="description"
                            onAdd={() => { if (!reportInput.notes) return; addItem('dailyReports', reportInput, setReportInput, { notes: '', condition: '' }) }}
                            items={form.dailyReports} onRemove={(id) => removeItem('dailyReports', id)}
                            renderForm={
                                <div className="space-y-3">
                                    <textarea value={reportInput.notes} onChange={e => setReportInput(p => ({ ...p, notes: e.target.value }))} rows={4} placeholder="Catatan perkembangan..." className="w-full rounded-lg border-slate-200 dark:border-slate-800 text-sm" />
                                    <button onClick={() => addItem('dailyReports', reportInput, setReportInput, { notes: '', condition: '' })} type="button" className="w-full bg-slate-100 dark:bg-slate-800 text-slate-600 font-bold py-2 rounded-lg text-sm">Tambah Catatan</button>
                                </div>
                            }
                            renderItem={(r) => <p className="text-sm italic text-slate-600">"{r.notes}"</p>}
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
            <h3 className="flex items-center gap-2 text-xs font-black text-slate-400 uppercase tracking-[2px]">
                <span className="material-symbols-outlined text-[18px]">{icon}</span>
                {title}
            </h3>
            {children}
        </div>
    );
}

function InputGroup({ label, ...props }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">{label}</label>
            <input {...props} className="w-full rounded-xl border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm font-semibold transition-all py-2.5" />
        </div>
    );
}

function TextAreaGroup({ label, ...props }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">{label}</label>
            <textarea {...props} className="w-full rounded-xl border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm transition-all" />
        </div>
    );
}

function SelectGroup({ label, options, ...props }) {
    return (
        <div>
            <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">{label}</label>
            <select {...props} className="w-full rounded-xl border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm font-semibold transition-all py-2.5">
                {options.map(o => <option key={o.v} value={o.v}>{o.l}</option>)}
            </select>
        </div>
    );
}

function VitalInput({ label, unit, ...props }) {
    return (
        <div className="p-3 bg-slate-50 dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 flex flex-col items-center">
            <span className="text-[9px] font-black text-slate-400 uppercase mb-2">{label}</span>
            <div className="flex items-baseline gap-1">
                <input {...props} className="w-12 bg-transparent border-none p-0 text-center font-black text-lg focus:ring-0" placeholder="-" />
                <span className="text-[8px] text-slate-400 font-bold">{unit}</span>
            </div>
        </div>
    );
}

function TabContent({ title, icon, onAdd, items, onRemove, renderForm, renderItem }) {
    return (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 animate-[fadeIn_0.2s_ease-out]">
            <div className="space-y-6">
                <div>
                    <h3 className="text-xl font-black text-slate-900 dark:text-white flex items-center gap-2">
                        <span className="material-symbols-outlined text-primary">{icon}</span>
                        {title}
                    </h3>
                    <p className="text-sm text-slate-500 mt-1">Gunakan form di bawah untuk menambahkan data awal.</p>
                </div>
                <div className="bg-slate-50 dark:bg-slate-900/50 p-6 rounded-2xl border border-dashed border-slate-200 dark:border-slate-800">
                    {renderForm}
                </div>
            </div>
            <div className="space-y-4">
                <div className="flex justify-between items-center">
                    <h4 className="text-[10px] font-black text-slate-400 uppercase tracking-widest">Data yang Akan Disimpan ({items?.length || 0})</h4>
                </div>
                <div className="space-y-2 max-h-[400px] overflow-y-auto pr-2">
                    {items?.length === 0 ? (
                        <div className="text-center py-12 bg-slate-50 dark:bg-slate-900 rounded-2xl border border-slate-100 dark:border-slate-800 opacity-50">
                            <span className="material-symbols-outlined text-4xl mb-2">empty_dashboard</span>
                            <p className="text-xs font-bold">Belum ada data ditambahkan</p>
                        </div>
                    ) : items.map(item => (
                        <div key={item.id} className="group relative flex items-center gap-4 p-4 bg-white dark:bg-slate-900 rounded-xl border border-slate-100 dark:border-slate-800 hover:border-primary/50 transition-all">
                            <div className="flex-1">{renderItem(item)}</div>
                            <button onClick={() => onRemove(item.id)} className="opacity-0 group-hover:opacity-100 p-2 text-red-500 hover:bg-red-50 dark:hover:bg-red-900/10 rounded-lg transition-all">
                                <span className="material-symbols-outlined text-sm">delete</span>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}

