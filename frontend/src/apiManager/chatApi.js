// frontend/src/apiManager/chatApi.js
const BASE_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

export async function sendChatMessage(userId, message, history = []) {
  const res = await fetch(`${BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${localStorage.getItem("token")}`
    },
    body: JSON.stringify({ userId, message, history })
  });
  if (!res.ok) throw new Error("Failed to get AI response");
  return res.json();
}