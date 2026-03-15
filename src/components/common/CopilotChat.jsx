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

        if (!COPILOT_WORKER_URL || COPILOT_WORKER_URL === 'undefined') {
            const configError = 'Konfigurasi AI Gateway tidak ditemukan.';
            setMessages(prev => [...prev, { role: 'ai', content: `Error: ${configError}` }]);
            return;
        }

        const userMessage = { 
            role: 'user', 
            content: input
        };

        setMessages(prev => [...prev, userMessage]);
        const currentInput = input;
        
        setInput('');
        setIsLoading(true);

        try {
            // Prepare content for AI (text-only for GitHub Copilot gateway)
            const messageContent = currentInput;

            const response = await fetch(COPILOT_WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${AI_INTERNAL_KEY}`,
                    'x-internal-key': AI_INTERNAL_KEY,
                },
                body: JSON.stringify({
                    messages: [...messages, { role: 'user', content: messageContent }].map(m => ({
                        role: m.role === 'ai' ? 'assistant' : 'user',
                        content: m.content
                    })),
                    model: 'gpt-5-mini', // Reverted to user's specified model
                }),
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}: Gagal menghubungi Copilot Gateway`);
            }

            const data = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || 'Maaf, terjadi kesalahan saat mengambil respon.';
            
            setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);
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
                            <span className="header-name">Medx Copilot</span>
                            <span className="header-status">Online & Ready</span>
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
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        </div>
                    ))}
                    {isLoading && (
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
                    <div className="input-wrapper-v2">
                        <textarea 
                            className="chat-textarea"
                            placeholder="Tulis pesan..."
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

