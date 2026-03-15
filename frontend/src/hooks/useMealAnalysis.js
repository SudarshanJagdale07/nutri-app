// frontend/src/hooks/useMealAnalysis.js
import { useState } from "react";
import toast from "react-hot-toast";
import { postAnalyzeTextMeal, postSaveTextMeal } from "../apiManager/foodApi";

/**
 * useMealAnalysis
 * - analyzeTextMeal(text, userId): calls postAnalyzeTextMeal and returns server response (no DB writes)
 * - saveTextMeal({ meal, userId }): calls postSaveTextMeal with pre-computed meal object (no re-parsing)
 * - fetchFoodDoc(name): calls GET /api/food/:name (via fetch) — returns normalized doc or null
 */
export function useMealAnalysis() {
  const [loading, setLoading] = useState(false);
  const [adding, setAdding] = useState(false);

  async function analyzeTextMeal(text, userId) {
    if (!text || String(text).trim().length === 0) {
      toast.error("Please describe your meal");
      return null;
    }
    setLoading(true);
    try {
      const payload = { text, userId };
      const res = await postAnalyzeTextMeal(payload);
      // server responds with { meal, candidates } or meal
      return res;
    } catch (err) {
      console.error("analyzeTextMeal error:", err);
      toast.error("Failed to analyze meal");
      return null;
    } finally {
      setLoading(false);
    }
  }

  /**
   * saveTextMeal: persist the pre-computed meal object to DB
   * - meal: the meal object returned from analyzeTextMeal
   * - userId: string
   *
   * Returns server response or null
   */
  async function saveTextMeal({ meal, userId }) {
    if (!userId) {
      toast.error("Sign in to save daily totals");
      return null;
    }
    setAdding(true);
    try {
      const payload = { meal, userId };
      // postSaveTextMeal sends pre-computed meal directly — no re-parsing on server
      const serverResp = await postSaveTextMeal(payload);
      return serverResp;
    } catch (err) {
      console.error("saveTextMeal error:", err);
      toast.error("Failed to save meal");
      return null;
    } finally {
      setAdding(false);
    }
  }

  /**
   * fetchFoodDoc: fetch single food doc (same as existing fetchFoodDoc in Dashboard.jsx)
   */
  async function fetchFoodDoc(name, preparation = null) {
    if (!name) return null;
    try {
      const base = `${import.meta.env.VITE_API_BASE_URL || "http://localhost:5000"}/api/food/${encodeURIComponent(name)}`;
      const url = preparation ? `${base}?preparation=${encodeURIComponent(preparation)}` : base;
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
    analyzeTextMeal,
    saveTextMeal,
    fetchFoodDoc,
    loading,
    adding
  };
}

export default useMealAnalysis;