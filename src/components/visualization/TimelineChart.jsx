import { useMemo } from 'react';
import { formatDateTime } from '../../services/dataService';

const severityColors = {
    ringan: '#10b981',
    sedang: '#f59e0b',
    berat: '#ef4444',
};

export default function TimelineChart({ symptoms, admissionDate }) {
    const sortedSymptoms = useMemo(() => {
        return [...(symptoms || [])].sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt));
    }, [symptoms]);

    if (!sortedSymptoms.length) {
        return <p className="text-sm text-slate-400 text-center py-4">Belum ada data timeline</p>;
    }

    return (
        <div className="relative">
            {/* Timeline line */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-[#e2e8f0] dark:bg-[#2d3a4a]" />

            {/* Admission marker */}
            {admissionDate && (
                <div className="relative flex items-center gap-4 mb-4 pl-4">
                    <div className="absolute left-[11px] w-3 h-3 rounded-full bg-[#136dec] border-2 border-white dark:border-[#1a2332] z-10" />
                    <div className="ml-6 p-2 bg-[#136dec]/10 rounded-lg border border-[#136dec]/20">
                        <p className="text-xs font-bold text-[#136dec]">Tanggal Masuk</p>
                        <p className="text-[10px] text-slate-500">{formatDateTime(admissionDate)}</p>
                    </div>
                </div>
            )}

            {/* Symptom entries */}
            <div className="space-y-3">
                {sortedSymptoms.map((symptom, index) => {
                    const color = severityColors[symptom.severity] || severityColors.sedang;
                    return (
                        <div key={symptom.id || index} className="relative flex items-start gap-4 pl-4 animate-[slideIn_0.3s_ease-out]" style={{ animationDelay: `${index * 50}ms` }}>
                            <div
                                className="absolute left-[11px] w-3 h-3 rounded-full border-2 border-white dark:border-[#1a2332] z-10"
                                style={{ backgroundColor: color }}
                            />
                            <div className="ml-6 flex-1 p-3 rounded-xl bg-slate-50 dark:bg-[#1e2a3a] hover:bg-slate-100 dark:hover:bg-[#253347] transition-colors">
                                <div className="flex items-center justify-between gap-2">
                                    <div className="flex items-center gap-2">
                                        <span className="text-sm font-bold">{symptom.name}</span>
                                        <span
                                            className="text-[9px] font-bold uppercase px-1.5 py-0.5 rounded-full"
                                            style={{ backgroundColor: `${color}20`, color }}
                                        >
                                            {symptom.severity}
                                        </span>
                                    </div>
                                    <span className="text-[10px] text-slate-400 flex-shrink-0">{formatDateTime(symptom.recordedAt)}</span>
                                </div>
                                {symptom.notes && (
                                    <p className="text-xs text-slate-500 mt-1">{symptom.notes}</p>
                                )}
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
