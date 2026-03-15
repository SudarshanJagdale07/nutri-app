import { GoogleGenerativeAI } from "@google/generative-ai";
import Ajv from "ajv";
import dotenv from "dotenv";

dotenv.config();

// ---------------------------
// Gemini / Generative AI setup (may be absent in dev)
// Re-introduce LLM branch into analysis (optional, uses your Gemini key if configured).
// ---------------------------
const genAI = process.env.GEMINI_API_KEY_TEXT ? new GoogleGenerativeAI(process.env.GEMINI_API_KEY_TEXT) : null;
const model = genAI ? genAI.getGenerativeModel({ model: process.env.GEMINI_MODEL || "gemini-2.5-flash" }) : null;

// ---------------------------
// Schema validator for LLM output
// ---------------------------
const ajv = new Ajv();
const schema = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          quantity: { type: "number" },
          unit: { type: "string" },
          preparation: { type: "string" }, // added field for preparation (home/outside/packaged)
          estimatedGrams: { type: "number" }
        },
        required: ["name", "quantity", "unit"]
      }
    },
    preparationHint: { type: "string" }
  },
  required: ["items"]
};
const validateLLM = ajv.compile(schema);

// ---------------------------
// Helper: callWithRetry + timeout for LLM calls
// ---------------------------
async function callWithRetry(fn, { retries = 2, timeoutMs = 8000 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const res = await Promise.race([
        fn(),
        new Promise((_, rej) => setTimeout(() => rej(new Error("LLM timeout")), timeoutMs))
      ]);
      const usage = res?.response?.usageMetadata;
      if (usage) {
        console.log(`[LLM usage] prompt tokens: ${usage.promptTokenCount} | output tokens: ${usage.candidatesTokenCount} | total tokens: ${usage.totalTokenCount}`);
      }
      return res;
    } catch (err) {
      lastErr = err;
      await new Promise(r => setTimeout(r, 300 * (attempt + 1)));
    }
  }
  throw lastErr;
}

export { model, validateLLM, callWithRetry };
