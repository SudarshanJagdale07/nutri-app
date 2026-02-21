// 1. Load environment variables IMMEDIATELY at the very top
import dotenv from "dotenv";
dotenv.config();

import express from "express";
import cors from "cors";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";
import { connectDB } from "./config/index.js";

// 2. Initialize Database early
connectDB();

const app = express();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Middlewares
app.use(cors()); // Critical for fixing "Failed to fetch" errors
app.use(express.json());

// 3. Ensure the uploads directory exists
const uploadDir = path.join(__dirname, "uploads");
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir);
}
app.use("/uploads", express.static(uploadDir));

// 4. Debug check: This should now definitely say YES
console.log("-----------------------------------------");
console.log("SERVER DEBUG: Gemini Key Loaded:", process.env.GEMINI_API_KEY ? "YES" : "NO");
console.log("-----------------------------------------");

// 5. Use dynamic imports for routes to prevent hoisting issues
// This ensures variables are loaded BEFORE the routes use them
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import foodRoutes from "./routes/foodRoutes.js";

app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/food", foodRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT}`);
    console.log(`📁 Uploads available at http://localhost:${PORT}/uploads`);
});