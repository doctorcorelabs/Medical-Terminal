import React, { useState } from 'react';
import { 
    LineChart, Line, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
    Legend,
    Radar, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis,
    BarChart, Bar, Cell, PieChart, Pie,
    ScatterChart, Scatter, ZAxis
} from 'recharts';
import './ClinicalVisualization.css';

const ClinicalVisualization = ({ type, data, title, icon = 'analytics', vizId, exportChartKey, exportChartType, width = 800, height = 220 }) => {
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
        const chartHeight = type === 'radar' ? 380 : 250;
        const scrollableTypes = ['trend', 'simulation', 'timeline', 'forecast'];
        const chartWidth = (type === 'radar' || scrollableTypes.includes(type)) ? (type === 'radar' ? 600 : 800) : width;

        switch(type) {
            case 'trend': { // Lab vs Vitals
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data tren belum tersedia. Pastikan format data mengandung field <strong>time</strong>, <strong>vitals</strong>, dan/atau <strong>lab</strong>.
                        </div>
                    );
                }
                return (
                    <ResponsiveContainer width={chartWidth} height={chartHeight + 50}>
                        <LineChart data={safeArray} margin={{ top: 20, right: 20, left: 5, bottom: 20 }}>
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
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} formatter={(value) => value === 'vitals' ? 'Vital Signs' : 'Lab'} />
                            <Line 
                                yAxisId="left" 
                                type="monotone" 
                                dataKey="vitals" 
                                name="vitals"
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
                                name="lab"
                                stroke="#10b981" 
                                strokeWidth={2.5} 
                                dot={{ r: 3.5, fill: '#fff', stroke: '#10b981', strokeWidth: 2 }} 
                                activeDot={{ r: 5 }} 
                                connectNulls
                            />
                        </LineChart>
                    </ResponsiveContainer>
                );
            }

            case 'radar': { // Risk Radar
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data radar belum tersedia. Pastikan format data mengandung field <strong>subject</strong> dan <strong>A</strong>.
                        </div>
                    );
                }
                return (
                    <ResponsiveContainer width={600} height={chartHeight}>
                        <RadarChart cx="50%" cy="50%" outerRadius="65%" data={safeArray} margin={{ top: 40, right: 40, bottom: 40, left: 40 }}>
                            <PolarGrid stroke="rgba(0,0,0,0.1)" />
                            <PolarAngleAxis dataKey="subject" fontSize={11} fontWeight={600} />
                            <PolarRadiusAxis angle={30} domain={[0, 10]} fontSize={10} />
                            <Radar name="Skor Risiko" dataKey="A" stroke="#136dec" fill="#136dec" fillOpacity={0.4} />
                            <Tooltip />
                        </RadarChart>
                    </ResponsiveContainer>
                );
            }

            case 'heatmap': { // Symptom Heatmap
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
            }

            case 'gauge': { // Vulnerability Gauge
                const gaugeValue = safeArray[0]?.value || 0;
                const pieData = [{ value: gaugeValue }, { value: 100 - gaugeValue }];
                return (
                    <div className="gauge-container" style={{ width: width, height: height, minWidth: 200, minHeight: 120 }}>
                        <ResponsiveContainer width={width} height={height}>
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
            }

            case 'anatomy': { // SVG Human Body Highlight
                const bodyParts = Array.isArray(data) ? data : [];
                return (
                    <svg viewBox="0 0 200 500" className="anatomy-svg">
                        <path className={`body-part ${bodyParts.includes('head') ? 'highlighted' : ''}`} d="M100,20c-15,0-25,10-25,25s10,25,25,25s25-10,25-25S115,20,100,20z" />
                        <rect className={`body-part ${bodyParts.includes('chest') ? 'highlighted' : ''}`} x="75" y="75" width="50" height="80" rx="10" />
                        <path className={`body-part ${bodyParts.includes('arms') ? 'highlighted' : ''}`} d="M70,80l-30,50l10,10l30-40V80z M130,80l30,50l-10,10l-30-40V80z" />
                        <path className={`body-part ${bodyParts.includes('legs') ? 'highlighted' : ''}`} d="M80,160l-15,120h20l5-120H80z M110,160l15,120h-20l-5-120H110z" />
                    </svg>
                );
            }

            case 'simulation': { // Drug Concentration
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data simulasi belum tersedia. Pastikan format data mengandung field <strong>time</strong> dan <strong>level</strong>.
                        </div>
                    );
                }
                return (
                    <ResponsiveContainer width={chartWidth} height={chartHeight + 50}>
                        <AreaChart data={safeArray} margin={{ top: 20, right: 30, left: 0, bottom: 20 }}>
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
                            <Area type="monotone" dataKey="level" stroke="#136dec" strokeWidth={3} fillOpacity={1} fill="url(#colorConc)" connectNulls />
                        </AreaChart>
                    </ResponsiveContainer>
                );
            }

            case 'comparison': { // Lab Comparison % Delta
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data perbandingan belum tersedia. Pastikan format data mengandung field <strong>name</strong> dan <strong>delta</strong>.
                        </div>
                    );
                }
                return (
                    <ResponsiveContainer width={width} height={chartHeight}>
                        <BarChart data={safeArray} layout="vertical" margin={{ top: 10, right: 40, left: 0, bottom: 10 }}>
                            <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis type="number" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} domain={['auto', 'auto']} />
                            <YAxis dataKey="name" type="category" width={100} fontSize={10} axisLine={false} tickLine={false} tickMargin={5} />
                            <Tooltip cursor={{ fill: 'rgba(0,0,0,0.02)' }} contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Bar dataKey="delta" radius={[0, 4, 4, 0]} barSize={20}>
                                {safeArray.map((entry, index) => (
                                    <Cell key={`cell-${index}`} fill={entry.delta > 0 ? '#ef4444' : '#10b981'} />
                                ))}
                            </Bar>
                        </BarChart>
                    </ResponsiveContainer>
                );
            }

            case 'timeline': { // Drug-Response Timeline
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data timeline belum tersedia. Pastikan format data mengandung field <strong>time</strong> dan <strong>vital</strong>.
                        </div>
                    );
                }
                // Render custom dot: red "Rx" marker for drug events, default dot otherwise
                const renderTimelineDot = (props) => {
                    const { cx, cy, payload } = props;
                    if (payload && payload.drug) {
                        return (
                            <g key={`dot-drug-${cx}-${cy}`}>
                                <circle cx={cx} cy={cy} r={7} fill="#ef4444" stroke="#fff" strokeWidth={2} />
                                <text x={cx} y={cy + 4} textAnchor="middle" fontSize={8} fill="#fff" fontWeight="bold">Rx</text>
                            </g>
                        );
                    }
                    return <circle key={`dot-${cx}-${cy}`} cx={cx} cy={cy} r={4} fill="#fff" stroke="#136dec" strokeWidth={2} />;
                };
                return (
                    <ResponsiveContainer width={chartWidth} height={chartHeight + 50}>
                        <LineChart data={safeArray} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="time" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} padding={{ left: 40, right: 40 }} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} width={40} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} formatter={(value, name) => [value, name === 'vital' ? 'Vital' : name]} />
                            <Line type="monotone" dataKey="vital" stroke="#136dec" strokeWidth={3} dot={renderTimelineDot} activeDot={{ r: 6 }} connectNulls />
                        </LineChart>
                    </ResponsiveContainer>
                );
            }

            case 'forecast': { // Recovery Forecast
                if (safeArray.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data prediksi belum tersedia. Pastikan format data mengandung field <strong>day</strong>, <strong>actual</strong>, dan/atau <strong>forecast</strong>.
                        </div>
                    );
                }
                return (
                    <ResponsiveContainer width={chartWidth} height={chartHeight + 50}>
                        <LineChart data={safeArray} margin={{ top: 20, right: 40, left: 0, bottom: 20 }}>
                            <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="rgba(0,0,0,0.05)" />
                            <XAxis dataKey="day" fontSize={10} axisLine={false} tickLine={false} tickMargin={10} padding={{ left: 40, right: 40 }} />
                            <YAxis fontSize={10} axisLine={false} tickLine={false} width={40} />
                            <Tooltip contentStyle={{ borderRadius: '12px', border: 'none', boxShadow: '0 10px 15px -3px rgba(0,0,0,0.1)' }} />
                            <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '8px' }} formatter={(value) => value === 'actual' ? 'Aktual' : 'Prediksi'} />
                            <Line type="monotone" dataKey="actual" name="actual" stroke="#136dec" strokeWidth={3} dot={{ r: 4, fill: '#fff', stroke: '#136dec', strokeWidth: 2 }} connectNulls />
                            <Line type="monotone" dataKey="forecast" name="forecast" stroke="#136dec" strokeDasharray="5 5" strokeOpacity={0.5} dot={false} connectNulls />
                        </LineChart>
                    </ResponsiveContainer>
                );
            }

            case 'outlier':
            case 'outliers': { // Analisis Outlier — visual chart + table
                const outlierRows = normalizeOutlierRows(safeArray);
                if (outlierRows.length === 0) {
                    return (
                        <div className="viz-empty-state">
                            Data outlier belum tersedia atau format tidak valid.
                        </div>
                    );
                }

                // Build scatter data (numeric values only)
                const outlierChartData = outlierRows
                    .map((d, i) => ({ x: i, y: typeof d.value === 'number' ? d.value : null, outlier: d.outlier, time: d.time, param: d.param }))
                    .filter(d => d.y !== null);

                const normalPoints = outlierChartData.filter(d => !d.outlier);
                const flaggedPoints = outlierChartData.filter(d => d.outlier);

                const OutlierTooltipRenderer = ({ active, payload }) => {
                    if (!active || !payload?.length) return null;
                    const d = payload[0]?.payload;
                    if (!d) return null;
                    return (
                        <div style={{ background: '#fff', border: `1px solid ${d.outlier ? '#fca5a5' : '#cbd5e1'}`, borderRadius: 10, padding: '8px 12px', fontSize: 11, boxShadow: '0 4px 12px rgba(0,0,0,0.08)' }}>
                            <p style={{ fontWeight: 700, marginBottom: 4, color: d.outlier ? '#dc2626' : '#1e293b' }}>{d.outlier ? '⚠ Outlier' : '✓ Normal'}</p>
                            <p style={{ color: '#475569' }}>Waktu: <strong>{d.time}</strong></p>
                            <p style={{ color: '#475569' }}>Param: <strong>{d.param}</strong></p>
                            <p style={{ color: '#475569' }}>Nilai: <strong>{d.y}</strong></p>
                        </div>
                    );
                };

                const NORMAL_POINT_SIZE = 30;
                const OUTLIER_POINT_SIZE = 80;

                return (
                    <div className="outlier-container">
                        {outlierChartData.length > 0 && (
                            <div className="outlier-chart-wrap">
                                <div className="outlier-legend">
                                    <span className="outlier-legend-dot normal"></span><span>Normal</span>
                                    <span className="outlier-legend-dot flagged"></span><span>Outlier</span>
                                </div>
                                <ResponsiveContainer width="100%" height={160}>
                                    <ScatterChart margin={{ top: 10, right: 20, left: 0, bottom: 10 }}>
                                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(0,0,0,0.05)" />
                                        <XAxis type="number" dataKey="x" hide domain={[-0.5, outlierChartData.length - 0.5]} />
                                        <YAxis type="number" dataKey="y" fontSize={10} axisLine={false} tickLine={false} width={38} domain={['auto', 'auto']} />
                                        <ZAxis range={[NORMAL_POINT_SIZE, NORMAL_POINT_SIZE]} />
                                        <Tooltip content={<OutlierTooltipRenderer />} />
                                        <Scatter name="Normal" data={normalPoints} fill="#60a5fa" />
                                        <ZAxis range={[OUTLIER_POINT_SIZE, OUTLIER_POINT_SIZE]} />
                                        <Scatter name="Outlier" data={flaggedPoints} fill="#ef4444" />
                                    </ScatterChart>
                                </ResponsiveContainer>
                            </div>
                        )}
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
                                            <td className="outlier-value">{d.value}</td>
                                            <td>
                                                <span className={`outlier-status-badge ${d.outlier ? 'is-outlier' : 'is-normal'}`}>
                                                    {d.outlier ? '⚠ Abnormal' : '✓ Normal'}
                                                </span>
                                            </td>
                                        </tr>
                                    ))}
                                </tbody>
                            </table>
                        </div>
                    </div>
                );
            }

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
                                onClick={() => setActiveDashboardFilter(activeDashboardFilter === (btn.label || `filter-${i}`) ? null : (btn.label || `filter-${i}`))}
                                className={`viz-dashboard-btn ${activeDashboardFilter === (btn.label || `filter-${i}`) ? 'is-active' : ''}`}
                            >
                                {btn.label}
                            </button>
                        ))}
                        {activeDashboardFilter && (
                            <div className="viz-dashboard-active-label">
                                <span className="material-symbols-outlined" style={{fontSize:'13px'}}>filter_list</span>
                                Filter aktif: <strong>{activeDashboardFilter}</strong>
                            </div>
                        )}
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
            className="clinical-viz-container medical-chart-container"
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
