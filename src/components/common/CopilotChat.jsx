/* src/components/common/CopilotChat.jsx */
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CopilotChat.css';

import { useCopilotContext } from '../../context/CopilotContext';
import { exportCopilotResponsePDF } from '../../services/pdfExportService';

import ClinicalVisualization from './ClinicalVisualization';

import rehypeRaw from 'rehype-raw';

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

        const userMessage = { 
            role: 'user', 
            content: finalInput,
            displayContent: input, // Tampilkan teks asli yang diketik user
            attachments: [...attachments],
            usedModel: selectedModel,
            shortcut: detectedShortcut?.id
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

            const activeContext = isContextEnabled && pageContext;
            const targetModel = (activeContext || isMultiModal) ? 'gpt-5-mini' : 'gpt-4.1';

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
5. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.` },
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
                    const next = [...prev];
                    next[next.length - 1].stage = 'refining';
                    next[next.length - 1].usedModel = 'gpt-4.1';
                    return next;
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
6. DILARANG memberikan referensi artikel, buku, jurnal, link atau kutipan literatur lainnya.` },
                            { role: 'user', content: `Draf:\n${draftText}` }
                        ],
                    }),
                });

                // FALLBACK JIKA GPT-4.1 GAGAL
                if (!refiningResponse.ok) {
                    console.warn("GPT-4.1 failed, falling back to GPT-4o");
                    setMessages(prev => {
                        const next = [...prev];
                        next[next.length - 1].usedModel = 'gpt-4o';
                        return next;
                    });
                    
                    refiningResponse = await fetch(COPILOT_WORKER_URL, {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${AI_INTERNAL_KEY}`, 'x-internal-key': AI_INTERNAL_KEY },
                        body: JSON.stringify({
                            model: 'gpt-4o',
                            stream: false,
                            messages: [
                                { role: 'system', content: `Anda adalah Master Editor Medis (Fallback Mode). Poles draf menjadi profesional dan BEBAS TYPO.` },
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
                                                rehypePlugins={[rehypeRaw]}
                                                components={{
                                                    table: ({node, ...props}) => (
                                                        <div className="table-container">
                                                            <table {...props} />
                                                        </div>
                                                    ),
                                                    p: ({node, children, ...props}) => {
                                                        // Aggressive check for any block-level content within children
                                                        const isBlockContent = (content) => {
                                                            return React.Children.toArray(content).some(child => {
                                                                if (!React.isValidElement(child)) return false;
                                                                
                                                                // Check tag names and custom component names
                                                                const type = child.type;
                                                                const name = child.props?.node?.name || (typeof type === 'string' ? type : type.name);
                                                                
                                                                const blockTags = ['div', 'table', 'section', 'article', 'medicalchart', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'ul', 'ol', 'tr', 'td'];
                                                                if (blockTags.includes(name?.toLowerCase())) return true;
                                                                
                                                                // Recursively check children if it's a fragment or wrapper
                                                                if (child.props?.children) return isBlockContent(child.props.children);
                                                                
                                                                return false;
                                                            });
                                                        };

                                                        if (isBlockContent(children)) {
                                                            return <div className="p-wrap" {...props}>{children}</div>;
                                                        }
                                                        return <p {...props}>{children}</p>;
                                                    },
                                                    // Custom component for MedicalChart tags
                                                    medicalchart: ({node, ...props}) => {
                                                        try {
                                                            const chartData = typeof props.data === 'string' ? JSON.parse(props.data) : props.data;
                                                            return <ClinicalVisualization {...props} data={chartData} />;
                                                        } catch (e) {
                                                            console.error("Failed to parse chart data:", e);
                                                            return <div className="text-red-500 text-xs">Gagal memuat grafik: Data tidak valid</div>;
                                                        }
                                                    },
                                                    // Ensure bold and italic are rendered nicely
                                                    strong: ({node, ...props}) => <strong className="md-bold" {...props} />,
                                                    em: ({node, ...props}) => <em className="md-italic" {...props} />
                                                }}
                                            >
                                                {msg.displayContent || (typeof msg.content === 'string' ? msg.content : msg.content.find(c => c.type === 'text')?.text || '')}
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
                                        {msg.usedModel === 'gpt-5-mini' ? 'GPT-Research Mode' : 
                                         msg.usedModel === 'gpt-4.1' ? 'GPT-Swift Mode' : 
                                         msg.usedModel === 'gpt-4o' ? 'GPT-Omni Mode' : 
                                         `GPT-${msg.usedModel.toUpperCase()}`}
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

