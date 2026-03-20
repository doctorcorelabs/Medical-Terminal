import React, { useState } from 'react';
import { 
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, 
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    BarChart, Bar, Cell, PieChart, Pie,
    ScatterChart, Scatter, ZAxis
} from 'recharts';
import './ClinicalVisualization.css';

const ClinicalVisualization = ({ type, data, title, icon = 'analytics', vizId, exportChartKey, exportChartType }) => {
    const [activeDashboardFilter, setActiveDashboardFilter] = useState(null);

    const safeArray = Array.isArray(data) ? data : [];

    const normalizeHeatmapRows = (rows) => {
        if (!Array.isArray(rows)) return [];
        const normalized = rows
            .map((row) => {
                if (!row || typeof row !== 'object') return null;
                const cells = Array.isArray(row.cells)
                    ? row.cells
                        .map((cell) => {
                            const value = Number(cell?.value);
                            if (!Number.isFinite(value)) return null;
                            return {
                                value: Math.max(0, Math.min(10, value)),
                                label: cell?.label || cell?.time || cell?.name || null,
                            };
                        })
                        .filter(Boolean)
                    : [];
                if (cells.length === 0) return null;
                return {
                    name: row.name || row.label || 'Item',
                    cells,
                };
            })
            .filter(Boolean);
        return normalized;
    };

    const normalizeOutlierRows = (rows) => {
        if (!Array.isArray(rows)) return [];
        return rows
            .map((entry) => {
                if (!entry || typeof entry !== 'object') return null;
                const value = Number(entry.value);
                return {
                    time: entry.time || '-',
                    param: entry.param || '-',
                    value: Number.isFinite(value) ? value : entry.value || '-',
                    outlier: Boolean(entry.outlier),
                };
            })
            .filter(Boolean);
    };
    
    const renderChart = () => {
        const height = type === 'radar' ? 380 : 250;
        const scrollableTypes = ['trend', 'simulation', 'timeline', 'forecast'];
        const width = (type === 'radar' || scrollableTypes.includes(type)) ? (type === 'radar' ? 600 : 800) : '100%';

        switch(type) {
            case 'trend': // Lab vs Vitals
                return (
                    <ResponsiveContainer width={width} height={height + 50}>
                        <LineChart data={data} margin={{ top: 20, right: 20, left: 5, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis 
                                dataKey="time" 
                                fontSize={10} 
                                tickMargin={10} 
                                axisLine={false} 
                                tickLine={false}
                                padding={{ left: 40, right: 40 }}
                            />
                            <YAxis 
                                yAxisId="left" 
                                fontSize={10} 
                                axisLine={false} 
                                tickLine={false} 
                                width={40}
                            />
                            <YAxis 
                                yAxisId="right" 
                                orientation="right" 
                                fontSize={10} 
                                axisLine={false} 
                                tickLine={false} 
                                width={40}
                            />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Line 
                                yAxisId="left" 
                                type="monotone" 
                                dataKey="vitals" 
                                stroke="#136dec" 
                                strokeWidth={2.5} 
                                dot={{ r: 3.5, fill: '#fff', stroke: '#136dec', strokeWidth: 2 }} 
                                activeDot={{ r: 5 }} 
                                connectNulls
                            />
                            <Line 
                                yAxisId="right" 
                                type="monotone" 
                                dataKey="lab" 
                                stroke="#10b981" 
                                strokeWidth={2.5} 
                                dot={{ r: 3.5, fill: '#fff', stroke: '#10b981', strokeWidth: 2 }} 
                                activeDot={{ r: 5 }} 
                                connectNulls
                            />
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
                const heatmapRows = normalizeHeatmapRows(safeArray);
                if (heatmapRows.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data heatmap belum tersedia atau format tidak valid.
                        </div>
                    );
                }

                const limitedRows = heatmapRows.slice(0, 8);
                const maxColumns = Math.min(12, Math.max(1, ...limitedRows.map((r) => r.cells.length)));
                const columnLabels = new Array(maxColumns).fill(0).map((_, idx) => {
                    for (const row of limitedRows) {
                        const label = row.cells[idx]?.label;
                        if (label) return String(label).slice(0, 8);
                    }
                    return `T${idx + 1}`;
                });

                return (
                    <div className="heatmap-compact-wrap">
                        <div className="heatmap-legend">
                            <span>0 = rendah</span>
                            <span>10 = tinggi</span>
                        </div>
                        <div
                            className="heatmap-compact-grid"
                            style={{ gridTemplateColumns: `220px repeat(${maxColumns}, minmax(42px, 52px))` }}
                        >
                            <div className="heatmap-head-cell heatmap-row-title">Parameter</div>
                            {columnLabels.map((label, idx) => (
                                <div key={`head-${idx}`} className="heatmap-head-cell">{label}</div>
                            ))}

                            {limitedRows.map((row, rowIdx) => (
                                <React.Fragment key={`row-${rowIdx}`}>
                                    <div className="heatmap-row-name" title={row.name}>{row.name}</div>
                                    {new Array(maxColumns).fill(0).map((_, colIdx) => {
                                        const cell = row.cells[colIdx];
                                        const val = Number(cell?.value);
                                        const safeVal = Number.isFinite(val) ? val : 0;
                                        return (
                                            <div
                                                key={`cell-${rowIdx}-${colIdx}`}
                                                className="heatmap-cell"
                                                style={{ backgroundColor: `rgba(19, 109, 236, ${Math.max(0.35, safeVal / 10)})` }}
                                                title={`${row.name}: ${Number.isFinite(val) ? val : '-'}`}
                                            >
                                                {Number.isFinite(val) ? val.toFixed(0) : '-'}
                                            </div>
                                        );
                                    })}
                                </React.Fragment>
                            ))}
                        </div>

                        {(heatmapRows.length > limitedRows.length || Math.max(...heatmapRows.map((r) => r.cells.length)) > maxColumns) && (
                            <div className="heatmap-truncate-note">
                                Tampilan dipadatkan untuk keterbacaan. Data lengkap tetap tersimpan pada respons.
                            </div>
                        )}
                    </div>
                );

            case 'gauge': // Vulnerability Gauge
                const gaugeValue = data[0]?.value || 0;
                const pieData = [{ value: gaugeValue }, { value: 100 - gaugeValue }];
                return (
                    <div className="gauge-container" style={{ minHeight: '220px' }}>
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
                    <ResponsiveContainer width={width} height={height + 50}>
                        <AreaChart data={data} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
                            <defs>
                                <linearGradient id="colorConc" x1="0" y1="0" x2="0" y2="1">
                                    <stop offset="5%" stopColor="#136dec" stopOpacity={0.3}/>
                                    <stop offset="95%" stopColor="#136dec" stopOpacity={0}/>
                                </linearGradient>
                            </defs>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} padding={{ left: 30, right: 30 }} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} width={40} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Area type="monotone" dataKey="level" stroke="#136dec" strokeWidth={3} fillOpacity={1} fill="url(#colorConc)" />
                        </AreaChart>
                    </ResponsiveContainer>
                );

            case 'comparison': // Lab Comparison % Delta
                return (
                    <ResponsiveContainer width="100%" height={height}>
                        <BarChart data={data} layout="vertical" margin={{ top: 10, right: 40, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} domain={['auto', 'auto']} />
                            <YAxis dataKey="name" type="category" width={100} fontSize={10} axisLine={false} tickLine={false} tickMargin={5} />
                            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="delta" radius={[0, 4, 4, 0]} barSize={20}>
                                {data.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.delta > 0 ? '#ef4444' : '#10b981'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                );

            case 'timeline': // Drug-Response Timeline
                return (
                    <ResponsiveContainer width={width} height={height + 50}>
                        <LineChart data={data} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} padding={{ left: 40, right: 40 }} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} width={40} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Line type="monotone" dataKey="vital" stroke="#136dec" strokeWidth={3} dot={{ r: 4, fill: '#fff', stroke: '#136dec', strokeWidth: 2 }} activeDot={{ r: 6 }} />
                            <Scatter yAxisId="left" data={data.filter(d => d.drug)} name="Obat" shape="star" fill="#ef4444" />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'forecast': // Recovery Forecast
                return (
                    <ResponsiveContainer width={width} height={height + 50}>
                        <LineChart data={data} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} padding={{ left: 40, right: 40 }} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} width={40} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Line type="monotone" dataKey="actual" stroke="#136dec" strokeWidth={3} dot={{ r: 4, fill: '#fff', stroke: '#136dec', strokeWidth: 2 }} />
                            <Line type="monotone" dataKey="forecast" stroke="#136dec" strokeDasharray="5 5" strokeOpacity={0.5} dot={false} />
                        </LineChart>
                    </ResponsiveContainer>
                );

            case 'outlier':
            case 'outliers': // Analisis Outlier Table
                const outlierRows = normalizeOutlierRows(safeArray);
                if (outlierRows.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data outlier belum tersedia atau format tidak valid.
                        </div>
                    );
                }
                return (
                    <div className="table-flow-container">
                        <table className="viz-table">
                            <thead>
                                <tr><th>Waktu</th><th>Param</th><th>Nilai</th><th>Status</th></tr>
                            </thead>
                            <tbody>
                                {outlierRows.map((d, i) => (
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
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data audit belum tersedia.
                        </div>
                    );
                }
                return (
                    <div className="viz-audit-list">
                        {safeArray.map((item, i) => (
                            <div key={i} className="viz-audit-item">
                                <span className={`material-symbols-outlined viz-audit-icon ${item.ok ? 'is-ok' : 'is-error'}`}>
                                    {item.ok ? 'check_circle' : 'error'}
                                </span>
                                <span className="viz-audit-task">{item.task}</span>
                                {!item.ok && <span className="viz-audit-badge">MISSING</span>}
                            </div>
                        ))}
                    </div>
                );

            case 'plan':
            case 'gantt': // Action Gantt
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Timeline tindakan belum tersedia.
                        </div>
                    );
                }
                return (
                    <div className="viz-gantt-list">
                        {safeArray.map((item, i) => (
                            <div key={i} className="viz-gantt-item">
                                <div className="viz-gantt-dot"></div>
                                <div className="viz-gantt-time">{item.time}</div>
                                <div className="viz-gantt-action">{item.action}</div>
                                <div className="viz-gantt-desc">{item.desc}</div>
                            </div>
                        ))}
                    </div>
                );

            case 'dashboard': // Smart Filtering Dashboard
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data quick filter belum tersedia.
                        </div>
                    );
                }
                return (
                    <div className="viz-dashboard-list">
                        {safeArray.map((btn, i) => (
                            <button
                                key={i}
                                type="button"
                                onClick={() => setActiveDashboardFilter(btn.label || `filter-${i}`)}
                                className={`viz-dashboard-btn ${activeDashboardFilter === (btn.label || `filter-${i}`) ? 'is-active' : ''}`}
                            >
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
        <div
            className="clinical-viz-container"
            id={vizId}
            data-export-chart-key={exportChartKey || ''}
            data-export-chart-type={exportChartType || type || ''}
        >
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
