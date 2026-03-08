// frontend/src/hooks/useDailyNutrition.js
import { useEffect, useState, useCallback } from "react";
import { getDailyNutrition } from "../apiManager/foodApi";

/**
 * useDailyNutrition(userId)
 * - returns { totals: { completedCalories, completedProtein, completedCarbs, completedFats, completedFiber, completedSugar }, loading, refresh }
 * - also exposes an `applyIncrement` helper for optimistic updates (use after persisted add)
 *
 * This hook accepts both legacy shapes (calories/protein/...) and canonical completed* shapes from the backend,
 * and normalizes them to the canonical completed* shape for consumers.
 */
export function useDailyNutrition(userId) {
  const [loading, setLoading] = useState(false);
  const [totals, setTotals] = useState({
    completedCalories: 0,
    completedProtein: 0,
    completedCarbs: 0,
    completedFats: 0,
    completedFiber: 0,
    completedSugar: 0
  });

  const fetchForToday = useCallback(async () => {
    if (!userId) return;
    setLoading(true);
    try {
      const today = new Date().toISOString().slice(0,10);
      const resp = await getDailyNutrition(userId, today);
      // Accept multiple shapes
      const daily = resp?.data?.daily ?? resp?.daily ?? resp?.data ?? null;
      if (daily) {
        // Normalize: prefer canonical completed* keys, fall back to legacy total* keys
        setTotals({
          completedCalories: Number(daily.completedCalories ?? daily.totalCalories ?? daily.total_calories ?? 0),
          completedProtein: Number(daily.completedProtein ?? daily.totalProtein ?? daily.total_protein ?? 0),
          completedCarbs: Number(daily.completedCarbs ?? daily.totalCarbs ?? daily.total_carbs ?? 0),
          completedFats: Number(daily.completedFats ?? daily.totalFats ?? daily.total_fats ?? 0),
          completedFiber: Number(daily.completedFiber ?? daily.totalFiber ?? daily.total_fiber ?? 0),
          completedSugar: Number(daily.completedSugar ?? daily.totalSugar ?? daily.total_sugar ?? 0)
        });
      } else {
        setTotals({
          completedCalories:0,
          completedProtein:0,
          completedCarbs:0,
          completedFats:0,
          completedFiber:0,
          completedSugar:0
        });
      }
    } catch (err) {
      console.warn("useDailyNutrition fetch error:", err);
      setTotals({
        completedCalories:0,
        completedProtein:0,
        completedCarbs:0,
        completedFats:0,
        completedFiber:0,
        completedSugar:0
      });
    } finally {
      setLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    if (!userId) return;
    fetchForToday();
  }, [userId, fetchForToday]);

  /**
   * applyIncrement accepts either:
   * - canonical shape: { completedCalories, completedProtein, completedCarbs, completedFats, completedFiber, completedSugar }
   * - legacy shape: { calories, protein, carbs, fats, fiber, sugar }
   *
   * It normalizes and applies the increment optimistically to local totals.
   */
  function applyIncrement(increment = {}) {
    const inc = {
      completedCalories: Number(increment.completedCalories ?? increment.calories ?? 0),
      completedProtein: Number(increment.completedProtein ?? increment.protein ?? 0),
      completedCarbs: Number(increment.completedCarbs ?? increment.carbs ?? 0),
      completedFats: Number(increment.completedFats ?? increment.fats ?? 0),
      completedFiber: Number(increment.completedFiber ?? increment.fiber ?? 0),
      completedSugar: Number(increment.completedSugar ?? increment.sugar ?? 0)
    };

    setTotals(prev => ({
      completedCalories: prev.completedCalories + inc.completedCalories,
      completedProtein: prev.completedProtein + inc.completedProtein,
      completedCarbs: prev.completedCarbs + inc.completedCarbs,
      completedFats: prev.completedFats + inc.completedFats,
      completedFiber: prev.completedFiber + inc.completedFiber,
      completedSugar: prev.completedSugar + inc.completedSugar
    }));
  }

  return {
    totals,
    loading,
    refresh: fetchForToday,
    applyIncrement
  };
}

export default useDailyNutrition;