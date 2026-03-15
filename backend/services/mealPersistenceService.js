// backend/services/mealPersistenceService.js

import { ObjectId } from "mongodb";
import { mealsCol, dailyNutritionCol, estimatedCol } from "../config/db.js";

// ---------------------------
// Save meal to database
// ---------------------------
export async function saveMeal(meal, userId) {
  // Persist meal to DB
  try {
    const insertResult = await mealsCol.insertOne(meal);
    meal._id = insertResult.insertedId;
    return meal;
  } catch (dbErr) {
    console.error("Failed to save meal:", dbErr);
    throw dbErr;
  }
}

// ---------------------------
// Update daily nutrition totals
// ---------------------------
export async function updateDailyNutrition(userId, date, totals, mealId = null) {
  // Upsert into daily_nutrition (canonical per-user/day totals)
  try {
    if (userId) {
      const dnFilter = { userId, date };
      const incObj = {
        completedCalories: Number.isFinite(totals.totalCalories) ? totals.totalCalories : 0,
        completedProtein: Number.isFinite(totals.totalProtein) ? totals.totalProtein : 0,
        completedCarbs: Number.isFinite(totals.totalCarbs) ? totals.totalCarbs : 0,
        completedFats: Number.isFinite(totals.totalFats) ? totals.totalFats : 0,
        completedFiber: Number.isFinite(totals.totalFiber) ? totals.totalFiber : 0,
        completedSugar: Number.isFinite(totals.totalSugar) ? totals.totalSugar : 0
      };

      const dnUpdate = {
        $setOnInsert: { userId, date, createdAt: new Date() },
        $set: { updatedAt: new Date() }
      };

      if (Object.keys(incObj).length > 0) dnUpdate.$inc = incObj;

      if (mealId) dnUpdate.$addToSet = { mealIds: mealId };

      await dailyNutritionCol.updateOne(dnFilter, dnUpdate, { upsert: true });
    } else {
      // Defensive log: we expected a userId for a persistent add
      console.warn("updateDailyNutrition called but no userId — daily nutrition NOT updated.");
    }
  } catch (dnErr) {
    console.error("Failed to upsert daily_nutrition:", dnErr);
    throw dnErr;
  }
}

// ---------------------------
// Track estimated foods
// ---------------------------
export async function trackEstimatedFoods(items) {
  // Upsert unknown foods into llm_estimated_foods
  try {
    for (const it of items.filter(i => i.isEstimated)) {
      const normalizedName = it.dishName;
      const now2 = new Date();
      const qty = Number(it.quantity) || 1;
      const isPieceUnit = it.unit === "piece" || it.unit === "serving";
      const gramsForUnit = Number(it.grams) || null;
      let perUnitCalories = null, perUnitProtein = null, perUnitCarbs = null, perUnitFats = null, perUnitFiber = null, perUnitSugar = null;
      if (isPieceUnit && qty > 0) {
        perUnitCalories = (Number(it.calories) || 0) / qty;
        perUnitProtein  = (Number(it.protein)  || 0) / qty;
        perUnitCarbs    = (Number(it.carbs)    || 0) / qty;
        perUnitFats     = (Number(it.fats)     || 0) / qty;
        perUnitFiber    = (Number(it.fiber)    || 0) / qty;
        perUnitSugar    = (Number(it.sugar)    || 0) / qty;
      } else if (!isPieceUnit && gramsForUnit && gramsForUnit > 0) {
        const multiplier = gramsForUnit / 100;
        perUnitCalories = multiplier > 0 ? (Number(it.calories) || 0) / multiplier : null;
        perUnitProtein  = multiplier > 0 ? (Number(it.protein)  || 0) / multiplier : null;
        perUnitCarbs    = multiplier > 0 ? (Number(it.carbs)    || 0) / multiplier : null;
        perUnitFats     = multiplier > 0 ? (Number(it.fats)     || 0) / multiplier : null;
        perUnitFiber    = multiplier > 0 ? (Number(it.fiber)    || 0) / multiplier : null;
        perUnitSugar    = multiplier > 0 ? (Number(it.sugar)    || 0) / multiplier : null;
      }
      await estimatedCol.updateOne(
        { normalizedName },
        {
          $setOnInsert: { normalizedName, firstSeenAt: now2, status: "new" },
          $inc: { count: 1 },
          $set: {
            lastSeenAt: now2,
            unit: it.unit,
            preparation: it.preparation ?? null,
            perUnitCalories,
            perUnitProtein,
            perUnitCarbs,
            perUnitFats,
            perUnitFiber,
            perUnitSugar,
            perUnitBasis: isPieceUnit ? "per_piece" : "per_100g"
          },
          $addToSet: { examples: it.userInputName }
        },
        { upsert: true }
      );
    }
  } catch (estErr) {
    console.error("Failed to upsert estimated foods:", estErr);
    throw estErr;
  }
}
