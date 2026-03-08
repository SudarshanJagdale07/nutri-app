// backend/routes/foodRoutes.js
import express from "express";
import multer from "multer";
import path from "path";
import { analyzeFood } from "../services/foodAnalysisService.js";

const router = express.Router();

// 1. Configure storage for uploaded food images
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
 * @route   POST /food/analyze
 * @desc    Upload food image and get nutrition data
 */
router.post("/analyze", upload.single("image"), async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    const imagePath = req.file.path;
    
    // 2. Call the hybrid (YOLO + Gemini) service
    const result = await analyzeFood(imagePath);

    res.json(result);
  } catch (error) {
    console.error("Route Error:", error);
    res.status(500).json({ success: false, error: error.message });
  }
});

export default router;