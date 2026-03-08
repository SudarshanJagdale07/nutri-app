// backend/models/Meal.js
import mongoose from "mongoose";

/**
 * Meal model
 *
 * Each document represents one logged meal (one "Add to Log" action).
 * We keep items as an array so each food item and its computed macros are preserved.
 *
 * Timestamps are required (createdAt used for grouping meals by date).
 */

const mealItemSchema = new mongoose.Schema({
  userInputName: { type: String, required: true }, // original typed name
  dishName: { type: String },                      // matched/display name when available
  foodId: { type: mongoose.Schema.Types.ObjectId, required: false }, // optional link to nutrition catalog
  quantity: { type: Number, default: 1 },
  unit: { type: String, default: "serving" },
  grams: { type: Number, default: null },

  // computed macros (may be null for estimated items)
  calories: { type: Number, default: null },
  protein: { type: Number, default: null },
  carbs: { type: Number, default: null },
  fats: { type: Number, default: null },
  fiber: { type: Number, default: null },
  sugar: { type: Number, default: null },

  isEstimated: { type: Boolean, default: false },
  preparation: { type: String, enum: ["home", "outside", "packaged", null], default: null },
  preparationNotes: { type: String, default: null }
}, { _id: false });

const mealSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, ref: "User" },

  rawInput: { type: String },            // original free-text input
  date: { type: String, required: true }, // YYYY-MM-DD (local date)
  timestamp: { type: Date, default: Date.now },

  items: { type: [mealItemSchema], default: [] },

  // Aggregated totals for the meal (computed server-side)
  totalCalories: { type: Number, default: 0 },
  totalProtein: { type: Number, default: 0 },
  totalCarbs: { type: Number, default: 0 },
  totalFats: { type: Number, default: 0 },
  totalFiber: { type: Number, default: 0 },
  totalSugar: { type: Number, default: 0 },

  // Meta info
  meta: {
    source: { type: String, default: "text" }, // 'text' | 'image' | etc.
    llm: { type: Boolean, default: false },
    llmError: { type: mongoose.Schema.Types.Mixed, default: null },
    usedFallback: { type: Boolean, default: false }
  }
}, { timestamps: true });

// Export model
export default mongoose.models.Meal || mongoose.model("Meal", mealSchema);