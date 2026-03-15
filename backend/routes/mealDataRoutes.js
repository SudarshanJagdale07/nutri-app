// backend/routes/mealDataRoutes.js
import express from "express";
import { getMeals, getDailyNutrition, postAddToDaily, getFood } from "../controllers/mealDataController.js";

const router = express.Router();

// Meals history
router.get("/meals/:userId", getMeals);

// Daily nutrition endpoints (new canonical collection)
router.post("/daily/add", postAddToDaily); // upsert totals for user/date
router.get("/daily/:userId/:date", getDailyNutrition); // fetch daily totals for user/date

// Food lookup (optional)
router.get("/food/:name", getFood);

export default router;
