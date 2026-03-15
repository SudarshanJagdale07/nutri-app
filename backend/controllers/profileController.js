import UserProfile from "../models/UserProfile.js";
import { computeServerDerived } from "../services/bmrCalculationService.js";

/**
 * profileController
 *
 * - Accepts medicalFlags from frontend and persists them.
 * - Computes derived nutrition targets server-side (mirrors frontend engine).
 * - Ensures safe guardrails (protein + fat <= calories) and applies minimal floors if necessary.
 * - Persists and returns only standardized canonical field names (no legacy fields).
 */

/* ---------- Controller handlers ---------- */

export const updateProfile = async (req, res) => {
  try {
    // Accept canonical keys; also accept legacy keys defensively and map them to canonical names.
    // We will NOT persist legacy keys — only canonical standardized names are stored.
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
      // Accept computed fields if client sends them (but server will recompute authoritative values)
      // Legacy keys (if present) will be mapped below but not persisted.
      dailyCalories: legacyDailyCalories,
      dailyProtein: legacyDailyProtein,
      dailyFat: legacyDailyFat,
      dailyCarbs: legacyDailyCarbs,
      dailyFiber: legacyDailyFiber,
    } = req.body;

    // Defensive mapping: if client sent legacy computed fields, map them into a canonical shape for processing.
    // Note: server will compute authoritative derived values using computeServerDerived below.
    const incomingProfile = {
      age,
      gender,
      heightCm,
      weightKg,
      activityLevel,
      goal,
      medicalFlags: medicalFlags || {},
      // If legacy fields exist and some inputs are missing, we do not rely on them for core computation.
      // This mapping is only to preserve compatibility for any downstream logic that might read these values.
      // We do not persist legacy fields.
      _legacy: {
        dailyCalories: legacyDailyCalories,
        dailyProtein: legacyDailyProtein,
        dailyFat: legacyDailyFat,
        dailyCarbs: legacyDailyCarbs,
        dailyFiber: legacyDailyFiber,
      },
    };

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
      // Update personal fields
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

      // Persist derived using standardized canonical names only
      profile.bmi = derived.bmi;
      profile.bmr = derived.bmr;
      profile.maintenanceCalories = derived.maintenanceCalories;
      profile.dailyCalorieTarget = derived.dailyCalorieTarget;
      profile.dailyProteinTarget = derived.dailyProteinTarget;
      profile.dailyFatTarget = derived.dailyFatTarget;
      profile.dailyCarbsTarget = derived.dailyCarbsTarget;
      profile.dailySugarLimit = derived.dailySugarLimit;
      profile.dailySugarUpper = derived.dailySugarUpper;
      profile.dailyFiberTarget = derived.dailyFiberTarget;
      profile.nutritionEngineVersion = derived.nutritionEngineVersion;
      profile.computedAt = derived.computedAt;
      profile.updatedAt = new Date();

      await profile.save();
    } else {
      // Create new profile with derived values and medicalFlags
      // Only canonical fields are included in the created document.
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

    // Return the saved profile (Mongoose document). It contains only canonical fields per schema.
    // Convert to plain object for response.
    const out = profile.toObject ? profile.toObject() : { ...profile };

    res.json(out);
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

    // Convert to plain object and ensure only canonical fields are returned
    const out = profile.toObject ? profile.toObject() : { ...profile };

    res.json(out);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};