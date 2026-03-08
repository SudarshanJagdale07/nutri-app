import express from 'express';
import { getNotificationMessage } from '../utils/notificationMessages.js';

const router = express.Router();

router.get('/test', (req, res) => {
    try {
        const { type } = req.query;
        // Optional: Get user name from req.user if available
        const userName = req.user ? req.user.name || req.user.email?.split('@')[0] : "bro";

        const message = getNotificationMessage(type || "meal", { userName });

        res.json({
            success: true,
            data: message
        });
    } catch (error) {
        console.error("Error generating notification:", error);
        res.status(500).json({ success: false, message: "Error generating notification" });
    }
});

export default router;
