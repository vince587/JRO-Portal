/**
 * One-shot codemod: text-only status colours -> the tone foreground tokens.
 *
 * `codemod-tones.mjs` deliberately skipped strings with no background, because a
 * tone class adds a fill and would turn a coloured line of text into a pill.
 * These are the same drift in text form though - `text-emerald-600
 * dark:text-emerald-400` and friends - so they get their own pass.
 *
 * The trigger is deliberately narrow: both halves of the light/dark pair must be
 * present for the same colour family. That pairing is a deliberate status
 * treatment, which keeps decorative icon tints (`text-green-600` on a
 * spreadsheet icon, `text-blue-600` on a document icon) untouched.
 *
 *   node scripts/codemod-tones-text.mjs [--dry] [--show <substring>]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "src";
const DRY = process.argv.includes("--dry");
const SHOW = (() => {
  const i = process.argv.indexOf("--show");
  return i === -1 ? null : process.argv[i + 1].replace(/\\/g, "/");
})();

/** Status families only. Categories such as `green` (file icons) are excluded. */
const TONE_BY_FAMILY = {
  emerald: "success",
  green: "success",
  amber: "warning",
  orange: "warning",
  red: "danger",
  rose: "danger",
  blue: "info",
  indigo: "info",
};

/** `text-emerald-600` or `dark:text-emerald-400`, with optional hover:/focus:. */
const TEXT = /^(hover:|focus:|group-hover:)?(dark:)?text-([a-z]+)-(\d{2,3})$/;

function transform(cls) {
  const tokens = cls.split(/\s+/).filter(Boolean);

  // Collect the families that appear in both a base and a dark: form.
  const light = new Set();
  const dark = new Set();
  for (const tok of tokens) {
    const m = TEXT.exec(tok);
    if (!m || !TONE_BY_FAMILY[m[3]]) continue;
    if (m[2]) dark.add(m[3]);
    else light.add(m[3]);
  }
  const paired = [...light].filter((f) => dark.has(f));
  if (paired.length === 0) return cls;

  let changed = false;
  const out = tokens.map((tok) => {
    const m = TEXT.exec(tok);
    if (!m || !TONE_BY_FAMILY[m[3]] || !paired.includes(m[3])) return tok;
    changed = true;
    // The token already covers both themes, so the `dark:` half is dropped.
    return `${m[1] ?? ""}text-tone-${TONE_BY_FAMILY[m[3]]}-fg`;
  });

  // The light and dark halves collapse onto the same token.
  const deduped = out.filter((tok, i) => out.indexOf(tok) !== i);
  return changed ? deduped.join(" ") : cls;
}

/** Only strings that contain one half of a pair. */
const CANDIDATE = /(dark:)?text-(emerald|green|amber|orange|red|rose|blue|indigo)-(400|600)/;

function transformFile(src) {
  const quoted = /"([^"\n]*)"/g;
  let changed = 0;
  const log = [];

  const next = src.replace(quoted, (match, inner) => {
    if (!CANDIDATE.test(inner)) return match;
    const updated = transform(inner);
    if (updated === inner) return match;
    changed++;
    log.push({ from: inner, to: updated });
    return `"${updated}"`;
  });

  return { next, changed, log };
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) yield* walk(full);
    else if (/\.tsx?$/.test(entry)) yield full;
  }
}

let filesChanged = 0;
let stringsChanged = 0;

for (const file of walk(SRC)) {
  const rel = relative(SRC, file).replace(/\\/g, "/");
  if (rel.startsWith("components/ui/")) continue;

  const src = readFileSync(file, "utf8");
  const { next, changed, log } = transformFile(src);
  if (changed === 0) continue;

  if (SHOW && rel.includes(SHOW)) {
    console.log(`\n-- ${rel}\n`);
    for (const { from, to } of log) {
      console.log(`  -  ${from}`);
      console.log(`  +  ${to}\n`);
    }
    continue;
  }

  filesChanged++;
  stringsChanged += changed;
  console.log(`${DRY ? "would change" : "changed"}  ${rel}  (${changed})`);
  if (!DRY && !SHOW) writeFileSync(file, next);
}

if (SHOW) process.exit(0);
console.log(
  `\n${filesChanged} file(s), ${stringsChanged} text palette(s) ${DRY ? "would be " : ""}retokenised.`,
);
