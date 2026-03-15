// backend/routes/textFoodLogRoutes.js
import express from "express";
import { analyzeTextMeal, saveTextMeal } from "../controllers/textFoodLogController.js";
import { listModelsHandler } from "../controllers/geminiDebugController.js";

const router = express.Router();

// Analyze meal text (no DB writes — analysis only)
router.post("/analyze-text-meal", analyzeTextMeal);

// Save pre-computed meal to DB
router.post("/save-text-meal", saveTextMeal);

// Debug endpoint to list available Gemini models (remove or protect in production)
router.get("/models", listModelsHandler);

export default router;
