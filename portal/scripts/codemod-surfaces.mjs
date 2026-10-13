/**
 * One-shot codemod for the surface/typography rename.
 *
 *   neu-inset|neu-inset-lg|neu-pressed|neu-concave  ->  surface-sunken
 *   neu|neu-sm|neu-flat                             ->  surface
 *
 * plus two consistency fixes that were applied by hand on the pilot pages:
 *   - the same-level surfaces had mixed radii (lg on cards, xl on strips), so
 *     radius is normalised to one step per surface kind
 *   - every page carried `animate-in fade-in duration-500`, now `page-enter`
 *
 * Safe to re-run: it only touches className strings, and only these tokens.
 *
 *   node scripts/codemod-surfaces.mjs [--dry]
 */
import { readFileSync, writeFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const SRC = "src";
const DRY = process.argv.includes("--dry");

/** Applies every rule to a className string, returning the new value. */
function transform(cls) {
  let out = cls;

  // Sunken surfaces: toolbars, filter strips, wells, header rows.
  out = out.replace(/\bneu-inset-lg\b|\bneu-inset\b|\bneu-pressed\b|\bneu-concave\b/g, "surface-sunken");
  // Raised surfaces: cards, panels, toasts.
  out = out.replace(/\bneu-sm\b|\bneu-flat\b|\bneu\b/g, "surface");

  // Normalise radius per surface kind. Raised surfaces are cards and use the
  // app radius; sunken surfaces are strips and use one step smaller.
  out = out.replace(/\bsurface-sunken rounded-(xl|2xl|3xl)\b/g, "surface-sunken rounded-lg");
  out = out.replace(/\bsurface rounded-2xl\b/g, "surface rounded-xl");
  out = out.replace(/\bsurface rounded-3xl\b/g, "surface rounded-xl");

  // Page entrance: 500ms fade -> 140ms page-enter.
  out = out.replace(/\banimate-in fade-in duration-500\b/g, "page-enter");

  return out;
}

/** Only className-ish string literals, so prose and route paths are untouched. */
function transformFile(src) {
  // className="..." and className={`...`} and className={[...]}, plus the
  // quoted fragments inside ternaries such as `active ? "a b" : "c d"`.
  const quoted = /"([^"\n]*)"/g;
  let touched = 0;
  let changed = 0;

  // Track whether a quoted string plausibly holds utility classes.
  const looksLikeClasses = (s) =>
    /(^|\s)(neu(-inset|-sm|-flat|-pressed|-concave|-inset-lg)?|animate-in)(\s|$)/.test(s);

  const next = src.replace(quoted, (match, inner) => {
    if (!looksLikeClasses(inner)) return match;
    touched++;
    const updated = transform(inner);
    if (updated !== inner) changed++;
    return `"${updated}"`;
  });

  return { next, touched, changed };
}

function* walk(dir) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      yield* walk(full);
    } else if (/\.tsx?$/.test(entry)) {
      yield full;
    }
  }
}

let filesChanged = 0;
let stringsChanged = 0;

for (const file of walk(SRC)) {
  const src = readFileSync(file, "utf8");
  const { next, changed } = transformFile(src);
  if (changed === 0) continue;
  filesChanged++;
  stringsChanged += changed;
  console.log(`${DRY ? "would change" : "changed"}  ${relative(SRC, file)}  (${changed})`);
  if (!DRY) writeFileSync(file, next);
}

console.log(
  `\n${filesChanged} file(s), ${stringsChanged} class string(s) ${DRY ? "would be " : ""}rewritten.`,
);
