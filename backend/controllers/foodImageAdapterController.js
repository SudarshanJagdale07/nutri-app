// backend/controllers/foodImageAdapterController.js
import { analyzeFood } from "../services/imageAnalysisService.js";
/**
 * IMPORTANT:
 * Replace the import below with whatever DB/collection accessor your project uses.
 * Example options (pick the one your project uses):
 * - import { nutritionItems } from "../config/db.js";         // if you export collection handles
 * - import FoodsModel from "../models/foodModel.js";          // if using a Mongoose model (use FoodsModel.findOne)
 * - const { getCollection } = require("../lib/db");          // if you have helper to get collections
 *
 * I use `nutritionItems` below as the collection handle. If your project uses a different
 * export/name/path, change only the line below to match your project.
 */

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
 
// ---------------------
// Helpers for image-only preview calculation (kept inside this file)
// ---------------------

// conservative mapping if mlQuantity text uses common units (cup, plate, glass, bowl)
const UNIT_GRAMS_MAP = {
  cup: 200,
  cups: 200,
  plate: 200,
  bowl: 200,
  glass: 200,
  slice: 100,
  piece: null // piece handled separately
};

function parseMlQuantityToGrams(mlQuantity, doc) {
  // mlQuantity examples: "6 pieces", "1 cup", "1 plate (200g)", "2 slices"
  if (!mlQuantity || typeof mlQuantity !== "string") return null;

  // If doc.servingWeight_g exists (prefer explicit grams), use it
  if (doc && doc.servingWeight_g && Number(doc.servingWeight_g) > 0) {
    return Number(doc.servingWeight_g);
  }

  // If the mlQuantity contains explicit grams like "(200g)", prefer that
  const explicitGramsMatch = mlQuantity.match(/\((\d+(?:\.\d+)?)\s*g\)/i);
  if (explicitGramsMatch) {
    return Number(explicitGramsMatch[1]);
  }

  // Basic parse of "2 cups" or "1 bowl"
  const m = mlQuantity.trim().match(/^(\d+(?:\.\d+)?)(?:\s*([a-zA-Z]+))/);
  if (!m) return null;
  const qtyNum = Number(m[1]);
  const qtyUnit = (m[2] || "").toLowerCase();

  if (qtyUnit === "piece" || qtyUnit === "pieces") {
    return null; // piece-based handled separately by caller
  }

  if (UNIT_GRAMS_MAP[qtyUnit]) {
    return qtyNum * UNIT_GRAMS_MAP[qtyUnit];
  }

  // fallback: assume mlQuantity refers to multiples of doc.perQuantity (e.g., perQuantity = 100 g)
  const perQ = Number(doc?.perQuantity || 100);
  return qtyNum * perQ;
}

function computeNutritionFromDoc(doc, gramsOverride = null) {
  // doc must contain: perQuantity, unit and macros (calories_kcal, protein_g, carbs_g, fat_g, fiber_g?, sugar_g?)
  const unit = String((doc.unit || "")).toLowerCase();
  const perQ = Number(doc.perQuantity || 100);

  const isPiece = unit === "piece" || (perQ === 1 && unit === "piece");

  const round2 = v => Math.round((Number(v) || 0) * 100) / 100;

  if (isPiece) {
    // Treat stored macros as per-piece values (perQuantity == 1)
    const caloriesPerPiece = Number(doc.calories_kcal || doc.calories || 0);
    const proteinPerPiece = Number(doc.protein_g || 0);
    const carbsPerPiece = Number(doc.carbs_g || 0);
    const fatPerPiece = Number(doc.fat_g || 0);
    const fiberPerPiece = Number(doc.fiber_g || 0);
    const sugarPerPiece = Number(doc.sugar_g || 0);
    return {
      calories: round2(caloriesPerPiece),
      protein: round2(proteinPerPiece),
      carbs: round2(carbsPerPiece),
      fat: round2(fatPerPiece),
      fiber: round2(fiberPerPiece),
      sugar: round2(sugarPerPiece),
      isPiece: true,
      grams: gramsOverride || null
    };
  } else {
    // Weight-based: compute using gramsOverride (serving grams) / perQuantity
    const grams = Number(gramsOverride || perQ);
    const multiplier = perQ > 0 ? (grams / perQ) : 1;
    const caloriesPerBase = Number(doc.calories_kcal ?? doc.calories ?? 0);
    const proteinPerBase = Number(doc.protein_g ?? 0);
    const carbsPerBase = Number(doc.carbs_g ?? 0);
    const fatPerBase = Number(doc.fat_g ?? 0);
    const fiberPerBase = Number(doc.fiber_g ?? 0);
    const sugarPerBase = Number(doc.sugar_g ?? 0);

    return {
      calories: round2(caloriesPerBase * multiplier),
      protein: round2(proteinPerBase * multiplier),
      carbs: round2(carbsPerBase * multiplier),
      fat: round2(fatPerBase * multiplier),
      fiber: round2(fiberPerBase * multiplier),
      sugar: round2(sugarPerBase * multiplier),
      isPiece: false,
      grams
    };
  }
}

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
      const resp = await globalThis.fetch(`${API_BASE}/api/log-text`, {
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