const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src/pages/PatientDetail.jsx');
let content = fs.readFileSync(filePath, 'utf8');

// 1. Add canEditPatient
content = content.replace(
    /const \{ patients, updatePatient, addSymptom/g,
    'const { patients, canEditPatient, updatePatient, addSymptom'
);

// 2. Add ReadOnly Banner
const bannerCode = `
            {!canEditPatient && (
                <div className="bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 border border-red-200 dark:border-red-800/50 rounded-2xl p-4 flex items-start gap-3 shadow-sm mb-2">
                    <span className="material-symbols-outlined mt-0.5">lock</span>
                    <div>
                        <h3 className="font-bold text-sm">Mode Read-Only (Langganan Specialist Berakhir)</h3>
                        <p className="text-xs opacity-90 mt-0.5">Anda tidak dapat mengubah data medis Anda karena paket Specialist telah habis. Silakan perpanjang.</p>
                    </div>
                </div>
            )}
`;
content = content.replace(
    /\{\/\* Progress Pemulihan \*\/\}/,
    bannerCode + '\n            {/* Progress Pemulihan */}'
);

// 3. Tab Component props
const tabRenders = [
    '<TabRingkasan patient={patient} navigate={navigate} updatePatient={updatePatient} canEditPatient={canEditPatient} />',
    '<TabVitalSigns patient={patient}\n                onAdd={(vitals) => addVitalSign(patient.id, vitals)}\n                onUpdate={(vsId, updates) => updateVitalSign(patient.id, vsId, updates)}\n                onRemove={(vsId) => removeVitalSign(patient.id, vsId)} canEditPatient={canEditPatient} />',
    '<TabGejala patient={patient} input={symptomInput} setInput={setSymptomInput}\n                onAdd={(e) => { e.preventDefault(); if (!symptomInput.name.trim()) return; addSymptom(patient.id, { ...symptomInput, recordedAt: symptomInput.recordedAt ? new Date(symptomInput.recordedAt).toISOString() : new Date().toISOString() }); setSymptomInput({ name: \'\', severity: \'sedang\', notes: \'\', recordedAt: getNowLocalISO() }); }}\n                onRemove={(symptomId) => removeSymptom(patient.id, symptomId)}\n                onUpdate={(symptomId, updates) => updateSymptom(patient.id, symptomId, updates)}\n                onAI={() => callAI(\'symptoms\', () => getSymptomInsight((patient.symptoms || []).map(s => s.name), \`\${patient.name}, \${patient.age} tahun\`))}\n                aiResult={aiResults.symptoms} aiLoading={aiLoading.symptoms} canEditPatient={canEditPatient} />',
    '<TabDataUmum judul="Pemeriksaan Fisik" storageKey="physical" items={patient.physicalExams || []} input={examInput} setInput={setExamInput}\n                fields={[\n                    { key: \'system\', type: \'select\', label: \'Sistem\', options: [\'umum\', \'kepala\', \'leher\', \'thorax\', \'abdomen\', \'ekstremitas\', \'neurologis\', \'kulit\'] },\n                    { key: \'findings\', type: \'textarea\', label: \'Temuan\', placeholder: \'Temuan pemeriksaan fisik...\' },\n                ]}\n                onAdd={(e) => { e.preventDefault(); if (!examInput.findings.trim()) return; addPhysicalExam(patient.id, { ...examInput, date: examInput.date ? new Date(examInput.date).toISOString() : new Date().toISOString() }); setExamInput({ findings: \'\', system: \'umum\', date: getNowLocalISO() }); }}\n                onRemove={(examId) => removePhysicalExam(patient.id, examId)}\n                onUpdate={(examId, updates) => updatePhysicalExam(patient.id, examId, updates)}\n                renderItem={(item) => <><span className="text-xs font-bold text-primary uppercase">{item.system}</span><p className="text-sm text-slate-600 dark:text-slate-400 mt-1">{item.findings}</p></>}\n                onAI={() => callAI(\'physical\', () => getPhysicalExamInsight((patient.physicalExams || []).map(e => e.findings).join(\'; \'), (patient.symptoms || []).map(s => s.name).join(\', \')))}\n                aiResult={aiResults.physical} aiLoading={aiLoading.physical} canEditPatient={canEditPatient} />',
    '<TabLab patient={patient} input={labInput} setInput={setLabInput}\n                onAdd={(e) => { e.preventDefault(); if (!labInput.testName.trim() && labInput.labKey !== \'custom\') return; addSupportingExam(patient.id, { type: \'lab\', ...labInput, date: labInput.date ? new Date(labInput.date).toISOString() : new Date().toISOString(), result: checkLabValue(labInput.labKey, labInput.value, patient.gender) }); setLabInput({ testName: \'\', value: \'\', unit: \'\', labKey: \'\', date: getNowLocalISO() }); }}\n                onRemove={(examId) => removeSupportingExam(patient.id, examId)}\n                onUpdate={(examId, updates) => updateSupportingExam(patient.id, examId, updates)}\n                onAI={() => callAI(\'labs\', () => getSupportingExamInsight((patient.supportingExams || []).map(e => \`\${e.testName}: \${e.value} \${e.unit}\`).join(\', \'), patient.diagnosis || \'\'))}\n                aiResult={aiResults.labs} aiLoading={aiLoading.labs} canEditPatient={canEditPatient} />',
    '<TabObat patient={patient} input={prescInput} setInput={setPrescInput}\n                onAdd={(e) => { e.preventDefault(); if (!prescInput.name.trim()) return; addPrescription(patient.id, { ...prescInput, date: prescInput.date ? new Date(prescInput.date).toISOString() : new Date().toISOString() }); setPrescInput({ name: \'\', dosage: \'\', frequency: \'\', route: \'oral\', date: getNowLocalISO(), fornas_source: false, fornas_form: \'\', fornas_category: \'\' }); }}\n                onRemove={(prescId) => removePrescription(patient.id, prescId)}\n                onUpdate={(prescId, updates) => updatePrescription(patient.id, prescId, updates)}\n                onAI={() => callAI(\'drugs\', () => getMedicationRecommendation(patient.diagnosis, (patient.symptoms || []).map(s => s.name).join(\', \')))}\n                aiResult={aiResults.drugs} aiLoading={aiLoading.drugs} canEditPatient={canEditPatient} />',
    '<TabLaporan patient={patient} input={reportInput} setInput={setReportInput}\n                onAdd={(e) => { e.preventDefault(); if (!reportInput.notes.trim()) return; addDailyReport(patient.id, { ...reportInput, date: reportInput.date ? new Date(reportInput.date).toISOString() : new Date().toISOString() }); if (reportInput.condition) updatePatient(patient.id, { condition: reportInput.condition }); setReportInput({ notes: \'\', condition: \'\', date: getNowLocalISO() }); }}\n                onRemove={(reportId) => removeDailyReport(patient.id, reportId)}\n                onUpdate={(reportId, updates) => updateDailyReport(patient.id, reportId, updates)}\n                onAI={() => { const r = patient.dailyReports || []; callAI(\'daily\', () => getDailyEvaluation(r[r.length - 1] || {}, r[r.length - 2] || {})); }}\n                aiResult={aiResults.daily} aiLoading={aiLoading.daily} canEditPatient={canEditPatient} />',
    '<TabAI patient={patient} callAI={callAI} aiResults={aiResults} aiLoading={aiLoading} onSaveAI={handleSaveAI} canEditPatient={canEditPatient} />'
];
content = content.replace(/<TabRingkasan[^>]*\/>/, tabRenders[0]);
content = content.replace(/<TabVitalSigns[^>]*\/>/, tabRenders[1]);
content = content.replace(/<TabGejala[^>]*\/>/, tabRenders[2]);
content = content.replace(/<TabDataUmum[^>]*\/>/, tabRenders[3]);
content = content.replace(/<TabLab[^>]*\/>/, tabRenders[4]);
content = content.replace(/<TabObat[^>]*\/>/, tabRenders[5]);
content = content.replace(/<TabLaporan[^>]*\/>/, tabRenders[6]);
content = content.replace(/<TabAI[^>]*\/>/, tabRenders[7]);

// 4. Tab Signatures
content = content.replace(/function TabRingkasan\(\{ patient, navigate: _navigate, updatePatient \}\)/, 'function TabRingkasan({ patient, navigate: _navigate, updatePatient, canEditPatient })');
content = content.replace(/function TabVitalSigns\(\{ patient, onAdd, onUpdate, onRemove \}\)/, 'function TabVitalSigns({ patient, onAdd, onUpdate, onRemove, canEditPatient })');
content = content.replace(/function TabGejala\(\{ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading \}\)/, 'function TabGejala({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient })');
content = content.replace(/function TabDataUmum\(\{ judul, storageKey, items, input, setInput, fields, onAdd, onRemove, onUpdate, renderItem, onAI, aiResult, aiLoading \}\)/, 'function TabDataUmum({ judul, storageKey, items, input, setInput, fields, onAdd, onRemove, onUpdate, renderItem, onAI, aiResult, aiLoading, canEditPatient })');
content = content.replace(/function TabLab\(\{ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading \}\)/, 'function TabLab({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient })');
content = content.replace(/function TabObat\(\{ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading \}\)/, 'function TabObat({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient })');
content = content.replace(/function TabLaporan\(\{ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading \}\)/, 'function TabLaporan({ patient, input, setInput, onAdd, onRemove, onUpdate, onAI, aiResult, aiLoading, canEditPatient })');
content = content.replace(/function TabAI\(\{ patient, callAI, aiResults, aiLoading, onSaveAI \}\)/, 'function TabAI({ patient, callAI, aiResults, aiLoading, onSaveAI, canEditPatient })');

// 5. Hide forms if !canEditPatient. We wrap <form> elements with {canEditPatient && <form> ... </form>}
content = content.replace(
    /(<form onSubmit=\{handleAdd\}[\s\S]*?<\/form>)/g,
    '{canEditPatient && ($1)}'
);
content = content.replace(
    /className="p-1\.5 rounded-lg text-slate-400 hover:text-primary hover:bg-primary\/5 transition-colors border border-transparent hover:border-primary\/20"/g,
    'className={`p-1.5 rounded-lg transition-colors border border-transparent ${canEditPatient ? \'text-slate-400 hover:text-primary hover:bg-primary/5 hover:border-primary/20\' : \'text-slate-300 cursor-not-allowed opacity-50\'}`} disabled={!canEditPatient}'
);

fs.writeFileSync(filePath, content, 'utf8');
console.log('Successfully replaced PatientDetail.jsx tabs and added forms protection.');
