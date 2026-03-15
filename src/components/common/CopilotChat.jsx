/* src/components/common/CopilotChat.jsx */
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CopilotChat.css';

const COPILOT_WORKER_URL = import.meta.env.VITE_COPILOT_WORKER_URL;
const AI_INTERNAL_KEY = import.meta.env.VITE_OPS_INTERNAL_KEY;


const CopilotChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Halo! Saya asisten MedxTerminal. Ada yang bisa saya bantu hari ini?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        if (isOpen) {
            scrollToBottom();
        }
    }, [messages, isLoading, isOpen]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        // Check if configuration is present and looks valid
        if (!COPILOT_WORKER_URL || COPILOT_WORKER_URL === 'undefined') {
            const configError = 'Konfigurasi VITE_COPILOT_WORKER_URL tidak ditemukan. Harap tambahkan di Environment Variables (Netlify/Vercel).';
            setMessages(prev => [...prev, { role: 'ai', content: `Error: ${configError}` }]);
            console.error(configError);
            return;
        }

        // Prevent accidental requests to the same app origin (avoid POSTing to /patient/undefined)
        try {
            const workerUrlObj = new URL(COPILOT_WORKER_URL);
            if (workerUrlObj.origin === window.location.origin) {
                const originError = 'Konfigurasi VITE_COPILOT_WORKER_URL invalid: worker URL mengarah ke origin aplikasi. Gunakan URL workers.dev atau lengkap.';
                setMessages(prev => [...prev, { role: 'ai', content: `Error: ${originError}` }]);
                console.error(originError, COPILOT_WORKER_URL);
                return;
            }
        } catch (e) {
            const parseError = 'Konfigurasi VITE_COPILOT_WORKER_URL tidak valid.';
            setMessages(prev => [...prev, { role: 'ai', content: `Error: ${parseError}` }]);
            console.error(parseError, e);
            return;
        }

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch(COPILOT_WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_INTERNAL_KEY}`,
                    'x-internal-key': AI_INTERNAL_KEY,
                },

                body: JSON.stringify({
                    messages: [...messages, userMessage].map(m => ({
                        role: m.role === 'ai' ? 'assistant' : 'user',
                        content: m.content
                    })),
                    model: 'gpt-5-mini',
                }),
            });

            if (!response.ok) {
                const errorData = await response.json().catch(() => ({}));
                throw new Error(errorData.error || `HTTP ${response.status}: Gagal menghubungi Copilot Gateway`);
            }

            const data = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || 'Maaf, terjadi kesalahan saat mengambil respon.';
            
            setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);
        } catch (error) {
            console.error('Copilot Error:', error);
            setMessages(prev => [...prev, { role: 'ai', content: `**Error:** ${error.message}\n\n*Pastikan Cloudflare Worker Anda sudah berjalan dan Environment Variables sudah benar.*` }]);
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
                    <div className="terminal-dots">
                        <span className="dot red"></span>
                        <span className="dot yellow"></span>
                        <span className="dot green"></span>
                    </div>
                    <div className="header-title">
                        <span className="material-symbols-outlined header-icon">terminal</span>
                        <span>Medx Copilot</span>
                    </div>
                    <button className="minimize-btn" onClick={() => setIsOpen(false)}>
                        <span className="material-symbols-outlined">expand_more</span>
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
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
                        <div className="message-row ai">
                            <div className="ai-avatar">
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

                <div className="input-container">
                    <div className="input-wrapper">
                        <span className="terminal-prompt">$</span>
                        <input 
                            type="text" 
                            className="chat-input"
                            placeholder="Type a clinical query..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <button 
                            className="send-button" 
                            onClick={handleSend} 
                            disabled={isLoading || !input.trim()}
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

