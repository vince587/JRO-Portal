import { Router, type IRouter } from "express";
import { z } from "zod";
import { getAll, getDoc, createDoc, updateDoc, deleteDoc } from "../lib/firebase-db";
import { requireRole } from "../middlewares/auth";

const router: IRouter = Router();

router.use(requireRole("admin", "ADMIN", "IT"));

const COMPANY_OPTIONS = ["JMCS", "SIS Certification and Inspection Philippines OPC"] as const;

// ── Legal Files ──

const LegalFileSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  title: z.string().min(1),
  type: z.string().min(1),
  fileUrl: z.string().optional(),
  expiryDate: z.string().optional(),
  notes: z.string().optional(),
});

function mapLegalFile(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    title: l.title,
    type: l.type,
    fileUrl: l.fileUrl || "",
    expiryDate: l.expiryDate || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/legal-files", async (_req, res) => {
  const files = await getAll("legal_files", "createdAt", "desc");
  res.json(files.map(mapLegalFile));
});

router.post("/admin/legal-files", async (req, res) => {
  const parsed = LegalFileSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("legal_files", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapLegalFile(doc));
});

router.patch("/admin/legal-files/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("legal_files", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = LegalFileSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("legal_files", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("legal_files", id);
  res.json(mapLegalFile(updated));
});

router.delete("/admin/legal-files/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("legal_files", id);
  res.json({ success: true });
});

// ── Invoices ──

const InvoiceSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  invoiceNo: z.string().min(1),
  clientName: z.string().min(1),
  amount: z.coerce.number().min(0),
  status: z.enum(["draft", "sent", "paid", "cancelled"]).default("draft"),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

function mapInvoice(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    invoiceNo: l.invoiceNo,
    clientName: l.clientName,
    amount: l.amount,
    status: l.status || "draft",
    issueDate: l.issueDate || "",
    dueDate: l.dueDate || "",
    paidDate: l.paidDate || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/invoices", async (_req, res) => {
  const invoices = await getAll("invoices", "createdAt", "desc");
  res.json(invoices.map(mapInvoice));
});

router.post("/admin/invoices", async (req, res) => {
  const parsed = InvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("invoices", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapInvoice(doc));
});

router.patch("/admin/invoices/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("invoices", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = InvoiceSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("invoices", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("invoices", id);
  res.json(mapInvoice(updated));
});

router.delete("/admin/invoices/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("invoices", id);
  res.json({ success: true });
});

// ── Expenses ──

const ExpenseSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  category: z.string().min(1),
  amount: z.coerce.number().min(0),
  description: z.string().min(1),
  date: z.string().optional(),
  receiptUrl: z.string().optional(),
  notes: z.string().optional(),
});

function mapExpense(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    category: l.category,
    amount: l.amount,
    description: l.description,
    date: l.date || "",
    receiptUrl: l.receiptUrl || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/expenses", async (_req, res) => {
  const expenses = await getAll("expenses", "createdAt", "desc");
  res.json(expenses.map(mapExpense));
});

router.post("/admin/expenses", async (req, res) => {
  const parsed = ExpenseSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("expenses", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapExpense(doc));
});

router.patch("/admin/expenses/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("expenses", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = ExpenseSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("expenses", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("expenses", id);
  res.json(mapExpense(updated));
});

router.delete("/admin/expenses/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("expenses", id);
  res.json({ success: true });
});

// ── Remittances (BIR, PhilHealth, Pag-IBIG, SSS) ──

const REMITTANCE_TYPES = ["BIR", "PhilHealth", "Pag-IBIG", "SSS"] as const;

const RemittanceSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  type: z.enum(REMITTANCE_TYPES),
  amount: z.coerce.number().min(0),
  dueDate: z.string().optional(),
  paidDate: z.string().optional(),
  status: z.enum(["pending", "paid", "overdue"]).default("pending"),
  referenceNo: z.string().optional(),
  notes: z.string().optional(),
});

function mapRemittance(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    type: l.type,
    amount: l.amount,
    dueDate: l.dueDate || "",
    paidDate: l.paidDate || "",
    status: l.status || "pending",
    referenceNo: l.referenceNo || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/remittances", async (_req, res) => {
  const remittances = await getAll("remittances", "createdAt", "desc");
  res.json(remittances.map(mapRemittance));
});

router.post("/admin/remittances", async (req, res) => {
  const parsed = RemittanceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("remittances", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapRemittance(doc));
});

router.patch("/admin/remittances/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("remittances", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = RemittanceSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("remittances", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("remittances", id);
  res.json(mapRemittance(updated));
});

router.delete("/admin/remittances/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("remittances", id);
  res.json({ success: true });
});

// ── Billing Invoices (Monitoring) ──

const BillingInvoiceSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  invoiceNo: z.string().min(1),
  clientName: z.string().min(1),
  amount: z.coerce.number().min(0),
  status: z.enum(["draft", "sent", "paid", "cancelled"]).default("draft"),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

function mapBillingInvoice(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    invoiceNo: l.invoiceNo,
    clientName: l.clientName,
    amount: l.amount,
    status: l.status || "draft",
    issueDate: l.issueDate || "",
    dueDate: l.dueDate || "",
    paidDate: l.paidDate || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/billing-invoices", async (_req, res) => {
  const items = await getAll("billing_invoices", "createdAt", "desc");
  res.json(items.map(mapBillingInvoice));
});

router.post("/admin/billing-invoices", async (req, res) => {
  const parsed = BillingInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("billing_invoices", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapBillingInvoice(doc));
});

router.patch("/admin/billing-invoices/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("billing_invoices", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = BillingInvoiceSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("billing_invoices", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("billing_invoices", id);
  res.json(mapBillingInvoice(updated));
});

router.delete("/admin/billing-invoices/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("billing_invoices", id);
  res.json({ success: true });
});

// ── Sales (New Sales Monitoring) ──

const SALES_STATUSES = ["prospect", "quotation", "won", "lost"] as const;

const SalesSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  clientName: z.string().min(1),
  projectName: z.string().min(1),
  amount: z.coerce.number().min(0),
  status: z.enum(SALES_STATUSES).default("prospect"),
  date: z.string().optional(),
  notes: z.string().optional(),
});

function mapSale(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    clientName: l.clientName,
    projectName: l.projectName,
    amount: l.amount,
    status: l.status || "prospect",
    date: l.date || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/sales", async (_req, res) => {
  const items = await getAll("sales", "createdAt", "desc");
  res.json(items.map(mapSale));
});

router.post("/admin/sales", async (req, res) => {
  const parsed = SalesSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("sales", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapSale(doc));
});

router.patch("/admin/sales/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("sales", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = SalesSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("sales", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("sales", id);
  res.json(mapSale(updated));
});

router.delete("/admin/sales/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("sales", id);
  res.json({ success: true });
});

// ── Service Invoices (Monitoring) ──

const ServiceInvoiceSchema = z.object({
  company: z.enum(COMPANY_OPTIONS),
  invoiceNo: z.string().min(1),
  clientName: z.string().min(1),
  serviceDescription: z.string().min(1),
  amount: z.coerce.number().min(0),
  status: z.enum(["draft", "sent", "paid", "cancelled"]).default("draft"),
  issueDate: z.string().optional(),
  dueDate: z.string().optional(),
  paidDate: z.string().optional(),
  notes: z.string().optional(),
});

function mapServiceInvoice(l: any) {
  return {
    id: l.id,
    company: l.company || "JMCS",
    invoiceNo: l.invoiceNo,
    clientName: l.clientName,
    serviceDescription: l.serviceDescription,
    amount: l.amount,
    status: l.status || "draft",
    issueDate: l.issueDate || "",
    dueDate: l.dueDate || "",
    paidDate: l.paidDate || "",
    notes: l.notes || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/admin/service-invoices", async (_req, res) => {
  const items = await getAll("service_invoices", "createdAt", "desc");
  res.json(items.map(mapServiceInvoice));
});

router.post("/admin/service-invoices", async (req, res) => {
  const parsed = ServiceInvoiceSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("service_invoices", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapServiceInvoice(doc));
});

router.patch("/admin/service-invoices/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("service_invoices", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = ServiceInvoiceSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  await updateDoc("service_invoices", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("service_invoices", id);
  res.json(mapServiceInvoice(updated));
});

router.delete("/admin/service-invoices/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("service_invoices", id);
  res.json({ success: true });
});

// ── Compliance Calendar ──

router.get("/admin/compliance-calendar", async (_req, res) => {
  const [remittances, legalFiles] = await Promise.all([
    getAll<any>("remittances"),
    getAll<any>("legal_files"),
  ]);
  const now = new Date();
  const upcoming: any[] = [];

  for (const r of remittances) {
    if (r.dueDate) {
      const due = new Date(r.dueDate);
      const daysUntil = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      upcoming.push({
        id: r.id,
        type: "remittance",
        company: r.company || "JMCS",
        title: `${r.type} - ${r.company}`,
        dueDate: r.dueDate,
        daysUntil,
        status: r.status || "pending",
        amount: r.amount,
      });
    }
  }

  for (const lf of legalFiles) {
    if (lf.expiryDate) {
      const expiry = new Date(lf.expiryDate);
      const daysUntil = Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
      upcoming.push({
        id: lf.id,
        type: "legal_file",
        company: lf.company || "JMCS",
        title: lf.title,
        dueDate: lf.expiryDate,
        daysUntil,
        status: daysUntil <= 0 ? "expired" : daysUntil <= 30 ? "expiring" : "active",
      });
    }
  }

  upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
  res.json(upcoming.slice(0, 50));
});

// ── Payroll Periods (admin-suggested coverage dates) ──

const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

const PayrollPeriodSchema = z.object({
  startDate: z.string().regex(DATE_PATTERN, "startDate must be YYYY-MM-DD"),
  endDate: z.string().regex(DATE_PATTERN, "endDate must be YYYY-MM-DD"),
});

function mapPayrollPeriod(p: any) {
  return {
    id: p.id,
    startDate: p.startDate,
    endDate: p.endDate,
    createdAt: p.createdAt,
    updatedAt: p.updatedAt ?? null,
  };
}

router.post("/admin/payroll-periods", async (req, res) => {
  const parsed = PayrollPeriodSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.endDate < parsed.data.startDate) { res.status(400).json({ error: "End date cannot be before start date" }); return; }
  const now = new Date().toISOString();
  const doc = await createDoc("payroll_periods", { ...parsed.data, createdAt: now, updatedAt: now });
  res.status(201).json(mapPayrollPeriod(doc));
});

router.patch("/admin/payroll-periods/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("payroll_periods", id);
  if (!existing) { res.status(404).json({ error: "Not found" }); return; }
  const parsed = PayrollPeriodSchema.partial().safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const updatedData = { ...existing, ...parsed.data };
  if (updatedData.endDate < updatedData.startDate) { res.status(400).json({ error: "End date cannot be before start date" }); return; }
  await updateDoc("payroll_periods", id, { ...parsed.data, updatedAt: new Date().toISOString() });
  const updated = await getDoc<any>("payroll_periods", id);
  res.json(mapPayrollPeriod(updated));
});

router.delete("/admin/payroll-periods/:id", async (req, res) => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("payroll_periods", id);
  res.json({ success: true });
});

// ── Official Hours (admin-suggested schedule) ──

const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;

const OfficialHoursSchema = z.object({
  regular: z.object({
    arrival: z.string().regex(TIME_PATTERN, "regular arrival must be HH:MM"),
    departure: z.string().regex(TIME_PATTERN, "regular departure must be HH:MM"),
    hours: z.coerce.number().min(0.5).max(24),
  }),
  saturday: z.object({
    arrival: z.string().regex(TIME_PATTERN, "saturday arrival must be HH:MM"),
    departure: z.string().regex(TIME_PATTERN, "saturday departure must be HH:MM"),
    hours: z.coerce.number().min(0.5).max(24),
  }),
});

router.put("/admin/official-hours", async (req, res) => {
  const parsed = OfficialHoursSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  if (parsed.data.regular.arrival >= parsed.data.regular.departure) { res.status(400).json({ error: "Regular departure must be after arrival" }); return; }
  if (parsed.data.saturday.arrival >= parsed.data.saturday.departure) { res.status(400).json({ error: "Saturday departure must be after arrival" }); return; }
  const now = new Date().toISOString();
  await createDoc("payroll_settings", { ...parsed.data, updatedAt: now }, "official_hours");
  res.json({ ...parsed.data, updatedAt: now });
});

export default router;
