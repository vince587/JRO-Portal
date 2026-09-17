import { Router, type IRouter, type Request, type Response } from "express";
import ExcelJS from "exceljs";
import { requireAnyPermission } from "../middlewares/auth";
import {
  getAll,
  getDoc,
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

router.get("/reports/leads", requireAnyPermission("canAccessJmcs", "canAccessDevelopers"), async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  const rows = (await getAll<LeadDoc>("leads")).filter(r => withinDateRange(r.createdAt, from, to));
  const csv = toCsv(rows.map(r => ({ ...r })), [
    { key: "id", label: "ID" },
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
  const name = `${req.currentUser?.fullName ?? ""} ${req.currentUser?.username ?? ""}`.toLowerCase();
  return name.includes("gatchalian") || /\bvince\b/.test(req.currentUser?.username ?? "");
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
  res.json(summary);
});

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

  const wb = new ExcelJS.Workbook();
  wb.creator = "Internal Portal";

  const summary = wb.addWorksheet("Summary");
  summary.columns = [
    { header: "Employee", key: "employee", width: 30 },
    { header: "Total Leads", key: "total", width: 14 },
  ];
  summary.getRow(1).font = { bold: true };
  for (const [key, list] of byEmployee.entries()) {
    const employee = nameById.get(key) || list[0].createdByName || key || "Unknown";
    summary.addRow({ employee, total: list.length }).commit();
  }

  const columns = [
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

  for (const [key, list] of byEmployee.entries()) {
    const employee = nameById.get(key) || list[0].createdByName || key || "Unknown";
    const ws = wb.addWorksheet(uniqueSheetName(employee));
    ws.columns = columns;
    ws.getRow(1).font = { bold: true };
    for (const r of list) {
      ws.addRow({
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
      }).commit();
    }
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
