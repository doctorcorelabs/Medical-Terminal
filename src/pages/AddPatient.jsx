import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { usePatients } from '../context/PatientContext';

export default function AddPatient() {
    const navigate = useNavigate();
    const { addPatient } = usePatients();

    const [form, setForm] = useState({
        name: '', age: '', gender: 'male', bloodType: '', admissionDate: new Date().toISOString().split('T')[0],
        targetDays: '', chiefComplaint: '', diagnosis: '', condition: 'stable', status: 'active',
        heartRate: '', bloodPressure: '', temperature: '', respRate: '', spO2: '',
        weight: '', height: '', allergies: '', medicalHistory: '',
    });

    const handleChange = (e) => {
        const { name, value } = e.target;
        setForm(prev => ({ ...prev, [name]: value }));
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        if (!form.name.trim()) return;
        const newPatient = addPatient({ ...form, age: parseInt(form.age) || null, targetDays: parseInt(form.targetDays) || null });
        navigate(`/patient/${newPatient.id}`);
    };

    return (
        <div className="flex-1 overflow-y-auto p-4 md:p-6 lg:p-8 pb-20 lg:pb-8 animate-[fadeIn_0.3s_ease-out]">
            <div className="max-w-5xl mx-auto space-y-6">
                {/* Header */}
                <div>
                    <div className="flex items-center gap-3 mb-1">
                        <button onClick={() => navigate(-1)} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors flex-shrink-0">
                            <span className="material-symbols-outlined">arrow_back</span>
                        </button>
                        <h1 className="text-2xl md:text-3xl font-black text-slate-900 dark:text-slate-100 tracking-tight">Pasien Baru</h1>
                    </div>
                    <nav className="flex text-sm text-slate-500 gap-2 ml-12">
                        <span>Pasien</span><span>/</span><span className="text-primary font-medium">Tambah Baru</span>
                    </nav>
                </div>

                <form onSubmit={handleSubmit}>
                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
                        {/* Kolom Kiri */}
                        <div className="lg:col-span-8 space-y-6">
                            {/* Profil Pasien */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 lg:p-6">
                                <div className="flex flex-col sm:flex-row items-start gap-5 mb-6">
                                    <div className="size-16 sm:size-20 rounded-full bg-primary/10 flex items-center justify-center text-primary border-4 border-white dark:border-slate-800 shadow-sm flex-shrink-0">
                                        <span className="material-symbols-outlined text-2xl sm:text-3xl">person_add</span>
                                    </div>
                                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 flex-1 w-full">
                                        <div className="col-span-2 sm:col-span-3">
                                            <label className="text-xs text-slate-400 font-medium">Nama Lengkap *</label>
                                            <input type="text" name="name" value={form.name} onChange={handleChange} required placeholder="Masukkan nama lengkap"
                                                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm mt-1" />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-medium">Umur</label>
                                            <input type="number" name="age" value={form.age} onChange={handleChange} placeholder="Tahun"
                                                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm mt-1" />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-medium">Jenis Kelamin</label>
                                            <select name="gender" value={form.gender} onChange={handleChange}
                                                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm mt-1">
                                                <option value="male">Laki-laki</option><option value="female">Perempuan</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-medium">Golongan Darah</label>
                                            <select name="bloodType" value={form.bloodType} onChange={handleChange}
                                                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm mt-1">
                                                <option value="">Pilih</option><option value="A+">A+</option><option value="A-">A-</option>
                                                <option value="B+">B+</option><option value="B-">B-</option><option value="AB+">AB+</option>
                                                <option value="AB-">AB-</option><option value="O+">O+</option><option value="O-">O-</option>
                                            </select>
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-medium">Berat Badan (kg)</label>
                                            <input type="number" name="weight" value={form.weight} onChange={handleChange} placeholder="kg"
                                                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm mt-1" />
                                        </div>
                                        <div>
                                            <label className="text-xs text-slate-400 font-medium">Tinggi Badan (cm)</label>
                                            <input type="number" name="height" value={form.height} onChange={handleChange} placeholder="cm"
                                                className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm mt-1" />
                                        </div>
                                    </div>
                                </div>

                                {/* Tanda Vital */}
                                <h4 className="text-xs font-bold text-slate-500 uppercase tracking-wider mb-3">Tanda Vital</h4>
                                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
                                    {[
                                        { name: 'heartRate', label: 'Detak Jantung', unit: 'bpm', placeholder: '72' },
                                        { name: 'bloodPressure', label: 'Tekanan Darah', unit: 'mmHg', placeholder: '120/80' },
                                        { name: 'temperature', label: 'Suhu', unit: '°C', placeholder: '36.5' },
                                        { name: 'respRate', label: 'Frek. Napas', unit: '/min', placeholder: '16' },
                                        { name: 'spO2', label: 'SpO2', unit: '%', placeholder: '98' },
                                    ].map(v => (
                                        <div key={v.name} className="p-3 lg:p-4 bg-primary/5 dark:bg-primary/10 rounded-lg border border-primary/10">
                                            <p className="text-[10px] text-primary font-bold uppercase mb-1 truncate">{v.label}</p>
                                            <div className="flex items-baseline gap-1">
                                                <input type="text" name={v.name} value={form[v.name]} onChange={handleChange} placeholder={v.placeholder}
                                                    className="w-full bg-transparent border-none p-0 text-lg lg:text-xl font-bold focus:ring-0 text-slate-900 dark:text-white min-w-0" />
                                                <span className="text-[10px] text-slate-500 font-medium flex-shrink-0">{v.unit}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Catatan Klinis */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 flex justify-between items-center bg-slate-50/50 dark:bg-slate-800/50">
                                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Catatan Klinis</h3>
                                    <span className="material-symbols-outlined text-slate-400">edit_note</span>
                                </div>
                                <div className="p-5 lg:p-6 space-y-4">
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Keluhan Utama</label>
                                        <textarea name="chiefComplaint" value={form.chiefComplaint} onChange={handleChange} rows={3}
                                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 placeholder:text-slate-400 text-sm"
                                            placeholder="Pasien mengeluhkan batuk berkepanjangan dan kelelahan selama 3 hari..." />
                                    </div>
                                    <div>
                                        <label className="block text-sm font-semibold text-slate-700 dark:text-slate-300 mb-2">Riwayat Penyakit</label>
                                        <textarea name="medicalHistory" value={form.medicalHistory} onChange={handleChange} rows={2}
                                            className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 placeholder:text-slate-400 text-sm"
                                            placeholder="Riwayat penyakit terdahulu..." />
                                    </div>
                                </div>
                            </div>

                            {/* Diagnosis */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Diagnosis Kerja</h3>
                                </div>
                                <div className="p-5 lg:p-6">
                                    <input type="text" name="diagnosis" value={form.diagnosis} onChange={handleChange}
                                        className="w-full rounded-lg border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 focus:border-primary focus:ring-primary/20 text-sm"
                                        placeholder="cth. Community Acquired Pneumonia" />
                                </div>
                            </div>
                        </div>

                        {/* Kolom Kanan */}
                        <div className="lg:col-span-4 space-y-6">
                            {/* Detail Rawat Inap */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 overflow-hidden">
                                <div className="px-5 lg:px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/50">
                                    <h3 className="font-bold text-sm text-slate-800 dark:text-slate-100">Detail Rawat Inap</h3>
                                </div>
                                <div className="p-4 space-y-3">
                                    {[
                                        { label: 'Tanggal Masuk', name: 'admissionDate', type: 'date', value: form.admissionDate },
                                        { label: 'Target Sembuh (hari)', name: 'targetDays', type: 'number', value: form.targetDays, placeholder: '7' },
                                    ].map(field => (
                                        <div key={field.name} className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                            <p className="text-xs text-slate-400 font-medium mb-1">{field.label}</p>
                                            <input type={field.type} name={field.name} value={field.value} onChange={handleChange} placeholder={field.placeholder}
                                                className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0" />
                                        </div>
                                    ))}
                                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <p className="text-xs text-slate-400 font-medium mb-1">Kondisi Awal</p>
                                        <select name="condition" value={form.condition} onChange={handleChange}
                                            className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0">
                                            <option value="critical">Kritis</option><option value="urgent">Mendesak</option>
                                            <option value="stable">Stabil</option><option value="improving">Membaik</option>
                                        </select>
                                    </div>
                                    <div className="p-3 bg-slate-50 dark:bg-slate-800 rounded-lg border border-slate-100 dark:border-slate-700">
                                        <p className="text-xs text-slate-400 font-medium mb-1">Alergi</p>
                                        <input type="text" name="allergies" value={form.allergies} onChange={handleChange} placeholder="Obat, makanan, dll"
                                            className="w-full bg-transparent border-none p-0 text-sm font-semibold focus:ring-0" />
                                    </div>
                                </div>
                            </div>

                            {/* Tips */}
                            <div className="bg-primary/5 dark:bg-primary/10 rounded-xl border border-primary/20 p-5">
                                <h4 className="font-bold text-primary mb-2 flex items-center gap-2 text-sm">
                                    <span className="material-symbols-outlined text-lg">lightbulb</span>
                                    Tips
                                </h4>
                                <p className="text-sm text-slate-600 dark:text-slate-400 leading-relaxed">
                                    Setelah pasien disimpan, Anda dapat menambahkan gejala, pemeriksaan fisik, lab, dan resep obat di halaman detail pasien.
                                </p>
                            </div>

                            {/* Tombol Aksi */}
                            <div className="bg-white dark:bg-slate-900 rounded-xl shadow-sm border border-slate-200 dark:border-slate-800 p-5 space-y-3">
                                <button type="submit"
                                    className="w-full bg-slate-900 dark:bg-slate-100 text-white dark:text-slate-900 py-3 rounded-lg font-bold flex items-center justify-center gap-2 hover:opacity-90 transition-opacity text-sm">
                                    <span className="material-symbols-outlined text-xl">save</span>
                                    Simpan & Lanjutkan
                                </button>
                                <button type="button" onClick={() => navigate(-1)}
                                    className="w-full border border-slate-200 dark:border-slate-700 py-3 rounded-lg font-bold text-slate-600 dark:text-slate-400 flex items-center justify-center gap-2 hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors text-sm">
                                    Batal
                                </button>
                            </div>
                        </div>
                    </div>
                </form>
            </div>
        </div>
    );
}
