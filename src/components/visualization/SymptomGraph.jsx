import { useMemo, useEffect } from 'react';
import {
    ReactFlow,
    Controls,
    Background,
    useNodesState,
    useEdgesState,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { parseAIDiagnoses } from '../../services/dataService';

const severityColors = {
    ringan: { bg: '#d1fae5', border: '#10b981', text: '#065f46' },
    sedang: { bg: '#fef3c7', border: '#f59e0b', text: '#92400e' },
    berat: { bg: '#fee2e2', border: '#ef4444', text: '#991b1b' },
};

export default function SymptomGraph({ symptoms, aiResult }) {
    const { initialNodes, initialEdges } = useMemo(() => {
        if (!symptoms || symptoms.length === 0) return { initialNodes: [], initialEdges: [] };

        const aiData = parseAIDiagnoses(aiResult);
        const hasAI = aiData && aiData.length > 0;

        const centerX = 250;
        const centerY = 200;
        const radius = 150;
        const angleStep = (2 * Math.PI) / Math.max(symptoms.length, 1);

        // Create center node (patient)
        const nodes = [
            {
                id: 'center',
                position: { x: centerX - 40, y: centerY - 25 },
                data: { label: 'Pasien' },
                style: {
                    background: '#136dec',
                    color: 'white',
                    border: '2px solid #136dec',
                    borderRadius: '50%',
                    width: 80,
                    height: 50,
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontSize: '12px',
                    fontWeight: '700',
                    boxShadow: '0 4px 14px rgba(19, 109, 236, 0.3)',
                },
                type: 'default',
            },
        ];

        const edges = [];

        symptoms.forEach((symptom, i) => {
            const angle = angleStep * i - Math.PI / 2;
            const x = centerX + radius * Math.cos(angle) - 50;
            const y = centerY + radius * Math.sin(angle) - 20;
            const colors = severityColors[symptom.severity] || severityColors.sedang;

            nodes.push({
                id: symptom.id || `s-${i}`,
                position: { x, y },
                data: {
                    label: (
                        <div style={{ textAlign: 'center' }}>
                            <div style={{ fontSize: '11px', fontWeight: '700' }}>{symptom.name}</div>
                            <div style={{ fontSize: '9px', textTransform: 'uppercase', marginTop: '2px', opacity: 0.7 }}>{symptom.severity}</div>
                        </div>
                    ),
                },
                style: {
                    background: colors.bg,
                    border: `2px solid ${colors.border}`,
                    borderRadius: '12px',
                    padding: '8px 12px',
                    fontSize: '11px',
                    color: colors.text,
                    minWidth: '80px',
                    boxShadow: '0 2px 8px rgba(0,0,0,0.08)',
                },
            });

            edges.push({
                id: `e-center-${symptom.id || i}`,
                source: 'center',
                target: symptom.id || `s-${i}`,
                animated: symptom.severity === 'berat',
                style: {
                    stroke: colors.border,
                    strokeWidth: symptom.severity === 'berat' ? 2.5 : 1.5,
                },
            });
        });

        // Connect related symptoms (same severity)
        for (let i = 0; i < symptoms.length; i++) {
            for (let j = i + 1; j < symptoms.length; j++) {
                if (symptoms[i].severity === symptoms[j].severity && symptoms[i].severity !== 'ringan') {
                    edges.push({
                        id: `e-${symptoms[i].id || i}-${symptoms[j].id || j}`,
                        source: symptoms[i].id || `s-${i}`,
                        target: symptoms[j].id || `s-${j}`,
                        animated: false,
                        style: {
                            stroke: '#94a3b8',
                            strokeWidth: 1,
                            strokeDasharray: '5 5',
                        },
                    });
                }
            }
        }

        // Add AI Diagnoses Nodes
        if (hasAI) {
            const diagRadius = radius + 90;
            const diagAngleStep = (2 * Math.PI) / aiData.length;

            aiData.slice(0, 5).forEach((d, i) => {
                const angle = diagAngleStep * i - Math.PI / 4;
                const x = centerX + diagRadius * Math.cos(angle) - 50;
                const y = centerY + diagRadius * Math.sin(angle) - 20;

                nodes.push({
                    id: `ai-ddx-${i}`,
                    position: { x, y },
                    data: {
                        label: (
                            <div style={{ textAlign: 'center' }}>
                                <div style={{ fontSize: '10px', textTransform: 'uppercase', color: '#f59e0b', fontWeight: '800', marginBottom: '2px' }}>DDX</div>
                                <div style={{ fontSize: '11px', fontWeight: '700' }}>{d.diagnosis}</div>
                                <div style={{ fontSize: '9px', marginTop: '2px', opacity: 0.8 }}>Prob: {d.probability}%</div>
                            </div>
                        ),
                    },
                    style: {
                        background: '#fffbeb',
                        border: '2px dashed #f59e0b',
                        borderRadius: '8px',
                        padding: '8px 10px',
                        fontSize: '11px',
                        color: '#92400e',
                        minWidth: '85px',
                        boxShadow: '0 4px 10px rgba(245, 158, 11, 0.15)',
                    },
                });

                edges.push({
                    id: `e-ddx-${i}`,
                    source: 'center',
                    target: `ai-ddx-${i}`,
                    animated: true,
                    style: {
                        stroke: '#fbbf24',
                        strokeWidth: 2,
                        strokeDasharray: '4 4',
                    },
                });
            });
        }

        return { initialNodes: nodes, initialEdges: edges };
    }, [symptoms, aiResult]);

    const [nodes, setNodes, onNodesChange] = useNodesState(initialNodes);
    const [edges, setEdges, onEdgesChange] = useEdgesState(initialEdges);

    useEffect(() => {
        setNodes(initialNodes);
        setEdges(initialEdges);
    }, [initialNodes, initialEdges, setNodes, setEdges]);

    if (!symptoms || symptoms.length === 0) {
        return (
            <div className="flex items-center justify-center h-full text-slate-400 text-sm">
                Belum ada gejala untuk divisualisasikan
            </div>
        );
    }

    return (
        <ReactFlow
            nodes={nodes}
            edges={edges}
            onNodesChange={onNodesChange}
            onEdgesChange={onEdgesChange}
            fitView
            proOptions={{ hideAttribution: true }}
            style={{ borderRadius: '12px' }}
        >
            <Controls className="bg-white! dark:bg-slate-800! border-slate-200! dark:border-slate-700! shadow-lg! rounded-xl!" />
            <Background color="#e2e8f0" gap={20} />
        </ReactFlow>
    );
}
