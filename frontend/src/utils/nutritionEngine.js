// frontend/src/utils/nutritionEngine.js
/**
 * Nutrition Engine (Option A)
 * - BMR (Mifflin-St Jeor)
 * - Activity multiplier
 * - Maintenance calories
 * - Goal scaling (weight_loss: 0.80, maintain: 1.00, muscle_gain: 1.10)
 * - Protein by bodyweight (g/kg) with activity adjustment
 * - Mandatory minimum fat: 0.6 g/kg
 * - Carbs = remainder calories after protein + fat
 * - Sugar limits (WHO-based) with diabetes adjustment
 *
 * Returns a canonical object with intermediate values and final targets.
 */

const NUTRITION_ENGINE_VERSION = "1.1.0";

function round(value) {
  return Math.round(value);
}

function toFixed1(value) {
  return value == null ? null : Number(value.toFixed(1));
}

function safeNumber(v) {
  return typeof v === "number" && !Number.isNaN(v) ? v : null;
}

/**
 * Compute BMR using Mifflin-St Jeor
 * @param {Object} inputs { weightKg, heightCm, age, gender }
 */
export function computeBMR({ weightKg, heightCm, age, gender }) {
  if (!weightKg || !heightCm || !age || !gender) return null;
  const w = Number(weightKg);
  const h = Number(heightCm);
  const a = Number(age);

  if (gender === "male") {
    return 10 * w + 6.25 * h - 5 * a + 5;
  } else {
    return 10 * w + 6.25 * h - 5 * a - 161;
  }
}

/**
 * Activity multiplier mapping
 */
export function activityMultiplier(level) {
  // default to light (1.375) to reduce overestimation bias
  switch (level) {
    case "sedentary":
      return 1.2;
    case "light":
      return 1.375;
    case "moderate":
      return 1.55;
    case "active":
      return 1.725;
    case "very_active":
      return 1.9;
    default:
      return 1.375;
  }
}

/**
 * Compute targets using Option A
 * inputs:
 * {
 *   age, gender, heightCm, weightKg,
 *   goal: 'weight_loss'|'maintain'|'muscle_gain'|'gain',
 *   activityLevel: 'sedentary'|'light'|'moderate'|'active'|'very_active',
 *   medicalFlags: { diabetes: bool, pregnancy: bool }
 * }
 */
export function computeProfileTargets(inputs) {
  const now = new Date().toISOString();
  const notes = [];

  const age = safeNumber(Number(inputs.age));
  const gender = inputs.gender || null;
  const heightCm = safeNumber(Number(inputs.heightCm));
  const weightKg = safeNumber(Number(inputs.weightKg));
  const goal = inputs.goal || "maintain";
  const activityLevel = inputs.activityLevel || "light";
  const medicalFlags = inputs.medicalFlags || {};
  const diabetes = !!medicalFlags.diabetes;
  const pregnancy = !!medicalFlags.pregnancy;

  // BMI
  const heightM = heightCm ? heightCm / 100 : null;
  const bmi = heightM && weightKg ? weightKg / (heightM * heightM) : null;
  const bmiRounded = bmi ? toFixed1(bmi) : null;

  // BMR
  const bmr = computeBMR({ weightKg, heightCm, age, gender });
  const bmrRounded = bmr ? round(bmr) : null;

  // Activity multiplier
  const multiplier = activityMultiplier(activityLevel);

  // Maintenance
  const maintenance = bmr ? bmr * multiplier : null;

  // Goal scaling
  let dailyCalories = maintenance ? maintenance : null;
  if (dailyCalories && !pregnancy) {
    // accept both 'muscle_gain' and 'gain' for compatibility
    if (goal === "weight_loss") dailyCalories = maintenance * 0.8;
    else if (goal === "muscle_gain" || goal === "gain") dailyCalories = maintenance * 1.1;
    else dailyCalories = maintenance * 1.0;
  } else if (dailyCalories && pregnancy) {
    // pregnancy: do not apply deficit; use maintenance or higher
    dailyCalories = maintenance;
    notes.push("Pregnancy detected: no calorie deficit applied; using maintenance.");
  }

  // Safety floors (gender aware)
  const femaleFloor = 1200;
  const maleFloor = 1500;
  const floor = gender === "male" ? maleFloor : femaleFloor;

  // Protein factor (g/kg)
  let proteinFactor = 1.4; // maintain default
  if (goal === "weight_loss") proteinFactor = 1.8;
  if (goal === "muscle_gain" || goal === "gain") proteinFactor = 1.9;
  if (goal === "maintain") proteinFactor = 1.4;

  // Activity adjustment
  if (activityLevel === "active" || activityLevel === "very_active") {
    proteinFactor += 0.1;
  }

  // Compute protein grams and calories
  let proteinGrams = weightKg ? weightKg * proteinFactor : null;
  let proteinCalories = proteinGrams ? proteinGrams * 4 : null;

  // Fat minimum grams (mandatory)
  const fatMinFactor = 0.6; // g/kg
  let fatGrams = weightKg ? weightKg * fatMinFactor : null;
  let fatCalories = fatGrams ? fatGrams * 9 : null;

  // If dailyCalories is null, we cannot proceed; return partial
  if (!dailyCalories) {
    return {
      bmi: bmiRounded,
      bmr: bmrRounded,
      activityMultiplier: multiplier,
      maintenanceCalories: maintenance ? round(maintenance) : null,
      dailyCalorieTarget: null,
      dailyProteinTarget: proteinGrams ? round(proteinGrams) : null,
      dailyFatTarget: fatGrams ? round(fatGrams) : null,
      dailyCarbsTarget: null,
      dailySugarLimit: null,
      dailySugarUpper: null,
      notes,
      nutritionEngineVersion: NUTRITION_ENGINE_VERSION,
      computedAt: now,
    };
  }

  // Round dailyCalories for calculations
  dailyCalories = Math.round(dailyCalories);

  // Guardrail: ensure proteinCalories + fatCalories <= dailyCalories
  // If not, reduce proteinFactor stepwise by 0.1 down to a lower bound (1.2)
  const minProteinFactor = 1.2;
  let adjustedProteinFactor = proteinFactor;
  proteinGrams = weightKg ? weightKg * adjustedProteinFactor : null;
  proteinCalories = proteinGrams ? proteinGrams * 4 : null;
  fatGrams = weightKg ? weightKg * fatMinFactor : null;
  fatCalories = fatGrams ? fatGrams * 9 : null;

  if (proteinCalories + fatCalories > dailyCalories) {
    notes.push("Protein + minimum fat exceed calorie target; attempting safe adjustments.");
    // Try reducing proteinFactor
    let reduced = false;
    while (adjustedProteinFactor > minProteinFactor) {
      adjustedProteinFactor = Number((adjustedProteinFactor - 0.1).toFixed(2));
      proteinGrams = weightKg ? weightKg * adjustedProteinFactor : null;
      proteinCalories = proteinGrams ? proteinGrams * 4 : null;
      if (proteinCalories + fatCalories <= dailyCalories) {
        reduced = true;
        notes.push(`Protein factor reduced to ${adjustedProteinFactor.toFixed(2)} g/kg to fit calories.`);
        break;
      }
    }

    // If still infeasible, enforce calorie floor (gender or maintenance if pregnancy)
    if (!reduced && proteinCalories + fatCalories > dailyCalories) {
      const enforced = pregnancy ? Math.round(maintenance) : floor;
      if (enforced > dailyCalories) {
        notes.push(
          `Calorie target raised to safety floor (${enforced} kcal) because protein + fat could not fit.`
        );
        dailyCalories = enforced;
      } else {
        notes.push("Unable to fit protein + fat within calorie target; carbs set to zero.");
      }
      // Recompute with adjustedProteinFactor (may still be original)
      proteinGrams = weightKg ? weightKg * adjustedProteinFactor : null;
      proteinCalories = proteinGrams ? proteinGrams * 4 : null;
    }
  }

  // Final protein/fat numbers (rounded)
  const finalProteinGrams = proteinGrams ? round(proteinGrams) : null;
  const finalProteinCalories = proteinCalories ? round(proteinCalories) : null;
  const finalFatGrams = fatGrams ? round(fatGrams) : null;
  const finalFatCalories = fatCalories ? round(fatCalories) : null;

  // Carbs remainder
  let carbCalories = dailyCalories - (finalProteinCalories || 0) - (finalFatCalories || 0);
  if (carbCalories < 0) {
    notes.push("Carb calories negative after protein+fat; set to 0.");
    carbCalories = 0;
  }
  const carbGrams = round(carbCalories / 4);

  // Sugar limits
  let sugarLimitPercent = 0.05;
  let sugarUpperPercent = 0.10;
  if (diabetes) {
    sugarLimitPercent = 0.03;
    sugarUpperPercent = 0.05;
    notes.push("Diabetes flag: sugar limits tightened.");
  }
  const dailySugarLimit = round((dailyCalories * sugarLimitPercent) / 4);
  const dailySugarUpper = round((dailyCalories * sugarUpperPercent) / 4);

  // Safety floor enforcement (gender)
  if (!pregnancy && gender) {
    const genderFloor = gender === "male" ? 1500 : 1200;
    if (dailyCalories < genderFloor) {
      notes.push(`Calorie floor applied for ${gender}: ${genderFloor} kcal.`);
      dailyCalories = genderFloor;
      // Recompute carbs after floor
      const recalCarbCalories = dailyCalories - (finalProteinCalories || 0) - (finalFatCalories || 0);
      if (recalCarbCalories < 0) {
        notes.push("Even after floor, protein+fat exceed calories; carbs set to 0.");
      }
    }
  }

  // Final rounding and packaging
  const result = {
    bmi: bmiRounded,
    bmr: bmrRounded,
    activityMultiplier: multiplier,
    maintenanceCalories: maintenance ? round(maintenance) : null,
    dailyCalorieTarget: round(dailyCalories),
    dailyProteinTarget: finalProteinGrams,
    dailyProteinCalories: finalProteinCalories,
    dailyFatTarget: finalFatGrams,
    dailyFatCalories: finalFatCalories,
    dailyCarbsTarget: carbGrams,
    dailyCarbsCalories: carbCalories,
    dailySugarLimit,
    dailySugarUpper,
    notes,
    nutritionEngineVersion: NUTRITION_ENGINE_VERSION,
    computedAt: now,
    // expose the factors used for auditability
    audit: {
      proteinFactor: adjustedProteinFactor,
      fatMinFactor,
      goal,
      activityLevel,
      diabetes,
      pregnancy,
    },
  };

  return result;
}

export default {
  computeProfileTargets,
  computeBMR,
  activityMultiplier,
};