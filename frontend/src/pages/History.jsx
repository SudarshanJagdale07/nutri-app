// frontend/src/pages/History.jsx
import React, { useEffect, useMemo, useState, useCallback } from "react";

import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer,
  CartesianGrid,
  Legend,
  ReferenceLine,
  Label
} from "recharts";

import useHistoryData from "../hooks/useHistoryData";
import { fetchProfile } from "../apiManager/profileApi"; // your existing profile API helper
import { formatNumberSmart } from "../utils/weekUtils";
import useUserStore from "../store/user";

/**
 * History Page
 *
 * - Single global toggle (Last 7 days rolling ↔ Mon→Sun) controls:
 *    • streak window & calculation
 *    • weekly trends window
 *    • meal history window
 *
 * - Goal streak:
 *    • If profile has complete goals (dailyCalories, dailyProtein, dailyCarbs, dailyFat),
 *      streak is computed using average fulfillment across (calories, protein, carbs, fats).
 *      A day counts as meeting goal if average >= 1.0.
 *    • If profile does not have complete goals, we DO NOT use defaults. We fall back to
 *      the architecture-preserving rule: consecutive days where totalCalories > 0.
 *
 * - Meal history and weekly trends are read only from the APIs:
 *    GET /api/daily/:userId/:date and GET /api/meals/:userId
 *
 * Notes:
 * - The page now uses the same user store as Dashboard (useUserStore) so userId is always the single source of truth.
 * - All comments preserved; added clarifications where needed.
 */

function History(props) {
  // Use same user store as Dashboard so userId is correct
  const { user } = useUserStore();
  const userId = user?._id;

  // If no user yet, keep same behavior as Dashboard (don't render history until user exists)
  if (!user) return null;

  // mode: 'rolling' (last 7 days ending today) or 'iso' (Mon→Sun containing selectedWeekForDate)
  const [mode, setMode] = useState("rolling");
  const [selectedWeekForDate, setSelectedWeekForDate] = useState(null); // optional date string 'YYYY-MM-DD' or Date
  const [activeTab, setActiveTab] = useState("history");

  // Profile used for goals. Keep raw profile for fidelity.
  const [profile, setProfile] = useState(null);
  const [loadingProfile, setLoadingProfile] = useState(false);

  // Modal state for meal details
  const [selectedMeal, setSelectedMeal] = useState(null);

  // Normalize goals only if all present and finite (no defaults)
  const goals = useMemo(() => {
    if (!profile) return null;
    const normalized = {
      calories: Number(profile.dailyCalorieTarget),
      protein: Number(profile.dailyProteinTarget),
      carbs: Number(profile.dailyCarbsTarget),
      fats: Number(profile.dailyFatTarget),
      fiber: Number(profile.dailyFiberTarget)
    };
    const allFinite = Number.isFinite(normalized.calories) && Number.isFinite(normalized.protein) && Number.isFinite(normalized.carbs) && Number.isFinite(normalized.fats) && Number.isFinite(normalized.fiber);
    return allFinite ? normalized : null;
  }, [profile]);

  /**
   * useHistoryData hook
   *
   * - Accepts userId and options (mode, selectedWeekForDate)
   * - Returns:
   *    weekDates: array of 7 ISO strings (YYYY-MM-DD)
   *    weekData: array of 7 day objects { date, calories, protein, carbs, fats, fiber, sugar, raw }
   *    streak: number (streak computed by hook initially using calories fallback or when refreshStreak called with goals)
   *    mealGroups: all meals grouped by date (UI filters them to the 7-day window)
   *    loading: boolean
   *    refreshWeek / refreshWeekRolling / refreshStreak(goals) / refreshMeals / refreshAll
   *
   * Note: we destructure the hook's exported names exactly (refreshWeek, refreshWeekRolling)
   */
  const {
    weekDates,
    weekData,
    streak: hookStreak,
    mealGroups: allMealGroups,
    loading,
    refreshWeek,           // Mon->Sun fetch (memoized in hook)
    refreshWeekRolling,    // last 7 days fetch (memoized in hook)
    refreshStreak,
    refreshMeals,
    refreshAll
  } = useHistoryData(userId, { weekForDate: selectedWeekForDate, mode });

  /* ---------- Fetch Real Profile (if API exists) and initialize today's totals ----------
     Behavior:
     - If profile exists, use goals from it; else profile remains null
     - No defaults are used anywhere (per your request)
  */
  useEffect(() => {
    let mounted = true;
    async function initProfile() {
      if (!userId) return;
      setLoadingProfile(true);
      try {
        // fetchProfile should accept a userId and return { data: <profile> } or <profile>
        const resp = await fetchProfile(userId).catch(() => null);
        if (!mounted) return;
        setProfile(resp?.data ?? resp ?? null);
      } catch (err) {
        if (!mounted) return;
        setProfile(null);
      } finally {
        if (mounted) setLoadingProfile(false);
      }
    }
    initProfile();
    return () => { mounted = false; };
  }, [userId]);

  /* ---------- IMPORTANT: fetch week window & meals when mode/selectedWeekForDate changes ----------
     Behavior:
     - Only fetch the week window (Mon->Sun or rolling) and meals here.
     - DO NOT compute streak in this effect (streak depends on weekData arriving).
     - We rely on stable memoized functions from the hook (refreshWeek, refreshWeekRolling, refreshMeals).
  */
  useEffect(() => {
    if (!userId) return;

    if (mode === "iso") {
      // Mon -> Sun
      // refreshWeek expects the weekForDate (may be null)
      refreshWeek(selectedWeekForDate);
    } else {
      // rolling last 7 days ending at selectedWeekForDate (or today)
      const end = selectedWeekForDate ? new Date(selectedWeekForDate) : new Date();
      refreshWeekRolling(end);
    }

    // always refresh meals (hook returns all meals; UI filters to weekDates)
    refreshMeals();

    // intentionally NOT recomputing streak here to avoid race conditions
  }, [userId, mode, selectedWeekForDate, refreshWeek, refreshWeekRolling, refreshMeals]);

  /* ---------- Recompute streak AFTER weekData updates ----------
     Behavior:
     - If goals are present, compute goal-based streak (average fulfillment)
     - Else compute calorie-only fallback streak
     - This ensures streak calculation uses the latest weekData/daily_nutrition
  */
  useEffect(() => {
    if (!userId || !Array.isArray(weekData) || weekData.length === 0) return;

    if (goals) {
      // pass the goals explicitly so hook performs average-based streak
      refreshStreak(goals);
    } else {
      refreshStreak(); // fallback: calorie-based
    }
  }, [userId, weekData, goals, refreshStreak]);

  // initial load on mount: load everything once
  useEffect(() => {
    if (!userId) return;
    refreshAll();
  }, [userId, refreshAll]);

  /* ---------- Per-day fulfillment for UI coloring ----------
     - Only computed when goals exist (no defaults).
     - Else return placeholder objects (grey).
     - Colors: >=80% green, 50–79% amber, else red.
  */
  const dayFulfillments = useMemo(() => {
    if (!Array.isArray(weekData)) return [];
    if (!goals) {
      return weekData.map(d => ({ date: d?.date, fulfillment: null, color: "bg-gray-200", pct: null }));
    }
    return weekData.map(d => {
      const doc = d?.raw ?? null;
      const cals = Number(d?.calories ?? doc?.completedCalories ?? 0);
      const prot = Number(d?.protein ?? doc?.completedProtein ?? 0);
      const carbs = Number(d?.carbs ?? doc?.completedCarbs ?? 0);
      const fats = Number(d?.fats ?? doc?.completedFats ?? 0);

      if (!Number.isFinite(cals) || cals <= 0) return { date: d.date, fulfillment: 0, color: "bg-gray-200", pct: 0 };

      // compute per-nutrient fulfillment ratios and average them
      const vals = [
        (Number.isFinite(goals.calories) && goals.calories > 0) ? cals / goals.calories : 0,
        (Number.isFinite(goals.protein) && goals.protein > 0) ? prot / goals.protein : 0,
        (Number.isFinite(goals.carbs) && goals.carbs > 0) ? carbs / goals.carbs : 0,
        (Number.isFinite(goals.fats) && goals.fats > 0) ? fats / goals.fats : 0
      ];

      const avg = vals.reduce((s, v) => s + (Number.isFinite(v) ? v : 0), 0) / vals.length;
      const clamped = Math.max(0, Math.min(avg, 1.0));
      const pct = Math.round(clamped * 100);
      let colorClass = "bg-red-400 text-white";
      if (clamped >= 0.8) colorClass = "bg-[#00A676] text-white";
      else if (clamped >= 0.5) colorClass = "bg-amber-400 text-white";
      else colorClass = "bg-red-400 text-white";
      return { date: d.date, fulfillment: avg, color: colorClass, pct };
    });
  }, [weekData, goals]);

  // Use hookStreak (hook computed either calorie-based fallback or goal-based if refreshStreak(goals) was called)
  const streakLabel = `${hookStreak || 0} day${(hookStreak || 0) === 1 ? "" : "s"}`;

  // Chart data from weekData (useMemo so it updates when weekData or mode changes)
  const chartData = useMemo(() => {
    if (!Array.isArray(weekData)) return [];
    return weekData.map(d => (({
      date: d.date,
      dayLabel: new Date(d.date).toLocaleDateString(undefined, { weekday: "short", day: "numeric" }), // "Mon 23"
      // Prefer explicit series fields, otherwise fall back to canonical completed* fields on raw/doc
      calories: (typeof d.calories === "number") ? d.calories : ((d?.completedCalories && typeof d.completedCalories === "number") ? d.completedCalories : (d?.raw && typeof d.raw.completedCalories === "number" ? d.raw.completedCalories : null)),
      protein: (typeof d.protein === "number") ? d.protein : ((d?.completedProtein && typeof d.completedProtein === "number") ? d.completedProtein : (d?.raw && typeof d.raw.completedProtein === "number" ? d.raw.completedProtein : null)),
      carbs: (typeof d.carbs === "number") ? d.carbs : ((d?.completedCarbs && typeof d.completedCarbs === "number") ? d.completedCarbs : (d?.raw && typeof d.raw.completedCarbs === "number" ? d.raw.completedCarbs : null)),
      fats: (typeof d.fats === "number") ? d.fats : ((d?.completedFats && typeof d.completedFats === "number") ? d.completedFats : (d?.raw && typeof d.raw.completedFats === "number" ? d.raw.completedFats : null)),
      sugar: (typeof d.sugar === "number") ? d.sugar : ((d?.completedSugar && typeof d.completedSugar === "number") ? d.completedSugar : (d?.raw && typeof d.raw.completedSugar === "number" ? d.raw.completedSugar : null)),
      fiber: (typeof d.fiber === "number") ? d.fiber : ((d?.completedFiber && typeof d.completedFiber === "number") ? d.completedFiber : (d?.raw && typeof d.raw.completedFiber === "number" ? d.raw.completedFiber : null))
    })));
  }, [weekData, mode]);

  // Filtered meal groups to show only meals within the selected 7-day window.
  // allMealGroups is the hook's grouped meals for user (descending by date).
  // Also sort meals within a day from morning -> night (ascending by timestamp)
  const mealGroups = useMemo(() => {
    if (!Array.isArray(allMealGroups) || !Array.isArray(weekDates) || weekDates.length === 0) return [];
    const allowed = new Set(weekDates);
    return allMealGroups
      .map(g => ({ ...g }))
      .filter(g => allowed.has(g.date))
      .map(g => {
        const meals = Array.isArray(g.meals) ? [...g.meals] : [];
        meals.sort((a, b) => {
          const ta = a.timestamp || a.createdAt || a.time || "";
          const tb = b.timestamp || b.createdAt || b.time || "";
          const da = ta ? new Date(ta).getTime() : 0;
          const db = tb ? new Date(tb).getTime() : 0;
          return da - db; // ascending (morning -> night)
        });
        return { ...g, meals };
      });
  }, [allMealGroups, weekDates]);

  // Helper: render meal items safely as a string (handles arrays, objects, strings)
  const renderMealItems = useCallback((meal) => {
    // Prefer explicit string fields if present
    if (typeof meal.itemsDescription === "string" && meal.itemsDescription.trim()) return meal.itemsDescription;
    if (typeof meal.userInputName === "string" && meal.userInputName.trim()) return meal.userInputName;

    const items = meal.items;

    // If items is a string, return it
    if (typeof items === "string") return items;

    // If items is an array, map to readable labels
    if (Array.isArray(items)) {
      try {
        const labels = items.map(it => {
          if (!it) return "";
          if (typeof it === "string") return it;
          return (it.dishName || it.userInputName || it.name || "").toString();
        }).filter(Boolean);
        if (labels.length > 0) return labels.join(", ");
      } catch (e) {
        // fall through to fallback
      }
    }

    // If items is an object, try to extract a label
    if (items && typeof items === "object") {
      const it = items;
      return (it.dishName || it.userInputName || it.name || "").toString();
    }

    // Fallback to formatItemsDisplay which will handle other shapes and rawInput
    return formatItemsDisplay(meal);
  }, []);

  // Memoize dot props to avoid creating a new object each render (prevents Recharts store churn)
  const dotProps = useMemo(() => ({ r: 3 }), []);

  // nutrients to show as separate graphs
  const nutrients = useMemo(() => [
    { key: "calories", label: "Calories", unit: "kcal" },
    { key: "protein", label: "Protein", unit: "g" },
    { key: "carbs", label: "Carbs", unit: "g" },
    { key: "fats", label: "Fats", unit: "g" },
    { key: "sugar", label: "Sugar", unit: "g" },
    { key: "fiber", label: "Fiber", unit: "g" }
  ], []);

  // compute per-nutrient series and requirement lines (from profile goals when available)
  const nutrientSeries = useMemo(() => {
    const series = {};
    nutrients.forEach(n => {
      series[n.key] = chartData.map(d => ({ date: d.date, label: d.dayLabel, value: d[n.key] }));
    });
    return series;
  }, [chartData, nutrients]);

  // compute requirement per nutrient: use profile goals where relevant
  const nutrientRequirement = useMemo(() => {
    // profile may only contain calories/protein/carbs/fats — sugar not guaranteed
    const req = {
      calories: goals?.calories ?? null,
      protein: goals?.protein ?? null,
      carbs: goals?.carbs ?? null,
      fats: goals?.fats ?? null,
      sugar: profile?.dailySugarLimit ?? null, // optional custom field if you have it
      fiber: profile?.dailyFiberTarget ?? null    // ensure fiber uses canonical dailyFiberTarget
    };
    return req;
  }, [goals, profile]);

  // Helper to compute Y axis upper bound per nutrient
  const computeYAxisUpper = useCallback((key) => {
    const data = nutrientSeries[key] || [];
    let maxVal = 0;
    for (const p of data) {
      if (typeof p.value === "number" && isFinite(p.value)) {
        if (p.value > maxVal) maxVal = p.value;
      }
    }
    const req = nutrientRequirement[key];
    const base = Math.max(maxVal, (typeof req === "number" && isFinite(req)) ? req : 0);
    // ensure some breathing room
    const upper = Math.max(10, Math.ceil(base * 1.25));
    return upper;
  }, [nutrientSeries, nutrientRequirement]);

  // Tooltip formatter: show one decimal if decimal present, else integer (no .00)
  const formatTooltipValue = (value) => {
    const num = Number(value);
    if (!Number.isFinite(num)) return value;
    return num % 1 === 0 ? String(num) : num.toFixed(1);
  };

  // Modal close handler
  const closeModal = () => setSelectedMeal(null); 

  // UI render
  return (
    <div className="min-h-screen bg-[#F2F6F2] text-[#1A202C] relative overflow-hidden pb-24 font-sans">
      {/* Background accents */}
      <div className="absolute -top-32 -right-32 w-[600px] h-[600px] bg-[#00A676] opacity-10 blur-[140px] rounded-full" />
      <div className="absolute bottom-[-20%] left-[-10%] w-[500px] h-[500px] bg-[#D9E6DC] opacity-40 blur-[120px] rounded-full" />

      <div className="pt-24 px-8 max-w-6xl mx-auto relative z-10">
        {/* Heading */}
        <h1 className="text-4xl font-serif font-bold mb-6">History & Progress</h1>

        {/* Global window toggle (affects streak, trends and meal history) */}
        <div className="flex items-center gap-3 mb-6">
          <div className="text-sm text-gray-500">Window</div>
          <div className="bg-gray-100 rounded-full p-1 flex items-center text-sm">
            <button
              onClick={() => setMode("rolling")}
              className={`px-3 py-1 rounded-full ${mode === "rolling" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
            >
              Last 7 days
            </button>
            <button
              onClick={() => setMode("iso")}
              className={`px-3 py-1 rounded-full ${mode === "iso" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
            >
              Mon → Sun
            </button>
          </div>

          <div className="text-xs text-gray-400 ml-4">
            Toggle changes streak, trends and meal history window.
          </div>
        </div>

        {/* Streak Tracker */}
        <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100 mb-6 transition transform hover:scale-[1.02] hover:shadow-xl">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-lg font-semibold mb-1">Goal Streak</h2>
              <div className="text-sm text-gray-500">
                {goals ? "Consecutive days meeting average nutrition goals (cal/protein/carbs/fats)." : "Goals not configured — showing calorie-based streak."}
                {' '}Streak: <strong>{streakLabel}</strong>
              </div>
            </div>

            <div className="text-sm text-gray-400">
              {loadingProfile ? "Loading goals..." : (goals ? `Goals — cals ${goals.calories}, prot ${goals.protein}g` : `Goals not configured`)}
            </div>
          </div>

          <div className="mt-4 flex gap-3">
            {/* Show weekDates (7 days) with real labels, colored by fulfillment if goals exist */}
            {weekDates && weekDates.length === 7 ? (
              weekDates.map(d => {
                const day = dayFulfillments.find(dd => dd.date === d) || { color: "bg-gray-200", pct: null, fulfillment: null };
                const label = new Date(d).toLocaleDateString(undefined, { weekday: "short", day: "numeric" });
                return (
                  <div key={d} className="flex flex-col items-center">
                    <div
                      className={`w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium ${day.color || "bg-gray-200 text-gray-600"}`}
                      title={ day.pct !== null ? `${day.pct}% avg fulfillment` : (day.fulfillment === 0 ? "No calories logged" : "Goals not configured") }
                    >
                      {day.pct !== null && day.pct !== undefined ? `${Math.round(day.pct)}%` : (day.fulfillment === 0 ? '0%' : '--')}
                    </div>
                    <div className="text-xs text-gray-400 mt-2">{label}</div>
                  </div>
                );
              })
            ) : (
              // fallback placeholders
              Array.from({ length: 7 }).map((_, i) => (
                <div key={i} className="flex flex-col items-center">
                  <div className="w-12 h-12 rounded-full flex items-center justify-center text-sm font-medium bg-gray-200 text-gray-500">
                    {i + 1}
                  </div>
                </div>
              ))
            )}
          </div>

          <p className="text-xs text-gray-400 mt-3">
            Color indicates average fulfillment of calories/protein/carbs/fats.
            - <span className="font-semibold">Green</span> &gt;= 80%, <span className="font-semibold">Amber</span> 50–79%, <span className="font-semibold">Red</span> &lt; 50%.
          </p>
        </div>

        {/* Tabs */}
        <div className="flex gap-6 border-b border-gray-200 mb-8">
          <Tab label="Meal History" active={activeTab === "history"} onClick={() => setActiveTab("history")} />
          <Tab label="Weekly Trends" active={activeTab === "trends"} onClick={() => setActiveTab("trends")} />
          <Tab label="Risk Insights" active={activeTab === "risk"} onClick={() => setActiveTab("risk")} />
        </div>

        {/* Tab Content */}
        {activeTab === "history" && <MealHistorySection mealGroups={mealGroups} renderMealItems={renderMealItems} onOpenMeal={setSelectedMeal} />}
        {activeTab === "trends" && (
          <WeeklyTrendsSection
            nutrients={nutrients}
            nutrientSeries={nutrientSeries}
            nutrientRequirement={nutrientRequirement}
            computeYAxisUpper={computeYAxisUpper}
            mode={mode}
            setMode={setMode}
            weekDates={weekDates}
            weekData={weekData}
            goals={goals}
            dotProps={dotProps}
            formatTooltipValue={formatTooltipValue}
          />
        )}
        {activeTab === "risk" && <RiskInsightsSection weekData={weekData} />}

      </div>

      {/* Meal detail modal */}
      {selectedMeal && (
        <MealDetailModal meal={selectedMeal} onClose={closeModal} />
      )}
    </div>
  );
}

/* ---------- Meal History Section ---------- */
function MealHistorySection({ mealGroups, renderMealItems, onOpenMeal }) {
  // mealGroups: [{ date: 'YYYY-MM-DD', meals: [...] }, ...] descending by date
  if (!mealGroups || mealGroups.length === 0) {
    return (
      <div className="bg-white rounded-2xl p-8 shadow-md border border-gray-100 text-gray-500">
        No meal history yet in this window.
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {mealGroups.map((dayGroup, idx) => (
        <div key={dayGroup.date + idx} className="bg-white rounded-2xl p-6 shadow-md border border-gray-100 transition transform hover:scale-[1.02] hover:shadow-xl">
          <div className="flex justify-between items-center mb-4">
            <h3 className="font-semibold text-gray-700">{new Date(dayGroup.date).toLocaleDateString(undefined, { weekday: 'long', month: 'short', day: 'numeric' })}</h3>
            <div className="text-sm text-gray-400">{dayGroup.meals.length} meal{dayGroup.meals.length > 1 ? 's' : ''}</div>
          </div>

          <div>
            {dayGroup.meals.map((meal) => (
              <button
                key={meal._id || meal.id || (meal.createdAt + meal.userId)}
                onClick={() => onOpenMeal(meal)}
                className="w-full text-left flex justify-between items-center py-3 border-b last:border-none hover:bg-gray-50 focus:outline-none"
              >
                <div>
                  <div className="font-medium text-left">{meal.dishName || meal.name || meal.rawInput || "Meal"}</div>
                  <div className="text-sm text-gray-500">{renderMealItems(meal)}</div>
                  <div className="text-xs text-gray-400 mt-1">{formatMealTime(meal)}</div>
                </div>
                <div className="text-sm font-semibold text-gray-600">{formatNumberSmart(meal.totalCalories ?? meal.completedCalories ?? meal.calories ?? meal.cal ?? 0) } kcal</div>
              </button>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

/* ---------- Meal Detail Modal ---------- */
function MealDetailModal({ meal, onClose }) {
  if (!meal) return null;
  const items = Array.isArray(meal.items) ? meal.items : (meal.items ? [meal.items] : []);

  // Format Date to DD/MM/YYYY
  const formatDateDDMM = (t) => {
    if (!t) return "";
    const date = new Date(t);
    const day = String(date.getDate()).padStart(2, '0');
    const month = String(date.getMonth() + 1).padStart(2, '0');
    const year = date.getFullYear();
    return `${day}/${month}/${year}`;
  };

  // Format time to show only Hour:Minute AM/PM (removes seconds)
  const formatTimeClean = (t) => {
    if (!t) return "";
    try {
      return new Date(t).toLocaleTimeString(undefined, { 
        hour: '2-digit', 
        minute: '2-digit',
        hour12: true 
      });
    } catch (e) { return ""; }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm" onClick={onClose} />
      <div className="relative bg-white rounded-3xl shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden animate-fadeIn">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 flex justify-between items-center bg-gray-50/50">
          <div>
            <h3 className="text-3xl font-black font-serif text-gray-700">
              {meal.dishName || meal.rawInput || "Meal details"}
            </h3>
            <p className="text-xs font-bold text-[#00A676] uppercase tracking-widest mt-1">
              {formatDateDDMM(meal.timestamp || meal.createdAt)} • {formatTimeClean(meal.timestamp || meal.createdAt)}</p>
          </div>
          <button
            onClick={onClose}
            className="w-10 h-10 flex items-center justify-center rounded-full hover:bg-white hover:shadow-md transition text-gray-400 hover:text-red-500"
          >
            <i className="fas fa-times" />
          </button>
        </div>

        {/* Scrollable Items Section */}
        <div className="flex-1 overflow-y-auto p-6 space-y-4 bg-white custom-scrollbar" style={{ maxHeight: '60vh' }}>
          <h4 className="text-sm font-black text-gray-400 uppercase tracking-widest mb-2">Meal Breakdown</h4>
          {items.length === 0 && <div className="text-center py-10 text-gray-400">No itemized data available.</div>}
          {items.map((it, idx) => (
            <div key={idx} className="group bg-gray-50 rounded-2xl p-5 border border-gray-100 hover:border-green-200 hover:shadow-sm transition-all">
              <div className="flex justify-between items-start mb-4">
                <div className="font-bold text-gray-900 text-lg">{it.dishName || it.userInputName || it.name || `Item ${idx + 1}`}</div>
                <div className="px-3 py-1 bg-white rounded-full text-[10px] font-black text-gray-400 border border-gray-100 uppercase">
                  {it.quantity} {it.unit}
                </div>
              </div>
              <div className="grid grid-cols-2 md:grid-cols-6 gap-4">
                <div className="bg-white p-3 rounded-xl border border-gray-50">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Calories</p>
                  <p className="font-bold text-[#00A676]">{formatNumberSmart(it.calories ?? 0)} <span className="text-[10px]">kcal</span></p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-50">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Protein</p>
                  <p className="font-bold">{formatNumberSmart(it.protein ?? 0)} g</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-50">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Carbs</p>
                  <p className="font-bold">{formatNumberSmart(it.carbs ?? 0)} g</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-50">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Fats</p>
                  <p className="font-bold">{formatNumberSmart(it.fats ?? 0)} g</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-50">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Fiber</p>
                  <p className="font-bold">{formatNumberSmart(it.fiber ?? 0)} g</p>
                </div>
                <div className="bg-white p-3 rounded-xl border border-gray-50">
                  <p className="text-[9px] font-black text-gray-400 uppercase mb-1">Sugar</p>
                  <p className="font-bold">{formatNumberSmart(it.sugar ?? 0)} g</p>
                </div>
              </div>
            </div>
          ))}
        </div>

        {/* Totals */}
        <div className="p-6 bg-gray-50 border-t border-gray-100">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-3">
            {[
              { l: "Cals", v: meal.totalCalories ?? meal.completedCalories ?? meal.calories ?? meal.cal ?? 0, c: "text-[#00A676]" },
              { l: "Protein", v: meal.totalProtein ?? meal.completedProtein ?? meal.protein ?? 0 },
              { l: "Carbs", v: meal.totalCarbs ?? meal.completedCarbs ?? meal.carbs ?? 0 },
              { l: "Fats", v: meal.totalFats ?? meal.completedFats ?? meal.fats ?? 0 },
              { l: "Fiber", v: meal.totalFiber ?? meal.completedFiber ?? meal.fiber ?? 0 },
              { l: "Sugar", v: meal.totalSugar ?? meal.completedSugar ?? meal.sugar ?? 0 }
            ].map((t, i) => (
              <div key={i} className="text-center bg-white p-3 rounded-2xl border border-gray-100">
                <p className="text-[9px] font-black text-gray-400 uppercase mb-1">{t.l}</p>
                <p className={`font-bold text-sm ${t.c || "text-gray-900"}`}>{formatNumberSmart(t.v)}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

function formatMealTime(meal) {
  const t = meal.timestamp || meal.createdAt || meal.time;
  if (!t) return "";
  try {
    const dt = new Date(t);
    return dt.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
  } catch (e) {
    return "";
  }
}

function formatItemsDisplay(m) {
  // Ensure this function always returns a string (never an object)
  try {
    if (!m) return "";
    if (typeof m.items === "string") return m.items;
    if (Array.isArray(m.items)) {
      // array may contain strings or objects
      const parts = m.items.map(it => {
        if (!it) return "";
        if (typeof it === "string") return it;
        return (it.dishName || it.userInputName || it.name || "").toString();
      }).filter(Boolean);
      if (parts.length) return parts.join(", ");
    }
    if (m.items && typeof m.items === "object") {
      const it = m.items;
      return (it.dishName || it.userInputName || it.name || "").toString();
    }
    if (Array.isArray(m.itemsList)) return m.itemsList.join(", ");
    if (m.itemsText) return m.itemsText;
    if (m.itemsString) return m.itemsString;
    // fall back to input string
    return m.rawInput || "";
  } catch (e) {
    // defensive fallback
    return m.rawInput || "";
  }
}

/* ---------- Weekly Trends Section (now multi-graph) ---------- */
function WeeklyTrendsSection({
  nutrients,
  nutrientSeries,
  nutrientRequirement,
  computeYAxisUpper,
  mode,
  setMode,
  weekDates,
  weekData,
  goals,
  dotProps,
  formatTooltipValue
}) {
  // Show a separate small chart for each nutrient (grid)
  if (!nutrients || nutrients.length === 0) {
    return <div className="text-gray-500">No nutrients configured.</div>;
  }

  return (
    <div className="space-y-6">
      <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
        <div className="flex justify-between items-center mb-4">
          <h2 className="text-lg font-semibold">Weekly Trends</h2>

          <div className="flex items-center gap-3">
            <div className="text-sm text-gray-500">View</div>
            <div className="bg-gray-100 rounded-full p-1 flex items-center text-sm">
              <button
                onClick={() => setMode("rolling")}
                className={`px-3 py-1 rounded-full ${mode === "rolling" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
              >
                Last 7 days
              </button>
              <button
                onClick={() => setMode("iso")}
                className={`px-3 py-1 rounded-full ${mode === "iso" ? "bg-white shadow-sm text-gray-900" : "text-gray-500"}`}
              >
                Mon → Sun
              </button>
            </div>
          </div>
        </div>

        <div className="text-xs text-gray-500 mb-3">
          Each nutrient is shown separately with an optional faint requirement line (if configured in profile).
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {nutrients.map(n => {
            const series = nutrientSeries[n.key] || [];
            const upper = computeYAxisUpper(n.key);
            const req = nutrientRequirement[n.key];
            const hasData = series.some(p => p.value !== null && typeof p.value === "number");
            return (
              <div key={n.key} className="bg-white rounded p-4 border border-gray-100 shadow-sm">
                <div className="flex justify-between items-center mb-2">
                  <div>
                    <div className="text-sm font-medium">{n.label}</div>
                    <div className="text-xs text-gray-400">{n.unit}</div>
                  </div>
                  <div className="text-sm text-gray-600">{req ? `Req: ${formatNumberSmart(req)} ${n.unit}` : "No requirement set"}</div>
                </div>

                {!hasData && <div className="text-gray-500 p-6">No data for this nutrient this week.</div>}

                {hasData && (
                  // Ensure parent container has explicit min dimensions to avoid Recharts width/height -1 warning
                  <div style={{ width: "100%", height: 180 }} className="min-w-0 min-h-[180px] rounded-md">
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={series} margin={{ top: 8, right: 24, left: 0, bottom: 8 }}>
                        <CartesianGrid strokeDasharray="3 3" />
                        <XAxis dataKey="label" interval={0} tick={{ fontSize: 11, fill: "#6B7280" }} padding={{ right: 20 }} />
                        <YAxis domain={[0, upper]} tick={{ fontSize: 11, fill: "#6B7280" }} />
                        <Tooltip
                          formatter={(value) => formatTooltipValue(value)}
                          labelFormatter={(label) => label}
                          itemStyle={{ fontWeight: '700',textTransform: 'uppercase',fontSize: '13px'}}
                          contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 25px rgba(0,0,0,0.1)', padding: '12px 16px', fontSize: '14px' }}/>
                        {req && (
                          <ReferenceLine y={req} stroke="#7C3AED" strokeDasharray="4 4" strokeWidth={1}>
                            <Label value={`Req: ${formatNumberSmart(req)}`} position="right" fill="#7C3AED" fontSize={11} />
                          </ReferenceLine>
                        )}
                        <Line type="monotone" dataKey="value" stroke="#00A676" strokeWidth={2} dot={dotProps} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

/* ---------- Improved Tab Styling ---------- */
function Tab({ label, active, onClick }) {
  return (
    <button 
      onClick={onClick} 
      className={`py-2 px-3 transition-all duration-300 font-bold text-md outline-none ${
        active 
          ? "border-b-2 border-[#00A676] text-[#00A676]" // Active state: Green border and text
          : "text-gray-400 hover:text-gray-600 border-b-2 border-transparent" // Inactive state
      }`}
    >
      {label}
    </button>
  );
}

/* ---------- Risk Insights placeholder ---------- */
function RiskInsightsSection({ weekData }) {
  return (
    <div className="bg-white rounded-3xl p-6 shadow-md border border-gray-100">
      <h2 className="text-lg font-semibold mb-2">Risk Insights</h2>
      <div className="text-sm text-gray-500">Insights based on weekly nutrition patterns will appear here.</div>
    </div>
  );
}

export default History;