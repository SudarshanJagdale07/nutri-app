// backend/parsers/foodTextParser.js
import { PREPARATION_WORDS } from "../constants/units.js";
import { normalizeUnit } from "../utils/textUtils.js";

// ---------------------------
// Improved deterministic fallback parser
// - Removes conjunctions/prepositions and tries to extract quantity/unit/name
// - Sets preparation hint at segment level if user specified words like 'home', 'outside', 'packaged'
// - Strips preparation words from dish names so they do not remain as part of the dish label
// - Robustly handles attached units like "500ml", "200g", "1.5kg" (with or without space) and trailing units
// ---------------------------
export function simpleParse(text) {
  const items = [];
  if (!text || typeof text !== "string") return { items: [], preparationHint: null };

  // Normalize separators and remove parentheses
  let normalized = text
    .replace(/^\s*i\s+(ate|had|drank|consumed|eaten|drink|eat|have)\s+/i, "")
    .replace(/[()]/g, " ")
    .replace(/[,;&+]/g, " , ")
    .replace(/\s{2,}/g, " ")
    .trim();

  const lower = normalized.toLowerCase();

  // detect global preparation hint from the whole text
  let preparationHint = null;
  if (/\b(home|house|ghar|ghar ka|ghar\-ka)\b/.test(lower)) preparationHint = "home";
  else if (/\b(restaurant|outside|out|dhaba|hotel|street|streetfood)\b/.test(lower)) preparationHint = "outside";
  else if (/\b(pack|packed|packaged|packet|tiffin|parcel)\b/.test(lower)) preparationHint = "packaged";

  // Break into segments on comma / semicolon / and / plus
  const segments = normalized.split(/\s*(?:,|\band\b|\+|&|;)\s*/i).map(s => s.trim()).filter(Boolean);

  for (let segRaw of segments) {
    if (!segRaw) continue;

    // Remove stray stopwords/prepositions at edges
    let seg = segRaw
      .replace(/^\s*(?:then\s+)?(?:in\s+)?(?:morning|evening|afternoon|night|breakfast|lunch|dinner|snack)\s+/i, "")
      .replace(/^\s*i\s+(ate|had|drank|consumed|eaten|drink|eat|have)\s+/i, "")
      .replace(/(^\b(?:a|an|the|with|and|of|for|in|on|at)\b)|(\b(?:a|an|the|with|and|of|for|in|on|at)\b$)/gi, "").trim();

    // Replace multiple spaces
    seg = seg.replace(/\s{2,}/g, " ").trim();

    // Identify any local preparation hint inside this segment
    let segPrep = null;
    const l = seg.toLowerCase();
    if (/\b(home|house|ghar|ghar ka|ghar\-ka)\b/.test(l)) segPrep = "home";
    else if (/\b(restaurant|outside|out|dhaba|hotel|street|streetfood)\b/.test(l)) segPrep = "outside";
    else if (/\b(pack|packed|packaged|packet|tiffin|parcel)\b/.test(l)) segPrep = "packaged";

    // Remove words like 'of', 'with' inside segment to simplify
    seg = seg.replace(/\b(of|with|and|in|on|at|for|from|to)\b/gi, " ");

    // Remove preparation words from the segment so they don't become part of the dish name
    for (const pw of PREPARATION_WORDS) {
      const pwEsc = pw.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
      const re = new RegExp(`\\b${pwEsc}\\b`, "gi");
      seg = seg.replace(re, " ");
    }

    // Trim again
    seg = seg.replace(/\s{2,}/g, " ").trim();

    // Replace word-based fractions/numbers at start of segment
    seg = seg.replace(/^half\b/i, "0.5").replace(/^quarter\b/i, "0.25").replace(/^a\s+quarter\b/i, "0.25").replace(/^one\b/i, "1").replace(/^two\b/i, "2").replace(/^three\b/i, "3").replace(/^four\b/i, "4").replace(/^five\b/i, "5");
    seg = seg.replace(/\s{2,}/g, " ").trim();

    // Unified unit token regex (supports g, gm, gram, kg, ml, l, litre, cup etc.)
    const UNIT_TOKEN =
      "(kg|g|gm|gram|grams|ml|l|litre|liter|cup|cups|bowl|bowls|handful|handfuls|serving|servings|slice|slices|piece|pieces|plate|plates|katori|katoris|pcs)";

    // 1) Leading quantity with optional unit and then name: "500ml milk" or "2 roti" or "1.5kg potatoes"
    let m = seg.match(new RegExp("^\\s*(\\d+(?:[\\.,]\\d+)?)\\s*(?:" + UNIT_TOKEN + ")?\\s+(.+?)\\s*$", "i"));
    if (m) {
      const qty = Number(String(m[1]).replace(",", "."));
      const unitRaw = (m[2] || "").toLowerCase();
      let unit = unitRaw ? normalizeUnit(unitRaw) : "serving";
      let name = (m[3] || "").trim().toLowerCase();
      // Remove any stray units from name just in case
      name = name.replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      // Remove stopwords & prep words
      name = name.replace(/\b(the|a|an|of|with|home|outside|restaurant|packed|packaged|dhaba|hotel|street|tiffin)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit, preparation: segPrep || preparationHint });
      continue;
    }

    // 1b) Leading quantity attached to unit without space: "500mlmilk" (unlikely but we handle number+unit attached directly before name)
    m = seg.match(new RegExp("^\\s*(\\d+(?:[\\.,]\\d+)?)(?:" + UNIT_TOKEN + ")(.+?)\\s*$", "i"));
    if (m) {
      const qty = Number(String(m[1]).replace(",", "."));
      const rest = (m[2] || "").trim();
      const unit = "serving";
      let name = rest.toLowerCase().replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      name = name.replace(/\b(the|a|an|of|with|home|outside|restaurant|packed|packaged|dhaba|hotel|street|tiffin)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit, preparation: segPrep || preparationHint });
      continue;
    }

    // 2) Trailing quantity or trailing quantity+unit after name: "milk 500ml" or "groundnut 200 g"
    m = seg.match(new RegExp("^\\s*(.+?)\\s+(\\d+(?:[\\.,]\\d+)?)\\s*(?:" + UNIT_TOKEN + ")?\\s*$", "i"));
    if (m) {
      let name = (m[1] || "").trim().toLowerCase();
      const qty = Number(String(m[2]).replace(",", "."));
      const unitRaw = (m[3] || "").toLowerCase();
      const unit = unitRaw ? normalizeUnit(unitRaw) : "serving";
      // Clean name from unit words if any
      name = name.replace(new RegExp("\\b" + UNIT_TOKEN + "\\b", "gi"), "").trim();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      items.push({ name: name || seg, quantity: qty, unit, preparation: segPrep || preparationHint });
      continue;
    }

    // 3) pattern like "2x chapati" or "chapati x2"
    m = seg.match(/^\s*(.+?)\s*(?:x|\*)\s*(\d+(?:[\.،]\d+)?)\s*$/i);
    if (m) {
      let name = m[1].trim().toLowerCase();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      const qty = Number(String(m[2]).replace(",", "."));
      items.push({ name: name, quantity: qty, unit: "piece", preparation: segPrep || preparationHint });
      continue;
    }

    // 4) descriptive sizes: "a handful of nuts", "a medium bowl of salad"
    m = seg.match(/^\s*(?:a|an|the)?\s*(small|medium|large)?\s*(handful|bowl|cup|serving|slice|piece|plate)?(?:\s+of)?\s+(.+?)\s*$/i);
    if (m) {
      const size = (m[1] || "").toLowerCase();
      const unitWord = (m[2] || "").toLowerCase();
      let name = (m[3] || "").trim().toLowerCase();
      name = name.replace(/\b(home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
      let unit = "serving";
      if (unitWord) unit = unitWord;
      else if (size) unit = size === "small" ? "small bowl" : size === "large" ? "large bowl" : "serving";
      items.push({ name, quantity: 1, unit: normalizeUnit(unit), preparation: segPrep || preparationHint });
      continue;
    }

    // 5) last resort - treat as single serving
    const cleanedName = seg.replace(/\b(the|a|an|of|with|home|outside|restaurant|pack|packed|packaged|packet|tiffin|dhaba|hotel|street)\b/gi, "").trim();
    if (cleanedName) {
      items.push({ name: cleanedName.toLowerCase(), quantity: 1, unit: "serving", preparation: segPrep || preparationHint });
      continue;
    }
  }

  // Normalize items
  const cleaned = items.map(it => {
    const name = String(it.name || "").replace(/[-_]+/g, " ").replace(/\s{2,}/g, " ").trim();
    return { name, quantity: Number(it.quantity) || 1, unit: normalizeUnit(it.unit), preparation: it.preparation || preparationHint || null };
  });

  return { items: cleaned, preparationHint };
}
