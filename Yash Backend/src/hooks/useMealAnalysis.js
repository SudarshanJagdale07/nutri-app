// frontend/src/hooks/useMealAnalysis.js
import { useState } from "react";
import toast from "react-hot-toast";
import { postLogText, postAddToDaily } from "../apiManager/foodApi";

/**
 * useMealAnalysis
 * - analyze(text): calls postLogText with persist:false and returns server response
 * - addToLog({ rawInput, totals, userId, selectionMap }): calls postLogText persist:true (server saves) and postAddToDaily
 * - fetchFoodDoc(name): calls GET /api/food/:name (via fetch) — returns normalized doc or null
 */
export function useMealAnalysis() {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  async function analyze(text, userId) {
    if (!text || String(text).trim().length === 0) {
      toast.error("Please describe your meal");
      return null;
    }
    setLoading(true);
    try {
      const payload = { text, userId, persist: false };
      const res = await postLogText(payload);
      // server responds with { meal, candidates } or meal
      return res;
    } catch (err) {
      console.error("analyze error:", err);
      toast.error("Failed to analyze meal");
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * addToLog: persist the current foodInput as a meal and update daily totals
   * - totals: { calories, protein, carbs, fats, fiber, sugar }
   * - userId: string
   * - rawInput: original text (postLogText uses this)
   * - selectionMap: optional { "<itemIndex>": "<candidateIdOrName>" } to indicate chosen suggestions
   *
   * Returns server response or null
   */
  async function addToLog({ rawInput, totals, userId, selectionMap = null }) {
    if (!userId) {
      toast.error("Sign in to save daily totals");
      return null;
    }
    setAdding(true);
    try {
      const payload = { text: rawInput, userId, persist: true };
      if (selectionMap && typeof selectionMap === "object") {
        payload.selectionMap = selectionMap;
      }
      // postLogText will insert meal and return meal object
      const serverResp = await postLogText(payload);
      const savedMeal = serverResp?.meal ?? serverResp ?? null;
      const savedMealId = savedMeal?._id ?? null;
      return serverResp;
    } catch (err) {
      console.error("addToLog error:", err);
      toast.error("Failed to save meal");
      return null;
    } finally {
      setAdding(false);
    }
  }

  /**
   * fetchFoodDoc: fetch single food doc (same as existing fetchFoodDoc in Dashboard.jsx)
   */
  async function fetchFoodDoc(name) {
    if (!name) return null;
    try {
      const url = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/api/food/${encodeURIComponent(name)}`;
      const res = await fetch(url);
      if (!res.ok) return null;
      const doc = await res.json();
      return doc;
    } catch (err) {
      console.warn("fetchFoodDoc error:", err);
      return null;
    }
  }

  return {
    analyze,
    addToLog,
    fetchFoodDoc,
    loading,
    adding
  };
}

export default useMealAnalysis;