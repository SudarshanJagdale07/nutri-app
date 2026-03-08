// frontend/src/apiManager/predictiveApi.js
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

// Feature 7: Get predictive tomorrow view
export async function getPredictiveTomorrow(userId) {
  const res = await fetch(`${BASE_URL}/api/predictive/${userId}/tomorrow`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  if (!res.ok) throw new Error("Failed to fetch prediction");
  return res.json();
}

// Feature 6: Get insights
export async function getInsights(userId) {
  const res = await fetch(`${BASE_URL}/api/predictive/${userId}/insights`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  if (!res.ok) throw new Error("Failed to fetch insights");
  return res.json();
}

// Feature 8: Get risk analysis
export async function getRiskAnalysis(userId) {
  const res = await fetch(`${BASE_URL}/api/predictive/${userId}/risk`, {
    headers: { Authorization: `Bearer ${localStorage.getItem("token")}` }
  });
  if (!res.ok) throw new Error("Failed to fetch risk analysis");
  return res.json();
}