import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import ExcelJS from "exceljs";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type ProjectDoc,
} from "../lib/firebase-db";
import {
  ListProjectsQueryParams,
  CreateProjectBody,
  UpdateProjectBody,
} from "../../lib/api-zod/index.js";
import { requireRole, requireAnyPermission } from "../middlewares/auth";
import { emitChange } from "./sse";

const router: IRouter = Router();

function mapProject(p: any) {
  return {
    id: p.id,
    title: p.title,
    description: p.description,
    status: p.status,
    priority: p.priority,
    startDate: p.startDate,
    endDate: p.endDate,
    budget: p.budget != null ? Number(p.budget) : null,
    projectManager: p.projectManager,
    clientName: p.clientName,
    progress: p.progress,
    shareToken: p.shareToken || null,
    createdAt: p.createdAt,
  };
}

router.get("/projects/summary", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const all = await getAll<ProjectDoc>("projects", "createdAt", "desc");
  res.json({
    total: all.length,
    byStatus: {
      planning: all.filter(p => p.status === "planning").length,
      active: all.filter(p => p.status === "active").length,
      on_hold: all.filter(p => p.status === "on_hold").length,
      completed: all.filter(p => p.status === "completed").length,
      cancelled: all.filter(p => p.status === "cancelled").length,
    },
  });
});

// Formatted Excel export of the project summary grouped per client. Includes a
// "Summary" worksheet (one row per client with counts/budget/progress) plus a
// dedicated worksheet per client with the detail rows and a subtotal row.
router.get("/projects/summary-excel", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (_req, res): Promise<void> => {
  const all = await getAll<ProjectDoc>("projects", "createdAt", "desc");

  const byClient = new Map<string, ProjectDoc[]>();
  for (const p of all) {
    const key = (p.clientName || "").trim() || "(Internal)";
    const list = byClient.get(key) || [];
    list.push(p);
    byClient.set(key, list);
  }

  const formatDate = (d?: string | null) =>
    d ? new Date(d).toLocaleDateString("en-US", { year: "numeric", month: "short", day: "numeric" }) : "";
  const toMoney = (v: unknown) => (v == null ? 0 : Number(v));
  const averageProgress = (rows: ProjectDoc[]) =>
    rows.length ? Math.round(rows.reduce((s, p) => s + (Number(p.progress) || 0), 0) / rows.length) : 0;
  const titleCase = (s?: string) => (s || "").replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());

  // Excel styling tokens shared across sheets (matches the reports exports).
  const HEADER_FILL = "FF1F4E78";
  const BAND_FILL = "FFF2F6FF";
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
  const STATUS_FILL: Record<string, { fill: string; font: string }> = {
    planning: { fill: "FFE9EDF3", font: "FF33475B" },
    active: { fill: "FFDCE9F7", font: "FF1F4E79" },
    on_hold: { fill: "FFEFE2CF", font: "FF9C5700" },
    completed: { fill: "FFDDEEDD", font: "FF1E7B34" },
    cancelled: { fill: "FFF8DCDC", font: "FFB02E2B" },
  };

  const writeTitle = (ws: ExcelJS.Worksheet, title: string, columnCount: number) => {
    const t1 = ws.addRow([title]);
    t1.height = 32;
    ws.mergeCells(t1.number, 1, t1.number, columnCount);
    t1.eachCell((cell) => {
      cell.value = title;
      cell.font = { bold: true, size: 14, color: { argb: "FFFFFFFF" }, name: "Segoe UI" };
      cell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: HEADER_FILL } };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    const t2 = ws.addRow([`Generated: ${new Date().toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`]);
    t2.height = 20;
    ws.mergeCells(t2.number, 1, t2.number, columnCount);
    t2.eachCell((cell) => {
      cell.value = t2.getCell(1).value;
      cell.font = { italic: true, size: 10, color: { argb: "FF666666" }, name: "Segoe UI" };
      cell.alignment = { horizontal: "center", vertical: "middle" };
    });

    ws.addRow([""]);
  };

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

  const finalizeSheet = (ws: ExcelJS.Worksheet, headerRow: number, lastDataRow: number) => {
    if (lastDataRow >= headerRow) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: lastDataRow, column: ws.columnCount },
      };
    }
    ws.views = [{ state: "frozen", ySplit: headerRow }];
    ws.pageSetup = { orientation: "landscape", fitToPage: true, fitToWidth: 1, fitToHeight: 0 };
  };

  const applyColumnFormat = (ws: ExcelJS.Worksheet, rowNumber: number, key: string, numFmt: string) => {
    const idx = ws.columns.findIndex(c => c.key === key);
    if (idx >= 0) ws.getRow(rowNumber).getCell(idx + 1).numFmt = numFmt;
  };

  const writeTotalRow = (ws: ExcelJS.Worksheet, values: Record<string, unknown>, centered: boolean) => {
    const row = ws.addRow(values);
    row.height = 22;
    row.eachCell((cell) => {
      cell.border = doubleBottomGrid;
      cell.font = { bold: true, color: { argb: "FF1F4E78" }, name: "Segoe UI", size: 10 };
      cell.alignment = { horizontal: centered ? "center" : "left", vertical: "middle" };
    });
    if (values.budget != null) applyColumnFormat(ws, row.number, "budget", "#,##0.00");
    if (values.progress != null && typeof values.progress === "number") applyColumnFormat(ws, row.number, "progress", '0"%"');
    return row.number;
  };

  const wb = new ExcelJS.Workbook();
  wb.creator = "Internal Portal";

  const usedNames = new Set<string>();
  const uniqueSheetName = (base: string): string => {
    const name = base.replace(/[\\/?*[\]:]/g, "").trim().slice(0, 30) || "Client";
    let candidate = name;
    let i = 2;
    while (usedNames.has(candidate) || candidate === "Summary") {
      candidate = `${name.slice(0, 27)} (${i})`;
      i += 1;
    }
    usedNames.add(candidate);
    return candidate;
  };

  // ── Summary sheet: one row per client ──
  const summaryColumns = [
    { header: "Client", key: "client", width: 34 },
    { header: "Projects", key: "count", width: 10 },
    { header: "Active", key: "active", width: 9 },
    { header: "Planning", key: "planning", width: 10 },
    { header: "On Hold", key: "on_hold", width: 10 },
    { header: "Completed", key: "completed", width: 11 },
    { header: "Cancelled", key: "cancelled", width: 11 },
    { header: "Total Budget", key: "budget", width: 16 },
    { header: "Avg Progress", key: "progress", width: 14 },
  ];
  const summaryCentered = new Set([2, 3, 4, 5, 6, 7, 9]);
  const summarySheet = wb.addWorksheet("Summary");
  writeTitle(summarySheet, "PROJECT SUMMARY (PER CLIENT)", summaryColumns.length);
  writeColumns(summarySheet, summaryColumns, summaryCentered);
  let banded = false;
  let summaryLast = 4;
  for (const [key, rows] of Array.from(byClient.entries()).sort((a, b) => a[0].localeCompare(b[0]))) {
    summaryLast = writeDataRow(summarySheet, {
      client: key,
      count: rows.length,
      active: rows.filter(r => r.status === "active").length,
      planning: rows.filter(r => r.status === "planning").length,
      on_hold: rows.filter(r => r.status === "on_hold").length,
      completed: rows.filter(r => r.status === "completed").length,
      cancelled: rows.filter(r => r.status === "cancelled").length,
      budget: rows.reduce((s, p) => s + toMoney(p.budget), 0),
      progress: averageProgress(rows),
    }, banded, summaryCentered);
    applyColumnFormat(summarySheet, summaryLast, "budget", "#,##0.00");
    applyColumnFormat(summarySheet, summaryLast, "progress", '0"%"');
    banded = !banded;
  }
  const grandRowNumber = writeTotalRow(summarySheet, {
    client: "GRAND TOTAL",
    count: all.length,
    active: all.filter(p => p.status === "active").length,
    planning: all.filter(p => p.status === "planning").length,
    on_hold: all.filter(p => p.status === "on_hold").length,
    completed: all.filter(p => p.status === "completed").length,
    cancelled: all.filter(p => p.status === "cancelled").length,
    budget: all.reduce((s, p) => s + toMoney(p.budget), 0),
    progress: averageProgress(all),
  }, true);
  finalizeSheet(summarySheet, 4, summaryLast + 1);

  // ── Per-client detail worksheets ──
  const detailColumns = [
    { header: "No", key: "no", width: 6 },
    { header: "Project Title", key: "title", width: 42 },
    { header: "Status", key: "status", width: 14 },
    { header: "Priority", key: "priority", width: 10 },
    { header: "Start", key: "startDate", width: 13 },
    { header: "End", key: "endDate", width: 13 },
    { header: "Manager", key: "projectManager", width: 18 },
    { header: "Budget", key: "budget", width: 15 },
    { header: "Progress", key: "progress", width: 10 },
  ];
  const detailCentered = new Set([1, 3, 4, 9]);

  for (const [key, rows] of byClient.entries()) {
    const ws = wb.addWorksheet(uniqueSheetName(key));
    writeTitle(ws, `PROJECT SUMMARY — ${key}`, detailColumns.length);
    writeColumns(ws, detailColumns, detailCentered);
    let band = false;
    let lastData = 4;
    rows.forEach((p, i) => {
      const rowNum = writeDataRow(ws, {
        no: i + 1,
        title: p.title,
        status: titleCase(p.status || ""),
        priority: titleCase(p.priority || ""),
        startDate: formatDate(p.startDate),
        endDate: formatDate(p.endDate),
        projectManager: p.projectManager || "",
        budget: toMoney(p.budget),
        progress: Number(p.progress) || 0,
      }, band, detailCentered);
      const statusCell = ws.getRow(rowNum).getCell(3);
      const statusStyle = STATUS_FILL[p.status || ""];
      if (statusStyle) {
        statusCell.fill = { type: "pattern", pattern: "solid", fgColor: { argb: statusStyle.fill } };
        statusCell.font = { bold: true, color: { argb: statusStyle.font }, name: "Segoe UI", size: 10 };
      }
      applyColumnFormat(ws, rowNum, "budget", "#,##0.00");
      applyColumnFormat(ws, rowNum, "progress", '0"%"');
      band = !band;
      lastData = rowNum;
    });
    const totalRow = rows.length ? writeTotalRow(ws, {
      no: "TOTAL",
      title: `${rows.length} project${rows.length === 1 ? "" : "s"}`,
      budget: rows.reduce((s, p) => s + toMoney(p.budget), 0),
      progress: averageProgress(rows),
    }, true) : 4;
    finalizeSheet(ws, 4, lastData + (rows.length ? 1 : 0));
  }

  const buffer = await wb.xlsx.writeBuffer();
  res.setHeader("Content-Type", "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet");
  res.setHeader("Content-Disposition", 'attachment; filename="project-summary-per-client.xlsx"');
  res.send(Buffer.from(buffer));
});

router.get("/projects", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const params = ListProjectsQueryParams.safeParse(req.query);
  let rows = await getAll<ProjectDoc>("projects", "createdAt", "desc");
  if (params.success && params.data.status) {
    rows = rows.filter(p => p.status === params.data.status);
  }
  res.json(rows.map(mapProject));
});

router.post("/projects", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const parsed = CreateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date().toISOString();
  const project = await createDoc<ProjectDoc>("projects", {
    ...parsed.data,
    budget: parsed.data.budget != null ? Number(parsed.data.budget) : null,
    createdAt: now,
    updatedAt: now,
  } as ProjectDoc);
  await createDoc("activity", {
    type: "project",
    description: `Project "${project.title}" was created`,
    entityId: project.id!,
    timestamp: now,
  });
  emitChange("project", "created", project.id);
  res.status(201).json(mapProject(project));
});

router.get("/projects/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getDoc<ProjectDoc>("projects", id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(mapProject(project));
});

router.patch("/projects/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateProjectBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await getDoc<ProjectDoc>("projects", id);
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  const updateData: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.budget !== undefined) updateData.budget = Number(parsed.data.budget);
  await updateDoc("projects", id, updateData);
  const updated = await getDoc<ProjectDoc>("projects", id);
  emitChange("project", "updated", id);
  res.json(mapProject(updated!));
});

router.post("/projects/:id/share", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("projects", id);
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const shareToken = crypto.randomBytes(16).toString("hex");
  await updateDoc("projects", id, { shareToken, updatedAt: new Date().toISOString() });
  res.json({ shareToken });
});

router.delete("/projects/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<ProjectDoc>("projects", id);
  if (!existing) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  await deleteDoc("projects", id);
  emitChange("project", "deleted", id);
  res.sendStatus(204);
});

const BulkDeleteProjectsBody = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
});

router.post("/projects/bulk-delete", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const parsed = BulkDeleteProjectsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errors: string[] = [];
  let deleted = 0;
  const now = new Date().toISOString();
  for (const id of parsed.data.ids) {
    const idStr = String(id);
    const existing = await getDoc<ProjectDoc>("projects", idStr);
    if (!existing) { errors.push(`${idStr}: not found`); continue; }
    await deleteDoc("projects", idStr);
    emitChange("project", "deleted", idStr);
    deleted++;
  }
  if (deleted > 0) {
    await createDoc("activity", {
      type: "project",
      description: `Bulk deleted ${deleted} projects`,
      entityId: null,
      timestamp: now,
    });
  }
  res.json({ deleted, errors });
});

// ── Project Document Checklist ──

const CHECKLIST_ITEMS = [
  "existing_forms_internal",
  "existing_forms_external",
  "hd_logo",
  "company_profile",
  "legal_permits",
  "job_description",
  "org_chart",
] as const;

const ChecklistItemSchema = z.object({
  projectId: z.string().min(1),
  itemType: z.enum(CHECKLIST_ITEMS),
  status: z.enum(["missing", "received", "reviewed", "approved"]).default("missing"),
  notes: z.string().optional(),
});

function mapChecklistItem(l: any) {
  return {
    id: l.id,
    projectId: l.projectId,
    itemType: l.itemType,
    status: l.status || "missing",
    notes: l.notes || "",
    updatedAt: l.updatedAt,
  };
}

router.get("/projects/:projectId/checklist", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const { projectId } = req.params;
  const all = await getAll<any>("project_checklist");
  const items = all.filter(i => i.projectId === projectId);
  res.json(items.map(mapChecklistItem));
});

router.post("/projects/:projectId/checklist", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const parsed = ChecklistItemSchema.safeParse({ ...req.body, projectId: req.params.projectId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("project_checklist", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapChecklistItem(doc));
});

router.patch("/projects/:projectId/checklist/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("project_checklist", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = ChecklistItemSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("project_checklist", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("project_checklist", id);
  res.json(mapChecklistItem(updated));
});

router.delete("/projects/:projectId/checklist/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("project_checklist", id);
  res.json({ success: true });
});

// ── Project Department Targets ──

const DepartmentTargetSchema = z.object({
  projectId: z.string().min(1),
  department: z.string().min(1),
  target: z.coerce.number().min(0).optional().nullable(),
  actual: z.coerce.number().min(0).optional().nullable(),
  notes: z.string().optional(),
});

function mapDepartmentTarget(l: any) {
  return {
    id: l.id,
    projectId: l.projectId,
    department: l.department,
    target: l.target != null ? Number(l.target) : null,
    actual: l.actual != null ? Number(l.actual) : null,
    notes: l.notes || "",
    updatedAt: l.updatedAt,
  };
}

router.get("/projects/:projectId/department-targets", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const { projectId } = req.params;
  const all = await getAll<any>("project_department_targets");
  const items = all.filter(i => i.projectId === projectId);
  res.json(items.map(mapDepartmentTarget));
});

router.post("/projects/:projectId/department-targets", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const parsed = DepartmentTargetSchema.safeParse({ ...req.body, projectId: req.params.projectId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("project_department_targets", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapDepartmentTarget(doc));
});

router.patch("/projects/:projectId/department-targets/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("project_department_targets", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = DepartmentTargetSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("project_department_targets", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("project_department_targets", id);
  res.json(mapDepartmentTarget(updated));
});

router.delete("/projects/:projectId/department-targets/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("project_department_targets", id);
  res.json({ success: true });
});

// ── Project Gantt Tasks ──

const WEEK_COUNT = 60;

function startEndToWeeks(startMonth: number, endMonth: number): string {
  const w = Array(WEEK_COUNT).fill("0");
  for (let m = startMonth; m <= endMonth; m++) {
    for (let wk = 0; wk < 4; wk++) w[m * 4 + wk] = "1";
  }
  return w.join("");
}

const GanttTaskSchema = z.object({
  projectId: z.string().min(1),
  task: z.string().min(1),
  status: z.enum(["not_started", "in_progress", "complete", "on_hold", "overdue"]).default("not_started"),
  priority: z.enum(["low", "medium", "high"]).default("medium"),
  atRisk: z.boolean().default(false),
  weeks: z.string().regex(/^[01]{60}$/).optional(),
  startMonth: z.number().int().min(0).max(14).default(0),
  endMonth: z.number().int().min(0).max(14).default(0),
  remarks: z.string().optional(),
  assignedTo: z.string().optional(),
  percentDone: z.number().int().min(0).max(100).default(0),
});

function mapGanttTask(t: any) {
  let weeks = t.weeks;
  if (!weeks || weeks.length !== WEEK_COUNT) {
    const sm = t.startMonth != null ? Number(t.startMonth) : 0;
    const em = t.endMonth != null ? Number(t.endMonth) : 0;
    weeks = startEndToWeeks(sm, em);
  }
  return {
    id: t.id,
    projectId: t.projectId,
    task: t.task,
    status: t.status || "not_started",
    priority: t.priority || "medium",
    atRisk: t.atRisk || false,
    weeks,
    remarks: t.remarks || "",
    assignedTo: t.assignedTo || "",
    percentDone: t.percentDone != null ? Number(t.percentDone) : 0,
    updatedAt: t.updatedAt,
  };
}

// When creating, generate weeks from startMonth/endMonth if not provided
function ensureWeeks(data: any) {
  if (data.weeks) return data;
  return { ...data, weeks: startEndToWeeks(data.startMonth ?? 0, data.endMonth ?? 0) };
}

router.get("/projects/:projectId/gantt-tasks", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const { projectId } = req.params;
  const all = await getAll<any>("project_gantt_tasks");
  const items = all.filter(i => i.projectId === projectId);
  res.json(items.map(mapGanttTask));
});

router.post("/projects/:projectId/gantt-tasks", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const parsed = GanttTaskSchema.safeParse({ ...req.body, projectId: req.params.projectId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const data = ensureWeeks(parsed.data);
  const doc = await createDoc("project_gantt_tasks", { ...data, createdAt: now, updatedAt: now });
  res.status(201).json(mapGanttTask(doc));
});

router.patch("/projects/:projectId/gantt-tasks/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("project_gantt_tasks", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = GanttTaskSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("project_gantt_tasks", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("project_gantt_tasks", id);
  res.json(mapGanttTask(updated));
});

router.delete("/projects/:projectId/gantt-tasks/:id", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("project_gantt_tasks", id);
  res.json({ success: true });
});

router.post("/projects/:projectId/gantt-tasks/seed", requireAnyPermission("canAccessProjects", "canAccessJmcs", "canAccessDevelopers"), async (req, res) => {
  const { projectId } = req.params;
  const existing = await getAll<any>("project_gantt_tasks");
  if (existing.some(i => i.projectId === projectId)) {
    res.json({ message: "Already seeded" });
    return;
  }
  const now = new Date().toISOString();
  const base = startEndToWeeks(0, 0);
  const seeds = [
    { task: "Internal Auditor Training Course for ISO FSSC 22000 V6", status: "in_progress", priority: "medium", weeks: base, percentDone: 0 },
    { task: "FSSC Gap Assessment", status: "not_started", priority: "medium", weeks: base },
    { task: "Plant Visit", status: "not_started", priority: "medium", weeks: base },
    { task: "Review and Documentation for the whole company procedures and work instructions", status: "not_started", priority: "high", weeks: base, percentDone: 0 },
    { task: "Critical Control Points - FSSC 22000 V6 Requirement Based on scope", status: "not_started", priority: "high", weeks: base },
    { task: "Infrastructure Alignment / Implementation", status: "not_started", priority: "high", weeks: base },
    { task: "Operational Integration of System", status: "not_started", priority: "high", weeks: base },
    { task: "Management Preparation prior to Stage 1", status: "not_started", priority: "high", weeks: base },
    { task: "Internal Audit execution (All Documents)", status: "not_started", priority: "high", weeks: startEndToWeeks(9, 9) },
    { task: "Management Review (Inputs and Outputs with analysis of results of implementation of FSSC)", status: "not_started", priority: "high", weeks: startEndToWeeks(9, 9) },
    { task: "Risk Assessment (All Departments)", status: "not_started", priority: "high", weeks: startEndToWeeks(10, 10) },
    { task: "Stage 1 FSSC 22000 Version 6", status: "not_started", priority: "high", weeks: base },
    { task: "Observation Review", status: "not_started", priority: "high", weeks: startEndToWeeks(11, 11) },
    { task: "Stage 2 FSSC 22000 Version 6", status: "not_started", priority: "high", weeks: startEndToWeeks(11, 11) },
    { task: "Non-Conformity Review (if necessary)", status: "not_started", priority: "high", weeks: startEndToWeeks(12, 12) },
    { task: "Non-Conformity Submission (if necessary)", status: "not_started", priority: "high", weeks: startEndToWeeks(12, 12) },
  ];
  const created = await Promise.all(seeds.map(s =>
    createDoc("project_gantt_tasks", { ...s, projectId, createdAt: now, updatedAt: now })
  ));
  res.status(201).json(created.map(mapGanttTask));
});

// ── Public Client Progress (no auth) ──

export async function getClientProgress(req: Request, res: Response): Promise<void> {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const token = req.query.token as string;
  if (!token) { res.status(401).json({ error: "Missing token" }); return; }
  const project = await getDoc<any>("projects", id);
  if (!project || project.shareToken !== token) { res.status(404).json({ error: "Not found" }); return; }

  const [checklist, deptTargets] = await Promise.all([
    getAll<any>("project_checklist"),
    getAll<any>("project_department_targets"),
  ]);

  const projectChecklist = checklist.filter(i => i.projectId === id);
  const totalItems = projectChecklist.length;
  const receivedItems = projectChecklist.filter(i => i.status !== "missing").length;
  const approvedItems = projectChecklist.filter(i => i.status === "approved").length;

  res.json({
    title: project.title,
    clientName: project.clientName,
    status: project.status,
    progress: project.progress,
    projectManager: project.projectManager,
    checklist: { total: totalItems, received: receivedItems, approved: approvedItems },
    departmentTargets: deptTargets.filter(i => i.projectId === id).length,
  });
}

export default router;
