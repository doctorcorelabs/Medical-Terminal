/* src/components/common/CopilotChat.jsx */
import React, { useState, useRef, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import './CopilotChat.css';

const COPILOT_WORKER_URL = import.meta.env.VITE_COPILOT_WORKER_URL;

const CopilotChat = () => {
    const [isOpen, setIsOpen] = useState(false);
    const [messages, setMessages] = useState([
        { role: 'ai', content: 'Halo! Saya asisten klinis MedxTerminal. Ada yang bisa saya bantu hari ini?' }
    ]);
    const [input, setInput] = useState('');
    const [isLoading, setIsLoading] = useState(false);
    
    const messagesEndRef = useRef(null);

    const scrollToBottom = () => {
        messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
    };

    useEffect(() => {
        scrollToBottom();
    }, [messages, isLoading]);

    const handleSend = async () => {
        if (!input.trim() || isLoading) return;

        const userMessage = { role: 'user', content: input };
        setMessages(prev => [...prev, userMessage]);
        setInput('');
        setIsLoading(true);

        try {
            const response = await fetch(COPILOT_WORKER_URL, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    messages: [...messages, userMessage].map(m => ({
                        role: m.role === 'ai' ? 'assistant' : 'user',
                        content: m.content
                    })),
                    model: 'gpt-4o',
                }),
            });

            if (!response.ok) {
                throw new Error('Gagal menghubungi Copilot Gateway');
            }

            const data = await response.json();
            const aiContent = data.choices?.[0]?.message?.content || 'Maaf, terjadi kesalahan saat mengambil respon.';
            
            setMessages(prev => [...prev, { role: 'ai', content: aiContent }]);
        } catch (error) {
            console.error('Copilot Error:', error);
            setMessages(prev => [...prev, { role: 'ai', content: `Error: ${error.message}. Pastikan Cloudflare Worker Anda sudah berjalan dan GITHUB_TOKEN sudah diset.` }]);
        } finally {
            setIsLoading(false);
        }
    };

    return (
        <div className="copilot-chat-container">
            {/* Toggle Button */}
            <button 
                className="copilot-floating-button"
                onClick={() => setIsOpen(!isOpen)}
                aria-label="Toggle Copilot Chat"
            >
                <span className="material-symbols-outlined">
                    {isOpen ? 'close' : 'chat_spark'}
                </span>
            </button>

            {/* Chat Window */}
            {isOpen && (
                <div className="copilot-chat-window">
                    <div className="copilot-chat-header">
                        <h3>
                            <div className="copilot-status-dot"></div>
                            Copilot Clinical AI
                        </h3>
                        <button onClick={() => setIsOpen(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', opacity: 0.5 }}>
                            <span className="material-symbols-outlined" style={{ fontSize: '20px' }}>expand_more</span>
                        </button>
                    </div>

                    <div className="copilot-chat-messages">
                        {messages.map((msg, idx) => (
                            <div key={idx} className={`message message-${msg.role}`}>
                                <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                    {msg.content}
                                </ReactMarkdown>
                            </div>
                        ))}
                        {isLoading && (
                            <div className="message message-ai">
                                <div className="typing-indicator">
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                    <div className="typing-dot"></div>
                                </div>
                            </div>
                        )}
                        <div ref={messagesEndRef} />
                    </div>

                    <div className="copilot-chat-input">
                        <input 
                            type="text" 
                            className="copilot-input"
                            placeholder="Tanya sesuatu..."
                            value={input}
                            onChange={(e) => setInput(e.target.value)}
                            onKeyPress={(e) => e.key === 'Enter' && handleSend()}
                        />
                        <button className="copilot-send-btn" onClick={handleSend} disabled={isLoading}>
                            <span className="material-symbols-outlined">send</span>
                        </button>
                    </div>
                </div>
            )}
        </div>
    );
};

export default CopilotChat;
