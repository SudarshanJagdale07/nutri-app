// frontend/src/hooks/useHistoryData.js
/**
 * useHistoryData
 *
 * Responsibilities:
 * - Fetch weekly daily_nutrition documents for a 7-day window (rolling or Mon→Sun)
 * - Fetch all recent meals for the user (UI filters those to the 7-day window)
 * - Compute streak (consecutive days) either:
 *     • goal-based (average fulfillment across calories/protein/carbs/fats >= 1) when caller passes goals via refreshStreak(goals)
 *     • calorie-based fallback (totalCalories > 0) when goals not provided
 *
 * Notes:
 * - This file is defensive to backend response shapes. It expects:
 *    GET /api/daily/:userId/:date -> { daily: { ... } } OR top-level doc
 *    GET /api/meals/:userId -> { count: N, meals: [...] } OR an array of meal objects
 * - No DB changes, no assumptions about fields beyond the required totals (totalCalories, totalProtein, totalCarbs, totalFats)
 * - Exported API:
 *    weekDates, weekData, streak, mealGroups, loading, refreshWeek, refreshWeekRolling, refreshStreak(goals), refreshMeals, refreshAll
 */

import { useCallback, useEffect, useState } from "react";
import { getWeekDatesMondayToSunday, getLastNDates, getLocalDateString } from "../utils/weekUtils";



// Use the same API base as the rest of the frontend
const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * Helper: safeFetchDaily
 * - fetches /api/daily/:userId/:date and returns normalized daily doc or null
 */
async function safeFetchDaily(userId, date) {
  try {
    const res = await fetch(`${API_BASE}/api/daily/${encodeURIComponent(userId)}/${encodeURIComponent(date)}`);
    if (!res.ok) {
      // not found or error
      return null;
    }
    const json = await res.json();
    // The API sometimes returns { daily: { ... } } or top-level doc
    const daily = json?.daily ?? json?.data ?? json ?? null;
    return daily ?? null;
  } catch (err) {
    console.warn("safeFetchDaily error", err);
    return null;
  }
}

/**
 * Helper: safeFetchMeals
 * - fetches /api/meals/:userId and returns an array of meals (possibly empty)
 */
async function safeFetchMeals(userId) {
  try {
    const res = await fetch(`${API_BASE}/api/meals/${encodeURIComponent(userId)}`);
    if (!res.ok) return [];
    const json = await res.json();
    // supports { meals: [...] } or direct array or { data: { meals: [...] } }
    const arr = json?.meals ?? json?.data?.meals ?? (Array.isArray(json) ? json : null);
    if (Array.isArray(arr)) return arr;
    // some implementations might return { count, meals }
    if (json && Array.isArray(json.meals)) return json.meals;
    // fallback: try json.data
    if (json && Array.isArray(json.data)) return json.data;
    return [];
  } catch (err) {
    console.warn("safeFetchMeals error", err);
    return [];
  }
}

/**
 * fetchDailyForDates(userId, dates[])
 * - returns map of date -> dailyDoc|null
 */
async function fetchDailyForDates(userId, dates) {
  const map = {};
  if (!userId) {
    dates.forEach(d => { map[d] = null; });
    return map;
  }

  // Note: keep parallel calls for the 7-day window, that's expected;
  // if you introduce a bulk backend endpoint use it instead here.
  const promises = dates.map(async (date) => {
    const daily = await safeFetchDaily(userId, date);
    return { date, daily };
  });
  const results = await Promise.all(promises);
  results.forEach(r => { map[r.date] = r.daily ?? null; });
  return map;
}

/**
 * groupMealsByDate
 */
function groupMealsByDate(meals = []) {
  const map = new Map();
  for (const m of (meals || [])) {
    // Use local date string for createdAt if present
    const date = m.date ? String(m.date) : (m.createdAt ? getLocalDateString(new Date(m.createdAt)) : null);
    const key = date || "unknown";
    if (!map.has(key)) map.set(key, []);
    map.get(key).push(m);
  }
  const arr = Array.from(map.entries()).map(([date, meals]) => ({ date, meals }));
  arr.sort((a,b) => {
    if (a.date === "unknown") return 1;
    if (b.date === "unknown") return -1;
    return b.date.localeCompare(a.date); // descending
  });
  return arr;
}

/**
 * fetchStreakImplementation
 * - If goals provided (object with finite calories/protein/carbs/fats) compute goal-based streak:
 *    consecutive days (backwards from today) where avg(cals/goals.cal, prot/goals.prot, carbs/goals.carbs, fats/goals.fats) >= 1
 * - If goals not provided, compute consecutive days where totalCalories > 0 (fallback)
 *
 * Note: lookbackDays default is intentionally small (30) to avoid browser socket exhaustion.
 * For production, backend should provide a date-range endpoint and this logic should call that instead.
 */
async function fetchStreakImplementation(userId, lookbackDays = 30, goals = null) {
  if (!userId) return 0;
  const dates = [];
  const today = new Date();
  for (let i = 0; i < lookbackDays; i++) {
    const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i);
    // Use local date string to match backend
    dates.push(getLocalDateString(d));
  }
  const dailyMap = await fetchDailyForDates(userId, dates);

  let streak = 0;
  for (const date of dates) {
    const doc = dailyMap[date];
    if (!doc) break; // stop on missing day
    // Prefer canonical completed* fields; fallback to legacy total* if present
    const cals = Number(doc?.completedCalories ?? doc?.totalCalories ?? 0);
    if (!goals || !Number.isFinite(goals.calories) || !Number.isFinite(goals.protein) || !Number.isFinite(goals.carbs) || !Number.isFinite(goals.fats)) {
      // calorie-based fallback
      if (!Number.isFinite(cals) || cals <= 0) break;
      streak += 1;
      continue;
    }
    // goal-based
    const prot = Number(doc?.completedProtein ?? doc?.totalProtein ?? 0);
    const carbs = Number(doc?.completedCarbs ?? doc?.totalCarbs ?? 0);
    const fats = Number(doc?.completedFats ?? doc?.totalFats ?? 0);

    if (!Number.isFinite(cals) || cals <= 0) break;

    const vals = [
      (Number.isFinite(goals.calories) && goals.calories > 0) ? cals / goals.calories : 0,
      (Number.isFinite(goals.protein) && goals.protein > 0) ? prot / goals.protein : 0,
      (Number.isFinite(goals.carbs) && goals.carbs > 0) ? carbs / goals.carbs : 0,
      (Number.isFinite(goals.fats) && goals.fats > 0) ? fats / goals.fats : 0
    ];

    const avg = vals.reduce((s,x) => s + (Number.isFinite(x) ? x : 0), 0) / vals.length;
    if (avg >= 1.0) {
      streak += 1;
    } else {
      break;
    }
  }
  return streak;
}

/**
 * Main hook
 */
export default function useHistoryData(userId, { weekForDate = null, mode = 'rolling', lookbackForStreak = 30 } = {}) {
  const [loading, setLoading] = useState(false);
  const [weekDates, setWeekDates] = useState(() => mode === 'iso' ? getWeekDatesMondayToSunday(weekForDate) : getLastNDates(7, weekForDate));
  const [weekData, setWeekData] = useState([]); // array of 7 day objects
  const [streak, setStreak] = useState(0);
  const [mealGroups, setMealGroups] = useState([]);
  const [lastUpdatedAt, setLastUpdatedAt] = useState(null);

  // Fetch week (Mon->Sun)
  const fetchWeek = useCallback(async (uId, forDate = null) => {
    setLoading(true);
    try {
      const dates = getWeekDatesMondayToSunday(forDate);
      setWeekDates(dates);
      const dailyMap = await fetchDailyForDates(uId, dates);
      const week = dates.map(d => {
        const doc = dailyMap[d];
        return {
          date: d,
          // Prefer canonical completed* fields; fallback to legacy total* to avoid breaking older docs
          calories: Number(doc?.completedCalories ?? doc?.totalCalories ?? 0),
          protein: Number(doc?.completedProtein ?? doc?.totalProtein ?? 0),
          carbs: Number(doc?.completedCarbs ?? doc?.totalCarbs ?? 0),
          fats: Number(doc?.completedFats ?? doc?.totalFats ?? 0),
          fiber: Number(doc?.completedFiber ?? doc?.totalFiber ?? 0),
          sugar: Number(doc?.completedSugar ?? doc?.totalSugar ?? 0),
          raw: doc ?? null
        };
      });
      setWeekData(week);
    } catch (err) {
      console.error("fetchWeek error", err);
      setWeekData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch rolling last 7 days
  const fetchRollingWeek = useCallback(async (uId, endDate = null) => {
    setLoading(true);
    try {
      const dates = getLastNDates(7, endDate);
      setWeekDates(dates);
      const dailyMap = await fetchDailyForDates(uId, dates);
      const week = dates.map(d => {
        const doc = dailyMap[d];
        return {
          date: d,
          // Prefer canonical completed* fields; fallback to legacy total* to avoid breaking older docs
          calories: Number(doc?.completedCalories ?? doc?.totalCalories ?? 0),
          protein: Number(doc?.completedProtein ?? doc?.totalProtein ?? 0),
          carbs: Number(doc?.completedCarbs ?? doc?.totalCarbs ?? 0),
          fats: Number(doc?.completedFats ?? doc?.totalFats ?? 0),
          fiber: Number(doc?.completedFiber ?? doc?.totalFiber ?? 0),
          sugar: Number(doc?.completedSugar ?? doc?.totalSugar ?? 0),
          raw: doc ?? null
        };
      });
      setWeekData(week);
    } catch (err) {
      console.error("fetchRollingWeek error", err);
      setWeekData([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch streak, optionally with goals
  const fetchStreakForUser = useCallback(async (uId, lookback = lookbackForStreak, goals = null) => {
    try {
      const s = await fetchStreakImplementation(uId, lookback, goals);
      setStreak(s);
    } catch (err) {
      console.error("fetchStreak error", err);
      setStreak(0);
    }
  }, [lookbackForStreak]);

  // Fetch all meals (we group them; UI will filter to the week window)
  const fetchMealHistory = useCallback(async (uId) => {
    setLoading(true);
    try {
      const meals = await safeFetchMeals(uId);
      const grouped = groupMealsByDate(meals);
      setMealGroups(grouped);
    } catch (err) {
      console.error("fetchMealHistory error", err);
      setMealGroups([]);
    } finally {
      setLoading(false);
    }
  }, []);

  /**
   * Memoized, stable action wrappers
   * These are returned to the consumer so that components using them as dependencies
   * do NOT trigger re-renders or effect loops due to changing function identity.
   */
  const refreshWeek = useCallback((d) => fetchWeek(userId, d), [fetchWeek, userId]);
  const refreshWeekRolling = useCallback((endDate) => fetchRollingWeek(userId, endDate), [fetchRollingWeek, userId]);
  const refreshStreak = useCallback((goals) => fetchStreakForUser(userId, lookbackForStreak, goals), [fetchStreakForUser, userId, lookbackForStreak]);
  const refreshMeals = useCallback(() => fetchMealHistory(userId), [fetchMealHistory, userId]);

  // Full refresh (memoized)
  const refreshAll = useCallback(async (uId = userId) => {
    if (!uId) return;
    setLastUpdatedAt(new Date().toISOString());
    if (mode === 'iso') {
      await Promise.all([
        fetchWeek(uId, weekForDate),
        fetchStreakForUser(uId, lookbackForStreak, null),
        fetchMealHistory(uId)
      ]);
    } else {
      await Promise.all([
        fetchRollingWeek(uId, weekForDate),
        fetchStreakForUser(uId, lookbackForStreak, null),
        fetchMealHistory(uId)
      ]);
    }
  }, [userId, mode, weekForDate, lookbackForStreak, fetchWeek, fetchRollingWeek, fetchStreakForUser, fetchMealHistory]);

  // Auto-run on mount / userId changes (one-time load; depends only on userId)
  useEffect(() => {
    if (!userId) {
      setWeekData([]);
      setMealGroups([]);
      setStreak(0);
      return;
    }

    let mounted = true;

    async function firstLoad() {
      setLastUpdatedAt(new Date().toISOString());

      if (mode === 'iso') {
        await fetchWeek(userId, weekForDate);
      } else {
        await fetchRollingWeek(userId, weekForDate);
      }

      await fetchMealHistory(userId);

      if (mounted) {
        await fetchStreakForUser(userId, lookbackForStreak, null);
      }
    }

    firstLoad();

    return () => { mounted = false; };
  }, [userId, fetchWeek, fetchRollingWeek, fetchMealHistory, fetchStreakForUser, mode, weekForDate, lookbackForStreak]);

  return {
    weekDates,
    weekData,
    streak,
    mealGroups,
    loading,
    lastUpdatedAt,

    // actions:
    refreshWeek,
    refreshWeekRolling,
    refreshStreak,
    refreshMeals,
    refreshAll
  };
}