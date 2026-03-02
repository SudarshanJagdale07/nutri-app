// backend/services/imageAnalysisService.js
import { spawn } from "child_process";
import path from "path";
import fs from "fs";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const ML_SCRIPT = path.resolve(__dirname, "../ml/predict.py");
const DEFAULT_TIMEOUT_MS = Number(process.env.FOOD_ANALYSIS_TIMEOUT_MS || 30000);

// Candidate python executables (in order). We try each until one works.
// - If user set PYTHON_PATH, try that first.
// - On Windows, prefer 'py -3.13' (explicit) then 'py'.
// - Then try common names 'python3', 'python'.
const buildCandidates = () => {
  const candidates = [];
  if (process.env.PYTHON_PATH) candidates.push({ exe: process.env.PYTHON_PATH, args: [] });
  if (process.env.PYTHON) candidates.push({ exe: process.env.PYTHON, args: [] });

  // Windows-specific: try py with explicit version if available in system
  // We include -3.13 because your system showed Python 3.13 installed.
  if (process.platform === "win32") {
    candidates.push({ exe: "py", args: ["-3.13"] });
    candidates.push({ exe: "py", args: [] });
  }

  // Common unix names
  candidates.push({ exe: "python3", args: [] });
  candidates.push({ exe: "python", args: [] });

  return candidates;
};

if (!fs.existsSync(ML_SCRIPT)) {
  console.warn(`[foodAnalysisService] ML script not found at ${ML_SCRIPT}`);
}

/**
 * Try to spawn python with given candidate and return a promise that resolves
 * with the same shape as analyzeFood would.
 */
function runCandidate(candidate, absImagePath, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const args = [...(candidate.args || []), ML_SCRIPT, absImagePath];
      const child = spawn(candidate.exe, args, { stdio: ["ignore", "pipe", "pipe"] });

      let stdout = "";
      let stderr = "";
      let finished = false;

      const finish = (obj) => {
        if (finished) return;
        finished = true;
        try { child.kill(); } catch (e) {}
        resolve(obj);
      };

      const timer = setTimeout(() => {
        finish({ success: false, error: `Python timed out after ${timeoutMs}ms`, candidate });
      }, timeoutMs);

      child.stdout.on("data", (d) => { stdout += d.toString(); });
      child.stderr.on("data", (d) => { stderr += d.toString(); });

      child.on("error", (err) => {
        clearTimeout(timer);
        finish({ success: false, error: `Failed to spawn ${candidate.exe}`, details: err.message, candidate, stderr });
      });

      child.on("close", (code) => {
        clearTimeout(timer);
        const outTrim = stdout.trim();
        const errTrim = stderr.trim();

        // If non-zero exit and no stdout, return debug info
        if (code !== 0 && !outTrim) {
          return finish({ success: false, error: `Python exited ${code}`, exitCode: code, candidate, stdout: outTrim || null, stderr: errTrim || null });
        }

        // Try parse last non-empty line as JSON
        try {
          const lastLine = outTrim.split(/\r?\n/).reverse().find(Boolean) || "";
          const parsed = lastLine ? JSON.parse(lastLine) : null;
          if (parsed && typeof parsed === "object") {
            // success: include which candidate succeeded
            return finish({ success: true, candidate, ...parsed });
          } else {
            return finish({ success: false, error: "Invalid JSON from Python", candidate, rawStdout: outTrim, stderr: errTrim });
          }
        } catch (e) {
          return finish({ success: false, error: "Failed to parse Python output", parseError: e.message, candidate, rawStdout: outTrim, stderr: errTrim });
        }
      });
    } catch (e) {
      resolve({ success: false, error: `Service error running candidate ${candidate.exe}`, details: e.message, candidate });
    }
  });
}

/**
 * analyzeFood(imagePath)
 * - imagePath: path to uploaded image (relative or absolute)
 * Returns: { success: boolean, dish?: string, confidence?: number, error?: string, ...debug }
 */
export async function analyzeFood(imagePath, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  try {
    if (!imagePath) return { success: false, error: "No image path provided" };

    const absImagePath = path.isAbsolute(imagePath) ? imagePath : path.resolve(process.cwd(), imagePath);
    if (!fs.existsSync(absImagePath)) return { success: false, error: `Image not found: ${absImagePath}` };
    if (!fs.existsSync(ML_SCRIPT)) return { success: false, error: `ML script not found: ${ML_SCRIPT}` };

    const candidates = buildCandidates();

    // Try each candidate sequentially until one returns success:true
    const errors = [];
    for (const c of candidates) {
      // runCandidate returns an object describing result
      const res = await runCandidate(c, absImagePath, timeoutMs);
      if (res && res.success) {
        // success — return immediately
        return res;
      }
      // collect debug info and continue to next candidate
      errors.push(res);
      // If the error indicates ultralytics import failed, keep trying other candidates
    }

    // If we reach here, all candidates failed — return aggregated debug info
    return { success: false, error: "All python candidates failed", attempts: errors };
  } catch (e) {
    return { success: false, error: `Service error: ${e.message}` };
  }
}

export default { analyzeFood };