/* src/components/common/CopilotChat.jsx */
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CopilotChat.css';

import { useCopilotContext } from '../../context/CopilotContext';

const COPILOT_WORKER_URL = import.meta.env.VITE_COPILOT_WORKER_URL;
const AI_INTERNAL_KEY = import.meta.env.VITE_OPS_INTERNAL_KEY;


const CopilotChat = () => {
    const { pageContext, isContextEnabled, toggleContext } = useCopilotContext();
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Halo! Saya asisten MedxTerminal. Ada yang bisa saya bantu hari ini?' }
    ]);
    const [attachments, setAttachments] = useState([]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
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
        if (isOpen) {
            scrollToBottom();
        }
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
        if (window.confirm("Bersihkan riwayat percakapan?")) {
            setMessages([
                { role: 'ai', content: 'Halo! Saya asisten MedxTerminal. Ada yang bisa saya bantu hari ini?' }
            ]);
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
        const selectedModel = (isContextEnabled || isMultiModal) ? 'gpt-4.1' : 'gpt-5-mini';

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

            // --- TAHAP 1: DRAFTING (LOGIKA & KONTEKS) ---
            setIsLoading(true);
            scrollToBottom();

            // Tentukan model dasar
            const draftModel = (isContextEnabled || isMultiModal) ? 'gpt-4.1' : 'gpt-5-mini';

            setMessages(prev => [...prev, { 
                role: 'ai', 
                content: '', 
                usedModel: draftModel,
                isStreaming: true,
                stage: 'thinking' 
            }]);

            // Riwayat diperpendek & disanitasi: Konversi AI messages agar kompatibel
            const sanitizedHistory = messages.slice(-10).map(m => {
                const role = m.role === 'ai' ? 'assistant' : 'user';
                let content = m.content;
                // Jika draftModel adalah mini, paksa content jadi string (No Vision/Array)
                if (draftModel === 'gpt-5-mini' && Array.isArray(content)) {
                    content = content.find(c => c.type === 'text')?.text || "";
                }
                return { role, content };
            });

            // 1. Ambil Draf Logika (Raw Data) - Gunakan JSON (stream: false)
            const draftResponse = await fetch(COPILOT_WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_INTERNAL_KEY}`,
                    'x-internal-key': AI_INTERNAL_KEY,
                },
                body: JSON.stringify({
                    model: draftModel,
                    stream: false,
                    messages: [
                        { role: 'system', content: `Anda adalah asisten medis yang memberikan analisis draf dasar. Jawab berdasarkan konteks yang diberikan. JANGAN khawatir tentang gaya bahasa atau typo. Berikan informasi lengkap.` },
                        ...(isContextEnabled && pageContext ? [{ role: 'system', content: `KONTEKS PASIEN:\n${pageContext}` }] : []),
                        ...sanitizedHistory,
                        { role: 'user', content: currentMessageContent }
                    ],
                }),
            });

            if (!draftResponse.ok) throw new Error("Gagal mengambil draf medis.");
            const draftData = await draftResponse.json();
            const draftText = draftData.choices?.[0]?.message?.content || "";

            // --- TAHAP 2: MASTER REFINING (GPT-4o) ---
            setMessages(prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                lastMsg.stage = 'refining';
                lastMsg.usedModel = 'gpt-4o'; // Informasikan model pemoles
                return next;
            });

            const refiningResponse = await fetch(COPILOT_WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_INTERNAL_KEY}`,
                    'x-internal-key': AI_INTERNAL_KEY,
                },
                body: JSON.stringify({
                    model: 'gpt-4o',
                    stream: true,
                    messages: [
                        { 
                            role: 'system', 
                            content: `Anda adalah Master Editor Medis MedxTerminal.
Tugas Anda: Memoles draf jawaban menjadi sangat profesional, baku (Bahasa Indonesia Medis), dan BEBAS TYPO.

ATURAN:
1. Gunakan Markdown yang sangat estetik (tabel, list, bold).
2. Perbaiki semua kesalahan ejaan (contoh: TBumnya -> TB-nya, untukeksi -> untuk infeksi).
3. Jangan mengurangi akurasi data medis dari draf asli.
4. Langsung berikan hasil akhir tanpa basa-basi.` 
                        },
                        { role: 'user', content: `Draf yang harus dipoles:\n---\n${draftText}\n---` }
                    ],
                }),
            });

            if (!refiningResponse.ok) throw new Error("Gagal mempoles jawaban.");

            const reader = refiningResponse.body.getReader();
            const decoder = new TextDecoder();
            let accumulatedFinal = '';

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                const chunk = decoder.decode(value, { stream: true });
                const lines = chunk.split('\n');

                for (const line of lines) {
                    if (line.startsWith('data: ')) {
                        const dataStr = line.slice(6).trim();
                        if (dataStr === '[DONE]') break;

                        try {
                            const data = JSON.parse(dataStr);
                            const delta = data.choices?.[0]?.delta?.content || '';
                            if (delta) {
                                accumulatedFinal += delta;
                                setMessages(prev => {
                                    const next = [...prev];
                                    const lastMsg = next[next.length - 1];
                                    lastMsg.stage = 'ready'; // Sembunyikan pill refining saat teks mulai muncul
                                    lastMsg.content = accumulatedFinal;
                                    return next;
                                });
                            }
                        } catch (e) {}
                    }
                }
            }

            // Finalisasi Selesai
            setMessages(prev => {
                const next = [...prev];
                const lastMsg = next[next.length - 1];
                lastMsg.isStreaming = false;
                lastMsg.stage = 'completed';
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
                            <span className="header-name">Medx Copilot Dynamic</span>
                            <div className="header-controls">
                                <span className="header-status">
                                    {(isContextEnabled || attachments.length > 0) ? "Mode: GPT-4.1 (Vision)" : "Mode: GPT-5-Mini (Lightweight)"}
                                </span>
                                <div className="header-actions">
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
                                </div>
                            </div>
                        </div>
                    </div>
                    <button className="close-window-btn" onClick={() => setIsOpen(false)}>
                        <span className="material-symbols-outlined">close</span>
                    </button>
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
                                                <span className="stage-text">Mempoles Jawaban & Cek Ejaan...</span>
                                            </div>
                                        )}
                                    </div>
                                )}
                                
                                {(msg.content !== undefined && (msg.content !== '' || msg.role === 'user' || msg.stage === 'ready' || msg.stage === 'completed')) && (
                                    <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                        {typeof msg.content === 'string' ? msg.content : msg.content.find(c => c.type === 'text')?.text || ''}
                                    </ReactMarkdown>
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
        </div>
    );
};

export default CopilotChat;

