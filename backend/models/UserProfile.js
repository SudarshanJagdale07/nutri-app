// backend/models/UserProfile.js
import mongoose from "mongoose";

/**
 * UserProfile schema
 *
 * Notes:
 * - Added medicalFlags object so frontend can persist flags like diabetes/pregnancy.
 * - Added explicit derived fields (maintenanceCalories, dailyProtein, dailyFat, dailyCarbs, dailySugarLimit, dailySugarUpper)
 *   so the frontend can read back canonical computed targets after save.
 * - Kept timestamps and updatedAt for auditing.
 */

const userProfileSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },

    age: { type: Number },
    gender: { type: String },
    heightCm: { type: Number },
    weightKg: { type: Number },

    activityLevel: { type: String, enum: ["sedentary", "light", "moderate", "active", "very_active"] },
    dietPreference: { type: String, enum: ["veg", "non-veg", "vegan", "pescatarian"] },

    goal: { type: String, enum: ["weight_loss", "muscle_gain", "maintain"] },

    // Medical flags persisted as explicit booleans
    medicalFlags: {
      diabetes: { type: Boolean, default: false },
      pregnancy: { type: Boolean, default: false },
      // future flags can be added here
    },

    // Derived values (persisted)
    bmi: { type: Number },
    bmr: { type: Number },
    maintenanceCalories: { type: Number },
    dailyCalories: { type: Number },
    dailyProtein: { type: Number },
    dailyFat: { type: Number },
    dailyCarbs: { type: Number },
    dailySugarLimit: { type: Number },
    dailySugarUpper: { type: Number },

    // Engine metadata
    nutritionEngineVersion: { type: String },
    computedAt: { type: Date },

    updatedAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

export default mongoose.model("UserProfile", userProfileSchema);