// frontend/src/apiManager/chatApi.js
import { getToken } from "../helper";

const API_BASE = import.meta.env.VITE_API_BASE_URL || "http://localhost:5000";

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
 * Send a message to the AI Assistant.
 * POST /api/chat
 * Body: { message }
 * Headers: { Authorization: Bearer <token> }
 */
export async function postChatMessage(message) {
  const token = getToken();
  const res = await fetch(`${API_BASE}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "Authorization": `Bearer ${token}`
    },
    body: JSON.stringify({ message })
  });
  return handleResponse(res);
}
