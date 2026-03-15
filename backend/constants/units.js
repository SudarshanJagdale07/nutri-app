// backend/constants/units.js

// ---------------------------
// Unit mapping for descriptive units
// ---------------------------
export const UNIT_GRAMS_MAP = {
  handful: 30,
  "small handful": 20,
  "large handful": 40,
  bowl: 150,
  "medium bowl": 150,
  "small bowl": 100,
  katori: 150,
  plate: 200,
  cup: 180,
  serving: 100,
  piece: 40,
  slice: 30
};

// ---------------------------
// Synonyms map to help matching common local names
// Add more mappings as you discover mismatches in your DB.
// ---------------------------
export const SYNONYMS = {
  roti: ["chapati", "phulka", "roti"],
  chapati: ["roti", "phulka", "chapati"],
  phulka: ["roti", "chapati", "phulka"],
  "whole wheat roti": ["roti", "chapati", "whole wheat roti"],
  dal: ["dal", "lentil", "dhal"],
  rice: ["rice", "steamed rice", "boiled rice"],
  egg: ["egg", "eggs"]
};

// ---------------------------
// Stopwords / prepositions to remove from fallback parsing
// ---------------------------
export const STOPWORDS = new Set([
  "with","and","in","on","at","from","to","for","of","a","an","the","by","into","onto"
]);

// ---------------------------
// Preparation words to strip from dish names when parsing
// ---------------------------
export const PREPARATION_WORDS = new Set([
  "home","house","ghar","ghar ka","ghar-ka","restaurant","outside","dhaba","hotel","street","streetfood",
  "pack","packed","packaged","packet","tiffin","parcel"
]);
