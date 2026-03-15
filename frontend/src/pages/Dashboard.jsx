// frontend/src/pages/Dashboard.jsx
import React, { useEffect, useState, useRef } from "react";
import useUserStore from "../store/user";
import { useNavigate } from "react-router-dom";
import { fetchProfile } from "../apiManager/profileApi"; // keep if exists
import toast from "react-hot-toast";
import { postAddToDaily, getDailyNutrition, postImageAnalyze } from "../apiManager/foodApi"; // backend API client (kept for backward compatibility)
import useMealAnalysis from "../hooks/useMealAnalysis";
import useDailyNutrition from "../hooks/useDailyNutrition";
import { formatNumberSmart } from "../utils/weekUtils"; // smart number formatting (2 decimals only when needed)
import FoodTextLogger from "../components/FoodTextLogger";
import FoodImageLogger from "../components/FoodImageLogger";
import PredictiveTomorrow from "../components/PredictiveTomorrow";

/* ---------- Dashboard with integrated Log Food card (Image + Text) ----------
   Notes:
   - This version uses useMealAnalysis and useDailyNutrition hooks (helpers in frontend/src/hooks).
   - Analyze step is read-only: nothing persisted until user clicks "Add to Log".
   - Selecting a suggestion updates only the clicked detected item by index.
   - Exact DB matches return nutrition immediately and will not show suggestions.
   - Values display using formatNumberSmart (no decimals for ints, 2 decimals for fractions).
*/

const Dashboard = () => {
  const { user } = useUserStore();
  const navigate = useNavigate();

  // Hooks for backend interactions & daily totals
  const { analyzeTextMeal, saveTextMeal, fetchFoodDoc } = useMealAnalysis();
  const { totals: dailyTotals, loading: dailyLoading, refresh, applyIncrement } = useDailyNutrition(user?._id);

  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  // Today's totals (local copy for ring cards)
  const [caloriesConsumed, setCaloriesConsumed] = useState(0);
  const [proteinConsumed, setProteinConsumed] = useState(0);
  const [carbsConsumed, setCarbsConsumed] = useState(0);
  const [fatsConsumed, setFatsConsumed] = useState(0);

  // Log card state
  const [activeTab, setActiveTab] = useState("text"); // 'text' or 'image'
  const [filePreview, setFilePreview] = useState(null);
  const [scannerActive, setScannerActive] = useState(false);
  const fileInputRef = useRef(null);

  // Image detection (mocked)
  const [quickDetectedItems, setQuickDetectedItems] = useState(null);

  const [analyzingImage, setAnalyzingImage] = useState(false);

  // Redirect if not signed in
  useEffect(() => {
    if (!user) {
      navigate("/signin");
    }
  }, [user, navigate]);

  /* ---------- Fetch Real Profile (if API exists) and initialize today's totals ----------
     Behavior:
     - If profile exists, use goals from it; else profile remains null
     - Initialize today's totals from dailyTotals hook when it loads
  */
  useEffect(() => {
    let mounted = true;
    async function initProfile() {
      setLoading(true);
      try {
        const prof = await fetchProfile(user?._id).catch(() => null);
        if (!mounted) return;
        setProfile(prof?.data || null);
      } catch (err) {
        if (!mounted) return;
        setProfile(null);
      } finally {
        if (mounted) setLoading(false);
      }
    }
    if (user?._id) initProfile();
    return () => { mounted = false; };
  }, [user]);

  // Keep local consumed states synced with dailyTotals hook (if available)
  useEffect(() => {
    // dailyTotals uses canonical completed* keys
    setCaloriesConsumed(Number(dailyTotals?.completedCalories ?? 0));
    setProteinConsumed(Number(dailyTotals?.completedProtein ?? 0));
    setCarbsConsumed(Number(dailyTotals?.completedCarbs ?? 0));
    setFatsConsumed(Number(dailyTotals?.completedFats ?? 0));
  }, [dailyTotals]);

  if (!user) return null;
  if (loading) return <div className="pt-24 px-8">Loading dashboard...</div>;

  /* ---------- Goals from profile ----------
     If missing, goal is 0 and ProgressRing displays "-/-" etc.
  */
  const calorieGoal = profile?.dailyCalorieTarget || 0;
  const proteinGoal = profile?.dailyProteinTarget || 0;
  const carbsGoal = profile?.dailyCarbsTarget || 0;
  const fatsGoal = profile?.dailyFatTarget || 0;

  // Helper to compute percent safely
  const computePercent = (consumed, goal) => {
    if (!goal || goal <= 0) return 0;
    return Math.min(100, Math.round((consumed / goal) * 100));
  };

  const caloriePercent = computePercent(caloriesConsumed, calorieGoal);
  const proteinPercent = computePercent(proteinConsumed, proteinGoal);
  const carbsPercent = computePercent(carbsConsumed, carbsGoal);
  const fatsPercent = computePercent(fatsConsumed, fatsGoal);

  const calorieRemaining = calorieGoal ? Math.max(0, calorieGoal - caloriesConsumed) : null;
  const proteinRemaining = proteinGoal ? Math.max(0, proteinGoal - proteinConsumed) : null;
  const carbsRemaining = carbsGoal ? Math.max(0, carbsGoal - carbsConsumed) : null;
  const fatsRemaining = fatsGoal ? Math.max(0, fatsGoal - fatsConsumed) : null;

  /* ---------- Mock image analysis (frontend only) ----------
     Kept as-is (non-persistent). This just demonstrates image flow.
  */
  const simulateImageAnalysis = (fileDataUrl) => {
    setAnalyzingImage(true);
    setScannerActive(true);

    setTimeout(() => {
      setScannerActive(false);
      const detected = [
        { name: "Grilled Chicken Salad", calories: 350, protein: 28, carbs: 12, fats: 10, confidence: 94 },
        { name: "Whole Grain Bread", calories: 120, protein: 4, carbs: 20, fats: 2, confidence: 89 },
        { name: "Mixed Veg Sabzi", calories: 180, protein: 6, carbs: 22, fats: 8, confidence: 86 },
      ];
      setQuickDetectedItems(detected);
      setAnalyzingImage(false);
      toast.success("Image analyzed successfully (mock)");
    }, 1200);
  };

  /* ---------- Greeting logic ---------- */
  const hour = new Date().getHours();
  const isMorning = hour < 12;
  const isEvening = hour >= 18;
  const greetingText = isMorning ? "Good morning," : isEvening ? "Good evening," : "Welcome back,";
  const primaryCTA = isMorning ? "Log Breakfast" : isEvening ? "Log Dinner" : "Log Meal";

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
        <div className="grid grid-cols-1 md:grid-cols-4 gap-12 mb-20 items-stretch">
          <ProgressRing
            title="Calories"
            consumed={caloriesConsumed}
            goal={calorieGoal}
            percent={caloriePercent}
            remaining={calorieRemaining}
            unit="kcal"
            hasGoal={!!calorieGoal}
          />

          <ProgressRing
            title="Protein"
            consumed={proteinConsumed}
            goal={proteinGoal}
            percent={proteinPercent}
            remaining={proteinRemaining}
            unit="g"
            hasGoal={!!proteinGoal}
          />

          <ProgressRing
            title="Carbs"
            consumed={carbsConsumed}
            goal={carbsGoal}
            percent={carbsPercent}
            remaining={carbsRemaining}
            unit="g"
            hasGoal={!!carbsGoal}
          />

          <ProgressRing
            title="Fats"
            consumed={fatsConsumed}
            goal={fatsGoal}
            percent={fatsPercent}
            remaining={fatsRemaining}
            unit="g"
            hasGoal={!!fatsGoal}
          />
        </div>

        {/* Log Food Card (Image + Text tabs) */}
        <div className="glass-card rounded-3xl p-8 mb-12 bg-white/80 backdrop-blur-xl shadow-xl">
          <h2 className="text-3xl font-bold mb-6 text-center">Track Your Nutrition</h2>

          {/* Toggle Tabs */}
          <div className="flex justify-center mb-6">
            <div className="bg-gray-200 p-1 rounded-2xl inline-flex">
              <button
                onClick={() => setActiveTab("image")}
                id="tab-image"
                className={`px-8 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeTab === "image"
                    ? "bg-white text-green-700 shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <i className="fas fa-camera mr-2" /> Image Scan
              </button>
              <button
                onClick={() => setActiveTab("text")}
                id="tab-text"
                className={`px-8 py-3 rounded-xl font-medium transition-all duration-300 ${
                  activeTab === "text"
                    ? "bg-white text-green-700 shadow-md"
                    : "text-gray-600 hover:text-gray-900"
                }`}
              >
                <i className="fas fa-keyboard mr-2" /> Text Input
              </button>
            </div>
          </div>

          {/* Content */}
          <div>
            {/* IMAGE TAB */}
            {activeTab === "image" && (
              <div id="content-image" className="tab-content">
                <FoodImageLogger
                  user={user}
                  postImageAnalyze={postImageAnalyze}
                  addToLogServer={saveTextMeal}
                  fetchFoodDoc={fetchFoodDoc}
                  applyIncrement={applyIncrement}
                  refreshDailyTotals={() => { refresh(); }}
                  formatNumberSmart={formatNumberSmart}
                />
              </div>
            )}

            {/* TEXT TAB */}
            {activeTab === "text" && (
              <FoodTextLogger
                user={user}
                analyzeServer={analyzeTextMeal}
                addToLogServer={saveTextMeal}
                fetchFoodDoc={fetchFoodDoc}
                applyIncrement={applyIncrement}
                refreshDailyTotals={() => {refresh()}}
                formatNumberSmart={formatNumberSmart}
              />
            )}
          </div>
        </div>

        {/* ✅ PREDICTIVE TOMORROW — Features 6, 7, 8 */}
        <PredictiveTomorrow userId={user?._id} />

        {isEvening && (
          <div className="bg-[#00A676]/10 rounded-[2.5rem] p-8 text-center">
            <h3 className="text-xl font-bold">Prepare for tomorrow.</h3>
            <p className="text-gray-600 mt-2">Consistent logging improves smarter predictions.</p>
          </div>
        )}
      </div>

      <style>{`
        @keyframes scanY {
          0%   { transform: translateY(-120%); opacity: 0; }
          6%   { opacity: 1; }
          94%  { opacity: 1; }
          100% { transform: translateY(120%); opacity: 0; }
        }

        .animate-scan {
          animation: scanY 2.2s linear infinite;
          will-change: transform, opacity;
          pointer-events: none;
        }

        @media (prefers-reduced-motion: reduce) {
          .animate-scan {
            animation: none;
            opacity: 0.6;
          }
        }
     `}</style>
    </div>
  );
};

/* ---------- Circular Progress Component with animation ---------- */
const ProgressRing = ({ title, consumed, goal, percent, remaining, unit, hasGoal }) => {
  const radius = 80;
  const stroke = 12;
  const normalizedRadius = radius - stroke * 0.5;
  const circumference = normalizedRadius * 2 * Math.PI;

  const [offset, setOffset] = useState(circumference);

  useEffect(() => {
    const progressOffset = hasGoal ? circumference - (percent / 100) * circumference : circumference;
    const t = setTimeout(() => setOffset(progressOffset), 200);
    return () => clearTimeout(t);
  }, [percent, circumference, hasGoal]);

  const formatNum = (num) => {
    return Math.round(Number(num) * 10) / 10;
  };

  const insideText = () => {
    if (!hasGoal) return "-%";
    return `${formatNum(percent)}%`;
  };

  const belowText = () => {
    if (!hasGoal) return "-/-";
    return `${formatNum(consumed)} / ${formatNum(goal)} ${unit}`;
  };

  const remainingText = () => {
    if (!hasGoal) return "-";
    return remaining !== null ? `${formatNum(remaining)} ${unit} remaining` : `-`;
  };

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
          <span className="text-3xl font-black text-[#00A676]">{insideText()}</span>
          <span className="text-xs text-gray-500 mt-1">completed</span>
        </div>
      </div>

      <div className="mt-6 text-lg font-bold">
        {belowText()}
      </div>

      <div className="text-sm text-gray-500">{remainingText()}</div>
    </div>
  );
};

/* ---------- MacroBox ---------- */
const MacroBox = ({ label, val, icon, color }) => (
  <div className={`${color} p-4 rounded-[1.5rem] border border-black/5 text-center transition-all hover:scale-105`}> 
    <span className="text-2xl block mb-1">{icon}</span>
    <span className="text-sm text-gray-500">{label}</span>
    <span className="font-bold text-lg block">{val}</span>
  </div>
);  

export default Dashboard;