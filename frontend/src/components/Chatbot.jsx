import React, { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTimes, faPaperPlane } from '@fortawesome/free-solid-svg-icons';
import { motion, AnimatePresence } from 'framer-motion';
import useUserStore from '../store/user';

const Chatbot = () => {
  const { user } = useUserStore();
  const userName = user?.name || user?.email?.split('@')[0] || 'friend';

  const [isOpen, setIsOpen] = useState(false);
  const [messages, setMessages] = useState([
    { role: 'assistant', content: `How can I help with your nutrition today, ${userName}?` }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  // Only scroll to bottom when messages length changes (new user or bot message)
  useEffect(() => {
    if (messages.length > 1) {
      scrollToBottom();
    }
  }, [messages.length]);

  const toggleChat = () => setIsOpen(!isOpen);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;

    const userMessage = input.trim();
    setInput('');
    const newMessages = [...messages, { role: 'user', content: userMessage }];
    setMessages(newMessages);
    setIsLoading(true);

    try {
      const response = await fetch('http://localhost:5000/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message: userMessage, history: messages }),
      });

      if (!response.ok) throw new Error('Failed to get response');
      const data = await response.json();
      setMessages((prev) => [...prev, { role: 'assistant', content: data.reply }]);
    } catch (error) {
      console.error('Chat error:', error);
      setMessages((prev) => [...prev, { role: 'assistant', content: 'Something went wrong. Please try again.' }]);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="fixed bottom-6 right-6 z-[9999] flex flex-col items-end pointer-events-none">
      <AnimatePresence>
        {isOpen && (
          <motion.div
            initial={{ opacity: 0, y: 50, scale: 0.95 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 50, scale: 0.95 }}
            className="w-[320px] sm:w-[350px] h-[500px] mb-4 flex flex-col overflow-hidden bg-white rounded-2xl shadow-2xl border border-gray-200 pointer-events-auto"
          >
            {/* Header: Reference Image Style */}
            <div className="pt-8 pb-4 flex flex-col items-center bg-gradient-to-b from-[#E3F2FD] to-white relative">
              <button 
                onClick={toggleChat} 
                className="absolute top-4 right-4 text-gray-400 hover:text-gray-600 transition-colors"
                aria-label="Close chat"
              >
                <FontAwesomeIcon icon={faTimes} />
              </button>
              
              <div className="w-20 h-20 rounded-full border-2 border-white shadow-md overflow-hidden bg-[#E3F2FD] mb-3 flex items-center justify-center">
                <img 
                  src="/bot-avatar.png" 
                  alt="Nutri AI" 
                  className="w-full h-full object-cover scale-110" 
                />
              </div>
              <h3 className="text-gray-800 font-bold text-lg">Nutri AI Support</h3>
            </div>

            {/* Messages Area */}
            <div className="flex-1 overflow-y-auto px-4 py-2 flex flex-col gap-4 bg-white">
              {messages.map((msg, idx) => (
                <div 
                  key={idx} 
                  className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                  <span className="text-[11px] font-medium text-gray-400 mb-1 px-1">
                    {msg.role === 'user' ? userName : 'Nutri-Bot'}
                  </span>
                  <div className={`max-w-[85%] rounded-[18px] px-4 py-2 text-[14px] shadow-sm ${
                    msg.role === 'user' 
                      ? 'bg-[#1B72E8] text-white rounded-tr-none' 
                      : 'bg-[#F0F0F0] text-gray-700 rounded-tl-none'
                  }`}>
                    {msg.content}
                  </div>
                </div>
              ))}
              
              {isLoading && (
                <div className="flex flex-col items-start">
                  <span className="text-[11px] font-medium text-gray-400 mb-1 px-1">Nutri-Bot</span>
                  <div className="bg-[#F0F0F0] rounded-[18px] px-5 py-3 rounded-tl-none border border-gray-100 flex gap-1 items-center">
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce" />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.2s]" />
                    <div className="w-1.5 h-1.5 rounded-full bg-gray-400 animate-bounce [animation-delay:0.4s]" />
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input Area */}
            <div className="p-3 border-t border-gray-100">
              <form onSubmit={handleSubmit} className="flex gap-2">
                <input
                  type="text"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder="Ask Nutri AI..."
                  className="flex-1 bg-gray-50 border border-gray-200 rounded-full px-4 py-2 text-[14px] text-gray-800 focus:outline-none focus:border-[#1B72E8]/50 transition-all"
                  disabled={isLoading}
                />
                <button
                  type="submit"
                  disabled={!input.trim() || isLoading}
                  className="w-10 h-10 rounded-full bg-[#1B72E8] hover:bg-[#1557B0] text-white flex items-center justify-center transition-all disabled:opacity-50"
                >
                  <FontAwesomeIcon icon={faPaperPlane} className="text-xs" />
                </button>
              </form>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Bouncing Toggle Button */}
      <motion.button
        animate={{ y: [0, -10, 0] }}
        transition={{ duration: 2, repeat: Infinity, ease: "easeInOut" }}
        whileHover={{ scale: 1.1 }}
        whileTap={{ scale: 0.9 }}
        onClick={toggleChat}
        className="w-14 h-14 rounded-full flex items-center justify-center shadow-xl transition-all bg-white border border-gray-100 pointer-events-auto overflow-hidden relative"
      >
        {isOpen ? (
          <FontAwesomeIcon icon={faTimes} className="text-gray-500 text-xl" />
        ) : (
          <div className="w-full h-full bg-[#E3F2FD] flex items-center justify-center">
            <img src="/bot-avatar.png" alt="Chat" className="w-full h-full object-cover scale-110" />
          </div>
        )}
      </motion.button>
    </div>
  );
};

export default Chatbot;
