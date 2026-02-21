import { spawn } from "child_process";
import path from "path";
import { fileURLToPath } from "url";
import fs from "fs";
import { GoogleGenerativeAI } from "@google/generative-ai";
import nutritionData from "../nutrition_data.json" with { type: "json" };

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

/**
 * Helper to get a quick health suggestion for local model matches
 */
const getQuickSuggestion = async (dishName) => {
    try {
        const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY.trim());
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });
        const prompt = `Give a 1-sentence health tip for the dish: ${dishName}. Keep it brief and professional.`;
        const result = await model.generateContent(prompt);
        return result.response.text().trim();
    } catch (err) {
        return "Enjoy your nutritious meal!";
    }
};

export const analyzeFood = async (imagePath) => {
    return new Promise((resolve, reject) => {
        const backendRoot = path.resolve(__dirname, "..");
        const pythonScript = path.join(backendRoot, "ml", "predict.py");
        const venvPython = path.join(backendRoot, "ml", "venv", "Scripts", "python.exe");
        const absoluteImagePath = path.resolve(imagePath);

        const pythonProcess = spawn(venvPython, [pythonScript, absoluteImagePath], { shell: true });

        let dataString = "";
        let errorString = "";

        pythonProcess.stdout.on("data", (data) => { dataString += data.toString(); });
        pythonProcess.stderr.on("data", (data) => { errorString += data.toString(); });

        pythonProcess.on("close", async (code) => {
            if (code !== 0) return reject(`Python Error: ${errorString}`);
            try {
                const jsonMatch = dataString.match(/\{[\s\S]*\}/);
                if (!jsonMatch) throw new Error("No valid JSON found");
                const result = JSON.parse(jsonMatch[0]);

                if (result.confidence >= 0.90) {
                    const dishKey = result.dish.toLowerCase().replace(/ /g, "_");
                    const info = nutritionData[dishKey] || nutritionData[result.dish];
                    
                    // Fetch a dynamic suggestion even for local matches
                    const suggestion = await getQuickSuggestion(result.dish);

                    resolve({
                        success: true,
                        source: "Local YOLOv8", // Dashboard uses this for the Badge
                        dish: result.dish,
                        confidence: result.confidence,
                        nutrition: info || { message: "Nutrition data missing" },
                        suggestion: suggestion 
                    });
                } else {
                    const geminiResult = await callGeminiAPI(absoluteImagePath);
                    resolve(geminiResult);
                }
            } catch (err) { reject("Analysis Error: " + err.message); }
        });
    });
};

const callGeminiAPI = async (imagePath) => {
    try {
        const apiKey = process.env.GEMINI_API_KEY;
        const genAI = new GoogleGenerativeAI(apiKey.trim());
        const model = genAI.getGenerativeModel({ model: "gemini-3-flash-preview" });

        const imageBuffer = fs.readFileSync(imagePath);
        const imageData = { inlineData: { data: imageBuffer.toString("base64"), mimeType: "image/jpeg" } };

        const prompt = `
            Identify the food. 
            If not food, return: {"error": "Invalid item", "dish": "none"}.
            If food, return JSON: {
                "dish": "name", 
                "nutrition": {"calories": 100, "protein": "5g", "fat": "2g", "carbs": "15g"},
                "suggestion": "A 1-sentence health tip (e.g., 'High in protein, great for muscle recovery')"
            }`;

        const result = await model.generateContent({
            contents: [{ role: 'user', parts: [imageData, { text: prompt }] }],
            generationConfig: { responseMimeType: "application/json", temperature: 0.1 }
        });

        const text = result.response.text();
        const cleanedJson = text.replace(/```json|```/g, "").trim();
        const parsedData = JSON.parse(cleanedJson);

        return {
            success: true,
            source: "Gemini 3 AI",
            dish: parsedData.dish || "Unknown Dish",
            nutrition: parsedData.nutrition || parsedData,
            suggestion: parsedData.suggestion || ""
        };
    } catch (error) {
        return { success: false, error: "AI analysis failed." };
    }
};