// backend/models/UserProfile.js
import mongoose from "mongoose";

/**
 * UserProfile schema
 *
 * Notes:
 * - medicalFlags object persists flags like diabetes/pregnancy.
 * - Derived fields (maintenanceCalories, dailyProteinTarget, dailyFatTarget, dailyCarbsTarget, dailySugarLimit, dailySugarUpper, dailyFiberTarget)
 * - This schema uses canonical standardized field names only (no legacy fields).
 */

const { Schema } = mongoose;

const UserProfileSchema = new Schema(
  {
    userId: { type: Schema.Types.ObjectId, ref: "User", required: true, unique: true },

    // Personal details
    age: { type: Number },
    gender: { type: String, enum: ["male", "female", "other"], default: "male" },
    heightCm: { type: Number },
    weightKg: { type: Number },

    // Preferences
    activityLevel: { type: String },
    dietPreference: { type: String },
    goal: { type: String },

    // Medical flags
    medicalFlags: {
      diabetes: { type: Boolean, default: false },
      pregnancy: { type: Boolean, default: false },
    },

    // Derived / computed fields (stored for auditability)
    bmi: { type: Number },
    bmr: { type: Number },
    maintenanceCalories: { type: Number },

    // Daily targets (standardized canonical field names)
    dailyCalorieTarget: { type: Number },
    dailyProteinTarget: { type: Number },
    dailyFatTarget: { type: Number },
    dailyCarbsTarget: { type: Number },
    dailySugarLimit: { type: Number },
    dailySugarUpper: { type: Number },

    // Standardized fiber target
    dailyFiberTarget: { type: Number },

    // Engine metadata
    nutritionEngineVersion: { type: String },
    computedAt: { type: Date },

    // Timestamps
  },
  { timestamps: true }
);

export default mongoose.models.UserProfile || mongoose.model("UserProfile", UserProfileSchema);