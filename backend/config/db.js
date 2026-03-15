// backend/config/db.js
import { MongoClient } from "mongodb";
import mongoose from "mongoose";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------
// Helper: sanitize Mongo URI to remove unsupported / deprecated query options
// Reason: newer mongodb driver rejects unknown options embedded in the connection string
// (example error: "option useunifiedtopology is not supported").
// This function removes known problematic keys (case-insensitive) from the query string
// while preserving the rest of the URL.
// ---------------------------
function sanitizeMongoUri(uri) {
  if (!uri || typeof uri !== "string") return uri;
  const idx = uri.indexOf("?");
  if (idx === -1) return uri;
  const base = uri.slice(0, idx);
  const qs = uri.slice(idx + 1);
  const pairs = qs.split("&").filter(Boolean);
  // keys to drop (lowercase)
  const drop = new Set(["useunifiedtopology", "usenewurlparser", "uselegacyutf8encoding"]);
  const kept = [];
  for (const p of pairs) {
    const [k, v] = p.split("=");
    if (!k) continue;
    if (drop.has(String(k).toLowerCase())) continue;
    kept.push(p);
  }
  return kept.length ? `${base}?${kept.join("&")}` : base;
}

// ---------------------------
// MongoDB connection
// ---------------------------
const MONGO_URI_RAW = process.env.MONGO_URI || "mongodb://localhost:27017";
const MONGO_URI = sanitizeMongoUri(MONGO_URI_RAW);
const client = new MongoClient(MONGO_URI);

let db, nutritionItems, mealsCol, dailyNutritionCol, estimatedCol, usersCol;

const connectDB = async () => {
  // Connect native MongoDB driver
  await client.connect();
  db = client.db("nutrition_ai_projectDB");
  nutritionItems = db.collection("food_nutrition_DB");
  mealsCol = db.collection("meals");
  dailyNutritionCol = db.collection("daily_nutrition");
  estimatedCol = db.collection("llm_estimated_foods");
  usersCol = db.collection("users");
  
  // Connect Mongoose
  await mongoose.connect(MONGO_URI, {
    dbName: "nutrition_ai_projectDB"
  });
  console.log("MongoDB connected successfully");
};

export default connectDB;
export { client, db, nutritionItems, mealsCol, dailyNutritionCol, estimatedCol, usersCol };
