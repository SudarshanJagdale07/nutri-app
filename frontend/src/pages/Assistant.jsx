// frontend/src/pages/Assistant.jsx
import React, { useState, useRef, useEffect } from "react";

function Assistant() {
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content:
        "Hi. I’ve reviewed today’s intake. You’re slightly low on protein. Would you like dinner suggestions?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWhy, setShowWhy] = useState(false);

  const chatEndRef = useRef(null);

  // Mock user context (replace later with real data)
  const userContext = {
    goal: "Muscle Gain",
    diet: "Vegetarian",
    todayCalories: 1420,
    calorieGoal: 2200,
    protein: 52,
    proteinGoal: 110,
  };

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const simulateAIResponse = (userMessage) => {
    setLoading(true);

    setTimeout(() => {
      setMessages((prev) => [
        ...prev,
        {
          role: "assistant",
          content:
            "For dinner, you could have paneer bhurji with 2 rotis and a bowl of curd. This would add ~35g protein and help close your gap.",
        },
      ]);
      setLoading(false);
    }, 1200);
  };

  const handleSend = () => {
    if (!input.trim()) return;

    const userMessage = {
      role: "user",
      content: input,
    };

    setMessages((prev) => [...prev, userMessage]);
    setInput("");
    simulateAIResponse(input);
  };

  const quickPrompts = [
    "Suggest a high-protein veg dinner",
    "How can I meet today’s protein goal?",
    "Why is my sugar intake high this week?",
  ];

  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] relative overflow-hidden pb-24 font-sans">
      {/* Background blur accents */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      <div className="max-w-6xl mx-auto pt-80 pb-16 px-6 md:px-10 relative z-10">
        {/* HEADER */}
        <div className="max-w-6xl mb-10">
          <h1 className="text-5xl font-serif font-bold">AI Assistant</h1>
          <p className="text-gray-500 mt-3 text-lg">
            Personalized suggestions based on your logged meals.
          </p>
        </div>

        {/* LAYOUT */}
        <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
          {/* CHAT AREA */}
          <div className="md:col-span-2 bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-lg flex flex-col h-[600px]">
            {/* MESSAGES */}
            <div className="flex-1 overflow-y-auto space-y-6 pr-2">
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[75%] px-6 py-4 rounded-[1.8rem] ${
                      msg.role === "user" ? "bg-[#00A676] text-white" : "bg-white shadow-sm"
                    }`}
                  >
                    {msg.content}

                    {/* Explainability toggle for assistant */}
                    {msg.role === "assistant" && index === messages.length - 1 && (
                      <div className="mt-3 text-sm text-gray-500">
                        <button onClick={() => setShowWhy(!showWhy)} className="underline">
                          Why this suggestion?
                        </button>

                        {showWhy && (
                          <div className="mt-2 text-xs text-gray-400">
                            You are currently 58g short of your daily protein goal.
                            Paneer and curd are vegetarian protein sources that
                            increase intake without excessive calories.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {loading && <div className="text-gray-400 text-sm">Assistant is thinking...</div>}

              <div ref={chatEndRef}></div>
            </div>

            {/* INPUT */}
            <div className="mt-6 flex gap-4">
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your nutrition..."
                className="flex-1 px-6 py-3 rounded-full border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10"
              />
              <button
                onClick={handleSend}
                className="bg-[#00A676] text-white px-6 py-3 rounded-full font-bold hover:scale-105 transition"
              >
                Send
              </button>
            </div>

            {/* QUICK PROMPTS */}
            <div className="mt-6 flex flex-wrap gap-3">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => {
                    setInput(prompt);
                  }}
                  className="text-sm bg-white shadow-sm px-4 py-2 rounded-full hover:shadow-md transition"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          {/* CONTEXT PANEL */}
          <div className="bg-white/60 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-md transition transform hover:scale-[1.02] hover:shadow-xl">
            <h3 className="text-xl font-bold mb-6">Your Context</h3>

            <div className="space-y-4 text-sm text-gray-600">
              <div>
                <strong>Goal:</strong> {userContext.goal}
              </div>

              <div>
                <strong>Diet:</strong> {userContext.diet}
              </div>

              <div>
                <strong>Calories:</strong> {userContext.todayCalories} / {userContext.calorieGoal}
              </div>

              <div>
                <strong>Protein:</strong> {userContext.protein}g / {userContext.proteinGoal}g
              </div>
            </div>

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