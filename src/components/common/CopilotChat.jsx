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
    waitTimeoutMs: 800,
    waitPollMs: 80,
    waitStableCycles: 1,
    captureScale: 2,
    maxCaptureWidth: 1200,
    maxCaptureHeight: 700,
    maxRetries: 1,
    retryDelayMs: 100,
    fallbackCanvasWidth: 1400,
    fallbackCanvasHeight: 800,
    svgRenderScale: 2,
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
    try { return JSON.parse(raw); } catch (_) {}
    // Try 2: Replace curly/smart quotes
    try { return JSON.parse(raw.replace(/[\u2018\u2019]/g, "\\'").replace(/[\u201C\u201D]/g, '"')); } catch (_) {}
    // Try 3: Escape lone apostrophes inside string values
    try { return JSON.parse(raw.replace(/(?<=[^\\])'/g, "'")); } catch (_) {}
    // Try 4: Strip trailing comma before } or ]
    try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch (_) {}
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
            return `\n\n<medicalchart ${attrStr} />\n\n`;
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
                                            table: ({node, ...props}) => (
                                                <div className="table-container">
                                                    <table {...props} />
                                                </div>
                                            ),
                                            p: ({node, children, ...props}) => {
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
                                            medicalchart: ({node, children, ...props}) => {
                                                try {
                                                    const rawType = (props.type || '').toString().trim().toLowerCase();
                                                    const chartData = safeParseChartData(props.data);
                                                    const isEmptyData = !chartData || (Array.isArray(chartData) && chartData.length === 0);

                                                    if (!rawType || isEmptyData || chartData === null) {
                                                        // Jika tipe kosong atau data tidak ada, jangan render kontainer visualisasi, tapi tetap render children 
                                                        // untuk mencegah content swallowing jika tag tidak tertutup sempurna di markdown.
                                                        return <>{children}</>;
                                                    }

                                                    const chartKey = `chart-${chartRenderCounter++}`;
                                                    return (
                                                        <>
                                                            <ClinicalVisualization 
                                                                type={rawType} 
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
                                                        <div className="chart-error-box">
                                                            <div className="text-red-500 text-xs font-bold mb-1">Gagal memuat visualisasi</div>
                                                            {children}
                                                        </div>
                                                    );
                                                }
                                            },
                                            strong: ({node, ...props}) => <strong className="md-bold" {...props} />,
                                            em: ({node, ...props}) => <em className="md-italic" {...props} />
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

    const scrollToBottom = () => {
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
            label: 'Tren Vital', 
            description: 'Tampilkan grafik tren vital vs lab',
            examplePrompt: '/trend tunjukkan perkembangan tekanan darah pasien'
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

    const handleShortcutClick = (shortcut) => {
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
        
        const lastChar = val[val.length - 1];
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
   - <MedicalChart type="trend" title="Tren Vital vs Lab" data='[{"time":"08:00","vitals":70,"lab":12},...]' /> (Line chart ganda)
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

    const inferChartDimensions = (container) => {
        const rect = container.getBoundingClientRect();
        const vizContent = container.querySelector('.viz-content');
        const svg = container.querySelector('svg');
        const canvas = container.querySelector('canvas');

        const svgWidth = svg ? Number(svg.getAttribute('width')) || Number(svg.viewBox?.baseVal?.width) || 0 : 0;
        const svgHeight = svg ? Number(svg.getAttribute('height')) || Number(svg.viewBox?.baseVal?.height) || 0 : 0;
        const canvasWidth = canvas?.width || 0;
        const canvasHeight = canvas?.height || 0;

        const width = Math.max(
            vizContent?.scrollWidth || 0,
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
            rect.height || 0,
            svgHeight + 64,
            canvasHeight + 64,
            220,
        );

        return {
            width: Math.round(width),
            height: Math.round(height),
            hasRenderableNode: Boolean(svg || canvas || container.querySelector('.recharts-wrapper') || container.querySelector('table')),
        };
    };

    const waitForChartReady = async (container, {
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
            const width = dims.width;
            const height = dims.height;
            const hasRenderableNode = dims.hasRenderableNode;
            const childElementCount = container.querySelectorAll('*').length;
            lastMetrics = { width, height, hasRenderableNode, childElementCount };

            if (width > 0 && height > 0 && (hasRenderableNode || childElementCount > 5)) {
                const signature = `${width}x${height}:${hasRenderableNode ? 'r' : 'n'}`;
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
    };

    const captureChartContainer = async (container, expectedChartKey = null) => {
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

        const normalizeSvgForPdf = (svgRoot) => {
            if (!svgRoot) return;

            svgRoot.style.background = '#ffffff';

            svgRoot.querySelectorAll('.recharts-cartesian-grid line, .recharts-cartesian-grid path').forEach((node) => {
                node.setAttribute('stroke', '#cbd5e1');
                node.setAttribute('stroke-opacity', '1');
            });

            svgRoot.querySelectorAll('.recharts-polar-grid-angle line, .recharts-polar-grid-concentric circle, .recharts-polar-grid-concentric polygon').forEach((node) => {
                node.setAttribute('stroke', '#cbd5e1');
                node.setAttribute('stroke-opacity', '1');
            });

            svgRoot.querySelectorAll('.recharts-radar-polygon').forEach((node) => {
                node.setAttribute('fill-opacity', '0.78');
                node.setAttribute('stroke-opacity', '1');
            });

            svgRoot.querySelectorAll('line[stroke-dasharray], path[stroke-dasharray]').forEach((node) => {
                normalizeOpacityAttribute(node, 'stroke-opacity', 0.86);
                normalizeOpacityAttribute(node, 'opacity', 0.86);
            });

            svgRoot.querySelectorAll('*').forEach((node) => {
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
            });
        };

        const normalizeContainerForPdf = (rootNode) => {
            if (!rootNode) return;

            rootNode.setAttribute('data-export-render-intent', 'pdf');
            rootNode.style.background = '#ffffff';
            rootNode.style.opacity = '1';
            rootNode.style.boxShadow = 'none';

            const scroller = rootNode.querySelector('.viz-content');
            if (scroller) {
                scroller.style.overflow = 'visible';
                scroller.style.background = '#ffffff';
            }

            rootNode.querySelectorAll('.heatmap-cell').forEach((cell) => {
                const raw = cell.style.backgroundColor;
                const solid = rgbaToSolidRgb(raw, 0.82) || '#3b82f6';
                cell.style.backgroundColor = solid;
                cell.style.border = '1px solid #bfdbfe';
                cell.style.color = '#0f172a';
            });

            rootNode.querySelectorAll('.outlier-row').forEach((row) => {
                row.style.background = '#fee2e2';
                row.style.color = '#b91c1c';
            });

            rootNode.querySelectorAll('.viz-gantt-item').forEach((item) => {
                item.style.borderLeftColor = '#60a5fa';
            });

            rootNode.querySelectorAll('.viz-dashboard-btn:not(.is-active)').forEach((btn) => {
                btn.style.background = '#dbeafe';
                btn.style.borderColor = '#93c5fd';
                btn.style.color = '#1d4ed8';
            });

            rootNode.querySelectorAll('.body-part.highlighted').forEach((part) => {
                part.style.filter = 'none';
                part.style.fill = '#136dec';
            });

            rootNode.querySelectorAll('svg').forEach((svg) => normalizeSvgForPdf(svg));
        };

        const isCanvasMostlyBlank = (canvas) => {
            const ctx = canvas.getContext('2d');
            if (!ctx) return true;

            const width = canvas.width;
            const height = canvas.height;
            if (width < 2 || height < 2) return true;

            // Focus on lower area where chart body should exist (exclude mostly header zone).
            const startY = Math.floor(height * 0.25);
            const endY = Math.max(startY + 1, Math.floor(height * 0.95));
            const startX = Math.floor(width * 0.05);
            const endX = Math.max(startX + 1, Math.floor(width * 0.95));

            const stepX = Math.max(1, Math.floor((endX - startX) / 24));
            const stepY = Math.max(1, Math.floor((endY - startY) / 20));

            let colored = 0;
            let total = 0;

            for (let y = startY; y < endY; y += stepY) {
                for (let x = startX; x < endX; x += stepX) {
                    const p = ctx.getImageData(x, y, 1, 1).data;
                    total += 1;
                    const alpha = p[3];
                    const isNearWhite = p[0] > 245 && p[1] > 245 && p[2] > 245;
                    if (alpha > 10 && !isNearWhite) {
                        colored += 1;
                    }
                }
            }

            const ratio = total > 0 ? (colored / total) : 0;
            // Thin-line charts can occupy very small pixel ratio on large white backgrounds.
            return colored <= 2 && ratio < 0.0005;
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
            const width = Math.max(
                Math.round(rect.width || 0),
                Math.round(viewBox?.width || 0),
                600,
            );
            const height = Math.max(
                Math.round(rect.height || 0),
                Math.round(viewBox?.height || 0),
                260,
            );

            const svgClone = svgNode.cloneNode(true);
            svgClone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
            svgClone.setAttribute('xmlns:xlink', 'http://www.w3.org/1999/xlink');
            svgClone.setAttribute('width', String(width));
            svgClone.setAttribute('height', String(height));
            normalizeSvgForPdf(svgClone);

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

        const captureElement = async (target, { width, height, label, useOffscreenClone = false }) => {
            if (!target) {
                throw new Error(`capture-target-missing:${label}`);
            }

            const safeWidth = Math.min(COPILOT_PDF_PERF.maxCaptureWidth, Math.max(320, Math.round(width || target.scrollWidth || target.offsetWidth || 0)));
            const safeHeight = Math.min(COPILOT_PDF_PERF.maxCaptureHeight, Math.max(180, Math.round(height || target.scrollHeight || target.offsetHeight || 0)));

            let captureTarget = target;
            let sandbox = null;

            if (useOffscreenClone) {
                sandbox = document.createElement('div');
                sandbox.style.position = 'fixed';
                sandbox.style.left = '0px';
                sandbox.style.top = '0';
                sandbox.style.pointerEvents = 'none';
                sandbox.style.width = `${safeWidth}px`;
                sandbox.style.height = `${safeHeight}px`;
                sandbox.style.overflow = 'visible';
                sandbox.style.background = '#ffffff';
                sandbox.style.zIndex = '-9999';

                const cloned = target.cloneNode(true);
                cloned.style.width = `${safeWidth}px`;
                cloned.style.minHeight = `${safeHeight}px`;
                cloned.style.display = 'block';

                const clonedScroller = cloned.querySelector('.viz-content');
                if (clonedScroller) {
                    clonedScroller.style.overflow = 'visible';
                    clonedScroller.style.width = `${safeWidth}px`;
                }

                const clonedContainer = cloned.querySelector('.clinical-viz-container') || cloned;
                clonedContainer.style.background = '#ffffff';
                clonedContainer.style.opacity = '1';
                clonedContainer.style.boxShadow = 'none';
                normalizeContainerForPdf(clonedContainer);

                sandbox.appendChild(cloned);
                document.body.appendChild(sandbox);
                captureTarget = cloned;

                // Let browser finalize layout for cloned chart before capture.
                await new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve)));
            }

            try {
                const canvas = await html2canvas(captureTarget, {
                    backgroundColor: '#ffffff',
                    scale: COPILOT_PDF_PERF.captureScale,
                    logging: false,
                    useCORS: true,
                    allowTaint: false,
                    width: safeWidth,
                    height: safeHeight,
                    windowWidth: safeWidth,
                    scrollX: 0,
                    scrollY: 0,
                    onclone: (clonedDoc) => {
                        const selector = `[data-export-chart-key="${chartKey}"]`;
                        const clonedContainer = clonedDoc.querySelector(selector) || clonedDoc.querySelector('.clinical-viz-container');
                        if (clonedContainer) {
                            clonedContainer.style.background = '#ffffff';
                            clonedContainer.style.opacity = '1';
                            clonedContainer.style.boxShadow = 'none';
                            normalizeContainerForPdf(clonedContainer);
                            const scroller = clonedContainer.querySelector('.viz-content');
                            if (scroller) {
                                scroller.style.overflow = 'visible';
                                scroller.style.width = `${safeWidth}px`;
                            }
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
        const originalPosition = container.style.position;
        const originalMinHeight = container.style.minHeight;
        const originalDisplay = container.style.display;

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
            const sandbox = document.createElement('div');
            sandbox.style.cssText = [
                'position:fixed', 'left:0', 'top:0', 'pointer-events:none',
                `width:${dims.width}px`, 'min-height:80px',
                'background:#fff', 'z-index:-9999', 'overflow:visible',
                'padding:0', 'margin:0', 'box-shadow:none',
                'font-family:Inter,system-ui,sans-serif',
            ].join(';');

            const cloned = container.cloneNode(true);
            cloned.style.cssText = [
                `width:${dims.width}px`, 'max-width:none',
                'background:#fff', 'box-shadow:none',
                'border-radius:0', 'overflow:visible',
            ].join(';');
            // Make any internal scrollers visible for capture
            cloned.querySelectorAll('[style*="overflow"]').forEach(el => {
                el.style.overflow = 'visible';
            });

            sandbox.appendChild(cloned);
            document.body.appendChild(sandbox);

            // Wait for layout
            await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));

            try {
                const canvas = await html2canvas(cloned, {
                    backgroundColor: '#ffffff',
                    scale: COPILOT_PDF_PERF.captureScale,
                    logging: false,
                    useCORS: true,
                    allowTaint: false,
                    width: dims.width,
                    height: Math.max(80, cloned.scrollHeight || cloned.offsetHeight || dims.height),
                    windowWidth: dims.width,
                    scrollX: 0,
                    scrollY: 0,
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
        const strategies = hasSvg
            ? [
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
        }

        throw lastError || new Error('capture-all-strategies-failed');
    };

    const buildStaticChartFallbackImage = (chartSegment) => {
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

        drawHeader();

        if (type === 'outlier' || type === 'outliers') drawOutliers();
        else if (type === 'audit') drawAudit();
        else if (type === 'gantt' || type === 'plan') drawGantt();
        else if (type === 'heatmap') drawHeatmap();
        else if (type === 'dashboard') drawDashboard();
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
    };

    const handleExportPDF = useCallback(async (msg, msgIdx, triggerEl = null) => {
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
        }
    }, [patientData, isContextEnabled]);

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
                                                <span className="item-name">/{shortcut.id}</span>
                                                <span className="item-desc">{shortcut.label}</span>
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

