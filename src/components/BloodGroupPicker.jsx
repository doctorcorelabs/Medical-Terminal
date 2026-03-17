import React from 'react';
import CustomSelect from './common/CustomSelect';

export default function BloodGroupPicker({ valueType = '', valueRhesus = '', onChangeType = () => {}, onChangeRhesus = () => {}, label }) {
    const typeOptions = [
        { v: '', l: '-' },
        { v: 'A', l: 'A' },
        { v: 'B', l: 'B' },
        { v: 'AB', l: 'AB' },
        { v: 'O', l: 'O' }
    ];

    const rhesusOptions = [
        { v: '', l: '(no rhesus)' },
        { v: '+', l: '+' },
        { v: '-', l: '-' }
    ];

    return (
        <div>
            {label && <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">{label}</label>}
            <div className="flex gap-2.5 items-center">
                <div className="w-20 shrink-0">
                    <CustomSelect 
                        options={typeOptions} 
                        value={valueType} 
                        onChange={(e) => onChangeType(e.target.value)} 
                        placeholder="Gol"
                    />
                </div>
                <div className="flex-1 min-w-0">
                    <CustomSelect 
                        options={rhesusOptions} 
                        value={valueRhesus} 
                        onChange={(e) => onChangeRhesus(e.target.value)} 
                        placeholder="Rhesus"
                    />
                </div>
            </div>
        </div>
    );
}
