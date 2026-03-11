import React from 'react';

export default function BloodGroupPicker({ valueType = '', valueRhesus = '', onChangeType = () => {}, onChangeRhesus = () => {}, label }) {
    return (
        <div>
            {label && <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">{label}</label>}
            <div className="flex gap-2 items-center">
                <select value={valueType} onChange={e => onChangeType(e.target.value)} className="flex-1 rounded-xl border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm font-semibold transition-all py-2.5">
                    <option value="">-</option>
                    <option value="A">A</option>
                    <option value="B">B</option>
                    <option value="AB">AB</option>
                    <option value="O">O</option>
                </select>
                <select value={valueRhesus} onChange={e => onChangeRhesus(e.target.value)} className="w-24 rounded-xl border-slate-100 dark:border-slate-800 bg-slate-50 dark:bg-slate-900 focus:border-primary focus:ring-primary/20 text-sm font-semibold transition-all py-2.5">
                    <option value="">(no rhesus)</option>
                    <option value="+">+</option>
                    <option value="-">-</option>
                </select>
            </div>
        </div>
    );
}
