// backend/utils/dateUtils.js

// ---------------------------
// Helper: get local date string (YYYY-MM-DD)
// ---------------------------
export function getLocalDateString(d = new Date()) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}
