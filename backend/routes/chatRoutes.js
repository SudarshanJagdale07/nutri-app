import express from "express";
import { handleChat } from "../controllers/chatController.js";
import authMiddleware from "../middleware/authMiddleware.js";

const router = express.Router();

// POST /api/chat
router.post("/", authMiddleware, handleChat);

export default router;
