// frontend/src/utils/fuzzy.js
import Fuse from "fuse.js";

/**
 * Run Fuse.js on a small candidate list returned by the server.
 * candidates: array of objects { _id, displayName, aliases, searchTerms, ... }
 * query: original user input string
 * returns: best match object or null
 */
export function pickBestCandidate(candidates = [], query = "") {
  if (!Array.isArray(candidates) || candidates.length === 0) return null;
  const options = {
    keys: [
      { name: "displayName", weight: 0.7 },
      { name: "aliases", weight: 0.5 },
      { name: "searchTerms", weight: 0.4 }
    ],
    threshold: 0.35, // tune this: lower = stricter
    distance: 100,
    minMatchCharLength: 2,
    includeScore: true
  };
  const fuse = new Fuse(candidates, options);
  const results = fuse.search(query || "");
  if (!results || results.length === 0) return null;
  // results[0] is the best match
  return { item: results[0].item, score: results[0].score };
}

/**
 * Return top N suggestions for UI
 */
export function topCandidates(candidates = [], query = "", limit = 5) {
  if (!Array.isArray(candidates) || candidates.length === 0) return [];
  const options = {
    keys: ["displayName", "aliases", "searchTerms"],
    threshold: 0.45,
    distance: 100,
    minMatchCharLength: 2,
    includeScore: true
  };
  const fuse = new Fuse(candidates, options);
  const results = fuse.search(query || "");
  return results.slice(0, limit).map(r => ({ item: r.item, score: r.score }));
}