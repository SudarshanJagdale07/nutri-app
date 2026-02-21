// backend/controllers/profileController.js
import UserProfile from "../models/UserProfile.js";

/**
 * profileController
 *
 * - Accepts medicalFlags from frontend and persists them.
 * - Computes derived nutrition targets server-side (mirrors frontend engine).
 * - Ensures safe guardrails (protein + fat <= calories) and applies minimal floors if necessary.
 * - Returns the saved/created profile JSON.
 */

/* ---------- Server-side compute function (mirrors frontend nutrition engine) ---------- */
const computeServerDerived = (profile) => {
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
        proteinGrams = Math.round(adjProteinGrams);
        proteinCalories = Math.round(adjProteinCalories);
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

  // Final rounded values
  const finalProteinGrams = proteinGrams ? Math.round(proteinGrams) : null;
  const finalProteinCalories = proteinCalories ? Math.round(proteinCalories) : null;
  const finalFatGrams = fatGrams ? Math.round(fatGrams) : null;
  const finalFatCalories = fatCalories ? Math.round(fatCalories) : null;

  // Carbs take the remainder
  let carbCalories = dailyCalories ? dailyCalories - (finalProteinCalories || 0) - (finalFatCalories || 0) : null;
  if (carbCalories !== null && carbCalories < 0) carbCalories = 0;
  const carbGrams = carbCalories ? Math.round(carbCalories / 4) : null;

  // Sugar limits (tighten if diabetes flag set)
  const diabetes = !!(medicalFlags && medicalFlags.diabetes);
  const sugarLimitPercent = diabetes ? 0.03 : 0.05; // fraction of calories
  const sugarUpperPercent = diabetes ? 0.05 : 0.10;
  const dailySugarLimit = dailyCalories ? Math.round((dailyCalories * sugarLimitPercent) / 4) : null;
  const dailySugarUpper = dailyCalories ? Math.round((dailyCalories * sugarUpperPercent) / 4) : null;

  return {
    bmi: bmiRounded,
    bmr: bmr ? Math.round(bmr) : null,
    maintenanceCalories: maintenance ? Math.round(maintenance) : null,
    dailyCalories: dailyCalories ? Math.round(dailyCalories) : null,
    dailyProtein: finalProteinGrams,
    dailyFat: finalFatGrams,
    dailyCarbs: carbGrams,
    dailySugarLimit,
    dailySugarUpper,
    nutritionEngineVersion: "server-1.1.0",
    computedAt: new Date(),
  };
};

/* ---------- Controller handlers ---------- */

export const updateProfile = async (req, res) => {
  try {
    const {
      userId,
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      dietPreference,
      goal,
      medicalFlags,
    } = req.body;

    let profile = await UserProfile.findOne({ userId });

    // Compute derived values server-side (canonical)
    const derived = computeServerDerived({
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      medicalFlags: medicalFlags || {},
    });

    if (profile) {
      // Update fields
      profile.age = age;
      profile.gender = gender;
      profile.heightCm = heightCm;
      profile.weightKg = weightKg;
      profile.activityLevel = activityLevel;
      profile.dietPreference = dietPreference;
      profile.goal = goal;

      // Persist medicalFlags explicitly
      profile.medicalFlags = {
        diabetes: !!(medicalFlags && medicalFlags.diabetes),
        pregnancy: !!(medicalFlags && medicalFlags.pregnancy),
      };

      // Persist derived
      profile.bmi = derived.bmi;
      profile.bmr = derived.bmr;
      profile.maintenanceCalories = derived.maintenanceCalories;
      profile.dailyCalories = derived.dailyCalories;
      profile.dailyProtein = derived.dailyProtein;
      profile.dailyFat = derived.dailyFat;
      profile.dailyCarbs = derived.dailyCarbs;
      profile.dailySugarLimit = derived.dailySugarLimit;
      profile.dailySugarUpper = derived.dailySugarUpper;
      profile.nutritionEngineVersion = derived.nutritionEngineVersion;
      profile.computedAt = derived.computedAt;
      profile.updatedAt = new Date();

      await profile.save();
    } else {
      // Create new profile with derived values and medicalFlags
      profile = await UserProfile.create({
        userId,
        age,
        gender,
        heightCm,
        weightKg,
        activityLevel,
        dietPreference,
        goal,
        medicalFlags: {
          diabetes: !!(medicalFlags && medicalFlags.diabetes),
          pregnancy: !!(medicalFlags && medicalFlags.pregnancy),
        },
        ...derived,
      });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

export const getProfile = async (req, res) => {
  try {
    const { userId } = req.params;
    let profile = await UserProfile.findOne({ userId });

    // Always return a profile object; create a blank one if missing
    if (!profile) {
      profile = await UserProfile.create({
        userId,
        medicalFlags: { diabetes: false, pregnancy: false },
      });
    }

    res.json(profile);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};