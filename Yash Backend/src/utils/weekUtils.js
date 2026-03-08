// frontend/src/utils/weekUtils.js
/**
 * Given a date (Date or string), return Monday of that ISO week as Date (local timezone).
 * If no date passed, use today.
 */
export function getWeekStartMonday(d = null) {
  const date = d ? new Date(d) : new Date();
  // create copy at local midnight
  const copy = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  // getDay: 0 (Sun) .. 6 (Sat). ISO weekday: Mon=1..Sun=7
  const day = copy.getDay();
  // compute offset to Monday
  const diffToMonday = ((day + 6) % 7); // 0 when Monday
  copy.setDate(copy.getDate() - diffToMonday);
  return new Date(copy.getFullYear(), copy.getMonth(), copy.getDate());
}

/**
 * Helper: Return local date string (YYYY-MM-DD) using local timezone.
 * This avoids UTC conversion issues from toISOString().
 */
export function getLocalDateString(date) {
  const d = new Date(date);
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, "0");
  const dd = String(d.getDate()).padStart(2, "0");
  return `${yyyy}-${mm}-${dd}`;
}

/**
 * Return array of 7 date strings (yyyy-mm-dd) from Monday → Sunday for the week containing `d`
 */
export function getWeekDatesMondayToSunday(d = null) {
  const start = getWeekStartMonday(d);
  const out = [];
  for (let i = 0; i < 7; i++) {
    const dt = new Date(start.getFullYear(), start.getMonth(), start.getDate() + i);
    // Use local date string to match backend date normalization
    out.push(getLocalDateString(dt));
  }
  return out;
}

/**
 * Helper: Return array of N date strings (yyyy-mm-dd) ending at endDate (inclusive).
 * If endDate is null, uses today.
 * The order returned is oldest → newest (so for 7 days ending today it returns [today-6, ..., today])
 */
export function getLastNDates(n = 7, endDate = null) {
  const end = endDate ? new Date(endDate) : new Date();
  const arr = [];
  for (let i = n - 1; i >= 0; i--) {
    const dt = new Date(end.getFullYear(), end.getMonth(), end.getDate() - i);
    // Use local date string to match backend date normalization
    arr.push(getLocalDateString(dt));
  }
  return arr;
}

/**
 * Format a number with up to 2 decimal places:
 * - if integer → show integer (no decimals)
 * - if fractional → show with 2 decimals (rounded)
 */
export function formatNumberSmart(n) {
  if (n === null || typeof n === "undefined") return "—";
  const num = Number(n);
  if (!isFinite(num)) return "—";
  if (Math.abs(Math.round(num) - num) < 1e-9) return String(Math.round(num));
  return num.toFixed(2);
}

/**
 * Map daily nutrition results to week array for charts.
 * Input: an object map { 'YYYY-MM-DD': { totalCalories, totalProtein, ... }, ... }
 * Output: array of 7 objects: [{ date: 'YYYY-MM-DD', calories: number|null, protein: number|null, ... }, ...]
 * Null is used when day has no data (so chart line stops).
 */
export function mapDailyTotalsToWeek(dailyMap, weekDates) {
  return weekDates.map(date => {
    const d = dailyMap?.[date];
    if (!d) return { date, calories: null, protein: null, carbs: null, fats: null };
    return {
      date,
      calories: typeof d.totalCalories === "number" ? d.totalCalories : null,
      protein: typeof d.totalProtein === "number" ? d.totalProtein : null,
      carbs: typeof d.totalCarbs === "number" ? d.totalCarbs : null,
      fats: typeof d.totalFats === "number" ? d.totalFats : null
    };
  });
}

export default {
  getWeekStartMonday,
  getWeekDatesMondayToSunday,
  getLastNDates,
  getLocalDateString,
  formatNumberSmart,
  mapDailyTotalsToWeek
};