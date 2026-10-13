// Dev-time check: confirm the design tokens and utilities we rely on actually
// make it into the built stylesheet. Run with: node scripts/check-css.mjs
import { readFileSync } from "node:fs";

const html = readFileSync("dist-website/index.html", "utf8");

const probes = [
  // Categorical palette (distinct hues; do not collapse onto tones)
  "--chart-1",
  "--chart-5",
  "--chart-6",
  "--chart-7",
  // Tone tokens
  "--tone-success",
  "--tone-warning",
  "--tone-danger",
  "--tile-tone",
  "--primary:",
  "--background:",
  // Utilities
  ".tabular",
  ".surface",
  ".surface-sunken",
  ".icon-tile",
  ".banner",
  ".banner-watermark",
  ".row-selected",
  ".tone-success",
  ".page-enter",
  // Tailwind colour utilities built from @theme
  ".text-chart-1",
  ".text-tone-success-fg",
  ".text-tone-danger-fg",
  ".text-primary",
  ".bg-primary",
];

// Negative probes: dead aliases that should not be present in the bundle
const absentProbes = [
  ".neu{",
];

let missing = 0;
for (const p of probes) {
  const found = html.includes(p);
  if (!found) missing++;
  console.log(`${found ? "FOUND  " : "MISSING"}  ${p}`);
}
for (const p of absentProbes) {
  const present = html.includes(p);
  if (present) {
    missing++;
    console.log(`FAIL (present): ${p}`);
  } else {
    console.log(`ABSENT (good):  ${p}`);
  }
}
console.log(missing === 0 ? "\nAll probes passed." : `\n${missing} probe(s) failed.`);
