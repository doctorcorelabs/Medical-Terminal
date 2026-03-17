import React, { useState, useRef, useEffect } from 'react';

export default function CustomSelect({ label, options, value, onChange, placeholder = 'Pilih...', icon }) {
    const [isOpen, setIsOpen] = useState(false);
    const containerRef = useRef(null);

    const selectedOption = options.find(opt => opt.v === value);

    useEffect(() => {
        const handleClickOutside = (event) => {
            if (containerRef.current && !containerRef.current.contains(event.target)) {
                setIsOpen(false);
            }
        };
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
    }, []);

    return (
        <div className="relative" ref={containerRef}>
            {label && <label className="block text-[10px] font-bold text-slate-400 uppercase mb-1 ml-1">{label}</label>}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full flex items-center justify-between px-3 py-2.5 bg-slate-50 border border-slate-100 rounded-xl text-sm font-semibold transition-all hover:bg-slate-100/50 ${isOpen ? 'ring-2 ring-primary/20 border-primary' : ''}`}
            >
                <div className="flex items-center gap-1.5 min-w-0 flex-1">
                    {icon && <span className="material-symbols-outlined text-[18px] text-slate-400 shrink-0">{icon}</span>}
                    <span className={`truncate ${selectedOption ? 'text-slate-900' : 'text-slate-400'}`}>
                        {selectedOption ? selectedOption.l : placeholder}
                    </span>
                </div>
                <span className={`material-symbols-outlined text-[20px] text-slate-400 transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}>
                    expand_more
                </span>
            </button>

            {isOpen && (
                <div className="absolute z-[100] w-full mt-1.5 bg-white border border-slate-100 rounded-xl shadow-xl py-1.5 animate-[slideUp_0.15s_ease-out]">
                    {options.map((opt) => (
                        <button
                            key={opt.v}
                            type="button"
                            onClick={() => {
                                onChange({ target: { name: opt.name, value: opt.v } });
                                setIsOpen(false);
                            }}
                            className={`w-full text-left px-4 py-2 text-sm transition-colors flex items-center justify-between ${value === opt.v ? 'bg-primary/5 text-primary font-bold' : 'text-slate-600 hover:bg-slate-50'}`}
                        >
                            <span>{opt.l}</span>
                            {value === opt.v && <span className="material-symbols-outlined text-[18px]">check</span>}
                        </button>
                    ))}
                </div>
            )}
        </div>
    );
}
