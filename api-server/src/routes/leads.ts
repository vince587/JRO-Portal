import { Router, type IRouter } from "express";
import { z } from "zod";
import { requireAnyPermission, hasRole } from "../middlewares/auth";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type LeadDoc,
} from "../lib/firebase-db";
import { emitChange } from "./sse";

const router: IRouter = Router();

router.get("/leads", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = req.currentUser.id;
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer");
  let rows = await getAll<LeadDoc>("leads", "createdAt", "desc");
  if (!isPrivileged) {
    const canJmcs = req.currentUser.canAccessJmcs;
    const canSis = req.currentUser.canAccessSis;
    rows = rows.filter(l => {
      if (l.createdById !== userId) return false;
      if (l.type === "JMCS" && !canJmcs) return false;
      if (l.type === "SIS" && !canSis) return false;
      return true;
    });
  }
  const creatorIds = Array.from(new Set(rows.map(r => r.createdById).filter((id): id is string => !!id)));
  const userById = new Map<string, { fullName?: string | null; username?: string; photoUrl?: string | null }>();
  await Promise.all(creatorIds.map(async (id) => {
    const u = await getDoc<{ fullName?: string | null; username?: string; photoUrl?: string | null }>("users", id);
    if (u) userById.set(id, u);
  }));
  const mapped = rows.map(l => ({
    ...l,
    createdByName: l.createdByName ?? userById.get(l.createdById)?.fullName ?? userById.get(l.createdById)?.username ?? null,
    createdByPhotoUrl: l.createdByPhotoUrl ?? userById.get(l.createdById)?.photoUrl ?? null,
  }));
  res.json(mapped);
});

router.get("/leads/summary", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = req.currentUser.id;
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer");
  let rows = await getAll<LeadDoc>("leads");
  if (!isPrivileged) {
    const canJmcs = req.currentUser.canAccessJmcs;
    const canSis = req.currentUser.canAccessSis;
    rows = rows.filter(l => {
      if (l.createdById !== userId) return false;
      if (l.type === "JMCS" && !canJmcs) return false;
      if (l.type === "SIS" && !canSis) return false;
      return true;
    });
  }
  const now = new Date();
  const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const statuses = ["new", "contacted", "qualified", "lost"];
  const types = ["JMCS", "SIS"];
  const byType: Record<string, number> = {};
  const byStatus: Record<string, number> = {};
  const byTypeAndStatus: Record<string, Record<string, number>> = {};
  const byTypeWithPhone: Record<string, number> = {};
  const byTypeWithEmail: Record<string, number> = {};
  for (const t of types) {
    byType[t] = 0;
    byTypeAndStatus[t] = Object.fromEntries(statuses.map(s => [s, 0]));
    byTypeWithPhone[t] = 0;
    byTypeWithEmail[t] = 0;
  }
  for (const s of statuses) byStatus[s] = 0;
  let total = 0;
  let thisMonth = 0;
  for (const l of rows) {
    const type = types.includes(l.type ?? "") ? l.type! : types[0];
    total++;
    byType[type] = (byType[type] ?? 0) + 1;
    byTypeAndStatus[type][l.status] = (byTypeAndStatus[type][l.status] ?? 0) + 1;
    byStatus[l.status] = (byStatus[l.status] ?? 0) + 1;
    if (l.phone) byTypeWithPhone[type] = (byTypeWithPhone[type] ?? 0) + 1;
    if (l.email) byTypeWithEmail[type] = (byTypeWithEmail[type] ?? 0) + 1;
    if ((l.createdAt ?? "").startsWith(thisMonthPrefix)) thisMonth++;
  }
  res.json({
    total,
    thisMonth,
    byType,
    byStatus,
    byTypeAndStatus,
    withPhone: Object.values(byTypeWithPhone).reduce((a, b) => a + b, 0),
    withEmail: Object.values(byTypeWithEmail).reduce((a, b) => a + b, 0),
    byTypeWithPhone,
    byTypeWithEmail,
  });
});

router.get("/leads/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const lead = await getDoc<LeadDoc>("leads", id);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer")) {
    if (lead.createdById !== req.currentUser.id) {
      res.status(403).json({ error: "sorry you dont have permission to view this lead" }); return;
    }
    if (lead.type === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to view this lead" }); return;
    }
    if (lead.type === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to view this lead" }); return;
    }
  }
  const u = await getDoc<{ fullName?: string | null; username?: string; photoUrl?: string | null }>("users", lead.createdById);
  const mapped = {
    ...lead,
    createdByName: lead.createdByName ?? u?.fullName ?? u?.username ?? null,
    createdByPhotoUrl: lead.createdByPhotoUrl ?? u?.photoUrl ?? null,
  };
  res.json(mapped);
});

router.post("/leads", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { companyName, contactPerson, position, email, phone, serviceInterest, notes, status, type } = req.body;
  if (!companyName || !contactPerson) {
    res.status(400).json({ error: "companyName and contactPerson are required" }); return;
  }
  const leadType = type || (req.currentUser.canAccessJmcs ? "JMCS" : "SIS");
  const leadStatus = ["new", "contacted", "qualified", "lost"].includes(status) ? status : "new";
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer");
  if (!isPrivileged) {
    if (leadType === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to create this lead" }); return;
    }
    if (leadType === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to create this lead" }); return;
    }
  }
  const now = new Date().toISOString();
  const lead = await createDoc("leads", {
    companyName,
    contactPerson,
    position: position || null,
    email: email || null,
    phone: phone || null,
    serviceInterest: serviceInterest || null,
    status: leadStatus,
    notes: notes || null,
    type: leadType,
    createdById: req.currentUser.id,
    createdByName: req.currentUser.fullName || req.currentUser.username,
    createdByPhotoUrl: req.currentUser.photoUrl ?? null,
    createdAt: now,
    updatedAt: now,
  });
  emitChange("lead", "created", lead.id);
  res.status(201).json(lead);
});

router.patch("/leads/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<LeadDoc>("leads", id);
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer")) {
    if (existing.createdById !== req.currentUser.id) {
      res.status(403).json({ error: "sorry you dont have permission to update this lead" }); return;
    }
    if (existing.type === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to update this lead" }); return;
    }
    if (existing.type === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to update this lead" }); return;
    }
  }
  const { companyName, contactPerson, position, email, phone, serviceInterest, status, notes } = req.body;
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (companyName !== undefined) updateData.companyName = companyName;
  if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
  if (position !== undefined) updateData.position = position || null;
  if (email !== undefined) updateData.email = email || null;
  if (phone !== undefined) updateData.phone = phone || null;
  if (serviceInterest !== undefined) updateData.serviceInterest = serviceInterest || null;
  if (status !== undefined) updateData.status = status;
  if (notes !== undefined) updateData.notes = notes || null;
  await updateDoc("leads", id, updateData);
  const updated = await getDoc<LeadDoc>("leads", id);
  emitChange("lead", "updated", id);
  res.json(updated);
});

router.delete("/leads/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<LeadDoc>("leads", id);
  if (!existing) { res.status(404).json({ error: "Lead not found" }); return; }
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer")) {
    if (existing.createdById !== req.currentUser.id) {
      res.status(403).json({ error: "sorry you dont have permission to delete this lead" }); return;
    }
    if (existing.type === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to delete this lead" }); return;
    }
    if (existing.type === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to delete this lead" }); return;
    }
  }
  await deleteDoc("leads", id);
  emitChange("lead", "deleted", id);
  res.sendStatus(204);
});

const BulkDeleteLeadsBody = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
});

router.post("/leads/bulk-delete", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const parsed = BulkDeleteLeadsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "officer");
  const errors: string[] = [];
  let deleted = 0;
  const now = new Date().toISOString();
  for (const id of parsed.data.ids) {
    const idStr = String(id);
    const existing = await getDoc<LeadDoc>("leads", idStr);
    if (!existing) { errors.push(`${idStr}: not found`); continue; }
    if (!isPrivileged) {
      if (existing.createdById !== req.currentUser.id) {
        errors.push(`${idStr}: sorry you dont have permission to delete this lead`);
        continue;
      }
      if (existing.type === "JMCS" && !req.currentUser.canAccessJmcs) {
        errors.push(`${idStr}: sorry you dont have permission to delete this lead`);
        continue;
      }
      if (existing.type === "SIS" && !req.currentUser.canAccessSis) {
        errors.push(`${idStr}: sorry you dont have permission to delete this lead`);
        continue;
      }
    }
    await deleteDoc("leads", idStr);
    emitChange("lead", "deleted", idStr);
    deleted++;
  }
  if (deleted > 0) {
    await createDoc("activity", {
      type: "lead",
      description: `Bulk deleted ${deleted} leads`,
      entityId: null,
      timestamp: now,
    });
  }
  res.json({ deleted, errors });
});

export default router;
