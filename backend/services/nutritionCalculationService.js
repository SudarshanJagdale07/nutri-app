// backend/services/nutritionCalculationService.js

import { UNIT_GRAMS_MAP } from "../constants/units.js";

// ---------------------------
// Helper: compute totals from items array
// ---------------------------
export function computeTotalsFromItems(items = []) {
  return items.reduce((acc, it) => {
    const q = Number(it.quantity || 1);
    acc.calories += (Number(it.calories) || 0) * q;
    acc.protein += (Number(it.protein) || 0) * q;
    acc.carbs += (Number(it.carbs) || 0) * q;
    acc.fats += (Number(it.fats) || 0) * q;
    acc.fiber += (Number(it.fiber) || 0) * q;
    acc.sugar += (Number(it.sugar) || 0) * q;
    return acc;
  }, { calories: 0, protein: 0, carbs: 0, fats: 0, fiber: 0, sugar: 0 });
}

// ---------------------------
// Helper: sum a numeric field across an array, treating NaN as 0
// ---------------------------
export function sumOrZero(arr, key) {
  return arr.reduce((sum, i) => {
    const val = Number(i?.[key]);
    return sum + (isNaN(val) ? 0 : val);
  }, 0);
}

// ---------------------------
// Calculate grams from quantity and unit
// ---------------------------
export function calculateGrams(quantity, unit, foodDoc, estimatedGrams = null) {
  let grams = 0;

  if (unit === "g" || unit === "ml") {
    grams = quantity;
  } else if (unit === "kg") {
    grams = quantity * 1000;
  } else if (unit === "piece" || unit === "serving") {
    const gramPerPiece = parseFloat(foodDoc.gramPerPiece) || parseFloat(foodDoc.gramsPerUnit) || null;
    if (gramPerPiece) {
      grams = quantity * gramPerPiece;
    } else if (estimatedGrams && estimatedGrams > 0) {
      grams = estimatedGrams;
    } else if (UNIT_GRAMS_MAP[unit]) {
      grams = quantity * UNIT_GRAMS_MAP[unit];
    } else {
      grams = quantity * 100;
    }
  } else if (UNIT_GRAMS_MAP[unit]) {
    grams = quantity * UNIT_GRAMS_MAP[unit];
  } else if (foodDoc.gramsPerUnit) {
    grams = quantity * foodDoc.gramsPerUnit;
  } else if (estimatedGrams && estimatedGrams > 0) {
    grams = estimatedGrams;
  } else {
    grams = quantity * 100;
  }

  return grams;
}

// ---------------------------
// Calculate macros based on piece vs weight
// ---------------------------
export function calculateMacros(quantity, unit, grams, foodDoc) {
  // isPiece is driven only by the unit the user gave, never by perQuantity
  const isPiece = unit === "piece" || unit === "serving";
  // isWeightInput is true when user explicitly gave a weight unit
  const isWeightInput = unit === "g" || unit === "ml" || unit === "kg";
  // docIsPieceBased: the DB doc stores values per-piece (perQuantity === 1 and unit === "piece")
  const docIsPieceBased = foodDoc.perQuantity === 1 && (String(foodDoc.unit || "").toLowerCase() === "piece");

  let calories, protein, carbs, fat, fiber, sugar;

  if (isPiece) {
    // Piece-based: stored values are per-piece, just multiply by quantity
    calories = (foodDoc.caloriesPer100g ?? foodDoc.calories_kcal ?? 0) * quantity;
    protein = (foodDoc.proteinPer100g ?? foodDoc.protein_g ?? 0) * quantity;
    carbs = (foodDoc.carbsPer100g ?? foodDoc.carbs_g ?? 0) * quantity;
    fat = (foodDoc.fatPer100g ?? foodDoc.fat_g ?? 0) * quantity;
    fiber = (foodDoc.fiberPer100g ?? foodDoc.fiber_g ?? 0) * quantity;
    sugar = (foodDoc.sugarPer100g ?? foodDoc.sugar_g ?? 0) * quantity;
  } else if (isWeightInput && docIsPieceBased) {
    // User gave grams but food is stored per-piece: convert grams -> pieces using gramPerPiece
    const gramPerPiece = parseFloat(foodDoc.gramPerPiece) || parseFloat(foodDoc.gramsPerUnit) || 100;
    const pieces = grams / gramPerPiece;
    calories = (foodDoc.caloriesPer100g ?? foodDoc.calories_kcal ?? 0) * pieces;
    protein = (foodDoc.proteinPer100g ?? foodDoc.protein_g ?? 0) * pieces;
    carbs = (foodDoc.carbsPer100g ?? foodDoc.carbs_g ?? 0) * pieces;
    fat = (foodDoc.fatPer100g ?? foodDoc.fat_g ?? 0) * pieces;
    fiber = (foodDoc.fiberPer100g ?? foodDoc.fiber_g ?? 0) * pieces;
    sugar = (foodDoc.sugarPer100g ?? foodDoc.sugar_g ?? 0) * pieces;
  } else {
    // Weight-based: use per-100g calculation
    calories = (grams / 100) * (foodDoc.caloriesPer100g ?? foodDoc.calories_kcal ?? 0);
    protein = (grams / 100) * (foodDoc.proteinPer100g ?? foodDoc.protein_g ?? 0);
    carbs = (grams / 100) * (foodDoc.carbsPer100g ?? foodDoc.carbs_g ?? 0);
    fat = (grams / 100) * (foodDoc.fatPer100g ?? foodDoc.fat_g ?? 0);
    fiber = (grams / 100) * (foodDoc.fiberPer100g ?? foodDoc.fiber_g ?? 0);
    sugar = (grams / 100) * (foodDoc.sugarPer100g ?? foodDoc.sugar_g ?? 0);
  }

  const r2 = v => Math.round((Number(v) || 0) * 100) / 100;
  return { calories: r2(calories), protein: r2(protein), carbs: r2(carbs), fat: r2(fat), fiber: r2(fiber), sugar: r2(sugar) };
}

// ---------------------------
// Calculate meal nutrition from items and food docs
// Returns meal object with computed macros
// ---------------------------
export function calculateMealNutrition(items, foodDocs) {
  const mealItems = [];

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const foodDoc = foodDocs[i];

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
        preparation: item.preparation || null
      });
      continue;
    }

    // Compute grams using best information available (unit / gramsPerUnit / perQuantity / fallback)
    const grams = calculateGrams(item.quantity, item.unit, foodDoc, item.estimatedGrams ?? null);

    // Calculate macros
    const { calories, protein, carbs, fat, fiber, sugar } = calculateMacros(
      item.quantity,
      item.unit,
      grams,
      foodDoc
    );

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
      preparation: foodDoc.preparationType ?? item.preparation
    });
  }

  // Protect totals from NaN and ensure numeric
  function sumOrZero(arr, key) {
    return arr.reduce((sum, i) => {
      const val = Number(i?.[key]);
      return sum + (isNaN(val) ? 0 : val);
    }, 0);
  }

  return {
    items: mealItems,
    totalCalories: sumOrZero(mealItems, "calories"),
    totalProtein: sumOrZero(mealItems, "protein"),
    totalCarbs: sumOrZero(mealItems, "carbs"),
    totalFats: sumOrZero(mealItems, "fats"),
    totalFiber: sumOrZero(mealItems, "fiber"),
    totalSugar: sumOrZero(mealItems, "sugar")
  };
}

// ---------------------------
// Helper: parse mlQuantity string to grams
// ---------------------------
export function parseMlQuantityToGrams(mlQuantity, doc) {
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

// ---------------------------
// Helper: compute nutrition values from a doc and optional grams override
// ---------------------------
export function computeNutritionFromDoc(doc, gramsOverride = null) {
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
