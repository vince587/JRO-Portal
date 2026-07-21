import { Router, type IRouter } from "express";
import { requirePermission } from "../middlewares/auth";
import {
  getAll,
  type ContractDoc, type CertificateDoc, type ProjectDoc,
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

router.get("/reports/contracts", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
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

router.get("/reports/certificates", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
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

router.get("/reports/projects", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
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

export default router;
