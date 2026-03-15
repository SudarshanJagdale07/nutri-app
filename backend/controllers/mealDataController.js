// backend/controllers/mealDataController.js
import { ObjectId } from "mongodb";

// Import database collections
import { nutritionItems, mealsCol, dailyNutritionCol } from "../config/db.js";

// Import utilities
import { escapeRegex, normalizeText } from "../utils/textUtils.js";

// Import food matching service
import {
  pickCandidateByPreparation,
  dedupeAndShapeCandidates,
  findNutritionDocByName
} from "../services/foodMatchingService.js";

// ---------------------------
// Controller: getFood
// - Uses findNutritionDocByName for robust matching
// - Returns a single best doc when possible; if multiple candidates exist,
//   chooses a best candidate and returns it as `doc` and includes `candidates` array.
// - Preserves user's typed label if it matches an alias (so typing "chapati" shows "chapati")
// - Accepts optional query param 'preparation' to prefer home/outside/packaged
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

      // Ensure consistent shape for frontend (include perQuantity / gramsPerUnit)
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

      // provide related variants (exclude the exact doc)
      const variants = Array.isArray(related) ? related.filter(v => String(v._id) !== String(returnedDoc._id)) : [];

      // dedupe variants by displayName and limit to 3
      const dedupVariants = dedupeAndShapeCandidates(variants, 3);

      return res.json({ ...shaped, variants: dedupVariants });
    }

    // If multiple candidates exist, return best candidate along with candidates list
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

      // dedupe candidates by displayName and limit to 3 for response
      const deduped = dedupeAndShapeCandidates(candidates, 3);

      // Return chosen doc plus deduped candidates array
      return res.json({ ...shapedBest, candidates: deduped });
    }

    // Not found -> return a preview object (do not return 404 so frontend can preview)
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

    // Build inc object safely (avoid NaN)
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

/**
 * POST /api/daily/add
 * Body: {
 *   userId: "<ObjectId string>",
 *   date: "YYYY-MM-DD",
 *   totals: { calories, protein, carbs, fats, fiber, sugar },
 *   mealId: "<meal ObjectId string>" (optional)
 * }
 *
 * Upserts a document for (userId, date) and increments totals.
 * Also records mealIds array to avoid double-counting if needed.
 */
export async function addToDaily(req, res) {
  try {
    const { userId, date, totals = {}, mealId = null } = req.body;
    if (!userId || !date) {
      return res.status(400).json({ error: "userId and date are required" });
    }

    const uid = typeof userId === "string" ? new ObjectId(userId) : userId;
    const filter = { userId: uid, date };

    // Build $inc object only for numeric fields present
    const inc = {};
    if (typeof totals.calories === "number") inc.completedCalories = totals.calories;
    if (typeof totals.protein === "number") inc.completedProtein = totals.protein;
    if (typeof totals.carbs === "number") inc.completedCarbs = totals.carbs;
    if (typeof totals.fats === "number") inc.completedFats = totals.fats;
    if (typeof totals.fiber === "number") inc.completedFiber = totals.fiber;
    if (typeof totals.sugar === "number") inc.completedSugar = totals.sugar;

    const update = {
      $inc: inc,
      $setOnInsert: { userId: uid, date, createdAt: new Date() },
      $set: { updatedAt: new Date() }
    };

    // If mealId provided, add to mealIds array (prevent duplicates by $addToSet)
    if (mealId) {
      update.$addToSet = { mealIds: typeof mealId === "string" ? new ObjectId(mealId) : mealId };
    }

    const result = await dailyNutritionCol.updateOne(filter, update, { upsert: true });

    // Return the upserted/updated document
    const doc = await dailyNutritionCol.findOne(filter);
    return res.json({ success: true, daily: doc });
  } catch (err) {
    console.error("addToDaily error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}
