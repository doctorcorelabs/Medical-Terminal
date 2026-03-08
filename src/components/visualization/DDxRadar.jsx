import { useMemo } from 'react';
import { Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ResponsiveContainer, Tooltip } from 'recharts';
import { parseAIDiagnoses } from '../../services/dataService';

// Custom label renderer - wraps long labels into 2 lines, no truncation
const CustomTick = ({ payload, x, y, cx, cy }) => {
    const label = payload.value;
    const maxCharsPerLine = 13;
    const words = label.split(' ');
    const lines = [];
    let currentLine = '';

    words.forEach(word => {
        const test = currentLine ? currentLine + ' ' + word : word;
        if (test.length <= maxCharsPerLine) {
            currentLine = test;
        } else {
            if (currentLine) lines.push(currentLine);
            currentLine = word;
        }
    });
    if (currentLine) lines.push(currentLine);

    // Determine text anchor based on x position relative to center
    const relX = x - cx;
    const textAnchor = relX > 10 ? 'start' : relX < -10 ? 'end' : 'middle';

    // Push label outward from center
    const angle = Math.atan2(y - cy, x - cx);
    const pushOut = 10;
    const lx = x + Math.cos(angle) * pushOut;
    const ly = y + Math.sin(angle) * pushOut;

    const lineHeight = 13;
    const totalHeight = (lines.length - 1) * lineHeight;

    return (
        <text
            x={lx}
            y={ly - totalHeight / 2}
            textAnchor={textAnchor}
            fill="#475569"
            fontSize={10}
            fontWeight={600}
        >
            {lines.map((line, i) => (
                <tspan key={i} x={lx} dy={i === 0 ? 0 : lineHeight}>
                    {line}
                </tspan>
            ))}
        </text>
    );
};

export default function DDxRadar({ symptoms, aiResult }) {
    const data = useMemo(() => {
        if (!symptoms || symptoms.length === 0) return [];

        // HANYA tampilkan data dari AI — tidak ada dummy
        if (aiResult) {
            const aiData = parseAIDiagnoses(aiResult);
            if (aiData && aiData.length > 0) {
                return aiData.slice(0, 8).map(d => ({
                    diagnosis: d.diagnosis,
                    probability: d.probability,
                    fullMark: 100
                }));
            }
        }

        // Jika belum ada AI result: kembalikan array kosong (placeholder)
        return [];
    }, [symptoms, aiResult]);

    // State: belum ada AI result sama sekali
    if (!aiResult) {
        return (
            <div className="flex flex-col items-center justify-center h-75 gap-3">
                <span className="material-symbols-outlined text-4xl text-slate-300">radar</span>
                <p className="text-sm text-slate-400 text-center">
                    Klik <span className="font-bold text-primary">Diagnosis Banding</span> di atas untuk<br />
                    menghasilkan visualisasi radar AI.
                </p>
            </div>
        );
    }

    // State: ada AI result tapi parser gagal (format tidak terbaca)
    if (data.length === 0) {
        return <p className="text-sm text-slate-400 text-center py-8">Radar tidak tersedia — format DDx dari AI tidak terbaca.</p>;
    }

    return (
        <div className="w-full h-100 md:h-110">
            <ResponsiveContainer width="100%" height="100%">
                <RadarChart data={data} cx="50%" cy="50%" outerRadius="52%" margin={{ top: 30, right: 60, bottom: 30, left: 60 }}>
                    <PolarGrid stroke="#e2e8f0" />
                    <PolarAngleAxis
                        dataKey="diagnosis"
                        tick={<CustomTick />}
                    />
                    <PolarRadiusAxis
                        angle={90}
                        domain={[0, 100]}
                        tick={{ fontSize: 8, fill: '#94a3b8' }}
                        tickCount={5}
                    />
                    <Radar
                        name="Probabilitas"
                        dataKey="probability"
                        stroke="#136dec"
                        fill="#136dec"
                        fillOpacity={0.25}
                        strokeWidth={2}
                    />
                    <Tooltip
                        contentStyle={{
                            background: '#1a2332',
                            border: '1px solid #2d3a4a',
                            borderRadius: '12px',
                            padding: '8px 12px',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.2)',
                        }}
                        labelStyle={{ color: '#fff', fontWeight: 700, fontSize: 12 }}
                        itemStyle={{ color: '#93c5fd', fontSize: 11 }}
                        formatter={(value) => [`${value}%`, 'Probabilitas']}
                    />
                </RadarChart>
            </ResponsiveContainer>
        </div>
    );
}
