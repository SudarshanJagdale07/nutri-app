// backend/controllers/predictiveController.js
// ============================================================
// Feature 6: Insights & Improvement Engine
// Feature 7: Predictive Tomorrow View
// Feature 8: Risk Analysis System
// ============================================================

import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

function sanitizeMongoUri(uri) {
  if (!uri || typeof uri !== "string") return uri;
  const idx = uri.indexOf("?");
  if (idx === -1) return uri;
  const base = uri.slice(0, idx);
  const qs = uri.slice(idx + 1);
  const pairs = qs.split("&").filter(Boolean);
  const drop = new Set(["useunifiedtopology", "usenewurlparser", "uselegacyutf8encoding"]);
  const kept = [];
  for (const p of pairs) {
    const [k] = p.split("=");
    if (!k) continue;
    if (drop.has(String(k).toLowerCase())) continue;
    kept.push(p);
  }
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

const MONGO_URI = sanitizeMongoUri(process.env.MONGO_URI || "mongodb://localhost:27017");
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db("nutrition_ai_projectDB");
const dailyNutritionCol = db.collection("daily_nutrition");
const usersCol = db.collection("users");

// ---------------------------
// Helper: get last N days of nutrition data for a user
// ---------------------------
async function getLastNDays(userId, n = 7) {
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
async function getUserGoals(userId) {
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

// ---------------------------
// Helper: average of a field
// ---------------------------
function avg(records, field) {
  if (!records || records.length === 0) return 0;
  const vals = records.map(r => Number(r[field] ?? 0)).filter(v => !isNaN(v));
  if (vals.length === 0) return 0;
  return vals.reduce((a, b) => a + b, 0) / vals.length;
}

// ---------------------------
// Helper: linear regression prediction
// ---------------------------
function linearRegressionPredict(values) {
  const n = values.length;
  if (n === 0) return 0;
  if (n === 1) return values[0];
  let sumX = 0, sumY = 0, sumXY = 0, sumX2 = 0;
  for (let i = 0; i < n; i++) {
    sumX += i; sumY += values[i];
    sumXY += i * values[i]; sumX2 += i * i;
  }
  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX || 1);
  const intercept = (sumY - slope * sumX) / n;
  return Math.max(0, slope * n + intercept);
}

// ============================================================
// FEATURE 7: Predictive Tomorrow View
// GET /api/predictive/:userId/tomorrow
// ============================================================
export async function getPredictiveTomorrow(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const [records7, goals] = await Promise.all([
      getLastNDays(userId, 7),
      getUserGoals(userId)
    ]);

    if (records7.length === 0) {
      return res.json({
        hasPrediction: false,
        message: "Not enough data yet. Log meals for at least 1 day to see predictions.",
        daysAvailable: 0
      });
    }

    // Use linear regression if 4+ days available, else simple average
    let predictedCalories = avg(records7, "completedCalories");
    let predictedProtein  = avg(records7, "completedProtein");

    if (records7.length >= 4) {
      const calValues  = records7.map(r => Number(r.completedCalories ?? 0)).reverse();
      const protValues = records7.map(r => Number(r.completedProtein  ?? 0)).reverse();
      predictedCalories = linearRegressionPredict(calValues);
      predictedProtein  = linearRegressionPredict(protValues);
    }

    predictedCalories = Math.round(predictedCalories);
    predictedProtein  = Math.round(predictedProtein * 10) / 10;

    // Calorie risk
    const calorieDiff = predictedCalories - goals.calorieTarget;
    let calorieRisk = "on_track";
    let calorieMessage = "Calories look balanced for tomorrow. Keep it up!";
    if (calorieDiff > 300) {
      calorieRisk = "surplus";
      calorieMessage = `Estimated calorie surplus of ${Math.round(calorieDiff)} kcal. Consider reducing oil or sweets.`;
    } else if (calorieDiff < -300) {
      calorieRisk = "deficit";
      calorieMessage = `Estimated calorie deficit of ${Math.abs(Math.round(calorieDiff))} kcal. Add a nutritious snack.`;
    }

    // Protein message
    let proteinMessage = "Protein intake looks adequate.";
    if (predictedProtein < goals.proteinTarget * 0.75) {
      proteinMessage = "Protein likely to be low. Add eggs, paneer, dal, or chicken.";
    } else if (predictedProtein > goals.proteinTarget * 1.2) {
      proteinMessage = "Protein intake looks great!";
    }

    // Tomorrow date string
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const tomorrowStr = `${tomorrow.getFullYear()}-${String(tomorrow.getMonth() + 1).padStart(2, "0")}-${String(tomorrow.getDate()).padStart(2, "0")}`;

    return res.json({
      hasPrediction: true,
      daysAvailable: records7.length,
      predictionMethod: records7.length >= 4 ? "linear_regression" : "7day_average",
      tomorrowDate: tomorrowStr,
      predicted: {
        calories: predictedCalories,
        protein:  predictedProtein,
        carbs:    Math.round(avg(records7, "completedCarbs")),
        fats:     Math.round(avg(records7, "completedFats")),
        fiber:    Math.round(avg(records7, "completedFiber") * 10) / 10,
      },
      targets: goals,
      assessment: {
        calorieRisk,
        calorieMessage,
        proteinMessage,
        summary: `If tomorrow follows your recent pattern: Estimated ${predictedCalories} kcal — ${
          calorieRisk === "surplus" ? "Slight calorie surplus" :
          calorieRisk === "deficit" ? "Slight calorie deficit" : "On track"
        }.`
      }
    });
  } catch (err) {
    console.error("getPredictiveTomorrow error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ============================================================
// FEATURE 6: Insights & Improvement Engine
// GET /api/predictive/:userId/insights
// ============================================================
export async function getInsights(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const [records, goals] = await Promise.all([
      getLastNDays(userId, 7),
      getUserGoals(userId)
    ]);

    if (records.length < 3) {
      return res.json({
        hasInsights: false,
        message: "Log meals for at least 3 days to get personalized insights.",
        insights: []
      });
    }

    const insights = [];

    // Rule 1: Low protein 3+ days
    const lowProteinDays = records.filter(r => Number(r.completedProtein ?? 0) < goals.proteinTarget * 0.7).length;
    if (lowProteinDays >= 3) {
      insights.push({
        type: "warning", icon: "🥩", title: "Low Protein Detected", priority: "high",
        message: `Protein below target for ${lowProteinDays} of last ${records.length} days.`,
        suggestion: "Add paneer, eggs, dal, or chicken to your meals."
      });
    }

    // Rule 2: Low fiber 3+ days
    const lowFiberDays = records.filter(r => Number(r.completedFiber ?? 0) < 15).length;
    if (lowFiberDays >= 3) {
      insights.push({
        type: "warning", icon: "🥦", title: "Low Fiber Intake", priority: "medium",
        message: `Fiber below 15g for ${lowFiberDays} of last ${records.length} days.`,
        suggestion: "Add vegetables, oats, or whole grains to your diet."
      });
    }

    // Rule 3: Calories too high 3+ days
    const highCalorieDays = records.filter(r => Number(r.completedCalories ?? 0) > goals.calorieTarget * 1.15).length;
    if (highCalorieDays >= 3) {
      insights.push({
        type: "warning", icon: "🔥", title: "Calorie Surplus Trend", priority: "high",
        message: `Calories exceeded target on ${highCalorieDays} of last ${records.length} days.`,
        suggestion: "Reduce oil intake, avoid fried foods, and watch portion sizes."
      });
    }

    // Rule 4: Under-eating 3+ days
    const lowCalorieDays = records.filter(r => Number(r.completedCalories ?? 0) < goals.calorieTarget * 0.7).length;
    if (lowCalorieDays >= 3) {
      insights.push({
        type: "info", icon: "⚠️", title: "Under-eating Detected", priority: "medium",
        message: `Well below calorie target for ${lowCalorieDays} days.`,
        suggestion: "Add healthy snacks like nuts, fruits, or a glass of milk."
      });
    }

    // Rule 5: Positive streak
    const onTrackDays = records.filter(r => {
      const cal = Number(r.completedCalories ?? 0);
      return cal >= goals.calorieTarget * 0.85 && cal <= goals.calorieTarget * 1.15;
    }).length;
    if (onTrackDays >= 5) {
      insights.push({
        type: "success", icon: "🎉", title: "Great Consistency!", priority: "low",
        message: `On track with calorie goals for ${onTrackDays} of last ${records.length} days.`,
        suggestion: "Keep it up! Consistency is the key to results."
      });
    }

    const priorityOrder = { high: 0, medium: 1, low: 2 };
    insights.sort((a, b) => (priorityOrder[a.priority] ?? 3) - (priorityOrder[b.priority] ?? 3));

    return res.json({
      hasInsights: insights.length > 0,
      daysAnalyzed: records.length,
      insights,
      averages: {
        calories: Math.round(avg(records, "completedCalories")),
        protein:  Math.round(avg(records, "completedProtein") * 10) / 10,
        carbs:    Math.round(avg(records, "completedCarbs")),
        fats:     Math.round(avg(records, "completedFats")),
        fiber:    Math.round(avg(records, "completedFiber") * 10) / 10,
      }
    });
  } catch (err) {
    console.error("getInsights error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

// ============================================================
// FEATURE 8: Risk Analysis System
// GET /api/predictive/:userId/risk
// ============================================================
export async function getRiskAnalysis(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const [records, goals] = await Promise.all([
      getLastNDays(userId, 7),
      getUserGoals(userId)
    ]);

    if (records.length < 3) {
      return res.json({
        riskLevel: "unknown", riskScore: 0,
        message: "Log meals for at least 3 days for risk analysis.",
        factors: []
      });
    }

    let riskScore = 0;
    const factors = [];

    // Factor 1: Low protein
    const lowProteinDays = records.filter(r => Number(r.completedProtein ?? 0) < goals.proteinTarget * 0.7).length;
    if (lowProteinDays >= 2) {
      const points = Math.min(lowProteinDays * 2, 10);
      riskScore += points;
      factors.push({ factor: "Low Protein", icon: "🥩", daysAffected: lowProteinDays, impact: points, description: `Protein below 70% of target for ${lowProteinDays} days` });
    }

    // Factor 2: Low fiber
    const lowFiberDays = records.filter(r => Number(r.completedFiber ?? 0) < 15).length;
    if (lowFiberDays >= 2) {
      const points = Math.min(Math.round(lowFiberDays * 1.5), 8);
      riskScore += points;
      factors.push({ factor: "Low Fiber", icon: "🥦", daysAffected: lowFiberDays, impact: points, description: `Fiber below 15g for ${lowFiberDays} days` });
    }

    // Factor 3: High calories
    const highCalorieDays = records.filter(r => Number(r.completedCalories ?? 0) > goals.calorieTarget * 1.2).length;
    if (highCalorieDays >= 2) {
      const points = Math.min(highCalorieDays * 3, 12);
      riskScore += points;
      factors.push({ factor: "Calorie Surplus", icon: "🔥", daysAffected: highCalorieDays, impact: points, description: `Calories exceeded 120% of target for ${highCalorieDays} days` });
    }

    // Factor 4: High fat
    const highFatDays = records.filter(r => Number(r.completedFats ?? 0) > goals.fatsTarget * 1.3).length;
    if (highFatDays >= 2) {
      const points = Math.min(highFatDays, 6);
      riskScore += points;
      factors.push({ factor: "High Fat Intake", icon: "🫀", daysAffected: highFatDays, impact: points, description: `Fat exceeded 130% of target for ${highFatDays} days` });
    }

    let riskLevel, riskColor, riskMessage;
    if (riskScore <= 5) {
      riskLevel = "Low Risk";       riskColor = "green";
      riskMessage = "Your nutrition looks good! Keep maintaining your healthy habits.";
    } else if (riskScore <= 15) {
      riskLevel = "Moderate Risk";  riskColor = "yellow";
      riskMessage = "Some nutritional imbalances detected. Small adjustments can help.";
    } else {
      riskLevel = "High Risk";      riskColor = "red";
      riskMessage = "Significant nutritional issues detected. Consider consulting a dietitian.";
    }

    return res.json({
      riskLevel, riskColor, riskScore, maxScore: 36, riskMessage,
      daysAnalyzed: records.length,
      factors: factors.sort((a, b) => b.impact - a.impact),
      averages: {
        calories: Math.round(avg(records, "completedCalories")),
        protein:  Math.round(avg(records, "completedProtein") * 10) / 10,
        fiber:    Math.round(avg(records, "completedFiber") * 10) / 10,
        fats:     Math.round(avg(records, "completedFats")),
      }
    });
  } catch (err) {
    console.error("getRiskAnalysis error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}