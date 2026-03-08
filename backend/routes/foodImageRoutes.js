// backend/routes/foodImageRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import { analyzeImageAdapter } from "../controllers/foodImageAdapterController.js";

const router = express.Router();

// Configure storage for uploaded food images (keeps same behavior as friend files)
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, "uploads/");
  },
  filename: (req, file, cb) => {
    cb(null, Date.now() + path.extname(file.originalname));
  },
});

const upload = multer({ storage });

/**
 * POST /food-image/analyze
 * - Accepts multipart/form-data with field "image"
 * - Runs ML analysis, then delegates to existing text analysis by calling internal /api/log-text
 * - Returns combined response: { success, ml, analysis }
 */
router.post("/analyze", upload.single("image"), analyzeImageAdapter);

export default router;