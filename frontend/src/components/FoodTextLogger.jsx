// frontend/src/components/FoodTextLogger.jsx
// Extracted text-based food logging UI + logic with exact UI/UX styling from Dashboard.jsx
// Preserves original comments, behavior and styling. Do not change anything else.

import React, { useState } from "react";
import toast from "react-hot-toast";
import { topCandidates } from "../utils/fuzzy";
import { getLocalDateString } from "../utils/weekUtils";

/**
 * Props:
 * - user
 * - analyzeServer(text, userId)
 * - addToLogServer({ rawInput, totals, userId, selectionMap })
 * - fetchFoodDoc(name)
 * - applyIncrement(totals)
 * - formatNumberSmart (optional)
 */
export default function FoodTextLogger({
  user,
  analyzeServer,
  addToLogServer,
  fetchFoodDoc,
  applyIncrement,
  refreshDailyTotals,
  formatNumberSmart
}) {
  const [foodInput, setFoodInput] = useState("");
  const [textAnalysisResult, setTextAnalysisResult] = useState(null);
  const [analyzingText, setAnalyzingText] = useState(false);
  const [addingToDaily, setAddingToDaily] = useState(false);

  // Helper: round to two decimals
  function roundToTwo(v) {
    if (v === null || typeof v === "undefined") return 0;
    return Math.round((Number(v) + Number.EPSILON) * 100) / 100;
  }

  // Format helper fallback
  const f = (n) => (formatNumberSmart ? formatNumberSmart(n) : (Number.isFinite(Number(n)) ? String(n) : n));

  /* ---------- Analyze Text (non-persistent) ----------
     - Calls server analyze via analyzeServer (persist:false)
     - Normalizes server response into items, totals, candidates
  */
  const analyzeText = async () => {
    if (!foodInput.trim()) {
      toast.error("Please describe your meal");
      return;
    }
    setAnalyzingText(true);
    try {
      const resp = await analyzeServer(foodInput, user?._id);
      if (!resp) {
        toast.error("Analysis failed");
        setTextAnalysisResult(null);
        return;
      }

      const mealObj = resp?.meal ?? resp ?? null;
      const candidates = resp?.candidates ?? [];

      const items = (mealObj?.items || []).map((it, idx) => ({
        index: idx,
        userInputName: it.userInputName || it.name || it.dishName || "",
        dishName: it.dishName || it.userInputName || "",
        foodId: it.foodId ?? null,
        quantity: it.quantity ?? 1,
        unit: it.unit ?? "serving",
        grams: it.grams ?? null,
        calories: (typeof it.calories === "number") ? it.calories : null,
        protein: (typeof it.protein === "number") ? it.protein : null,
        carbs: (typeof it.carbs === "number") ? it.carbs : null,
        fats: (typeof it.fats === "number") ? it.fats : null,
        fiber: it.fiber ?? null,
        sugar: it.sugar ?? null,
        isEstimated: !!it.isEstimated,
        preparation: it.preparation ?? null,
        suggestions: []
      }));

      // Map server candidates to per-item suggestions
      const perItemCandidates = {};
      if (Array.isArray(candidates)) {
        for (const c of candidates) {
          const key = c.itemIndex ?? -1;
          if (!perItemCandidates[key]) perItemCandidates[key] = [];
          perItemCandidates[key].push(...(c.candidates || []));
        }
      }

      for (const it of items) {
        const candList = perItemCandidates[it.index] ?? [];
        it.suggestions = it.foodId ? [] : (Array.isArray(candList) ? candList.slice(0, 10) : []);
      }

      const totals = {
        calories: Math.round(items.reduce((s, ii) => s + (Number(ii.calories) || 0), 0)),
        protein: roundToTwo(items.reduce((s, ii) => s + (Number(ii.protein) || 0), 0)),
        carbs: roundToTwo(items.reduce((s, ii) => s + (Number(ii.carbs) || 0), 0)),
        fats: roundToTwo(items.reduce((s, ii) => s + (Number(ii.fats) || 0), 0)),
        fiber: roundToTwo(items.reduce((s, ii) => s + (Number(ii.fiber) || 0), 0)),
        sugar: roundToTwo(items.reduce((s, ii) => s + (Number(ii.sugar) || 0), 0))
      };

      setTextAnalysisResult({ meal: mealObj ?? { items }, items, originalItems: JSON.parse(JSON.stringify(items)), totals, candidates, selectedSuggestions: {} });
      toast.success("Analysis complete — review below (not saved)");
    } catch (err) {
      console.error("analyzeText error:", err);
      toast.error("Failed to analyze text");
      setTextAnalysisResult(null);
    } finally {
      setAnalyzingText(false);
    }
  };

  /* ---------- Suggestion acceptance ----------
     - Fetch full doc via fetchFoodDoc
     - Compute grams/macros and update only the targeted item
  */
  const acceptSuggestion = async (itemIndex, chosen) => {
    if (!textAnalysisResult) return;
    const cloned = JSON.parse(JSON.stringify(textAnalysisResult));
    const target = cloned.items?.[itemIndex];
    if (!target) {
      toast.error("Target item not found");
      return;
    }

    const chosenName = chosen?.displayName ?? chosen ?? null;
    if (!chosenName) {
      toast.error("Invalid candidate");
      return;
    }

    // If this suggestion is already selected, deselect and restore original
    const alreadySelected = cloned.selectedSuggestions?.[itemIndex] === chosenName;
    if (alreadySelected) {
      const original = cloned.originalItems?.[itemIndex];
      if (original) {
        cloned.items[itemIndex] = { ...original };
        if (cloned.meal && Array.isArray(cloned.meal.items) && cloned.meal.items[itemIndex]) {
          cloned.meal.items[itemIndex] = { ...original };
        }
      }
      delete cloned.selectionMap?.[itemIndex];
      delete cloned.selectedSuggestions[itemIndex];
      cloned.totals = {
        calories: Math.round(cloned.items.reduce((s, it) => s + (Number(it.calories) || 0), 0)),
        protein: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.protein) || 0), 0)),
        carbs: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0)),
        fats: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.fats) || 0), 0)),
        fiber: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.fiber) || 0), 0)),
        sugar: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.sugar) || 0), 0))
      };
      if (cloned.meal) {
        cloned.meal.totalCalories = cloned.totals.calories;
        cloned.meal.totalProtein = cloned.totals.protein;
        cloned.meal.totalCarbs = cloned.totals.carbs;
        cloned.meal.totalFats = cloned.totals.fats;
        cloned.meal.totalFiber = cloned.totals.fiber;
        cloned.meal.totalSugar = cloned.totals.sugar;
      }
      setTextAnalysisResult(cloned);
      toast.success("Selection removed — restored original values");
      return;
    }

    // Read preferPrep from the candidate group so the correct preparation variant is fetched
    const group = textAnalysisResult?.candidates?.find((g) => Number(g.itemIndex) === Number(itemIndex));
    const preferPrep = group?.preferPrep ?? null;

    try {
      const doc = await fetchFoodDoc(chosenName, preferPrep);
      if (!doc) {
        toast.error("Nutrition info not found for selected item");
        return;
      }

      const qty = Number(target.quantity || 1);
      let grams = 0;
      const unit = (target.unit || "").toLowerCase();

      if (unit === "g" || unit === "ml") {
        grams = qty;
      } else if (unit === "kg") {
        grams = qty * 1000;
      } else if (unit === "piece" || unit === "serving") {
        const gramPerPiece = parseFloat(doc.gramPerPiece) || parseFloat(doc.gramsPerUnit) || null;
        grams = gramPerPiece ? qty * gramPerPiece : qty * 100;
      } else if (doc.gramsPerUnit) {
        grams = qty * doc.gramsPerUnit;
      } else {
        grams = qty * 100;
      }

      const isPiece = unit === "piece" || unit === "serving";
      const isWeightInput = unit === "g" || unit === "ml" || unit === "kg";
      const docIsPieceBased = doc.perQuantity === 1 && String(doc.unit || "").toLowerCase() === "piece";

      let calories, protein, carbs, fats, fiber, sugar;

      if (isPiece) {
        // Per-piece: use values directly, multiply by quantity
        calories = (doc.caloriesPer100g ?? doc.calories_kcal ?? 0) * qty;
        protein = (doc.proteinPer100g ?? doc.protein_g ?? 0) * qty;
        carbs = (doc.carbsPer100g ?? doc.carbs_g ?? 0) * qty;
        fats = (doc.fatPer100g ?? doc.fat_g ?? 0) * qty;
        fiber = (doc.fiberPer100g ?? doc.fiber_g ?? 0) * qty;
        sugar = (doc.sugarPer100g ?? doc.sugar_g ?? 0) * qty;
      } else if (isWeightInput && docIsPieceBased) {
        // User gave grams but food is stored per-piece: convert grams -> pieces using gramPerPiece
        const gramPerPiece = parseFloat(doc.gramPerPiece) || parseFloat(doc.gramsPerUnit) || 100;
        const pieces = grams / gramPerPiece;
        calories = (doc.caloriesPer100g ?? doc.calories_kcal ?? 0) * pieces;
        protein = (doc.proteinPer100g ?? doc.protein_g ?? 0) * pieces;
        carbs = (doc.carbsPer100g ?? doc.carbs_g ?? 0) * pieces;
        fats = (doc.fatPer100g ?? doc.fat_g ?? 0) * pieces;
        fiber = (doc.fiberPer100g ?? doc.fiber_g ?? 0) * pieces;
        sugar = (doc.sugarPer100g ?? doc.sugar_g ?? 0) * pieces;
      } else {
        // Per-100g: use grams-based calculation
        calories = (grams / 100) * (doc.caloriesPer100g ?? doc.calories_kcal ?? 0);
        protein = (grams / 100) * (doc.proteinPer100g ?? doc.protein_g ?? 0);
        carbs = (grams / 100) * (doc.carbsPer100g ?? doc.carbs_g ?? 0);
        fats = (grams / 100) * (doc.fatPer100g ?? doc.fat_g ?? 0);
        fiber = (grams / 100) * (doc.fiberPer100g ?? doc.fiber_g ?? 0);
        sugar = (grams / 100) * (doc.sugarPer100g ?? doc.sugar_g ?? 0);
      }

      cloned.items[itemIndex] = {
        ...cloned.items[itemIndex],
        userInputName: doc.displayName || chosenName,
        dishName: doc.displayName || chosenName,
        foodId: doc._id ?? null,
        grams,
        calories,
        protein,
        carbs,
        fats,
        fiber,
        sugar,
        isEstimated: false,
        preparation: doc.preparationType ?? cloned.items[itemIndex].preparation
      };

      // Also update meal.items so addTrackedCalories sends the correct values to DB
      if (cloned.meal && Array.isArray(cloned.meal.items) && cloned.meal.items[itemIndex]) {
        cloned.meal.items[itemIndex] = {
          ...cloned.meal.items[itemIndex],
          userInputName: doc.displayName || chosenName,
          dishName: doc.displayName || chosenName,
          foodId: doc._id ?? null,
          grams,
          calories,
          protein,
          carbs,
          fats,
          fiber,
          sugar,
          isEstimated: false,
          preparation: doc.preparationType ?? cloned.meal.items[itemIndex].preparation
        };
      }

      cloned.selectionMap = cloned.selectionMap || {};
      cloned.selectionMap[itemIndex] = doc._id ?? doc.displayName ?? chosenName;
      cloned.selectedSuggestions = cloned.selectedSuggestions || {};
      cloned.selectedSuggestions[itemIndex] = chosenName;

      cloned.totals = {
        calories: Math.round(cloned.items.reduce((s, it) => s + (Number(it.calories) || 0), 0)),
        protein: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.protein) || 0), 0)),
        carbs: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.carbs) || 0), 0)),
        fats: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.fats) || 0), 0)),
        fiber: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.fiber) || 0), 0)),
        sugar: roundToTwo(cloned.items.reduce((s, it) => s + (Number(it.sugar) || 0), 0))
      };

      // Sync updated totals into meal object so DB gets correct values
      if (cloned.meal) {
        cloned.meal.totalCalories = cloned.totals.calories;
        cloned.meal.totalProtein = cloned.totals.protein;
        cloned.meal.totalCarbs = cloned.totals.carbs;
        cloned.meal.totalFats = cloned.totals.fats;
        cloned.meal.totalFiber = cloned.totals.fiber;
        cloned.meal.totalSugar = cloned.totals.sugar;
      }

      setTextAnalysisResult(cloned);
      toast.success(`Selected "${doc.displayName}" — nutrition loaded for that item`);
    } catch (err) {
      console.error("acceptSuggestion error:", err);
      toast.error("Failed to load nutrition for selected item");
    }
  };

  /* ---------- Persist analyzed meal to server and update UI ----------
     - Calls addToLogServer with the pre-computed meal object (no re-parsing on server)
     - Calls applyIncrement (store) and onLocalTotalsUpdate (parent) to update rings/UI
     - NOTE: totals sent to daily aggregation are mapped to canonical completed* fields
  */
  const addTrackedCalories = async () => {
    if (!textAnalysisResult?.meal) {
      toast.error("No analyzed meal to add");
      return;
    }
    const totals = textAnalysisResult.totals || {};
    const hasUnresolved = (textAnalysisResult.items || []).some(it => it.calories === null && it.foodId === null);
    if (hasUnresolved) {
      toast.error("Some items have no nutrition data — please select a suggestion first");
      setAddingToDaily(false);
      return;
    }
    setAddingToDaily(true);
    try {
      const mealToSave = {
        ...textAnalysisResult.meal,
        date: getLocalDateString(new Date()),
        items: (textAnalysisResult.meal?.items || []).map(({ suggestions: _s, ...rest }) => rest)
      };
      const serverResp = await addToLogServer({
        meal: mealToSave,
        userId: user._id
      });
      if (!serverResp) {
        toast.error("Failed to persist meal");
        setAddingToDaily(false);
        return;
      }

      // Prefer authoritative refresh from server if parent provided it
      if (typeof refreshDailyTotals === "function") {
        try {
          // allow parent to re-fetch totals from DB
          await refreshDailyTotals();
        } catch (e) {
          // If refresh fails, fall back to optimistic local increment using canonical keys
          if (typeof applyIncrement === "function") {
            applyIncrement({
              completedCalories: Number(totals.calories || 0),
              completedProtein: Number(totals.protein || 0),
              completedCarbs: Number(totals.carbs || 0),
              completedFat: Number(totals.fats || 0),
              completedFiber: Number(totals.fiber || 0),
              completedSugar: Number(totals.sugar || 0)
            });
          }
        }
      } else {
        // No refresh provided — do optimistic local update using canonical keys
        if (typeof applyIncrement === "function") {
          applyIncrement({
            completedCalories: Number(totals.calories || 0),
            completedProtein: Number(totals.protein || 0),
            completedCarbs: Number(totals.carbs || 0),
            completedFat: Number(totals.fats || 0),
            completedFiber: Number(totals.fiber || 0),
            completedSugar: Number(totals.sugar || 0)
          });
        }
      }

      // Clear UI
      setTextAnalysisResult(null);
      setFoodInput("");
      toast.success("Saved meal and updated daily totals");
    } catch (err) {
      console.error("addTrackedCalories error:", err);
      toast.error("Failed to save meal or update daily totals");
    } finally {
      setAddingToDaily(false);
    }
  };

  /* ---------- DetectedItemCard (inline) ----------
     - Renders a single analyzed item with suggestions
  */
  const DetectedItemCard = ({ item, index, onAcceptSuggestion, selectedSuggestionName }) => {
    if (!item) return null;

    let uiSuggestions = [];
    const group = textAnalysisResult?.candidates?.find((g) => Number(g.itemIndex) === Number(index));
    if (group && Array.isArray(group.candidates)) {
      try {
        const ranked = topCandidates ? topCandidates(group.candidates, group.input || "", 6) : group.candidates;
        const seen = new Set();
        const uniq = [];
        for (const r of ranked) {
          const cand = r?.item ?? r;
          const dn = String(cand?.displayName || cand?.name || cand).trim().toLowerCase();
          if (!dn) continue;
          if (seen.has(dn)) continue;
          seen.add(dn);
          uniq.push(cand);
          if (uniq.length >= 3) break;
        }
        uiSuggestions = uniq;
      } catch (e) {
        const seen = new Set();
        const uniq = [];
        for (const c of group.candidates) {
          const dn = String(c?.displayName || c?.name || c).trim().toLowerCase();
          if (!dn) continue;
          if (seen.has(dn)) continue;
          seen.add(dn);
          uniq.push(c);
          if (uniq.length >= 3) break;
        }
        uiSuggestions = uniq;
      }
    }

    return (
      <div className="p-4 bg-white rounded-2xl border border-gray-100 w-full flex flex-col">
        <div className="flex justify-between items-start w-full">
          <div>
            <div className="text-sm text-gray-400">Input</div>
            <div className="font-semibold text-gray-900">{item.userInputName || item.dishName}</div>
          </div>

          <div className="text-right">
            <div className="text-sm text-gray-400">Calories</div>
            <div className="font-bold text-lg">{item.calories !== null ? `${f(item.calories)} kcal` : "—"}</div>
          </div>
        </div>

        <div className="mt-3 flex items-center justify-between w-full gap-6">
          <div className="flex flex-col text-xs text-gray-400 min-w-[110px]">
            {item.preparation && <div>Prep: {item.preparation}</div>}
            <div>Qty: {item.quantity} {item.unit}</div>
          </div>

          <div className="flex-1 grid grid-cols-4 gap-2 text-xs text-gray-600">
            <div className="p-2 bg-gray-50 rounded text-center">
              <div>Protein</div>
              <div className="font-medium">{item.protein !== null ? `${f(item.protein)} g` : "—"}</div>
            </div>
            <div className="p-2 bg-gray-50 rounded text-center">
              <div>Carbs</div>
              <div className="font-medium">{item.carbs !== null ? `${f(item.carbs)} g` : "—"}</div>
            </div>
            <div className="p-2 bg-gray-50 rounded text-center">
              <div>Fats</div>
              <div className="font-medium">{item.fats !== null ? `${f(item.fats)} g` : "—"}</div>
            </div>
            <div className="p-2 bg-gray-50 rounded text-center">
              <div>Sugar</div>
              <div className="font-medium">{item.sugar !== null ? `${f(item.sugar)} g` : "—"}</div>
            </div>
          </div>
        </div>

        {uiSuggestions.length > 0 && (
          <div className="mt-3">
            <div className="text-xs text-gray-400 mb-2">Suggestions for ambiguous items</div>
            <div className="flex flex-wrap gap-2">
              {uiSuggestions.map((cand, idx) => {
                const candName = cand.displayName || cand.name || cand;
                const isSelected = selectedSuggestionName === candName;
                return (
                  <button
                    key={idx}
                    onClick={() => onAcceptSuggestion(index, cand)}
                    className={`px-2 py-1 rounded-md text-sm transition ${
                      isSelected
                        ? "bg-green-500 text-white shadow-md ring-2 ring-green-400"
                        : "bg-green-50 text-green-700 hover:bg-green-100"
                    }`}
                  >
                    {candName}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  /* ---------- Render UI (exact styling and UX from provided block) ---------- */
  return (
    <div id="content-text" className="tab-content">
      <div className="max-w-2xl mx-auto space-y-6">
        <div className="relative">
          <textarea
            id="food-input"
            rows="4"
            value={foodInput}
            onChange={(e) => setFoodInput(e.target.value)}
            className="w-full p-6 rounded-2xl border-2 border-gray-200 focus:border-green-500 focus:outline-none resize-none text-lg"
            placeholder="Describe your meal... (e.g., '2 eggs, 1 slice toast, 1 cup orange juice')"
          />
          <div className="absolute bottom-4 right-4">
            <span className="text-xs text-gray-400 bg-gray-100 px-3 py-1 rounded-full">AI Powered</span>
          </div>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <button
            onClick={() => setFoodInput((prev) => (prev ? `${prev}, Apple` : "Apple"))}
            className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-green-500 hover:shadow-lg transition text-center group"
          >
            <i className="fas fa-apple-alt text-2xl text-red-500 mb-2 group-hover:scale-110 transition block" />
            <span className="text-sm font-medium">Apple</span>
            <span className="text-xs text-gray-500 block">95 kcal</span>
          </button>

          <button
            onClick={() => setFoodInput((prev) => (prev ? `${prev}, Banana` : "Banana"))}
            className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-green-500 hover:shadow-lg transition text-center group"
          >
            <i className="fas fa-carrot text-2xl text-yellow-500 mb-2 group-hover:scale-110 transition block" />
            <span className="text-sm font-medium">Banana</span>
            <span className="text-xs text-gray-500 block">105 kcal</span>
          </button>

          <button
            onClick={() => setFoodInput((prev) => (prev ? `${prev}, Chicken` : "Chicken"))}
            className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-green-500 hover:shadow-lg transition text-center group"
          >
            <i className="fas fa-drumstick-bite text-2xl text-orange-500 mb-2 group-hover:scale-110 transition block" />
            <span className="text-sm font-medium">Chicken</span>
            <span className="text-xs text-gray-500 block">165 kcal</span>
          </button>

          <button
            onClick={() => setFoodInput((prev) => (prev ? `${prev}, Rice` : "Rice"))}
            className="p-4 bg-white rounded-2xl border border-gray-200 hover:border-green-500 hover:shadow-lg transition text-center group"
          >
            <i className="fas fa-bowl-rice text-2xl text-gray-600 mb-2 group-hover:scale-110 transition block" />
            <span className="text-sm font-medium">Rice Bowl</span>
            <span className="text-xs text-gray-500 block">200 kcal</span>
          </button>
        </div>

        <button
          onClick={analyzeText}
          className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-4 rounded-2xl font-bold text-lg hover:shadow-xl transition transform hover:-translate-y-1"
        >
          <i className="fas fa-magic mr-2" /> {analyzingText ? "Analyzing..." : "Analyze Meal"}
        </button>

        {/* ---------- Analysis summary area ---------- */}
        <div id="text-analysis-result" className={`${textAnalysisResult ? "block" : "hidden"} glass-card p-6 rounded-2xl border-l-4 border-green-500`}>
          {textAnalysisResult && (
            <>
              <div className="mb-3">
                <div className="text-sm text-gray-500">Analyzed</div>
                <div className="text-xl font-semibold text-gray-900">{(textAnalysisResult.items || []).map(i => i.userInputName || i.dishName).filter(Boolean).join(", ")}</div>
              </div>

              {/* Micronutrients summary */}
              <div className="grid grid-cols-2 gap-3 mb-4">
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-xs text-gray-500">Calories</div>
                  <div className="font-bold text-lg">{textAnalysisResult.totals?.calories ?? "—"} kcal</div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-xs text-gray-500">Protein</div>
                  <div className="font-bold text-lg">{textAnalysisResult.totals?.protein ?? "—"} g</div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-xs text-gray-500">Carbs</div>
                  <div className="font-bold text-lg">{textAnalysisResult.totals?.carbs ?? "—"} g</div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-xs text-gray-500">Fats</div>
                  <div className="font-bold text-lg">{textAnalysisResult.totals?.fats ?? "—"} g</div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-xs text-gray-500">Fiber</div>
                  <div className="font-bold text-lg">{textAnalysisResult.totals?.fiber ?? "—"} g</div>
                </div>
                <div className="p-3 bg-white rounded-lg border">
                  <div className="text-xs text-gray-500">Sugar</div>
                  <div className="font-bold text-lg">{textAnalysisResult.totals?.sugar ?? "—"} g</div>
                </div>
              </div>

              {/* Per-item cards */}
              <div className="flex flex-col gap-4 mb-4 w-full">
                {textAnalysisResult.items.map((it, idx) => (
                  <DetectedItemCard
                    key={idx}
                    item={it}
                    index={idx}
                    onAcceptSuggestion={acceptSuggestion}
                    selectedSuggestionName={textAnalysisResult.selectedSuggestions?.[idx] ?? null}
                  />
                ))}
              </div>

              {/* Add to Log button */}
              <div className="flex gap-2">
                <button
                  onClick={addTrackedCalories}
                  disabled={addingToDaily}
                  className="flex-1 bg-green-600 text-white py-2 rounded-xl font-medium hover:bg-green-700 transition disabled:opacity-60"
                >
                  {addingToDaily ? "Adding..." : "Add to Log"}
                </button>

                <button
                  onClick={() => setTextAnalysisResult(null)}
                  className="px-4 py-2 border border-gray-300 rounded-xl hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}