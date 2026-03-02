// backend/routes/nutritionRoutes.js
import express from "express";
import { logFoodText, getMeals, getDailyNutrition, postAddToDaily, getFood } from "../controllers/nutritionController.js";
import { listModelsHandler } from "../controllers/geminiDebugController.js";

const router = express.Router();

// Main endpoint used by frontend / Postman
router.post("/log-text", logFoodText);

// Meals history
router.get("/meals/:userId", getMeals);

// Daily nutrition endpoints (new canonical collection)
router.post("/daily/add", postAddToDaily); // upsert totals for user/date
router.get("/daily/:userId/:date", getDailyNutrition); // fetch daily totals for user/date

// Food lookup (optional)
router.get("/food/:name", getFood);

// Debug endpoint to list available Gemini models (remove or protect in production)
router.get("/models", listModelsHandler);

export default router;