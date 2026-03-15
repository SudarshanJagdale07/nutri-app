// backend/services/bmrCalculationService.js

/**
 * bmrCalculationService
 *
 * - Computes derived nutrition targets server-side (mirrors frontend engine).
 * - Ensures safe guardrails (protein + fat <= calories) and applies minimal floors if necessary.
 * - Returns only standardized canonical field names (no legacy fields).
 */

/* ---------- Server-side compute function (mirrors frontend nutrition engine) ---------- */
export const computeServerDerived = (profile) => {
  const { heightCm, weightKg, age, gender, activityLevel, goal, medicalFlags } = profile;

  // BMI
  const bmi = weightKg && heightCm ? weightKg / ((heightCm / 100) ** 2) : null;
  const bmiRounded = bmi ? Number(bmi.toFixed(2)) : null;

  // BMR (Mifflin-St Jeor)
  let bmr = null;
  if (weightKg && heightCm && age && gender) {
    if (gender === "male") {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age + 5;
    } else {
      bmr = 10 * weightKg + 6.25 * heightCm - 5 * age - 161;
    }
  }

  // Activity multiplier
  let multiplier = 1.375; // default light
  if (activityLevel === "sedentary") multiplier = 1.2;
  if (activityLevel === "moderate") multiplier = 1.55;
  if (activityLevel === "active") multiplier = 1.725;
  if (activityLevel === "very_active") multiplier = 1.9;

  const maintenance = bmr ? bmr * multiplier : null;

  // Goal scaling (pregnancy forces maintenance)
  const pregnancy = !!(medicalFlags && medicalFlags.pregnancy);
  let dailyCalories = maintenance ? maintenance : null;
  if (dailyCalories && !pregnancy) {
    if (goal === "weight_loss") dailyCalories = maintenance * 0.8;
    else if (goal === "muscle_gain") dailyCalories = maintenance * 1.1;
    else dailyCalories = maintenance;
  } else if (dailyCalories && pregnancy) {
    dailyCalories = maintenance;
  }

  // Protein factor (g/kg)
  let proteinFactor = 1.4; // maintain default
  if (goal === "weight_loss") proteinFactor = 1.8;
  if (goal === "muscle_gain") proteinFactor = 1.9;
  if (activityLevel === "active" || activityLevel === "very_active") proteinFactor += 0.1;

  // Compute protein grams and calories
  let proteinGrams = weightKg ? weightKg * proteinFactor : null;
  let proteinCalories = proteinGrams ? proteinGrams * 4 : null;

  // Minimum fat (g/kg)
  const fatMinFactor = 0.6;
  let fatGrams = weightKg ? weightKg * fatMinFactor : null;
  let fatCalories = fatGrams ? fatGrams * 9 : null;

  // Guardrail: ensure proteinCalories + fatCalories <= dailyCalories
  const minProteinFactor = 1.2;
  if (dailyCalories && proteinCalories !== null && fatCalories !== null && proteinCalories + fatCalories > dailyCalories) {
    let adjusted = false;
    let adjFactor = proteinFactor;
    while (adjFactor > minProteinFactor) {
      adjFactor = Number((adjFactor - 0.1).toFixed(2));
      const adjProteinGrams = weightKg ? weightKg * adjFactor : null;
      const adjProteinCalories = adjProteinGrams ? adjProteinGrams * 4 : null;
      if (adjProteinCalories + fatCalories <= dailyCalories) {
        proteinFactor = adjFactor;
        proteinGrams = adjProteinGrams;
        proteinCalories = adjProteinCalories;
        adjusted = true;
        break;
      }
    }
    if (!adjusted && proteinCalories + fatCalories > dailyCalories) {
      // enforce a safety calorie floor
      const floor = gender === "male" ? 1500 : 1200;
      if (dailyCalories < floor) dailyCalories = floor;
    }
  }

  // Final rounded values (user-friendly)
  const finalProteinGrams = proteinGrams ? Math.round(proteinGrams) : null;
  const finalProteinCalories = finalProteinGrams !== null ? finalProteinGrams * 4 : null;
  const finalFatGrams = fatGrams ? Math.round(fatGrams) : null;
  const finalFatCalories = finalFatGrams !== null ? finalFatGrams * 9 : null;

  // Carbs take the remainder
  let carbCalories = dailyCalories ? Math.round(dailyCalories) - (finalProteinCalories || 0) - (finalFatCalories || 0) : null;
  if (carbCalories !== null && carbCalories < 0) carbCalories = 0;
  const carbGrams = carbCalories ? Math.round(carbCalories / 4) : null;

  // Sugar limits (tighten if diabetes flag set)
  const diabetes = !!(medicalFlags && medicalFlags.diabetes);
  const sugarLimitPercent = diabetes ? 0.03 : 0.05; // fraction of calories
  const sugarUpperPercent = diabetes ? 0.05 : 0.10;
  const dailySugarLimit = dailyCalories ? Math.round((Math.round(dailyCalories) * sugarLimitPercent) / 4) : null;
  const dailySugarUpper = dailyCalories ? Math.round((Math.round(dailyCalories) * sugarUpperPercent) / 4) : null;

  // Fiber target: use guideline 14 g per 1000 kcal (rounded)
  const dailyFiber = dailyCalories ? Math.round((Math.round(dailyCalories) / 1000) * 14) : null;

  // Return standardized canonical fields only
  return {
    bmi: bmiRounded,
    bmr: bmr ? Math.round(bmr) : null,
    maintenanceCalories: maintenance ? Math.round(maintenance) : null,
    // standardized field names for daily targets
    dailyCalorieTarget: dailyCalories ? Math.round(dailyCalories) : null,
    dailyProteinTarget: finalProteinGrams,
    dailyFatTarget: finalFatGrams,
    dailyCarbsTarget: carbGrams,
    dailySugarLimit,
    dailySugarUpper,
    // include fiber target (standardized)
    dailyFiberTarget: dailyFiber,
    nutritionEngineVersion: "server-1.1.0",
    computedAt: new Date(),
  };
};
