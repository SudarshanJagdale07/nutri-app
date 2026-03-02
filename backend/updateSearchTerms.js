// backend/updateSearchTerms.js
import { MongoClient } from "mongodb";

const client = new MongoClient("mongodb://localhost:27017");

async function run() {
  await client.connect();
  const db = client.db("nutrition_ai_projectDB");
  const collection = db.collection("demo_DB");

  // Update all documents: split searchTerms into arrays
  const cursor = collection.find({});
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    if (doc.searchTerms && typeof doc.searchTerms === "string") {
      const termsArray = doc.searchTerms.split("|").map(s => s.trim());
      await collection.updateOne(
        { _id: doc._id },
        { $set: { searchTerms: termsArray } }
      );
    }
  }

  console.log("✅ Updated searchTerms to arrays");
  await client.close();
}

run();