// backend/controllers/foodImageAdapterController.js
import { analyzeFood } from "../services/imageAnalysisService.js";

/**
 * analyzeImageAdapter
 * - req.file.path contains uploaded image
 * - Calls analyzeFood(imagePath) to get ML labels
 * - Converts ML labels into a text string and calls internal /api/log-text (persist:false)
 * - Returns combined JSON: { success, ml, analysis }
 *
 * Important: this adapter intentionally reuses the existing text analysis endpoint
 * so all matching, suggestion and parsing logic remains unchanged.
 */
export async function analyzeImageAdapter(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, error: "No image uploaded" });
    }

    const imagePath = req.file.path;

    // 1) Run ML analysis (friend's wrapper)
    const mlResult = await analyzeFood(imagePath);

    // If ML failed, return ML error but still in a consistent shape
    if (!mlResult || !mlResult.success) {
      return res.json({ success: false, error: mlResult?.error || "ML analysis failed", ml: mlResult || null });
    }

    // 2) Convert ML output to text input for existing text analysis
    let textInput = "";
    if (mlResult.dish && String(mlResult.dish).trim()) {
      textInput = String(mlResult.dish).trim();
    } else if (Array.isArray(mlResult.labels) && mlResult.labels.length) {
      textInput = mlResult.labels.join(", ");
    } else if (mlResult.label) {
      textInput = String(mlResult.label);
    } else {
      textInput = mlResult.prediction || mlResult.name || "";
    }

    // 3) Call internal text analysis endpoint to reuse existing parsing/matching logic
    const API_BASE = process.env.INTERNAL_API_BASE || `http://localhost:${process.env.PORT || 5000}`;
    const payload = { text: textInput, userId: req.body?.userId || null, persist: false };

    // Use the global fetch available in Node 18+
    const resp = await globalThis.fetch(`${API_BASE}/api/log-text`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    let analysis = null;
    try {
      analysis = await resp.json();
    } catch (e) {
      analysis = null;
    }

    // 4) Return combined response
    return res.json({
      success: true,
      ml: mlResult,
      analysis
    });
  } catch (err) {
    console.error("analyzeImageAdapter error:", err);
    return res.status(500).json({ success: false, error: err.message || "Adapter error" });
  }
}