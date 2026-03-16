/* src/components/common/CopilotChat.jsx */
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CopilotChat.css';

import { useCopilotContext } from '../../context/CopilotContext';
import { exportCopilotResponsePDF } from '../../services/pdfExportService';

const COPILOT_WORKER_URL = import.meta.env.VITE_COPILOT_WORKER_URL;
const AI_INTERNAL_KEY = import.meta.env.VITE_OPS_INTERNAL_KEY;


const CopilotChat = () => {
    const { pageContext, patientData, isContextEnabled, toggleContext } = useCopilotContext();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Halo! Saya asisten MedxTerminal. Ada yang bisa saya bantu hari ini?', isWelcome: true }
    ]);
    const [attachments, setAttachments] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    const [showConfirmModal, setShowConfirmModal] = useState(false);
    
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
        const selectedModel = ((isContextEnabled && pageContext) || isMultiModal) ? 'gpt-4.1' : 'gpt-5-mini';

        const userMessage = { 
            role: 'user', 
            content: input || (attachments.length > 0 ? "" : ""),
            attachments: [...attachments],
            usedModel: selectedModel // Simpan info model yang digunakan
        };

        setMessages(prev => [...prev, userMessage]);
        
        const currentInput = input;
        const currentAttachments = [...attachments];
        
        setInput('');
        setAttachments([]);
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

            const activeContext = isContextEnabled && pageContext;
            const targetModel = (activeContext || isMultiModal) ? 'gpt-4.1' : 'gpt-5-mini';

            // --- JALUR 1: ADVANCED (Hanya jika Context ON / Patient Detail) ---
            if (activeContext) {
                setMessages(prev => [...prev, { 
                    role: 'ai', 
                    content: '', 
                    usedModel: targetModel,
                    isStreaming: true,
                    stage: 'thinking' 
                }]);

                const sanitizedHistory = messages.slice(-10).map(m => ({
                    role: m.role === 'ai' ? 'assistant' : 'user',
                    content: (targetModel === 'gpt-5-mini' && Array.isArray(m.content)) 
                        ? (m.content.find(c => c.type === 'text')?.text || "") 
                        : m.content
                }));

                // Tahap 1: Drafting Medis
                const draftResponse = await fetch(COPILOT_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                    body: JSON.stringify({
                        model: targetModel,
                        stream: false,
                        messages: [
                            { role: 'system', content: `Analisis medis draf. Berikan info lengkap. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.` },
                            { role: 'system', content: `KONTEKS PASIEN:\n${pageContext}` },
                            ...sanitizedHistory,
                            { role: 'user', content: currentMessageContent }
                        ],
                    }),
                });

                const draftData = await draftResponse.json();
                const draftText = draftData.choices?.[0]?.message?.content || "";

                // Tahap 2: Refining (GPT-4o)
                setMessages(prev => {
                    const next = [...prev];
                    next[next.length - 1].stage = 'refining';
                    next[next.length - 1].usedModel = 'gpt-4o';
                    return next;
                });

                const refiningResponse = await fetch(COPILOT_WORKER_URL, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                    body: JSON.stringify({
                        model: 'gpt-4o',
                        stream: false, // Diganti ke non-stream untuk pengujian
                        messages: [
                             { role: 'system', content: `Anda adalah Master Editor Medis. Poles draf menjadi sangat profesional, baku, dan BEBAS TYPO.
 ATURAN:
 1. LANGSUNG berikan hasil akhir tanpa kalimat pembuka (seperti "Berikut adalah...") atau penutup.
 2. Gunakan Markdown yang estetik.
 3. JANGAN mengubah data medis.
 4. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.` },
                            { role: 'user', content: `Draf:\n${draftText}` }
                        ],
                    }),
                });

                if (!refiningResponse.ok) throw new Error("Gagal mempoles jawaban.");
                
                const refineData = await refiningResponse.json();
                const acc = refineData.choices?.[0]?.message?.content || "";

                setMessages(prev => {
                    const next = [...prev];
                    const lastMsg = next[next.length - 1];
                    lastMsg.stage = 'ready';
                    lastMsg.content = acc;
                    return next;
                });
            } 
            // --- JALUR 2: BASIC (Jika Context OFF / Gambar saja / Halaman Lain) ---
            else {
                setMessages(prev => [...prev, { 
                    role: 'ai', 
                    content: '', 
                    usedModel: targetModel,
                    isStreaming: true,
                    stage: 'ready' 
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
                            { role: 'system', content: 'Anda adalah Medx Copilot. Jawablah secara ramah dan profesional. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.' },
                            ...sanitizedHistory,
                            { role: 'user', content: currentMessageContent }
                        ],
                    }),
                });

                if (!response.ok) throw new Error("Gagal mendapatkan jawaban.");
                const data = await response.json();
                const acc = data.choices?.[0]?.message?.content || "";
                
                setMessages(prev => {
                    const next = [...prev];
                    next[next.length - 1].content = acc;
                    return next;
                });
            }

            // Finalisasi
            setMessages(prev => {
                const next = [...prev];
                next[next.length - 1].isStreaming = false;
                next[next.length - 1].stage = 'completed';
                return next;
            });

        } catch (error) {
            console.error('Copilot Error:', error);
            setMessages(prev => [...prev, { role: 'ai', content: `**Error:** ${error.message}` }]);
        } finally {
            setIsLoading(false);
        }
    };

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
                        {pageContext && (
                            <div className="context-toggle-wrapper">
                                <label className="context-switch">
                                    <input 
                                        type="checkbox" 
                                        checked={isContextEnabled}
                                        onChange={(e) => toggleContext(e.target.checked)}
                                    />
                                    <span className="context-slider"></span>
                                </label>
                                <span className={`context-label ${isContextEnabled ? 'active' : ''}`}>
                                    Context
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

                <div className="messages-area custom-scrollbar">
                    {messages.map((msg, idx) => (
                        <div key={idx} className={`message-row ${msg.role}`}>
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
                                            <ReactMarkdown 
                                                remarkPlugins={[remarkGfm]}
                                                components={{
                                                    table: ({node, ...props}) => (
                                                        <div className="table-container">
                                                            <table {...props} />
                                                        </div>
                                                    )
                                                }}
                                            >
                                                {typeof msg.content === 'string' ? msg.content : msg.content.find(c => c.type === 'text')?.text || ''}
                                            </ReactMarkdown>
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

                                {msg.role === 'ai' && msg.content && !msg.isStreaming && !msg.isWelcome && patientData && isContextEnabled && (
                                    <button 
                                        className="export-pdf-mini-btn" 
                                        onClick={() => exportCopilotResponsePDF(typeof msg.content === 'string' ? msg.content : msg.content.find(c => c.type === 'text')?.text || '', patientData)}
                                        title="Export jawaban ini ke PDF"
                                    >
                                        <span className="material-symbols-outlined">picture_as_pdf</span>
                                        <span>Simpan PDF</span>
                                    </button>
                                )}

                                {msg.usedModel && (
                                    <div className="model-badge">
                                        <span className="material-symbols-outlined">bolt</span>
                                        {msg.usedModel}
                                    </div>
                                )}
                            </div>
                        </div>
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
                        <textarea 
                            ref={textareaRef}
                            className="chat-textarea"
                            placeholder="Tanya apapun atau kirim gambar..."
                            rows="1"
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey) {
                                    e.preventDefault();
                                    handleSend();
                                }
                            }}
                        />
                        <button 
                            className="send-button-v2" 
                            onClick={handleSend} 
                            disabled={isLoading || (!input.trim() && attachments.length === 0)}
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

