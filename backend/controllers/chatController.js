// backend/controllers/chatController.js
import { GoogleGenerativeAI } from "@google/generative-ai";
import { MongoClient, ObjectId } from "mongodb";
import dotenv from "dotenv";
dotenv.config();

// ---------------------------
// MongoDB connection
// ---------------------------
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
const mealsCol = db.collection("meals");
const usersCol = db.collection("users");

// ---------------------------
// Gemini setup
// ---------------------------
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;

// ---------------------------
// Helper: get last 7 days nutrition data
// ---------------------------
async function getWeekNutrition(userId) {
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
async function getUserProfile(userId) {
  try {
    const userObjId = typeof userId === "string" ? new ObjectId(userId) : userId;
    const userProfile = await db.collection("userprofiles").findOne({ userId: userObjId });
    return userProfile;
  } catch {
    return null;
  }
}


// ============================================================
// Controller: handleChat
// POST /api/chat
// Body: { userId, message, history }
// ============================================================
export async function handleChat(req, res) {
  try {
    const { userId, message, history = [] } = req.body;

    if (!message || typeof message !== "string" || message.trim().length === 0) {
      return res.status(400).json({ error: "Message is required" });
    }

    if (!genAI) {
      return res.status(500).json({ error: "AI not configured. Please set GEMINI_API_KEY." });
    }

    // Fetch real user data
    const [{ weekData, weekMeals }, userProfile] = await Promise.all([
      getWeekNutrition(userId),
      getUserProfile(userId)
    ]);

    const today = new Date();
    const todayStr = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    
    const todayData = weekData.find(d => d.date === todayStr);
    const todayMeals = weekMeals.filter(m => m.date === todayStr);

    // Build context from real data
    const caloriesConsumed = todayData?.completedCalories ?? 0;
    const proteinConsumed  = todayData?.completedProtein  ?? 0;
    const carbsConsumed    = todayData?.completedCarbs    ?? 0;
    const fatsConsumed     = todayData?.completedFats     ?? 0;
    const fiberConsumed    = todayData?.completedFiber    ?? 0;

    const calorieGoal = userProfile?.dailyCalorieTarget ?? 2000;
    const proteinGoal = userProfile?.dailyProteinTarget ?? 50;
    const carbsGoal   = userProfile?.dailyCarbsTarget   ?? 250;
    const fatsGoal    = userProfile?.dailyFatTarget     ?? 65;
    const goal        = userProfile?.goal               ?? "General Health";
    const diet = userProfile?.dietPreference ?? "Not specified";


    // Build meal list for today
    const mealList = todayMeals.length > 0
      ? todayMeals.map(m => `- ${m.rawInput || m.items?.map(i => i.dishName).join(", ")} (${Math.round(m.totalCalories ?? 0)} kcal)`).join("\n")
      : "No meals logged today yet.";

    // Build weekly summary
    const weekSummary = weekData.map(d => 
      `${d.date}: ${Math.round(d.completedCalories ?? 0)} kcal, ${Math.round(d.completedProtein ?? 0)}g protein`
    ).join("\n");

    // System prompt with real user data
    const systemPrompt = `You are a helpful, friendly AI nutrition assistant. You have access to the user's real nutrition data.

USER'S REAL DATA TODAY (${todayStr}):
- Calories consumed: ${Math.round(caloriesConsumed)} / ${calorieGoal} kcal (${Math.round((caloriesConsumed/calorieGoal)*100)}% of goal)
- Protein: ${Math.round(proteinConsumed)}g / ${proteinGoal}g
- Carbs: ${Math.round(carbsConsumed)}g / ${carbsGoal}g
- Fats: ${Math.round(fatsConsumed)}g / ${fatsGoal}g
- Fiber: ${Math.round(fiberConsumed)}g

USER'S MEALS TODAY:
${mealList}

LAST 7 DAYS SUMMARY:
${weekSummary || "No data available for past week"}

USER'S GOALS & PROFILE:
- Fitness goal: ${goal}
- Diet type: ${diet}
- Calorie target: ${calorieGoal} kcal
- Protein target: ${proteinGoal}g

INSTRUCTIONS:
- Answer questions about nutrition, meals, and health in a friendly conversational way
- Give specific suggestions based on their REAL data above
- Focus on Indian foods when suggesting meals (roti, dal, paneer, rice, sabzi etc.)
- Keep responses concise (1-2 sentences max unless they ask for detail)
- If they ask about last week, refer to the 7 days summary above
- Do NOT make up data — only use what's provided above
- Always be encouraging and positive
- IMPORTANT: Never use asterisks (*) or double asterisks (**) or any markdown formatting. Always respond in plain text only.`;

    // Build Gemini model
    const model = genAI.getGenerativeModel({
      model: process.env.GEMINI_MODEL || "gemini-2.5-flash",
      systemInstruction: systemPrompt
    });

    // Build chat history for Gemini
    const chatHistory = history
      .filter(h => h.role && h.content)
      .map(h => ({
        role: h.role === "assistant" ? "model" : "user",
        parts: [{ text: h.content }]
      }));

    // Start chat with history
    const chat = model.startChat({ history: chatHistory });

    // Send message and get response
    const result = await chat.sendMessage(message);
    let reply = result.response.text();
    
    // Remove all markdown formatting
    reply = reply.replace(/\*\*/g, '').replace(/\*/g, '');

    return res.json({
      reply,
      context: {
        caloriesConsumed: Math.round(caloriesConsumed),
        calorieGoal,
        proteinConsumed: Math.round(proteinConsumed),
        proteinGoal,
        carbsConsumed: Math.round(carbsConsumed),
        carbsGoal,
        fatsConsumed: Math.round(fatsConsumed),
        fatsGoal,
        goal,
        diet,
        mealsLogged: todayMeals.length
      }
    });
  } catch (err) {
    console.error("handleChat error:", err);
    return res.status(500).json({ error: "Failed to get AI response. Please try again." });
  }
}
