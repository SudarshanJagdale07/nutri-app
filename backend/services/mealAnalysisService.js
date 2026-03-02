// backend/services/mealAnalysisService.js
// Backend helper combining parser + matcher + calculator to keep logic organized.
// Drop into backend/services/. This version uses the Mongoose connection to access
// the curated nutrition collection (food_nutrition_DB) via mongoose.connection.db.collection
// so we don't create another native MongoClient. This file is intended to be the
// canonical analysis/matching code used by the controller.

import mongoose from "mongoose";

/* -------------------------
   Note:
   - This service expects mongoose connection to be established prior to calls.
   - It reads the curated nutrition collection named "food_nutrition_DB" from the DB.
   - We use mongoose.Types.ObjectId where needed.
------------------------- */

// Unit grams map (same as controller)
const UNIT_GRAMS_MAP = {
  handful: 30,
  "small handful": 20,
  "large handful": 40,
  bowl: 150,
  "medium bowl": 150,
  "small bowl": 100,
  cup: 180,
  serving: 100,
  piece: 40,
  slice: 30
};

// Preparation words (copied from controller)
const PREPARATION_WORDS = new Set([
  "home","house","ghar","ghar ka","ghar-ka","restaurant","outside","dhaba","hotel","street","streetfood",
  "pack","packed","packaged","packet","tiffin","parcel","outside"
]);

// Helpers
export function normalizeUnit(u) {
  if (!u) return "serving";
  const s = String(u).toLowerCase().trim();
  if (s.match(/^(kg|kilogram|kilograms)$/)) return "kg";
  if (s.match(/^(g|gram|grams|gm)$/)) return "g";
  if (s.match(/^(ml|milliliter|millilitre|milliliters|millilitres)$/)) return "ml";
  if (s.match(/^(l|litre|liter)$/)) return "l";
  if (s.match(/^(cup|cups)$/)) return "cup";
  if (s.match(/^(bowl|bowls|medium bowl|small bowl|large bowl)$/)) return "bowl";
  if (s.match(/^(handful|handfuls)$/)) return "handful";
  if (s.match(/^(slice|slices)$/)) return "slice";
  if (s.match(/^(piece|pieces|serving|servings|plate|plates|katori|katoris|pcs)$/)) return "serving";
  return s;
}

export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

export function normalizeText(s) {
  if (!s) return "";
  const noDiacritics = s.normalize ? s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") : s;
  return String(noDiacritics).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

/* -------------------------
   simpleParse: deterministic fallback parser
------------------------- */
export function simpleParse(text) {
  const items = [];
  if (!text || typeof text !== "string") return { items: [], preparationHint: null };

  let normalized = text
    .replace(/[()]/g, " ")
    .replace(/[,;&+]/g, " , ")
    .replace(/\s{2,}/g, " ")
    .trim();
  const lower = normalized.toLowerCase();

  let preparationHint = null;
  if (/\b(home|house|ghar|ghar ka|ghar\-ka)\b/.test(lower)) preparationHint = "home";
  else if (/\b(restaurant|outside|dhaba|hotel|street|streetfood|outside)\b/.test(lower)) preparationHint = "outside";
  else if (/\b(pack|packed|packaged|packet|tiffin|parcel)\b/.test(lower)) preparationHint = "packaged";

  const segments = normalized.split(/\s*(?:,|\band\b|\+|&|;)\s*/i).map(s => s.trim()).filter(Boolean);

  const UNIT_TOKEN =
    "(kg|g|gm|gram|grams|ml|l|litre|liter|cup|cups|bowl|bowls|handful|handfuls|serving|servings|slice|slices|piece|pieces|plate|plates|katori|katoris|pcs)";

  for (let segRaw of segments) {
    if (!segRaw) continue;
    let seg = segRaw.replace(/(^\b(?:a|an|the|with|and|of|for|in|on|at)\b)|(\b(?:a|an|the|with|and|of|for|in|on|at)\b$)/gi, "").trim();
    seg = seg.replace(/\s{2,}/g, " ").trim();

    let segPrep = null;
    const l = seg.toLowerCase();
    if (/\b(home|house|ghar|ghar ka|ghar\-ka)\b/.test(l)) segPrep = "home";
    else if (/\b(restaurant|outside|dhaba|hotel|street|streetfood|outside)\b/.test(l)) segPrep = "outside";
    else if (/\b(pack|packed|packaged|packet|tiffin|parcel)\b/.test(l)) segPrep = "packaged";

    seg = seg.replace(/\b(of|with|and|in|on|at|for|from|to)\b/gi, " ");

    for (const pw of PREPARATION_WORDS) {
      const pwEsc = pw.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(`\\b${pwEsc}\\b`, "gi");
      seg = seg.replace(re, " ");
    }
    seg = seg.replace(/\s{2,}/g, " ").trim();

    // Leading qty "500ml milk" or "2 roti"
    let m = seg.match(new RegExp("^\\s*(\\d+(?:[\\.,]\\d+)?)\\s*(?:" + UNIT_TOKEN + ")?\\s+(.+?)\\s*$", "i"));
    if (m) {
      const qty = Number(String(m[1]).replace(",", "."));
      const unitRaw = (m[2] || "").toLowerCase();
      let unit = unitRaw ? normalizeUnit(unitRaw) : "serving";
      let name = (m[3] || "").trim().toLowerCase();
      name = name.replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      name = name.replace(/\b(the|a|an|of|with|home|outside|restaurant|packed|packaged|dhaba|hotel|street|tiffin)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit, preparation: segPrep || preparationHint });
      continue;
    }

    // Attached unit with no space: "500mlmilk"
    m = seg.match(new RegExp("^\\s*(\\d+(?:[\\.,]\\d+)?)(?:" + UNIT_TOKEN + ")(.+?)\\s*$", "i"));
    if (m) {
      const qty = Number(String(m[1]).replace(",", "."));
      const rest = (m[2] || "").trim();
      let name = rest.toLowerCase().replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      name = name.replace(/\b(the|a|an|of|with|home|outside|restaurant|packed|packaged|dhaba|hotel|street|tiffin)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit: "serving", preparation: segPrep || preparationHint });
      continue;
    }

    // Trailing qty "milk 500ml" or "groundnut 200 g"
    m = seg.match(new RegExp("^\\s*(.+?)\\s+(\\d+(?:[\\.,]\\d+)?)\\s*(?:" + UNIT_TOKEN + ")?\\s*$", "i"));
    if (m) {
      let name = (m[1] || "").trim().toLowerCase();
      const qty = Number(String(m[2]).replace(",", "."));
      const unitRaw = (m[3] || "").toLowerCase();
      const unit = unitRaw ? normalizeUnit(unitRaw) : "serving";
      name = name.replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit, preparation: segPrep || preparationHint });
      continue;
    }

    // "chapati x2" style
    m = seg.match(/^\s*(.+?)\s*(?:x|\*)\s*(\d+(?:[\.,]\d+)?)\s*$/i);
    if (m) {
      let name = m[1].trim().toLowerCase();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      const qty = Number(String(m[2]).replace(",", "."));
      items.push({ name: name, quantity: qty, unit: "piece", preparation: segPrep || preparationHint });
      continue;
    }

    // descriptive sizes "a handful of nuts"
    m = seg.match(/^\s*(?:a|an|the)?\s*(small|medium|large)?\s*(handful|bowl|cup|serving|slice|piece|plate)?(?:\s+of)?\s+(.+?)\s*$/i);
    if (m) {
      const size = (m[1] || "").toLowerCase();
      const unitWord = (m[2] || "").toLowerCase();
      let name = (m[3] || "").trim().toLowerCase();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      let unit = "serving";
      if (unitWord) unit = unitWord;
      else if (size) unit = size === "small" ? "small bowl" : size === "large" ? "large bowl" : "serving";
      items.push({ name, quantity: 1, unit: normalizeUnit(unit), preparation: segPrep || preparationHint });
      continue;
    }

    const cleanedName = seg.replace(/\b(the|a|an|of|with|home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
    if (cleanedName) {
      items.push({ name: cleanedName.toLowerCase(), quantity: 1, unit: "serving", preparation: segPrep || preparationHint });
      continue;
    }
  }

  const cleaned = items.map(it => {
    const name = String(it.name || "").replace(/[-_]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return { name, quantity: Number(it.quantity) || 1, unit: normalizeUnit(it.unit), preparation: it.preparation || preparationHint || null };
  });

  return { items: cleaned, preparationHint };
}

/* -------------------------
   Candidate shaping & dedupe
------------------------- */
export function dedupeAndShapeCandidates(rawCandidates = [], limit = 3) {
  if (!Array.isArray(rawCandidates)) return [];
  const out = [];
  const seen = new Set();
  for (const c of rawCandidates) {
    const dn = String(c.displayName || c.name || "").trim().toLowerCase();
    if (!dn) continue;
    if (seen.has(dn)) continue;
    seen.add(dn);
    out.push({
      _id: c._id,
      displayName: c.displayName,
      aliases: c.aliases || [],
      searchTerms: c.searchTerms || [],
      calories_kcal: c.calories_kcal ?? c.caloriesPer100g ?? c.calories ?? null,
      protein_g: c.protein_g ?? c.proteinPer100g ?? c.protein ?? null,
      carbs_g: c.carbs_g ?? c.carbsPer100g ?? c.carbs ?? null,
      fat_g: c.fat_g ?? c.fatPer100g ?? c.fat ?? null,
      perQuantity: c.perQuantity ?? c.gramsPerUnit ?? c.perServing ?? null,
      unit: c.unit ?? "g",
      preparationType: c.preparationType ?? null
    });
    if (out.length >= limit) break;
  }
  return out;
}

/* -------------------------
   Helper: pick best candidate index (simple scoring)
------------------------- */
export function scoreCandidates(candidates = [], normalizedInput = "") {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  const scores = candidates.map((c) => {
    let score = 0;
    const display = normalizeText(c.displayName || "");
    const aliases = (c.aliases || []).map(a => normalizeText(String(a)));
    if (!normalizedInput) return 0;
    if (display === normalizedInput) score += 50;
    if (aliases.includes(normalizedInput)) score += 40;
    if (display.includes(normalizedInput)) score += 20;
    if (c.caloriesPer100g || c.calories_kcal) score += 2;
    return score;
  });
  let bestIdx = 0;
  let bestScore = scores[0] ?? 0;
  for (let i = 1; i < scores.length; i++) {
    if (scores[i] > bestScore) {
      bestScore = scores[i];
      bestIdx = i;
    }
  }
  return bestIdx;
}

/* -------------------------
   pickCandidateByPreparation
------------------------- */
export function pickCandidateByPreparation(candidates = [], prefer = null) {
  if (!Array.isArray(candidates) || candidates.length === 0) return 0;
  const pref = (prefer || "").toLowerCase();
  if (pref) {
    const idx = candidates.findIndex(c => String(c.preparationType || "").toLowerCase() === pref);
    if (idx !== -1) return idx;
  }
  const order = ["home", "outside", "packaged"];
  for (const o of order) {
    const idx = candidates.findIndex(c => String(c.preparationType || "").toLowerCase() === o);
    if (idx !== -1) return idx;
  }
  return scoreCandidates(candidates, "");
}

/* -------------------------
   findRelatedVariants - DB lookup
   Uses mongoose connection to access the collection.
------------------------- */
async function getNutritionCollection() {
  if (!mongoose.connection || !mongoose.connection.db) {
    throw new Error("Mongoose not connected yet. Call connectDB before using mealAnalysisService.");
  }
  return mongoose.connection.db.collection("food_nutrition_DB");
}

export async function findRelatedVariants(baseName, excludeId = null, limit = 5, preferPrep = null) {
  try {
    const nutritionItems = await getNutritionCollection();
    const nameToken = normalizeText(baseName).split(/\s+/)[0] || baseName;
    const orClauses = [
      { displayName: new RegExp(escapeRegex(nameToken), "i") },
      { searchTerms: { $in: [nameToken] } },
      { aliases: { $in: [nameToken] } }
    ];
    const filter = { $and: [{ $or: orClauses }] };
    if (excludeId) filter._id = { $ne: (typeof excludeId === "string" ? new mongoose.Types.ObjectId(excludeId) : excludeId) };
    const variants = await nutritionItems.find(filter).limit(limit * 3).toArray();
    const seen = new Set();
    const out = [];
    for (const c of variants) {
      const dn = String(c.displayName || "").trim().toLowerCase();
      if (seen.has(dn)) continue;
      seen.add(dn);
      out.push({
        _id: c._id,
        displayName: c.displayName,
        aliases: c.aliases || [],
        searchTerms: c.searchTerms || [],
        calories_kcal: c.calories_kcal ?? c.caloriesPer100g ?? c.calories ?? null,
        protein_g: c.protein_g ?? c.proteinPer100g ?? null,
        carbs_g: c.carbs_g ?? c.carbsPer100g ?? null,
        fat_g: c.fat_g ?? c.fatPer100g ?? null,
        perQuantity: c.perQuantity ?? c.gramsPerUnit ?? null,
        unit: c.unit ?? "g",
        preparationType: c.preparationType ?? null
      });
      if (out.length >= limit) break;
    }
    return out;
  } catch (err) {
    console.warn("findRelatedVariants error:", err);
    return [];
  }
}

/* -------------------------
   findNutritionDocByName - robust matching
   Returns: { doc, candidates, reason }
------------------------- */
export async function findNutritionDocByName(name, preparationHint = null) {
  if (!name) return { doc: null, candidates: [], reason: "empty" };
  const normalizedName = normalizeText(name);
  const nutritionItems = await getNutritionCollection();

  // Exact / alias / searchTerms
  try {
    const clauses = [
      { displayName: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") },
      { aliases: { $in: [normalizedName] } },
      { searchTerms: { $in: [normalizedName] } }
    ];

    if (preparationHint) {
      const withPrep = await nutritionItems.findOne({ $and: [{ $or: clauses }, { preparationType: { $regex: `^${escapeRegex(preparationHint)}$`, $options: "i" } }] });
      if (withPrep) {
        const related = await findRelatedVariants(normalizedName, withPrep._id, 5, preparationHint);
        return { doc: withPrep, candidates: dedupeAndShapeCandidates([withPrep], 3), related, reason: "exact_with_prep" };
      }
    }

    let doc = await nutritionItems.findOne({ $or: clauses });
    if (doc) {
      const related = await findRelatedVariants(normalizedName, doc._id, 5, null);
      return { doc, candidates: dedupeAndShapeCandidates([doc], 3), related, reason: "exact" };
    }
  } catch (e) {
    console.warn("Exact match query failed:", e?.message || e);
  }

  // Tokenized partial match
  const tokens = normalizedName.split(/\s+/).filter(Boolean);
  if (tokens.length > 0) {
    const orClauses = [];
    for (const t of tokens) {
      const re = new RegExp(escapeRegex(t), "i");
      orClauses.push({ displayName: re });
      orClauses.push({ aliases: { $in: [t] } });
      orClauses.push({ searchTerms: { $in: [t] } });
    }
    try {
      if (preparationHint) {
        const partialWithPrep = await nutritionItems.find({ $and: [{ $or: orClauses }, { preparationType: { $regex: `^${escapeRegex(preparationHint)}$`, $options: "i" } }] }).limit(20).toArray();
        if (partialWithPrep && partialWithPrep.length === 1) {
          const related = await findRelatedVariants(normalizedName, partialWithPrep[0]._id, 5, preparationHint);
          return { doc: partialWithPrep[0], candidates: dedupeAndShapeCandidates(partialWithPrep, 3), related, reason: "partial_single_with_prep" };
        }
        if (partialWithPrep && partialWithPrep.length > 1) {
          const deduped = dedupeAndShapeCandidates(partialWithPrep, 3);
          return { doc: null, candidates: deduped, reason: "partial_multi_with_prep" };
        }
      }

      const partial = await nutritionItems.find({ $or: orClauses }).limit(20).toArray();
      if (partial && partial.length === 1) {
        const related = await findRelatedVariants(normalizedName, partial[0]._id, 5, null);
        return { doc: partial[0], candidates: dedupeAndShapeCandidates(partial, 3), related, reason: "partial_single" };
      }
      if (partial && partial.length > 1) {
        const deduped = dedupeAndShapeCandidates(partial, 3);
        return { doc: null, candidates: deduped, reason: "partial_multi" };
      }
    } catch (e) {
      console.warn("Partial token search failed:", e?.message || e);
    }
  }

  // $text fallback
  try {
    const textResults = await nutritionItems.find({ $text: { $search: normalizedName } }, { score: { $meta: "textScore" } }).sort({ score: { $meta: "textScore" } }).limit(12).toArray();
    if (textResults && textResults.length === 1) {
      const related = await findRelatedVariants(normalizedName, textResults[0]._id, 5, null);
      return { doc: textResults[0], candidates: dedupeAndShapeCandidates(textResults, 3), related, reason: "text_single" };
    }
    if (textResults && textResults.length > 1) {
      return { doc: null, candidates: dedupeAndShapeCandidates(textResults, 3), reason: "text_multi" };
    }
  } catch (e) {
    // If $text index not present or query fails, ignore and continue
    console.warn("Text search failed or index missing:", e?.message || e);
  }

  // regex anywhere
  try {
    const docs = await nutritionItems.find({ displayName: new RegExp(escapeRegex(normalizedName), "i") }).limit(10).toArray();
    if (docs && docs.length === 1) {
      const related = await findRelatedVariants(normalizedName, docs[0]._id, 5, null);
      return { doc: docs[0], candidates: dedupeAndShapeCandidates(docs, 3), related, reason: "regex_single" };
    }
    if (docs && docs.length > 1) {
      const deduped = dedupeAndShapeCandidates(docs, 3);
      return { doc: null, candidates: dedupeAndShapeCandidates(docs, 3), reason: "regex_multi" };
    }
  } catch (e) {
    console.warn("Regex fallback failed:", e?.message || e);
  }

  // No match found
  return { doc: null, candidates: [], reason: "none" };
}

/* -------------------------
   analyzeTextLocal: parse + match + compute macros
   Returns: { meal, candidates: [ { input, itemIndex, candidates } ] }
------------------------- */
export async function analyzeTextLocal(text, { preparation = null, limitCandidates = 3 } = {}) {
  const parsed = simpleParse(text);
  if (preparation) parsed.preparationHint = parsed.preparationHint || preparation;

  const mealItems = [];
  const responseCandidates = [];

  for (let itemIndex = 0; itemIndex < parsed.items.length; itemIndex++) {
    const item = parsed.items[itemIndex];
    let preferPrep = item.preparation || parsed.preparationHint || null;

    const normalizedName = item.name || "";

    const { doc: foodDoc, candidates, related, reason } = await findNutritionDocByName(normalizedName, preferPrep);

    if ((!foodDoc && candidates && candidates.length > 0) || (candidates && candidates.length > 1)) {
      // include itemIndex so frontend can attach to the correct card
      responseCandidates.push({ input: item.name, itemIndex, candidates, reason, preferPrep });
    }

    if (!foodDoc) {
      // Unknown food: push estimated item
      mealItems.push({
        userInputName: item.name,
        dishName: item.name,
        foodId: null,
        quantity: item.quantity,
        unit: item.unit,
        grams: null,
        calories: null,
        protein: null,
        carbs: null,
        fats: null,
        fiber: null,
        sugar: null,
        isEstimated: true,
        preparation: preferPrep
      });
      continue;
    }

    // If we have exact doc, but also related variants expose them as candidate group
    if (Array.isArray(related) && related.length > 0) {
      const filteredVariants = related.filter(v => String(v._id) !== String(foodDoc._id));
      if (filteredVariants.length > 0) {
        responseCandidates.push({ input: item.name, itemIndex, candidates: filteredVariants, reason: "variants", preferPrep });
      }
    }

    // Compute grams using unit information and DB perQuantity
    let grams = 0;
    const unit = item.unit;

    if (unit === "g" || unit === "ml") {
      grams = item.quantity;
    } else if (unit === "kg") {
      grams = item.quantity * 1000;
    } else if (UNIT_GRAMS_MAP[unit]) {
      grams = item.quantity * UNIT_GRAMS_MAP[unit];
    } else if (foodDoc.perQuantity) {
      grams = item.quantity * (foodDoc.perQuantity ?? 100);
    } else if (foodDoc.gramsPerUnit) {
      grams = item.quantity * foodDoc.gramsPerUnit;
    } else {
      grams = item.quantity * 100;
    }

    const calories = (grams / 100) * (foodDoc.caloriesPer100g ?? foodDoc.calories_kcal ?? 0);
    const protein = (grams / 100) * (foodDoc.proteinPer100g ?? foodDoc.protein_g ?? 0);
    const carbs = (grams / 100) * (foodDoc.carbsPer100g ?? foodDoc.carbs_g ?? 0);
    const fat = (grams / 100) * (foodDoc.fatPer100g ?? foodDoc.fat_g ?? 0);
    const fiber = (grams / 100) * (foodDoc.fiberPer100g ?? foodDoc.fiber_g ?? 0);
    const sugar = (grams / 100) * (foodDoc.sugarPer100g ?? foodDoc.sugar_g ?? 0);

    mealItems.push({
      userInputName: item.name,
      dishName: foodDoc.displayName || item.name,
      foodId: foodDoc._id,
      quantity: item.quantity,
      unit: item.unit,
      grams,
      calories,
      protein,
      carbs,
      fats: fat,
      fiber,
      sugar,
      isEstimated: false,
      preparation: foodDoc.preparationType ?? preferPrep
    });
  }

  const meal = {
    rawInput: text,
    date: (new Date()).toISOString().slice(0,10),
    timestamp: new Date(),
    items: mealItems,
    totalCalories: mealItems.reduce((sum, i) => sum + (i.calories || 0), 0),
    totalProtein: mealItems.reduce((sum, i) => sum + (i.protein || 0), 0),
    totalCarbs: mealItems.reduce((sum, i) => sum + (i.carbs || 0), 0),
    totalFats: mealItems.reduce((sum, i) => sum + (i.fats || 0), 0),
    totalFiber: mealItems.reduce((sum, i) => sum + (i.fiber || 0), 0),
    totalSugar: mealItems.reduce((sum, i) => sum + (i.sugar || 0), 0),
  };

  return { meal, candidates: responseCandidates };
}

export default {
  simpleParse,
  normalizeUnit,
  normalizeText,
  analyzeTextLocal,
  findNutritionDocByName,
  dedupeAndShapeCandidates,
  scoreCandidates,
  pickCandidateByPreparation,
  findRelatedVariants
};