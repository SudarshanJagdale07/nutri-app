import dotenv from "dotenv";
import UserProfile from "../models/UserProfile.js";

dotenv.config();

/**
 * handleChat
 * 
 * Simple chat handler that calls Gemini with the user message.
 */
export const handleChat = async (req, res) => {
  try {
    const { message } = req.body;
    const geminiKey = process.env.GEMINI_API_KEY;

    if (!message) {
      return res.status(400).json({ error: "Message is required." });
    }

    if (!geminiKey) {
      return res.status(500).json({ error: "Gemini API key is not configured." });
    }

    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash-latest:generateContent?key=${geminiKey}`;
    
    const response = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        contents: [
          {
            parts: [
              { text: message }
            ]
          }
        ]
      })
    });

    if (!response.ok) {
      const errData = await response.json();
      throw new Error(errData.error?.message || "Gemini API error");
    }

    const data = await response.json();
    const reply = data.candidates?.[0]?.content?.parts?.[0]?.text || "I'm sorry, I couldn't generate a response.";

    res.status(200).json({ reply });
  } catch (error) {
    console.error("handleChat error:", error);
    res.status(500).json({ error: "Failed to process chat" });
  }
};
