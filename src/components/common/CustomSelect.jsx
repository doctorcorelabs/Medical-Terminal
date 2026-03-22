import React, { useState, useRef, useEffect } from 'react';

export default function CustomSelect({
    label,
    options,
    value,
    onChange,
    placeholder = 'Pilih...',
    icon,
    labelIcon,
    containerClassName = '',
    labelClassName = '',
    buttonClassName = '',
}) {
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
        <div className={`relative space-y-2 ${containerClassName}`} ref={containerRef}>
            {label && (
                <label className={`text-[10px] font-bold text-slate-500 uppercase tracking-widest ml-1 min-h-5 flex items-center gap-1.5 ${labelClassName}`}>
                    {labelIcon && <span className="material-symbols-outlined text-[15px] opacity-80">{labelIcon}</span>}
                    {label}
                </label>
            )}
            <button
                type="button"
                onClick={() => setIsOpen(!isOpen)}
                className={`w-full h-12 flex items-center justify-between px-4 bg-white dark:bg-slate-900 border border-white dark:border-slate-700 rounded-2xl text-sm font-semibold text-slate-800 dark:text-slate-200 transition-all shadow-sm hover:shadow-md ${isOpen ? 'ring-4 ring-primary/10 border-primary/50' : ''} ${buttonClassName}`}
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
                <div className="absolute z-100 w-full mt-1.5 bg-white border border-slate-100 rounded-2xl shadow-xl py-1.5 animate-[slideUp_0.15s_ease-out]">
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
