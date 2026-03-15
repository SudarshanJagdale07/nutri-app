// backend/controllers/foodImageAdapterController.js
import { ObjectId } from "mongodb";
import { analyzeFood } from "../services/imageAnalysisService.js";
import { computeTotalsFromItems, parseMlQuantityToGrams, computeNutritionFromDoc } from "../services/nutritionCalculationService.js";
import { saveMeal, updateDailyNutrition } from "../services/mealPersistenceService.js";
import { nutritionItems } from "../config/db.js";
import { getLocalDateString } from "../utils/dateUtils.js";

/**
 * analyzeImageAdapter
 * - req.file.path contains uploaded image
 * - Calls analyzeFood(imagePath) to get ML labels
 * - Converts ML labels into a text string and calls internal /api/log-text (persist:false)
 * - Returns combined JSON: { success, ml, analysis }
 *
 * Important: this adapter intentionally reuses the existing text analysis endpoint
 * so all matching, suggestion and parsing logic remains unchanged.
 */

export async function analyzeImageAdapter(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    const imagePath = req.file.path;

    // 1) Run ML analysis (friend's wrapper)
    const mlResult = await analyzeFood(imagePath);

    // If ML failed, return ML error but still in a consistent shape
    if (!mlResult || !mlResult.success) {
      return res.json({ success: false, error: mlResult?.error || "ML analysis failed", ml: mlResult || null });
    }

    // 2) Convert ML output to text input for existing text analysis
    // Note: for image flow we will send the raw ML key (e.g. "aloo_gobi" or "paneer_tikka")
    // to the text endpoint and mark the request as fromImage:true. The text endpoint
    // will perform an mlKey lookup and synthesize a full quantity+dish string (e.g. "6 pieces paneer tikka").
    let textInput = "";
    if (mlResult.dish && String(mlResult.dish).trim()) {
      // Prefer explicit dish field from ML (this should be the mlKey)
      textInput = String(mlResult.dish).trim();
    } else if (Array.isArray(mlResult.labels) && mlResult.labels.length) {
      // Use the top label as the mlKey (do not normalize underscores here)
      textInput = String(mlResult.labels[0]).trim();
    } else if (mlResult.label) {
      textInput = String(mlResult.label).trim();
    } else {
      textInput = mlResult.prediction || mlResult.name || "";
    }

    // NORMALIZATION: convert snake_case -> space and lowercase so text matches searchTerms
    // (applies for dish/label/prediction/name branches above)
    // NOTE: for mlKey-based lookup we intentionally do NOT perform this normalization here.
    // The text controller will perform an equality lookup by mlKey when fromImage is true.
    // Keeping this comment for context only.

    // ------------------------
    // IMAGE-ONLY PREVIEW FLOW
    // - lookup mlKey in nutrition collection
    // - compute nutrition preview using mlQuantity and servingWeight_g
    // - return preview directly to frontend
    // - if mlKey not found -> fallback to existing /api/log-text behaviour
    // ------------------------

    const API_BASE = process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 5000}`;

    // mlKey expected to be the ML label (e.g. "paneer_tikka")
    const mlKey = String(textInput || "").trim();

    // Try exact lookup by mlKey in the nutrition collection
    let doc = null;
    try {
      // NOTE: adjust this call to match your project's DB access pattern.
      // If you're using Mongoose model: doc = await FoodsModel.findOne({ mlKey }).lean();
      // If you export a collection object: doc = await nutritionItems.findOne({ mlKey });
      doc = await nutritionItems.findOne({ mlKey });
    } catch (dbErr) {
      console.error("Image preview lookup DB error:", dbErr);
      doc = null;
    }

    if (!doc) {
      // Not found — fallback to existing text flow: call /api/log-text (so previous behavior remains)
      const payload = { text: textInput, userId: req.body?.userId || null, persist: false };
      const resp = await globalThis.fetch(`${API_BASE}/api/analyze-text-meal`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      let analysis = null;
      try { analysis = await resp.json(); } catch (e) { analysis = null; }
      return res.json({ success: true, ml: mlResult, analysis, preview: null, fallback: true });
    }

    // we have a matching doc -> compute preview
    const mlQuantityRaw = String(doc.mlQuantity || "").trim();
    const unit = String((doc.unit || "")).toLowerCase();
    const perQ = Number(doc.perQuantity || 100);
    const isPiece = unit === "piece" || (perQ === 1 && unit === "piece");

    let preview = null;

    if (isPiece) {
      // parse pieces count from mlQuantity (e.g., "6 pieces") -> count
      const m = mlQuantityRaw.match(/^(\d+(?:\.\d+)?)/);
      const count = m ? Number(m[1]) : 1;

      // compute per-piece values from doc (assume doc's macros are per piece if perQuantity == 1)
      const per = computeNutritionFromDoc(doc, doc.servingWeight_g && Number(doc.servingWeight_g) > 0 ? Number(doc.servingWeight_g) : null);

      preview = {
        name: doc.displayName || doc.name || mlKey,
        mlKey: doc.mlKey || mlKey,
        foodId: doc._id ?? null,
        preparation: doc.preparationType ?? null,
        quantityText: mlQuantityRaw || `${count} piece${count > 1 ? "s" : ""}`,
        count,
        servingWeight_g: doc.servingWeight_g && Number(doc.servingWeight_g) > 0 ? Number(doc.servingWeight_g) : null,
        nutrition: {
          calories: Math.round(per.calories * count * 100) / 100,
          protein: Math.round(per.protein * count * 100) / 100,
          carbs: Math.round(per.carbs * count * 100) / 100,
          fat: Math.round(per.fat * count * 100) / 100,
          fiber: Math.round((per.fiber || 0) * count * 100) / 100,
          sugar: Math.round((per.sugar || 0) * count * 100) / 100
        },
        isPiece: true
      };
    } else {
      // weight-based: determine grams (prefer doc.servingWeight_g; else try parse mlQuantity)
      let grams = doc.servingWeight_g && Number(doc.servingWeight_g) > 0 ? Number(doc.servingWeight_g) : parseMlQuantityToGrams(mlQuantityRaw, doc);
      if (!grams) {
        // final fallback to perQuantity (so multiplier = 1)
        grams = perQ;
      }

      const per = computeNutritionFromDoc(doc, grams);

      preview = {
        name: doc.displayName || doc.name || mlKey,
        mlKey: doc.mlKey || mlKey,
        foodId: doc._id ?? null,
        preparation: doc.preparationType ?? null,
        quantityText: mlQuantityRaw || `${grams} g`,
        servingWeight_g: grams,
        nutrition: {
          calories: per.calories,
          protein: per.protein,
          carbs: per.carbs,
          fat: per.fat,
          fiber: per.fiber,
          sugar: per.sugar
        },
        isPiece: false
      };
    }

    // Return preview directly to frontend. Logging unchanged; frontend may call /api/log-text to persist.
    return res.json({
      success: true,
      ml: mlResult,
      preview
    });
  } catch (err) {
    console.error("analyzeImageAdapter error:", err);
    return res.status(500).json({ success: false, error: err.message || "Adapter error" });
  }
}

// Controller: logImageMeal
// - Accepts payload: { userId, rawInput, selectionMap, items, totals, date }
// - Expects items array with adjusted quantity values from frontend image UI
export async function logImageMeal(req, res) {
  try {
    const {
      userId: rawUserId,
      rawInput = "Image meal",
      selectionMap = null,
      items = null,
      totals = null,
      date: providedDate = null,
      mlConfidence = null
    } = req.body || {};

    const userId = typeof rawUserId === "string" ? new ObjectId(rawUserId) : rawUserId;

    if (!userId) return res.status(400).json({ error: "userId required" });
    if (!Array.isArray(items) || items.length === 0) return res.status(400).json({ error: "items array required" });

    const date = providedDate || getLocalDateString(new Date());
    const timestamp = new Date();  // <-- This creates Date object

    // Normalize items: ensure numeric quantity and numeric macros
    const normalizedItems = items.map((it) => ({
      userInputName: it.userInputName ?? it.dishName ?? it.name ?? "",
      dishName: it.dishName ?? it.userInputName ?? it.name ?? "",
      foodId: it.foodId ? new ObjectId(it.foodId) : (it._id ? new ObjectId(it._id) : null),
      quantity: Number(it.quantity || 1),
      unit: it.unit ?? "serving",
      grams: it.grams ?? it.servingWeight_g ?? null,
      calories: Number(it.calories ?? 0),
      protein: Number(it.protein ?? 0),
      carbs: Number(it.carbs ?? 0),
      fats: Number(it.fats ?? 0),
      fiber: Number(it.fiber ?? 0),
      sugar: Number(it.sugar ?? 0),
      isEstimated: it.isEstimated ?? false,
      preparation: it.preparation ?? null
    }));

    // Compute totals if not provided or invalid
    let finalTotals = totals;
    if (!finalTotals || typeof finalTotals !== "object" || !Number.isFinite(Number(finalTotals.calories))) {
      finalTotals = computeTotalsFromItems(normalizedItems);
    }

    const mealDoc = {
      userId,
      rawInput,
      date,
      timestamp,
      createdAt: timestamp,
      items: normalizedItems,
      totalCalories: Number(finalTotals.calories || 0),
      totalProtein: Number(finalTotals.protein || 0),
      totalCarbs: Number(finalTotals.carbs || 0),
      totalFats: Number(finalTotals.fats || 0),
      totalFiber: Number(finalTotals.fiber || 0),
      totalSugar: Number(finalTotals.sugar || 0),
      selectionMap: selectionMap ?? null,
      mlConfidence: mlConfidence ?? null,
      meta: { source: "image_flow", persistedBy: "logImageMeal", persistedAt: timestamp }
    };

    const savedMeal = await saveMeal(mealDoc, userId);

    // Upsert daily totals
    await updateDailyNutrition(userId, date, mealDoc, savedMeal._id);

    return res.json({ meal: savedMeal });
  } catch (err) {
    console.error("logImageMeal error:", err);
    return res.status(500).json({ error: err.message || "logImageMeal error" });
  }
}
