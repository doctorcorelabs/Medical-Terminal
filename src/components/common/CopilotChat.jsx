/* src/components/common/CopilotChat.jsx */
import React, { useState, useRef, useEffect, useCallback } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CopilotChat.css';

import { useCopilotContext } from '../../context/CopilotContext';
import { exportCopilotResponsePDF } from '../../services/pdfExportService';
import { parseMedicalChartSegments } from '../../utils/medicalChartParser';
import { CHART_MARKER_PREFIX } from '../../utils/pdfMarkdownChartSegmentation';
import { useAuth } from '../../context/AuthContext';
import { useNavigate } from 'react-router-dom';

import ClinicalVisualization from './ClinicalVisualization';
import html2canvas from 'html2canvas';

import rehypeRaw from 'rehype-raw';

const COPILOT_WORKER_URL = import.meta.env.VITE_COPILOT_WORKER_URL;
const AI_INTERNAL_KEY = import.meta.env.VITE_OPS_INTERNAL_KEY;

const CHART_CAPTURE_REASON = {
    MISSING_MESSAGE_ROW: 'missing-message-row',
    MISSING_CONTAINER: 'missing-container',
    NOT_READY: 'not-ready-timeout',
    CAPTURE_ERROR: 'capture-error',
};

const COPILOT_PDF_PERF = {
    waitTimeoutMs: 3000,
    waitPollMs: 80,
    waitStableCycles: 2,
    captureScale: 2,
    maxCaptureWidth: 1200,
    maxCaptureHeight: 1600,
    maxRetries: 2,
    retryDelayMs: 250,
    fallbackCanvasWidth: 1400,
    fallbackCanvasHeight: 900,
    svgRenderScale: 2,
    // Extra ms to wait after RAF frames so Recharts/ResponsiveContainer can
    // finish re-rendering after being mounted in an off-screen clone container.
    bodyCloneSettleMsDesktop: 600,
    bodyCloneSettleMsMobile: 1200,
    // Minimum width for cloned chart containers. Ensures Recharts
    // ResponsiveContainer renders at a PDF-quality width even on narrow
    // mobile/iPad viewports.
    pdfCloneMinWidth: 640,
    // Set to true to bypass DOM capture entirely and render charts from raw
    // MedicalChart data directly in jsPDF (requires renderCopilotChartToPdf
    // helper in pdfExportService). Currently unused - reserved for future use.
    vectorMode: false,
};

const getMessageRawText = (msg) => {
    if (!msg) return '';

    let raw = '';
    if (typeof msg.content === 'string') {
        raw = msg.content;
    } else if (Array.isArray(msg.content)) {
        const textChunks = msg.content
            .filter((chunk) => chunk && typeof chunk === 'object' && chunk.type === 'text')
            .map((chunk) => (typeof chunk.text === 'string' ? chunk.text : ''))
            .filter(Boolean);

        if (textChunks.length > 0) {
            raw = textChunks.join('\n\n');
        }
    } else if (typeof msg.displayContent === 'string' && msg.displayContent.trim().length > 0) {
        raw = msg.displayContent;
    } else if (msg.content && typeof msg.content === 'object' && typeof msg.content.text === 'string') {
        raw = msg.content.text;
    }

    return sanitizeAiResponse(raw);
};

/**
 * Safely parses chart data JSON with repair fallbacks.
 * AI sometimes generates apostrophes or smart quotes that break JSON.parse.
 */
const safeParseChartData = (raw) => {
    if (typeof raw !== 'string') return raw;
    // Try 1: Direct parse
    try { return JSON.parse(raw); } catch (_) { /* ignore */ }
    // Try 2: Replace curly/smart quotes
    try { return JSON.parse(raw.replace(/[\u2018\u2019]/g, "\\'").replace(/[\u201C\u201D]/g, '"')); } catch (_) { /* ignore */ }
    // Try 3: Escape lone apostrophes inside string values
    try { return JSON.parse(raw.replace(/(?<=[^\\])'/g, "'")); } catch (_) { /* ignore */ }
    // Try 4: Strip trailing comma before } or ]
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch (_) { /* ignore */ }
    return null; // All repairs failed
};

/**
 * Robustly sanitizes and repairs AI response text to prevent 
 * malformed MedicalChart tags from swallowing subsequent content.
 * Uses the same parser logic as the PDF export for consistency.
 */
const sanitizeAiResponse = (text) => {
    if (typeof text !== 'string') return '';
    
    // Parse using the robust segments logic
    const parsed = parseMedicalChartSegments(text);
    
    // Re-join segments into clean markdown
    // malformed-chart segments are replaced with a clear diagnostic marker
    // valid chart segments are re-serialized into clean <medicalchart /> tags
    return parsed.segments.map(segment => {
        if (segment.type === 'text') {
            return segment.content;
        }
        if (segment.type === 'chart') {
            const attrs = segment.attributes || {};
            const attrStr = Object.entries(attrs)
                .map(([k, v]) => `${k}="${v.toString().replace(/"/g, '&quot;')}"`)
                .join(' ');
            return `\n\n<medicalchart ${attrStr}></medicalchart>\n\n`;
        }
        if (segment.type === 'malformed-chart') {
            return `\n\n> [!ERROR]\n> Gagal memproses visualisasi (${segment.reasonCode})\n\n`;
        }
        return '';
    }).join('');
};


const MessageRow = React.memo(function MessageRow({ msg, idx, patientData, onExportPDF }) {
    const [isExporting, setIsExporting] = React.useState(false);

    const handleExportClick = async (e) => {
        if (isExporting) return;
        setIsExporting(true);
        try {
            await onExportPDF(msg, idx, e.currentTarget.closest('button'));
        } finally {
            setIsExporting(false);
        }
    };

    return (
        <div className={`message-row ${msg.role}`} data-msg-index={idx}>
            {msg.role === 'ai' && (
                <div className="ai-avatar">
                    <span className="material-symbols-outlined">terminal</span>
                </div>
            )}
            <div className="message-bubble">
                {msg.role === 'ai' && (msg.stage === 'thinking' || msg.stage === 'refining') && (
                    <div className="thinking-container">
                        <div className={`stage-pill ${msg.stage === 'thinking' ? 'active' : 'completed'}`}>
                            <div className="stage-dot"></div>
                            <span className="stage-text">Menganalisis Konteks...</span>
                        </div>
                        {msg.stage === 'refining' && (
                            <div className="stage-pill active">
                                <div className="stage-dot"></div>
                                <span className="stage-text">Menyajikan Jawaban...</span>
                            </div>
                        )}
                    </div>
                )}

                {msg.role === 'ai' && msg.isStreaming && !msg.content ? (
                    <div className="skeleton-loader">
                        <div className="skeleton-line"></div>
                        <div className="skeleton-line"></div>
                        <div className="skeleton-line"></div>
                    </div>
                ) : (
                    (msg.content !== undefined && (msg.content !== '' || msg.role === 'user' || msg.stage === 'ready' || msg.stage === 'completed')) && (
                        <div className="markdown-content">
                            {(() => {
                                let chartRenderCounter = 0;
                                return (
                                    <ReactMarkdown 
                                        remarkPlugins={[remarkGfm]}
                                        rehypePlugins={[rehypeRaw]}
                                        components={{
                                            table: ({node: _node, ...props}) => (
                                                <div className="table-container">
                                                    <table {...props} />
                                                </div>
                                            ),
                                            p: ({node: _node, children, ...props}) => {
                                                const isBlockContent = (content) => {
                                                    return React.Children.toArray(content).some(child => {
                                                        if (!React.isValidElement(child)) return false;

                                                        const type = child.type;
                                                        const name = child.props?.node?.name || (typeof type === 'string' ? type : type.name);

                                                        const blockTags = ['div', 'table', 'section', 'article', 'medicalchart', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'tr', 'td'];
                                                        if (blockTags.includes(name?.toLowerCase())) return true;

                                                        if (child.props?.children) return isBlockContent(child.props.children);

                                                        return false;
                                                    });
                                                };

                                                if (isBlockContent(children)) {
                                                    return <div className="p-wrap" {...props}>{children}</div>;
                                                }
                                                return <p {...props}>{children}</p>;
                                            },
                                            medicalchart: ({node: _node, children, ...props}) => {
                                                try {
                                                    const rawType = (props.type || '').toString().trim().toLowerCase();
                                                    const chartData = safeParseChartData(props.data);
                                                    const _isEmptyData = !chartData || (Array.isArray(chartData) && chartData.length === 0);

                                                     const chartKey = `chart-${chartRenderCounter++}`;
                                                     return (
                                                         <>
                                                             <ClinicalVisualization 
                                                                 type={rawType || 'unknown'} 
                                                                 data={chartData} 
                                                                 title={props.title || ''}
                                                                 exportChartKey={chartKey}
                                                                 exportChartType={rawType}
                                                             />
                                                             {children}
                                                         </>
                                                     );
                                                } catch (e) {
                                                    console.error("Failed to parse chart data:", e);
                                                    return (
                                                         <div className="chart-error-box medical-chart-container">
                                                             <div className="text-red-500 text-xs font-bold mb-1">Gagal memuat visualisasi</div>
                                                            {children}
                                                        </div>
                                                    );
                                                }
                                            },
                                            strong: ({node: _node, ...props}) => <strong className="md-bold" {...props} />,
                                            em: ({node: _node, ...props}) => <em className="md-italic" {...props} />
                                        }}
                                    >
                                        {msg.displayContent || (() => {
                                            let textToRender = '';
                                            if (typeof msg.content === 'string') {
                                                textToRender = msg.content;
                                            } else if (Array.isArray(msg.content)) {
                                                textToRender = msg.content
                                                    .filter(c => c && typeof c === 'object' && c.type === 'text')
                                                    .map(c => c.text || '')
                                                    .filter(Boolean)
                                                    .join('\n\n');
                                            }
                                            
                                            return sanitizeAiResponse(textToRender);
                                        })()}
                                    </ReactMarkdown>
                                );
                            })()}
                        </div>
                    )
                )}

                {msg.attachments && msg.attachments.length > 0 && (
                    <div className="message-attachments">
                        {msg.attachments.map((att, i) => (
                            <div key={i} className="msg-attachment-tag">
                                <span className="material-symbols-outlined">
                                    {att.isImage ? 'image' : 'description'}
                                </span>
                                {att.name}
                            </div>
                        ))}
                    </div>
                )}

                {msg.role === 'ai' && msg.content && !msg.isStreaming && !msg.isWelcome && patientData && msg.isContextual && (
                    <button 
                        className={`export-pdf-mini-btn ${isExporting ? 'is-exporting' : ''}`}
                        onClick={handleExportClick}
                        disabled={isExporting}
                        title="Export jawaban ini ke PDF"
                    >
                        {isExporting ? (
                            <>
                                <span className="export-spinner material-symbols-outlined">sync</span>
                                <span>Memproses...</span>
                            </>
                        ) : (
                            <>
                                <span className="material-symbols-outlined">picture_as_pdf</span>
                                <span>Simpan PDF</span>
                            </>
                        )}
                    </button>
                )}


                {msg.usedModel && (
                    <div className="model-badge">
                        <span className="material-symbols-outlined">bolt</span>
                        {msg.usedModel === 'gpt-5-mini' ? 'GPT-Research Mode' : 
                            msg.usedModel === 'gpt-4.1' ? 'GPT-Swift Mode' : 
                            msg.usedModel === 'gpt-4o' ? 'GPT-Omni Mode' : 
                            `GPT-${msg.usedModel.toUpperCase()}`}
                    </div>
                )}
            </div>
        </div>
    );
});


const CopilotChat = () => {
    const { pageContext, patientData, isContextEnabled, toggleContext } = useCopilotContext();
    const { isIntern } = useAuth();
    const navigate = useNavigate();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Halo! Saya asisten MedxTerminal. Ada yang bisa saya bantu hari ini?', isWelcome: true }
    ]);
    const [attachments, setAttachments] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    const [showInfoModal, setShowInfoModal] = useState(false);
    const [activeShortcut, setActiveShortcut] = useState(null);
    const [showSlashMenu, setShowSlashMenu] = useState(false);
    const [slashQuery, setSlashQuery] = useState('');
    const [selectedIndex, setSelectedIndex] = useState(0);
    
    const messagesEndRef = useRef(null);
    const fileInputRef = useRef(null);

    // Load PDF.js from CDN
    useEffect(() => {
        if (!window.pdfjsLib) {
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            script.async = true;
            script.onload = () => {
                window.pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
            };
            document.head.appendChild(script);
        }
    }, []);

    const _scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        // Auto-scroll disabled based on user request
        /*
        if (isOpen) {
            scrollToBottom();
        }
        */
    }, [messages, isLoading, isOpen]);

    const extractPdfText = async (dataUrl) => {
        try {
            if (!window.pdfjsLib) throw new Error("Library PDF belum siap.");
            
            const base64 = dataUrl.split(',')[1];
            const binary = atob(base64);
            const len = binary.length;
            const bytes = new Uint8Array(len);
            for (let i = 0; i < len; i++) {
                bytes[i] = binary.charCodeAt(i);
            }

            const loadingTask = window.pdfjsLib.getDocument({ data: bytes });
            const pdf = await loadingTask.promise;
            let fullText = "";
            
            const maxPages = Math.min(pdf.numPages, 10); // Batasi 10 halaman agar tidak terlalu besar
            
            for (let i = 1; i <= maxPages; i++) {
                const page = await pdf.getPage(i);
                const textContent = await page.getTextContent();
                const pageText = textContent.items.map(item => item.str).join(" ");
                fullText += `[Halaman ${i}]\n${pageText}\n\n`;
            }

            if (pdf.numPages > 10) {
                fullText += `\n(Catatan: Hanya 10 halaman pertama yang diekstrak untuk efisiensi.)`;
            }
            
            return fullText;
        } catch (error) {
            console.error("PDF Extraction error:", error);
            return `Gagal mengekstrak teks PDF: ${error.message}`;
        }
    };

    const handleFileChange = (e) => {
        const files = Array.from(e.target.files);
        if (files.length === 0) return;

        files.forEach(file => {
            const isImage = file.type.startsWith('image/');
            const isPdf = file.type === 'application/pdf';
            const reader = new FileReader();
            
            reader.onloadend = async () => {
                const attachment = {
                    name: file.name,
                    type: file.type,
                    data: reader.result,
                    isImage: isImage
                };

                // Penanganan PDF
                if (isPdf) {
                    const extractedText = await extractPdfText(reader.result);
                    attachment.textContent = extractedText;
                    setAttachments(prev => [...prev, attachment]);
                    return;
                }

                // Deteksi file teks
                const textExtensions = ['.txt', '.js', '.jsx', '.ts', '.tsx', '.json', '.md', '.css', '.html', '.py', '.c', '.cpp', '.sql', '.log'];
                const isTextFile = file.type.startsWith('text/') || textExtensions.some(ext => file.name.toLowerCase().endsWith(ext));

                if (isTextFile) {
                    const textReader = new FileReader();
                    textReader.onloadend = () => {
                        attachment.textContent = textReader.result;
                        setAttachments(prev => [...prev, attachment]);
                    };
                    textReader.readAsText(file);
                } else {
                    setAttachments(prev => [...prev, attachment]);
                }
            };

            reader.readAsDataURL(file);
        });
        
        if (fileInputRef.current) fileInputRef.current.value = '';
    };

    const removeAttachment = (index) => {
        setAttachments(prev => prev.filter((_, i) => i !== index));
    };

    const textareaRef = useRef(null);

    // Auto-resize textarea
    useEffect(() => {
        const textarea = textareaRef.current;
        if (textarea) {
            textarea.style.height = 'auto';
            textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
        }
    }, [input]);

    const clearChat = () => {
        setShowConfirmModal(true);
    };

    const confirmClearChat = () => {
        setMessages([
            { role: 'ai', content: 'Halo! Saya asisten MedxTerminal. Ada yang bisa saya bantu hari ini?' }
        ]);
        setShowConfirmModal(false);
    };

    const shortcuts = [
        { 
            id: 'trend', 
            label: 'Tren Pasien', 
            description: 'Tampilkan grafik tren (Vital, Lab, atau Gabungan)',
            examplePrompt: '/trend tunjukkan perkembangan HR, Tekanan Darah, dan Hb pasien'
        },
        { 
            id: 'radar', 
            label: 'Radar Risiko', 
            description: 'Analisis profil risiko dalam radar chart',
            examplePrompt: '/radar tampilkan analisis risiko klinis pasien saat ini'
        },
        { 
            id: 'heatmap', 
            label: 'Peta Gejala', 
            description: 'Buat heatmap keparahan gejala',
            examplePrompt: '/heatmap buat sebaran lokasi nyeri pada tubuh pasien'
        },
        { 
            id: 'gauge', 
            label: 'Skor Kerentanan', 
            description: 'Hitung vulnerability score (gauge)',
            examplePrompt: '/gauge hitung tingkat kerentanan komplikasi pasien'
        },
        { 
            id: 'anatomy', 
            label: 'Fokus Tubuh', 
            description: 'Tunjukkan fokus fisik pada peta anatomi',
            examplePrompt: '/anatomy highlight bagian dada yang mengalami sesak'
        },
        { 
            id: 'simulation', 
            label: 'Simulasi Obat', 
            description: 'Simulasikan konsentrasi obat',
            examplePrompt: '/simulation simulasikan efek pemberian insulin baru'
        },
        { 
            id: 'comparison', 
            label: 'Delta Lab', 
            description: 'Bandingkan hasil lab (delta %)',
            examplePrompt: '/comparison bandingkan Hb hari ini dengan kemarin'
        },
        { 
            id: 'timeline', 
            label: 'Respon Obat', 
            description: 'Timeline intervensi & respon vital',
            examplePrompt: '/timeline tunjukkan respon detak jantung setelah obat'
        },
        { 
            id: 'forecast', 
            label: 'Prediksi', 
            description: 'Kurva prediksi pemulihan (forecast)',
            examplePrompt: '/forecast prediksikan masa pemulihan pasien'
        },
        { 
            id: 'outliers', 
            label: 'Outlier', 
            description: 'Analisis outliers dalam data',
            examplePrompt: '/outliers cari anomali pada data lab satu bulan terakhir'
        },
        { 
            id: 'audit', 
            label: 'Audit', 
            description: 'Audit checklist klinis',
            examplePrompt: '/audit periksa kepatuhan protokol perawatan harian'
        },
        { 
            id: 'gantt', 
            label: 'Rencana', 
            description: 'Gantt chart rencana tindakan',
            examplePrompt: '/gantt buat timeline rencana operasi dan pemulihan'
        },
        { 
            id: 'dashboard', 
            label: 'Dashboard', 
            description: 'Dashboard filtering otomatis',
            examplePrompt: '/dashboard tampilkan ringkasan metrik utama pasien'
        }
    ];

    const filteredShortcuts = slashQuery 
        ? shortcuts.filter(s => 
            s.label.toLowerCase().includes(slashQuery.toLowerCase()) || 
            s.id.toLowerCase().includes(slashQuery.toLowerCase())
          )
        : shortcuts;

    const _handleShortcutClick = (shortcut) => {
        if (activeShortcut?.id === shortcut.id) {
            setActiveShortcut(null);
        } else {
            setActiveShortcut(shortcut);
        }
    };

    const handleSelectShortcut = (shortcut) => {
        setShowSlashMenu(false);
        setSlashQuery('');
        setSelectedIndex(0);
        
        // Ganti '/' dan query dengan command shortcut teks (misal: /tren)
        const lastSlashIndex = input.lastIndexOf('/');
        if (lastSlashIndex !== -1) {
            const beforeSlash = input.substring(0, lastSlashIndex);
            const newInput = `${beforeSlash}/${shortcut.id} `;
            setInput(newInput);
            
            // Focus kembali ke textarea agar penulisan nggabung
            setTimeout(() => {
                if (textareaRef.current) {
                    textareaRef.current.focus();
                }
            }, 0);
        }
    };

    const handleKeyDown = (e) => {
        if (showSlashMenu) {
            if (e.key === 'ArrowDown') {
                e.preventDefault();
                setSelectedIndex(prev => (prev + 1) % filteredShortcuts.length);
            } else if (e.key === 'ArrowUp') {
                e.preventDefault();
                setSelectedIndex(prev => (prev - 1 + filteredShortcuts.length) % filteredShortcuts.length);
            } else if (e.key === 'Enter' || e.key === 'Tab') {
                e.preventDefault();
                if (filteredShortcuts[selectedIndex]) {
                    handleSelectShortcut(filteredShortcuts[selectedIndex]);
                }
            } else if (e.key === 'Escape') {
                setShowSlashMenu(false);
            }
        } else {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                handleSend();
            }
        }
    };

    const handleInputChange = (val) => {
        setInput(val);
        
        const _lastChar = val[val.length - 1];
        const lastSlashIndex = val.lastIndexOf('/');
        
        if (lastSlashIndex !== -1 && lastSlashIndex >= val.lastIndexOf(' ') && isContextEnabled && pageContext) {
            setShowSlashMenu(true);
            const query = val.substring(lastSlashIndex + 1);
            setSlashQuery(query);
            setSelectedIndex(0);
        } else {
            setShowSlashMenu(false);
        }
    };

    const handleSend = async () => {
        if ((!input.trim() && attachments.length === 0) || isLoading) return;

        if (!COPILOT_WORKER_URL || COPILOT_WORKER_URL === 'undefined') {
            const configError = 'Konfigurasi AI Gateway tidak ditemukan.';
            setMessages(prev => [...prev, { role: 'ai', content: `Error: ${configError}` }]);
            return;
        }

        // Tentukan model berdasarkan input dan pengaturan konteks
        // JIKA Context ON -> PAKSA GPT-4.1 (Akurasi Tinggi & Bebas Typo)
        // JIKA Context OFF -> Ikut aturan (Gambar ? GPT-4.1 : GPT-5-Mini)
        const isMultiModal = attachments.length > 0;
        const selectedModel = ((isContextEnabled && pageContext) || isMultiModal) ? 'gpt-5-mini' : 'gpt-4.1';

        // Shortcut Logic: Deteksi slash command di input (hanya jika di awal kalimat)
        let finalInput = input;
        let detectedShortcut = null;
        
        const trimmedInput = input.trim();
        if (trimmedInput.startsWith('/')) {
            const words = trimmedInput.split(' ');
            const cmd = words[0].substring(1).toLowerCase();
            detectedShortcut = shortcuts.find(s => s.id === cmd);
            
            if (detectedShortcut) {
                const remainingText = words.slice(1).join(' ');
                finalInput = `[INTRUKSI VISUALISASI: ${detectedShortcut.description}] ${remainingText || "Tampilkan visualisasi ini."}`;
            }
        }

            const activeContext = isContextEnabled && pageContext;
            const targetModel = (activeContext || isMultiModal) ? 'gpt-5-mini' : 'gpt-4.1';

            const userMessage = { 
                role: 'user', 
                content: finalInput,
                displayContent: input, // Tampilkan teks asli yang diketik user
                attachments: [...attachments],
                usedModel: selectedModel,
                shortcut: detectedShortcut?.id,
                isContextual: !!activeContext // Simpan status context pada pesan
            };

            setMessages(prev => [...prev, userMessage]);
            
            const currentInput = finalInput;
            const currentAttachments = [...attachments];
            
            setInput('');
            setAttachments([]);
            setActiveShortcut(null); 
            setIsLoading(true);

            try {
                // Persiapkan konten pesan (mendukung gambar/multi-modal)
                let currentMessageContent;
                if (isMultiModal) {
                    currentMessageContent = [
                        { type: 'text', text: currentInput || "Analisis lampiran berikut:" }
                    ];
                    currentAttachments.forEach(att => {
                        if (att.isImage) {
                            currentMessageContent.push({
                                type: 'image_url',
                                image_url: { url: att.data }
                            });
                        } else if (att.textContent) {
                            currentMessageContent[0].text += `\n\n--- Isi dari file ${att.name} ---\n${att.textContent}\n--- Akhir file ---`;
                        } else {
                            currentMessageContent[0].text += `\n\n[File dilampirkan: ${att.name}]`;
                        }
                    });
                } else {
                    currentMessageContent = currentInput;
                }

                // --- JALUR 1: ADVANCED (Hanya jika Context ON / Patient Detail) ---
                if (activeContext) {
                    setMessages(prev => [...prev, { 
                        role: 'ai', 
                        content: '', 
                        usedModel: targetModel,
                        isStreaming: true,
                        stage: 'thinking',
                        isContextual: true // Simpan status context pada pesan AI
                    }]);


                const sanitizedHistory = messages.slice(-10).map(m => ({
                    role: m.role === 'ai' ? 'assistant' : 'user',
                    content: (targetModel === 'gpt-5-mini' && Array.isArray(m.content)) 
                        ? (m.content.find(c => c.type === 'text')?.text || "") 
                        : m.content
                }));

                // Tahap 1: Drafting Medis (Analisis Konteks)
                const draftResponse = await fetch(COPILOT_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                    body: JSON.stringify({
                        model: 'gpt-5-mini', // Gunakan model reasoning untuk analisis data pasien
                        stream: false,
                        messages: [
                            { role: 'system', content: `Anda adalah AI Peneliti Medis yang sangat cerdas. Analisis data pasien dengan cermat.
TUGAS ANDA:
1. Berikan analisis klinis mendalam.
2. JIKA RELEVAN, sertakan VISUALISASI DATA INTERAKTIF (pilih tipe yang paling sesuai) dengan meletakkan tag XML pada BARIS BARU (beri 2x newline sebelum dan sesudah tag). List tipe yang didukung:
   - <MedicalChart type="trend" title="Tren Parameter Klinis" data='[{"time":"08:00","HR":70,"Hb":12,"Suhu":36.5},...]' /> (Line chart Multi-Parameter. Gunakan key deskriptif seperti "HR", "Hb", "GDS", dll. Selain "time", semua key akan digambar sebagai garis terpisah).
   - <MedicalChart type="radar" title="Profil Risiko" data='[{"subject":"HR","A":8},...]' /> (Spider web)
   - <MedicalChart type="heatmap" title="Peta Gejala" data='[{"name":"Nyeri","cells":[{"value":8},...]},...]' /> (Intensitas gejala)
   - <MedicalChart type="gauge" title="Vulnerability Score" data='[{"value":75}]' /> (Meteran %)
   - <MedicalChart type="anatomy" title="Fokus Fisik" data='["head","chest"]' /> (Highlight tubuh)
   - <MedicalChart type="simulation" title="Kadar Obat" data='[{"time":1,"level":100},...]' /> (Area chart)
   - <MedicalChart type="comparison" title="Delta Lab" data='[{"name":"Hb","delta":-10},...]' /> (Bar chart naik/turun)
   - <MedicalChart type="timeline" title="Respon Obat" data='[{"time":"10:00","vital":80,"drug":"Paracetamol"},...]' /> (Tren + marker obat)
   - <MedicalChart type="forecast" title="Prediksi Pemulihan" data='[{"day":1,"actual":60,"forecast":65},...]' /> (Garis nyata vs putus-putus)
   - <MedicalChart type="outliers" title="Analisis Outlier" data='[{"time":"09:00","param":"HR","value":140,"outlier":true},...]' /> (Tabel highlight)
   - <MedicalChart type="audit" title="Audit Klinis" data='[{"task":"Cek Infus","ok":true},...]' /> (Checklist)
   - <MedicalChart type="gantt" title="Rencana Tindakan" data='[{"time":"12:00","action":"Operasi","desc":"..."},...]' /> (Timeline vertikal)
   - <MedicalChart type="dashboard" title="Quick Filter" data='[{"label":"Harian"},{"label":"Kritis"}]' /> (Tombol filter)
3. PENTING: Gunakan <MedicalChart /> untuk menyajikan data terstruktur yang butuh analisis visual. JANGAN menduplikasi data yang sama dalam format Tabel Markdown biasa jika sudah menggunakan tag tersebut. Pilih salah satu (tag lebih disukai).
4. Tag <MedicalChart /> HARUS dipisahkan dari teks paragraf dengan baris kosong.
5. SELALU gunakan format **Markdown GFM Table** (| Header |) jika ingin menyajikan data tabel di luar tag <MedicalChart />.
6. BERIKAN output yang komprehensif dan profesional:
    - Narasi utama harus mencakup semua temuan klinis, terapi, dan rencana.
    - Jangan mengulang data yang sudah ada di tag <MedicalChart />.
    - Untuk type="outliers": maksimal 24 baris data.
    - Untuk type="heatmap": maksimal 8 baris x 12 kolom.
    - Untuk type="gantt": maksimal 10 item timeline.
7. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.` },
                            { role: 'system', content: `KONTEKS PASIEN:\n${pageContext}` },
                            ...sanitizedHistory,
                            { role: 'user', content: currentMessageContent }
                        ]
                    }),
                });

                const draftData = await draftResponse.json();
                const draftText = draftData.choices?.[0]?.message?.content || "";

                // Tahap 2: Refining (Penyajian Jawaban)
                setMessages(prev => {
                    if (prev.length === 0) return prev;
                    const lastIndex = prev.length - 1;
                    return prev.map((m, idx) =>
                        idx === lastIndex
                            ? { ...m, stage: 'refining', usedModel: 'gpt-4.1' }
                            : m
                    );
                });

                let refiningResponse = await fetch(COPILOT_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                    body: JSON.stringify({
                        model: 'gpt-4.1', // Mencoba GPT-4.1 terlebih dahulu
                        stream: false,
                        messages: [
                             { role: 'system', content: `Anda adalah Master Editor Medis. Poles draf menjadi sangat profesional, baku, dan BEBAS TYPO.
ATURAN KRUSIAL:
1. PERTAHANKAN semua tag <MedicalChart /> secara utuh. Jangan mengubah sintaks XML-nya. Pastikan ada baris kosong SEBELUM dan SESUDAH tag tersebut.
2. Poles teks narasi di sekitarnya agar estetik.
3. JANGAN PERNAH memberikan indentasi (spasi) di awal baris.
4. Gunakan Markdown GFM (Tabel, Bold, List).
5. JANGAN membuat awalan output seperti "Tentu...". Langsung ke jawaban.
6. PERTAHANKAN seluruh informasi klinis yang ada di draf, termasuk Temuan Penting, Terapi, dan Rencana. Jangan memangkas informasi medis yang krusial.
7. SELALU pastikan format **Markdown GFM Table** (| Header |) terjaga konsistensinya.
8. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.` },
                            { role: 'user', content: `Draf:\n${draftText}` }
                        ],
                    }),
                });

                // FALLBACK JIKA GPT-4.1 GAGAL
                if (!refiningResponse.ok) {
                    console.warn("GPT-4.1 failed, falling back to GPT-4o");
                    setMessages(prev => {
                        if (prev.length === 0) return prev;
                        const lastIndex = prev.length - 1;
                        return prev.map((m, idx) =>
                            idx === lastIndex
                                ? { ...m, usedModel: 'gpt-4o' }
                                : m
                        );
                    });
                    
                    refiningResponse = await fetch(COPILOT_WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            stream: false,
                            messages: [
                                { role: 'system', content: `Anda adalah Master Editor Medis (Fallback Mode). Poles draf menjadi profesional dan BEBAS TYPO. SELALU gunakan format **Markdown GFM Table** (| Header |) untuk data tabel.` },
                                { role: 'user', content: `Draf:\n${draftText}` }
                            ],
                        }),
                    });
                }

                if (!refiningResponse.ok) throw new Error("Gagal memperoleh jawaban akhir.");
                
                const refineData = await refiningResponse.json();
                const accRaw = refineData.choices?.[0]?.message?.content || "";
                
                // Unindent Agresif: Hapus semua spasi/tab di awal setiap baris 
                // agar ReactMarkdown tidak menganggapnya sebagai Code Block.
                let acc = accRaw;
                if (typeof acc === 'string') {
                    acc = acc.split('\n').map(line => line.trimStart()).join('\n').trim();
                }

                setMessages(prev => {
                    if (prev.length === 0) return prev;
                    const lastIndex = prev.length - 1;
                    return prev.map((m, idx) =>
                        idx === lastIndex
                            ? { ...m, stage: 'ready', content: acc }
                            : m
                    );
                });
            } 
            // --- JALUR 2: BASIC (Jika Context OFF / Gambar saja / Halaman Lain) ---
            else {
                setMessages(prev => [...prev, { 
                    role: 'ai', 
                    content: '', 
                    usedModel: targetModel,
                    isStreaming: true,
                    stage: 'ready',
                    isContextual: false // Mode basic tidak mendukung ekspor PDF visualisasi
                }]);


                const sanitizedHistory = messages.slice(-10).map(m => ({
                    role: m.role === 'ai' ? 'assistant' : 'user',
                    content: (targetModel === 'gpt-5-mini' && Array.isArray(m.content)) 
                        ? (m.content.find(c => c.type === 'text')?.text || "") 
                        : m.content
                }));

                const response = await fetch(COPILOT_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                    body: JSON.stringify({
                        model: targetModel,
                        stream: false,
                        messages: [
                            { role: 'system', content: 'Anda adalah Medx AI Agent. Anda adalah expert dunia kedokteran dan Anda adalah dokter senior. Jawablah secara ramah dan profesional. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.' },
                            ...sanitizedHistory,
                            { role: 'user', content: currentMessageContent }
                        ]
                    }),
                });

                if (!response.ok) throw new Error("Gagal mendapatkan jawaban.");
                const data = await response.json();
                
                const choice = data.choices?.[0];
                const msg = choice?.message;
                const accRaw = msg?.content || "";
                
                let acc = accRaw;
                if (typeof acc === 'string') {
                    // Unindent Agresif: Hapus semua spasi/tab di awal setiap baris
                    acc = acc.split('\n').map(line => line.trimStart()).join('\n').trim();
                }
                
                setMessages(prev => {
                    if (prev.length === 0) return prev;
                    const lastIndex = prev.length - 1;
                    return prev.map((m, idx) =>
                        idx === lastIndex
                            ? { ...m, content: acc }
                            : m
                    );
                });
            }

            // Finalisasi
            setMessages(prev => {
                if (prev.length === 0) return prev;
                const lastIndex = prev.length - 1;
                return prev.map((m, idx) =>
                    idx === lastIndex
                        ? { ...m, isStreaming: false, stage: 'completed' }
                        : m
                );
            });

        } finally {
            setIsLoading(false);
        }
    };

    const inferChartDimensions = useCallback((container) => {
        const rect = container.getBoundingClientRect();
        const vizContent = container.querySelector('.viz-content');
        const vizCanvasWrapper = container.querySelector('.viz-canvas-wrapper');
        const svg = container.querySelector('svg');
        const canvas = container.querySelector('canvas');

        const svgWidth = svg ? Number(svg.getAttribute('width')) || Number(svg.viewBox?.baseVal?.width) || 0 : 0;
        const svgHeight = svg ? Number(svg.getAttribute('height')) || Number(svg.viewBox?.baseVal?.height) || 0 : 0;
        const canvasWidth = canvas?.width || 0;
        const canvasHeight = canvas?.height || 0;

        const width = Math.max(
            vizContent?.scrollWidth || 0,
            vizCanvasWrapper?.scrollWidth || 0,
            container.scrollWidth || 0,
            container.offsetWidth || 0,
            rect.width || 0,
            svgWidth,
            canvasWidth,
            800,
        );

        const height = Math.max(
            container.scrollHeight || 0,
            container.offsetHeight || 0,
            vizContent?.scrollHeight || 0,
            vizCanvasWrapper?.scrollHeight || 0,
            rect.height || 0,
            svgHeight + 96,
            canvasHeight + 96,
            240,
        );

        return {
            width: Math.round(width),
            height: Math.round(height),
            hasRenderableNode: Boolean(
                svg || canvas ||
                container.querySelector('.recharts-wrapper') ||
                container.querySelector('table') ||
                container.querySelector('.viz-gantt-list') ||
                container.querySelector('.viz-audit-list') ||
                container.querySelector('.heatmap-compact-wrap') ||
                container.querySelector('.viz-dashboard-list')
            ),
        };
    }, []);

    const waitForChartReady = useCallback(async (container, {
        timeoutMs = COPILOT_PDF_PERF.waitTimeoutMs,
        pollMs = COPILOT_PDF_PERF.waitPollMs,
        stableCycles = COPILOT_PDF_PERF.waitStableCycles,
    } = {}) => {
        const initialDims = inferChartDimensions(container);
        if (initialDims.width > 0 && initialDims.height > 0 && initialDims.hasRenderableNode) {
            return { ready: true, width: initialDims.width, height: initialDims.height, hasRenderableNode: true, timedOut: false };
        }

        const start = Date.now();
        let stableCount = 0;
        let previousSignature = null;
        let lastMetrics = { width: 0, height: 0, hasRenderableNode: false, childElementCount: 0 };

        while ((Date.now() - start) < timeoutMs) {
            const dims = inferChartDimensions(container);
            const { width, height, hasRenderableNode } = dims;
            const childElementCount = container.querySelectorAll('*').length;
            
            // Stricter check for SVG charts:
            // Ensure they have actual content like <path> or <rect> or <circle>
            const svgEl = container.querySelector('svg');
            const hasActualData = !hasRenderableNode || (
                (svgEl ? svgEl.querySelectorAll('path, rect, circle, g.recharts-layer').length > 5 : true) &&
                (container.querySelector('table') ? container.querySelector('tbody tr') : true)
            );

            lastMetrics = { width, height, hasRenderableNode, childElementCount };

            if (width > 0 && height > 0 && hasActualData && (hasRenderableNode || childElementCount > 10)) {
                const signature = `${width}x${height}:${hasRenderableNode ? 'r' : 'n'}:${childElementCount}`;
                stableCount = signature === previousSignature ? stableCount + 1 : 1;
                previousSignature = signature;

                if (stableCount >= stableCycles) {
                    return { ready: true, width, height, hasRenderableNode, timedOut: false };
                }
            }

            await new Promise((resolve) => setTimeout(resolve, pollMs));
        }

        return {
            ready: false,
            width: lastMetrics.width,
            height: lastMetrics.height,
            hasRenderableNode: lastMetrics.hasRenderableNode,
            childElementCount: lastMetrics.childElementCount,
            timedOut: true,
        };
    }, [inferChartDimensions]);

    const captureChartContainer = useCallback(async (container, expectedChartKey = null) => {
        const chartKey = expectedChartKey || container.getAttribute('data-export-chart-key') || 'unknown';

        const getErrorMessage = (err) => {
            if (!err) return 'unknown-error';
            if (typeof err === 'string') return err;
            return err.message || err.name || 'unknown-error';
        };

        const rgbaToSolidRgb = (rgbaValue, minAlpha = 0.72) => {
            if (typeof rgbaValue !== 'string') return null;
            const match = rgbaValue.trim().match(/^rgba?\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})(?:\s*,\s*([0-9]*\.?[0-9]+))?\s*\)$/i);
            if (!match) return null;

            const r = Math.max(0, Math.min(255, Number(match[1])));
            const g = Math.max(0, Math.min(255, Number(match[2])));
            const b = Math.max(0, Math.min(255, Number(match[3])));
            const alphaRaw = Number(match[4]);
            const alpha = Number.isFinite(alphaRaw) ? Math.max(0, Math.min(1, alphaRaw)) : 1;
            const boostedAlpha = Math.max(minAlpha, alpha);

            const solidR = Math.round(255 - ((255 - r) * boostedAlpha));
            const solidG = Math.round(255 - ((255 - g) * boostedAlpha));
            const solidB = Math.round(255 - ((255 - b) * boostedAlpha));
            return `rgb(${solidR}, ${solidG}, ${solidB})`;
        };

        const normalizeOpacityAttribute = (node, attrName, minValue) => {
            const raw = node.getAttribute(attrName);
            if (raw == null) return;
            const numeric = Number(raw);
            if (!Number.isFinite(numeric)) return;
            const bounded = Math.max(minValue, Math.min(1, numeric));
            node.setAttribute(attrName, String(bounded));
        };

        const normalizeSvgForPdf = (svgRoot, originalRoot = null) => {
            if (!svgRoot) return;

            svgRoot.style.background = '#ffffff';
            svgRoot.style.fontFamily = 'Inter, system-ui, sans-serif';

            // Map styles from live nodes to the clone
            const targetNodes = Array.from(svgRoot.querySelectorAll('*'));
            const sourceNodes = originalRoot ? Array.from(originalRoot.querySelectorAll('*')) : [];

            targetNodes.forEach((node, i) => {
                if (!node || node.nodeType !== 1) return;
                try {
                    const sourceNode = sourceNodes[i] || node;
                    // Only compute style if it's a different node (the source)
                    const cs = sourceNode !== node ? window.getComputedStyle(sourceNode) : null;
                    
                    if (cs) {
                        const fill = cs.fill;
                        const stroke = cs.stroke;
                        const fontSize = cs.fontSize;
                        const fontWeight = cs.fontWeight;
                        const opacity = cs.opacity;

                        if (fill && fill !== 'none' && fill !== 'rgba(0, 0, 0, 0)') node.setAttribute('fill', fill);
                        if (stroke && stroke !== 'none' && stroke !== 'rgba(0, 0, 0, 0)') node.setAttribute('stroke', stroke);
                        if (fontSize) node.style.fontSize = fontSize;
                        if (fontWeight) node.style.fontWeight = fontWeight;
                        if (opacity && opacity !== '1') node.setAttribute('opacity', opacity);
                    }
                } catch { /* skip if getComputedStyle fails */ }
            });

            svgRoot.querySelectorAll('.recharts-cartesian-grid line, .recharts-cartesian-grid path').forEach((node) => {
                node.setAttribute('stroke', '#cbd5e1');
                node.setAttribute('stroke-opacity', '0.6');
            });

            svgRoot.querySelectorAll('.recharts-polar-grid-angle line, .recharts-polar-grid-concentric circle, .recharts-polar-grid-concentric polygon').forEach((node) => {
                node.setAttribute('stroke', '#cbd5e1');
                node.setAttribute('stroke-opacity', '0.8');
            });

            svgRoot.querySelectorAll('.recharts-radar-polygon').forEach((node) => {
                node.setAttribute('fill-opacity', '0.6');
                node.setAttribute('stroke-opacity', '1');
            });

            svgRoot.querySelectorAll('line[stroke-dasharray], path[stroke-dasharray]').forEach((node) => {
                normalizeOpacityAttribute(node, 'stroke-opacity', 0.86);
                normalizeOpacityAttribute(node, 'opacity', 0.86);
            });

            svgRoot.querySelectorAll('*').forEach((node) => {
                // EXEMPTION: Do not crush opacity for text elements
                const isText = node.tagName.toLowerCase() === 'text' || node.tagName.toLowerCase() === 'tspan';
                const isRadarPolygon = node.classList.contains('recharts-radar-polygon');

                if (!isText && !isRadarPolygon) {
                    normalizeOpacityAttribute(node, 'fill-opacity', 0.55);
                    normalizeOpacityAttribute(node, 'stroke-opacity', 0.8);
                    normalizeOpacityAttribute(node, 'stop-opacity', 0.45);
                    normalizeOpacityAttribute(node, 'opacity', 0.8);

                    ['fill', 'stroke', 'stop-color'].forEach((attrName) => {
                        const raw = node.getAttribute(attrName);
                        if (!raw) return;
                        const solid = rgbaToSolidRgb(raw, 0.72);
                        if (solid) {
                            node.setAttribute(attrName, solid);
                        }
                    });
                }
            });
        };

        const normalizeContainerForPdf = (rootNode, originalRoot = null, { width, height } = {}) => {
            if (!rootNode) return;

            rootNode.setAttribute('data-export-render-intent', 'pdf');
            rootNode.style.background = '#ffffff';
            rootNode.style.opacity = '1';
            rootNode.style.boxShadow = 'none';
            rootNode.style.overflow = 'visible';

            const scroller = rootNode.querySelector('.viz-content');
            if (scroller) {
                scroller.style.overflow = 'visible';
                scroller.style.background = '#ffffff';
            }

            const canvasWrapper = rootNode.querySelector('.viz-canvas-wrapper');
            if (canvasWrapper) {
                canvasWrapper.style.overflow = 'visible';
                canvasWrapper.style.minWidth = '0';
                canvasWrapper.style.padding = '0';
                canvasWrapper.style.alignItems = 'stretch';
                canvasWrapper.style.width = '100%';
            }

            const tableContainer = rootNode.querySelector('.table-flow-container');
            if (tableContainer) {
                tableContainer.style.overflow = 'visible';
                tableContainer.style.width = '100%';
            }

            rootNode.querySelectorAll('.heatmap-compact-wrap').forEach((el) => {
                el.style.width = '100%';
                el.style.overflow = 'visible';
            });
            rootNode.querySelectorAll('.heatmap-legend').forEach((el) => {
                el.style.overflow = 'visible';
                el.style.width = '100%';
                el.style.display = 'flex';
                el.style.justifyContent = 'space-between';
                el.style.whiteSpace = 'nowrap';
                el.style.paddingRight = '4px';
            });
            rootNode.querySelectorAll('.heatmap-compact-grid, .viz-gantt-list, .viz-audit-list, .viz-dashboard-list').forEach((el) => {
                el.style.width = '100%';
                el.style.overflow = 'visible';
            });

            // Recharts responsive container width forcing
            rootNode.querySelectorAll('.recharts-responsive-container').forEach((rc) => {
                const targetWidth = width || rootNode.offsetWidth || 800; 
                rc.style.width = `${targetWidth}px`;
                rc.style.minWidth = `${targetWidth}px`;
            });

            rootNode.querySelectorAll('.viz-canvas-wrapper, .heatmap-compact-wrap, .viz-content').forEach((el) => {
                el.style.overflow = 'visible';
                el.style.paddingBottom = '48px';
            });

            rootNode.querySelectorAll('.recharts-legend-wrapper').forEach((leg) => {
                leg.style.bottom = '-8px'; 
            });
            
            if (height) {
                const calculatedMinHeight = height + 48; 
                rootNode.style.minHeight = `${calculatedMinHeight}px`;
                rootNode.style.height = 'auto';
            }
            rootNode.style.overflow = 'visible';
            rootNode.setAttribute('data-pdf-export', 'true');

            rootNode.querySelectorAll('.heatmap-cell').forEach((cell) => {
                const raw = cell.style.backgroundColor;
                const solid = rgbaToSolidRgb(raw, 0.82) || '#3b82f6';
                cell.style.backgroundColor = solid;
                cell.style.borderColor = rgbaToSolidRgb(cell.style.borderColor, 0.9) || '#fff';
            });

            rootNode.querySelectorAll('.audit-cell-val').forEach((cell) => {
                cell.style.whiteSpace = 'nowrap';
                cell.style.overflow = 'visible';
            });

            rootNode.querySelectorAll('.viz-outlier-row-high').forEach((row) => {
                row.style.background = '#fee2e2';
                row.style.color = '#b91c1c';
            });

            rootNode.querySelectorAll('.viz-gantt-item').forEach((item) => {
                item.style.borderLeftColor = '#60a5fa';
            });

            rootNode.querySelectorAll('*').forEach((el) => {
                el.style.transition = 'none';
                el.style.animation = 'none';
            });

            const originalSvgs = originalRoot ? originalRoot.querySelectorAll('svg') : [];
            rootNode.querySelectorAll('svg').forEach((svg, idx) => {
                normalizeSvgForPdf(svg, originalSvgs[idx] || null);
            });
        };

        const isCanvasMostlyBlank = (canvas) => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return true;

            const width = canvas.width;
            const height = canvas.height;
            if (width < 2 || height < 2) return true;

            // Sample from y=120px to avoid headers (title/icon) which are almost 
            // always colored and cause false-detection for blank charts.
            const startY = Math.max(120, Math.floor(height * 0.15));
            const endY = Math.floor(height * 0.9);
            const startX = Math.floor(width * 0.05);
            const endX = Math.floor(width * 0.95);

            const samplesX = 80;
            const samplesY = 80;
            const stepX = Math.max(1, Math.floor((endX - startX) / samplesX));
            const stepY = Math.max(1, Math.floor((endY - startY) / samplesY));

            let colored = 0;

            for (let y = startY; y < endY; y += stepY) {
                for (let x = startX; x < endX; x += stepX) {
                    const p = ctx.getImageData(x, y, 1, 1).data;
                    const r = p[0], g = p[1], b = p[2], a = p[3];
                    
                    if (a < 40) continue; 
                    if (r > 250 && g > 250 && b > 250) continue; 

                    // Skip light grays/grid
                    const isGray = Math.abs(r - g) < 15 && Math.abs(g - b) < 15 && Math.abs(r - b) < 15;
                    if (isGray && r > 190) continue;

                    colored++;
                    if (colored >= 6) return false; 
                }
            }

            return colored < 6;
        };

        const captureFromChartSvg = async () => {
            const svgNode =
                container.querySelector('.recharts-wrapper svg') ||
                container.querySelector('svg.recharts-surface') ||
                container.querySelector('svg');

            if (!svgNode) {
                throw new Error('svg-node-not-found');
            }

            const rect = svgNode.getBoundingClientRect();
            const viewBox = svgNode.viewBox?.baseVal;
            // Use a minimum width of 700px for good PDF quality regardless of viewport
            const PDF_SVG_MIN_WIDTH = 700;
            const naturalWidth = Math.max(
                Math.round(rect.width || 0),
                Math.round(viewBox?.width || 0),
                Number(svgNode.getAttribute('width')) || 0,
                600,
            );
            const naturalHeight = Math.max(
                Math.round(rect.height || 0),
                Math.round(viewBox?.height || 0),
                Number(svgNode.getAttribute('height')) || 0,
                260,
            );
            // Scale up to at least PDF_SVG_MIN_WIDTH for better PDF rendering
            const upscaleFactor = naturalWidth < PDF_SVG_MIN_WIDTH ? PDF_SVG_MIN_WIDTH / naturalWidth : 1;
            const width = Math.round(naturalWidth * upscaleFactor);
            const height = Math.round(naturalHeight * upscaleFactor);

            const svgClone = svgNode.cloneNode(true);
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            svgClone.setAttribute('width', String(width));
            svgClone.setAttribute('height', String(height));
            // Ensure viewBox is set so the SVG scales properly
            if (!svgClone.getAttribute('viewBox') && viewBox) {
                svgClone.setAttribute('viewBox', `${viewBox.x} ${viewBox.y} ${viewBox.width} ${viewBox.height}`);
            } else if (!svgClone.getAttribute('viewBox')) {
                svgClone.setAttribute('viewBox', `0 0 ${naturalWidth} ${naturalHeight}`);
            }
            normalizeSvgForPdf(svgClone, svgNode);

            const serialized = new XMLSerializer().serializeToString(svgClone);
            const blob = new Blob([serialized], { type: 'image/svg+xml;charset=utf-8' });
            const url = URL.createObjectURL(blob);

            try {
                const image = await new Promise((resolve, reject) => {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error('svg-image-load-failed'));
                    img.src = url;
                });

                const canvas = document.createElement('canvas');
                canvas.width = width * COPILOT_PDF_PERF.svgRenderScale;
                canvas.height = height * COPILOT_PDF_PERF.svgRenderScale;
                const ctx = canvas.getContext('2d');
                if (!ctx) {
                    throw new Error('svg-canvas-context-missing');
                }

                ctx.fillStyle = '#ffffff';
                ctx.fillRect(0, 0, canvas.width, canvas.height);
                ctx.drawImage(image, 0, 0, canvas.width, canvas.height);

                if (isCanvasMostlyBlank(canvas)) {
                    throw new Error('svg-capture-blank');
                }

                const imgData = canvas.toDataURL('image/png');
                if (!imgData || !imgData.startsWith('data:image/png;base64,')) {
                    throw new Error('svg-invalid-image-data');
                }

                return imgData;
            } finally {
                URL.revokeObjectURL(url);
            }
        };

        // Detect mobile/tablet once; used to lower canvas scale and avoid
        // WebKit memory limits that cause blank captures on iOS/iPadOS.
        // Phones get scale 1, iPads/large tablets get scale 1.5 for better PDF quality.
        const isPhone = window.innerWidth < 768 || /iPhone|iPod/.test(navigator.userAgent);
        const isTablet = (window.innerWidth >= 768 && window.innerWidth <= 1024) || /iPad/.test(navigator.userAgent) || (navigator.maxTouchPoints > 1 && /Macintosh/.test(navigator.userAgent));
        const isMobileOrTablet = isPhone || isTablet || window.innerWidth <= 1024 || /Android/.test(navigator.userAgent);
        const captureScale = isPhone ? 1 : (isMobileOrTablet ? 1.5 : COPILOT_PDF_PERF.captureScale);
        const cloneSettleMs = isMobileOrTablet ? COPILOT_PDF_PERF.bodyCloneSettleMsMobile : COPILOT_PDF_PERF.bodyCloneSettleMsDesktop;

        /**
         * Force all Recharts ResponsiveContainer wrappers and their children
         * to render at the given target width. This is critical on mobile/iPad
         * because cloned DOM nodes retain their original narrow viewport
         * dimensions, and ResponsiveContainer's ResizeObserver doesn't fire
         * on detached/cloned nodes.
         */
        const forceResponsiveContainerWidth = (cloneRoot, targetWidth) => {
            if (!cloneRoot) return;
            // ResponsiveContainer renders a wrapper div with class "recharts-responsive-container"
            cloneRoot.querySelectorAll('.recharts-responsive-container').forEach(rc => {
                rc.style.width = `${targetWidth}px`;
                rc.style.maxWidth = 'none';
                rc.style.minWidth = `${targetWidth}px`;
                rc.style.height = rc.style.height || '300px';
            });
            // Also force the recharts-wrapper (actual SVG container)
            cloneRoot.querySelectorAll('.recharts-wrapper').forEach(rw => {
                rw.style.width = `${targetWidth}px`;
                rw.style.minWidth = `${targetWidth}px`;
                const svg = rw.querySelector('svg');
                if (svg) {
                    svg.setAttribute('width', String(targetWidth));
                    // Preserve aspect ratio by scaling height proportionally
                    const origW = Number(svg.getAttribute('width')) || targetWidth;
                    const origH = Number(svg.getAttribute('height')) || 300;
                    if (origW > 0 && origW < targetWidth) {
                        const scaledH = Math.round(origH * (targetWidth / origW));
                        svg.setAttribute('height', String(scaledH));
                    }
                }
            });
            // Force viz-canvas-wrapper children to expand
            cloneRoot.querySelectorAll('.viz-canvas-wrapper > div').forEach(el => {
                el.style.width = `${targetWidth}px`;
                el.style.minWidth = `${targetWidth}px`;
            });
            // Force viz-canvas-wrapper itself
            cloneRoot.querySelectorAll('.viz-canvas-wrapper').forEach(el => {
                el.style.width = `${targetWidth}px`;
                el.style.minWidth = '0';
                el.style.padding = '0';
            });
            // Force gauge-container to have proper dimensions
            cloneRoot.querySelectorAll('.gauge-container').forEach(el => {
                el.style.width = `${targetWidth}px`;
                el.style.minWidth = `${Math.min(targetWidth, 400)}px`;
                el.style.minHeight = '200px';
            });
            // Force outlier-container to expand
            cloneRoot.querySelectorAll('.outlier-container, .outlier-chart-wrap').forEach(el => {
                el.style.width = `${targetWidth}px`;
            });
        };

        const captureElement = async (target, { width, height, label, useOffscreenClone = false }) => {
            if (!target) {
                throw new Error(`capture-target-missing:${label}`);
            }

            const safeWidth = Math.min(COPILOT_PDF_PERF.maxCaptureWidth, Math.max(320, Math.round(width || target.scrollWidth || target.offsetWidth || 0)));
            const safeHeight = Math.min(COPILOT_PDF_PERF.maxCaptureHeight, Math.max(180, Math.round(height || target.scrollHeight || target.offsetHeight || 0)));
            const captureW = Math.max(safeWidth, COPILOT_PDF_PERF.pdfCloneMinWidth);

            let captureTarget = target;
            let sandbox = null;

            if (useOffscreenClone) {
                sandbox = document.createElement('div');
                sandbox.style.cssText = [
                    'position:absolute', 'left:0', 'top:0', 'pointer-events:none', 'z-index:-9999',
                    `width:${captureW}px`, `height:${safeHeight}px`, 'overflow:visible',
                    'background:#fff', 'opacity:0.03'
                ].join(';');

                const cloned = target.cloneNode(true);
                cloned.style.cssText = [
                    `width:${captureW}px`, `min-width:${captureW}px`, `min-height:${safeHeight}px`,
                    'background:#fff', 'opacity:1', 'display:block'
                ].join(';');

                sandbox.appendChild(cloned);
                document.body.appendChild(sandbox);

                // Pass original target to normalize styles in clone
                normalizeContainerForPdf(cloned, target, { width: captureW, height: safeHeight });
                forceResponsiveContainerWidth(cloned, captureW);

                await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
                await new Promise(r => setTimeout(r, cloneSettleMs));

                // Extra wait if SVG is still empty
                const svgInClone = cloned.querySelector('svg');
                if (svgInClone && svgInClone.childElementCount < 3) {
                    await new Promise(r => setTimeout(r, 600));
                }
                captureTarget = cloned;
            }

            try {
                const canvas = await html2canvas(captureTarget, {
                    backgroundColor: '#ffffff',
                    scale: captureScale,
                    logging: false,
                    useCORS: true,
                    allowTaint: false,
                    width: captureW,
                    height: safeHeight,
                    windowWidth: Math.max(captureW, COPILOT_PDF_PERF.pdfCloneMinWidth),
                    scrollX: 0,
                    scrollY: 0,
                    onclone: (clonedDoc) => {
                        const selector = `[data-export-chart-key="${chartKey}"]`;
                        const clonedContainer = clonedDoc.querySelector(selector) || clonedDoc.querySelector('.clinical-viz-container');
                        if (clonedContainer) {
                            normalizeContainerForPdf(clonedContainer, target);
                            forceResponsiveContainerWidth(clonedContainer, captureW);
                        }
                    }
                });

                if (isCanvasMostlyBlank(canvas)) {
                    throw new Error(`blank-capture:${label}`);
                }

                const imgData = canvas.toDataURL('image/png');
                if (!imgData || !imgData.startsWith('data:image/png;base64,')) {
                    throw new Error(`invalid-image-data:${label}`);
                }
                return imgData;
            } finally {
                if (sandbox && sandbox.parentNode) {
                    sandbox.parentNode.removeChild(sandbox);
                }
            }
        };

        const dims = inferChartDimensions(container);
        const vizContent = container.querySelector('.viz-content');
        const vizCanvasWrapper = container.querySelector('.viz-canvas-wrapper');
        const rechartsWrapper = container.querySelector('.recharts-wrapper');

        const originalWidth = container.style.width;
        const originalPosition = container.style.position || '';
        const originalMinHeight = container.style.minHeight || '';
        const originalDisplay = container.style.display || '';

        container.style.width = `${dims.width}px`;
        container.style.position = 'relative';
        container.style.minHeight = `${dims.height}px`;
        container.style.display = 'block';

        // Brief delay to ensure ResponsiveContainer triggers layout
        await new Promise(r => setTimeout(r, 150));

        // Capture strategy 4: Body-mounted clone
        // For DOM-only charts (gantt, dashboard, audit, heatmap, outliers) that have no SVG
        // and fail in html2canvas's iframe clone. We mount a styled clone on document.body.
        const captureFromBodyClone = async () => {
            // Use PDF-quality minimum width so charts render well on mobile/iPad.
            const cloneWidth = Math.max(dims.width, COPILOT_PDF_PERF.pdfCloneMinWidth);

            const sandbox = document.createElement('div');
            sandbox.style.cssText = [
                'position:absolute', 'left:0', 'top:0', 'pointer-events:none', 'z-index:-9999',
                `width:${cloneWidth}px`, 'min-height:80px', 'background:#fff', 'opacity:0.03',
                'overflow:visible', 'padding:0', 'margin:0', 'font-family:Inter,system-ui,sans-serif',
            ].join(';');

            const cloned = container.cloneNode(true);
            cloned.style.cssText = [
                `width:${cloneWidth}px`, `min-width:${cloneWidth}px`, 'background:#fff',
                'opacity:1', 'display:block', 'box-shadow:none', 'margin:0', 'padding:16px 16px 48px 16px'
            ].join(';');

            sandbox.appendChild(cloned);
            document.body.appendChild(sandbox);

            normalizeContainerForPdf(cloned, container, { width: cloneWidth, height: dims.height });
            forceResponsiveContainerWidth(cloned, cloneWidth);

            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            await new Promise(r => setTimeout(r, cloneSettleMs));

            try {
                // Wait specifically for SVG content if this is a Recharts chart
                const svgInClone = cloned.querySelector('svg');
                if (svgInClone && svgInClone.childElementCount < 3) {
                    await new Promise(r => setTimeout(r, 800));
                }
                const canvas = await html2canvas(cloned, {
                    backgroundColor: '#ffffff',
                    scale: captureScale,
                    logging: false,
                    useCORS: true,
                    allowTaint: false,
                    width: cloneWidth,
                    height: cloned.offsetHeight || dims.height + 64,
                    windowWidth: Math.max(cloneWidth, COPILOT_PDF_PERF.pdfCloneMinWidth),
                    scrollX: 0,
                    scrollY: 0,
                    onclone: (clonedDoc) => {
                        const selector = `[data-export-chart-key="${chartKey}"]`;
                        const innerCloned = clonedDoc.querySelector(selector) || clonedDoc.querySelector('.medical-chart-container');
                        if (innerCloned) {
                            normalizeContainerForPdf(innerCloned, container, { width: cloneWidth, height: dims.height });
                            forceResponsiveContainerWidth(innerCloned, cloneWidth);
                        }
                    },
                });

                if (isCanvasMostlyBlank(canvas)) {
                    throw new Error('body-clone-capture-blank');
                }

                const imgData = canvas.toDataURL('image/png');
                if (!imgData || !imgData.startsWith('data:image/png;base64,')) {
                    throw new Error('body-clone-invalid-image-data');
                }
                return imgData;
            } finally {
                if (sandbox.parentNode) sandbox.parentNode.removeChild(sandbox);
            }
        };

        // If no SVG/recharts element exists, this is a DOM-only chart (gantt, dashboard, audit, etc.)
        // Skip the iframe-based strategies that always fail for pure HTML charts.
        const hasSvg = !!container.querySelector('svg, .recharts-wrapper');

        // On mobile/iPad the iframe-based strategies (container-direct, chart-node-direct) always
        // fail with "Unable to find element in cloned iframe" due to a Safari/WebKit limitation
        // in html2canvas. Skip them entirely and go straight to body-clone → svg-serialize.
        // On desktop, keep the original order for maximum compatibility.
        const strategies = hasSvg
            ? isMobileOrTablet
                ? [
                    // Mobile/iPad: body-clone first (most reliable), then SVG serialization
                    { target: container, width: dims.width, height: dims.height, label: 'body-clone', useOffscreenClone: false, customRun: captureFromBodyClone },
                    { target: container, width: dims.width, height: dims.height, label: 'svg-serialize', useOffscreenClone: false, customRun: captureFromChartSvg },
                ]
                : [
                    // Desktop: iframe strategies first (fast), then body-clone, then SVG
                    { target: container, width: dims.width, height: dims.height, label: 'container-direct', useOffscreenClone: false },
                    { target: vizCanvasWrapper || rechartsWrapper || vizContent || container, width: dims.width, height: dims.height, label: 'chart-node-direct', useOffscreenClone: false },
                    { target: container, width: dims.width, height: dims.height, label: 'svg-serialize', useOffscreenClone: false, customRun: captureFromChartSvg },
                    { target: container, width: dims.width, height: dims.height, label: 'body-clone', useOffscreenClone: false, customRun: captureFromBodyClone },
                ]
            : [
                // DOM-only: go straight to body-clone
                { target: container, width: dims.width, height: dims.height, label: 'body-clone', useOffscreenClone: false, customRun: captureFromBodyClone },
            ];

        let lastError = null;
        try {
            for (const strategy of strategies) {
                try {
                    if (typeof strategy.customRun === 'function') {
                        return await strategy.customRun();
                    }
                    return await captureElement(strategy.target, strategy);
                } catch (err) {
                    lastError = err;
                    console.warn('[PDF Export] capture strategy failed', {
                        chartKey,
                        strategy: strategy.label,
                        error: getErrorMessage(err),
                    });
                }
            }
        } finally {
            container.style.width = originalWidth;
            container.style.position = originalPosition;
            container.style.minHeight = originalMinHeight;
            container.style.display = originalDisplay;
            // Cleanup export flag
            if (typeof window !== 'undefined') {
                window.__PDF_EXPORT_MODE__ = false;
                document.documentElement.removeAttribute('data-pdf-export');
            }
        }

        throw lastError || new Error('capture-all-strategies-failed');
    }, [inferChartDimensions]);

    const buildStaticChartFallbackImage = useCallback((chartSegment) => {
        const type = String(chartSegment?.attributes?.type || 'unknown').toLowerCase();
        const title = chartSegment?.attributes?.title || `Visualisasi ${type}`;
        const rawData = chartSegment?.attributes?.data;

        let parsedData = [];
        try {
            parsedData = typeof rawData === 'string' ? JSON.parse(rawData) : (Array.isArray(rawData) ? rawData : []);
        } catch {
            parsedData = [];
        }

        const canvas = document.createElement('canvas');
        canvas.width = COPILOT_PDF_PERF.fallbackCanvasWidth;
        canvas.height = COPILOT_PDF_PERF.fallbackCanvasHeight;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
            return null;
        }

        const drawHeader = () => {
            ctx.fillStyle = '#ffffff';
            ctx.fillRect(0, 0, canvas.width, canvas.height);
            ctx.strokeStyle = '#dbe7ff';
            ctx.lineWidth = 2;
            ctx.strokeRect(20, 20, canvas.width - 40, canvas.height - 40);

            ctx.fillStyle = '#136dec';
            ctx.font = 'bold 34px Arial';
            ctx.fillText(String(title).toUpperCase(), 48, 84);

            ctx.strokeStyle = '#e5edf9';
            ctx.lineWidth = 2;
            ctx.beginPath();
            ctx.moveTo(42, 106);
            ctx.lineTo(canvas.width - 42, 106);
            ctx.stroke();

            ctx.fillStyle = '#64748b';
            ctx.font = '22px Arial';
            ctx.fillText(`Jenis: ${type}`, 48, 148);
        };

        const drawOutliers = () => {
            const rows = Array.isArray(parsedData) ? parsedData.slice(0, 16) : [];
            const startY = 190;
            const colX = [48, 340, 760, 1120];

            ctx.fillStyle = '#0f172a';
            ctx.font = 'bold 22px Arial';
            ctx.fillText('Waktu', colX[0], startY);
            ctx.fillText('Parameter', colX[1], startY);
            ctx.fillText('Nilai', colX[2], startY);
            ctx.fillText('Status', colX[3], startY);

            let y = startY + 34;
            rows.forEach((row, idx) => {
                if (idx % 2 === 0) {
                    ctx.fillStyle = '#f8fafc';
                    ctx.fillRect(40, y - 22, canvas.width - 80, 34);
                }
                ctx.fillStyle = '#1e293b';
                ctx.font = '20px Arial';
                ctx.fillText(String(row?.time || '-'), colX[0], y);
                ctx.fillText(String(row?.param || '-'), colX[1], y);
                ctx.fillText(String(row?.value ?? '-'), colX[2], y);
                ctx.fillStyle = row?.outlier ? '#dc2626' : '#16a34a';
                ctx.fillText(row?.outlier ? 'Outlier' : 'Normal', colX[3], y);
                y += 36;
            });
        };

        const drawAudit = () => {
            const rows = Array.isArray(parsedData) ? parsedData.slice(0, 18) : [];
            let y = 190;
            rows.forEach((row) => {
                ctx.fillStyle = '#ffffff';
                ctx.strokeStyle = '#e2e8f0';
                ctx.lineWidth = 1;
                ctx.fillRect(48, y - 24, canvas.width - 96, 46);
                ctx.strokeRect(48, y - 24, canvas.width - 96, 46);

                ctx.fillStyle = row?.ok ? '#16a34a' : '#dc2626';
                ctx.font = 'bold 24px Arial';
                ctx.fillText(row?.ok ? 'OK' : 'MISSING', 70, y + 6);

                ctx.fillStyle = '#1e293b';
                ctx.font = '20px Arial';
                ctx.fillText(String(row?.task || '-'), 240, y + 6);
                y += 52;
            });
        };

        const drawGantt = () => {
            const rows = Array.isArray(parsedData) ? parsedData.slice(0, 10) : [];
            let y = 190;

            ctx.strokeStyle = '#93c5fd';
            ctx.lineWidth = 4;
            ctx.beginPath();
            ctx.moveTo(74, y - 18);
            ctx.lineTo(74, y + rows.length * 66);
            ctx.stroke();

            rows.forEach((row) => {
                ctx.fillStyle = '#136dec';
                ctx.beginPath();
                ctx.arc(74, y - 4, 8, 0, Math.PI * 2);
                ctx.fill();

                ctx.fillStyle = '#136dec';
                ctx.font = 'bold 17px Arial';
                ctx.fillText(String(row?.time || '-'), 98, y - 8);

                ctx.fillStyle = '#0f172a';
                ctx.font = 'bold 22px Arial';
                ctx.fillText(String(row?.action || '-'), 98, y + 20);

                ctx.fillStyle = '#475569';
                ctx.font = '18px Arial';
                ctx.fillText(String(row?.desc || '-'), 98, y + 44);
                y += 66;
            });
        };

        const drawHeatmap = () => {
            const rows = Array.isArray(parsedData) ? parsedData : [];
            const safeRows = rows
                .map((row) => ({
                    name: row?.name || row?.label || '-',
                    cells: Array.isArray(row?.cells) ? row.cells : [],
                }))
                .filter((row) => row.cells.length > 0)
                .slice(0, 8);

            const maxCols = Math.max(1, Math.min(12, ...safeRows.map((row) => row.cells.length)));
            const paramWidth = 250; // width untuk parameter names
            const cellW = Math.floor((canvas.width - paramWidth - 40) / maxCols);
            const cellH = 52;
            let y = 145;

            // Draw legend at top
            ctx.fillStyle = '#64748b';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('0 = rendah', 48, y);
            ctx.fillText('10 = tinggi', canvas.width - 180, y);

            y += 30;

            // Draw column headers
            ctx.fillStyle = '#475569';
            ctx.font = 'bold 14px Arial';
            ctx.fillText('Parameter', 48, y);
            const headers = new Array(maxCols).fill(0).map((_, idx) => {
                for (const row of safeRows) {
                    const label = row.cells[idx]?.label;
                    if (label) return String(label).slice(0, 8);
                }
                return `T${idx + 1}`;
            });
            headers.forEach((header, idx) => {
                const textW = ctx.measureText(header).width;
                ctx.fillText(header, paramWidth + 20 + (idx * cellW) + (cellW / 2) - (textW / 2), y);
            });

            y += 28;

            // Draw data rows with cells and values
            safeRows.forEach((row) => {
                // Draw parameter name with proper clipping if too long
                ctx.fillStyle = '#334155';
                ctx.font = '14px Arial';
                const paramName = row.name.length > 42 ? row.name.slice(0, 42) + '...' : row.name;
                ctx.fillText(paramName, 48, y + 30);

                // Draw cells with values
                row.cells.slice(0, maxCols).forEach((cell, cIdx) => {
                    const value = Number(cell?.value);
                    const safeVal = Number.isFinite(value) ? Math.max(0, Math.min(10, value)) : 0;
                    const intensity = safeVal / 10;
                    const red = Math.round(219 - (200 * intensity));
                    const green = Math.round(234 - (124 * intensity));
                    const blue = Math.round(254 - (18 * intensity));
                    
                    // Draw colored cell
                    ctx.fillStyle = `rgb(${red}, ${green}, ${blue})`;
                    ctx.fillRect(paramWidth + 20 + (cIdx * cellW), y, cellW - 8, cellH - 8);

                    // Draw cell value
                    ctx.fillStyle = '#0f172a';
                    ctx.font = 'bold 16px Arial';
                    const valueText = Number.isFinite(value) ? value.toFixed(0) : '-';
                    const valW = ctx.measureText(valueText).width;
                    ctx.fillText(valueText, paramWidth + 20 + (cIdx * cellW) + (cellW / 2) - (valW / 2) - 4, y + 30);
                });
                y += cellH;
            });

            // Draw truncation note if applicable
            const hasMoreRows = rows.length > safeRows.length;
            const hasMoreCols = Math.max(...safeRows.map((r) => r.cells.length)) > maxCols;
            if (hasMoreRows || hasMoreCols) {
                y += 12;
                ctx.fillStyle = '#64748b';
                ctx.font = 'italic 12px Arial';
                ctx.fillText('Tampilan dipadatkan untuk keterbacaan. Data lengkap tetap tersimpan pada respons.', 48, y);
            }
        };

        const drawDashboard = () => {
            const rows = Array.isArray(parsedData) ? parsedData.slice(0, 14) : [];
            let x = 48;
            let y = 220;
            rows.forEach((row, idx) => {
                const label = String(row?.label || `Filter ${idx + 1}`);
                const width = Math.max(140, Math.min(320, ctx.measureText(label).width + 42));

                if (x + width > canvas.width - 48) {
                    x = 48;
                    y += 66;
                }

                ctx.fillStyle = idx === 0 ? '#136dec' : '#e0ecff';
                ctx.fillRect(x, y, width, 46);
                ctx.strokeStyle = '#136dec';
                ctx.strokeRect(x, y, width, 46);
                ctx.fillStyle = idx === 0 ? '#ffffff' : '#136dec';
                ctx.font = 'bold 18px Arial';
                ctx.fillText(label, x + 16, y + 30);
                x += width + 14;
            });
        };

        const drawTrend = (xKey = 'time') => {
            const points = Array.isArray(parsedData) ? parsedData.slice(0, 30) : [];
            if (points.length === 0) return;
            const padL = 120, padR = 60, padT = 200, padB = 80;
            const chartW = canvas.width - padL - padR;
            const chartH = canvas.height - padT - padB;
            const vitalsValues = points.map(p => Number(p.vitals ?? p.vital ?? p.level ?? p.actual)).filter(v => Number.isFinite(v));
            const labValues = points.map(p => Number(p.lab)).filter(v => Number.isFinite(v));
            const allValues = [...vitalsValues, ...labValues];
            if (allValues.length === 0) return;
            const vMin = Math.min(...allValues);
            const vMax = Math.max(...allValues);
            const range = vMax === vMin ? 1 : vMax - vMin;
            // Grid
            ctx.strokeStyle = 'rgba(0,0,0,0.05)';
            ctx.lineWidth = 1;
            for (let i = 0; i <= 5; i++) {
                const gy = padT + (chartH / 5) * i;
                ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + chartW, gy); ctx.stroke();
                ctx.fillStyle = '#94a3b8'; ctx.font = '16px Arial'; ctx.textAlign = 'right';
                const gVal = (vMax - (range / 5) * i).toFixed(1);
                ctx.fillText(gVal, padL - 8, gy + 5);
            }
            // Axes
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH); ctx.lineTo(padL + chartW, padT + chartH); ctx.stroke();
            // X labels
            const step = Math.max(1, Math.floor(points.length / 7));
            ctx.fillStyle = '#64748b'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
            for (let i = 0; i < points.length; i += step) {
                const px = padL + (i / Math.max(1, points.length - 1)) * chartW;
                const label = String(points[i][xKey] || points[i].day || i).slice(0, 8);
                ctx.fillText(label, px, padT + chartH + 30);
            }
            ctx.textAlign = 'left';
            const plotLine = (key, color) => {
                const pts = points.map((p, i) => {
                    const v = Number(p[key]);
                    if (!Number.isFinite(v)) return null;
                    return { x: padL + (i / Math.max(1, points.length - 1)) * chartW, y: padT + chartH - ((v - vMin) / range) * chartH };
                }).filter(Boolean);
                if (pts.length === 0) return;
                ctx.strokeStyle = color; ctx.lineWidth = 3;
                ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
                ctx.fillStyle = '#ffffff'; ctx.strokeStyle = color; ctx.lineWidth = 2;
                pts.forEach(p => { ctx.beginPath(); ctx.arc(p.x, p.y, 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke(); });
            };
            // Find the primary data key and legend label from the first data point
            const firstPoint = parsedData[0] || {};
            const primaryKey = ['vitals', 'vital', 'level', 'actual'].find(k => Object.prototype.hasOwnProperty.call(firstPoint, k)) || 'actual';
            const primaryLabel = Object.prototype.hasOwnProperty.call(firstPoint, 'lab') ? 'Vitals' : 'Nilai';
            plotLine(primaryKey, '#136dec');
            if (labValues.length > 0) plotLine('lab', '#10b981');
            // Legend
            const legendY = canvas.height - 40;
            ctx.fillStyle = '#136dec'; ctx.fillRect(48, legendY - 14, 28, 14);
            ctx.fillStyle = '#334155'; ctx.font = 'bold 18px Arial';
            ctx.fillText(primaryLabel, 84, legendY);
            if (labValues.length > 0) {
                ctx.fillStyle = '#10b981'; ctx.fillRect(200, legendY - 14, 28, 14);
                ctx.fillStyle = '#334155'; ctx.fillText('Lab', 236, legendY);
            }
        };

        const drawSimulation = () => {
            const points = Array.isArray(parsedData) ? parsedData.slice(0, 30) : [];
            if (points.length === 0) return;
            const padL = 120, padR = 60, padT = 200, padB = 80;
            const chartW = canvas.width - padL - padR;
            const chartH = canvas.height - padT - padB;
            const values = points.map(p => Number(p.level)).filter(v => Number.isFinite(v));
            if (values.length === 0) return;
            const vMin = Math.min(0, ...values);
            const vMax = Math.max(...values);
            const range = vMax === vMin ? 1 : vMax - vMin;
            // Grid
            ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const gy = padT + (chartH / 4) * i;
                ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + chartW, gy); ctx.stroke();
                ctx.fillStyle = '#94a3b8'; ctx.font = '16px Arial'; ctx.textAlign = 'right';
                ctx.fillText((vMax - (range / 4) * i).toFixed(1), padL - 8, gy + 5);
            }
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH); ctx.lineTo(padL + chartW, padT + chartH); ctx.stroke();
            // Area fill
            const pts = points.map((p, i) => {
                const v = Number(p.level);
                if (!Number.isFinite(v)) return null;
                return { x: padL + (i / Math.max(1, points.length - 1)) * chartW, y: padT + chartH - ((v - vMin) / range) * chartH };
            }).filter(Boolean);
            if (pts.length === 0) return;
            ctx.fillStyle = 'rgba(19, 109, 236, 0.12)';
            ctx.beginPath(); ctx.moveTo(pts[0].x, padT + chartH);
            for (const p of pts) ctx.lineTo(p.x, p.y);
            ctx.lineTo(pts[pts.length - 1].x, padT + chartH);
            ctx.closePath(); ctx.fill();
            ctx.strokeStyle = '#136dec'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            // X labels
            const step = Math.max(1, Math.floor(points.length / 7));
            ctx.fillStyle = '#64748b'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
            for (let i = 0; i < points.length; i += step) {
                const px = padL + (i / Math.max(1, points.length - 1)) * chartW;
                ctx.fillText(String(points[i].time || i), px, padT + chartH + 30);
            }
            ctx.textAlign = 'left';
        };

        const drawForecast = () => {
            const points = Array.isArray(parsedData) ? parsedData.slice(0, 30) : [];
            if (points.length === 0) return;
            const padL = 120, padR = 60, padT = 200, padB = 80;
            const chartW = canvas.width - padL - padR;
            const chartH = canvas.height - padT - padB;
            const allV = [...points.map(p => Number(p.actual)), ...points.map(p => Number(p.forecast))].filter(v => Number.isFinite(v));
            if (allV.length === 0) return;
            const vMin = Math.min(...allV), vMax = Math.max(...allV);
            const range = vMax === vMin ? 1 : vMax - vMin;
            // Grid
            ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const gy = padT + (chartH / 4) * i;
                ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + chartW, gy); ctx.stroke();
                ctx.fillStyle = '#94a3b8'; ctx.font = '16px Arial'; ctx.textAlign = 'right';
                ctx.fillText((vMax - (range / 4) * i).toFixed(1), padL - 8, gy + 5);
            }
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH); ctx.lineTo(padL + chartW, padT + chartH); ctx.stroke();
            const plotLine = (key, dashed) => {
                const pts = points.map((p, i) => {
                    const v = Number(p[key]);
                    if (!Number.isFinite(v)) return null;
                    return { x: padL + (i / Math.max(1, points.length - 1)) * chartW, y: padT + chartH - ((v - vMin) / range) * chartH };
                }).filter(Boolean);
                if (pts.length === 0) return;
                if (dashed) ctx.setLineDash([10, 6]); else ctx.setLineDash([]);
                ctx.strokeStyle = '#136dec'; ctx.lineWidth = dashed ? 2 : 3;
                ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
                for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
                ctx.stroke();
                ctx.setLineDash([]);
            };
            plotLine('actual', false);
            plotLine('forecast', true);
            const step = Math.max(1, Math.floor(points.length / 7));
            ctx.fillStyle = '#64748b'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
            for (let i = 0; i < points.length; i += step) {
                const px = padL + (i / Math.max(1, points.length - 1)) * chartW;
                ctx.fillText(String(points[i].day || i), px, padT + chartH + 30);
            }
            ctx.textAlign = 'left';
            // Legend
            const legendY = canvas.height - 40;
            ctx.setLineDash([]); ctx.strokeStyle = '#136dec'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(48, legendY - 7); ctx.lineTo(76, legendY - 7); ctx.stroke();
            ctx.fillStyle = '#334155'; ctx.font = 'bold 18px Arial'; ctx.fillText('Aktual', 84, legendY);
            ctx.setLineDash([8, 5]); ctx.strokeStyle = '#136dec'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(180, legendY - 7); ctx.lineTo(208, legendY - 7); ctx.stroke();
            ctx.setLineDash([]); ctx.fillStyle = '#334155'; ctx.fillText('Prediksi', 216, legendY);
        };

        const drawTimeline = () => {
            // Drug-response timeline: use vital as primary line
            const points = Array.isArray(parsedData) ? parsedData.slice(0, 30) : [];
            if (points.length === 0) return;
            const padL = 120, padR = 60, padT = 200, padB = 80;
            const chartW = canvas.width - padL - padR;
            const chartH = canvas.height - padT - padB;
            const values = points.map(p => Number(p.vital ?? p.value)).filter(v => Number.isFinite(v));
            if (values.length === 0) return;
            const vMin = Math.min(...values), vMax = Math.max(...values);
            const range = vMax === vMin ? 1 : vMax - vMin;
            ctx.strokeStyle = 'rgba(0,0,0,0.04)'; ctx.lineWidth = 1;
            for (let i = 0; i <= 4; i++) {
                const gy = padT + (chartH / 4) * i;
                ctx.beginPath(); ctx.moveTo(padL, gy); ctx.lineTo(padL + chartW, gy); ctx.stroke();
                ctx.fillStyle = '#94a3b8'; ctx.font = '16px Arial'; ctx.textAlign = 'right';
                ctx.fillText((vMax - (range / 4) * i).toFixed(1), padL - 8, gy + 5);
            }
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(padL, padT); ctx.lineTo(padL, padT + chartH); ctx.lineTo(padL + chartW, padT + chartH); ctx.stroke();
            const pts = points.map((p, i) => {
                const v = Number(p.vital ?? p.value);
                if (!Number.isFinite(v)) return null;
                return { x: padL + (i / Math.max(1, points.length - 1)) * chartW, y: padT + chartH - ((v - vMin) / range) * chartH, drug: p.drug || null };
            }).filter(Boolean);
            ctx.strokeStyle = '#136dec'; ctx.lineWidth = 3;
            ctx.beginPath(); ctx.moveTo(pts[0].x, pts[0].y);
            for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
            ctx.stroke();
            pts.forEach(p => {
                ctx.fillStyle = p.drug ? '#ef4444' : '#ffffff';
                ctx.strokeStyle = p.drug ? '#ef4444' : '#136dec';
                ctx.lineWidth = 2;
                ctx.beginPath(); ctx.arc(p.x, p.y, p.drug ? 7 : 5, 0, Math.PI * 2); ctx.fill(); ctx.stroke();
                if (p.drug) {
                    ctx.fillStyle = '#ef4444'; ctx.font = 'bold 14px Arial'; ctx.textAlign = 'center';
                    ctx.fillText(String(p.drug).slice(0, 10), p.x, p.y - 14);
                }
            });
            const step = Math.max(1, Math.floor(points.length / 7));
            ctx.fillStyle = '#64748b'; ctx.font = '16px Arial'; ctx.textAlign = 'center';
            for (let i = 0; i < points.length; i += step) {
                const px = padL + (i / Math.max(1, points.length - 1)) * chartW;
                ctx.fillText(String(points[i].time || i), px, padT + chartH + 30);
            }
            ctx.textAlign = 'left';
        };

        const drawRadar = () => {
            const points = Array.isArray(parsedData) ? parsedData.slice(0, 10) : [];
            if (points.length < 3) return;
            const cx = canvas.width / 2;
            const cy = Math.round(canvas.height * 0.60);
            const radius = Math.min(canvas.width, canvas.height - 250) * 0.35;
            const n = points.length;
            // Grid circles
            ctx.strokeStyle = 'rgba(0,0,0,0.08)'; ctx.lineWidth = 1;
            [0.25, 0.5, 0.75, 1.0].forEach(r => {
                ctx.beginPath(); ctx.arc(cx, cy, radius * r, 0, Math.PI * 2); ctx.stroke();
            });
            // Axis lines
            ctx.strokeStyle = 'rgba(0,0,0,0.06)';
            for (let i = 0; i < n; i++) {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                ctx.beginPath(); ctx.moveTo(cx, cy);
                ctx.lineTo(cx + Math.cos(angle) * radius, cy + Math.sin(angle) * radius); ctx.stroke();
            }
            // Labels
            ctx.fillStyle = '#334155'; ctx.font = 'bold 17px Arial'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            for (let i = 0; i < n; i++) {
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const lx = cx + Math.cos(angle) * radius * 1.18;
                const ly = cy + Math.sin(angle) * radius * 1.18;
                ctx.fillText(String(points[i].subject || `S${i + 1}`).slice(0, 12), lx, ly);
            }
            // Data polygon
            ctx.strokeStyle = '#136dec'; ctx.fillStyle = 'rgba(19, 109, 236, 0.22)'; ctx.lineWidth = 3;
            ctx.beginPath();
            for (let i = 0; i < n; i++) {
                const val = Math.max(0, Math.min(10, Number(points[i].A || points[i].value || 0)));
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const px = cx + Math.cos(angle) * radius * (val / 10);
                const py = cy + Math.sin(angle) * radius * (val / 10);
                if (i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
            }
            ctx.closePath(); ctx.fill(); ctx.stroke();
            // Dots
            ctx.fillStyle = '#136dec';
            for (let i = 0; i < n; i++) {
                const val = Math.max(0, Math.min(10, Number(points[i].A || points[i].value || 0)));
                const angle = (i / n) * Math.PI * 2 - Math.PI / 2;
                const px = cx + Math.cos(angle) * radius * (val / 10);
                const py = cy + Math.sin(angle) * radius * (val / 10);
                ctx.beginPath(); ctx.arc(px, py, 5, 0, Math.PI * 2); ctx.fill();
            }
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        };

        const drawComparison = () => {
            const points = Array.isArray(parsedData) ? parsedData.slice(0, 12) : [];
            if (points.length === 0) return;
            const padL = 210, padR = 100, padT = 190, padB = 50;
            const chartW = canvas.width - padL - padR;
            const chartH = canvas.height - padT - padB;
            const deltas = points.map(p => Number(p.delta)).filter(v => Number.isFinite(v));
            if (deltas.length === 0) return;
            const maxAbs = Math.max(1, Math.max(...deltas.map(Math.abs)));
            const barH = Math.max(22, Math.floor(chartH / Math.max(1, points.length)) - 10);
            const zeroX = padL + chartW / 2;
            // Zero line
            ctx.strokeStyle = '#94a3b8'; ctx.lineWidth = 2;
            ctx.beginPath(); ctx.moveTo(zeroX, padT - 10); ctx.lineTo(zeroX, padT + chartH); ctx.stroke();
            // Bars
            points.forEach((p, i) => {
                const delta = Number(p.delta);
                if (!Number.isFinite(delta)) return;
                const bY = padT + i * (chartH / Math.max(1, points.length)) + 4;
                const bW = Math.abs(delta / maxAbs) * (chartW / 2);
                const isPos = delta > 0;
                ctx.fillStyle = isPos ? '#ef4444' : '#10b981';
                ctx.fillRect(isPos ? zeroX : zeroX - bW, bY, bW, barH);
                ctx.fillStyle = '#334155'; ctx.font = 'bold 18px Arial'; ctx.textAlign = 'right';
                ctx.fillText(String(p.name || `Item ${i + 1}`).slice(0, 22), padL - 10, bY + barH / 2 + 6);
                ctx.fillStyle = isPos ? '#ef4444' : '#10b981'; ctx.font = 'bold 14px Arial';
                ctx.textAlign = isPos ? 'left' : 'right';
                ctx.fillText((delta > 0 ? '+' : '') + delta.toFixed(1) + '%', isPos ? zeroX + bW + 4 : zeroX - bW - 4, bY + barH / 2 + 4);
            });
            ctx.textAlign = 'left';
            // Legend
            const legendY = canvas.height - 36;
            ctx.fillStyle = '#ef4444'; ctx.fillRect(48, legendY - 14, 24, 14);
            ctx.fillStyle = '#334155'; ctx.font = 'bold 18px Arial'; ctx.fillText('Naik', 80, legendY);
            ctx.fillStyle = '#10b981'; ctx.fillRect(160, legendY - 14, 24, 14);
            ctx.fillStyle = '#334155'; ctx.fillText('Turun', 192, legendY);
        };

        const drawGauge = () => {
            const value = Math.max(0, Math.min(100, Number((Array.isArray(parsedData) ? parsedData[0] : parsedData)?.value || 0)));
            const cx = canvas.width / 2;
            const cy = Math.round(canvas.height * 0.60);
            const radius = Math.min(canvas.width * 0.35, (canvas.height - 250) * 0.6);
            // Background arc (light gray)
            ctx.strokeStyle = '#e2e8f0'; ctx.lineWidth = radius * 0.22; ctx.lineCap = 'round';
            ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, 2 * Math.PI); ctx.stroke();
            // Value arc
            const endAngle = Math.PI + (value / 100) * Math.PI;
            const color = value >= 75 ? '#ef4444' : value >= 50 ? '#f59e0b' : '#136dec';
            ctx.strokeStyle = color; ctx.lineWidth = radius * 0.22;
            ctx.beginPath(); ctx.arc(cx, cy, radius, Math.PI, endAngle); ctx.stroke();
            ctx.lineCap = 'butt';
            // Center value
            ctx.fillStyle = '#1e293b'; ctx.font = `bold ${Math.round(radius * 0.46)}px Arial`;
            ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
            ctx.fillText(`${value}%`, cx, cy - radius * 0.05);
            ctx.font = `bold 18px Arial`; ctx.fillStyle = '#64748b';
            ctx.fillText('Score', cx, cy + radius * 0.3);
            ctx.textAlign = 'left'; ctx.textBaseline = 'alphabetic';
        };

        drawHeader();

        if (type === 'outlier' || type === 'outliers') drawOutliers();
        else if (type === 'audit') drawAudit();
        else if (type === 'gantt' || type === 'plan') drawGantt();
        else if (type === 'heatmap') drawHeatmap();
        else if (type === 'dashboard') drawDashboard();
        else if (type === 'trend') drawTrend('time');
        else if (type === 'simulation') drawSimulation();
        else if (type === 'forecast') drawForecast();
        else if (type === 'timeline') drawTimeline();
        else if (type === 'radar') drawRadar();
        else if (type === 'comparison') drawComparison();
        else if (type === 'gauge') drawGauge();
        else {
            ctx.fillStyle = '#475569';
            ctx.font = '24px Arial';
            ctx.fillText('Visualisasi tersedia namun tidak dapat dirender dari DOM. Ditampilkan fallback statis.', 48, 240);
            ctx.font = '20px Arial';
            ctx.fillText(`Type: ${type}`, 48, 280);
        }

        const out = canvas.toDataURL('image/png');
        if (!out || !out.startsWith('data:image/png;base64,')) {
            return null;
        }
        return out;
    }, []);
    const { isPdfExportMode: _isPdfExportMode, setIsPdfExportMode } = useCopilotContext();

    const handleExportPDF = useCallback(async (msg, msgIdx, triggerEl = null) => {
        // Flag to disable animations in components
        if (typeof window !== 'undefined') {
            window.__PDF_EXPORT_MODE__ = true;
            document.documentElement.setAttribute('data-pdf-export', 'true');
            setIsPdfExportMode(true);
        }
        
        // Wait for components to re-render with animations disabled
        await new Promise(r => setTimeout(r, 400));
        
        try {
            const exportStart = performance.now();
            const rawContent = getMessageRawText(msg);
            const chartImages = {};
            const captureDiagnostics = [];
            const captureTiming = [];
            
            // Find all visualization containers within this specific message
            // We use the message index to scope the search
            const parsedCharts = parseMedicalChartSegments(rawContent);
            const chartSegments = parsedCharts.charts;
            if (parsedCharts.malformed.length > 0) {
                console.warn(`[PDF Export] malformed MedicalChart tags: ${parsedCharts.malformed.length}`);
            }

            console.log(`[PDF Export] Found ${chartSegments.length} chart tags in markdown for message ${msgIdx}`);
            const messageRowFromTrigger = triggerEl?.closest?.('.message-row');
            let messageRow = messageRowFromTrigger || document.querySelector(`.message-row[data-msg-index="${msgIdx}"]`);
            
            // Resilience: If message row not found immediately, poll briefly
            if (!messageRow) {
                const pollStart = Date.now();
                while (!messageRow && Date.now() - pollStart < 500) {
                    await new Promise(r => setTimeout(r, 50));
                    messageRow = document.querySelector(`.message-row[data-msg-index="${msgIdx}"]`);
                }
            }

            if (!messageRow) {
                captureDiagnostics.push({ reasonCode: CHART_CAPTURE_REASON.MISSING_MESSAGE_ROW, msgIdx });
            }

            // Poll until the expected number of viz containers appear, up to 2000ms.
            // This handles React re-render race conditions where containers haven't mounted yet.
            const getVizContainers = () => 
                messageRow ? Array.from(messageRow.querySelectorAll('.medical-chart-container')) : [];

            let vizContainers = getVizContainers();
            if (chartSegments.length > 0 && vizContainers.length < chartSegments.length && messageRow) {
                const pollStart = Date.now();
                while (vizContainers.length < chartSegments.length && Date.now() - pollStart < 2000) {
                    await new Promise(r => setTimeout(r, 100));
                    vizContainers = getVizContainers();
                }
            }

            console.log(`[PDF Export] Found ${vizContainers.length} viz containers in DOM for message ${msgIdx}`);

            for (let i = 0; i < chartSegments.length; i++) {
                const chartKey = `chart-${i}`;
                // Use ordinal matching: chart i in markdown = vizContainers[i] in DOM.
                // React always renders in document order so this is always correct.
                const container = vizContainers[i] || null;

                if (!container) {
                    captureDiagnostics.push({ reasonCode: CHART_CAPTURE_REASON.MISSING_CONTAINER, chartKey, msgIdx });
                    continue;
                }

                const readiness = await waitForChartReady(container);
                if (!readiness.ready) {
                    console.warn('[PDF Export] chart readiness timeout, capture will still be attempted', {
                        chartKey,
                        msgIdx,
                        width: readiness.width,
                        height: readiness.height,
                        hasRenderableNode: readiness.hasRenderableNode,
                    });
                }

                let captured = false;
                let lastError = null;
                for (let attempt = 1; attempt <= COPILOT_PDF_PERF.maxRetries && !captured; attempt++) {
                    const attemptStart = performance.now();
                    try {
                        chartImages[chartKey] = await captureChartContainer(container, chartKey);
                        captureTiming.push({
                            chartKey,
                            attempt,
                            durationMs: Math.round(performance.now() - attemptStart),
                            status: 'success',
                        });
                        captured = true;
                    } catch (captureErr) {
                        lastError = captureErr;
                        captureTiming.push({
                            chartKey,
                            attempt,
                            durationMs: Math.round(performance.now() - attemptStart),
                            status: 'error',
                            error: captureErr?.message || 'unknown-error',
                        });
                        await new Promise((resolve) => setTimeout(resolve, COPILOT_PDF_PERF.retryDelayMs));
                    }
                }

                if (!captured) {
                    const staticFallbackImage = buildStaticChartFallbackImage(chartSegments[i]);
                    if (staticFallbackImage) {
                        chartImages[chartKey] = staticFallbackImage;
                        captureTiming.push({
                            chartKey,
                            attempt: 'static-fallback',
                            durationMs: 0,
                            status: 'success',
                        });
                    } else {
                        captureDiagnostics.push({
                            reasonCode: readiness.ready ? CHART_CAPTURE_REASON.CAPTURE_ERROR : CHART_CAPTURE_REASON.NOT_READY,
                            chartKey,
                            chartType: chartSegments[i]?.attributes?.type || 'unknown',
                            msgIdx,
                            error: lastError?.message || 'unknown-error',
                        });
                    }
                }
            }

            if (captureDiagnostics.length > 0) {
                console.warn('[PDF Export] capture diagnostics', captureDiagnostics);
            }

            console.info('[PDF Export] capture timing', captureTiming);
            console.info('[PDF Export] capture summary', {
                messageIndex: msgIdx,
                rowSource: messageRowFromTrigger ? 'trigger' : 'query',
                chartTagsFound: chartSegments.length,
                chartCaptured: Object.keys(chartImages).length,
                fallbackCount: captureDiagnostics.length,
                totalCaptureMs: Math.round(performance.now() - exportStart),
            });
            
            exportCopilotResponsePDF(rawContent, patientData, chartImages, captureDiagnostics);
        } catch (error) {
            console.error('Failed to export PDF with charts:', error);
            // Fallback to regular export if capture fails
            const rawContent = getMessageRawText(msg);
            exportCopilotResponsePDF(rawContent, patientData);
        } finally {
            if (typeof window !== 'undefined') {
                window.__PDF_EXPORT_MODE__ = false;
                document.documentElement.removeAttribute('data-pdf-export');
                setIsPdfExportMode(false);
            }
        }
    }, [patientData, setIsPdfExportMode, captureChartContainer, waitForChartReady, buildStaticChartFallbackImage]);

    return (
        <div className={`copilot-container ${isOpen ? 'is-open' : ''}`}>
            {/* Floating Toggle Button */}
            <button 
                className="copilot-trigger"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Toggle Copilot Chat"
            >
                <div className="trigger-icon-wrapper">
                    <span className="material-symbols-outlined">
                        {isOpen ? 'close' : 'terminal'}
                    </span>
                </div>
                {!isOpen && <div className="trigger-glow"></div>}
            </button>

            {/* Chat Window */}
            <div className={`copilot-window ${isOpen ? 'active' : ''}`}>
                <div className="window-header">
                    <div className="header-left">
                        <div className="header-logo">
                            <span className="material-symbols-outlined">terminal</span>
                        </div>
                        <div className="header-info">
                            <span className="header-name">Medx AI Agent</span>
                            <span className="header-status">
                                {((isContextEnabled && pageContext) || attachments.length > 0) 
                                    ? "Research Mode" 
                                    : "Swift Mode"}
                            </span>
                        </div>
                    </div>

                    <div className="header-actions-group">
                        {pageContext && isContextEnabled && (
                            <button 
                                className="chat-action-btn info-btn" 
                                onClick={() => setShowInfoModal(true)}
                                title="Informasi Visualisasi"
                            >
                                <span className="material-symbols-outlined">info</span>
                            </button>
                        )}
                        {pageContext && (
                            <div className="context-toggle-wrapper">
                                <label className="context-switch">
                                    <input 
                                        type="checkbox" 
                                        checked={isContextEnabled}
                                        onChange={(e) => {
                                            if (isIntern) {
                                                navigate('/subscription');
                                                setIsOpen(false);
                                            } else {
                                                toggleContext(e.target.checked);
                                            }
                                        }}
                                    />
                                    <span className="context-slider"></span>
                                    {isIntern && (
                                        <span className="absolute -top-2 -right-2 material-symbols-outlined text-amber-500 text-sm bg-white rounded-full p-0.5 shadow-sm">
                                            lock
                                        </span>
                                    )}
                                </label>
                                <span className={`context-label ${isContextEnabled ? 'active' : ''} ${isIntern ? 'text-amber-500 font-bold' : ''}`}>
                                    {isIntern ? 'PRO' : 'Context'}
                                </span>
                            </div>
                        )}
                        <button className="chat-action-btn" onClick={clearChat} title="Bersihkan chat">
                            <span className="material-symbols-outlined">refresh</span>
                        </button>
                        <button className="close-window-btn" onClick={() => setIsOpen(false)}>
                            <span className="material-symbols-outlined">close</span>
                        </button>
                    </div>
                </div>

                {showInfoModal && (
                    <div className="viz-info-overlay" onClick={() => setShowInfoModal(false)}>
                        <div className="viz-info-content" onClick={e => e.stopPropagation()}>
                            <div className="viz-info-header">
                                <h3>Panduan Visualisasi Klinis</h3>
                                <button className="close-info-btn" onClick={() => setShowInfoModal(false)}>
                                    <span className="material-symbols-outlined">close</span>
                                </button>
                            </div>
                            <div className="viz-info-body custom-scrollbar">
                                <p className="info-desc">Aktifkan Context untuk menggunakan fitur analisis visual otomatis ini:</p>
                                <div className="info-grid">
                                    {shortcuts.map(s => (
                                        <div key={s.id} className="info-card">
                                            <div className="info-card-text">
                                                <div className="info-card-title">/{s.id} — {s.label}</div>
                                                <div className="info-card-sub">{s.description}</div>
                                                <div className="info-card-example">
                                                    <span>Contoh:</span> {s.examplePrompt}
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>
                    </div>
                )}

                <div className="messages-area custom-scrollbar">
                    {messages.map((msg, idx) => (
                        <MessageRow
                            key={idx}
                            msg={msg}
                            idx={idx}
                            patientData={patientData}
                            onExportPDF={handleExportPDF}
                        />

                    ))}
                    {isLoading && !messages.some(m => m.isStreaming) && (
                        <div className="message-row ai">
                            <div className="ai-avatar pulse">
                                <span className="material-symbols-outlined">terminal</span>
                            </div>
                            <div className="message-bubble loading">
                                <div className="typing-dots">
                                    <span></span>
                                    <span></span>
                                    <span></span>
                                </div>
                            </div>
                        </div>
                    )}
                    <div ref={messagesEndRef} />
                </div>

                    <div className="input-section">
                        {attachments.length > 0 && (
                        <div className="attachment-previews">
                            {attachments.map((att, index) => (
                                <div key={index} className="preview-item">
                                    {att.isImage ? (
                                        <img src={att.data} alt="preview" />
                                    ) : (
                                        <div className="file-icon-placeholder">
                                            <span className="material-symbols-outlined">description</span>
                                            <span className="file-name-truncate">{att.name}</span>
                                        </div>
                                    )}
                                    <button className="remove-att" onClick={() => removeAttachment(index)}>
                                        <span className="material-symbols-outlined">close</span>
                                    </button>
                                </div>
                            ))}
                        </div>
                    )}

                    <div className="input-toolbar">
                        <input 
                            type="file" 
                            ref={fileInputRef} 
                            style={{ display: 'none' }} 
                            onChange={handleFileChange}
                            multiple
                            accept="image/*,.pdf,.doc,.docx,.txt"
                        />
                        <button 
                            className="tool-btn" 
                            onClick={() => fileInputRef.current.click()}
                            title="Lampirkan file atau gambar"
                        >
                            <span className="material-symbols-outlined">attach_file</span>
                        </button>
                        <button 
                            className="tool-btn" 
                            onClick={() => {
                                // Camera logic could go here, but for now just trigger file input
                                fileInputRef.current.click();
                            }}
                            title="Ambil foto"
                        >
                            <span className="material-symbols-outlined">photo_camera</span>
                        </button>
                    </div>

                    <div className="input-wrapper-v2">
                        {showSlashMenu && filteredShortcuts.length > 0 && (
                            <div className="slash-menu">
                                <div className="slash-menu-header">Pilih Visualisasi</div>
                                <div className="slash-menu-list">
                                    {filteredShortcuts.map((shortcut, index) => (
                                        <div 
                                            key={shortcut.id}
                                            className={`slash-menu-item ${index === selectedIndex ? 'active' : ''}`}
                                            onClick={() => handleSelectShortcut(shortcut)}
                                            onMouseEnter={() => setSelectedIndex(index)}
                                        >
                                            <div className="item-info">
                                                <span className="item-name">/{shortcut.id} <span className="item-label">{shortcut.label}</span></span>
                                                <span className="item-desc">{shortcut.description}</span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                        <div className="input-main-flow">
                            <textarea 
                                ref={textareaRef}
                                className="chat-textarea"
                                placeholder="Tanya apapun atau kirim gambar..."
                                rows="1"
                                value={input}
                                onChange={(e) => handleInputChange(e.target.value)}
                                onKeyDown={handleKeyDown}
                            />
                        </div>
                        <button 
                            className="send-button-v2" 
                            onClick={handleSend} 
                            disabled={isLoading || (!input.trim() && attachments.length === 0 && !activeShortcut)}
                        >
                            <span className="material-symbols-outlined">send</span>
                        </button>
                    </div>
                </div>
            </div>

            {/* Custom Refresh Confirmation Modal */}
            <div className={`copilot-modal-overlay ${showConfirmModal ? 'show' : ''}`} onClick={() => setShowConfirmModal(false)}>
                <div className={`copilot-modal ${showConfirmModal ? 'show' : ''}`} onClick={(e) => e.stopPropagation()}>
                    <div className="modal-icon-header">
                        <div className="modal-icon-circle">
                            <span className="material-symbols-outlined">restart_alt</span>
                        </div>
                    </div>
                    <h3 className="modal-title">Bersihkan Chat?</h3>
                    <p className="modal-description">
                        Seluruh riwayat percakapan saat ini akan dihapus. Perubahan ini tidak dapat dibatalkan.
                    </p>
                    <div className="modal-actions">
                        <button className="modal-btn-cancel" onClick={() => setShowConfirmModal(false)}>
                            Batal
                        </button>
                        <button className="modal-btn-confirm" onClick={confirmClearChat}>
                            Hapus Sekarang
                        </button>
                    </div>
                </div>
            </div>
        </div>
    );
};

export default CopilotChat;

