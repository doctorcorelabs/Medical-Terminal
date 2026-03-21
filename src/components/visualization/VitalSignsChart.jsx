import { useState, useMemo } from 'react';
import {
    LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
    ResponsiveContainer,
} from 'recharts';

const METRICS = [
    { key: 'heartRate', label: 'Detak Jantung', unit: 'bpm', color: '#ef4444' },
    { key: 'systolic', label: 'TD Sistolik', unit: 'mmHg', color: '#3b82f6' },
    { key: 'diastolic', label: 'TD Diastolik', unit: 'mmHg', color: '#7dd3fc' },
    { key: 'temperature', label: 'Suhu', unit: '°C', color: '#f97316' },
    { key: 'respRate', label: 'Frek. Napas', unit: '/min', color: '#22c55e' },
    { key: 'spO2', label: 'SpO2', unit: '%', color: '#a855f7' },
];

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'Mei', 'Jun', 'Jul', 'Ags', 'Sep', 'Okt', 'Nov', 'Des'];

function formatAxisDate(isoString) {
    if (!isoString) return '';
    const d = new Date(isoString);
    return `${d.getDate()} ${MONTHS[d.getMonth()]} ${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

function CustomTooltip({ active, payload, label }) {
    if (!active || !payload?.length) return null;
    return (
        <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-xl shadow-lg p-3 text-xs min-w-37.5">
            <p className="font-bold text-slate-700 dark:text-slate-200 mb-2">{label}</p>
            {payload.map(entry => {
                const m = METRICS.find(m => m.key === entry.dataKey);
                if (entry.value == null) return null;
                return (
                    <div key={entry.dataKey} className="flex items-center gap-2 py-0.5">
                        <span className="size-2 rounded-full shrink-0" style={{ backgroundColor: entry.color }} />
                        <span className="text-slate-500 flex-1">{m?.label || entry.dataKey}</span>
                        <span className="font-bold text-slate-800 dark:text-slate-100">{entry.value} <span className="font-normal text-slate-400">{m?.unit}</span></span>
                    </div>
                );
            })}
        </div>
    );
}

export default function VitalSignsChart({ vitalSigns }) {
    const [activeMetrics, setActiveMetrics] = useState(['heartRate', 'systolic', 'diastolic', 'spO2']);

    const data = useMemo(() => {
        return [...(vitalSigns || [])]
            .sort((a, b) => new Date(a.recordedAt) - new Date(b.recordedAt))
            .map(vs => {
                const parts = (vs.bloodPressure || '').split('/');
                const systolic = parts[0] && !isNaN(Number(parts[0])) ? Number(parts[0]) : null;
                const diastolic = parts[1] && !isNaN(Number(parts[1])) ? Number(parts[1]) : null;
                return {
                    label: formatAxisDate(vs.recordedAt),
                    heartRate: vs.heartRate != null && vs.heartRate !== '' ? Number(vs.heartRate) : null,
                    systolic,
                    diastolic,
                    temperature: vs.temperature != null && vs.temperature !== '' ? Number(vs.temperature) : null,
                    respRate: vs.respRate != null && vs.respRate !== '' ? Number(vs.respRate) : null,
                    spO2: vs.spO2 != null && vs.spO2 !== '' ? Number(vs.spO2) : null,
                };
            });
    }, [vitalSigns]);

    const toggleMetric = (key) => {
        setActiveMetrics(prev =>
            prev.includes(key) ? prev.filter(k => k !== key) : [...prev, key]
        );
    };

    if (!vitalSigns || vitalSigns.length < 2) {
        return (
            <div className="flex flex-col items-center justify-center py-10 text-center">
                <span className="material-symbols-outlined text-4xl text-slate-300 dark:text-slate-600 mb-2">show_chart</span>
                <p className="text-sm font-semibold text-slate-400">Butuh minimal 2 data untuk menampilkan tren</p>
                <p className="text-xs text-slate-400 mt-1">Tambahkan data vital signs di tab <strong className="text-primary">Vital</strong></p>
            </div>
        );
    }

    return (
        <div className="space-y-3">
            {/* Toggle buttons */}
            <div className="flex flex-wrap gap-1.5">
                {METRICS.map(m => (
                    <button
                        key={m.key}
                        type="button"
                        onClick={() => toggleMetric(m.key)}
                        className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full text-[11px] font-bold border transition-all ${
                            activeMetrics.includes(m.key)
                                ? 'text-white border-transparent shadow-sm'
                                : 'bg-white dark:bg-slate-800 text-slate-500 border-slate-200 dark:border-slate-600 opacity-60'
                        }`}
                        style={activeMetrics.includes(m.key) ? { backgroundColor: m.color, borderColor: m.color } : {}}
                    >
                        <span className="size-2 rounded-full inline-block shrink-0" style={{ backgroundColor: m.color }} />
                        {m.label}
                    </button>
                ))}
            </div>

            {/* Chart */}
            <ResponsiveContainer width="100%" height={260} minWidth={0}>
                <LineChart data={data} margin={{ top: 5, right: 10, left: -15, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.6} />
                    <XAxis
                        dataKey="label"
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        interval="preserveStartEnd"
                    />
                    <YAxis
                        tick={{ fontSize: 10, fill: '#94a3b8' }}
                        tickLine={false}
                        axisLine={false}
                        width={34}
                    />
                    <Tooltip content={<CustomTooltip />} />
                    {METRICS.filter(m => activeMetrics.includes(m.key)).map(m => (
                        <Line
                            key={m.key}
                            type="monotone"
                            dataKey={m.key}
                            stroke={m.color}
                            strokeWidth={2}
                            dot={{ r: 3, fill: m.color, strokeWidth: 0 }}
                            activeDot={{ r: 5, strokeWidth: 0 }}
                            connectNulls
                        />
                    ))}
                </LineChart>
            </ResponsiveContainer>
        </div>
    );
}
