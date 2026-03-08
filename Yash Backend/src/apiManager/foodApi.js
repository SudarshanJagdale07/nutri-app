// frontend/src/apiManager/foodApi.js
// API client for food / nutrition endpoints used by the frontend.
// Keep comments — this file exports helper functions used across the app.

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

/**
 * Central response handler:
 * - tries to parse JSON when possible
 * - throws a helpful Error when response is not ok
 */
async function handleResponse(res) {
  const text = await res.text();
  try {
    const json = text ? JSON.parse(text) : null;
    if (!res.ok) throw new Error(json?.error || json?.message || `HTTP ${res.status}`);
    return json;
  } catch (e) {
    if (!res.ok) throw new Error(text || `HTTP ${res.status}`);
    return null;
  }
}

/**
 * Analyze text and persist a meal on the server.
 * POST /api/log-text
 * Body: { text, userId, persist, selectionMap }
 * Returns: parsed meal object (or server response shape)
 *
 * Note: server may return either:
 *  - the meal object directly, or
 *  - { meal, candidates } where candidates is an array of ambiguous matches
 */
export async function postLogText(payload) {
  const res = await fetch(`${API_BASE}/api/log-text`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload)
  });
  return handleResponse(res);
}

/**
 * Get meals for a user (history).
 * GET /api/meals/:userId?limit=...&before=...
 * Returns: { count, meals }
 */
export async function getMealsForUser(userId, { limit = 50, before } = {}) {
  const params = new URLSearchParams();
  if (limit) params.set("limit", String(limit));
  if (before) params.set("before", new Date(before).toISOString());
  const res = await fetch(`${API_BASE}/api/meals/${encodeURIComponent(userId)}?${params.toString()}`);
  return handleResponse(res);
}

/**
 * Persist daily totals for a user and date.
 * POST /api/daily/add
 * Body: { userId, date: "YYYY-MM-DD", totals: { calories, protein, carbs, fats, fiber, sugar }, mealId }
 * The backend will upsert into daily_nutrition collection.
 */
export async function postAddToDaily(body) {
  const res = await fetch(`${API_BASE}/api/daily/add`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
  return handleResponse(res);
}

/**
 * Fetch daily nutrition document for a user and date.
 * GET /api/daily/:userId/:date
 * - userId: string
 * - date: "YYYY-MM-DD"
 *
 * Returns shape expected by frontend:
 * { daily: { totalCalories, totalProtein, totalCarbs, totalFats, totalFiber, totalSugar, mealIds } }
 *
 * NOTE: backend must implement this route. If your backend uses a different path,
 * update this function to match the server route.
 */
export async function getDailyNutrition(userId, date) {
  if (!userId || !date) {
    throw new Error("getDailyNutrition requires userId and date");
  }
  const res = await fetch(`${API_BASE}/api/daily/${encodeURIComponent(userId)}/${encodeURIComponent(date)}`);
  return handleResponse(res);
}


/**
 * Analyze an uploaded image on the server.
 * POST /food-image/analyze
 * Body: multipart/form-data with field "image"
 * Returns: { success, ml, analysis }
 */
export async function postImageAnalyze(formData) {
  const res = await fetch(`${API_BASE}/food-image/analyze`, {
    method: "POST",
    body: formData
  });
  return handleResponse(res);
}