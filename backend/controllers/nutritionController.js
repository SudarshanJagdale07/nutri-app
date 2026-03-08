// backend/controllers/nutritionController.js
import { MongoClient, ObjectId } from "mongodb";

import Ajv from "ajv";

import dotenv from "dotenv";

import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// ---------------------------
// Helper: sanitize Mongo URI to remove unsupported / deprecated query options
// ---------------------------
function sanitizeMongoUri(uri) {
  if (!uri || typeof uri !== "string") return uri;
  const idx = uri.indexOf("?");
  if (idx === -1) return uri;
  const base = uri.slice(0, idx);
  const qs = uri.slice(idx + 1);
  const pairs = qs.split("&").filter(Boolean);
  const drop = new Set(["useunifiedtopology", "usenewurlparser", "uselegacyutf8encoding"]);
  const kept = [];
  for (const p of pairs) {
    const [k, v] = p.split("=");
    if (!k) continue;
    if (drop.has(String(k).toLowerCase())) continue;
    kept.push(p);
  }
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

// ---------------------------
// MongoDB connection
// ---------------------------
const MONGO_URI_RAW = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_URI = sanitizeMongoUri(MONGO_URI_RAW);
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db("nutrition_ai_projectDB");

const nutritionItems = db.collection("food_nutrition_DB");
const mealsCol = db.collection("meals");
const dailyNutritionCol = db.collection("daily_nutrition");
const estimatedCol = db.collection("llm_estimated_foods");

// ---------------------------
// Ensure text index exists on food_nutrition_DB
// ---------------------------
try {
  await nutritionItems.createIndex(
    { displayName: "text", aliases: "text", searchTerms: "text" },
    { name: "food_text_index", default_language: "english" }
  );
  console.log("✅ Text index ensured on food_nutrition_DB");
} catch (idxErr) {
  console.warn("⚠️ Could not create text index (may already exist):", idxErr?.message || idxErr);
}

// ---------------------------
// Gemini / Generative AI setup
// ---------------------------
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const model = genAI
  ? genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" })
  : null;
console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
console.log("GEMINI_MODEL:", process.env.GEMINI_MODEL || "gemini-1.5-flash");

// ---------------------------
// ✅ FIX: Gemini call counter to track & cap API usage
// ---------------------------
let geminiCallCount = 0;
const GEMINI_CALL_LIMIT = 50; // safety cap per server session

// ---------------------------
// Schema validator for LLM output
// ---------------------------
const ajv = new Ajv({ nullable: true });
const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          preparation: { type: ["string", "null"] }
        },
        required: ["name", "quantity", "unit"]
      }
    },
    preparationHint: { type: ["string", "null"] }
  },
  required: ["items"]
};
const validateLLM = ajv.compile(schema);

// ---------------------------
// Helper: get local date string (YYYY-MM-DD)
// ---------------------------
function getLocalDateString(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

// ---------------------------
// Unit mapping for descriptive units
// ---------------------------
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

// ---------------------------
// Synonyms map
// ---------------------------
const SYNONYMS = {
  roti: ["chapati", "phulka", "roti"],
  chapati: ["roti", "phulka", "chapati"],
  phulka: ["roti", "chapati", "phulka"],
  "whole wheat roti": ["roti", "chapati", "whole wheat roti"],
  dal: ["dal", "lentil", "dhal"],
  rice: ["rice", "steamed rice", "boiled rice"],
  egg: ["egg", "eggs"]
};

// ---------------------------
// Stopwords
// ---------------------------
const STOPWORDS = new Set([
  "with","and","in","on","at","from","to","for","of","a","an","the","by","into","onto"
]);

// ---------------------------
// Preparation words
// ---------------------------
const PREPARATION_WORDS = new Set([
  "home","house","ghar","ghar ka","ghar-ka","restaurant","outside","dhaba","hotel","street","streetfood",
  "pack","packed","packaged","packet","tiffin","parcel","outside"
]);

// ---------------------------
// Fallback parser
// ---------------------------
function simpleParse(text) {
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

    const UNIT_TOKEN =
      "(kg|g|gm|gram|grams|ml|l|litre|liter|cup|cups|bowl|bowls|handful|handfuls|serving|servings|slice|slices|piece|pieces|plate|plates|katori|katoris|pcs)";

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

    m = seg.match(new RegExp("^\\s*(\\d+(?:[\\.,]\\d+)?)(?:" + UNIT_TOKEN + ")(.+?)\\s*$", "i"));
    if (m) {
      const qty = Number(String(m[1]).replace(",", "."));
      const rest = (m[2] || "").trim();
      const unit = "serving";
      let name = rest.toLowerCase().replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      name = name.replace(/\b(the|a|an|of|with|home|outside|restaurant|packed|packaged|dhaba|hotel|street|tiffin)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit, preparation: segPrep || preparationHint });
      continue;
    }

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

    m = seg.match(/^\s*(.+?)\s*(?:x|\*)\s*(\d+(?:[\.,]\d+)?)\s*$/i);
    if (m) {
      let name = m[1].trim().toLowerCase();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      const qty = Number(String(m[2]).replace(",", "."));
      items.push({ name: name, quantity: qty, unit: "piece", preparation: segPrep || preparationHint });
      continue;
    }

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
    return {
      name,
      quantity: Number(it.quantity) || 1,
      unit: normalizeUnit(it.unit),
      // ✅ FIX: ensure preparation is always a string or null (never undefined/object)
      preparation: it.preparation ? String(it.preparation) : null
    };
  });

  return { items: cleaned, preparationHint };
}

// ---------------------------
// ✅ FIX: callWithRetry — skip retries on 429 quota errors
// ---------------------------
async function callWithRetry(fn, { retries = 1, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), timeoutMs))
      ]);
      return res;
    } catch (err) {
      lastErr = err;
      // ⛔ If quota exceeded (429), stop retrying immediately — saves quota
      if (
        err?.status === 429 ||
        err?.message?.includes("429") ||
        err?.message?.includes("quota") ||
        err?.message?.includes("Too Many Requests")
      ) {
        console.warn("⚠️ Gemini quota exceeded — skipping retries, switching to fallback parser");
        throw err;
      }
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

// ---------------------------
// Helper: normalize unit string
// ---------------------------
function normalizeUnit(u) {
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

// ---------------------------
// Utility: escape regex special chars
// ---------------------------
function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------
// Helper: normalize text
// ---------------------------
function normalizeText(s) {
  if (!s) return "";
  const noDiacritics = s.normalize ? s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") : s;
  return String(noDiacritics).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}

// ---------------------------
// Helper: score candidates
// ---------------------------
function scoreCandidates(candidates = [], normalizedInput = "") {
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

// ---------------------------
// Helper: pick candidate by preparation preference
// ---------------------------
function pickCandidateByPreparation(candidates = [], prefer = null) {
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

// ---------------------------
// Helper: dedupe and shape candidates
// ---------------------------
function dedupeAndShapeCandidates(rawCandidates = [], limit = 3) {
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

// ---------------------------
// Helper: find related variants
// ---------------------------
async function findRelatedVariants(baseName, excludeId = null, limit = 5, preferPrep = null) {
  try {
    const nameToken = normalizeText(baseName).split(/\s+/)[0] || baseName;
    const orClauses = [
      { displayName: new RegExp(escapeRegex(nameToken), "i") },
      { searchTerms: { $in: [nameToken] } },
      { aliases: { $in: [nameToken] } }
    ];
    const filter = { $and: [{ $or: orClauses }] };
    if (excludeId) filter._id = { $ne: typeof excludeId === "string" ? new ObjectId(excludeId) : excludeId };
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
        protein_g: c.protein_g ?? c.proteinPer100g ?? c.protein ?? null,
        carbs_g: c.carbs_g ?? c.carbsPer100g ?? c.carbs ?? null,
        fat_g: c.fat_g ?? c.fatPer100g ?? c.fat ?? null,
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

// ---------------------------
// Helper: find nutrition doc by name
// ---------------------------
async function findNutritionDocByName(name, preparationHint = null) {
  if (!name) return { doc: null, candidates: [], reason: "empty" };
  const normalizedName = normalizeText(name);

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

  const syns = SYNONYMS[normalizedName];
  if (Array.isArray(syns) && syns.length > 0) {
    try {
      const clauses = [
        { displayName: { $in: syns } },
        { aliases: { $in: syns } },
        { searchTerms: { $in: syns } }
      ];

      if (preparationHint) {
        const doc = await nutritionItems.findOne({ $and: [{ $or: clauses }, { preparationType: { $regex: `^${escapeRegex(preparationHint)}$`, $options: "i" } }] });
        if (doc) {
          const related = await findRelatedVariants(normalizedName, doc._id, 5, preparationHint);
          return { doc, candidates: dedupeAndShapeCandidates([doc], 3), related, reason: "synonym_with_prep" };
        }
      }

      const doc = await nutritionItems.findOne({ $or: clauses });
      if (doc) {
        const related = await findRelatedVariants(normalizedName, doc._id, 5, null);
        return { doc, candidates: dedupeAndShapeCandidates([doc], 3), related, reason: "synonym" };
      }
    } catch (e) {
      console.warn("Synonym query failed:", e?.message || e);
    }
  }

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

  try {
    const textResults = await nutritionItems.find(
      { $text: { $search: normalizedName } },
      { score: { $meta: "textScore" } }
    ).sort({ score: { $meta: "textScore" } }).limit(12).toArray();

    if (textResults && textResults.length === 1) {
      const related = await findRelatedVariants(normalizedName, textResults[0]._id, 5, null);
      return { doc: textResults[0], candidates: dedupeAndShapeCandidates(textResults, 3), related, reason: "text_single" };
    }
    if (textResults && textResults.length > 1) {
      const deduped = dedupeAndShapeCandidates(textResults, 3);
      return { doc: null, candidates: deduped, reason: "text_multi" };
    }
  } catch (e) {
    console.warn("Text search failed or index missing:", e?.message || e);
  }

  try {
    const docs = await nutritionItems.find({ displayName: new RegExp(escapeRegex(normalizedName), "i") }).limit(10).toArray();
    if (docs && docs.length === 1) {
      const related = await findRelatedVariants(normalizedName, docs[0]._id, 5, null);
      return { doc: docs[0], candidates: dedupeAndShapeCandidates(docs, 3), related, reason: "regex_single" };
    }
    if (docs && docs.length > 1) {
      const deduped = dedupeAndShapeCandidates(docs, 3);
      return { doc: null, candidates: deduped, reason: "regex_multi" };
    }
  } catch (e) {
    console.warn("Regex fallback failed:", e?.message || e);
  }

  return { doc: null, candidates: [], reason: "none" };
}

// ---------------------------
// Controller: getFood
// ---------------------------
export async function getFood(req, res) {
  try {
    const { name } = req.params;
    const preparation = req.query.preparation ? String(req.query.preparation).toLowerCase() : null;

    if (!name) return res.status(400).json({ error: "name required" });

    const normalizedInput = normalizeText(name);
    const { doc, candidates, related, reason } = await findNutritionDocByName(name, preparation);

    if (doc) {
      const aliases = (doc.aliases || []).map(a => normalizeText(String(a)));
      const searchTerms = (doc.searchTerms || []).map(s => normalizeText(String(s)));
      let returnedDoc = { ...doc };

      if (aliases.includes(normalizedInput) || searchTerms.includes(normalizedInput)) {
        returnedDoc = { ...doc, displayName: String(name).trim() || doc.displayName };
      } else {
        returnedDoc = doc;
      }

      const shaped = {
        ...returnedDoc,
        calories_kcal: returnedDoc.calories_kcal ?? returnedDoc.caloriesPer100g ?? returnedDoc.calories ?? null,
        protein_g: returnedDoc.protein_g ?? returnedDoc.proteinPer100g ?? null,
        carbs_g: returnedDoc.carbs_g ?? returnedDoc.carbsPer100g ?? null,
        fat_g: returnedDoc.fat_g ?? returnedDoc.fatPer100g ?? null,
        fiber_g: returnedDoc.fiber_g ?? returnedDoc.fiberPer100g ?? null,
        sugar_g: returnedDoc.sugar_g ?? returnedDoc.sugarPer100g ?? null,
        perQuantity: returnedDoc.perQuantity ?? returnedDoc.gramsPerUnit ?? returnedDoc.perServing ?? null,
        unit: returnedDoc.unit ?? returnedDoc.defaultUnit ?? "g"
      };

      const variants = Array.isArray(related) ? related.filter(v => String(v._id) !== String(returnedDoc._id)) : [];
      const dedupVariants = dedupeAndShapeCandidates(variants, 3);

      return res.json({ ...shaped, variants: dedupVariants });
    }

    if (candidates && candidates.length > 0) {
      const bestIdx = pickCandidateByPreparation(candidates, preparation);
      const best = candidates[bestIdx];

      const aliases = (best.aliases || []).map(a => normalizeText(String(a)));
      const returnedBest = aliases.includes(normalizedInput) ? { ...best, displayName: String(name).trim() } : best;

      const shapedBest = {
        ...returnedBest,
        calories_kcal: returnedBest.calories_kcal ?? returnedBest.caloriesPer100g ?? returnedBest.calories ?? null,
        protein_g: returnedBest.protein_g ?? returnedBest.proteinPer100g ?? returnedBest.protein ?? null,
        carbs_g: returnedBest.carbs_g ?? returnedBest.carbsPer100g ?? returnedBest.carbs ?? null,
        fat_g: returnedBest.fat_g ?? returnedBest.fatPer100g ?? returnedBest.fat ?? null,
        fiber_g: returnedBest.fiber_g ?? returnedBest.fiberPer100g ?? returnedBest.fiber ?? null,
        sugar_g: returnedBest.sugar_g ?? returnedBest.sugarPer100g ?? returnedBest.sugar ?? null,
        perQuantity: returnedBest.perQuantity ?? returnedBest.gramsPerUnit ?? returnedBest.perServing ?? null,
        unit: returnedBest.unit ?? returnedBest.defaultUnit ?? "g"
      };

      const deduped = dedupeAndShapeCandidates(candidates, 3);
      return res.json({ ...shapedBest, candidates: deduped });
    }

    return res.json({
      previewOnly: true,
      displayName: String(name).trim(),
      calories_kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      fiber_g: 0,
      sugar_g: 0,
      perQuantity: 100,
      unit: "g",
      candidates: []
    });
  } catch (err) {
    console.error("getFood error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

// ---------------------------
// Controller: getMeals
// ---------------------------
export async function getMeals(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const limit = Math.min(100, Number(req.query.limit || 50));
    const before = req.query.before ? new Date(req.query.before) : null;

    const filter = { userId: typeof userId === "string" ? new ObjectId(userId) : userId };
    if (before) filter.createdAt = { $lt: before };

    const meals = await mealsCol
      .find(filter)
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.json({ count: meals.length, meals });
  } catch (err) {
    console.error("getMeals error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ---------------------------
// Controller: getDailyNutrition
// ---------------------------
export async function getDailyNutrition(req, res) {
  try {
    const { userId, date } = req.params;
    if (!userId || !date) return res.status(400).json({ error: "userId and date required" });

    const filter = {
      userId: typeof userId === "string" ? new ObjectId(userId) : userId,
      date
    };

    const daily = await dailyNutritionCol.findOne(filter);
    if (!daily) return res.json({ daily: null });

    return res.json({ daily });
  } catch (err) {
    console.error("getDailyNutrition error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ---------------------------
// Controller: postAddToDaily
// ---------------------------
export async function postAddToDaily(req, res) {
  try {
    const { userId: rawUserId, date, totals, mealId } = req.body;
    if (!rawUserId || !date || !totals) {
      return res.status(400).json({ error: "userId, date and totals are required" });
    }

    const userId = typeof rawUserId === "string" ? new ObjectId(rawUserId) : rawUserId;

    const inc = {};
    const safeNum = (v) => {
      const n = Number(v);
      return Number.isFinite(n) ? n : 0;
    };

    const cals = safeNum(totals.calories);
    const prot = safeNum(totals.protein);
    const carbs = safeNum(totals.carbs);
    const fats = safeNum(totals.fats);
    const fiber = safeNum(totals.fiber);
    const sugar = safeNum(totals.sugar);

    if (cals !== 0) inc.completedCalories = cals;
    if (prot !== 0) inc.completedProtein = prot;
    if (carbs !== 0) inc.completedCarbs = carbs;
    if (fats !== 0) inc.completedFats = fats;
    if (fiber !== 0) inc.completedFiber = fiber;
    if (sugar !== 0) inc.completedSugar = sugar;

    const filter = { userId, date };
    const update = {
      $setOnInsert: { userId, date, createdAt: new Date() },
      $set: { updatedAt: new Date() }
    };

    if (Object.keys(inc).length > 0) update.$inc = inc;

    if (mealId) {
      const mid = typeof mealId === "string" ? new ObjectId(mealId) : mealId;
      update.$addToSet = { mealIds: mid };
    }

    await dailyNutritionCol.updateOne(filter, update, { upsert: true });

    const daily = await dailyNutritionCol.findOne(filter);
    return res.json({ daily });
  } catch (err) {
    console.error("postAddToDaily error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ---------------------------
// Controller: logFoodText
// ---------------------------
export async function logFoodText(req, res) {
  try {
    const body = req.body || {};
    const text = body.text || body.input || "";
    const rawUserId = body.userId ?? null;
    const selectionMap = body.selectionMap || null;
    const persistFlag = typeof body.persist !== "undefined" ? body.persist : true;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Invalid input text" });
    }

    const userId = rawUserId ? (typeof rawUserId === "string" ? new ObjectId(rawUserId) : rawUserId) : null;

    let rawText;
    let llmError = null;
    let usedFallback = false;
    let preparationHint = null;

    if (!model) {
      usedFallback = true;
      const fallbackParsed = simpleParse(text);
      rawText = JSON.stringify(fallbackParsed);
      preparationHint = fallbackParsed.preparationHint ?? null;
      console.log("No LLM configured — using simpleParse fallback");
    } else {
      const prompt = `
You are a JSON-only extractor. Given the input text, return ONLY valid JSON that exactly matches this schema:

{
  "items": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "preparation": "home|outside|packaged"
    }
  ],
  "preparationHint": "home|outside|packaged"
}

Rules:
- Return a single JSON object with a top-level "items" array.
- Each item must include "name", "quantity" (a number), and "unit" (a non-empty string).
- "preparation" must always be a plain string: "home", "outside", or "packaged". Never null, never an object.
- If preparation is unknown, omit the field entirely (do not include it as null).
- If the unit is not explicitly stated, return a reasonable default like "piece" or "serving".
- Do NOT include any explanation, backticks, or extra fields.

Input: """${text}"""
`.trim();

      try {
        // ✅ FIX: count API calls and enforce session cap
        geminiCallCount++;
        console.log(`🔥 Gemini API call #${geminiCallCount} at ${new Date().toISOString()}`);

        if (geminiCallCount > GEMINI_CALL_LIMIT) {
          throw new Error("Local session quota cap reached — using fallback");
        }

        const llmResponse = await callWithRetry(
          () => model.generateContent(prompt),
          { retries: 1, timeoutMs: 5000 }
        );
        rawText = llmResponse?.response?.text?.() ?? String(llmResponse);
      } catch (err) {
        console.error("LLM failed, using fallback parser. Error:", err);
        llmError = {
          message: err.message || String(err),
          stack: err.stack ? String(err.stack).split("\n").slice(0, 6).join("\n") : undefined
        };
        const fallbackParsed = simpleParse(text);
        rawText = JSON.stringify(fallbackParsed);
        usedFallback = true;
        preparationHint = fallbackParsed.preparationHint ?? null;
      }
    }

    // Sanitize rawText
    if (typeof rawText === "string") {
      rawText = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();
      rawText = rawText.replace(/(^`+|`+$)/g, "");
    }

    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      parsed = simpleParse(text);
      usedFallback = true;
      llmError = llmError || {};
      llmError.parseError = e.message || String(e);
    }

    if (Array.isArray(parsed)) parsed = { items: parsed };
    if (!Array.isArray(parsed.items)) parsed.items = [];

    // ✅ FIX: normalize items — coerce preparation to string to fix validation error
    parsed.items = parsed.items.map(it => {
      const name = it?.name ? String(it.name).trim().toLowerCase() : "";
      const quantity = (typeof it?.quantity === "string" && it.quantity.trim() !== "")
        ? Number(String(it.quantity).replace(",", "."))
        : (typeof it?.quantity === "number" ? it.quantity : 1);
      const unit = normalizeUnit(it?.unit || "serving");
      // ✅ Always coerce preparation to string — this fixes the Ajv validation error
      let preparation = null;
      if (it?.preparation) {
        const prepStr = String(it.preparation).toLowerCase();
        if (prepStr.match(/home|outside|packaged/)) preparation = prepStr.match(/home|outside|packaged/)[0];
      }
      return { name, quantity: Number(quantity || 1), unit, preparation };
    });

    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      const fallback = simpleParse(text);
      parsed.items = fallback.items || [{ name: text.trim().toLowerCase(), quantity: 1, unit: "serving", preparation: fallback.preparationHint || null }];
      usedFallback = true;
    }

    if (!validateLLM(parsed)) {
      console.warn("Validation errors:", validateLLM.errors);
    }

    const mealItems = [];
    const responseCandidates = [];

    for (let itemIndex = 0; itemIndex < parsed.items.length; itemIndex++) {
      const item = parsed.items[itemIndex];

      let preferPrep = item.preparation || parsed.preparationHint || null;

      if (!preferPrep) {
        const lowerText = text.toLowerCase();
        if (/\b(home|house|ghar|ghar ka)\b/.test(lowerText)) preferPrep = "home";
        else if (/\b(restaurant|outside|dhaba|hotel|street|streetfood)\b/.test(lowerText)) preferPrep = "outside";
        else if (/\b(pack|packed|packaged|packet|tiffin|parcel)\b/.test(lowerText)) preferPrep = "packaged";
        else preferPrep = null;
      }

      const normalizedName = item.name || "";

      let forcedDoc = null;
      try {
        if (selectionMap && typeof selectionMap[itemIndex] === "string") {
          const cid = selectionMap[itemIndex];
          try {
            if (typeof cid === "string" && /^[0-9a-fA-F]{24}$/.test(cid)) {
              const docById = await nutritionItems.findOne({ _id: new ObjectId(cid) });
              if (docById) forcedDoc = docById;
            }
            if (!forcedDoc) {
              const byName = await nutritionItems.findOne({ displayName: new RegExp(`^${escapeRegex(String(cid))}$`, "i") });
              if (byName) forcedDoc = byName;
              else {
                const found = await findNutritionDocByName(String(cid), preferPrep);
                if (found?.doc) forcedDoc = found.doc;
              }
            }
          } catch (idErr) {
            console.warn("selectionMap id lookup failed for itemIndex", itemIndex, idErr?.message || idErr);
          }
        }
      } catch (selErr) {
        console.warn("selectionMap handling error:", selErr);
      }

      let foodDoc = null;
      let candidates = [];
      let related = [];
      let reason = null;

      if (forcedDoc) {
        foodDoc = forcedDoc;
      } else {
        const found = await findNutritionDocByName(normalizedName, preferPrep);
        foodDoc = found.doc;
        candidates = found.candidates || [];
        related = found.related || [];
        reason = found.reason || null;
      }

      if ((!foodDoc && candidates && candidates.length > 0) || (candidates && candidates.length > 1)) {
        responseCandidates.push({ input: item.name, itemIndex, candidates, reason, preferPrep });
      }

      if (!foodDoc) {
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

      if (Array.isArray(related) && related.length > 0) {
        const baseName = (foodDoc.displayName || "").trim().toLowerCase();
        const filteredVariants = related.filter(v => {
          if (!v) return false;
          if (String(v._id) === String(foodDoc._id)) return false;
          const vName = (v.displayName || "").trim().toLowerCase();
          if (vName === baseName) return false;
          return true;
        });

        if (filteredVariants.length > 0) {
          responseCandidates.push({
            input: item.name,
            itemIndex,
            candidates: filteredVariants,
            reason: "variants",
            preferPrep
          });
        }
      }

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

    const now = new Date();

    function sumOrZero(arr, key) {
      return arr.reduce((sum, i) => {
        const val = Number(i?.[key]);
        return sum + (isNaN(val) ? 0 : val);
      }, 0);
    }

    const meal = {
      userId: userId,
      rawInput: text,
      date: getLocalDateString(now),
      timestamp: now,
      items: mealItems,
      totalCalories: sumOrZero(mealItems, "calories"),
      totalProtein: sumOrZero(mealItems, "protein"),
      totalCarbs: sumOrZero(mealItems, "carbs"),
      totalFats: sumOrZero(mealItems, "fats"),
      totalFiber: sumOrZero(mealItems, "fiber"),
      totalSugar: sumOrZero(mealItems, "sugar"),
      meta: { source: "text", llm: !!model, llmError: llmError || null, usedFallback },
      createdAt: now
    };

    const shouldPersist = persistFlag !== false;

    if (!shouldPersist) {
      const response = { meal };
      if (responseCandidates.length > 0) response.candidates = responseCandidates;
      return res.json(response);
    }

    try {
      const insertResult = await mealsCol.insertOne(meal);
      meal._id = insertResult.insertedId;
    } catch (dbErr) {
      console.error("Failed to save meal:", dbErr);
    }

    try {
      if (userId) {
        const dnFilter = { userId, date: meal.date };
        const incObj = {
          completedCalories: Number.isFinite(meal.totalCalories) ? meal.totalCalories : 0,
          completedProtein: Number.isFinite(meal.totalProtein) ? meal.totalProtein : 0,
          completedCarbs: Number.isFinite(meal.totalCarbs) ? meal.totalCarbs : 0,
          completedFats: Number.isFinite(meal.totalFats) ? meal.totalFats : 0,
          completedFiber: Number.isFinite(meal.totalFiber) ? meal.totalFiber : 0,
          completedSugar: Number.isFinite(meal.totalSugar) ? meal.totalSugar : 0
        };

        const dnUpdate = {
          $setOnInsert: { userId, date: meal.date, createdAt: new Date() },
          $set: { updatedAt: new Date() }
        };

        if (Object.keys(incObj).length > 0) dnUpdate.$inc = incObj;
        if (meal._id) dnUpdate.$addToSet = { mealIds: meal._id };

        await dailyNutritionCol.updateOne(dnFilter, dnUpdate, { upsert: true });
      } else {
        console.warn("logFoodText called with persist but no userId — daily nutrition NOT updated.");
      }
    } catch (dnErr) {
      console.error("Failed to upsert daily_nutrition:", dnErr);
    }

    try {
      for (const it of mealItems.filter(i => i.isEstimated)) {
        const normalizedName = it.dishName;
        const now2 = new Date();
        await estimatedCol.updateOne(
          { normalizedName },
          {
            $setOnInsert: { normalizedName, firstSeenAt: now2, status: "new" },
            $inc: { count: 1 },
            $set: { lastSeenAt: now2 },
            $addToSet: { examples: it.userInputName }
          },
          { upsert: true }
        );
      }
    } catch (estErr) {
      console.error("Failed to upsert estimated foods:", estErr);
    }

    const response = { meal };
    if (responseCandidates.length > 0) response.candidates = responseCandidates;

    return res.json(response);
  } catch (err) {
    console.error("logFoodText unexpected error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
