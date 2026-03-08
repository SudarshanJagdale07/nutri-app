// backend/routes/predictiveRoutes.js
import express from "express";
import { getPredictiveTomorrow, getInsights, getRiskAnalysis } from "../controllers/predictiveController.js";

const router = express.Router();

// Feature 7: Predictive Tomorrow View
router.get("/:userId/tomorrow", getPredictiveTomorrow);

// Feature 6: Insights & Improvement Engine
router.get("/:userId/insights", getInsights);

// Feature 8: Risk Analysis System
router.get("/:userId/risk", getRiskAnalysis);

export default router;