/**
 * Converts a Firebase service account JSON file into a single-line
 * FIREBASE_SERVICE_ACCOUNT_KEY=... entry you can paste into your .env file.
 *
 * Usage:
 *   node make-env-line.js path/to/newServiceAccount.json
 *
 * This writes the result to env-line.txt next to this script.
 * Delete env-line.txt once you've copied it into your real .env.
 */

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const inputPath = process.argv[2];

if (!inputPath) {
  console.error("Usage: node make-env-line.js path/to/serviceAccount.json");
  process.exit(1);
}

if (!fs.existsSync(inputPath)) {
  console.error(`File not found: ${inputPath}`);
  process.exit(1);
}

let json;
try {
  const raw = fs.readFileSync(inputPath, "utf-8");
  json = JSON.parse(raw);
} catch (err) {
  console.error("Failed to parse JSON file:", err.message);
  process.exit(1);
}

if (json.type !== "service_account") {
  console.warn('Warning: "type" field is not "service_account" — make sure this is the right file.');
}

const minified = JSON.stringify(json);
const line = `FIREBASE_SERVICE_ACCOUNT_KEY=${minified}`;

const outputPath = path.join(__dirname, "env-line.txt");
fs.writeFileSync(outputPath, line + "\n", "utf-8");

console.log(`Done. Wrote single-line env entry to: ${outputPath}`);
console.log(`Also add this line to your .env: FIREBASE_PROJECT_ID=${json.project_id || "<your-project-id>"}`);
console.log("\nReminder: copy the contents of env-line.txt into your real .env file, then delete env-line.txt.");