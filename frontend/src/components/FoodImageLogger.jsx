// frontend/src/components/FoodImageLogger.jsx
import React, { useRef, useState, useCallback } from "react";
import toast from "react-hot-toast";
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faTrashAlt, faMagic, faCircleNotch } from '@fortawesome/free-solid-svg-icons';
import { postImageMeal } from "../apiManager/foodApi";

/**
 * Props:
 * - user
 * - postImageAnalyze(formData)
 * - addToLogServer({ rawInput, totals, userId, selectionMap })
 * - fetchFoodDoc(name)
 * - applyIncrement(totals)
 * - refreshDailyTotals() optional
 * - formatNumberSmart (optional)
 *
 * This component is a thin UI wrapper around image upload + analysis.
 * It expects the backend adapter to return { success, ml, analysis } where analysis
 * matches the same shape returned by text analysis (meal, items, candidates, totals).
 */
export default function FoodImageLogger({
  user,
  postImageAnalyze,
  addToLogServer,
  fetchFoodDoc,
  applyIncrement,
  refreshDailyTotals,
  formatNumberSmart
}) {
  const fileRef = useRef(null);
  const [preview, setPreview] = useState(null);
  const [analyzing, setAnalyzing] = useState(false);
  const [analysis, setAnalysis] = useState(null);
  const [ml, setMl] = useState(null);
  const [qtyMap, setQtyMap] = useState({});
  const [adding, setAdding] = useState(false);

  // Local UI-only scanner state (keeps parity with Dashboard's scannerActive)
  const [scannerActive, setScannerActive] = useState(false);

  // Minimum confidence threshold (0-1). Items or ML results below this will be treated as low-confidence.
  const MIN_CONFIDENCE = 0.85;

  // Format helper fallback
  const f = (n) => (formatNumberSmart ? formatNumberSmart(n) : (Number.isFinite(Number(n)) ? String(n) : n));

  const onFileChange = (e) => {
    const ffile = e.target.files?.[0];
    if (!ffile) return;
    setPreview(URL.createObjectURL(ffile));
    setAnalysis(null);
    setMl(null);
    // Call analyze right away
    setTimeout(() => {
      analyze();
    }, 100);
  };

  const analyze = async () => {
    if (!fileRef.current?.files?.[0]) {
      toast.error("Please upload an image first");
      return;
    }
    setAnalyzing(true);
    setScannerActive(true);
    try {
      const fd = new FormData();
      fd.append("image", fileRef.current.files[0]);
      const resp = await postImageAnalyze(fd);

      // If adapter returned failure, show error and stop
      if (!resp || !resp.success) {
        toast.error(resp?.error || "Analysis failed");
        setAnalysis(null);
        setMl(resp?.ml ?? null);
        setScannerActive(false);
        return;
      }

      // Save raw ML info
      setMl(resp.ml || null);

      // --- Confidence gating: if ML-level confidence is present and below threshold, inform user and stop.
      // We check common fields: resp.ml.confidence, resp.ml.confidenceScore, resp.ml.conf
      const mlConfidence = resp.ml?.confidence ?? resp.ml?.confidenceScore ?? resp.ml?.conf ?? null;
      if (typeof mlConfidence === "number" && mlConfidence < MIN_CONFIDENCE) {
        // Keep ml in state so user can inspect, but do not show analysis items
        setAnalysis(null);
        setAnalyzing(false);
        setScannerActive(false);
        toast.error("Couldn’t identify the image with enough confidence. Try a clearer photo or use text input to log this meal.");
        return;
      }

      // --- Normalization: backend may return analysis in two shapes:
      // 1) analysis.items, analysis.totals (preferred)
      // 2) analysis.meal.items, analysis.candidates, meal.totalCalories etc.
      // 3) preview shape: { name, nutrition: { calories, protein, carbs, fat, fiber, sugar }, isPiece, count }
      // Convert either into canonical shape:
      // { items: [...], totals: {...}, selectionMap: {...} }

      // Handle preview shape from image-only flow
      if (resp.preview && !resp.analysis) {
        const p = resp.preview;
        const n = p.nutrition || {};
        const qty = p.count || 1;
        const item = {
          userInputName: p.name || "",
          dishName: p.name || "",
          foodId: p.foodId ?? null,
          quantity: qty,
          unit: p.isPiece ? "piece" : "g",
          grams: p.servingWeight_g ?? null,
          calories: Number(n.calories || 0),
          protein: Number(n.protein || 0),
          carbs: Number(n.carbs || 0),
          fats: Number(n.fat || 0),
          fiber: Number(n.fiber || 0),
          sugar: Number(n.sugar || 0),
          isEstimated: false,
          preparation: p.preparation ?? null,
          suggestions: [],
          confidence: resp.ml?.confidence ?? null
        };
        const map = { 0: qty };
        setQtyMap(map);
        setAnalysis({
          items: [item],
          totals: {
            calories: Math.round(item.calories * qty * 100) / 100,
            protein: Math.round(item.protein * qty * 100) / 100,
            carbs: Math.round(item.carbs * qty * 100) / 100,
            fats: Math.round(item.fats * qty * 100) / 100,
            fiber: Math.round(item.fiber * qty * 100) / 100,
            sugar: Math.round(item.sugar * qty * 100) / 100
          },
          selectionMap: null
        });
        toast.success("Analysis complete — review below");
        setAnalyzing(false);
        setScannerActive(false);
        return;
      }

      const raw = resp.analysis || {};
      let normalized = { items: [], totals: {}, selectionMap: null };

      // If analysis already has items/totals, use them
      if (Array.isArray(raw.items) && raw.items.length > 0) {
        normalized.items = raw.items.map((it) => ({ ...it }));
        normalized.totals = raw.totals || raw.totals || {};
        normalized.selectionMap = raw.selectionMap ?? null;
      } else if (raw.meal && Array.isArray(raw.meal.items)) {
        // Use meal.items and compute totals if needed
        normalized.items = raw.meal.items.map((it) => ({ ...it }));
        // Try to read totals from common fields, fallback to 0s
        normalized.totals = raw.totals || {
          calories: raw.meal.totalCalories ?? raw.meal.totalCalories ?? 0,
          protein: raw.meal.totalProtein ?? 0,
          carbs: raw.meal.totalCarbs ?? 0,
          fats: raw.meal.totalFats ?? 0,
          fiber: raw.meal.totalFiber ?? 0,
          sugar: raw.meal.totalSugar ?? 0
        };
        normalized.selectionMap = raw.meal.selectionMap ?? raw.selectionMap ?? null;
      } else {
        // No items found — keep empty analysis but still set analysis so UI can show fallback
        normalized.items = [];
        normalized.totals = raw.totals || { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0 };
        normalized.selectionMap = raw.selectionMap ?? null;
      }

      // Map candidates (if present) into per-item suggestions
      // backend may return raw.candidates as array of groups: { itemIndex, candidates: [...] }
      if (Array.isArray(raw.candidates) && raw.candidates.length > 0) {
        // initialize suggestions arrays
        for (let i = 0; i < normalized.items.length; i++) {
          normalized.items[i].suggestions = normalized.items[i].suggestions || [];
        }
        for (const group of raw.candidates) {
          const idx = Number(group.itemIndex ?? -1);
          if (idx >= 0 && Array.isArray(group.candidates) && normalized.items[idx]) {
            // attach candidates to the corresponding item as suggestions
            normalized.items[idx].suggestions = (group.candidates || []).slice(0, 10);
          }
        }
      } else {
        // If no grouped candidates, but there is a top-level candidates array shaped differently,
        // try to dedupe and attach to first item as fallback
        if (Array.isArray(raw.candidates) && raw.candidates.length > 0 && normalized.items.length > 0) {
          normalized.items[0].suggestions = normalized.items[0].suggestions || raw.candidates.slice(0, 10);
        }
      }

      // Ensure each item has default fields expected by UI
      normalized.items = normalized.items.map((it) => ({
        userInputName: it.userInputName ?? it.name ?? it.dishName ?? "",
        dishName: it.dishName ?? it.userInputName ?? "",
        foodId: it.foodId ?? it._id ?? null,
        quantity: it.quantity ?? 1,
        unit: it.unit ?? "serving",
        grams: it.grams ?? null,
        calories: (typeof it.calories === "number") ? it.calories : (it.calories_kcal ?? it.calories ?? null),
        protein: (typeof it.protein === "number") ? it.protein : (it.protein_g ?? it.protein ?? null),
        carbs: (typeof it.carbs === "number") ? it.carbs : (it.carbs_g ?? it.carbs ?? null),
        fats: (typeof it.fats === "number") ? it.fats : (it.fat_g ?? it.fats ?? null),
        fiber: it.fiber ?? null,
        sugar: it.sugar ?? null,
        isEstimated: it.isEstimated ?? true,
        preparation: it.preparation ?? null,
        suggestions: it.suggestions ?? [],
        mlQuantity: it.mlQuantity ?? null,
        confidence: (typeof it.confidence === "number") ? it.confidence : (typeof it.conf === "number" ? it.conf : null)
      }));

      // Recalculate totals from items
      let totalCalories = 0, totalProtein = 0, totalCarbs = 0, totalFats = 0, totalFiber = 0, totalSugar = 0;
      normalized.items.forEach(item => {
        const qty = Number(item.quantity ?? 1);
        totalCalories += (Number(item.calories) || 0) * qty;
        totalProtein += (Number(item.protein) || 0) * qty;
        totalCarbs += (Number(item.carbs) || 0) * qty;
        totalFats += (Number(item.fats) || 0) * qty;
        totalFiber += (Number(item.fiber) || 0) * qty;
        totalSugar += (Number(item.sugar) || 0) * qty;
      });
      normalized.totals = {
        calories: Math.round(totalCalories * 100) / 100,
        protein: Math.round(totalProtein * 100) / 100,
        carbs: Math.round(totalCarbs * 100) / 100,
        fats: Math.round(totalFats * 100) / 100,
        fiber: Math.round(totalFiber * 100) / 100,
        sugar: Math.round(totalSugar * 100) / 100
      };

      // --- Per-item confidence filtering:
      // If items include a confidence field, filter out items below MIN_CONFIDENCE.
      // If all items are filtered out, inform the user and do not show analysis.
      const itemsWithConfidence = normalized.items.filter(it => typeof it.confidence === "number");
      if (itemsWithConfidence.length > 0) {
        const kept = normalized.items.filter(it => (typeof it.confidence !== "number") || (it.confidence >= MIN_CONFIDENCE));
        if (kept.length === 0) {
          // none of the detected items are above threshold
          setAnalysis(null);
          setAnalyzing(false);
          setScannerActive(false);
          toast.error("Couldn’t identify the image with enough confidence. Try a clearer photo OR use text input to log this meal instead.");
          return;
        }
        normalized.items = kept;
      }

      // Initialize qtyMap for UI quantity controls
      const map = {};
      normalized.items.forEach((it, idx) => {
        map[idx] = it.quantity || 1;
      });
      setQtyMap(map);

      // Set normalized analysis into state
      setAnalysis(normalized);

      toast.success("Analysis complete — review below");
    } catch (e) {
      console.error("postImageAnalyze error:", e);
      toast.error("Analysis failed");
    } finally {
      setAnalyzing(false);
      // small UX delay so scanner ray is visible briefly
      setTimeout(() => setScannerActive(false), 350);
    }
  };

  /**
   * changeQty
   *
   * - Updates qtyMap and analysis atomically so totals and analysis.items[].quantity
   *   remain consistent and no stale reads occur.
   *
   * Implementation detail:
   * - We use functional setQtyMap(prev => { ... }) so we can compute newQty from prev reliably.
   * - Inside that functional update we call setAnalysis(prevAnalysis => { ... }) to update
   *   analysis using the same newQty and the previous qtyMap values for other items.
   */
  const changeQty = (idx, delta) => {
    setQtyMap((prevQtyMap) => {
      const prevQty = Number(prevQtyMap[idx] || (analysis?.items?.[idx]?.quantity) || 1);
      const newQty = Math.max(1, prevQty + delta);

      // Update analysis atomically using the same newQty and prevQtyMap for other items
      setAnalysis((prevAnalysis) => {
        if (!prevAnalysis) return prevAnalysis;
        const cloned = JSON.parse(JSON.stringify(prevAnalysis));

        // Update canonical quantity on the item
        if (cloned.items && cloned.items[idx]) {
          cloned.items[idx].quantity = newQty;
        }

        // Recompute totals using newQty for changed index and prevQtyMap for others
        let totalCals = 0, totalProt = 0, totalCarbs = 0, totalFats = 0, totalFiber = 0, totalSugar = 0;
        cloned.items.forEach((item, i) => {
          const itemQty = (i === idx) ? newQty : (Number(prevQtyMap[i]) || Number(item.quantity) || 1);
          // Use per-item macros as provided (assumed per-unit or normalized earlier)
          totalCals += (Number(item.calories) || 0) * itemQty;
          totalProt += (Number(item.protein) || 0) * itemQty;
          totalCarbs += (Number(item.carbs) || 0) * itemQty;
          totalFats += (Number(item.fats) || 0) * itemQty;
          totalFiber += (Number(item.fiber) || 0) * itemQty;
          totalSugar += (Number(item.sugar) || 0) * itemQty;
        });

        cloned.totals = {
          calories: Math.round(totalCals * 100) / 100,
          protein: Math.round(totalProt * 100) / 100,
          carbs: Math.round(totalCarbs * 100) / 100,
          fats: Math.round(totalFats * 100) / 100,
          fiber: Math.round(totalFiber * 100) / 100,
          sugar: Math.round(totalSugar * 100) / 100
        };

        return cloned;
      });

      // Return updated qtyMap (this will be the new state)
      return { ...prevQtyMap, [idx]: newQty };
    });
  };

  const acceptSuggestion = async (itemIndex, chosen) => {
    if (!fetchFoodDoc) {
      toast.error("No fetchFoodDoc available");
      return;
    }
    try {
      const chosenName = chosen?.displayName ?? chosen ?? null;
      if (!chosenName) {
        toast.error("Invalid candidate");
        return;
      }
      const doc = await fetchFoodDoc(chosenName);
      if (!doc) {
        toast.error("Nutrition info not found for selected item");
        return;
      }
      const cloned = JSON.parse(JSON.stringify(analysis));
      const target = cloned.items?.[itemIndex];
      if (!target) {
        toast.error("Target item not found");
        return;
      }
      const qty = Number(target.quantity || 1);
      let grams = 0;
      const unit = (target.unit || "").toLowerCase();
      if (unit === "g" || unit === "ml") grams = qty;
      else if (unit === "kg") grams = qty * 1000;
      else if (doc.perQuantity) grams = qty * (doc.perQuantity ?? 100);
      else if (doc.gramsPerUnit) grams = qty * doc.gramsPerUnit;
      else grams = qty * 100;

      const calories = (grams / 100) * (doc.caloriesPer100g ?? doc.calories_kcal ?? 0);
      const protein = (grams / 100) * (doc.proteinPer100g ?? doc.protein_g ?? 0);
      const carbs = (grams / 100) * (doc.carbsPer100g ?? doc.carbs_g ?? 0);
      const fats = (grams / 100) * (doc.fatPer100g ?? doc.fat_g ?? 0);
      const fiber = (grams / 100) * (doc.fiberPer100g ?? doc.fiber_g ?? 0);
      const sugar = (grams / 100) * (doc.sugarPer100g ?? doc.sugar_g ?? 0);

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

      cloned.selectionMap = cloned.selectionMap || {};
      cloned.selectionMap[itemIndex] = doc._id ?? doc.displayName ?? chosenName;

      // recompute totals by multiplying per-unit values by quantity
      cloned.totals = {
        calories: Math.round(cloned.items.reduce((s, it) => s + (Number(it.calories) || 0) * (Number(it.quantity) || 1), 0) * 100) / 100,
        protein: Number((cloned.items.reduce((s, it) => s + (Number(it.protein) || 0) * (Number(it.quantity) || 1), 0)).toFixed(2)),
        carbs: Number((cloned.items.reduce((s, it) => s + (Number(it.carbs) || 0) * (Number(it.quantity) || 1), 0)).toFixed(2)),
        fats: Number((cloned.items.reduce((s, it) => s + (Number(it.fats) || 0) * (Number(it.quantity) || 1), 0)).toFixed(2)),
        fiber: Number((cloned.items.reduce((s, it) => s + (Number(it.fiber) || 0) * (Number(it.quantity) || 1), 0)).toFixed(2)),
        sugar: Number((cloned.items.reduce((s, it) => s + (Number(it.sugar) || 0) * (Number(it.quantity) || 1), 0)).toFixed(2))
      };

      setAnalysis(cloned);
      toast.success(`Selected "${doc.displayName}" — nutrition loaded for that item`);
    } catch (err) {
      console.error("acceptSuggestion error:", err);
      toast.error("Failed to load nutrition for selected item");
    }
  };

  const addToLog = async () => {
    if (!analysis?.items?.length) {
      toast.error("No analysis to add");
      return;
    }
    setAdding(true);
    try {
      const itemsWithQuantity = (analysis.items || []).map((item) => {
        const q = Number(item.quantity || 1);
        return {
          userInputName: item.userInputName,
          dishName: item.dishName,
          foodId: item.foodId,
          quantity: q,
          unit: item.unit,
          grams: item.grams != null ? Math.round(item.grams * q * 100) / 100 : null,
          calories: Math.round((Number(item.calories) || 0) * q * 100) / 100,
          protein: Math.round((Number(item.protein) || 0) * q * 100) / 100,
          carbs: Math.round((Number(item.carbs) || 0) * q * 100) / 100,
          fats: Math.round((Number(item.fats) || 0) * q * 100) / 100,
          fiber: Math.round((Number(item.fiber) || 0) * q * 100) / 100,
          sugar: Math.round((Number(item.sugar) || 0) * q * 100) / 100,
          isEstimated: item.isEstimated,
          preparation: item.preparation
        };
      });

      const computedTotals = itemsWithQuantity.reduce((acc, it) => {
        acc.calories += (Number(it.calories) || 0);
        acc.protein += (Number(it.protein) || 0);
        acc.carbs += (Number(it.carbs) || 0);
        acc.fats += (Number(it.fats) || 0);
        acc.fiber += (Number(it.fiber) || 0);
        acc.sugar += (Number(it.sugar) || 0);
        return acc;
      }, { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0 });

      const totals = {
        calories: Math.round(computedTotals.calories * 100) / 100,
        protein: Math.round(computedTotals.protein * 100) / 100,
        carbs: Math.round(computedTotals.carbs * 100) / 100,
        fats: Math.round(computedTotals.fats * 100) / 100,
        fiber: Math.round(computedTotals.fiber * 100) / 100,
        sugar: Math.round(computedTotals.sugar * 100) / 100
      };

      const payload = {
        userId: user._id,
        rawInput: ml?.dish || "Image meal",
        selectionMap: analysis.selectionMap || null,
        items: itemsWithQuantity,
        totals,
        mlConfidence: ml?.confidence ?? null
      };

      const serverResp = await postImageMeal(payload);

      if (!serverResp?.meal) {
        toast.error("Failed to save meal");
        return;
      }

      const completedTotals = {
        completedCalories: totals.calories,
        completedProtein: totals.protein,
        completedCarbs: totals.carbs,
        completedFat: totals.fats,
        completedFiber: totals.fiber,
        completedSugar: totals.sugar
      };

      if (typeof refreshDailyTotals === "function") {
        await refreshDailyTotals();
      } else if (typeof applyIncrement === "function") {
        applyIncrement(completedTotals);
      }

      setAnalysis(null);
      setMl(null);
      setPreview(null);
      if (fileRef.current) fileRef.current.value = "";
      toast.success("Meal saved successfully!");
    } catch (err) {
      console.error("addToLog error:", err);
      toast.error("Failed to save meal");
    } finally {
      setAdding(false);
    }
  };

  // Small helper to scale macros for display
  const handleClear = useCallback(() => {
    setPreview(null);
    setAnalysis(null);
    setMl(null);
    if (fileRef.current) fileRef.current.value = "";
  }, []);

  const scaleMacro = (val, qty) => {
    if (!val) return "0g";
    const num = parseFloat(val);
    return isNaN(num) ? val : `${(num * qty).toFixed(1)}g`;
  };

  // Small helper to render a confidence badge
  const ConfidenceBadge = ({ value }) => {
    if (value == null || isNaN(value)) return null;
    const pct = (Number(value) * 100).toFixed(1);
    let bg = "bg-red-100 text-red-800";
    if (value >= 0.85) bg = "bg-green-100 text-green-800";
    else if (value >= 0.7) bg = "bg-yellow-100 text-yellow-800";
    return (
      <span className={`ml-2 inline-flex items-center px-2 py-0.5 rounded-full text-xs font-bold ${bg}`}>
        {pct}%
      </span>
    );
  };

  return (
    <div className="grid md:grid-cols-2 gap-8">
      {/* IMAGE AREA */}
      <div className="relative">
        <div
          className={`border-4 border-dashed rounded-3xl h-80 flex flex-col items-center justify-center transition cursor-pointer overflow-hidden relative
            ${preview ? "bg-transparent border-green-200" : "bg-green-50 hover:bg-green-100 border-green-300"}`}
          onClick={() => fileRef.current?.click()}
        >
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={(e) => {
              onFileChange(e);
            }}
          />

          {!preview ? (
            <div className="text-center p-6">
              <div className="w-20 h-20 bg-green-200 rounded-full flex items-center justify-center mx-auto mb-4 transform transition-transform group-hover:scale-110">
                <svg width="36" height="36" viewBox="0 0 24 24" fill="none" aria-hidden>
                  <path d="M12 3v10" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                  <path d="M7 10l5-5 5 5" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                </svg>
              </div>
              <p className="text-lg font-medium text-gray-700 mb-1">Drop your food photo here</p>
              <p className="text-sm text-gray-500">or click to browse</p>
            </div>
          ) : (
            <img src={preview} alt="preview" className="absolute inset-0 w-full h-full object-cover z-10 rounded-3xl" />
          )}

          <div
            className={`absolute left-0 right-0 h-24 pointer-events-none z-30 ${scannerActive ? "animate-scan" : "hidden"}`}
            style={{
              background: "linear-gradient(180deg, rgba(0,166,118,0) 0%, rgba(0,166,118,0.28) 30%, rgba(0,166,118,0.9) 50%, rgba(0,166,118,0.28) 70%, rgba(0,166,118,0) 100%)",
              mixBlendMode: "screen",
            }}
          />
        </div>

        <div className="absolute bottom-4 left-4 right-4 flex gap-2 z-40">
          <button
            className="flex-1 bg-white/90 backdrop-blur-md py-3 rounded-2xl text-sm font-bold text-gray-700 hover:bg-white transition-all shadow-lg flex items-center justify-center gap-2 group border border-gray-100"
            onClick={() => {
              if (!preview) {
                toast.error("Please upload an image first");
                return;
              }
              if (!analyzing && !analysis) {
                analyze();
              } else if (analysis) {
                toast("Image already analyzed");
              }
            }}
          >
            <span className="inline-flex items-center justify-center w-5 h-5">
              {analyzing ? (
                // Loading Spinner (Spinning)
                <FontAwesomeIcon 
                  icon={faCircleNotch} 
                  spin 
                  className="text-amber-500 text-lg" 
                />
              ) : (
                // AI Magic Wand
                <FontAwesomeIcon 
                  icon={faMagic} 
                  className="text-amber-500 text-lg group-hover:rotate-12 transition-transform" 
                />
              )}
            </span>
            <span className="tracking-wide">
              {analyzing ? "Analyzing..." : "AI Analyze"}
            </span>
          </button>
          <button
          className="w-12 h-12 bg-white/90 backdrop-blur rounded-xl flex items-center justify-center text-red-500 hover:bg-red-50 hover:text-red-600 transition-all shadow-lg border border-red-50"
          onClick={handleClear}
        >
          <FontAwesomeIcon icon={faTrashAlt} />
        </button>
        </div>
      </div>

      {/* RESULTS SECTION */}
      <div className="space-y-6">
        <h3 className="text-3xl font-serif font-bold text-gray-800 border-b-2 border-green-100 pb-4">AI Analysis Results</h3>

        <div className="space-y-6">
          {analysis && (analysis.items || []).length > 0 ? (
            (analysis.items || []).map((it, idx) => {
              const qty = qtyMap[idx] || it.quantity || 1;
              return (
                <div key={idx} className="space-y-4">
                  <div className="flex items-center gap-6 p-6 bg-white rounded-[2rem] border border-gray-100 shadow-sm relative">
                    <div className="w-16 h-16 bg-green-50 rounded-2xl flex items-center justify-center text-[#00A676] text-2xl shrink-0">
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" aria-hidden>
                        <path d="M4 7h16" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M7 7v10" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                        <path d="M17 7v10" stroke="#059669" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round"/>
                      </svg>
                    </div>
                    <div className="flex-1">
                      <p className="text-xl font-black text-gray-800 capitalize inline-flex items-center">
                        {it.userInputName || it.dishName}              
                        <ConfidenceBadge value={it.confidence} />
                      </p>
                      <p className="text-[10px] font-bold text-gray-400 uppercase tracking-widest mt-1">
                        Portion: {it.grams ? `${it.grams} g` : (it.unit || "1 serving")}
                      </p>
                    </div>
                    <div className="text-right">
                      <span className="block text-2xl font-black text-[#00A676]">{it.calories !== null ? f(Math.round(it.calories * qty * 100) / 100) : "—"}</span>
                      <span className="text-xs font-bold text-gray-400 uppercase">kcal</span>
                    </div>
                  </div>

                  <div className="flex items-center justify-between px-6 py-4 bg-gray-50 rounded-2xl border border-gray-200">
                    <span className="text-sm font-bold text-gray-600">Adjust Quantity</span>
                    <div className="flex items-center gap-4">
                      <button
                        onClick={() => changeQty(idx, -1)}
                        className="w-10 h-10 flex items-center justify-center bg-white rounded-xl font-bold text-[#00A676] border border-gray-100"
                      >
                        -
                      </button>
                      <span className="w-6 text-center font-black text-lg">{qty}</span>
                      <button
                        onClick={() => changeQty(idx, 1)}
                        className="w-10 h-10 flex items-center justify-center bg-white rounded-xl font-bold text-[#00A676] border border-gray-100"
                      >
                        +
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-3">
                    <MacroBox label="Protein" val={scaleMacro(it.protein, qty)} icon="🍗" color="bg-orange-50 text-orange-700" />
                    <MacroBox label="Fats" val={scaleMacro(it.fats, qty)} icon="🥑" color="bg-yellow-50 text-yellow-700" />
                    <MacroBox label="Carbs" val={scaleMacro(it.carbs, qty)} icon="🍞" color="bg-blue-50 text-blue-700" />
                  </div>


                </div>
              );
            })
          ) : (
            <div className="text-center py-20 text-gray-400 font-serif italic">
              {/* If ML exists but analysis is suppressed due to low confidence, show helpful inline hint */}
              {ml && (ml.confidence ?? ml.confidenceScore ?? ml.conf) != null ? (
                <div>
                  <div className="mb-2 font-semibold text-gray-700">We couldn't identify this photo with high confidence.</div>
                  <div className="text-sm text-gray-500">Try a clearer photo or use the text input to describe and log your meal.</div>
                </div>
              ) : (
                "Scan a meal to see nutrition details..."
              )}
            </div>
          )}
        </div>

        {/* If analysis exists, show Add to Log for full meal */}
        {analysis && (
          <div className="mt-4">
            <button
              onClick={addToLog}
              disabled={adding}
              className="w-full bg-gradient-to-r from-green-600 to-emerald-600 text-white py-3 rounded-2xl font-bold text-lg hover:shadow-xl transition transform hover:-translate-y-0.5 disabled:opacity-60"
            >
              {adding ? "Saving..." : "Add Full Meal to Log"}
            </button>
          </div>
        )}

        {analysis && (
          <div className="p-4 bg-gray-100 rounded-2xl border border-gray-200 mt-8">
            <p className="text-[14px] text-gray-500 leading-tight">
              <strong>Disclaimer:</strong> Nutritional values are estimates.
            </p>
          </div>
        )}

      </div>
    </div>
  );
}

/* ---------- MacroBox ---------- */
const MacroBox = ({ label, val, icon, color }) => (
  <div className={`${color} p-4 rounded-[1.5rem] border border-black/5 text-center transition-all hover:scale-105`}>
    <span className="text-2xl block mb-1">{icon}</span>
    <p className="text-[10px] font-black uppercase opacity-60 tracking-wider">{label}</p>
    <p className="font-black text-lg">{val || "0g"}</p>
  </div>
);