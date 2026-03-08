// frontend/src/pages/Assistant.jsx
import React, { useState, useRef, useEffect } from "react";
import useUserStore from "../store/user";
import { getDailyNutrition } from "../apiManager/foodApi";
import { postChatMessage } from "../apiManager/chatApi";
import { fetchProfile } from "../apiManager/profileApi";
import useHistoryData from "../hooks/useHistoryData";
import toast from "react-hot-toast";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

function Assistant() {
  const { user, updateProfile } = useUserStore();
  const [messages, setMessages] = useState([
    {
      role: "assistant",
      content: "Hello! I'm Nutri-Bot. I've analyzed your current intake and goals. How can I help you today?",
    },
  ]);

  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [showWhy, setShowWhy] = useState(false);
  const [nutrition, setNutrition] = useState(null);

  const chatContainerRef = useRef(null);

  // ✅ History data for LLM context
  const { weekData } = useHistoryData(user?._id);

  // Fetch current context on mount
  useEffect(() => {
    async function loadData() {
      if (!user?._id) return;
      try {
        const today = new Date().toISOString().split("T")[0];
        // Fetch Daily Nutrition and Profile in parallel
        const [nutriRes, profileRes] = await Promise.all([
          getDailyNutrition(user._id, today),
          fetchProfile(user._id)
        ]);

        if (nutriRes?.daily) {
          setNutrition(nutriRes.daily);
        }
        if (profileRes?.data) {
          updateProfile(profileRes.data); // ✅ Sync store with latest profile from DB
        }
      } catch (err) {
        console.error("Failed to load context data:", err);
      }
    }
    loadData();
  }, [user?._id]); // Only re-run if userId changes

  useEffect(() => {
    if (chatContainerRef.current) {
      chatContainerRef.current.scrollTop = chatContainerRef.current.scrollHeight;
    }
  }, [messages, loading]);

  const handleSend = async (customMessage) => {
    const textToSend = typeof customMessage === "string" ? customMessage : input;
    if (!textToSend.trim()) return;

    const userMessage = { role: "user", content: textToSend };
    setMessages((prev) => [...prev, userMessage]);
    
    if (typeof customMessage !== "string") setInput("");
    
    setLoading(true);
    try {
      const res = await postChatMessage(textToSend);
      if (res?.reply) {
        setMessages((prev) => [...prev, { role: "assistant", content: res.reply }]);
      }
    } catch (err) {
      toast.error("Assistant is having trouble connecting.");
      setMessages((prev) => [
        ...prev,
        { role: "assistant", content: "I'm sorry, I'm having trouble connecting to my brain right now. Please try again later." },
      ]);
    } finally {
      setLoading(false);
    }
  };

  const quickPrompts = [
    "How much more protein do I need?",
    "Suggest a high-protein dinner",
    "How was my intake yesterday?",
    "Why is my sugar intake high?",
  ];

  // Derived context for the panel
  const profile = user?.profile || {};
  const currentStats = {
    goal: profile.goal || "Not set",
    diet: profile.dietPreference || "Not set",
    todayCalories: nutrition?.completedCalories || 0,
    calorieGoal: profile.dailyCalorieTarget || 0,
    protein: nutrition?.completedProtein || 0,
    proteinGoal: profile.dailyProteinTarget || 0,
    carbs: nutrition?.completedCarbs || 0,
    carbsGoal: profile.dailyCarbsTarget || 0,
    fats: nutrition?.completedFats || 0,
    fatsGoal: profile.dailyFatTarget || 0,
  };

  // Helper to format goal
  const formatGoal = (goal) => {
    if (!goal || goal === "Not set") return "Not set";
    return goal
      .split("_")
      .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
      .join(" ");
  };

  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] relative overflow-hidden pb-24 font-sans">
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      <div className="max-w-6xl mx-auto pt-80 pb-16 px-6 md:px-10 relative z-10">
        <div className="max-w-6xl mb-10">
          <h1 className="text-5xl font-serif font-bold">AI Assistant</h1>
          <p className="text-gray-500 mt-3 text-lg">
            Personalized suggestions based on your logged meals.
          </p>
        </div>

        <div className="grid md:grid-cols-3 gap-8 max-w-6xl">
          <div className="md:col-span-2 bg-white/70 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-lg flex flex-col h-[600px]">
            <div 
              ref={chatContainerRef}
              className="flex-1 overflow-y-auto space-y-6 pr-2"
            >
              {messages.map((msg, index) => (
                <div
                  key={index}
                  className={`flex ${msg.role === "user" ? "justify-end" : "justify-start"}`}
                >
                  <div
                    className={`max-w-[85%] px-6 py-4 rounded-[1.8rem] ${
                      msg.role === "user"
                        ? "bg-[#00A676] text-white whitespace-pre-wrap"
                        : "bg-white shadow-sm text-gray-800"
                    }`}
                  >
                    {msg.role === "assistant" ? (
                      msg.content
                    ) : (
                      msg.content
                    )}

                    {msg.role === "assistant" && index === messages.length - 1 && index > 0 && (
                      <div className="mt-3 text-sm text-gray-500 border-t pt-2">
                        <button onClick={() => setShowWhy(!showWhy)} className="underline hover:text-[#00A676]">
                          Why this suggestion?
                        </button>

                        {showWhy && (
                          <div className="mt-2 text-xs text-gray-400 italic">
                            This advice is generated based on your goal: {formatGoal(currentStats.goal)}, 
                            current protein gap: {Math.max(0, currentStats.proteinGoal - currentStats.protein)}g,
                            and historical trends.
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                </div>
              ))}
              {loading && <div className="text-[#00A676] text-sm animate-pulse ml-4">Nutri-Bot is typing...</div>}
            </div>

            <form 
              onSubmit={(e) => { e.preventDefault(); handleSend(); }}
              className="mt-6 flex gap-4"
            >
              <input
                type="text"
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="Ask about your nutrition..."
                className="flex-1 px-6 py-4 rounded-full border border-gray-200 focus:outline-none focus:ring-4 focus:ring-[#00A676]/10 focus:border-[#00A676] transition"
              />
              <button
                type="submit"
                disabled={loading}
                className="bg-[#00A676] text-white px-8 py-4 rounded-full font-bold hover:scale-105 transition shadow-md active:scale-95 disabled:opacity-50"
              >
                Send
              </button>
            </form>

            <div className="mt-6 flex flex-wrap gap-3">
              {quickPrompts.map((prompt, i) => (
                <button
                  key={i}
                  onClick={() => handleSend(prompt)}
                  className="text-xs bg-white shadow-sm border border-gray-100 px-4 py-2 rounded-full hover:shadow-md hover:border-[#00A676]/30 transition text-gray-600"
                >
                  {prompt}
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white/60 backdrop-blur-xl rounded-[2.5rem] p-8 shadow-md border border-white/40 h-fit">
            <h3 className="text-xl font-bold mb-6 flex items-center gap-2">
              <span className="w-2 h-2 bg-[#00A676] rounded-full"></span>
              Your Context
            </h3>

            <div className="space-y-6 text-sm">
              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-gray-500">Goal</span>
                <span className="font-bold text-[#00A676]">{formatGoal(currentStats.goal)}</span>
              </div>

              <div className="flex justify-between items-center pb-2 border-b border-gray-100">
                <span className="text-gray-500">Diet</span>
                <span className="font-bold">{currentStats.diet}</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Calories</span>
                  <span className="font-medium">
                    {Number(currentStats.todayCalories).toFixed(2)} / {currentStats.calorieGoal} kcal
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-[#00A676] h-full transition-all duration-500" 
                    style={{ width: `${currentStats.calorieGoal > 0 ? Math.min(100, (currentStats.todayCalories / currentStats.calorieGoal) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Protein</span>
                  <span className="font-medium">
                    {Number(currentStats.protein).toFixed(2)}g / {currentStats.proteinGoal}g
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-blue-400 h-full transition-all duration-500" 
                    style={{ width: `${currentStats.proteinGoal > 0 ? Math.min(100, (currentStats.protein / currentStats.proteinGoal) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Carbohydrates</span>
                  <span className="font-medium">
                    {Number(currentStats.carbs).toFixed(2)}g / {currentStats.carbsGoal}g
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-orange-400 h-full transition-all duration-500" 
                    style={{ width: `${currentStats.carbsGoal > 0 ? Math.min(100, (currentStats.carbs / currentStats.carbsGoal) * 100) : 0}%` }}
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-xs">
                  <span className="text-gray-500">Fats</span>
                  <span className="font-medium">
                    {Number(currentStats.fats).toFixed(2)}g / {currentStats.fatsGoal}g
                  </span>
                </div>
                <div className="w-full bg-gray-200 rounded-full h-1.5 overflow-hidden">
                  <div 
                    className="bg-red-400 h-full transition-all duration-500" 
                    style={{ width: `${currentStats.fatsGoal > 0 ? Math.min(100, (currentStats.fats / currentStats.fatsGoal) * 100) : 0}%` }}
                  />
                </div>
              </div>
            </div>

            <div className="mt-10 p-4 bg-[#F2F6F2] rounded-2xl text-[10px] text-gray-400 leading-relaxed italic">
              "Suggestions are generated based on your logged meals and goals. This is not medical advice. Use for informational purposes only."
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default Assistant;
