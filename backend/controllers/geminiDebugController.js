// backend/controllers/geminiDebugController.js
import dotenv from "dotenv";
dotenv.config();

export async function listModelsHandler(req, res) {
  try {
    const key = process.env.GEMINI_API_KEY;
    if (!key) return res.status(500).json({ error: "GEMINI_API_KEY not set" });

    // Use v1 endpoint to list models
    const url = `https://generativelanguage.googleapis.com/v1/models?key=${encodeURIComponent(key)}`;
    const r = await fetch(url);
    if (!r.ok) {
      const text = await r.text();
      console.error("REST listModels failed:", r.status, text);
      return res.status(502).json({ error: "REST listModels failed", status: r.status, body: text });
    }
    const data = await r.json();

    // Simplify output
    const simplified = (data.models || []).map(m => ({
      name: m.name || m.model || m.modelId || m.id,
      displayName: m.displayName || null,
      supportedMethods: m.supportedMethods || m.methods || null
    }));

    res.json({ ok: true, models: simplified });
  } catch (err) {
    console.error("REST listModels error:", err);
    res.status(502).json({ error: "listModels failed", details: err.message || String(err) });
  }
}