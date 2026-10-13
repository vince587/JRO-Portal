/**
 * One-shot codemod: collapse hand-written status palettes onto the `--tone-*`
 * tokens.
 *
 * The portal had ~60 near-identical class strings such as
 *   "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400"
 * drifted across 12 files (some with `/30`, some with a `dark:border-*`, some
 * with neither). Each becomes a single `tone-warning` / `tone-success` /
 * `tone-danger` / `tone-info` / `tone-neutral`.
 *
 * Safety rule: a run of colour utilities is only rewritten when it contains a
 * background token. A colour run with text/border only - e.g. `text-red-500` on
 * a link, or `text-blue-600` on a label - is left alone, because a tone class
 * also sets a background and would turn the text into a filled pill.
 *
 *   node scripts/codemod-tones.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "src";
const DRY = process.argv.includes("--dry");
/** `--show <substring>` prints every rewrite instead of applying it. */
const SHOW = (() => {
  const i = process.argv.indexOf("--show");
  return i === -1 ? null : process.argv[i + 1].replace(/\\/g, "/");
})();

/** Colour family -> tone. Families absent here are left untouched. */
const TONE_BY_FAMILY = {
  emerald: "success", green: "success", teal: "success",
  amber: "warning", yellow: "warning", orange: "warning",
  red: "danger", rose: "danger",
  blue: "info", cyan: "info", sky: "info", indigo: "info",
  purple: "info", violet: "info",
  slate: "neutral", zinc: "neutral", stone: "neutral",
  neutral: "neutral", gray: "neutral", grey: "neutral",
};

/** bg-* / text-* / border-* with an optional `dark:` prefix and /opacity. */
const COLOR_TOKEN =
  /^(dark:)?(bg|text|border)-([a-z]+)-\d{2,3}(\/\d+)?$/;

/**
 * Non-colour tokens that are safe to leave in place: size, weight, layout.
 * They are skipped when deciding whether a string is a pure status palette, and
 * preserved when it is rewritten.
 */
const INERT = new Set([
  "capitalize", "font-normal", "font-semibold", "font-medium", "font-bold",
  "tabular", "no-nowrap", "whitespace-nowrap", "line-through", "rounded-full",
  "flex", "inline-flex", "items-center", "justify-center", "gap-1", "gap-1.5",
  "h-4", "h-5", "h-6", "h-7", "w-4", "w-5", "w-6", "w-full",
  "px-1.5", "px-2", "px-2.5", "py-0.5", "py-1", "mt-1", "mb-1",
]);

const COLOR_TOKEN_RE = COLOR_TOKEN;

function isColorToken(tok) {
  return COLOR_TOKEN_RE.test(tok);
}

function isInert(tok) {
  // Arbitrary sizes such as text-[10px] are inert too.
  return INERT.has(tok) || /^text-\[\d+px\]$/.test(tok);
}

/** The tone family a colour token belongs to, or null. */
function toneOfToken(tok) {
  const m = COLOR_TOKEN_RE.exec(tok);
  if (!m) return null;
  return TONE_BY_FAMILY[m[3]] ?? null;
}

/**
 * Rewrites one className string.
 *
 * Only a *pure palette* is rewritten: after setting aside inert modifiers, every
 * remaining token must be a colour token, there must be at least two of them, at
 * least one must be a background, and they must all agree on a tone.
 *
 * That guard rejects the three cases a looser rule got wrong:
 *   "bg-red-500"                                  a bare status dot
 *   "bg-emerald-500 text-white border-emerald-500" a solid badge (text-white
 *                                                 is not a tone, and softening
 *                                                 it would put white on a wash)
 *   "bg-slate-100 ... border-border ..."          mixed strings, where a partial
 *                                                 rewrite leaves stale classes
 */
function transform(cls) {
  const tokens = cls.split(/\s+/).filter(Boolean);
  const meaningful = tokens.filter((t) => !isInert(t));

  const allColour = meaningful.length > 0 && meaningful.every(isColorToken);
  if (!allColour) return cls;

  const tones = meaningful.map(toneOfToken);
  const known = tones.filter(Boolean);
  const hasBackground = meaningful.some((t) => /^(dark:)?bg-/.test(t));

  // Two or more colours, one of them a background, all from the same family.
  if (meaningful.length < 2 || !hasBackground || known.length !== meaningful.length) {
    return cls;
  }
  if (new Set(known).size !== 1) return cls;

  const tone = `tone-${known[0]}`;
  const out = [];
  let emitted = false;
  for (const tok of tokens) {
    if (isColorToken(tok)) {
      if (!emitted) {
        out.push(tone);
        emitted = true;
      }
      continue;
    }
    out.push(tok);
  }
  return out.join(" ");
}

/** Only string literals that actually contain a rewritten palette. */
const CANDIDATE =
  /bg-(emerald|green|teal|amber|yellow|orange|red|rose|blue|cyan|sky|indigo|purple|violet|slate|zinc|stone|gray|grey)-\d{2,3}/;

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

/**
 * Files that define the system rather than consume it, plus files whose colours
 * are categorical rather than status. Collapsing a categorical palette onto
 * tones would give siblings the same colour - two calendar event types both
 * rendering as `tone-info`, or every permission flag matching. Those are
 * hand-edited instead.
 */
const EXCLUDE = [
  /^components\/ui\//, // primitives: some variants are deliberately solid
  /^pages\/calendar\.tsx$/, // 7 event-type categories
  /^pages\/developers\.tsx$/, // permission flags are a checklist
  /^pages\/users\/index\.tsx$/, // role + permission flags
];

function isExcluded(rel) {
  return EXCLUDE.some((re) => re.test(rel));
}

let filesChanged = 0;
let stringsChanged = 0;

for (const file of walk(SRC)) {
  const rel = relative(SRC, file);
  const relPosix = rel.replace(/\\/g, "/");
  if (isExcluded(relPosix)) continue;
  const src = readFileSync(file, "utf8");
  const { next, changed, log } = transformFile(src);
  if (changed === 0) continue;

  if (SHOW && relPosix.includes(SHOW)) {
    console.log(`\n── ${rel}\n`);
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
  `\n${filesChanged} file(s), ${stringsChanged} palette(s) ${DRY ? "would be " : ""}collapsed.`,
);
