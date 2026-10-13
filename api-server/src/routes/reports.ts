import { Router, type IRouter, type Request, type Response } from "express";
import ExcelJS from "exceljs";
import { requireAnyPermission, hasRole } from "../middlewares/auth";
import {
  getAll,
  getDoc,
  createDoc,
  updateDoc,
  deleteDoc,
  type ContractDoc, type CertificateDoc, type ProjectDoc, type LeadDoc,
} from "../lib/firebase-db";

const router: IRouter = Router();

function escapeCsv(val: unknown): string {
  let str = String(val ?? "");
  // Prevent CSV/formula injection: a leading = + - @ tab or carriage return is
  // interpreted as a formula by Excel/Sheets. Prefix with a single quote.
  if (/^[=+\-@\t\r]/.test(str)) {
    str = `'${str}`;
  }
  if (str.includes(",") || str.includes('"') || str.includes("\n")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

function toCsv(rows: Record<string, unknown>[], columns: { key: string; label: string }[]): string {
  const header = columns.map(c => escapeCsv(c.label)).join(",");
  const body = rows.map(row =>
    columns.map(c => escapeCsv(row[c.key])).join(",")
  ).join("\n");
  return `${header}\n${body}`;
}

function getCertStatus(expiryDate: string): string {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiry < now) return "expired";
  if (expiry <= thirtyDaysFromNow) return "expiring_soon";
  return "active";
}

router.get("/reports/contracts", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const rows = await getAll<ContractDoc>("contracts");
  const csv = toCsv(rows.map(r => ({ ...r, value: Number(r.value) })), [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "contractNumber", label: "Contract Number" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "clientName", label: "Client" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "value", label: "Value" },
    { key: "assignedTo", label: "Assigned To" },
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=contracts.csv");
  res.send(csv);
});

router.get("/reports/certificates", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const rows = await getAll<CertificateDoc>("certificates");
  const csv = toCsv(rows.map(r => ({ ...r, status: getCertStatus(r.expiryDate) })), [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "recipientName", label: "Recipient" },
    { key: "recipientEmail", label: "Email" },
    { key: "issuedBy", label: "Issued By" },
    { key: "issueDate", label: "Issue Date" },
    { key: "expiryDate", label: "Expiry Date" },
    { key: "status", label: "Status" },
    { key: "certificateNumber", label: "Cert Number" },
    { key: "trainingType", label: "Training Type" },
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=certificates.csv");
  res.send(csv);
});

router.get("/reports/projects", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const rows = await getAll<ProjectDoc>("projects");
  const csv = toCsv(rows.map(r => ({ ...r, budget: r.budget ? Number(r.budget) : "" })), [
    { key: "id", label: "ID" },
    { key: "title", label: "Title" },
    { key: "status", label: "Status" },
    { key: "priority", label: "Priority" },
    { key: "startDate", label: "Start Date" },
    { key: "endDate", label: "End Date" },
    { key: "budget", label: "Budget" },
    { key: "projectManager", label: "Project Manager" },
    { key: "clientName", label: "Client" },
    { key: "progress", label: "Progress (%)" },
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=projects.csv");
  res.send(csv);
});

// Projects grouped by client. Each row shows the project count, status
// breakdown, total budget and average progress for that client. Returns JSON
// by default; use ?format=csv for a download.
router.get("/reports/projects-per-client", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  const rows = await getAll<ProjectDoc>("projects", "createdAt", "desc");
  const byClient = new Map<string, { client: string; total: number; active: number; planning: number; on_hold: number; completed: number; cancelled: number; budget: number; progress: number }>();
  for (const p of rows) {
    const key = (p.clientName || "").trim() || "(Internal)";
    let rec = byClient.get(key);
    if (!rec) {
      rec = { client: key, total: 0, active: 0, planning: 0, on_hold: 0, completed: 0, cancelled: 0, budget: 0, progress: 0 };
      byClient.set(key, rec);
    }
    rec.total += 1;
    if (p.status === "active") rec.active += 1;
    if (p.status === "planning") rec.planning += 1;
    if (p.status === "on_hold") rec.on_hold += 1;
    if (p.status === "completed") rec.completed += 1;
    if (p.status === "cancelled") rec.cancelled += 1;
    rec.budget += Number(p.budget) || 0;
    rec.progress += Number(p.progress) || 0;
  }
  const summary = Array.from(byClient.values())
    .sort((a, b) => a.client.localeCompare(b.client))
    .map(r => ({ ...r, progress: r.total ? Math.round(r.progress / r.total) : 0 }));

  if (req.query.format === "csv") {
    const csv = toCsv(summary, [
      { key: "client", label: "Client" },
      { key: "total", label: "Total Projects" },
      { key: "active", label: "Active" },
      { key: "planning", label: "Planning" },
      { key: "on_hold", label: "On Hold" },
      { key: "completed", label: "Completed" },
      { key: "cancelled", label: "Cancelled" },
      { key: "budget", label: "Total Budget" },
      { key: "progress", label: "Average Progress (%)" },
    ]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=projects-per-client.csv");
    res.send(csv);
    return;
  }
  res.json(summary);
});

router.get("/reports/leads", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const rows = (await getAll<LeadDoc>("leads")).filter(r => withinDateRange(r.createdAt, from, to));
  // Firestore auto-generates random document ids; show a short readable number
  // (chronological order) instead of exposing the raw key as the "ID".
  const leadRows = rows
    .filter(r => !!r.id)
    .sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  const leadNoByDocId = new Map<string, string>();
  leadRows.forEach((r, i) => leadNoByDocId.set(String(r.id), `L-${String(i + 1).padStart(4, "0")}`));
  const csv = toCsv(rows.map(r => ({ ...r, leadNo: leadNoByDocId.get(String(r.id)) || r.id || "" })), [
    { key: "leadNo", label: "ID" },
    { key: "companyName", label: "Company" },
    { key: "contactPerson", label: "Contact Person" },
    { key: "position", label: "Contact Position" },
    { key: "email", label: "Email" },
    { key: "phone", label: "Phone" },
    { key: "serviceInterest", label: "Service Interest" },
    { key: "type", label: "Type" },
    { key: "status", label: "Status" },
    { key: "notes", label: "Remarks" },
    { key: "createdByName", label: "Created By" },
    { key: "createdAt", label: "Created At" },
  ]);
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=leads.csv");
  res.send(csv);
});

function isVinceGatchalian(req: Request): boolean {
  if (!req.currentUser) return false;
  const name = `${req.currentUser.fullName ?? ""} ${req.currentUser.username ?? ""}`.toLowerCase();
  if (name.includes("gatchalian") || /\bvince\b/.test(req.currentUser.username ?? "")) return true;
  if (hasRole(req.currentUser, "admin", "ADMIN", "IT") || !!req.currentUser.canAccessDevelopers || !!req.currentUser.canAccessAdmin) return true;
  return false;
}

// Filter records by a ?from=YYYY-MM-DD&to=YYYY-MM-DD date range based on their
// ISO createdAt. Only the calendar date is compared.
function withinDateRange(createdAt: string | null | undefined, from?: string, to?: string): boolean {
  if (!createdAt) return false;
  const day = createdAt.slice(0, 10);
  if (from && day < from) return false;
  if (to && day > to) return false;
  return true;
}

// Resolve the accurate employee display name (fullName || username) from the
// users collection instead of trusting the name stored on each record.
async function batchUserNames(ids: (string | null | undefined)[]): Promise<Map<string, string>> {
  const uniq = Array.from(new Set(ids.filter((id): id is string => !!id)));
  const map = new Map<string, string>();
  await Promise.all(uniq.map(async (id) => {
    const u = await getDoc<{ fullName?: string | null; username?: string }>("users", id);
    if (u) {
      const n = u.fullName || u.username;
      if (n) map.set(id, n);
    }
  }));
  return map;
}

// ── Lead Targets (per employee per month) ──
// Targets let the reports compare expected lead inputs against the leads each
// employee actually encoded. Managed by Vince Gatchalian, same restriction as
// the per-employee lead reports.

interface LeadTargetDoc {
  id?: string;
  userId: string;   // the employee's createdById
  month: string;    // "YYYY-MM"
  target: number;
  createdAt: string;
  updatedAt: string;
}

// List the calendar months (YYYY-MM) covered by [from, to]. With no range,
// only the current month is returned.
function monthsInRange(from?: string, to?: string): string[] {
  const now = new Date();
  const startParts = from ? from.split("-").map(Number) : [now.getFullYear(), now.getMonth() + 1];
  const endParts = to ? to.split("-").map(Number) : startParts;
  if (startParts.length < 2 || endParts.length < 2 || startParts.some(isNaN) || endParts.some(isNaN)) {
    return [];
  }
  const months: string[] = [];
  let y = startParts[0], m = startParts[1];
  for (let i = 0; i < 240; i++) {
    months.push(`${y}-${String(m).padStart(2, "0")}`);
    if (y === endParts[0] && m === endParts[1]) break;
    m += 1;
    if (m > 12) { m = 1; y += 1; }
  }
  return months;
}

// Returns the number of days in a given "YYYY-MM" month string.
function daysInMonthStr(monthStr: string): number {
  const [year, month] = monthStr.split("-").map(Number);
  return new Date(year, month, 0).getDate();
}

async function loadDailyTargetMap(months: string[]): Promise<Map<string, { dailyTarget: number; month: string }[]>> {
  const map = new Map<string, { dailyTarget: number; month: string }[]>();
  if (months.length === 0) return map;
  const targets = await getAll<LeadTargetDoc>("lead_targets");
  for (const t of targets) {
    if (!months.includes(t.month)) continue;
    const existingTargets = map.get(t.userId) || [];
    existingTargets.push({ dailyTarget: Number(t.target) || 0, month: t.month });
    map.set(t.userId, existingTargets);
  }
  return map;
}

router.get("/reports/lead-targets", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  if (!req.currentUser || !isVinceGatchalian(req)) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const rows = await getAll<LeadTargetDoc>("lead_targets");
  const month = typeof req.query.month === "string" ? req.query.month : undefined;
  const filtered = month ? rows.filter(t => t.month === month) : rows;
  res.json(filtered.map(t => ({ id: t.id, userId: t.userId, month: t.month, target: Number(t.target) || 0 })));
});

router.post("/reports/lead-targets", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  if (!req.currentUser || !isVinceGatchalian(req)) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const userId = String(req.body?.userId || "");
  const month = String(req.body?.month || "");
  const target = Number(req.body?.target);
  if (!userId || !/^\d{4}-\d{2}$/.test(month) || !Number.isFinite(target) || target < 0) {
    res.status(400).json({ error: "userId, month (YYYY-MM) and a non-negative target are required" });
    return;
  }
  const now = new Date().toISOString();
  // Upsert: one target per employee per month.
  const existing = (await getAll<LeadTargetDoc>("lead_targets"))
    .find(t => t.userId === userId && t.month === month);
  if (existing?.id) {
    await updateDoc("lead_targets", existing.id, { target, updatedAt: now });
    res.json({ id: existing.id, userId, month, target });
    return;
  }
  const doc = await createDoc<LeadTargetDoc>("lead_targets", {
    userId,
    month,
    target,
    createdAt: now,
    updatedAt: now,
  });
  res.status(201).json({ id: doc.id, userId, month, target });
});

router.delete("/reports/lead-targets/:id", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  if (!req.currentUser || !isVinceGatchalian(req)) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  try {
    await deleteDoc("lead_targets", id);
    res.sendStatus(204); // No Content
  } catch (error) {
    console.error("Failed to delete lead target:", error);
    res.status(500).json({ error: "Failed to delete lead target" });
  }
});

// Leads grouped by the employee who created them. Only Vince Gatchalian may
// see this report. Returns JSON by default; use ?format=csv for a download.
router.get("/reports/leads-per-employee", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  if (!req.currentUser || !isVinceGatchalian(req)) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const rows = await getAll<LeadDoc>("leads");
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const nameById = await batchUserNames(rows.map(r => r.createdById));
  const byEmployee = new Map<string, { key: string; employee: string; total: number; new: number; contacted: number; qualified: number; lost: number; latest: string }>();
  const push = (key: string, employee: string, status: string, createdAt: string) => {
    if (!byEmployee.has(key)) byEmployee.set(key, { key, employee, total: 0, new: 0, contacted: 0, qualified: 0, lost: 0, latest: "" });
    const rec = byEmployee.get(key)!;
    rec.total += 1;
    if (status === "new") rec.new += 1;
    if (status === "contacted") rec.contacted += 1;
    if (status === "qualified") rec.qualified += 1;
    if (status === "lost") rec.lost += 1;
    if (createdAt > rec.latest) rec.latest = createdAt;
  };
  for (const r of rows) {
    if (!withinDateRange(r.createdAt, from, to)) continue;
    const employee = nameById.get(r.createdById || "") || r.createdByName || r.createdById || "Unknown";
    push(r.createdById || r.id || "unknown", employee, r.status || "new", r.createdAt || "");
  }
  const summary = Array.from(byEmployee.values()).sort((a, b) => b.total - a.total);

  if (req.query.format === "csv") {
    const csv = toCsv(summary, [
      { key: "employee", label: "Employee" },
      { key: "total", label: "Total Leads" },
      { key: "new", label: "New" },
      { key: "contacted", label: "Contacted" },
      { key: "qualified", label: "Qualified" },
      { key: "lost", label: "Lost" },
      { key: "latest", label: "Last Lead Date" },
    ]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=leads-per-employee.csv");
    res.send(csv);
    return;
  }
  const rangeMonths = monthsInRange(from, to);
  const totalRangeDays = rangeMonths.reduce((sum, m) => sum + daysInMonthStr(m), 0);
  const dailyTargetMap = await loadDailyTargetMap(rangeMonths);

  res.json(summary.map(s => {
    const dailyTargetsForEmployee = dailyTargetMap.get(s.key) || [];
    const monthlyEquivalentTarget = dailyTargetsForEmployee.reduce((sum, t) => sum + (t.dailyTarget * daysInMonthStr(t.month)), 0);
    const totalDaysTargeted = dailyTargetsForEmployee.reduce((sum, t) => sum + daysInMonthStr(t.month), 0);

    const dailyTarget = totalDaysTargeted > 0 ? Math.round(monthlyEquivalentTarget / totalDaysTargeted) : 0;
    const dailyActual = totalRangeDays > 0 ? Math.round(s.total / totalRangeDays) : 0;

    return {
      ...s,
      target: monthlyEquivalentTarget, // monthly equivalent for achievement calculation
      dailyTarget: dailyTarget, // daily target for display
      dailyActual: dailyActual, // daily average actual for chart
      actual: s.total,
      achievementPct: monthlyEquivalentTarget > 0 ? Math.round((s.total / monthlyEquivalentTarget) * 100) : null,
    };
  }));
});

// Helper to fetch chart image from QuickChart and add it to the worksheet.
async function addChartToWorksheet(
  wb: ExcelJS.Workbook,
  ws: ExcelJS.Worksheet,
  chartConfig: any,
  tlCol: number,
  tlRow: number,
  width: number = 650,
  height: number = 380
) {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 4000);
    const response = await globalThis.fetch("https://quickchart.io/chart", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        chart: chartConfig,
        width,
        height,
        backgroundColor: "white"
      }),
      signal: controller.signal,
    });
    clearTimeout(timer);
    if (!response.ok) {
      console.error(`QuickChart error: ${response.statusText}`);
      return;
    }
    const arrayBuffer = await response.arrayBuffer();
    const buffer = Buffer.from(arrayBuffer);
    const imageId = wb.addImage({
      buffer: buffer as any,
      extension: "png"
    });
    ws.addImage(imageId, {
      tl: { col: tlCol, row: tlRow },
      ext: { width, height }
    });
  } catch (err) {
    console.error("Failed to add chart to worksheet:", err);
  }
}

// One Excel workbook, one tab per employee, each tab containing that
// employee's leads. Only Vince Gatchalian may access this.
router.get("/reports/leads-per-employee-excel", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  if (!req.currentUser || !isVinceGatchalian(req)) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const rows = await getAll<LeadDoc>("leads");
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const nameById = await batchUserNames(rows.map(r => r.createdById));

  const byEmployee = new Map<string, LeadDoc[]>();
  for (const r of rows) {
    if (!withinDateRange(r.createdAt, from, to)) continue;
    const key = r.createdById || r.id || "unknown";
    const list = byEmployee.get(key) ?? [];
    list.push(r);
    byEmployee.set(key, list);
  }

  // Give every lead a short, readable, chronologically-ordered number instead of
  // exposing the raw Firestore document id (which looks like a random key).
  const leadNumberById = new Map<string, string>();
  const allLeads = Array.from(byEmployee.values()).flat().filter(r => !!r.id);
  allLeads.sort((a, b) => (a.createdAt || "").localeCompare(b.createdAt || ""));
  allLeads.forEach((r, i) => leadNumberById.set(r.id!, `L-${String(i + 1).padStart(4, "0")}`));

  const periodText = from || to ? `${from ?? "start"} to ${to ?? "today"}` : "All time";

  // Shared Excel styling tokens
  const HEADER_FILL = "FF1F4E78"; // dark blue
  const TITLE_FILL = "FF1F4E78";
  const BAND_FILL = "FFF2F6FF";   // pale blue banded rows
  const GRID_COLOR = "FFD6E0F0";
  const thinGrid: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: GRID_COLOR } },
    left: { style: "thin", color: { argb: GRID_COLOR } },
    bottom: { style: "thin", color: { argb: GRID_COLOR } },
    right: { style: "thin", color: { argb: GRID_COLOR } },
  };

  const doubleBottomGrid: Partial<ExcelJS.Borders> = {
    top: { style: "thin", color: { argb: GRID_COLOR } },
    left: { style: "thin", color: { argb: GRID_COLOR } },
    bottom: { style: "double", color: { argb: "FF1F4E78" } },
    right: { style: "thin", color: { argb: GRID_COLOR } },
  };

  // Writes a title block (report name + period) merged across the full sheet width.
  const writeTitle = (ws: ExcelJS.Worksheet, title: string, columnCount: number) => {
    const t1 = ws.addRow([title]);
    t1.height = 32;
    ws.mergeCells(t1.number, 1, t1.number, columnCount);
    t1.eachCell((cell) => {
      cell.value = title;
      cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Segoe UI" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: TITLE_FILL } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    const t2 = ws.addRow([`Period: ${periodText}`]);
    t2.height = 20;
    ws.mergeCells(t2.number, 1, t2.number, columnCount);
    t2.eachCell((cell) => {
      cell.value = `Period: ${periodText}`;
      cell.font = { italic: true, size: 10, color: { argb: "FF666666" }, name: "Segoe UI" };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    ws.addRow([""]);
  };

  // Sets column widths, then writes a styled bold header row above the data.
  const writeColumns = (ws: ExcelJS.Worksheet, cols: { header: string; key: string; width: number }[], centered: Set<number>) => {
    ws.columns = cols.map(c => ({ key: c.key, width: c.width }));
    const hr = ws.addRow(cols.map(c => c.header));
    hr.height = 26;
    hr.eachCell((cell, colNumber) => {
      cell.font = { bold: true, color: { argb: "FFFFFFFF" }, name: "Segoe UI", size: 11 };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: centered.has(colNumber) ? "center" : "left", vertical: "middle" };
      cell.border = thinGrid;
    });
  };

  // Applies thin borders, vertical centering and alternate banded-row fills.
  const writeDataRow = (ws: ExcelJS.Worksheet, values: Record<string, unknown>, band: boolean, centered: Set<number>) => {
    const row = ws.addRow(values);
    row.height = 20;
    row.eachCell((cell, colNumber) => {
      cell.border = thinGrid;
      cell.font = { name: "Segoe UI", size: 10 };
      cell.alignment = { horizontal: centered.has(colNumber) ? "center" : "left", vertical: "middle" };
      if (band) cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: BAND_FILL } };
    });
    row.commit();
    return row.number;
  };

  // Final touches: freeze header + title on scroll, enable the column filter.
  const finalizeSheet = (ws: ExcelJS.Worksheet, headerRow: number, lastDataRow: number) => {
    ws.views = [{ state: "frozen", ySplit: headerRow }];
    if (lastDataRow >= headerRow) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: lastDataRow, column: ws.columnCount },
      };
    }
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Internal Portal";

  // ── Target vs Actual data ──
  // Actual inputs per employee per month (from in-range leads) merged with the
  // monthly targets set by management. Powers the "Target vs Actual" sheet.
  const targetMonths = monthsInRange(from, to);
  const actualByEmployeeMonth = new Map<string, number>(); // `${userId}|${month}` -> count
  const employeeMonths = new Map<string, Set<string>>();   // userId -> months with leads
  for (const r of rows) {
    if (!withinDateRange(r.createdAt, from, to) || !r.createdById) continue;
    const month = (r.createdAt || "").slice(0, 7);
    if (!month) continue;
    const k = `${r.createdById}|${month}`;
    actualByEmployeeMonth.set(k, (actualByEmployeeMonth.get(k) || 0) + 1);
    if (!employeeMonths.has(r.createdById)) employeeMonths.set(r.createdById, new Set());
    employeeMonths.get(r.createdById)!.add(month);
  }
  const targetMap = await getAll<LeadTargetDoc>("lead_targets");
  const targetByUserMonth = new Map<string, number>(); // `${userId}|${month}` -> target
  for (const t of targetMap) {
    if (targetMonths.length > 0 && !targetMonths.includes(t.month)) continue;
    targetByUserMonth.set(`${t.userId}|${t.month}`, Number(t.target) || 0);
    if (!employeeMonths.has(t.userId)) employeeMonths.set(t.userId, new Set());
    employeeMonths.get(t.userId)!.add(t.month);
  }

  const summaryCols = [
    { header: "Employee", key: "employee", width: 30 },
    { header: "Total Leads", key: "total", width: 14 },
    { header: "Daily Target", key: "target", width: 12 },
    { header: "Achievement", key: "achievement", width: 14 },
  ];
  const summary = wb.addWorksheet("Summary");
  writeTitle(summary, "LEADS PER EMPLOYEE REPORT (Summary)", summaryCols.length);
  writeColumns(summary, summaryCols, new Set([2, 3, 4]));
  let summaryLast = 4;
  let banded = false;

  const summaryChartLabels: string[] = [];
  const summaryChartTargets: number[] = [];
  const summaryChartActuals: number[] = [];

  for (const [key, list] of byEmployee.entries()) {
    const employee = nameById.get(key) || list[0].createdByName || key || "Unknown";
    // targetByUserMonth stores the DAILY target per month.
    const monthlyTarget = Array.from(employeeMonths.get(key) ?? []).reduce((sum, m) => sum + (targetByUserMonth.get(`${key}|${m}`) || 0) * daysInMonthStr(m), 0);
    const totalDays = Array.from(employeeMonths.get(key) ?? []).reduce((sum, m) => sum + daysInMonthStr(m), 0);
    const dailyTarget = totalDays > 0 ? Math.round(monthlyTarget / totalDays) : 0;
    const pct = monthlyTarget > 0 ? list.length / monthlyTarget : null;
    summaryLast = writeDataRow(summary, { employee, total: list.length, target: dailyTarget > 0 ? dailyTarget : null, achievement: pct }, banded, new Set([2, 3, 4]));
    
    summaryChartLabels.push(employee);
    summaryChartTargets.push(dailyTarget);
    summaryChartActuals.push(totalDays > 0 ? Math.round(list.length / totalDays) : 0);

    const achCell = summary.getRow(summaryLast).getCell(4);
    if (pct !== null) {
      achCell.numFmt = "0%";
      achCell.font = { bold: true, color: { argb: pct >= 1 ? "FF1E7B34" : pct >= 0.7 ? "FFB7791F" : "FFC0392B" }, name: "Segoe UI", size: 10 };
    }
    banded = !banded;
  }
  // Totals row
  const grandMonthlyTarget = Array.from(employeeMonths.entries()).reduce((sum, [key, months]) =>
    sum + Array.from(months).reduce((s, m) => s + (targetByUserMonth.get(`${key}|${m}`) || 0) * daysInMonthStr(m), 0), 0);
  const grandTotalDays = Array.from(employeeMonths.entries()).reduce((sum, [key, months]) =>
    sum + Array.from(months).reduce((s, m) => s + daysInMonthStr(m), 0), 0);
  const grandDailyTarget = grandTotalDays > 0 ? Math.round(grandMonthlyTarget / grandTotalDays) : 0;
  const grandActual = Array.from(byEmployee.values()).reduce((s, list) => s + list.length, 0);
  const totalsRow = summary.addRow({ employee: "TOTAL", total: grandActual, target: grandDailyTarget > 0 ? grandDailyTarget : null, achievement: grandMonthlyTarget > 0 ? grandActual / grandMonthlyTarget : null });
  totalsRow.height = 22;
  totalsRow.eachCell((cell, colNumber) => {
    cell.border = doubleBottomGrid;
    cell.font = { bold: true, color: { argb: "FF1F4E78" }, name: "Segoe UI", size: 11 };
    cell.alignment = { horizontal: colNumber === 1 ? "left" : "center", vertical: "middle" };
  });
  if (grandMonthlyTarget > 0) {
    totalsRow.getCell(4).numFmt = "0%";
    totalsRow.getCell(4).font = { bold: true, color: { argb: "FF1F4E78" }, name: "Segoe UI", size: 11 };
  }
  const dataBarRange = (sheet: ExcelJS.Worksheet, colLetter: string, first: number, last: number, argb: string) => {
    if (last < first) return;
    sheet.addConditionalFormatting({
      ref: `${colLetter}${first}:${colLetter}${last}`,
      rules: [{
        type: "dataBar",
        priority: 1,
        gradient: false,
        showValue: true,
        border: true,
        axisPosition: "auto",
        direction: "leftToRight",
        cfvo: [{ type: "min" }, { type: "max" }],
        color: { argb } as any,
      } as any],
    });
  };
  dataBarRange(summary, "C", 5, summaryLast, "FF2E75B6");
  dataBarRange(summary, "D", 5, summaryLast, "FF1E7B34");
  finalizeSheet(summary, 4, summaryLast);

  // Generate and embed Target vs Actual bar chart on Summary sheet
  if (summaryChartLabels.length > 0) {
    const summaryChartConfig = {
      type: "bar",
      data: {
        labels: summaryChartLabels,
        datasets: [
          {
            label: "Daily Target",
            backgroundColor: "rgba(54, 162, 235, 0.7)",
            borderColor: "rgb(54, 162, 235)",
            borderWidth: 1,
            data: summaryChartTargets
          },
          {
            label: "Daily Actual",
            backgroundColor: "rgba(75, 192, 192, 0.7)",
            borderColor: "rgb(75, 192, 192)",
            borderWidth: 1,
            data: summaryChartActuals
          }
        ]
      },
      options: {
        title: {
          display: true,
          text: "Daily Target vs Actual Lead Inputs per Employee",
          fontSize: 16,
          fontColor: "#1F4E78",
          fontStyle: "bold"
        },
        legend: {
          position: "bottom"
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              precision: 0
            }
          }]
        }
      }
    };
    await addChartToWorksheet(wb, summary, summaryChartConfig, 1, summaryLast + 3);
  }

  // ── Target vs Actual sheet: one row per employee per month ──
  const tvsCols = [
    { header: "Employee", key: "employee", width: 30 },
    { header: "Month", key: "month", width: 14 },
    { header: "Daily Target", key: "target", width: 12 },
    { header: "Actual Inputs", key: "actual", width: 16 },
    { header: "Achievement", key: "achievement", width: 14 },
  ];
  const tvs = wb.addWorksheet("Target vs Actual");
  writeTitle(tvs, "TARGET VS ACTUAL LEAD INPUTS", tvsCols.length);
  writeColumns(tvs, tvsCols, new Set([2, 3, 4, 5]));
  let tvsLast = 4;
  let tvsBand = false;
  const monthLabel = (m: string) => {
    const [y, mm] = m.split("-").map(Number);
    return new Date(y, mm - 1, 1).toLocaleString("en-US", { month: "long", year: "numeric" });
  };

  // Track month-by-month values for trend chart
  const tvsMonths = new Set<string>();
  for (const [key, months] of employeeMonths.entries()) {
    for (const m of months) {
      tvsMonths.add(m);
    }
  }
  const sortedTvsMonths = Array.from(tvsMonths).sort();
  const monthlyChartLabels: string[] = [];
  const monthlyChartTargets: number[] = [];
  const monthlyChartActuals: number[] = [];

  for (const m of sortedTvsMonths) {
    let dailyTargetSum = 0;
    let monthlyActual = 0;
    for (const key of employeeMonths.keys()) {
      dailyTargetSum += targetByUserMonth.get(`${key}|${m}`) || 0;
      monthlyActual += actualByEmployeeMonth.get(`${key}|${m}`) || 0;
    }
    const days = daysInMonthStr(m);
    monthlyChartLabels.push(monthLabel(m));
    monthlyChartTargets.push(dailyTargetSum);
    monthlyChartActuals.push(days > 0 ? Math.round(monthlyActual / days) : 0);
  }

  for (const [key, months] of employeeMonths.entries()) {
    const employee = nameById.get(key) || key || "Unknown";
    const sortedMonths = Array.from(months).sort();
    for (const m of sortedMonths) {
      const days = daysInMonthStr(m);
      const dailyTarget = targetByUserMonth.get(`${key}|${m}`) || 0;
      const monthlyTarget = dailyTarget * days;
      const actual = actualByEmployeeMonth.get(`${key}|${m}`) || 0;
      const pct = monthlyTarget > 0 ? actual / monthlyTarget : null;
      tvsLast = writeDataRow(tvs, {
        employee,
        month: monthLabel(m),
        target: dailyTarget > 0 ? dailyTarget : null,
        actual,
        achievement: pct,
      }, tvsBand, new Set([2, 3, 4, 5]));
      const achCell = tvs.getRow(tvsLast).getCell(5);
      if (pct !== null) {
        achCell.numFmt = "0%";
        achCell.font = { bold: true, color: { argb: pct >= 1 ? "FF1E7B34" : pct >= 0.7 ? "FFB7791F" : "FFC0392B" }, name: "Segoe UI", size: 10 };
      }
      tvsBand = !tvsBand;
    }
  }
  dataBarRange(tvs, "C", 5, tvsLast, "FF2E75B6");
  dataBarRange(tvs, "D", 5, tvsLast, "FFED7D31");
  dataBarRange(tvs, "E", 5, tvsLast, "FF1E7B34");
  finalizeSheet(tvs, 4, tvsLast);

  // Generate and embed trend line chart on Target vs Actual sheet
  if (monthlyChartLabels.length > 0) {
    const trendChartConfig = {
      type: "line",
      data: {
        labels: monthlyChartLabels,
        datasets: [
          {
            label: "Total Daily Target",
            borderColor: "#36A2EB",
            backgroundColor: "rgba(54, 162, 235, 0.1)",
            data: monthlyChartTargets,
            fill: true
          },
          {
            label: "Total Daily Actual",
            borderColor: "#FF6384",
            backgroundColor: "rgba(255, 99, 132, 0.1)",
            data: monthlyChartActuals,
            fill: true
          }
        ]
      },
      options: {
        title: {
          display: true,
          text: "Monthly Lead Inputs Trend (Overall Daily Target vs Actual)",
          fontSize: 16,
          fontColor: "#1F4E78",
          fontStyle: "bold"
        },
        legend: {
          position: "bottom"
        },
        scales: {
          yAxes: [{
            ticks: {
              beginAtZero: true,
              precision: 0
            }
          }]
        }
      }
    };
    await addChartToWorksheet(wb, tvs, trendChartConfig, 1, tvsLast + 3);
  }

  const columns = [
    { header: "Lead No.", key: "leadNo", width: 12 },
    { header: "Company", key: "companyName", width: 28 },
    { header: "Contact Person", key: "contactPerson", width: 22 },
    { header: "Position", key: "position", width: 18 },
    { header: "Email", key: "email", width: 30 },
    { header: "Phone", key: "phone", width: 18 },
    { header: "Service Interest", key: "serviceInterest", width: 26 },
    { header: "Type", key: "type", width: 8 },
    { header: "Status", key: "status", width: 12 },
    { header: "Remarks", key: "notes", width: 32 },
    { header: "Created At", key: "createdAt", width: 20 },
  ];
  const centeredCols = new Set([1, 8, 9, 11]);

  const usedNames = new Set<string>();
  const uniqueSheetName = (base: string): string => {
    let name = base.replace(/[\\/\\?*[\\]:]/g, "").trim().slice(0, 30) || "Employee";
    let candidate = name;
    let i = 2;
    while (usedNames.has(candidate) || candidate === "Summary") {
      candidate = `${name.slice(0, 27)} (${i})`;
      i += 1;
    }
    usedNames.add(candidate);
    return candidate;
  };

  // Status cell color coding for the per-employee lead sheets.
  const STATUS_FILL: Record<string, { fill: string; font: string }> = {
    new: { fill: "FFE9EDF3", font: "FF33475B" },
    contacted: { fill: "FFDCE9F7", font: "FF1F4E79" },
    qualified: { fill: "FFDDEEDD", font: "FF1E7B34" },
    lost: { fill: "FFF8DCDC", font: "FFB02E2B" },
    won: { fill: "FFDDEEDD", font: "FF1E7B34" },
  };

  for (const [key, list] of byEmployee.entries()) {
    const employee = nameById.get(key) || list[0].createdByName || key || "Unknown";
    const ws = wb.addWorksheet(uniqueSheetName(employee));
    writeTitle(ws, `LEADS PER EMPLOYEE REPORT — ${employee}`, columns.length);
    writeColumns(ws, columns, centeredCols);
    let lastData = 4;
    let band = false;
    for (const r of list) {
      lastData = writeDataRow(ws, {
        leadNo: leadNumberById.get(r.id || "") || "",
        companyName: r.companyName,
        contactPerson: r.contactPerson,
        position: r.position || "",
        email: r.email || "",
        phone: r.phone || "",
        serviceInterest: r.serviceInterest || "",
        type: r.type || "",
        status: r.status || "",
        notes: r.notes || "",
        createdAt: r.createdAt ? new Date(r.createdAt).toLocaleString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "",
      }, band, centeredCols);
      // Color the Status cell (column 9) by its value.
      const statusStyle = STATUS_FILL[(r.status || "").toLowerCase()];
      if (statusStyle) {
        const statusCell = ws.getRow(lastData).getCell(9);
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.fill } };
        statusCell.font = { bold: true, color: { argb: statusStyle.font }, name: "Segoe UI", size: 10 };
      }
      band = !band;
    }
    // Totals row with lead counts.
    const totalRow = ws.addRow({ leadNo: "TOTAL", companyName: `${list.length} lead${list.length === 1 ? "" : "s"}` });
    totalRow.height = 22;
    totalRow.eachCell((cell) => {
      cell.border = doubleBottomGrid;
      cell.font = { bold: true, color: { argb: "FF1F4E78" }, name: "Segoe UI", size: 10 };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });
    totalRow.getCell(1).alignment = { horizontal: "left", vertical: "middle" };
    totalRow.getCell(2).alignment = { horizontal: "left", vertical: "middle" };
    finalizeSheet(ws, 4, lastData);
  }

  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="leads-per-employee.xlsx"');
  res.send(Buffer.from(buffer));
});

// The leads one employee encoded. `key` is that employee's createdById (or the
// document id for legacy records without a creator). Vince-only, like the
// per-employee summary it drills into.
router.get("/reports/leads-by-creator", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  if (!req.currentUser || !isVinceGatchalian(req)) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const key = String(req.query.key || "");
  if (!key) { res.status(400).json({ error: "key is required" }); return; }
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const rows = await getAll<LeadDoc>("leads", "createdAt", "desc");
  const theirs = rows.filter(r => (r.createdById || r.id) === key && withinDateRange(r.createdAt, from, to));
  const nameById = await batchUserNames(theirs.map(r => r.createdById));
  res.json(theirs.map(l => ({
    ...l,
    createdByName: l.createdByName ?? nameById.get(l.createdById) ?? null,
  })));
});

// Summary of contracts grouped by the employee who created them. Returns JSON
// by default; use ?format=csv for a download.
router.get("/reports/contracts-per-employee", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req: Request, res: Response): Promise<void> => {
  const rows = await getAll<ContractDoc>("contracts");
  const nameById = await batchUserNames(rows.map(r => r.createdById));
  const byEmployee = new Map<string, { employee: string; total: number; value: number; active: number; pending: number; completed: number; expired: number; latest: string }>();
  for (const c of rows) {
    const key = c.createdById || c.id || "unknown";
    if (!byEmployee.has(key)) {
      byEmployee.set(key, { employee: nameById.get(key) || c.createdByName || key || "Unknown", total: 0, value: 0, active: 0, pending: 0, completed: 0, expired: 0, latest: "" });
    }
    const rec = byEmployee.get(key)!;
    rec.total += 1;
    rec.value += Number(c.value) || 0;
    if (c.status === "active") rec.active += 1;
    if (c.status === "pending") rec.pending += 1;
    if (c.status === "completed") rec.completed += 1;
    if (c.status === "expired") rec.expired += 1;
    if (c.createdAt > rec.latest) rec.latest = c.createdAt;
  }
  const summary = Array.from(byEmployee.values()).sort((a, b) => b.total - a.total);

  if (req.query.format === "csv") {
    const csv = toCsv(summary, [
      { key: "employee", label: "Employee" },
      { key: "total", label: "Total Contracts" },
      { key: "value", label: "Total Value" },
      { key: "active", label: "Active" },
      { key: "pending", label: "Pending" },
      { key: "completed", label: "Completed" },
      { key: "expired", label: "Expired" },
      { key: "latest", label: "Last Contract Date" },
    ]);
    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", "attachment; filename=contracts-per-employee.csv");
    res.send(csv);
    return;
  }
  res.json(summary);
});

export default router;
