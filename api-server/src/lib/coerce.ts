/**
 * Cell coercion helpers shared by the spreadsheet import endpoints (leads,
 * contracts). Exported sheets are messy: numbers arrive as text, dates appear
 * as Excel serials or spelled-out months, and Type/Status columns are routinely
 * swapped or mislabelled. These helpers read a cell by what it *contains*
 * rather than trusting the header it sits under.
 */

/** Trimmed text for any cell. Numbers and booleans become readable strings. */
export function cleanText(v: unknown): string {
  if (v === null || v === undefined) return "";
  if (typeof v === "number") return Number.isFinite(v) ? String(v) : "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v).trim();
}

/** Accepts "JMCS", "jmcs ", "JMCS Consulting" and similar. */
export function coerceContractType(v: unknown): "JMCS" | "SIS" | null {
  const s = cleanText(v).toUpperCase().replace(/\s+/g, "");
  if (!s) return null;
  if (s.startsWith("JMCS")) return "JMCS";
  if (s.startsWith("SIS")) return "SIS";
  return null;
}

/** Returns the status only when it is one of `allowed`, else null. */
export function coerceEnum(v: unknown, allowed: readonly string[]): string | null {
  const s = cleanText(v).toLowerCase().replace(/[\s-]+/g, "_");
  if (!s) return null;
  if (allowed.includes(s)) return s;
  const collapsed = s.replace(/_/g, "");
  const hit = allowed.find(a => a.replace(/_/g, "") === collapsed);
  return hit ?? null;
}

/** Returns the date only if the calendar components are real (rejects 31 Feb). */
function validYmd(ymd: string): string | null {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return null;
  // Rejects overflow like 2023-02-31, which JS would silently roll over.
  return d.toISOString().slice(0, 10) === ymd ? ymd : null;
}

/**
 * Normalizes a spreadsheet date cell to the calendar day (YYYY-MM-DD).
 * Excel serial numbers, Date objects and common text layouts are all accepted.
 * Returns null when the value is absent or unparseable so the caller can fall
 * back to the import date.
 */
export function coerceDate(v: unknown): string | null {
  if (v === null || v === undefined || v === "") return null;

  // Excel stores dates as days since 1899-12-30; the window below rejects any
  // number too large to be a plausible date (guards against stray IDs).
  if (typeof v === "number" && Number.isFinite(v)) {
    if (v < 1 || v > 2958465) return null;
    const ms = Math.round((v - 25569) * 86400 * 1000);
    const d = new Date(ms);
    if (Number.isNaN(d.getTime())) return null;
    return validYmd(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, "0")}-${String(d.getUTCDate()).padStart(2, "0")}`);
  }

  if (v instanceof Date) {
    if (Number.isNaN(v.getTime())) return null;
    // Excel/JS Date objects here are date-only values; read UTC components.
    return validYmd(`${v.getUTCFullYear()}-${String(v.getUTCMonth() + 1).padStart(2, "0")}-${String(v.getUTCDate()).padStart(2, "0")}`);
  }

  const s = cleanText(v);
  if (!s) return null;

  // ISO already (with or without a time part).
  const iso = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (iso) return validYmd(`${iso[1]}-${iso[2].padStart(2, "0")}-${iso[3].padStart(2, "0")}`);

  // Slash/dash numeric dates are ambiguous (3/4/2024 could be Mar 4 or Apr 3).
  // Only accept them when the first part cannot be a month, so a true
  // day-first value is read correctly instead of being silently swapped.
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) {
    const a = Number(us[1]);
    const b = Number(us[2]);
    const y = us[3];
    if (a > 31 || b > 31) return null;
    if (a > 12 && b <= 12) return validYmd(`${y}-${String(b).padStart(2, "0")}-${String(a).padStart(2, "0")}`);
    if (a <= 12) return validYmd(`${y}-${String(a).padStart(2, "0")}-${String(b).padStart(2, "0")}`);
    return null; // both > 12: not a date
  }
  // Spelled-out months, e.g. "March 15, 2023" or "15 March 2023".
  const MONTHS: Record<string, string> = {
    jan: "01", feb: "02", mar: "03", apr: "04", may: "05", jun: "06",
    jul: "07", aug: "08", sep: "09", oct: "10", nov: "11", dec: "12",
  };
  const monthFirst = s.match(/^([A-Za-z]{3,9})\.?\s+(\d{1,2})(?:st|nd|rd|th)?,?\s+(\d{4})$/);
  const dayFirst = s.match(/^(\d{1,2})(?:st|nd|rd|th)?\s+([A-Za-z]{3,9})\.?,?\s+(\d{4})$/);
  if (monthFirst) {
    const mm = MONTHS[monthFirst[1].slice(0, 3).toLowerCase()];
    if (mm) return validYmd(`${monthFirst[3]}-${mm}-${String(monthFirst[2]).padStart(2, "0")}`);
  }
  if (dayFirst) {
    const mm = MONTHS[dayFirst[2].slice(0, 3).toLowerCase()];
    if (mm) return validYmd(`${dayFirst[3]}-${mm}-${String(dayFirst[1]).padStart(2, "0")}`);
  }

  // Last resort: let the runtime parse it, but read the calendar parts back in
  // UTC. Reading .toISOString() directly can shift the day by one in zones
  // behind UTC, because a bare "March 15, 2023" is interpreted as local time.
  const parsed = new Date(s);
  if (!Number.isNaN(parsed.getTime())) return validYmd(parsed.toISOString().slice(0, 10));

  return null;
}

/**
 * Reads a money cell that may be "12,500.00", "₱12,500", "(1,200)" or a bare
 * number. Returns null when there is no usable number, so the caller can decide
 * whether a missing value is an error.
 */
export function coerceMoney(v: unknown): number | null {
  if (v === null || v === undefined || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  let s = cleanText(v).replace(/[^\d.,()-]/g, "");
  if (!s) return null;
  // Accounting negatives: (1,200.50)
  const negative = /^\(.*\)$/.test(s);
  if (negative) s = s.slice(1, -1);
  // Strip the thousands separators, keeping the decimal point.
  s = s.replace(/,/g, "");
  const n = Number(s);
  if (!Number.isFinite(n)) return null;
  return negative ? -n : n;
}
