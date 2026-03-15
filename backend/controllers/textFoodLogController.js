// backend/controllers/nutritionController.js
import { ObjectId } from "mongodb";
import { model, validateLLM, callWithRetry } from "../services/llmService.js";

// Import database collections
import { nutritionItems } from "../config/db.js";

// Import constants
import { UNIT_GRAMS_MAP } from "../constants/units.js";
// Import utilities
import { normalizeUnit, escapeRegex } from "../utils/textUtils.js";

// Import parser
import { simpleParse } from "../parsers/foodTextParser.js";

// Import food matching service
import { 
  pickCandidateByPreparation, 
  dedupeAndShapeCandidates, 
  findNutritionDocByName 
} from "../services/foodMatchingService.js";

// Import nutrition calculation service
import { computeTotalsFromItems, calculateGrams, calculateMacros, sumOrZero } from "../services/nutritionCalculationService.js";

// Import date utility
import { getLocalDateString } from "../utils/dateUtils.js";

// Import meal persistence service
import { saveMeal, updateDailyNutrition, trackEstimatedFoods } from "../services/mealPersistenceService.js";







// ---------------------------
// Controller: analyzeTextMeal
// - Uses LLM when available; otherwise uses simpleParse fallback
// - Ensures parsed.items is always an array of { name, quantity, unit, preparation }
// - Uses robust matching (findNutritionDocByName) to map items to nutrition DB
// - Returns meal and, when appropriate, candidate list for client-side Fuse.js ranking
// - Does NOT persist anything to DB (analysis only)
// ---------------------------
export async function analyzeTextMeal(req, res) {
  try {
    // Support both body forms: { text, userId } OR payload-style from frontend wrapper
    const body = req.body || {};
    const text = body.text || body.input || "";
    const rawUserId = body.userId ?? null;
    // IMPORTANT: new addition — allow frontend to pass a selection map when user selected suggestions
    // selectionMap should be an object { "<itemIndex>": "<candidateIdOrName>" }
    const selectionMap = body.selectionMap || null;

    if (!text || typeof text !== "string" || text.trim().length === 0) {
      return res.status(400).json({ error: "Invalid input text" });
    }

    const userId = rawUserId ? (typeof rawUserId === "string" ? new ObjectId(rawUserId) : rawUserId) : null;

    // If no LLM key available, skip LLM entirely and use fallback parser
    let rawText;
    let llmError = null;
    let usedFallback = false;
    let preparationHint = null;

    if (!model) {
      // No LLM configured — use deterministic fallback
      usedFallback = true;
      const fallbackParsed = simpleParse(text);
      rawText = JSON.stringify(fallbackParsed);
      preparationHint = fallbackParsed.preparationHint ?? null;
      console.log("No LLM configured — using simpleParse fallback:", rawText);
    } else {
      // LLM available — ask for JSON with preparation hint per item
      const prompt = `
You are a JSON-only extractor. Given the input text, return ONLY valid JSON that exactly matches this schema:

{
  "items": [
    {
      "name": "string",
      "quantity": number,
      "unit": "string",
      "preparation": "home|outside|packaged",  // optional, prefer one of these if user indicates
      "estimatedGrams": number  // optional, best estimate of total grams for the given quantity (e.g. 3 dosa = 180, 1 bowl dal = 150)
    }
  ],
  "preparationHint": "home|outside|packaged" // optional global hint if the user mentioned home/outside/pack
}

Rules:
- Return a single JSON object with a top-level "items" array.
- Each item must include "name", "quantity" (a number), and "unit" (a non-empty string).
- If the unit is not explicitly stated, return a reasonable default like "piece" or "serving".
- If the user explicitly states a weight unit (g, gram, grams, kg, ml), preserve it exactly as the unit — never convert to piece or serving.
- Where possible, detect the user's intent about where the food came from (home / outside / packaged) and return it as either item.preparation or top-level preparationHint. Common shorthand: "out" or "outside" or "restaurant" or "dhaba" = outside; "home" or "ghar" = home; "packed" or "packet" = packaged.
- For estimatedGrams: estimate the total weight in grams for the quantity given (e.g. "3 dosa" → 180, "1 bowl dal" → 150, "200g rice" → 200). Always provide a positive number.
- Do NOT include any explanation, backticks, or extra fields.

Input: """${text}"""
`.trim();

      // Use the model safely — if it fails, fallback
      if (model) {
        try {
          // Try LLM with retry wrapper
          const llmResponse = await callWithRetry(
            () => model.generateContent(prompt),
            { retries: 2, timeoutMs: 5000 }
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
      } else {
        // defensive; should not reach here because we check model earlier
        const fallbackParsed = simpleParse(text);
        rawText = JSON.stringify(fallbackParsed);
        usedFallback = true;
        preparationHint = fallbackParsed.preparationHint ?? null;
      }
    }

    // Sanitize rawText: remove markdown fences if any
    if (typeof rawText === "string") {
      rawText = rawText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();
      rawText = rawText.replace(/(^`+|`+$)/g, "");
    }

    // Parse and ensure structure
    let parsed;
    try {
      parsed = JSON.parse(rawText);
    } catch (e) {
      // Fallback to simpleParse
      parsed = simpleParse(text);
      usedFallback = true;
      llmError = llmError || {};
      llmError.parseError = e.message || String(e);
    }

    if (Array.isArray(parsed)) parsed = { items: parsed };

    if (!Array.isArray(parsed.items)) parsed.items = [];

    // Normalize items (coerce quantity and unit, keep preparation if provided)
    parsed.items = parsed.items.map(it => {
      const name = it?.name ? String(it.name).trim().toLowerCase() : "";
      const quantity = (typeof it?.quantity === "string" && it.quantity.trim() !== "")
        ? Number(String(it.quantity).replace(",", "."))
        : (typeof it?.quantity === "number" ? it.quantity : 1);
      const unit = normalizeUnit(it?.unit || "serving");
      const preparation = (it?.preparation && (String(it.preparation).toLowerCase().match(/home|outside|packaged/))) ? String(it.preparation).toLowerCase() : null;
      const estimatedGrams = (typeof it?.estimatedGrams === "number" && it.estimatedGrams > 0) ? it.estimatedGrams : null;
      return { name, quantity: Number(quantity || 1), unit, preparation, estimatedGrams };
    });

    // If parsed.items is empty after all attempts, create fallback item
    if (!Array.isArray(parsed.items) || parsed.items.length === 0) {
      const fallback = simpleParse(text);
      parsed.items = fallback.items || [{ name: text.trim().toLowerCase(), quantity: 1, unit: "serving", preparation: fallback.preparationHint || null }];
      usedFallback = true;
    }

    // Validate against Ajv (log warning but continue)
    if (!validateLLM(parsed)) {
      console.warn("Validation errors:", validateLLM.errors);
    }

    // Build meal items by matching DB
    const mealItems = [];
    const responseCandidates = [];

    // iterate with explicit index so we can include itemIndex in candidate groups
    for (let itemIndex = 0; itemIndex < parsed.items.length; itemIndex++) {
      const item = parsed.items[itemIndex];

      // Determine a preparation preference: item.preparation > top-level LLM hint > fallback detection from free text
      let preferPrep = item.preparation || parsed.preparationHint || null;

      // If still null, quick keyword detection in original text around the item
      if (!preferPrep) {
        const lowerText = text.toLowerCase();
        if (/\b(home|house|ghar|ghar ka)\b/.test(lowerText)) preferPrep = "home";
        else if (/\b(restaurant|outside|dhaba|hotel|out|street|streetfood)\b/.test(lowerText)) preferPrep = "outside";
        else if (/\b(pack|packed|packaged|packet|tiffin|parcel)\b/.test(lowerText)) preferPrep = "packaged";
        else preferPrep = "home";
      }

      const normalizedName = item.name || "";

      // If frontend passed a selectionMap for this itemIndex, prefer that specific candidate by _id or name
      let forcedDoc = null;
      try {
        if (selectionMap && typeof selectionMap[itemIndex] === "string") {
          const cid = selectionMap[itemIndex];
          try {
            // If looks like ObjectId (24 hex chars) try by _id first
            if (typeof cid === "string" && /^[0-9a-fA-F]{24}$/.test(cid)) {
              const docById = await nutritionItems.findOne({ _id: new ObjectId(cid) });
              if (docById) {
                forcedDoc = docById;
              }
            }
            // If not found by _id or not an id, try matching by displayName or tokenized name
            if (!forcedDoc) {
              // Try exact displayName (case-insensitive)
              const byName = await nutritionItems.findOne({ displayName: new RegExp(`^${escapeRegex(String(cid))}$`, "i") });
              if (byName) forcedDoc = byName;
              else {
                // fallback to robust name lookup
                const found = await findNutritionDocByName(String(cid), preferPrep);
                if (found?.doc) forcedDoc = found.doc;
              }
            }
          } catch (idErr) {
            // invalid id or not found — ignore and fall through to normal matching
            console.warn("selectionMap id lookup failed for itemIndex", itemIndex, idErr?.message || idErr);
          }
        }
      } catch (selErr) {
        console.warn("selectionMap handling error:", selErr);
      }

      // Use robust matching helper with preparation hint (unless forcedDoc is present)
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

      // If item not found (but candidates exist), return candidate group (but do not persist)
      if ((!foodDoc && candidates && candidates.length > 0) || (candidates && candidates.length > 1)) {
        // attach itemIndex so frontend updates the correct parsed item when a suggestion is selected
        responseCandidates.push({ input: item.name, itemIndex, candidates, reason, preferPrep });
      }

      if (!foodDoc && candidates && candidates.length === 1) {
        const bestCandidate = candidates[0];
        if (bestCandidate?._id) {
          try {
            const fullDoc = await nutritionItems.findOne({ _id: bestCandidate._id });
            if (fullDoc) foodDoc = fullDoc;
          } catch (_) {}
        }
      }

      if (!foodDoc) {
        // Unknown food: ask LLM to estimate nutrition for this item
        let llmCalories = null, llmProtein = null, llmCarbs = null, llmFat = null, llmFiber = null, llmSugar = null, llmGrams = null;
        if (model) {
          try {
            const isPieceUnit = item.unit === "piece" || item.unit === "serving";
            const nutritionPrompt = isPieceUnit
              ? `You are a nutrition expert. Return ONLY valid JSON with estimated nutrition values PER 1 PIECE/SERVING for the food below. No explanation, no markdown.

Food: "${item.name}"
Preparation: ${preferPrep || "home"}

Return exactly this JSON shape (values must be per 1 piece/serving):
{
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number,
  "grams": number
}`.trim()
              : `You are a nutrition expert. Return ONLY valid JSON with estimated nutrition values PER 100G for the food below. No explanation, no markdown.

Food: "${item.name}"
Preparation: ${preferPrep || "home"}

Return exactly this JSON shape (values must be per 100g):
{
  "calories": number,
  "protein": number,
  "carbs": number,
  "fat": number,
  "fiber": number,
  "sugar": number
}`.trim();
            const llmNutritionResponse = await callWithRetry(
              () => model.generateContent(nutritionPrompt),
              { retries: 1, timeoutMs: 5000 }
            );
            let llmNutritionRaw = llmNutritionResponse?.response?.text?.() ?? "";
            llmNutritionRaw = llmNutritionRaw.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();
            const llmNutritionParsed = JSON.parse(llmNutritionRaw);
            const perCalories = Number(llmNutritionParsed.calories) || 0;
            const perProtein  = Number(llmNutritionParsed.protein)  || 0;
            const perCarbs    = Number(llmNutritionParsed.carbs)    || 0;
            const perFat      = Number(llmNutritionParsed.fat)      || 0;
            const perFiber    = Number(llmNutritionParsed.fiber)    || 0;
            const perSugar    = Number(llmNutritionParsed.sugar)    || 0;
            if (isPieceUnit) {
              // piece-based: multiply per-piece values by quantity
              llmGrams    = Number(llmNutritionParsed.grams) || null;
              llmCalories = perCalories * item.quantity;
              llmProtein  = perProtein  * item.quantity;
              llmCarbs    = perCarbs    * item.quantity;
              llmFat      = perFat      * item.quantity;
              llmFiber    = perFiber    * item.quantity;
              llmSugar    = perSugar    * item.quantity;
            } else {
              // weight-based: LLM gave per-100g, derive grams from unit then scale
              const unitGrams = UNIT_GRAMS_MAP[item.unit] || 100;
              llmGrams    = item.quantity * unitGrams;
              const multiplier = llmGrams / 100;
              llmCalories = perCalories * multiplier;
              llmProtein  = perProtein  * multiplier;
              llmCarbs    = perCarbs    * multiplier;
              llmFat      = perFat      * multiplier;
              llmFiber    = perFiber    * multiplier;
              llmSugar    = perSugar    * multiplier;
            }
          } catch (nutritionErr) {
            console.warn("LLM nutrition estimation failed for:", item.name, nutritionErr?.message || nutritionErr);
          }
        }
        mealItems.push({
          userInputName: item.name,
          dishName: item.name,
          foodId: null,
          quantity: item.quantity,
          unit: item.unit,
          grams: llmGrams,
          calories: llmCalories,
          protein: llmProtein,
          carbs: llmCarbs,
          fats: llmFat,
          fiber: llmFiber,
          sugar: llmSugar,
          isEstimated: true,
          preparation: preferPrep
        });
        continue;
      }

      // If we have exact doc, but also related variants (e.g., paneer tikka), expose ONLY different dish names
      if (Array.isArray(related) && related.length > 0) {

        const baseName = (foodDoc.displayName || "").trim().toLowerCase();

        const filteredVariants = related.filter(v => {
          if (!v) return false;

          // remove same _id
          if (String(v._id) === String(foodDoc._id)) return false;

          const vName = (v.displayName || "").trim().toLowerCase();

          // 🚨 remove exact same dish name (paneer should not appear again)
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

      // Compute grams using best information available (unit / gramsPerUnit / perQuantity / fallback)
      const unit = item.unit;
      const grams = calculateGrams(item.quantity, unit, foodDoc, item.estimatedGrams);

      // Compute macros - check if piece-based or weight-based
      const { calories, protein, carbs, fat, fiber, sugar } = calculateMacros(item.quantity, unit, grams, foodDoc);


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
    } // end for parsed.items

    // Build meal object
    const now = new Date();
    const { items: _, ...mealTotals } = { items: mealItems, ...computeTotalsFromItems(mealItems) };

    const meal = {
      userId: userId,
      rawInput: text,
      date: getLocalDateString(now),
      timestamp: now,
      createdAt: now,
      items: mealItems,
      totalCalories: sumOrZero(mealItems, "calories"),
      totalProtein: sumOrZero(mealItems, "protein"),
      totalCarbs: sumOrZero(mealItems, "carbs"),
      totalFats: sumOrZero(mealItems, "fats"),
      totalFiber: sumOrZero(mealItems, "fiber"),
      totalSugar: sumOrZero(mealItems, "sugar"),
      meta: { source: "text", llm: !!model, llmError: llmError || null, usedFallback },
    };

    // RETURN READ-ONLY ANALYSIS: DO NOT INSERT MEAL OR UPDATE DAILY TOTALS
    const response = { meal };
    if (responseCandidates.length > 0) response.candidates = responseCandidates;
    // convert numbers to raw floats (frontend will format to 2 decimals)
    return res.json(response);
  } catch (err) {
    console.error("analyzeTextMeal unexpected error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ---------------------------
// Controller: saveTextMeal
// - Accepts a pre-computed meal object from the frontend (no re-parsing)
// - Inserts meal into meals collection and upserts daily_nutrition
// - Upserts unknown foods into llm_estimated_foods
// ---------------------------
export async function saveTextMeal(req, res) {
  try {
    const body = req.body || {};
    const meal = body.meal ?? null;
    const rawUserId = body.userId ?? null;

    if (!meal || !Array.isArray(meal.items)) {
      return res.status(400).json({ error: "Invalid meal object" });
    }

    const userId = rawUserId ? (typeof rawUserId === "string" ? new ObjectId(rawUserId) : rawUserId) : null;
    meal.userId = userId;

    // Restore Date objects lost during JSON serialization
    if (meal.createdAt) meal.createdAt = new Date(meal.createdAt);
    if (meal.timestamp) meal.timestamp = new Date(meal.timestamp);
    // Use the date sent by the frontend (browser local timezone) so history page filters correctly
    if (!meal.date) meal.date = getLocalDateString(meal.createdAt || new Date());

    // Persist meal to DB
    try {
      await saveMeal(meal, userId);
    } catch (dbErr) {
      console.error("Failed to save meal:", dbErr);
    }

    // Upsert into daily_nutrition (canonical per-user/day totals)
    try {
      await updateDailyNutrition(userId, meal.date, meal, meal._id);
    } catch (dnErr) {
      console.error("Failed to upsert daily_nutrition:", dnErr);
    }

    // Upsert unknown foods into llm_estimated_foods
    try {
      await trackEstimatedFoods(meal.items);
    } catch (estErr) {
      console.error("Failed to upsert estimated foods:", estErr);
    }

    return res.json({ meal });
  } catch (err) {
    console.error("saveTextMeal unexpected error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}


