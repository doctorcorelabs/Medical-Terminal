import React, { useState } from 'react';
import { 
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    BarChart, Bar, Cell, PieChart, Pie,
    ScatterChart, Scatter, ZAxis
} from 'recharts';
import './ClinicalVisualization.css';

const ClinicalVisualization = ({ type, data, title, icon = 'analytics' }) => {
    
    const renderChart = () => {
        const height = type === 'radar' ? 380 : 250;
        const width = type === 'radar' ? 600 : '100%';

        switch(type) {
            case 'trend': // Lab vs Vitals
                return (
                    <ResponsiveContainer width={width} height={height}>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="time" fontSize={10} tickMargin={10} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="left" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis yAxisId="right" orientation="right" fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Line yAxisId="left" type="monotone" dataKey="vitals" stroke="#136dec" strokeWidth={3} dot={{ r: 4, fill: '#136dec' }} activeDot={{ r: 6 }} />
                            <Line yAxisId="right" type="monotone" dataKey="lab" stroke="#10b981" strokeWidth={3} dot={{ r: 4, fill: '#10b981' }} activeDot={{ r: 6 }} />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'radar': // Risk Radar
                return (
                    <ResponsiveContainer width={600} height={height}>
                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={data} margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                            <PolarGrid stroke="rgba(0,0,0,0.1)" />
                            <PolarAngleAxis dataKey="subject" fontSize={11} fontWeight={600} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} fontSize={10} />
                            <Radar name="Skor Risiko" dataKey="A" stroke="#136dec" fill="#136dec" fillOpacity={0.4} />
                            <Tooltip />
                        </RadarChart>
                    </ResponsiveContainer>
                );

            case 'heatmap': // Symptom Heatmap
                return (
                    <div className="heatmap-grid" style={{ gridTemplateColumns: `repeat(${data[0]?.cells?.length || 1}, 1fr)` }}>
                        {data.map((row, i) => (
                            row.cells.map((cell, j) => (
                                <div 
                                    key={`${i}-${j}`} 
                                    className="heatmap-cell" 
                                    style={{ backgroundColor: `rgba(19, 109, 236, ${cell.value / 10})` }}
                                    title={`${row.name}: ${cell.value}`}
                                />
                            ))
                        ))}
                    </div>
                );

            case 'gauge': // Vulnerability Gauge
                const gaugeValue = data[0]?.value || 0;
                const pieData = [{ value: gaugeValue }, { value: 100 - gaugeValue }];
                return (
                    <div className="gauge-container">
                        <ResponsiveContainer width="100%" height="100%">
                            <PieChart>
                                <Pie
                                    data={pieData}
                                    cx="50%"
                                    cy="100%"
                                    startAngle={180}
                                    endAngle={0}
                                    innerRadius={60}
                                    outerRadius={80}
                                    paddingAngle={0}
                                    dataKey="value"
                                >
                                    <Cell fill="#136dec" />
                                    <Cell fill="rgba(19, 109, 236, 0.1)" />
                                </Pie>
                            </PieChart>
                        </ResponsiveContainer>
                        <div className="gauge-value">
                            <span className="gauge-num">{gaugeValue}%</span>
                            <span className="gauge-label">Score</span>
                        </div>
                    </div>
                );

            case 'anatomy': // SVG Human Body Highlight
                return (
                    <svg viewBox="0 0 200 500" className="anatomy-svg">
                        <path className={`body-part ${data.includes('head') ? 'highlighted' : ''}`} d="M100,20c-15,0-25,10-25,25s10,25,25,25s25-10,25-25S115,20,100,20z" />
                        <rect className={`body-part ${data.includes('chest') ? 'highlighted' : ''}`} x="75" y="75" width="50" height="80" rx="10" />
                        <path className={`body-part ${data.includes('arms') ? 'highlighted' : ''}`} d="M70,80l-30,50l10,10l30-40V80z M130,80l30,50l-10,10l-30-40V80z" />
                        <path className={`body-part ${data.includes('legs') ? 'highlighted' : ''}`} d="M80,160l-15,120h20l5-120H80z M110,160l15,120h-20l-5-120H110z" />
                    </svg>
                );

            case 'simulation': // Drug Concentration
                return (
                    <ResponsiveContainer width={width} height={height}>
                        <AreaChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <defs>
                                <linearGradient id="colorConc" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#136dec" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#136dec" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Area type="monotone" dataKey="level" stroke="#136dec" fillOpacity={1} fill="url(#colorConc)" />
                        </AreaChart>
                    </ResponsiveContainer>
                );

            case 'comparison': // Lab Comparison % Delta
                return (
                    <ResponsiveContainer width={width} height={height}>
                        <BarChart data={data} layout="vertical" margin={{ top: 20, right: 30, left: 40, bottom: 20 }}>
                            <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} domain={['auto', 'auto']} />
                            <YAxis dataKey="name" type="category" width={100} fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Bar dataKey="delta" radius={[0, 4, 4, 0]}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.delta > 0 ? '#ef4444' : '#10b981'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                );

            case 'timeline': // Drug-Response Timeline
                return (
                    <ResponsiveContainer width={width} height={height}>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="vital" stroke="#136dec" strokeWidth={3} dot={{ r: 4 }} />
                            <Scatter yAxisId="left" data={data.filter(d => d.drug)} name="Obat" shape="star" fill="#ef4444" />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'forecast': // Recovery Forecast
                return (
                    <ResponsiveContainer width={width} height={height}>
                        <LineChart data={data} margin={{ top: 20, right: 30, left: 10, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} />
                            <Tooltip />
                            <Line type="monotone" dataKey="actual" stroke="#136dec" strokeWidth={3} />
                            <Line type="monotone" dataKey="forecast" stroke="#136dec" strokeDasharray="5 5" strokeOpacity={0.5} />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'outlier':
            case 'outliers': // Analisis Outlier Table
                return (
                    <div className="table-flow-container">
                        <table className="viz-table">
                            <thead>
                                <tr><th>Waktu</th><th>Param</th><th>Nilai</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {data && Array.isArray(data) && data.map((d, i) => (
                                    <tr key={i} className={d.outlier ? 'outlier-row' : ''}>
                                        <td>{d.time}</td>
                                        <td>{d.param}</td>
                                        <td>{d.value}</td>
                                        <td>{d.outlier ? 'Abnormal' : 'Normal'}</td>
                                    </tr>
                                ))}
                            </tbody>
                        </table>
                    </div>
                );

            case 'audit': // Clinical Audit Checklist
                return (
                    <div className="space-y-2 w-full">
                        {data && Array.isArray(data) && data.map((item, i) => (
                            <div key={i} className="flex items-center gap-3 p-3 bg-white/50 rounded-xl border border-slate-100 shadow-sm">
                                <span className={`material-symbols-outlined text-lg ${item.ok ? 'text-green-500' : 'text-red-500'}`}>
                                    {item.ok ? 'check_circle' : 'error'}
                                </span>
                                <span className="text-xs font-bold text-slate-700">{item.task}</span>
                                {!item.ok && <span className="ml-auto text-[9px] bg-red-50 text-red-600 px-2 py-0.5 rounded-full font-black">MISSING</span>}
                            </div>
                        ))}
                    </div>
                );

            case 'plan':
            case 'gantt': // Action Gantt
                return (
                    <div className="space-y-4 w-full p-2">
                        {data && Array.isArray(data) && data.map((item, i) => (
                            <div key={i} className="relative pl-6 border-l-2 border-primary/20">
                                <div className="absolute -left-[6px] top-1 w-3 h-3 rounded-full bg-primary border-2 border-white shadow-sm"></div>
                                <div className="text-[10px] font-black text-primary uppercase tracking-wider">{item.time}</div>
                                <div className="text-xs font-bold text-slate-800 mb-0.5">{item.action}</div>
                                <div className="text-[10px] text-slate-500 italic leading-snug">{item.desc}</div>
                            </div>
                        ))}
                    </div>
                );

            case 'dashboard': // Smart Filtering Dashboard
                return (
                    <div className="flex flex-wrap gap-2 p-1">
                        {data.map((btn, i) => (
                            <button key={i} className="px-4 py-2 bg-primary/10 hover:bg-primary/20 text-primary border border-primary/10 rounded-xl text-[10px] font-black transition-all active:scale-95">
                                {btn.label}
                            </button>
                        ))}
                    </div>
                );

            default:
                return (
                    <div className="text-slate-400 text-xs italic p-4 border border-dashed border-slate-200 rounded-xl text-center">
                        Tipe visualisasi "{type}" tidak didukung oleh sistem.
                    </div>
                );
        }
    };

    return (
        <div className="clinical-viz-container">
            <div className="viz-header">
                <div className="viz-header-left">
                    <span className="material-symbols-outlined viz-icon">{icon}</span>
                    <h4 className="viz-title">{title}</h4>
                </div>
            </div>
            <div className="viz-content">
                <div className="viz-canvas-wrapper">
                    {renderChart()}
                </div>
            </div>
        </div>
    );
};

export default ClinicalVisualization;
