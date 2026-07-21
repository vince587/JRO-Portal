import { Router, type IRouter } from "express";
import { z } from "zod";
import { requirePermission, requireAnyPermission, hasRole } from "../middlewares/auth";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type LeadDoc,
} from "../lib/firebase-db";
import { emitChange } from "./sse";

const router: IRouter = Router();

router.get("/leads", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "manager");
  let rows = await getAll<LeadDoc>("leads", "createdAt", "desc");
  if (!isPrivileged) {
    const canJmcs = req.currentUser.canAccessJmcs;
    const canSis = req.currentUser.canAccessSis;
    rows = rows.filter(l => {
      if (l.type === "JMCS" && !canJmcs) return false;
      if (l.type === "SIS" && !canSis) return false;
      return true;
    });
    rows = rows.filter(l => l.createdById === req.currentUser!.id);
  }
  res.json(rows);
});

router.get("/leads/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const lead = await getDoc<LeadDoc>("leads", id);
  if (!lead) { res.status(404).json({ error: "Lead not found" }); return; }
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT", "manager")) {
    if (lead.type === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to view this lead" }); return;
    }
    if (lead.type === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to view this lead" }); return;
    }
    if (lead.createdById !== req.currentUser.id) {
      res.status(403).json({ error: "sorry you dont have permission to view this lead" }); return;
    }
  }
  res.json(lead);
});

router.post("/leads", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const { companyName, contactPerson, email, phone, serviceInterest, notes, type } = req.body;
  if (!companyName || !contactPerson) {
    res.status(400).json({ error: "companyName and contactPerson are required" }); return;
  }
  const leadType = type || (req.currentUser.canAccessJmcs ? "JMCS" : "SIS");
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "manager");
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
    email: email || null,
    phone: phone || null,
    serviceInterest: serviceInterest || null,
    status: "new",
    notes: notes || null,
    type: leadType,
    createdById: req.currentUser.id,
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
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT", "manager")) {
    if (existing.type === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to update this lead" }); return;
    }
    if (existing.type === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to update this lead" }); return;
    }
    if (existing.createdById !== req.currentUser.id) {
      res.status(403).json({ error: "sorry you dont have permission to update this lead" }); return;
    }
  }
  const { companyName, contactPerson, email, phone, serviceInterest, status, notes } = req.body;
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (companyName !== undefined) updateData.companyName = companyName;
  if (contactPerson !== undefined) updateData.contactPerson = contactPerson;
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
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT", "manager")) {
    if (existing.type === "JMCS" && !req.currentUser.canAccessJmcs) {
      res.status(403).json({ error: "sorry you dont have permission to delete this lead" }); return;
    }
    if (existing.type === "SIS" && !req.currentUser.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to delete this lead" }); return;
    }
    if (existing.createdById !== req.currentUser.id) {
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
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT", "manager");
  const errors: string[] = [];
  let deleted = 0;
  const now = new Date().toISOString();
  for (const id of parsed.data.ids) {
    const idStr = String(id);
    const existing = await getDoc<LeadDoc>("leads", idStr);
    if (!existing) { errors.push(`${idStr}: not found`); continue; }
    if (!isPrivileged) {
      if (existing.type === "JMCS" && !req.currentUser.canAccessJmcs) {
        errors.push(`${idStr}: sorry you dont have permission to delete this lead`);
        continue;
      }
      if (existing.type === "SIS" && !req.currentUser.canAccessSis) {
        errors.push(`${idStr}: sorry you dont have permission to delete this lead`);
        continue;
      }
      if (existing.createdById !== req.currentUser.id) {
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
