// backend/models/DailyNutrition.js
import mongoose from "mongoose";

/**
 * DailyNutrition model
 *
 * Canonical aggregated totals per user per date.
 * This document is upserted when a meal is added.
 *
 * Index on (userId, date) is required to make upserts safe and fast.
 */

const dailyNutritionSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },
  date: { type: String, required: true }, // yyyy-mm-dd

  // Standardized completed* naming for aggregated totals
  completedCalories: { type: Number, default: 0 },
  completedProtein: { type: Number, default: 0 },
  completedCarbs: { type: Number, default: 0 },
  completedFat: { type: Number, default: 0 },
  completedFiber: { type: Number, default: 0 },
  completedSugar: { type: Number, default: 0 },

  mealIds: { type: [mongoose.Schema.Types.ObjectId], default: [] } // references added meals
}, { timestamps: true });

// Create the compound unique index (ensures one per user/date)
dailyNutritionSchema.index({ userId: 1, date: 1 }, { unique: true });

export default mongoose.models.DailyNutrition || mongoose.model("DailyNutrition", dailyNutritionSchema);