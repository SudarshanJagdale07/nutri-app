// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import useUserStore from "../store/user";
import { useNavigate } from "react-router-dom";
import { fetchProfile } from "../apiManager/profileApi";
import toast from "react-hot-toast";

const Dashboard = () => {
  const { user } = useUserStore();
  const navigate = useNavigate();

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Today's totals (live, updatable)
  const [caloriesConsumed, setCaloriesConsumed] = useState(1450);
  const [proteinConsumed, setProteinConsumed] = useState(62);
  const [carbsConsumed, setCarbsConsumed] = useState(180);
  const [fatsConsumed, setFatsConsumed] = useState(50);

  // Scanner / Image state
  const [filePreview, setFilePreview] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const fileInputRef = useRef(null);
  const abortControllerRef = useRef(null);

  const [quickDetectedItems, setQuickDetectedItems] = useState(null);
  const [analyzingImage, setAnalyzingImage] = useState(false);
  const [quantities, setQuantities] = useState({});

  // Show / hide the log-food scanner panel
  const [showScanner, setShowScanner] = useState(false);

  // Redirect if not signed in
  useEffect(() => {
    if (!user) navigate("/signin");
  }, [user, navigate]);

  /* ---------- Fetch Real Profile ---------- */
  useEffect(() => {
    if (!user?._id) {
      setLoading(false);
      return;
    }
    setLoading(true);
    fetchProfile(user._id)
      .then((res) => { setProfile(res.data || null); setLoading(false); })
      .catch(() => { setProfile(null); setLoading(false); });
  }, [user]);

  /* ---------- Time Logic ---------- */
  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const isEvening = hour >= 18;

  const greetingText = isMorning
    ? "Good morning,"
    : isEvening
    ? "Good evening,"
    : "Welcome back,";

  const primaryCTA = isMorning ? "Log Breakfast" : isEvening ? "Log Dinner" : "Log Meal";

  if (!user) return null;
  if (loading) return <div className="pt-24 px-8">Loading dashboard...</div>;

  /* ---------- REAL VALUES FROM PROFILE ---------- */
  const calorieGoal = profile?.dailyCalories || 2000;
  const proteinGoal = profile?.dailyProtein || 80;

  const caloriePercent = Math.min(100, Math.round((caloriesConsumed / calorieGoal) * 100));
  const proteinPercent = Math.min(100, Math.round((proteinConsumed / proteinGoal) * 100));

  const calorieRemaining = Math.max(0, calorieGoal - caloriesConsumed);
  const proteinRemaining = Math.max(0, proteinGoal - proteinConsumed);

  /* ---------- Image Scanner Logic ---------- */
  const runRealImageAnalysis = async (file) => {
    if (abortControllerRef.current) abortControllerRef.current.abort();

    const controller = new AbortController();
    abortControllerRef.current = controller;

    setAnalyzingImage(true);
    setScannerActive(true);
    setQuickDetectedItems(null);

    const formData = new FormData();
    formData.append("image", file);

    try {
      const response = await fetch("http://localhost:5000/food/analyze", {
        method: "POST",
        body: formData,
        signal: controller.signal,
      });
      const data = await response.json();

      if (data && data.dish) {
        setQuickDetectedItems([data]);
      } else if (data.error) {
        toast.error(data.error);
      }
    } catch (error) {
      if (error.name !== "AbortError") {
        toast.error("Analysis Failed");
      }
    } finally {
      setScannerActive(false);
      setAnalyzingImage(false);
    }
  };

  const handleClear = () => {
    if (abortControllerRef.current) abortControllerRef.current.abort();
    setFilePreview(null);
    setQuickDetectedItems(null);
    setScannerActive(false);
    setAnalyzingImage(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleFileSelect = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setFilePreview(URL.createObjectURL(file));
      runRealImageAnalysis(file);
    }
  };

  const updateQuantity = (dish, delta) => {
    if (!dish) return;
    setQuantities((prev) => ({ ...prev, [dish]: Math.max(1, (prev[dish] || 1) + delta) }));
  };

  const scaleMacro = (val, qty) => {
    if (!val) return "0g";
    const num = parseFloat(val);
    return isNaN(num) ? val : `${(num * qty).toFixed(1)}g`;
  };

  const addTrackedCalories = (calories, protein = 0, carbs = 0, fats = 0) => {
    setCaloriesConsumed((c) => c + calories);
    setProteinConsumed((p) => p + protein);
    setCarbsConsumed((c) => c + carbs);
    setFatsConsumed((f) => f + fats);
    setQuickDetectedItems(null);
    setFilePreview(null);
    setShowScanner(false);
    toast.success("Added to daily log");
  };

  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] relative overflow-hidden pb-24 font-sans">
      {/* Background blur */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      <div className="max-w-7xl mx-auto px-8 pt-24 relative z-10">
        {/* HEADER */}
        <header className="mb-16">
          <h1 className="text-6xl font-serif font-bold leading-tight">
            {greetingText} <span className="text-[#00A676]">{user?.name || ""}</span>
          </h1>
          <p className="text-gray-500 mt-3 text-lg max-w-xl">Your nutrition today, clearly visualized.</p>
        </header>

        {/* Progress Section */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-12 mb-20">
          <ProgressRing
            title="Calories"
            consumed={caloriesConsumed}
            goal={calorieGoal}
            percent={caloriePercent}
            remaining={calorieRemaining}
            unit="kcal"
          />
          <ProgressRing
            title="Protein"
            consumed={proteinConsumed}
            goal={proteinGoal}
            percent={proteinPercent}
            remaining={proteinRemaining}
            unit="g"
          />
        </div>

        {/* Log Section — original style, button now toggles scanner */}
        <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-12 shadow-xl mb-20 flex flex-col md:flex-row items-center justify-between gap-8 transition hover:scale-[1.01]">
          <div>
            <h2 className="text-3xl font-serif font-bold mb-3">{primaryCTA}</h2>
            <p className="text-gray-600 max-w-md">
              Stay consistent. Every meal logged improves your AI insights and nutrition predictions.
            </p>
          </div>
          <button
            onClick={() => setShowScanner((v) => !v)}
            className="bg-[#00A676] text-white px-14 py-5 rounded-full font-bold shadow-lg hover:scale-105 transition"
          >
            {showScanner ? "Hide Scanner ↑" : "Start Logging →"}
          </button>
        </div>

        {/* ===== AI MEAL SCANNER PANEL (your new feature) ===== */}
        {showScanner && (
          <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-10 shadow-2xl border border-gray-100 mb-20">
            <div className="grid md:grid-cols-2 gap-12 items-start">

              {/* IMAGE AREA */}
              <div className="relative group">
                <div
                  className="border-[6px] border-dashed border-green-200 rounded-[2.5rem] h-[450px] flex flex-col items-center justify-center bg-green-50/30 overflow-hidden relative shadow-inner cursor-pointer"
                  onClick={() => fileInputRef.current?.click()}
                >
                  <input
                    type="file"
                    ref={fileInputRef}
                    className="hidden"
                    accept="image/*"
                    onChange={handleFileSelect}
                  />
                  {!filePreview ? (
                    <div className="text-center p-12">
                      <i className="fas fa-camera text-4xl text-[#00A676] mb-4" />
                      <p className="text-2xl font-bold text-gray-700">Scan Meal</p>
                    </div>
                  ) : (
                    <img src={filePreview} alt="preview" className="absolute inset-0 w-full h-full object-cover z-10" />
                  )}
                  <div
                    className={`absolute left-0 right-0 h-32 z-30 ${scannerActive ? "animate-scan" : "hidden"}`}
                    style={{ background: "linear-gradient(180deg, transparent 0%, rgba(0,166,118,0.3) 50%, transparent 100%)" }}
                  />
                </div>

                {filePreview && (
                  <div className="absolute bottom-4 left-4 right-4 flex gap-3 z-40">
                    <button
                      className="flex-1 bg-white text-gray-900 font-bold py-4 rounded-2xl shadow-xl active:scale-95 transition-all flex items-center justify-center gap-2"
                      onClick={() => runRealImageAnalysis(fileInputRef.current.files[0])}
                    >
                      <i className={`fas ${analyzingImage ? "fa-spinner fa-spin" : "fa-bolt text-yellow-500"}`} />
                      {analyzingImage ? "Analyzing..." : "AI Analyze"}
                    </button>
                    <button
                      className="w-14 h-14 bg-red-500 text-white rounded-2xl flex items-center justify-center hover:bg-red-600 shadow-xl transition-all"
                      onClick={handleClear}
                    >
                      <i className="fas fa-trash-alt text-xl" />
                    </button>
                  </div>
                )}
              </div>

              {/* RESULTS SECTION */}
              <div className="space-y-6">
                <h3 className="text-3xl font-serif font-bold text-gray-800 border-b-2 border-green-100 pb-4">
                  AI Analysis Results
                </h3>
                <div className="space-y-6">
                  {quickDetectedItems ? (
                    quickDetectedItems.map((it, idx) => {
                      if (!it || !it.dish) return null;

                      const qty = quantities[it.dish] || 1;
                      const nutrition = it.nutrition || {};
                      const calculatedCals = (nutrition.calories || 0) * qty;

                      return (
                        <div key={idx} className="space-y-4">
                          <div className="flex items-center gap-6 p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm relative">
                            <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center text-[#00A676] text-2xl shrink-0">
                              <i className="fas fa-utensils" />
                            </div>
                            <div className="flex-1">
                              <p className="text-xl font-black text-gray-800 capitalize">
                                {it.dish.replace(/_/g, " ")}
                              </p>
                              <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                                Portion: {nutrition.serving || "1 Standard Serving"}
                              </p>
                            </div>
                            <div className="text-right">
                              <span className="block text-2xl font-black text-[#00A676]">{calculatedCals}</span>
                              <span className="text-xs font-bold text-gray-400 uppercase">kcal</span>
                            </div>
                          </div>

                          <div className="flex items-center justify-between px-6 py-4 bg-gray-50 rounded-2xl border border-gray-200">
                            <span className="text-sm font-bold text-gray-600">Adjust Quantity</span>
                            <div className="flex items-center gap-4">
                              <button
                                onClick={() => updateQuantity(it.dish, -1)}
                                className="w-10 h-10 flex items-center justify-center bg-white rounded-xl font-bold text-[#00A676] border border-gray-100"
                              >
                                -
                              </button>
                              <span className="w-6 text-center font-black text-lg">{qty}</span>
                              <button
                                onClick={() => updateQuantity(it.dish, 1)}
                                className="w-10 h-10 flex items-center justify-center bg-white rounded-xl font-bold text-[#00A676] border border-gray-100"
                              >
                                +
                              </button>
                            </div>
                          </div>

                          <div className="grid grid-cols-3 gap-3">
                            <MacroBox label="Protein" val={scaleMacro(nutrition.protein, qty)} icon="🍗" color="bg-orange-50 text-orange-700" />
                            <MacroBox label="Fats" val={scaleMacro(nutrition.fat, qty)} icon="🥑" color="bg-yellow-50 text-yellow-700" />
                            <MacroBox label="Carbs" val={scaleMacro(nutrition.carbs, qty)} icon="🍞" color="bg-blue-50 text-blue-700" />
                          </div>

                          {it.suggestion && (
                            <div className="p-6 bg-[#00A676] rounded-[2rem] text-white shadow-lg">
                              <div className="flex items-center gap-2 mb-2">
                                <i className="fas fa-sparkles text-yellow-300" />
                                <p className="text-[10px] font-black uppercase tracking-widest opacity-80">NutriAI Insight</p>
                              </div>
                              <p className="text-sm font-bold italic leading-relaxed">"{it.suggestion}"</p>
                            </div>
                          )}

                          <button
                            onClick={() => {
                              const q = quantities[it.dish] || 1;
                              addTrackedCalories(
                                (nutrition.calories || 0) * q,
                                parseFloat(nutrition.protein || 0) * q,
                                parseFloat(nutrition.carbs || 0) * q,
                                parseFloat(nutrition.fat || 0) * q
                              );
                            }}
                            className="w-full bg-[#00A676] text-white py-6 rounded-3xl font-black text-xl hover:bg-[#008f64] transition-all shadow-xl flex items-center justify-center gap-3"
                          >
                            <i className="fas fa-check-circle" /> Add to Daily Log
                          </button>
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-20 text-gray-400 font-serif italic">
                      Scan a meal to see nutrition details...
                    </div>
                  )}
                </div>

                {quickDetectedItems && (
                  <div className="p-4 bg-gray-100 rounded-2xl border border-gray-200 mt-8">
                    <p className="text-[9px] text-gray-500 leading-tight">
                      <strong>Disclaimer:</strong> Nutritional values are estimates.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
        {/* ===== END AI MEAL SCANNER PANEL ===== */}

        {/* Insight Card */}
        <div className="bg-white/70 backdrop-blur-xl rounded-[3rem] p-10 shadow-lg mb-16 transition transform hover:scale-[1.02] hover:shadow-xl">
          <h2 className="text-2xl font-serif font-bold mb-4">Weekly Insight</h2>
          <p className="text-gray-600 mb-6">Your sugar intake increased by 20% this week.</p>
          <button onClick={() => navigate("/assistant")} className="text-[#00A676] font-bold hover:underline">
            Get suggestions →
          </button>
        </div>

        {isEvening && (
          <div className="bg-[#00A676]/10 rounded-[2.5rem] p-8 text-center">
            <h3 className="text-xl font-bold">Prepare for tomorrow.</h3>
            <p className="text-gray-600 mt-2">Consistent logging improves smarter predictions.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanY {
          0% { transform: translateY(-120%); opacity: 0; }
          50% { transform: translateY(50%); opacity: 1; }
          100% { transform: translateY(120%); opacity: 0; }
        }
        .animate-scan { animation: scanY 2s cubic-bezier(0.4, 0, 0.2, 1) infinite; }
      `}</style>
    </div>
  );
};

/* ---------- Circular Progress Component with animation ---------- */
const ProgressRing = ({ title, consumed, goal, percent, remaining, unit }) => {
  const radius = 95;
  const stroke = 14;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;

  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const progressOffset = circumference - (percent / 100) * circumference;
    const t = setTimeout(() => setOffset(progressOffset), 200);
    return () => clearTimeout(t);
  }, [percent, circumference]);

  return (
    <div className="bg-white/80 backdrop-blur-xl rounded-[3rem] p-10 shadow-lg flex flex-col items-center text-center transition transform hover:scale-[1.02] hover:shadow-xl">
      <p className="uppercase text-xs font-black tracking-widest text-gray-400 mb-6">{title} Today</p>

      <div className="relative">
        <svg height={radius * 2} width={radius * 2}>
          <circle stroke="#E5E7EB" fill="transparent" strokeWidth={stroke} r={normalizedRadius} cx={radius} cy={radius} />
          <circle
            stroke="#00A676"
            fill="transparent"
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${circumference} ${circumference}`}
            style={{ strokeDashoffset: offset, transition: "stroke-dashoffset 0.8s ease" }}
            r={normalizedRadius}
            cx={radius}
            cy={radius}
            transform={`rotate(-90 ${radius} ${radius})`}
          />
        </svg>

        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="text-3xl font-black text-[#00A676]">{percent}%</span>
          <span className="text-xs text-gray-500 mt-1">completed</span>
        </div>
      </div>

      <div className="mt-6 text-lg font-bold">
        {consumed} / {goal} {unit}
      </div>
      <div className="text-sm text-gray-500">{remaining} {unit} remaining</div>
    </div>
  );
};

/* ---------- MacroBox ---------- */
const MacroBox = ({ label, val, icon, color }) => (
  <div className={`${color} p-4 rounded-[1.5rem] border border-black/5 text-center transition-all hover:scale-105`}>
    <span className="text-2xl block mb-1">{icon}</span>
    <p className="text-[10px] font-black uppercase opacity-60 tracking-wider">{label}</p>
    <p className="font-black text-lg">{val || "0g"}</p>
  </div>
);

export default Dashboard;