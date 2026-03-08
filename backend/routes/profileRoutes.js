// backend/routes/profileRoutes.js
import express from "express";
import { updateProfile, getProfile } from "../controllers/profileController.js";

const router = express.Router();

// Update or create profile
router.post("/update", updateProfile);

// Get profile by userId
router.get("/:userId", getProfile);

export default router;