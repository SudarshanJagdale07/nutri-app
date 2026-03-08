// scripts/testTextSearch.js
import { MongoClient } from "mongodb";

const MONGO_URI = process.env.MONGO_URI || "mongodb://localhost:27017";
const DB_NAME = "nutrition_ai_projectDB";
const COLLECTION = "food_nutrition_DB";

const queries = [
  "chapaty",
  "chapaty roti",
  "rotii",
  "roti",
  "chapati",
  "whole wheat roti",
  "whole wheat chapati",
  "chaas buttermlk",
  "chaas buttermilk",
  "buttermilk",
  "chaas",
  "grilled chiken salad",
  "grilled chicken salad",
  "rice with dal",
  "2 rotis and 1 dal",
  "paneer tikka",
  "butter milk",
  "butter-milk",
  "buttermlk",
  "masala chai",
  "chai"
];

async function run() {
  const client = new MongoClient(MONGO_URI);
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const col = db.collection(COLLECTION);

    for (const q of queries) {
      console.log("\n=== QUERY:", q, "===\n");

      // 1) $text results with score (if index exists)
      try {
        const textRes = await col.find(
          { $text: { $search: q } },
          { score: { $meta: "textScore" }, displayName: 1, aliases: 1, searchTerms: 1 }
        ).sort({ score: { $meta: "textScore" } }).limit(8).toArray();

        if (textRes.length) {
          console.log("-> $text results (top):");
          console.log(JSON.stringify(textRes, null, 2));
        } else {
          console.log("-> $text returned no results.");
        }
      } catch (e) {
        console.warn("-> $text query failed (index missing or error):", e.message || e);
      }

      // 2) Regex fallback: search displayName tokens
      const token = q.split(/\s+/)[0];
      try {
        const regexRes = await col.find({ displayName: new RegExp(token.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i") })
          .project({ displayName: 1, aliases: 1, searchTerms: 1 })
          .limit(6)
          .toArray();
        if (regexRes.length) {
          console.log("-> Regex displayName matches (sample):");
          console.log(JSON.stringify(regexRes, null, 2));
        } else {
          console.log("-> Regex displayName found no matches for token:", token);
        }
      } catch (e) {
        console.warn("-> Regex query error:", e.message || e);
      }

      // 3) Check aliases field for exact token
      try {
        const aliasRes = await col.find({ aliases: { $in: [q.toLowerCase(), token.toLowerCase()] } })
          .project({ displayName: 1, aliases: 1, searchTerms: 1 })
          .limit(6)
          .toArray();
        if (aliasRes.length) {
          console.log("-> Exact alias matches:");
          console.log(JSON.stringify(aliasRes, null, 2));
        } else {
          console.log("-> No exact alias matches for:", q);
        }
      } catch (e) {
        console.warn("-> Alias query error:", e.message || e);
      }
    }
  } finally {
    await client.close();
  }
}

run().catch(err => {
  console.error("Script error:", err);
  process.exit(1);
});