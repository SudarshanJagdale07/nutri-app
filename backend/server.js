// backend/server.js
import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { connectDB } from "./config/index.js";
import authRoutes from "./routes/authRoutes.js";
import profileRoutes from "./routes/profileRoutes.js";
import textFoodLogRoutes from "./routes/textFoodLogRoutes.js";
import mealDataRoutes from "./routes/mealDataRoutes.js";
// at top with other imports
import imageFoodLogRoutes from "./routes/imageFoodLogRoutes.js";
import predictiveRoutes from "./routes/predictiveRoutes.js";
import chatRoutes from "./routes/chatRoutes.js";

dotenv.config();
await connectDB();

const app = express();
app.use(cors());
app.use(express.json());

// Routes
app.use("/auth", authRoutes);
app.use("/profile", profileRoutes);
app.use("/api", textFoodLogRoutes);
app.use("/api", mealDataRoutes);
app.use("/api/predictive", predictiveRoutes);
// after existing app.use("/food", foodRoutes);
app.use("/food-image", imageFoodLogRoutes);
app.use("/api/chat", chatRoutes);


const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
console.log("GEMINI_API_KEY present:", !!process.env.GEMINI_API_KEY);
console.log("GEMINI_API_KEY_TEXT present:", !!process.env.GEMINI_API_KEY_TEXT);
