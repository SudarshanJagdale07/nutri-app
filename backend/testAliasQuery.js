// backend/testAliasQuery.js
import { MongoClient } from "mongodb";

async function run() {
  const client = new MongoClient("mongodb://localhost:27017");

  try {
    await client.connect();
    console.log("✅ Connected to MongoDB");

    const db = client.db("nutrition_ai_projectDB");
    const nutritionItems = db.collection("food_nutrition_DB");

    // Query by alias
    const chapati = await nutritionItems.findOne({ searchTerms: "chapati" });
    if (chapati) {
      console.log("✅ Found chapati alias:");
      console.log(chapati);
    } else {
      console.log("⚠️ No match for chapati");
    }
  } catch (err) {
    console.error("❌ Error:", err);
  } finally {
    await client.close();
    console.log("🔒 Connection closed");
  }
}

run();