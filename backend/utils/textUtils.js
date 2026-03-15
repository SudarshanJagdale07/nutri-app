// backend/utils/textUtils.js

// ---------------------------
// Helper: normalize unit string to a canonical form
// ---------------------------
export function normalizeUnit(u) {
  if (!u) return "serving";
  const s = String(u).toLowerCase().trim();
  if (s.match(/^(kg|kilogram|kilograms)$/)) return "kg";
  if (s.match(/^(g|gram|grams|gm)$/)) return "g";
  if (s.match(/^(ml|milliliter|millilitre|milliliters|millilitres)$/)) return "ml";
  if (s.match(/^(l|litre|liter)$/)) return "l";
  if (s.match(/^(cup|cups)$/)) return "cup";
  if (s.match(/^(bowl|bowls|medium bowl|small bowl|large bowl)$/)) return "bowl";
  if (s.match(/^(handful|handfuls)$/)) return "handful";
  if (s.match(/^(slice|slices)$/)) return "slice";
  if (s.match(/^(piece|pieces|serving|servings)$/)) return "serving";
  if (s.match(/^(katori|katoris)$/)) return "katori";
  if (s.match(/^(plate|plates)$/)) return "plate";
  if (s.match(/^(pcs)$/)) return "bowl";
  return s;
}

// ---------------------------
// Utility: escape regex special chars for safe regex construction
// ---------------------------
export function escapeRegex(s) {
  return String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ---------------------------
// Helper: normalize text (strip punctuation, diacritics, collapse spaces)
// ---------------------------
export function normalizeText(s) {
  if (!s) return "";
  // remove diacritics
  const noDiacritics = s.normalize ? s.normalize("NFKD").replace(/[\u0300-\u036f]/g, "") : s;
  return String(noDiacritics).toLowerCase().replace(/[^\w\s]/g, " ").replace(/\s+/g, " ").trim();
}
