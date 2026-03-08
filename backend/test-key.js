import dotenv from "dotenv";
dotenv.config();

const key = process.env.GEMINI_API_KEY;
console.log("Key:", JSON.stringify(key));
console.log("Length:", key?.length);
console.log("Starts with AIzaSy:", key?.startsWith("AIzaSy"));

// Test the key directly with fetch
const url = `https://generativelanguage.googleapis.com/v1beta/models?key=${key}`;
const res = await fetch(url);
const data = await res.json();
console.log("Status:", res.status);
console.log("Response:", JSON.stringify(data).slice(0, 300));