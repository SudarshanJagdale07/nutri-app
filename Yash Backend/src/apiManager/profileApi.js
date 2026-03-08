// frontend/src/api/profileApi.js
const API_URL = "http://localhost:5000";

export const fetchProfile = async (userId) => {
  const res = await fetch(`${API_URL}/profile/${userId}`);
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to fetch profile");
  return { data };
};

export const saveProfile = async (payload) => {
  // payload should include computed fields from nutrition engine when available
  const res = await fetch(`${API_URL}/profile/update`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || "Failed to update profile");
  return { data };
};