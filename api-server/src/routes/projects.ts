import { Router, type IRouter, type Request, type Response } from "express";
import { z } from "zod";
import crypto from "crypto";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type ProjectDoc,
} from "../lib/firebase-db";
import {
  ListProjectsQueryParams,
  CreateProjectBody,
  UpdateProjectBody,
} from "../../lib/api-zod/index.js";
import { requireRole, requirePermission } from "../middlewares/auth";
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

router.get("/projects/summary", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res): Promise<void> => {
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

router.get("/projects", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res): Promise<void> => {
  const params = ListProjectsQueryParams.safeParse(req.query);
  let rows = await getAll<ProjectDoc>("projects", "createdAt", "desc");
  if (params.success && params.data.status) {
    rows = rows.filter(p => p.status === params.data.status);
  }
  res.json(rows.map(mapProject));
});

router.post("/projects", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res): Promise<void> => {
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

router.get("/projects/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const project = await getDoc<ProjectDoc>("projects", id);
  if (!project) {
    res.status(404).json({ error: "Project not found" });
    return;
  }
  res.json(mapProject(project));
});

router.patch("/projects/:id", requirePermission("canAccessProjects", "canAccessJmcs"), requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
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

router.post("/projects/:id/share", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("projects", id);
  if (!existing) { res.status(404).json({ error: "Project not found" }); return; }
  const shareToken = crypto.randomBytes(16).toString("hex");
  await updateDoc("projects", id, { shareToken, updatedAt: new Date().toISOString() });
  res.json({ shareToken });
});

router.delete("/projects/:id", requirePermission("canAccessProjects", "canAccessJmcs"), requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
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

router.post("/projects/bulk-delete", requirePermission("canAccessProjects", "canAccessJmcs"), requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
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

router.get("/projects/:projectId/checklist", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const { projectId } = req.params;
  const all = await getAll<any>("project_checklist");
  const items = all.filter(i => i.projectId === projectId);
  res.json(items.map(mapChecklistItem));
});

router.post("/projects/:projectId/checklist", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const parsed = ChecklistItemSchema.safeParse({ ...req.body, projectId: req.params.projectId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("project_checklist", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapChecklistItem(doc));
});

router.patch("/projects/:projectId/checklist/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("project_checklist", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = ChecklistItemSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("project_checklist", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("project_checklist", id);
  res.json(mapChecklistItem(updated));
});

router.delete("/projects/:projectId/checklist/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
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

router.get("/projects/:projectId/department-targets", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const { projectId } = req.params;
  const all = await getAll<any>("project_department_targets");
  const items = all.filter(i => i.projectId === projectId);
  res.json(items.map(mapDepartmentTarget));
});

router.post("/projects/:projectId/department-targets", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const parsed = DepartmentTargetSchema.safeParse({ ...req.body, projectId: req.params.projectId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("project_department_targets", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapDepartmentTarget(doc));
});

router.patch("/projects/:projectId/department-targets/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("project_department_targets", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = DepartmentTargetSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("project_department_targets", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("project_department_targets", id);
  res.json(mapDepartmentTarget(updated));
});

router.delete("/projects/:projectId/department-targets/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
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

router.get("/projects/:projectId/gantt-tasks", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const { projectId } = req.params;
  const all = await getAll<any>("project_gantt_tasks");
  const items = all.filter(i => i.projectId === projectId);
  res.json(items.map(mapGanttTask));
});

router.post("/projects/:projectId/gantt-tasks", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const parsed = GanttTaskSchema.safeParse({ ...req.body, projectId: req.params.projectId });
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const data = ensureWeeks(parsed.data);
  const doc = await createDoc("project_gantt_tasks", { ...data, createdAt: now, updatedAt: now });
  res.status(201).json(mapGanttTask(doc));
});

router.patch("/projects/:projectId/gantt-tasks/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("project_gantt_tasks", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = GanttTaskSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("project_gantt_tasks", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("project_gantt_tasks", id);
  res.json(mapGanttTask(updated));
});

router.delete("/projects/:projectId/gantt-tasks/:id", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("project_gantt_tasks", id);
  res.json({ success: true });
});

router.post("/projects/:projectId/gantt-tasks/seed", requirePermission("canAccessProjects", "canAccessJmcs"), async (req, res) => {
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
