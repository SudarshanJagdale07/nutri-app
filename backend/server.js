// backend/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/index.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import nutritionRoutes from "./routes/nutritionRoutes.js";
// at top with other imports
import foodImageRoutes from "./routes/foodImageRoutes.js";
import predictiveRoutes from "./routes/predictiveRoutes.js";

dotenv.config();
connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/api", nutritionRoutes);
app.use("/api/predictive", predictiveRoutes);
// after existing app.use("/food", foodRoutes);
app.use("/food-image", foodImageRoutes);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
console.log("Actual key being used:", JSON.stringify(process.env.GEMINI_API_KEY));