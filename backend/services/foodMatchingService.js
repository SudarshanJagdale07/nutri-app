// backend/services/foodMatchingService.js
import { ObjectId } from "mongodb";
import { nutritionItems } from "../config/db.js";
import { SYNONYMS } from "../constants/units.js";
import { escapeRegex, normalizeText } from "../utils/textUtils.js";

// ---------------------------
// Small helper: choose best candidate from array given normalized input
// returns index of best candidate
// Simple scoring: exact displayName match > alias match > displayName contains token
// ---------------------------
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
    // small boost for having per-100g calories (prefer well-formed docs)
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
// Helper: choose best candidate by preparation preference
// - if any candidate has preparationType matching prefer, pick it
// - else, fallback ordering: home -> outside -> packaged -> any
// - returns index inside candidates array
// ---------------------------
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
  // last resort: scoreCandidates
  return scoreCandidates(candidates, "");
}

// ---------------------------
// Helper: dedupe candidate objects by displayName and map to the canonical response shape
// - limit param restricts number of returned candidates (default 3)
// ---------------------------
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

// ---------------------------
// Helper: find related variants for a matched doc (excluding docId)
// - e.g., roti matched exact, but return tandoori roti, butter roti if present
// - returns array of candidate-like objects limited to `limit`
// - deduplicates by displayName to avoid duplicates across preparationType variants
// ---------------------------
export async function findRelatedVariants(baseName, excludeId = null, limit = 5, preferPrep = null) {
  try {
    const nameToken = normalizeText(baseName).split(/\s+/)[0] || baseName;
    const orClauses = [
      { displayName: new RegExp(escapeRegex(nameToken), "i") },
      { searchTerms: { $in: [nameToken] } },
      { aliases: { $in: [nameToken] } }
    ];
    const filter = { $and: [{ $or: orClauses }] };
    if (excludeId) filter._id = { $ne: typeof excludeId === "string" ? new ObjectId(excludeId) : excludeId };
    const variants = await nutritionItems.find(filter).limit(limit * 3).toArray(); // fetch more to dedupe displayName
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
// Helper: try to find a nutrition item with robust matching
// - exact displayName (case-insensitive)
// - aliases / searchTerms arrays
// - synonyms map
// - tokenized partial match
// - $text fallback (returns candidates array)
// Returns: { doc, candidates, reason }
// Accepts optional preparationHint to prefer a certain preparationType in results.
// Ensures candidate lists are deduplicated (by displayName) and limited (max 3).
// ---------------------------
export async function findNutritionDocByName(name, preparationHint = null) {
  if (!name) return { doc: null, candidates: [], reason: "empty" };
  const normalizedName = normalizeText(name);

  // Build base queries that match displayName or arrays properly
  // 1) Exact displayName or alias/searchTerms (normalized)
  try {
    const clauses = [
      { displayName: new RegExp(`^${escapeRegex(normalizedName)}$`, "i") },
      { aliases: { $in: [normalizedName] } },
      { searchTerms: { $in: [normalizedName] } }
    ];

    // If we have a preparation hint, try to prefer docs that match preparationType
    if (preparationHint) {
      const withPrep = await nutritionItems.findOne({ $and: [{ $or: clauses }, { preparationType: { $regex: `^${escapeRegex(preparationHint)}$`, $options: "i" } }] });
      if (withPrep) {
        // Also fetch related variants excluding this _id
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

  // 2) Try synonyms map (if user typed a known synonym)
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

  // 3) Tokenized partial match: try each token against displayName, aliases, searchTerms
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
      // If preparation hint available, prefer those results
      if (preparationHint) {
        const partialWithPrep = await nutritionItems.find({ $and: [{ $or: orClauses }, { preparationType: { $regex: `^${escapeRegex(preparationHint)}$`, $options: "i" } }] }).limit(20).toArray();
        if (partialWithPrep && partialWithPrep.length === 1) {
          const related = await findRelatedVariants(normalizedName, partialWithPrep[0]._id, 5, preparationHint);
          return { doc: partialWithPrep[0], candidates: dedupeAndShapeCandidates(partialWithPrep, 3), related, reason: "partial_single_with_prep" };
        }
        if (partialWithPrep && partialWithPrep.length > 1) {
          // dedupe by displayName and limit
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
        // dedupe displayName, limit to 3
        const deduped = dedupeAndShapeCandidates(partial, 3);
        return { doc: null, candidates: deduped, reason: "partial_multi" };
      }
    } catch (e) {
      console.warn("Partial token search failed:", e?.message || e);
    }
  }

  // 4) $text fallback (requires text index on displayName, aliases, searchTerms)
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
      // dedupe displayName and limit to 3
      const deduped = dedupeAndShapeCandidates(textResults, 3);
      return { doc: null, candidates: dedupeAndShapeCandidates(textResults, 3), reason: "text_multi" };
    }
  } catch (e) {
    // If $text index not present or query fails, ignore and continue
    console.warn("Text search failed or index missing:", e?.message || e);
  }

  // 5) Last resort: regex anywhere in displayName
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

  // No match found
  return { doc: null, candidates: [], reason: "none" };
}
