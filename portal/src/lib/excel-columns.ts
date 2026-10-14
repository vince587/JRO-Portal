import * as XLSX from "xlsx";

export interface ImportFieldDef {
  key: string;
  label: string;
  aliases: string[];
  required?: boolean;
}

/**
 * Columns that merely contain "date" but describe a different thing. Without
 * this, a sheet with both "Date Collected" and "Last Contacted" maps one of
 * them to the date field and silently imports the wrong day.
 */
export const DATE_DECOYS = ["updated", "modified", "lastcontacted", "followup", "closed"];

/** Strips casing and punctuation so "Phone/ Telepone #" -> "phonetelephone". */
export function normalizeHeader(h: string): string {
  return h.toLowerCase().replace(/[^a-z0-9]/g, "");
}

/** Excel serial days -> YYYY-MM-DD, for reading pre-formatted date cells. */
export function excelSerialToISO(serial: number): string {
  const ms = Math.round((serial - 25569) * 86400 * 1000);
  const d = new Date(ms);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

/** Best-effort YYYY-MM-DD for the preview table. */
export function toISODate(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  if (typeof v === "number" && Number.isFinite(v)) return excelSerialToISO(v);
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? "" : v.toISOString().slice(0, 10);
  const s = String(v).trim();
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const us = s.match(/^(\d{1,2})[/-](\d{1,2})[/-](\d{4})$/);
  if (us) return `${us[3]}-${us[1].padStart(2, "0")}-${us[2].padStart(2, "0")}`;
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? "" : d.toISOString().slice(0, 10);
}

export function levenshtein(a: string, b: string): number {
  if (a === b) return 0;
  if (!a.length || !b.length) return Math.max(a.length, b.length);
  let prev = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    const cur = [i];
    for (let j = 1; j <= b.length; j++) {
      cur[j] = Math.min(
        prev[j] + 1,
        cur[j - 1] + 1,
        prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1),
      );
    }
    prev = cur;
  }
  return prev[b.length];
}

export function scoreAlias(header: string, alias: string): number {
  if (header === alias) return 100;
  if (header.startsWith(alias) || alias.startsWith(header)) return 70;
  if (header.includes(alias) || alias.includes(header)) return 60;
  // Tolerate single-character typos such as "Telepone" for "Telephone".
  if (Math.min(header.length, alias.length) >= 5 && levenshtein(header, alias) <= 2) return 45;
  return 0;
}

/**
 * Greedily assigns each sheet column to the best-matching field. Returns a map
 * of fieldKey -> the original header text it was matched from.
 */
export function mapHeaders(headers: string[], fields: ImportFieldDef[]): Record<string, string> {
  const candidates: { field: string; header: string; score: number }[] = [];
  for (const header of headers) {
    const h = normalizeHeader(header);
    if (!h) continue;
    const isDecoy = DATE_DECOYS.some((d) => h.includes(d));
    if (isDecoy) continue;
    for (const f of fields) {
      let best = 0;
      for (const alias of [f.label, ...f.aliases]) {
        best = Math.max(best, scoreAlias(h, normalizeHeader(alias)));
      }
      if (best > 0) candidates.push({ field: f.key, header, score: best });
    }
  }
  candidates.sort((a, b) => b.score - a.score);

  const map: Record<string, string> = {};
  const usedHeaders = new Set<string>();
  for (const c of candidates) {
    if (map[c.field] || usedHeaders.has(c.header)) continue;
    map[c.field] = c.header;
    usedHeaders.add(c.header);
  }
  return map;
}

/** Writes a one-sample-row workbook showing the expected columns. */
export function downloadImportTemplate(
  filename: string,
  sheetName: string,
  fields: ImportFieldDef[],
  sample: Record<string, unknown>,
) {
  const headers = fields.map((f) => f.label);
  const ws = XLSX.utils.json_to_sheet([sample], { header: headers });
  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, sheetName);
  XLSX.writeFile(wb, filename);
}

export interface SheetReadResult {
  /** Rows keyed by the field keys in `fields`, one entry per sheet row. */
  mapped: Record<string, unknown>[];
  headerMap: Record<string, string>;
  unmatched: string[];
  skippedBlank: number;
}

/**
 * Reads the first sheet of a workbook and projects it onto `fields`.
 * Returns null when the file has no data rows or a required column is absent;
 * the caller reports which one and why.
 */
export async function readSheetIntoFields(
  file: File,
  fields: ImportFieldDef[],
  hasContent: (row: Record<string, unknown>) => boolean,
): Promise<SheetReadResult | { missingRequired: ImportFieldDef[] } | { empty: true }> {
  const buf = await file.arrayBuffer();
  const wb = XLSX.read(buf, { type: "array" });
  const ws = wb.Sheets[wb.SheetNames[0]];
  const raw = XLSX.utils.sheet_to_json<Record<string, unknown>>(ws, { defval: "" });
  if (raw.length === 0) return { empty: true };

  const headerMap = mapHeaders(Object.keys(raw[0]), fields);
  const missingRequired = fields.filter((f) => f.required && !headerMap[f.key]);
  if (missingRequired.length > 0) return { missingRequired };

  const mapped = raw.map((r) => {
    const item: Record<string, unknown> = {};
    for (const [field, header] of Object.entries(headerMap)) item[field] = r[header];
    return item;
  });

  const rows = mapped.filter(r => hasContent(r));
  return {
    mapped: rows,
    headerMap,
    unmatched: Object.keys(raw[0]).filter((h) => !Object.values(headerMap).includes(h)),
    skippedBlank: mapped.length - rows.length,
  };
}
