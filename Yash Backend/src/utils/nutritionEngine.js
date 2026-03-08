// frontend/src/utils/nutritionEngine.js
/**
 * Nutrition Engine (Option A)
 * - BMR (Mifflin-St Jeor)
 * - Activity multiplier
 * - Maintenance calories
 * - Goal scaling (weight_loss: 0.80, maintain: 1.00, muscle_gain: 1.10)
 * - Protein by bodyweight (g/kg) with activity adjustment
 * - Fat: percentage-of-calories target with g/kg clamps (min 0.6, max 1.2)
 * - Carbs = remainder calories after protein + fat
 * - Sugar limits (WHO-based) with diabetes adjustment
 *
 * Returns a canonical object with intermediate values and final targets.
 */

const NUTRITION_ENGINE_VERSION = "1.2.0";

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
  let dailyCaloriesFloat = maintenance ? maintenance : null;
  if (dailyCaloriesFloat && !pregnancy) {
    // accept both 'muscle_gain' and 'gain' for compatibility
    if (goal === "weight_loss") dailyCaloriesFloat = maintenance * 0.8;
    else if (goal === "muscle_gain" || goal === "gain") dailyCaloriesFloat = maintenance * 1.1;
    else dailyCaloriesFloat = maintenance * 1.0;
  } else if (dailyCaloriesFloat && pregnancy) {
    // pregnancy: do not apply deficit; use maintenance or higher
    dailyCaloriesFloat = maintenance;
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

  // Compute protein grams and calories (float precision)
  let proteinGramsFloat = weightKg ? weightKg * proteinFactor : null;
  let proteinCaloriesFloat = proteinGramsFloat ? proteinGramsFloat * 4 : null;

  // Fat target logic — percentage-of-calories with g/kg clamps
  // Default fat% mapping (sensible defaults)
  let fatPercent = 0.30; // default 30% of calories
  if (goal === "weight_loss") fatPercent = 0.28; // slightly lower to prioritize protein
  if (goal === "muscle_gain" || goal === "gain") fatPercent = 0.26; // slightly lower to allow carbs for training
  // activity influence: high activity -> slight reduction to favor carbs for fuel
  if (activityLevel === "active" || activityLevel === "very_active") {
    fatPercent = Math.max(0.22, fatPercent - 0.02);
  }

  // Fat minimum / maximum factors (g/kg) for clamps
  const fatMinFactor = 0.6; // g/kg (absolute minimum)
  const fatMaxFactor = 1.2; // g/kg (practical upper clamp)

  // Compute fat float target based on percent
  let fatGramsTargetFloat = null;
  let fatCaloriesFloat = null;
  if (weightKg && dailyCaloriesFloat) {
    const fatCaloriesTargetFloat = dailyCaloriesFloat * fatPercent;
    fatGramsTargetFloat = fatCaloriesTargetFloat / 9;
    // Clamp to min/max g/kg
    const minFatGrams = weightKg * fatMinFactor;
    const maxFatGrams = weightKg * fatMaxFactor;
    if (fatGramsTargetFloat < minFatGrams) fatGramsTargetFloat = minFatGrams;
    if (fatGramsTargetFloat > maxFatGrams) fatGramsTargetFloat = maxFatGrams;
    fatCaloriesFloat = fatGramsTargetFloat * 9;
  }

  // If dailyCalories is null, we cannot proceed; return partial as before
  if (!dailyCaloriesFloat) {
    return {
      bmi: bmiRounded,
      bmr: bmrRounded,
      activityMultiplier: multiplier,
      maintenanceCalories: maintenance ? round(maintenance) : null,
      dailyCalorieTarget: null,
      dailyProteinTarget: proteinGramsFloat ? round(proteinGramsFloat) : null,
      dailyFatTarget: fatGramsTargetFloat ? round(fatGramsTargetFloat) : null,
      dailyCarbsTarget: null,
      dailySugarLimit: null,
      dailySugarUpper: null,
      // fiber target unknown because dailyCalories is null
      dailyFiberTarget: null,
      notes,
      nutritionEngineVersion: NUTRITION_ENGINE_VERSION,
      computedAt: now,
    };
  }

  // Guardrail: ensure proteinCalories + fatCalories <= dailyCalories
  // If not, reduce proteinFactor stepwise by 0.1 down to a lower bound (1.2)
  const minProteinFactor = 1.2;
  let adjustedProteinFactor = proteinFactor;

  // Recompute floats based on adjustedProteinFactor and clamped fat
  proteinGramsFloat = weightKg ? weightKg * adjustedProteinFactor : null;
  proteinCaloriesFloat = proteinGramsFloat ? proteinGramsFloat * 4 : null;
  // fatGramsTargetFloat and fatCaloriesFloat are already computed above

  // Use rounded daily calories for comparison to floor logic (we keep dailyCaloriesFloat as float for internal math)
  const dailyCaloriesRoundedForChecks = Math.round(dailyCaloriesFloat);

  if ((proteinCaloriesFloat || 0) + (fatCaloriesFloat || 0) > dailyCaloriesRoundedForChecks) {
    notes.push("Protein + fat target exceed calorie target; attempting safe adjustments.");
    // Try reducing proteinFactor
    let reduced = false;
    while (adjustedProteinFactor > minProteinFactor) {
      adjustedProteinFactor = Number((adjustedProteinFactor - 0.1).toFixed(2));
      proteinGramsFloat = weightKg ? weightKg * adjustedProteinFactor : null;
      proteinCaloriesFloat = proteinGramsFloat ? proteinGramsFloat * 4 : null;
      if ((proteinCaloriesFloat || 0) + (fatCaloriesFloat || 0) <= dailyCaloriesRoundedForChecks) {
        reduced = true;
        notes.push(`Protein factor reduced to ${adjustedProteinFactor.toFixed(2)} g/kg to fit calories.`);
        break;
      }
    }

    // If still infeasible, enforce calorie floor (gender or maintenance if pregnancy)
    if (!reduced && (proteinCaloriesFloat || 0) + (fatCaloriesFloat || 0) > dailyCaloriesRoundedForChecks) {
      const enforced = pregnancy ? Math.round(maintenance) : floor;
      if (enforced > dailyCaloriesRoundedForChecks) {
        notes.push(
          `Calorie target raised to safety floor (${enforced} kcal) because protein + fat could not fit.`
        );
        // Increase dailyCaloriesFloat to enforced to make room
        dailyCaloriesFloat = enforced;
        // Recompute fat target based on the new dailyCaloriesFloat (respecting clamps)
        const fatCaloriesTargetFloat = dailyCaloriesFloat * fatPercent;
        fatGramsTargetFloat = fatCaloriesTargetFloat / 9;
        const minFatGrams = weightKg * fatMinFactor;
        const maxFatGrams = weightKg * fatMaxFactor;
        if (fatGramsTargetFloat < minFatGrams) fatGramsTargetFloat = minFatGrams;
        if (fatGramsTargetFloat > maxFatGrams) fatGramsTargetFloat = maxFatGrams;
        fatCaloriesFloat = fatGramsTargetFloat * 9;
        // Recompute protein (with adjustedProteinFactor)
        proteinGramsFloat = weightKg ? weightKg * adjustedProteinFactor : null;
        proteinCaloriesFloat = proteinGramsFloat ? proteinGramsFloat * 4 : null;
      } else {
        notes.push("Unable to fit protein + fat within calorie target; carbs set to zero.");
        // leave dailyCaloriesFloat unchanged here; carbs computation will clamp to zero later
      }
      // Recompute protein/fat floats if needed (done above)
    }
  }

  // Final protein/fat numbers (round grams for user-friendly labels)
  const finalProteinGrams = proteinGramsFloat ? round(proteinGramsFloat) : null;
  const finalProteinCalories = finalProteinGrams !== null ? finalProteinGrams * 4 : null;
  const finalFatGrams = fatGramsTargetFloat ? round(fatGramsTargetFloat) : null;
  const finalFatCalories = finalFatGrams !== null ? finalFatGrams * 9 : null;

  // Ensure dailyCalories is integer for final targets
  let finalDailyCalories = Math.round(dailyCaloriesFloat);

  // Carbs remainder using rounded protein/fat calories (consistent for labelable grams)
  let carbCalories = finalDailyCalories - (finalProteinCalories || 0) - (finalFatCalories || 0);
  if (carbCalories < 0) {
    notes.push("Carb calories negative after protein+fat; set to 0.");
    carbCalories = 0;
  }
  let carbGrams = round(carbCalories / 4);

  // Sugar limits
  let sugarLimitPercent = 0.05;
  let sugarUpperPercent = 0.10;
  if (diabetes) {
    sugarLimitPercent = 0.03;
    sugarUpperPercent = 0.05;
    notes.push("Diabetes flag: sugar limits tightened.");
  }
  const dailySugarLimit = round((finalDailyCalories * sugarLimitPercent) / 4);
  const dailySugarUpper = round((finalDailyCalories * sugarUpperPercent) / 4);

  // --- Fiber target
  // Use common guideline: 14 g fiber per 1000 kcal (rounded)
  const dailyFiberTarget = round((finalDailyCalories / 1000) * 14);

  // Safety floor enforcement (gender)
  if (!pregnancy && gender) {
    const genderFloor = gender === "male" ? 1500 : 1200;
    if (finalDailyCalories < genderFloor) {
      notes.push(`Calorie floor applied for ${gender}: ${genderFloor} kcal.`);
      finalDailyCalories = genderFloor;
      // Recompute carbs after floor using finalProteinCalories and finalFatCalories
      let recalCarbCalories = finalDailyCalories - (finalProteinCalories || 0) - (finalFatCalories || 0);
      if (recalCarbCalories < 0) {
        notes.push("Even after floor, protein+fat exceed calories; carbs set to 0.");
        recalCarbCalories = 0;
      }
      carbCalories = recalCarbCalories;
      carbGrams = round(carbCalories / 4);
    }
  }

  // Final rounding and packaging
  const result = {
    bmi: bmiRounded,
    bmr: bmrRounded,
    activityMultiplier: multiplier,
    maintenanceCalories: maintenance ? round(maintenance) : null,
    dailyCalorieTarget: round(finalDailyCalories),
    dailyProteinTarget: finalProteinGrams,
    dailyProteinCalories: finalProteinCalories,
    dailyFatTarget: finalFatGrams,
    dailyFatCalories: finalFatCalories,
    dailyCarbsTarget: carbGrams,
    dailyCarbsCalories: carbCalories,
    dailySugarLimit,
    dailySugarUpper,
    // fiber target included
    dailyFiberTarget,
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
      // expose fiber rule used
      fiberRule: "14g per 1000 kcal"
    },
  };

  return result;
}

export default {
  computeProfileTargets,
  computeBMR,
  activityMultiplier,
};