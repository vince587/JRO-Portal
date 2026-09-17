import { Router, type IRouter } from "express";
import { z } from "zod";
import path from "path";
import fs from "fs";
import { getAll, getDoc, getDocByField, createDoc, updateDoc, deleteDoc, queryWhere, getStorageBucket, type EmployeeDoc, type UserDoc, type HrisDocumentDoc, type NotificationDoc } from "../lib/firebase-db";
import { requireRoleOrPermission, requireAuth, hasRole } from "../middlewares/auth";
import { emitChange } from "./sse";
import { logger } from "../lib/logger";
import { sendEmail } from "../lib/mailer";

const UPLOAD_DIR = path.join(process.cwd(), "uploads");

async function findEmployeeForUser(currentUser: { id: string; username: string; email: string }): Promise<EmployeeDoc | null> {
  for (const id of [currentUser.id, currentUser.username, currentUser.email]) {
    if (!id) continue;
    const found = await queryWhere<EmployeeDoc>("employees", "userId", "==", id);
    if (found.length > 0) return found[0];
  }
  if (currentUser.email) {
    const byEmail = await queryWhere<EmployeeDoc>("employees", "email", "==", currentUser.email);
    if (byEmail.length > 0) return byEmail[0];
  }
  if (currentUser.username) {
    const byUsername = await queryWhere<EmployeeDoc>("employees", "username", "==", currentUser.username);
    if (byUsername.length > 0) return byUsername[0];
  }
  return null;
}

async function notifyUser(userId: string, title: string, description: string, link: string, severity: NotificationDoc["severity"] = "info") {
  await createDoc<NotificationDoc>("notifications", {
    userId,
    type: "leave",
    title,
    description,
    entityId: "",
    severity,
    link,
    read: false,
    createdAt: new Date().toISOString(),
  });
}

const router: IRouter = Router();

function mapEmployee(e: EmployeeDoc) {
  return {
    id: e.id,
    userId: e.userId,
    employeeId: e.employeeId,
    email: e.email,
    username: e.username,
    position: e.position,
    dateHired: e.dateHired,
    employmentStatus: e.employmentStatus,
    contactNumber: e.contactNumber,
    address: e.address,
    emergencyContact: e.emergencyContact,
    emergencyContactNumber: e.emergencyContactNumber,
    educationalAttainment: e.educationalAttainment,
    sssNumber: e.sssNumber,
    tinNumber: e.tinNumber,
    philhealthNumber: e.philhealthNumber,
    pagibigNumber: e.pagibigNumber,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

const UpsertEmployeeBody = z.object({
  userId: z.string().min(1),
  employeeId: z.string().min(1),
  position: z.string().min(1),
  dateHired: z.string().min(1),
  employmentStatus: z.string().min(1),
  contactNumber: z.string().optional().default(""),
  address: z.string().optional().default(""),
  emergencyContact: z.string().optional().default(""),
  emergencyContactNumber: z.string().optional().default(""),
  educationalAttainment: z.string().optional().default(""),
  sssNumber: z.string().optional().default(""),
  tinNumber: z.string().optional().default(""),
  philhealthNumber: z.string().optional().default(""),
  pagibigNumber: z.string().optional().default(""),
});

router.get("/hris/employees", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canAccessAdmin"), async (_req, res): Promise<void> => {
  const employees = await getAll<EmployeeDoc>("employees", "createdAt", "desc");
  const currentUser = _req.currentUser!;
  res.json(employees.map(mapEmployee));
});

router.get("/hris/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const employee = await getDoc<EmployeeDoc>("employees", id);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  if (!hasRole(currentUser, "admin", "ADMIN", "IT") && !currentUser.canAccessAdmin && employee.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  res.json(mapEmployee(employee));
});

router.get("/hris/employees/by-user/:userId", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canAccessAdmin"), async (req, res): Promise<void> => {
  const userId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const employees = await queryWhere<EmployeeDoc>("employees", "userId", "==", userId);
  if (employees.length === 0) { res.status(404).json({ error: "Employee not found" }); return; }
  res.json(mapEmployee(employees[0]));
});

router.post("/hris/employees", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canAccessAdmin"), async (req, res): Promise<void> => {
  const parsed = UpsertEmployeeBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await queryWhere<EmployeeDoc>("employees", "userId", "==", parsed.data.userId);
  if (existing.length > 0) {
    await updateDoc("employees", existing[0].id!, { ...parsed.data, updatedAt: new Date().toISOString() });
    const updated = await getDoc<EmployeeDoc>("employees", existing[0].id!);
    res.json(mapEmployee(updated!));
    return;
  }
  // Enrich with user email/username for easier lookup
  let userEmail = "";
  let userUsername = "";
  try {
    const userDoc = await getDoc<UserDoc>("users", parsed.data.userId);
    if (userDoc) {
      userEmail = userDoc.email ?? "";
      userUsername = userDoc.username ?? "";
    }
  } catch (e) {
    // ignore enrichment errors
  }
  const now = new Date().toISOString();
  const employee = await createDoc("employees", {
    ...parsed.data,
    email: userEmail,
    username: userUsername,
    createdAt: now,
    updatedAt: now,
  });
  emitChange("employee", "created", (employee as unknown as EmployeeDoc).id);
  res.status(201).json(mapEmployee(employee as unknown as EmployeeDoc));
});

const SelfServiceEmployeeBody = z.object({
  contactNumber: z.string().optional().default(""),
  address: z.string().optional().default(""),
  emergencyContact: z.string().optional().default(""),
  emergencyContactNumber: z.string().optional().default(""),
  educationalAttainment: z.string().optional().default(""),
});

router.patch("/hris/employees/:id", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<EmployeeDoc>("employees", id);
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }
  const isAdmin = hasRole(currentUser, "admin", "ADMIN", "IT") || !!currentUser.canAccessAdmin;
  if (!isAdmin && existing.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  let parsedData: Record<string, unknown>;
  if (isAdmin) {
    const parsed = UpsertEmployeeBody.partial().safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    parsedData = parsed.data as Record<string, unknown>;
  } else {
    const parsed = SelfServiceEmployeeBody.safeParse(req.body);
    if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
    parsedData = parsed.data as Record<string, unknown>;
  }
  const now = new Date().toISOString();
  if (isAdmin) {
    // Enrich with user email/username if userId is being updated or missing
    let userEmail = existing.email ?? "";
    let userUsername = existing.username ?? "";
    const incomingUserId = parsedData.userId as string | undefined;
    if (incomingUserId && incomingUserId !== existing.userId) {
      try {
        const userDoc = await getDoc<UserDoc>("users", incomingUserId);
        if (userDoc) {
          userEmail = userDoc.email ?? "";
          userUsername = userDoc.username ?? "";
        }
      } catch (e) {
        // ignore enrichment errors
      }
    } else if (!existing.email || !existing.username) {
      // fallback: try to enrich from existing userId if missing
      try {
        const userDoc = await getDoc<UserDoc>("users", existing.userId);
        if (userDoc) {
          userEmail = userDoc.email ?? "";
          userUsername = userDoc.username ?? "";
        }
      } catch (e) {
        // ignore enrichment errors
      }
    }
    await updateDoc("employees", id, {
      ...parsedData,
      email: userEmail,
      username: userUsername,
      updatedAt: now,
    });
  } else {
    await updateDoc("employees", id, { ...parsedData, updatedAt: now });
  }
  const updated = await getDoc<EmployeeDoc>("employees", id);
  emitChange("employee", "updated", id);
  res.json(mapEmployee(updated!));
});

router.delete("/hris/employees/:id", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canAccessAdmin"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<EmployeeDoc>("employees", id);
  if (!existing) { res.status(404).json({ error: "Employee not found" }); return; }
  await deleteDoc("employees", id);
  emitChange("employee", "deleted", id);
  res.sendStatus(204);
});

function mapHrisDocument(d: HrisDocumentDoc) {
  return {
    id: d.id,
    employeeRef: d.employeeRef,
    employeeId: d.employeeId,
    filename: d.filename,
    size: d.size,
    type: d.type,
    uploadedBy: d.uploadedBy,
    uploadedAt: d.uploadedAt,
  };
}

router.get("/hris/employees/:id/documents", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const employee = await getDoc<EmployeeDoc>("employees", id);
  if (!employee) { res.status(404).json({ error: "Employee not found" }); return; }
  if (!hasRole(currentUser, "admin", "ADMIN", "IT") && !currentUser.canAccessAdmin && employee.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  const docs = await queryWhere<HrisDocumentDoc>("hrisDocuments", "employeeRef", "==", id, "uploadedAt", "desc");
  res.json(docs.map(mapHrisDocument));
});

router.get("/hris/documents/:docId", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
  const doc = await getDoc<HrisDocumentDoc>("hrisDocuments", docId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  const employee = await getDoc<EmployeeDoc>("employees", doc.employeeRef);
  if (!hasRole(currentUser, "admin", "ADMIN", "IT") && !currentUser.canAccessAdmin && employee?.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  res.json(mapHrisDocument(doc));
});

router.get("/hris/documents/:docId/download", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const docId = Array.isArray(req.params.docId) ? req.params.docId[0] : req.params.docId;
  const doc = await getDoc<HrisDocumentDoc>("hrisDocuments", docId);
  if (!doc) { res.status(404).json({ error: "Document not found" }); return; }
  const employee = await getDoc<EmployeeDoc>("employees", doc.employeeRef);
  if (!hasRole(currentUser, "admin", "ADMIN", "IT") && !currentUser.canAccessAdmin && employee?.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  const filePath = path.join(UPLOAD_DIR, doc.storedAs);
  // New uploads live in Firebase Storage (cloud). Re-sign a fresh URL from the
  // stored path so downloads keep working without depending on storage rules.
  if (doc.storedAs && doc.storedAs.startsWith("documents/")) {
    try {
      const [url] = await getStorageBucket()
        .file(doc.storedAs)
        .getSignedUrl({ action: "read", expires: Date.now() + 7 * 24 * 60 * 60 * 1000 });
      res.redirect(url);
      return;
    } catch (e) {
      logger.warn({ err: e }, "Failed to sign HRIS document URL");
    }
  }
  if (doc.fileUrl) {
    res.redirect(doc.fileUrl);
    return;
  }
  // Fallback for any files uploaded before the cloud migration.
  if (!fs.existsSync(filePath)) { res.status(404).json({ error: "File not found on server" }); return; }
  res.download(filePath, doc.filename);
});

router.get("/hris/my-profile", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  logger.info(
    { currentUserId: currentUser.id, username: currentUser.username, email: currentUser.email, role: currentUser.role },
    "[my-profile] incoming request",
  );
  // Try to match by userId (Firebase UID / Firestore doc id), username, or email
  const idsToTry = [currentUser.id, currentUser.username, currentUser.email];
  for (const id of idsToTry) {
    if (!id) continue;
    const employees = await queryWhere<EmployeeDoc>("employees", "userId", "==", id);
    if (employees.length > 0) { res.json(mapEmployee(employees[0])); return; }
  }
  // Fallback: try matching by employeeId (sometimes users know their employee ID)
  const employeeId = currentUser.username ?? currentUser.email ?? currentUser.id;
  if (employeeId) {
    const employees = await queryWhere<EmployeeDoc>("employees", "employeeId", "==", employeeId);
    if (employees.length > 0) { res.json(mapEmployee(employees[0])); return; }
  }
  // Additional fallback: match by email or username fields stored on employee doc
  if (currentUser.email) {
    const employees = await queryWhere<EmployeeDoc>("employees", "email", "==", currentUser.email);
    if (employees.length > 0) { res.json(mapEmployee(employees[0])); return; }
  }
  if (currentUser.username) {
    const employees = await queryWhere<EmployeeDoc>("employees", "username", "==", currentUser.username);
    if (employees.length > 0) { res.json(mapEmployee(employees[0])); return; }
  }
  logger.warn(
    { currentUserId: currentUser.id, username: currentUser.username, email: currentUser.email },
    "[my-profile] NO employee record matched",
  );
  res.json(null);
});

router.get("/hris/stats", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canAccessAdmin"), async (_req, res): Promise<void> => {
  const employees = await getAll<EmployeeDoc>("employees", "createdAt", "desc");
  const total = employees.length;
  const regular = employees.filter(e => e.employmentStatus === "Regular").length;
  const probationary = employees.filter(e => e.employmentStatus === "Probationary").length;
  const contractual = employees.filter(e => e.employmentStatus === "Contractual").length;
  const partTime = employees.filter(e => e.employmentStatus === "Part-Time").length;
  const intern = employees.filter(e => e.employmentStatus === "Intern").length;
  res.json({ total, regular, probationary, contractual, partTime, intern });
});

const LEAVE_TYPES = ["Vacation", "Sick", "Emergency", "Personal", "Bereavement", "Maternity", "Paternity", "Offset"] as const;
const LEAVE_STATUSES = ["pending", "approved", "rejected"] as const;
const COMPANY_OPTIONS = ["JMCS", "SIS Certification and Inspection Philippines OPC"] as const;

// Default annual leave entitlement per type. Phase 2 will replace this with accrual-based tracking.
const ANNUAL_LEAVE_ENTITLEMENT: Record<string, number> = {
  Vacation: 15,
  Sick: 10,
  Emergency: 5,
  Personal: 5,
  Bereavement: 5,
  Maternity: 105,
  Paternity: 15,
  Offset: 0,
};

const CreateLeaveBody = z.object({
  employeeId: z.string().min(1),
  type: z.enum(LEAVE_TYPES),
  company: z.enum(COMPANY_OPTIONS).default("JMCS"),
  startDate: z.string().min(1),
  endDate: z.string().min(1),
  daysCount: z.coerce.number().min(1),
  reason: z.string().min(1),
});

const UpdateLeaveBody = z.object({
  status: z.enum(LEAVE_STATUSES),
  approverComment: z.string().optional(),
});

function mapLeave(l: any) {
  return {
    id: l.id,
    employeeId: l.employeeId,
    userId: l.userId,
    userFullName: l.userFullName || "",
    type: l.type,
    company: l.company || "JMCS",
    startDate: l.startDate,
    endDate: l.endDate,
    daysCount: l.daysCount,
    reason: l.reason,
    status: l.status || "pending",
    approverComment: l.approverComment || "",
    createdAt: l.createdAt,
    updatedAt: l.updatedAt,
  };
}

router.get("/hris/leaves/balance", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const leaves = await queryWhere<any>("leaves", "userId", "==", currentUser.id);
  const employee = await findEmployeeForUser(currentUser);
  const now = new Date();
  let monthsEmployed = 0;
  if (employee?.dateHired) {
    const hired = new Date(employee.dateHired);
    monthsEmployed = (now.getFullYear() - hired.getFullYear()) * 12 + (now.getMonth() - hired.getMonth());
    if (monthsEmployed < 0) monthsEmployed = 0;
  }
  const usedByType: Record<string, number> = {};
  for (const l of leaves) {
    if (l.status === "approved") {
      usedByType[l.type] = (usedByType[l.type] ?? 0) + (Number(l.daysCount) || 0);
    }
  }
  const balances = LEAVE_TYPES.map((type) => {
    const entitlement = ANNUAL_LEAVE_ENTITLEMENT[type] ?? 0;
    const monthly = entitlement / 12;
    const accrued = entitlement === 0 ? 0 : Math.min(entitlement, Math.round(monthly * monthsEmployed * 10) / 10);
    const used = usedByType[type] ?? 0;
    return { type, entitlement, accrued, used, remaining: Math.max(0, accrued - used) };
  });
  res.json({ balances, pending: leaves.filter((l: any) => l.status === "pending").map(mapLeave) });
});

router.get("/hris/leaves", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const isAdmin = ["ADMIN", "admin"].includes(currentUser.role) || currentUser.roles?.some((r: string) => ["ADMIN", "admin"].includes(r)) || !!currentUser.canAccessAdmin;
  if (isAdmin) {
    const leaves = await getAll("leaves", "createdAt", "desc");
    res.json(leaves.map(mapLeave));
  } else {
    const leaves = await queryWhere("leaves", "userId", "==", currentUser.id);
    res.json(leaves.map(mapLeave));
  }
});

router.get("/hris/leaves/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const leave = await getDoc<any>("leaves", id);
  if (!leave) { res.status(404).json({ error: "Leave not found" }); return; }
  const currentUser = req.currentUser!;
  const isAdmin = ["ADMIN", "admin"].includes(currentUser.role) || currentUser.roles?.some((r: string) => ["ADMIN", "admin"].includes(r)) || !!currentUser.canAccessAdmin;
  if (!isAdmin && leave.userId !== currentUser.id) {
    res.status(403).json({ error: "Access denied" }); return;
  }
  res.json(mapLeave(leave));
});

router.post("/hris/leaves", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const parsed = CreateLeaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const leave = await createDoc("leaves", {
    ...parsed.data,
    daysCount: Number(parsed.data.daysCount),
    userId: currentUser.id,
    userFullName: currentUser.fullName || currentUser.username || "",
    status: "pending",
    approverComment: "",
    createdAt: now,
    updatedAt: now,
  });
  await createDoc("activity", {
    type: "user",
    description: `Leave request filed by ${currentUser.fullName || currentUser.username}: ${parsed.data.type} (${parsed.data.startDate} - ${parsed.data.endDate})`,
    entityId: leave.id,
    timestamp: now,
  });
  emitChange("leave", "created", leave.id);
  // Notify admins of the new request
  try {
    const users = await getAll<UserDoc>("users");
    for (const u of users) {
      if (hasRole(u, "admin", "ADMIN", "IT")) {
        await notifyUser(u.id ?? u.uid, "New Leave Request", `${leave.userFullName || leave.userId} filed a ${leave.type} leave (${leave.startDate} - ${leave.endDate}).`, "/hris", "info");
      }
    }
  } catch (e) {
    logger.warn({ err: e }, "[leave] failed to notify admins");
  }
  res.status(201).json(mapLeave(leave));
});

router.patch("/hris/leaves/:id", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canAccessAdmin"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<any>("leaves", id);
  if (!existing) { res.status(404).json({ error: "Leave not found" }); return; }
  const parsed = UpdateLeaveBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  await updateDoc("leaves", id, { ...parsed.data, updatedAt: now });
  const currentUser = req.currentUser!;
  await createDoc("activity", {
    type: "user",
    description: `Leave ${parsed.data.status} by ${currentUser.fullName || currentUser.username} for ${existing.userFullName || existing.userId}`,
    entityId: id,
    timestamp: now,
  });
  // Notify the requester of the decision
  try {
    const requester = await getDoc<UserDoc>("users", existing.userId);
    const statusLabel = parsed.data.status === "approved" ? "approved" : "rejected";
    await notifyUser(existing.userId, `Leave Request ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`, `Your ${existing.type} leave request (${existing.startDate} - ${existing.endDate}) was ${statusLabel}.`, `/hris/leaves/${id}`, parsed.data.status === "approved" ? "info" : "warning");
    if (requester?.email) {
      const subject = `[JMCS Portal] Leave Request ${statusLabel.charAt(0).toUpperCase() + statusLabel.slice(1)}`;
      const text = `Hi ${requester.fullName || requester.username},\n\nYour ${existing.type} leave request (${existing.startDate} - ${existing.endDate}) has been ${statusLabel}.\n\n${parsed.data.approverComment ? `Approver comment: ${parsed.data.approverComment}\n\n` : ""}View details: ${process.env.BASE_URL || "https://jmcs-portal.replit.app"}/hris/leaves/${id}\n\nJMCS Portal`;
      await sendEmail({ to: requester.email, subject, text });
    }
  } catch (e) {
    logger.warn({ err: e }, "[leave] failed to notify requester");
  }
  emitChange("leave", "updated", id);
  const updated = await getDoc<any>("leaves", id);
  res.json(mapLeave(updated));
});

export default router;
