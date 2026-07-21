import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  getAll, getDoc, createDoc, updateDoc, queryWhere,
  type EmployeeDoc, type AttendanceDoc, type TimesheetDoc,
} from "../lib/firebase-db";
import { requireRole, requireAuth, hasRole } from "../middlewares/auth";
import { emitChange } from "./sse";
import { logger } from "../lib/logger";

const router: IRouter = Router();

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

function todayString(): string {
  return new Date().toISOString().slice(0, 10);
}

function computeHours(clockIn: string, clockOut: string): number {
  const diffMs = new Date(clockOut).getTime() - new Date(clockIn).getTime();
  if (diffMs <= 0) return 0;
  return Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;
}

function mapAttendance(a: AttendanceDoc) {
  return {
    id: a.id,
    userId: a.userId,
    userFullName: a.userFullName || "",
    employeeId: a.employeeId || "",
    date: a.date,
    clockIn: a.clockIn,
    clockOut: a.clockOut ?? null,
    clockInLocation: a.clockInLocation ?? null,
    clockOutLocation: a.clockOutLocation ?? null,
    hoursWorked: a.hoursWorked ?? 0,
    status: a.status || "present",
    notes: a.notes ?? null,
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

const LocationSchema = z.object({ lat: z.number(), lng: z.number() }).optional();

const ClockInBody = z.object({
  location: LocationSchema,
  notes: z.string().optional(),
});

const ClockOutBody = z.object({
  location: LocationSchema,
});

router.get("/attendance/today", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const date = todayString();
  const records = await queryWhere<AttendanceDoc>("attendance", "userId", "==", currentUser.id);
  const today = records.find(r => r.date === date) ?? null;
  res.json(today ? mapAttendance(today) : null);
});

router.post("/attendance/clock-in", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const parsed = ClockInBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const date = todayString();
  const existing = (await queryWhere<AttendanceDoc>("attendance", "userId", "==", currentUser.id)).find(r => r.date === date);
  if (existing && !existing.clockOut) { res.status(400).json({ error: "Already clocked in" }); return; }
  if (existing && existing.clockOut) { res.status(400).json({ error: "Attendance already completed for today" }); return; }
  const employee = await findEmployeeForUser(currentUser);
  const now = new Date().toISOString();
  const record = await createDoc<AttendanceDoc>("attendance", {
    userId: currentUser.id,
    userFullName: currentUser.fullName || currentUser.username || "",
    employeeId: employee?.employeeId || "",
    date,
    clockIn: now,
    clockOut: null,
    clockInLocation: parsed.data.location ?? null,
    clockOutLocation: null,
    hoursWorked: 0,
    status: "present",
    notes: parsed.data.notes ?? null,
    createdAt: now,
    updatedAt: now,
  });
  emitChange("attendance", "created", record.id);
  res.status(201).json(mapAttendance(record));
});

router.post("/attendance/clock-out", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const parsed = ClockOutBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const date = todayString();
  const existing = (await queryWhere<AttendanceDoc>("attendance", "userId", "==", currentUser.id)).find(r => r.date === date);
  if (!existing) { res.status(400).json({ error: "You have not clocked in today" }); return; }
  if (existing.clockOut) { res.status(400).json({ error: "Already clocked out" }); return; }
  const now = new Date().toISOString();
  const hoursWorked = computeHours(existing.clockIn, now);
  await updateDoc("attendance", existing.id!, {
    clockOut: now,
    clockOutLocation: parsed.data.location ?? null,
    hoursWorked,
    updatedAt: now,
  });
  const updated = await getDoc<AttendanceDoc>("attendance", existing.id!);
  emitChange("attendance", "updated", existing.id);
  res.json(mapAttendance(updated!));
});

router.get("/attendance", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const isAdmin = hasRole(currentUser, "admin", "ADMIN", "IT");
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  let records: AttendanceDoc[];
  if (isAdmin) {
    records = await getAll<AttendanceDoc>("attendance");
  } else {
    records = await queryWhere<AttendanceDoc>("attendance", "userId", "==", currentUser.id);
  }
  let filtered = records;
  if (from) filtered = filtered.filter(r => r.date >= from);
  if (to) filtered = filtered.filter(r => r.date <= to);
  filtered.sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
  res.json(filtered.map(mapAttendance));
});

router.get("/attendance/report", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const from = typeof req.query.from === "string" ? req.query.from : undefined;
  const to = typeof req.query.to === "string" ? req.query.to : undefined;
  let records = await getAll<AttendanceDoc>("attendance");
  if (from) records = records.filter(r => r.date >= from);
  if (to) records = records.filter(r => r.date <= to);
  const byUser: Record<string, { userId: string; userFullName: string; employeeId: string; totalHours: number; daysPresent: number }> = {};
  for (const r of records) {
    const key = r.userId;
    if (!byUser[key]) {
      byUser[key] = { userId: r.userId, userFullName: r.userFullName || "", employeeId: r.employeeId || "", totalHours: 0, daysPresent: 0 };
    }
    byUser[key].totalHours += r.hoursWorked || 0;
    byUser[key].daysPresent += 1;
  }
  const summary = Object.values(byUser).map(u => ({ ...u, totalHours: Math.round(u.totalHours * 100) / 100 }));
  summary.sort((a, b) => b.totalHours - a.totalHours);
  res.json({ summary, totalRecords: records.length });
});

function mapTimesheet(t: TimesheetDoc) {
  return {
    id: t.id,
    userId: t.userId,
    userFullName: t.userFullName || "",
    employeeId: t.employeeId || "",
    periodStart: t.periodStart,
    periodEnd: t.periodEnd,
    totalHours: t.totalHours ?? 0,
    status: t.status || "pending",
    approverComment: t.approverComment || "",
    submittedAt: t.submittedAt,
    reviewedAt: t.reviewedAt ?? null,
    createdAt: t.createdAt,
    updatedAt: t.updatedAt,
  };
}

const SubmitTimesheetBody = z.object({
  periodStart: z.string().min(1),
  periodEnd: z.string().min(1),
});

const ReviewTimesheetBody = z.object({
  status: z.enum(["approved", "rejected"]),
  approverComment: z.string().optional(),
});

router.get("/timesheets", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const isAdmin = hasRole(currentUser, "admin", "ADMIN", "IT");
  let sheets: TimesheetDoc[];
  if (isAdmin) {
    sheets = await getAll<TimesheetDoc>("timesheets", "createdAt", "desc");
  } else {
    sheets = await queryWhere<TimesheetDoc>("timesheets", "userId", "==", currentUser.id);
    sheets.sort((a, b) => (a.createdAt < b.createdAt ? 1 : -1));
  }
  res.json(sheets.map(mapTimesheet));
});

router.post("/timesheets", requireAuth, async (req, res): Promise<void> => {
  const currentUser = req.currentUser!;
  const parsed = SubmitTimesheetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const { periodStart, periodEnd } = parsed.data;
  if (periodEnd < periodStart) { res.status(400).json({ error: "Period end cannot be before period start" }); return; }
  const employee = await findEmployeeForUser(currentUser);
  const records = (await queryWhere<AttendanceDoc>("attendance", "userId", "==", currentUser.id))
    .filter(r => r.date >= periodStart && r.date <= periodEnd);
  const totalHours = Math.round(records.reduce((sum, r) => sum + (r.hoursWorked || 0), 0) * 100) / 100;
  const now = new Date().toISOString();
  const sheet = await createDoc<TimesheetDoc>("timesheets", {
    userId: currentUser.id,
    userFullName: currentUser.fullName || currentUser.username || "",
    employeeId: employee?.employeeId || "",
    periodStart,
    periodEnd,
    totalHours,
    status: "pending",
    approverComment: "",
    submittedAt: now,
    reviewedAt: null,
    createdAt: now,
    updatedAt: now,
  });
  await createDoc("activity", {
    type: "user",
    description: `Timesheet submitted by ${currentUser.fullName || currentUser.username} (${periodStart} - ${periodEnd}, ${totalHours}h)`,
    entityId: sheet.id,
    timestamp: now,
  });
  emitChange("timesheet", "created", sheet.id);
  res.status(201).json(mapTimesheet(sheet));
});

router.patch("/timesheets/:id", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<TimesheetDoc>("timesheets", id);
  if (!existing) { res.status(404).json({ error: "Timesheet not found" }); return; }
  const parsed = ReviewTimesheetBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  await updateDoc("timesheets", id, {
    status: parsed.data.status,
    approverComment: parsed.data.approverComment ?? "",
    reviewedAt: now,
    updatedAt: now,
  });
  const currentUser = req.currentUser!;
  await createDoc("activity", {
    type: "user",
    description: `Timesheet ${parsed.data.status} by ${currentUser.fullName || currentUser.username} for ${existing.userFullName || existing.userId}`,
    entityId: id,
    timestamp: now,
  });
  try {
    await createDoc("notifications", {
      userId: existing.userId,
      type: "timesheet",
      title: `Timesheet ${parsed.data.status.charAt(0).toUpperCase() + parsed.data.status.slice(1)}`,
      description: `Your timesheet (${existing.periodStart} - ${existing.periodEnd}) was ${parsed.data.status}.`,
      entityId: id,
      severity: parsed.data.status === "approved" ? "info" : "warning",
      link: "/hris",
      read: false,
      createdAt: now,
    });
  } catch (e) {
    logger.warn({ err: e }, "[timesheet] failed to notify user");
  }
  emitChange("timesheet", "updated", id);
  const updated = await getDoc<TimesheetDoc>("timesheets", id);
  res.json(mapTimesheet(updated!));
});

export default router;
