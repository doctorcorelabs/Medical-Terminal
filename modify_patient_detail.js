const fs = require('fs');
let content = fs.readFileSync('src/pages/PatientDetail.jsx', 'utf8');

// Fix TabGejala main form input
content = content.replace(
    /\<textarea value=\{input\.name\} onChange=\{e \=\> setInput\(p \=\> \(\{ \.\.\.p, name: e\.target\.value \}\)\)\} rows=\{1\} required placeholder="Nama gejala \(cth\. Demam, Batuk, Nyeri Dada\)"[\s\S]*?className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary\/50 focus:ring-4 focus:ring-primary\/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all resize-none shadow-sm px-4 py-4 placeholder:text-slate-400" \/\>/,
    `<input type="text" value={input.name} onChange={e => setInput(p => ({ ...p, name: e.target.value }))} required placeholder="Nama gejala (cth. Demam, Sesak)"
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all shadow-sm px-4 py-3.5 placeholder:text-slate-400" />`
);

// Fix TabGejala main form notes
content = content.replace(
    /\<textarea value=\{input\.notes \|\| ''\} onChange=\{e \=\> setInput\(p \=\> \(\{ \.\.\.p, notes: e\.target\.value \}\)\)\} rows=\{2\} placeholder="Catatan \/ Penjelasan gejala \(opsional\)"[\s\S]*?className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary\/50 focus:ring-4 focus:ring-primary\/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all resize-none shadow-sm px-4 py-4 placeholder:text-slate-400 leading-relaxed" \/\>/,
    `<textarea value={input.notes || ''} onChange={e => setInput(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Catatan penyakit (opsional)"
                                        className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 font-semibold text-slate-800 dark:text-slate-200 text-sm transition-all resize-none shadow-sm px-4 py-3.5 placeholder:text-slate-400 leading-relaxed" />`
);

// Fix TabGejala inline editing form input
content = content.replace(
    /\<textarea value=\{editData\.name\} onChange=\{e \=\> setEditData\(p \=\> \(\{ \.\.\.p, name: e\.target\.value \}\)\)\} rows=\{1\} placeholder="Nama gejala"[\s\S]*?className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary\/50 focus:ring-4 focus:ring-primary\/10 text-sm font-semibold transition-all resize-none shadow-sm px-4 py-3" \/\>/,
    `<input type="text" value={editData.name} onChange={e => setEditData(p => ({ ...p, name: e.target.value }))} placeholder="Nama gejala (cth. Demam, Sesak)"
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-sm px-4 py-3.5 placeholder:text-slate-400" />`
);

// Fix TabGejala inline editing form notes
content = content.replace(
    /\<textarea value=\{editData\.notes \|\| ''\} onChange=\{e \=\> setEditData\(p \=\> \(\{ \.\.\.p, notes: e\.target\.value \}\)\)\} rows=\{2\} placeholder="Catatan \/ Penjelasan gejala \(opsional\)"[\s\S]*?className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary\/50 focus:ring-4 focus:ring-primary\/10 text-sm font-semibold transition-all resize-none shadow-sm px-4 py-3" \/\>/,
    `<textarea value={editData.notes || ''} onChange={e => setEditData(p => ({ ...p, notes: e.target.value }))} rows={2} placeholder="Catatan penyakit (opsional)"
                                                    className="w-full rounded-2xl border border-white dark:border-slate-700 bg-white dark:bg-slate-900 focus:border-primary/50 focus:ring-4 focus:ring-primary/10 text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all resize-none shadow-sm px-4 py-3.5 placeholder:text-slate-400 leading-relaxed" />`
);

// Replace severity buttons in main form to match AddPatient.jsx exactly
const severityMainRegex = /\<div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl gap-1 border border-slate-200 dark:border-slate-800"\>[\s\S]*?\]\.map\(opt \=\> \([\s\S]*?\<button key=\{opt\.v\}[\s\S]*?className=\{`flex-1 py-1\.5 text-\[10px\] uppercase font-black tracking-wider rounded-lg transition-all border \$\{input\.severity === opt\.v \? `\$\{opt\.c\} shadow-sm scale-\[1\.02\]` : 'text-slate-500 border-transparent hover:text-slate-700'\}`\}\>[\s\S]*?\{opt\.l\}[\s\S]*?\<\/button\>[\s\S]*?\)\)[\s\S]*?\<\/div\>/;
const severityReplacement = `<div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl gap-1 border border-slate-100 dark:border-slate-800">
                                        {[{ v: 'ringan', l: 'Ringan' }, { v: 'sedang', l: 'Sedang' }, { v: 'berat', l: 'Berat' }].map(opt => (
                                            <button key={opt.v} type="button" onClick={() => setInput(p => ({ ...p, severity: opt.v }))}
                                                className={\`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all \${input.severity === opt.v ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}\`}>
                                                {opt.l}
                                            </button>
                                        ))}
                                    </div>`;
content = content.replace(severityMainRegex, severityReplacement);

// Same for inline editing severity buttons
const editSeverityRegex = /\<div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl gap-1 border border-slate-200 dark:border-slate-800"\>[\s\S]*?\]\.map\(opt \=\> \([\s\S]*?\<button key=\{opt\.v\} type="button" onClick=\{\(\) \=\> setEditData\(p \=\> \(\{ \.\.\.p, severity: opt\.v \}\)\)\}[\s\S]*?className=\{`flex-1 py-1\.5 text-\[10px\] uppercase font-black tracking-wider rounded-lg transition-all border \$\{editData\.severity === opt\.v \? `\$\{opt\.c\} shadow-sm scale-\[1\.02\]` : 'text-slate-500 border-transparent hover:text-slate-700'\}`\}\>[\s\S]*?\{opt\.l\}[\s\S]*?\<\/button\>[\s\S]*?\)\)[\s\S]*?\<\/div\>/;
const editSeverityReplacement = `<div className="flex p-1 bg-slate-50 dark:bg-slate-950 rounded-xl gap-1 border border-slate-100 dark:border-slate-800">
                                                        {[{ v: 'ringan', l: 'Ringan' }, { v: 'sedang', l: 'Sedang' }, { v: 'berat', l: 'Berat' }].map(opt => (
                                                            <button key={opt.v} type="button" onClick={() => setEditData(p => ({ ...p, severity: opt.v }))}
                                                                className={\`flex-1 py-2 text-xs font-black uppercase tracking-wider rounded-lg transition-all \${editData.severity === opt.v ? 'bg-primary text-white shadow-md' : 'text-slate-500 hover:text-slate-700'}\`}>
                                                                {opt.l}
                                                            </button>
                                                        ))}
                                                    </div>`;
content = content.replace(editSeverityRegex, editSeverityReplacement);

fs.writeFileSync('src/pages/PatientDetail.jsx', content);
console.log("Updated PatientDetail.jsx");
