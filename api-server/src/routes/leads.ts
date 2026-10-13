import { Router, type IRouter, type Request } from "express";
import { z } from "zod";
import { requireAnyPermission, hasRole } from "../middlewares/auth";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type LeadDoc,
} from "../lib/firebase-db";
import { emitChange } from "./sse";
import {
  cleanText,
  coerceContractType as coerceType,
  coerceEnum,
  coerceDate,
} from "../lib/coerce";

const router: IRouter = Router();

/** Lead status is a closed set; unknown labels fall back to "new". */
function coerceStatus(v: unknown): string | null {
  return coerceEnum(v, LEAD_STATUSES);
}

router.get("/leads", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const userId = req.currentUser.id;
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT") || !!req.currentUser.canAccessAdmin;
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
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT") || !!req.currentUser.canAccessAdmin;
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
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT") && !req.currentUser.canAccessAdmin) {
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
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT") || !!req.currentUser.canAccessAdmin;
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
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT") && !req.currentUser.canAccessAdmin) {
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
  if (!hasRole(req.currentUser, "admin", "ADMIN", "IT") && !req.currentUser.canAccessAdmin) {
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

const LEAD_STATUSES = ["new", "contacted", "qualified", "lost"];
const MAX_IMPORT_ROWS = 2000;

interface RawLeadRow {
  companyName?: unknown;
  contactPerson?: unknown;
  position?: unknown;
  email?: unknown;
  phone?: unknown;
  serviceInterest?: unknown;
  type?: unknown;
  status?: unknown;
  notes?: unknown;
  date?: unknown;
  createdAt?: unknown;
}

interface NormalizedLead {
  companyName: string;
  contactPerson: string;
  position: string | null;
  email: string | null;
  phone: string | null;
  serviceInterest: string | null;
  status: string;
  notes: string | null;
  type: "JMCS" | "SIS";
  /** Calendar day from the sheet, or null to fall back to the import date. */
  leadDate: string | null;
}

/**
 * The Type and Status columns are frequently swapped or mislabelled in exported
 * sheets (a column headed "Status" holding "JMCS/SIS" is common), so both fields
 * are sniffed by value rather than trusted by header name.
 */
function normalizeLeadRow(raw: RawLeadRow, defaultType: "JMCS" | "SIS"): NormalizedLead {
  const type = coerceType(raw.type) ?? coerceType(raw.status) ?? defaultType;
  const status = coerceStatus(raw.status) ?? coerceStatus(raw.type) ?? "new";
  return {
    companyName: cleanText(raw.companyName),
    contactPerson: cleanText(raw.contactPerson),
    position: cleanText(raw.position) || null,
    email: cleanText(raw.email) || null,
    phone: cleanText(raw.phone) || null,
    serviceInterest: cleanText(raw.serviceInterest) || null,
    status,
    notes: cleanText(raw.notes) || null,
    type,
    leadDate: coerceDate(raw.date) ?? coerceDate(raw.createdAt),
  };
}

/** Stable identity for duplicate detection: email wins, else company + contact. */
function dedupeKey(l: Pick<NormalizedLead, "email" | "companyName" | "contactPerson">): string | null {
  if (l.email && l.email.includes("@")) return `email:${l.email.toLowerCase()}`;
  const company = l.companyName.toLowerCase().replace(/\s+/g, " ").trim();
  const contact = l.contactPerson.toLowerCase().replace(/\s+/g, " ").trim();
  if (!company && !contact) return null;
  return `cc:${company}|${contact}`;
}

const ImportBody = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS),
  defaultType: z.enum(["JMCS", "SIS"]).optional(),
  /**
   * When false, any date on a row is ignored and every lead is stamped with the
   * import time. Lets the UI offer "keep import date" without a second endpoint.
   */
  honorDates: z.boolean().optional(),
});

function canImportType(user: NonNullable<Request["currentUser"]>, type: string): boolean {
  if (hasRole(user, "admin", "ADMIN", "IT") || !!user.canAccessAdmin) return true;
  if (type === "JMCS") return !!user.canAccessJmcs;
  if (type === "SIS") return !!user.canAccessSis;
  return false;
}

/** Shared validation so preview and commit never disagree. */
function validateRows(
  rows: RawLeadRow[],
  user: NonNullable<Request["currentUser"]>,
  defaultType: "JMCS" | "SIS",
  honorDates = true,
) {
  return rows.map((raw, index) => {
    const lead = normalizeLeadRow(raw, defaultType);
    const errors: string[] = [];
    if (!lead.companyName) errors.push("Company Name is required");
    if (!lead.contactPerson) errors.push("Full Name is required");
    if (!canImportType(user, lead.type)) errors.push(`no permission to create ${lead.type} leads`);
    return {
      index,
      lead: honorDates ? lead : { ...lead, leadDate: null },
      errors,
      duplicateKey: dedupeKey(lead),
    };
  });
}

router.post("/leads/import/preview", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const parsed = ImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" });
    return;
  }
  const user = req.currentUser;
  const fallback: "JMCS" | "SIS" = user.canAccessJmcs ? "JMCS" : "SIS";
  const defaultType = parsed.data.defaultType ?? fallback;
  if (!canImportType(user, defaultType)) {
    res.status(403).json({ error: `sorry you dont have permission to create ${defaultType} leads` });
    return;
  }

  const evaluated = validateRows(parsed.data.rows, user, defaultType, parsed.data.honorDates !== false);
  const existing = await getAll<LeadDoc>("leads");
  const existingKeys = new Map<string, string>();
  for (const l of existing) {
    const key = dedupeKey(l as unknown as NormalizedLead);
    if (key && !existingKeys.has(key)) existingKeys.set(key, l.id ?? "");
  }

  const seenInFile = new Map<string, number>();
  const out = evaluated.map((row, i) => {
    let duplicateOfExistingId: string | null = null;
    let duplicateOfRowIndex: number | null = null;
    if (row.duplicateKey) {
      if (existingKeys.has(row.duplicateKey)) duplicateOfExistingId = existingKeys.get(row.duplicateKey)!;
      else if (seenInFile.has(row.duplicateKey)) duplicateOfRowIndex = seenInFile.get(row.duplicateKey)!;
      else seenInFile.set(row.duplicateKey, i);
    }
    return {
      index: row.index,
      rowNumber: i + 2, // +1 header, +1 for 1-based display
      lead: row.lead,
      errors: row.errors,
      duplicateOfExistingId,
      duplicateOfRowIndex,
      duplicate: !!(duplicateOfExistingId || duplicateOfRowIndex !== null),
    };
  });

  res.json({
    rows: out,
    summary: {
      total: out.length,
      valid: out.filter(r => r.errors.length === 0 && !r.duplicate).length,
      invalid: out.filter(r => r.errors.length > 0).length,
      duplicates: out.filter(r => r.duplicate && r.errors.length === 0).length,
    },
  });
});

router.post("/leads/import", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  if (!req.currentUser) { res.status(401).json({ error: "Not authenticated" }); return; }
  const parsed = ImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" });
    return;
  }
  const user = req.currentUser;
  const fallback: "JMCS" | "SIS" = user.canAccessJmcs ? "JMCS" : "SIS";
  const defaultType = parsed.data.defaultType ?? fallback;
  if (!canImportType(user, defaultType)) {
    res.status(403).json({ error: `sorry you dont have permission to create ${defaultType} leads` });
    return;
  }

  const evaluated = validateRows(parsed.data.rows, user, defaultType, parsed.data.honorDates !== false);
  const existing = await getAll<LeadDoc>("leads");
  const existingKeys = new Set<string>();
  for (const l of existing) {
    const key = dedupeKey(l as unknown as NormalizedLead);
    if (key) existingKeys.add(key);
  }

  const now = new Date().toISOString();
  const createdByName = user.fullName || user.username;
  let imported = 0;
  const errors: { row: number; message: string }[] = [];
  const seenInFile = new Set<string>();

  for (const row of evaluated) {
    if (row.errors.length > 0) {
      errors.push({ row: row.index + 2, message: row.errors.join("; ") });
      continue;
    }
    // Skip rows that already exist in Firestore or repeat within the same file.
    if (row.duplicateKey && (existingKeys.has(row.duplicateKey) || seenInFile.has(row.duplicateKey))) {
      continue;
    }
    if (row.duplicateKey) seenInFile.add(row.duplicateKey);
    const lead = row.lead;
    await createDoc("leads", {
      companyName: lead.companyName,
      contactPerson: lead.contactPerson,
      position: lead.position,
      email: lead.email,
      phone: lead.phone,
      serviceInterest: lead.serviceInterest,
      status: lead.status,
      notes: lead.notes,
      type: lead.type,
      createdById: user.id,
      createdByName,
      createdByPhotoUrl: user.photoUrl ?? null,
      // Honour a date from the sheet so leads can be backdated; blank cells
      // fall back to the moment of import.
      createdAt: lead.leadDate ? `${lead.leadDate}T${now.slice(11)}` : now,
      updatedAt: now,
    });
    emitChange("lead", "created", user.id);
    imported++;
  }

  if (imported > 0) {
    await createDoc("activity", {
      type: "lead",
      description: `Imported ${imported} lead${imported === 1 ? "" : "s"} from Excel`,
      entityId: null,
      timestamp: now,
    });
  }

  res.json({ imported, skipped: parsed.data.rows.length - imported - errors.length, errors });
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
  const isPrivileged = hasRole(req.currentUser, "admin", "ADMIN", "IT") || !!req.currentUser.canAccessAdmin;
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
