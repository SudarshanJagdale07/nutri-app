import dotenv from "dotenv";
import { GoogleGenerativeAI } from "@google/generative-ai";

dotenv.config();

async function testGeminiModels() {
    const apiKey = process.env.GEMINI_API_KEY;

    if (!apiKey || apiKey === "YOUR_API_KEY_HERE") {
        console.error("❌ ERROR: GEMINI_API_KEY not found in .env file.");
        return;
    }

    console.log(`🔍 Testing API Key: ${apiKey.substring(0, 6)}... (length: ${apiKey.length})`);

    const genAI = new GoogleGenerativeAI(apiKey);

    // List of models to test
    const modelsToTest = [
        "gemini-3-flash-preview",
        "gemini-1.5-flash-latest",
        "gemini-1.5-pro",
        "gemini-2.0-flash-exp",
    ];

    console.log("\n--- Checking Model Availability ---");

    for (const modelName of modelsToTest) {
        try {
            const model = genAI.getGenerativeModel({ model: modelName });
            
            // Try a very simple "Hi" prompt to verify access
            const result = await model.generateContent("Hi");
            const response = await result.response;
            const text = response.text();

            console.log(`✅ ${modelName}: SUCCESS! (Response: "${text.trim().substring(0, 15)}...")`);
        } catch (error) {
            console.log(`❌ ${modelName}: FAILED`);
            console.log(`   Reason: ${error.message}`);
        }
    }

    console.log("\n--- Test Complete ---");
}

testGeminiModels();