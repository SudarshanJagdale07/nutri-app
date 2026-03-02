// backend/controllers/dailyNutritionController.js
import { ObjectId } from "mongodb";
import dotenv from "dotenv";
import { MongoClient } from "mongodb";

dotenv.config();

// Use same MONGO_URI logic as your other controllers
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db("nutrition_ai_projectDB");

// Collection for daily nutrition totals (new)
const dailyNutritionCol = db.collection("daily_nutrition");

/**
 * POST /api/daily/add
 * Body: {
 *   userId: "<ObjectId string>",
 *   date: "YYYY-MM-DD",
 *   totals: { calories, protein, carbs, fats, fiber, sugar },
 *   mealId: "<meal ObjectId string>" (optional)
 * }
 *
 * Upserts a document for (userId, date) and increments totals.
 * Also records mealIds array to avoid double-counting if needed.
 */
export async function addToDaily(req, res) {
  try {
    const { userId, date, totals = {}, mealId = null } = req.body;
    if (!userId || !date) {
      return res.status(400).json({ error: "userId and date are required" });
    }

    const uid = typeof userId === "string" ? new ObjectId(userId) : userId;
    const filter = { userId: uid, date };

    // Build $inc object only for numeric fields present
    const inc = {};
    if (typeof totals.calories === "number") inc.completedCalories = totals.calories;
    if (typeof totals.protein === "number") inc.completedProtein = totals.protein;
    if (typeof totals.carbs === "number") inc.completedCarbs = totals.carbs;
    if (typeof totals.fats === "number") inc.completedFats = totals.fats;
    if (typeof totals.fiber === "number") inc.completedFiber = totals.fiber;
    if (typeof totals.sugar === "number") inc.completedSugar = totals.sugar;

    const update = {
      $inc: inc,
      $setOnInsert: { userId: uid, date, createdAt: new Date() },
      $set: { updatedAt: new Date() }
    };

    // If mealId provided, add to mealIds array (prevent duplicates by $addToSet)
    if (mealId) {
      update.$addToSet = { mealIds: typeof mealId === "string" ? new ObjectId(mealId) : mealId };
    }

    const result = await dailyNutritionCol.updateOne(filter, update, { upsert: true });

    // Return the upserted/updated document
    const doc = await dailyNutritionCol.findOne(filter);
    return res.json({ success: true, daily: doc });
  } catch (err) {
    console.error("addToDaily error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}