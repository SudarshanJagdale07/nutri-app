// testConnection.js
import { MongoClient } from "mongodb";

async function run() {
  const uri = "mongodb://localhost:27017"; // change if using Atlas
  const client = new MongoClient(uri);

  try {
    // Connect to MongoDB
    await client.connect();
    console.log("✅ Connected to MongoDB");

    // Select your database and collection
    const db = client.db("nutrition_ai_projectDB");
    const collection = db.collection("food_nutrition_DB");

    // Try to find one document
    const sample = await collection.findOne({});
    if (sample) {
      console.log("✅ Found a document in food_nutrition_DB:");
      console.log(sample);
    } else {
      console.log("⚠️ No documents found in food_nutrition_DB");
    }
  } catch (err) {
    console.error("❌ Connection or query failed:", err);
  } finally {
    await client.close();
    console.log("🔒 Connection closed");
  }
}

run();