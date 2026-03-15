// backend/services/userNutritionDataService.js
import { ObjectId } from "mongodb";

import { db, dailyNutritionCol, mealsCol } from "../config/db.js";
import { usersCol } from "../config/db.js";

// ---------------------------
// Helper: get last 7 days nutrition data
// ---------------------------
export async function getWeekNutrition(userId) {
  try {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const dates = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date();
      d.setDate(d.getDate() - i);
      dates.push(`${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`);
    }

    const weekData = await dailyNutritionCol.find({ userId: userObjId, date: { $in: dates } }).toArray();
    const weekMeals = await mealsCol.find({ userId: userObjId, date: { $in: dates } }).toArray();

    return { weekData, weekMeals, dates };
  } catch (err) {
    console.error("getWeekNutrition error:", err);
    return { weekData: [], weekMeals: [], dates: [] };
  }
}

// ---------------------------
// Helper: get user profile/goals
// ---------------------------
export async function getUserProfile(userId) {
  try {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const userProfile = await db.collection("userprofiles").findOne({ userId: userObjId });
    return userProfile;
  } catch {
    return null;
  }
}

// ---------------------------
// Helper: get last N days of nutrition data for a user
// ---------------------------
export async function getLastNDays(userId, n = 7) {
  const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
  const dates = [];
  for (let i = 1; i <= n; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    const dd = String(d.getDate()).padStart(2, "0");
    dates.push(`${yyyy}-${mm}-${dd}`);
  }
  const records = await dailyNutritionCol
    .find({ userId: userObjId, date: { $in: dates } })
    .toArray();
  return records;
}

// ---------------------------
// Helper: get user goals with sensible defaults
// ---------------------------
export async function getUserGoals(userId) {
  try {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const user = await usersCol.findOne({ _id: userObjId });
    return {
      calorieTarget: user?.goals?.calorieTarget ?? user?.calorieTarget ?? 2000,
      proteinTarget: user?.goals?.proteinTarget ?? user?.proteinTarget ?? 50,
      carbsTarget:   user?.goals?.carbsTarget   ?? user?.carbsTarget   ?? 250,
      fatsTarget:    user?.goals?.fatsTarget    ?? user?.fatsTarget    ?? 65,
      fiberTarget:   user?.goals?.fiberTarget   ?? user?.fiberTarget   ?? 25,
    };
  } catch {
    return { calorieTarget: 2000, proteinTarget: 50, carbsTarget: 250, fatsTarget: 65, fiberTarget: 25 };
  }
}
