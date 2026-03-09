// backend/controllers/nutritionController.js
import { MongoClient, ObjectId } from "mongodb";
import Ajv from "ajv";
import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

// MongoDB connection
const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const client = new MongoClient(MONGO_URI);
await client.connect();
const db = client.db("nutrition_ai_projectDB");

const nutritionItems = db.collection("food_nutrition_DB");
const mealsCol = db.collection("meals");
const dailyNutritionCol = db.collection("daily_nutrition");

// Gemini AI setup - trying different models
const genAI = process.env.GEMINI_API_KEY
  ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY)
  : null;
const model = genAI
  ? genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" })
  : null;
console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
console.log("GEMINI_MODEL:", process.env.GEMINI_MODEL || "gemini-2.5-flash");

// Unit mapping
const UNIT_GRAMS_MAP = {
  handful: 30,
  bowl: 150,
  cup: 180,
  serving: 100,
  piece: 40,
  slice: 30,
  tablespoon: 15,
  tbsp: 15,
  teaspoon: 5,
  tsp: 5
};

// Basic nutrition estimates per 100g for common foods
const NUTRITION_ESTIMATES = {
  // Grains & Bread
  bread: { calories: 265, protein: 9, carbs: 49, fats: 3.2 },
  rice: { calories: 130, protein: 2.7, carbs: 28, fats: 0.3 },
  roti: { calories: 297, protein: 11, carbs: 51, fats: 7 },
  chapati: { calories: 297, protein: 11, carbs: 51, fats: 7 },
  
  // Fruits
  apple: { calories: 52, protein: 0.3, carbs: 14, fats: 0.2 },
  banana: { calories: 89, protein: 1.1, carbs: 23, fats: 0.3 },
  orange: { calories: 47, protein: 0.9, carbs: 12, fats: 0.1 },
  
  // Proteins
  egg: { calories: 155, protein: 13, carbs: 1.1, fats: 11 },
  chicken: { calories: 239, protein: 27, carbs: 0, fats: 14 },
  fish: { calories: 206, protein: 22, carbs: 0, fats: 12 },
  
  // Indian Dishes
  'panir bhurji': { calories: 180, protein: 12, carbs: 8, fats: 12 },
  'paneer bhurji': { calories: 180, protein: 12, carbs: 8, fats: 12 },
  paneer: { calories: 265, protein: 18, carbs: 1.2, fats: 20 },
  panir: { calories: 265, protein: 18, carbs: 1.2, fats: 20 },
  
  // Nuts & Butters
  almond: { calories: 579, protein: 21, carbs: 22, fats: 50 },
  peanut: { calories: 567, protein: 26, carbs: 16, fats: 49 },
  peanuts: { calories: 567, protein: 26, carbs: 16, fats: 49 },
  penutes: { calories: 567, protein: 26, carbs: 16, fats: 49 }, // common misspelling
  'almond butter': { calories: 614, protein: 21, carbs: 19, fats: 56 },
  'peanut butter': { calories: 588, protein: 25, carbs: 20, fats: 50 },
  
  // Vegetables
  potato: { calories: 77, protein: 2, carbs: 17, fats: 0.1 },
  tomato: { calories: 18, protein: 0.9, carbs: 3.9, fats: 0.2 },
  onion: { calories: 40, protein: 1.1, carbs: 9.3, fats: 0.1 },
  
  // Condiments & Spreads
  butter: { calories: 717, protein: 0.9, carbs: 0.1, fats: 81 },
  oil: { calories: 884, protein: 0, carbs: 0, fats: 100 },
  honey: { calories: 304, protein: 0.3, carbs: 82, fats: 0 }
};

function getEstimatedNutrition(foodName) {
  const name = foodName.toLowerCase();
  
  // Direct match
  if (NUTRITION_ESTIMATES[name]) {
    return NUTRITION_ESTIMATES[name];
  }
  
  // Partial matches
  for (const [key, nutrition] of Object.entries(NUTRITION_ESTIMATES)) {
    if (name.includes(key) || key.includes(name)) {
      return nutrition;
    }
  }
  
  // Default estimates based on food type patterns
  if (/bread|roti|chapati/.test(name)) return NUTRITION_ESTIMATES.bread;
  if (/fruit|apple|banana/.test(name)) return { calories: 50, protein: 0.5, carbs: 12, fats: 0.2 };
  if (/meat|chicken|mutton/.test(name)) return NUTRITION_ESTIMATES.chicken;
  if (/nut|almond|peanut/.test(name)) return NUTRITION_ESTIMATES.almond;
  
  // Generic fallback
  return { calories: 100, protein: 3, carbs: 15, fats: 2 };
}

// Stopwords
const STOPWORDS = new Set([
  "with", "and", "in", "on", "at", "from", "to", "for", "of", "a", "an", "the", "by", "eat", "i"
]);

// Helper functions
function normalizeUnit(u) {
  if (!u) return "piece";
  const s = String(u).toLowerCase().trim();
  if (s.match(/^(kg|kilogram)$/)) return "kg";
  if (s.match(/^(g|gram|grams|gm)$/)) return "g";
  if (s.match(/^(cup|cups)$/)) return "cup";
  if (s.match(/^(bowl|bowls)$/)) return "bowl";
  if (s.match(/^(handful|handfuls)$/)) return "handful";
  if (s.match(/^(slice|slices)$/)) return "slice";
  if (s.match(/^(tablespoon|tablespoons|tbsp)$/)) return "tablespoon";
  if (s.match(/^(teaspoon|teaspoons|tsp)$/)) return "teaspoon";
  return "piece";
}

function getLocalDateString(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// Enhanced parser
function simpleParse(text) {
  const items = [];
  if (!text || typeof text !== "string") return { items: [], preparationHint: null };

  const lower = text.toLowerCase();
  let preparationHint = null;
  
  if (/\b(morning|breakfast|night|dinner|lunch)\b/.test(lower)) preparationHint = "home";
  else if (/\b(restaurant|outside|dhaba|hotel)\b/.test(lower)) preparationHint = "outside";

  // Pattern 1: "number + unit + food" (e.g., "1 cup matcha latte")
  const unitPattern = /(\d+(?:\.\d+)?)\s*(tablespoons?|tbsp|teaspoons?|tsp|handfuls?|cups?|bowls?|slices?|pieces?|kg|g|gm|grams?)\s+(?:of\s+)?([a-zA-Z][a-zA-Z\s]*)/gi;
  let match;
  
  while ((match = unitPattern.exec(text)) !== null) {
    const quantity = parseFloat(match[1]);
    const unit = normalizeUnit(match[2].toLowerCase());
    let name = match[3].toLowerCase().trim();
    
    // Clean up compound food names
    name = name.replace(/\b(with|and)\s+.*$/, '').trim(); // "matcha latte with oat milk" -> "matcha latte"
    
    if (name && !STOPWORDS.has(name) && name.length > 1) {
      items.push({ name, quantity, unit, preparation: preparationHint });
    }
  }
  
  // Pattern 2: "number + food" without units (e.g., "30g cashews")
  if (items.length === 0) {
    const numberPattern = /(\d+(?:\.\d+)?)\s*([a-zA-Z]+)\s+([a-zA-Z][a-zA-Z\s]*)/gi;
    while ((match = numberPattern.exec(text)) !== null) {
      const quantity = parseFloat(match[1]);
      const possibleUnit = match[2].toLowerCase();
      let name = match[3].toLowerCase().trim();
      
      // Check if second word is a unit
      const unit = /^(g|gm|gram|grams|kg|ml|l)$/.test(possibleUnit) ? normalizeUnit(possibleUnit) : "piece";
      if (unit !== "piece") {
        name = name.replace(/\b(with|and)\s+.*$/, '').trim();
        if (name && !STOPWORDS.has(name)) {
          items.push({ name, quantity, unit, preparation: preparationHint });
        }
      }
    }
  }
  
  // Pattern 3: Simple "number + food" (e.g., "2 apples")
  if (items.length === 0) {
    const simplePattern = /(\d+(?:\.\d+)?)\s+([a-zA-Z][a-zA-Z\s]*)/gi;
    while ((match = simplePattern.exec(text)) !== null) {
      const quantity = parseFloat(match[1]);
      let name = match[2].toLowerCase().trim();
      
      name = name.replace(/\b(with|and)\s+.*$/, '').trim();
      
      if (name && !STOPWORDS.has(name) && name.length > 1) {
        items.push({ name, quantity, unit: "piece", preparation: preparationHint });
      }
    }
  }

  return { items, preparationHint };
}

async function findNutritionDocByName(name) {
  if (!name) return { doc: null };
  
  try {
    const doc = await nutritionItems.findOne({
      $or: [
        { displayName: new RegExp(`^${escapeRegex(name)}$`, "i") },
        { aliases: { $in: [name] } }
      ]
    });
    return { doc };
  } catch (e) {
    console.warn("Search failed:", e?.message);
    return { doc: null };
  }
}

// Controllers
export async function getFood(req, res) {
  try {
    const { name } = req.params;
    if (!name) return res.status(400).json({ error: "name required" });

    const { doc } = await findNutritionDocByName(name);
    
    if (doc) {
      return res.json({
        ...doc,
        calories_kcal: doc.calories_kcal ?? doc.caloriesPer100g ?? 0,
        protein_g: doc.protein_g ?? doc.proteinPer100g ?? 0,
        carbs_g: doc.carbs_g ?? doc.carbsPer100g ?? 0,
        fat_g: doc.fat_g ?? doc.fatPer100g ?? 0
      });
    }

    return res.json({
      previewOnly: true,
      displayName: String(name).trim(),
      calories_kcal: 0,
      protein_g: 0,
      carbs_g: 0,
      fat_g: 0,
      perQuantity: 100,
      unit: "g"
    });
  } catch (err) {
    console.error("getFood error:", err);
    res.status(500).json({ error: "Server error" });
  }
}

export async function logFoodText(req, res) {
  try {
    const { text, userId } = req.body;
    if (!text) return res.status(400).json({ error: "Invalid input text" });

    let parsed;
    
    // Try Gemini first for complex parsing
    if (model) {
      try {
        const prompt = `Extract food items from this text and return JSON:
"${text}"

Extract each food item with quantity and unit. Return ONLY this JSON format:
{
  "items": [
    {"name": "chapati", "quantity": 4, "unit": "piece"},
    {"name": "panir bhurji", "quantity": 1, "unit": "serving"},
    {"name": "peanuts", "quantity": 1, "unit": "handful"}
  ]
}

Rules:
- Extract ALL food items mentioned
- Use proper food names (panir bhurji, not just panir)
- Default unit is "piece" if not specified
- Use "handful" for handful, "cup" for cup, etc.
- Return only valid JSON, no explanation`;
        
        const result = await model.generateContent(prompt);
        const responseText = result.response.text();
        const cleanedText = responseText.replace(/```(?:json)?\s*([\s\S]*?)\s*```/i, "$1").trim();
        parsed = JSON.parse(cleanedText);
        
        if (!parsed.items || !Array.isArray(parsed.items)) {
          throw new Error("Invalid Gemini response");
        }
      } catch (geminiError) {
        console.warn("Gemini parsing failed, using fallback:", geminiError.message);
        parsed = simpleParse(text);
      }
    } else {
      parsed = simpleParse(text);
    }

    const mealItems = [];

    for (const item of parsed.items) {
      const { doc } = await findNutritionDocByName(item.name);
      
      let grams = item.quantity * (UNIT_GRAMS_MAP[item.unit] || 100);
      
      if (doc) {
        const calories = (grams / 100) * (doc.caloriesPer100g ?? doc.calories_kcal ?? 0);
        const protein = (grams / 100) * (doc.proteinPer100g ?? doc.protein_g ?? 0);
        const carbs = (grams / 100) * (doc.carbsPer100g ?? doc.carbs_g ?? 0);
        const fats = (grams / 100) * (doc.fatPer100g ?? doc.fat_g ?? 0);

        mealItems.push({
          userInputName: item.name,
          dishName: doc.displayName || item.name,
          foodId: doc._id,
          quantity: item.quantity,
          unit: item.unit,
          grams,
          calories,
          protein,
          carbs,
          fats,
          isEstimated: false
        });
      } else {
        // Use estimated nutrition for unknown foods
        const estimated = getEstimatedNutrition(item.name);
        const calories = (grams / 100) * estimated.calories;
        const protein = (grams / 100) * estimated.protein;
        const carbs = (grams / 100) * estimated.carbs;
        const fats = (grams / 100) * estimated.fats;

        mealItems.push({
          userInputName: item.name,
          dishName: item.name,
          foodId: null,
          quantity: item.quantity,
          unit: item.unit,
          grams,
          calories,
          protein,
          carbs,
          fats,
          isEstimated: true
        });
      }
    }

    const meal = {
      userId: userId ? new ObjectId(userId) : null,
      rawInput: text,
      date: getLocalDateString(),
      items: mealItems,
      totalCalories: mealItems.reduce((sum, i) => sum + (i.calories || 0), 0),
      totalProtein: mealItems.reduce((sum, i) => sum + (i.protein || 0), 0),
      totalCarbs: mealItems.reduce((sum, i) => sum + (i.carbs || 0), 0),
      totalFats: mealItems.reduce((sum, i) => sum + (i.fats || 0), 0),
      createdAt: new Date()
    };

    if (userId) {
      const insertResult = await mealsCol.insertOne(meal);
      meal._id = insertResult.insertedId;
    }

    return res.json({ meal });
  } catch (err) {
    console.error("logFoodText error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function getMeals(req, res) {
  try {
    const { userId } = req.params;
    if (!userId) return res.status(400).json({ error: "userId required" });

    const limit = Math.min(100, Number(req.query.limit || 50));
    const meals = await mealsCol
      .find({ userId: new ObjectId(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .toArray();

    return res.json({ count: meals.length, meals });
  } catch (err) {
    console.error("getMeals error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function getDailyNutrition(req, res) {
  try {
    const { userId, date } = req.params;
    if (!userId || !date) return res.status(400).json({ error: "userId and date required" });

    const daily = await dailyNutritionCol.findOne({
      userId: new ObjectId(userId),
      date
    });

    return res.json({ daily });
  } catch (err) {
    console.error("getDailyNutrition error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}

export async function postAddToDaily(req, res) {
  try {
    const { userId, date, totals, mealId } = req.body;
    if (!userId || !date || !totals) {
      return res.status(400).json({ error: "userId, date and totals are required" });
    }

    const filter = { userId: new ObjectId(userId), date };
    const update = {
      $setOnInsert: { userId: new ObjectId(userId), date, createdAt: new Date() },
      $set: { updatedAt: new Date() },
      $inc: {
        completedCalories: Number(totals.completedCalories || totals.calories) || 0,
        completedProtein: Number(totals.completedProtein || totals.protein) || 0,
        completedCarbs: Number(totals.completedCarbs || totals.carbs) || 0,
        completedFats: Number(totals.completedFats || totals.fats) || 0,
        completedFiber: Number(totals.completedFiber || totals.fiber) || 0,
        completedSugar: Number(totals.completedSugar || totals.sugar) || 0
      }
    };

    if (mealId) {
      update.$addToSet = { mealIds: new ObjectId(mealId) };
    }

    await dailyNutritionCol.updateOne(filter, update, { upsert: true });
    const daily = await dailyNutritionCol.findOne(filter);

    return res.json({ daily });
  } catch (err) {
    console.error("postAddToDaily error:", err);
    return res.status(500).json({ error: "Server error" });
  }
}