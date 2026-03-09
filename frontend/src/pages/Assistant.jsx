// frontend/src/pages/Assistant.jsx
import React, { useState, useRef, useEffect } from "react";
import useUserStore from "../store/user";
import { sendChatMessage } from "../apiManager/chatApi";
// Decode HTML entities
const decodeHTML = (html) => {
  const txt = document.createElement("textarea");
  txt.innerHTML = html;
  return txt.value;
};

function Assistant() {
  const { user } = useUserStore();

  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hi! 👋 I'm your AI Nutrition Assistant. I can see your real meal data and help you with personalized nutrition advice. What would you like to know?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [context, setContext] = useState(null);
  const chatEndRef = useRef(null);

  // Load chat history and context from localStorage on mount
  useEffect(() => {
    if (user?._id) {
      const saved = localStorage.getItem(`chat_${user._id}`);
      if (saved) {
        try {
          setMessages(JSON.parse(saved));
        } catch (e) {
          console.error("Failed to load chat history");
        }
      }
      
      const savedContext = localStorage.getItem(`chat_context_${user._id}`);
      if (savedContext) {
        try {
          setContext(JSON.parse(savedContext));
        } catch (e) {}
      }
    }
  }, [user?._id]);

  // Save chat history to localStorage whenever messages change
  // Save chat history to localStorage whenever messages change (keep last 50)
useEffect(() => {
  if (user?._id && messages.length > 1) {
    const limitedMessages = messages.slice(-50); // Keep only last 50 messages
    localStorage.setItem(`chat_${user._id}`, JSON.stringify(limitedMessages));
  }
}, [messages, user?._id]);


  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleSend = async (messageText = null) => {
    const text = messageText || input;
    if (!text.trim() || loading) return;

    const userMessage = { role: "user", content: text };
    setMessages(prev => [...prev, userMessage]);
    setInput("");
    setLoading(true);

    try {
      // Build history excluding the initial greeting
      const history = messages.slice(1);

      const data = await sendChatMessage(user?._id, text, history);

      setMessages(prev => [...prev, {
        role: "assistant",
        content: data.reply
      }]);

      // Update context panel with real data
      if (data.context) {
        setContext(data.context);
        localStorage.setItem(`chat_context_${user._id}`, JSON.stringify(data.context));
      }

    } catch (err) {
      setMessages(prev => [...prev, {
        role: "assistant",
        content: "Sorry, I couldn't get a response. Please try again! 🙏"
      }]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "What did I eat today?",
    "Am I meeting my protein goal?",
    "Suggest a high protein Indian dinner",
    "How many calories do I have left?",
    "Give me a meal plan for tomorrow",
  ];

  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] relative overflow-hidden pb-24 font-sans">
      {/* Background blur accents */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      <div className="max-w-6xl mx-auto pt-28 pb-16 px-6 md:px-10 relative z-10">
        {/* HEADER */}
        <div className="mb-10">
          <h1 className="text-5xl font-serif font-bold">AI Assistant</h1>
          <p className="text-gray-500 mt-3 text-lg">
            Personalized suggestions based on your real logged meals.
          </p>
        </div>

        {/* LAYOUT */}
        <div className="grid md:grid-cols-3 gap-8">
          {/* CHAT AREA */}
          <div className="md:col-span-2 bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-lg flex flex-col h-[600px]">

            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto space-y-4 pr-2">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div className={`flex items-start gap-3 max-w-[80%] ${msg.role === "user" ? "flex-row-reverse" : ""}`}>
                    {/* Avatar */}
                    <div className={`w-8 h-8 rounded-full flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                      msg.role === "user" ? "bg-[#00A676] text-white" : "bg-gray-100 text-gray-600"
                    }`}>
                      {msg.role === "user" ? (user?.name?.[0]?.toUpperCase() || "U") : "🤖"}
                    </div>

                    {/* Bubble */}
                    <div className={`px-5 py-3 rounded-[1.5rem] text-sm leading-relaxed ${
                      msg.role === "user"
                        ? "bg-[#00A676] text-white rounded-tr-sm"
                        : "bg-white shadow-sm text-gray-800 rounded-tl-sm"
                    }`}>
                      {decodeHTML(msg.content).replace(/\*\*/g, '').replace(/\*/g, '')}

                    </div>
                  </div>
                </div>
              ))}

              {/* Loading indicator */}
              {loading && (
                <div className="flex justify-start">
                  <div className="flex items-center gap-3">
                    <div className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">🤖</div>
                    <div className="bg-white shadow-sm px-5 py-3 rounded-[1.5rem] rounded-tl-sm">
                      <div className="flex gap-1 items-center">
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "0ms" }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "150ms" }} />
                        <div className="w-2 h-2 bg-gray-400 rounded-full animate-bounce" style={{ animationDelay: "300ms" }} />
                      </div>
                    </div>
                  </div>
                </div>
              )}

              <div ref={chatEndRef} />
            </div>

            {/* QUICK PROMPTS */}
            <div className="mt-4 flex flex-wrap gap-2">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  disabled={loading}
                  className="text-xs bg-white shadow-sm px-3 py-2 rounded-full hover:shadow-md hover:bg-[#00A676]/10 transition disabled:opacity-50"
                >
                  {prompt}
                </button>
              ))}
            </div>

            {/* INPUT */}
            <div className="mt-4 flex gap-3">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && handleSend()}
                placeholder="Ask about your nutrition..."
                disabled={loading}
                className="flex-1 px-5 py-3 rounded-full border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/20 text-sm disabled:opacity-50"
              />
              <button
                onClick={() => handleSend()}
                disabled={loading || !input.trim()}
                className="bg-[#00A676] text-white px-6 py-3 rounded-full font-bold hover:scale-105 transition disabled:opacity-50 disabled:hover:scale-100"
              >
                Send
              </button>
            </div>
          </div>

          {/* CONTEXT PANEL */}
          <div className="bg-white/60 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-md">
            <h3 className="text-xl font-bold mb-6">Your Context</h3>

            {context ? (
              <div className="space-y-4 text-sm text-gray-600">
                <div className="bg-[#F2F6F2] rounded-2xl p-4">
                  <div className="text-xs text-gray-400 mb-1">Calories Today</div>
                  <div className="font-bold text-lg text-[#00A676]">
                    {context.caloriesConsumed} <span className="text-gray-400 text-sm font-normal">/ {context.calorieGoal} kcal</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full mt-2">
                    <div
                      className="h-2 bg-[#00A676] rounded-full"
                      style={{ width: `${Math.min(100, (context.caloriesConsumed / context.calorieGoal) * 100)}%` }}
                    />
                  </div>
                </div>

                <div className="bg-[#F2F6F2] rounded-2xl p-4">
                  <div className="text-xs text-gray-400 mb-1">Protein Today</div>
                  <div className="font-bold text-lg text-blue-500">
                    {context.proteinConsumed}g <span className="text-gray-400 text-sm font-normal">/ {context.proteinGoal}g</span>
                  </div>
                  <div className="h-2 bg-gray-200 rounded-full mt-2">
                    <div
                      className="h-2 bg-blue-500 rounded-full"
                      style={{ width: `${Math.min(100, (context.proteinConsumed / context.proteinGoal) * 100)}%` }}
                    />
                  </div>
                </div>

                <div><strong>Goal:</strong> {context.goal}</div>
                <div><strong>Diet:</strong> {context.diet}</div>
                <div><strong>Meals logged:</strong> {context.mealsLogged} today</div>
              </div>
            ) : (
              <div className="space-y-4 text-sm text-gray-500">
                <p>Ask me anything to load your real nutrition context!</p>
                <div className="text-xs text-gray-400 mt-4">
                  💡 Try asking "What did I eat today?" to get started.
                </div>
              </div>
            )}

            <div className="mt-8 text-xs text-gray-400">
              Suggestions are generated based on your logged meals and goals. This is not medical advice.
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Assistant;
