import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc, queryWhere,
  type ContractDoc,
} from "../lib/firebase-db";
import {
  ListContractsQueryParams,
  CreateContractBody,
  UpdateContractBody,
} from "../../lib/api-zod/index.js";
import { requireAuth, requireRole, requireAnyPermission, hasRole } from "../middlewares/auth";
import { emitChange } from "./sse";

const router: IRouter = Router();

type CurrentUser = {
  id: string;
  username: string;
  email: string;
  role: string;
  roles?: string[];
  fullName: string | null;
  department: string | null;
  photoUrl?: string | null;
  canAccessSis?: boolean;
  canAccessJmcs?: boolean;
  canEditCalendar?: boolean;
  canEditTrainingProposal?: boolean;
  canManageContracts?: boolean;
  canManageCertificates?: boolean;
};

function canViewContractType(user: CurrentUser, type: string): boolean {
  if (hasRole(user, "admin", "ADMIN", "IT")) return true;
  if (type === "SIS" && user.canAccessSis) return true;
  if (type === "JMCS" && user.canAccessJmcs) return true;
  return false;
}

function filterContractsByAccess(user: CurrentUser, contracts: ContractDoc[]): ContractDoc[] {
  if (hasRole(user, "admin", "ADMIN", "IT")) return contracts;
  return contracts.filter(c => canViewContractType(user, c.type));
}

function mapContract(c: ContractDoc) {
  return {
    id: c.id,
    title: c.title,
    type: c.type,
    serviceType: c.serviceType,
    status: c.status,
    contractNumber: c.contractNumber,
    clientName: c.clientName,
    startDate: c.startDate,
    endDate: c.endDate,
    value: Number(c.value),
    description: c.description,
    assignedTo: c.assignedTo,
    createdById: c.createdById,
    createdByName: c.createdByName,
    createdByPhotoUrl: c.createdByPhotoUrl ?? null,
    createdAt: c.createdAt,
  };
}

router.get("/contracts/summary", requireAuth, async (req, res): Promise<void> => {
  const all = filterContractsByAccess(req.currentUser!, await getAll<ContractDoc>("contracts", "createdAt", "desc"));
  const bySis = all.filter(c => c.type === "SIS").length;
  const byJmcs = all.filter(c => c.type === "JMCS").length;
  res.json({
    total: all.length,
    bySis,
    byJmcs,
    byStatus: {
      active: all.filter(c => c.status === "active").length,
      pending: all.filter(c => c.status === "pending").length,
      completed: all.filter(c => c.status === "completed").length,
      expired: all.filter(c => c.status === "expired").length,
    },
  });
});

router.get("/contracts", requireAuth, async (req, res): Promise<void> => {
  const params = ListContractsQueryParams.safeParse(req.query);
  let rows = filterContractsByAccess(req.currentUser!, await getAll<ContractDoc>("contracts", "createdAt", "desc"));
  if (params.success) {
    if (params.data.type) rows = rows.filter(c => c.type === params.data.type);
    if (params.data.status) rows = rows.filter(c => c.status === params.data.status);
  }
  // Resolve each creator's current photo (and name fallback) so the listing
  // can show the real profile picture instead of initials.
  const creatorIds = Array.from(new Set(rows.map(r => r.createdById).filter((id): id is string => !!id)));
  const photoById = new Map<string, string | null>();
  await Promise.all(creatorIds.map(async (id) => {
    const u = await getDoc<{ photoUrl?: string | null; fullName?: string | null; username?: string }>("users", id);
    photoById.set(id, u?.photoUrl ?? null);
  }));
  res.json(rows.map(c => {
    const mapped = mapContract(c);
    if (c.createdById && photoById.has(c.createdById)) {
      mapped.createdByPhotoUrl = photoById.get(c.createdById) ?? mapped.createdByPhotoUrl ?? null;
    }
    return mapped;
  }));
});

router.post("/contracts", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const parsed = CreateContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!canViewContractType(req.currentUser!, parsed.data.type)) {
    res.status(403).json({ error: "sorry you dont have permission to create this contract" });
      return;
    }
    if (!hasRole(req.currentUser!, "admin", "ADMIN", "IT", "manager")) {
      if (parsed.data.type === "JMCS" && !req.currentUser!.canAccessJmcs) {
        res.status(403).json({ error: "sorry you dont have permission to access JMCS contracts" });
      return;
    }
    if (parsed.data.type === "SIS" && !req.currentUser!.canAccessSis) {
      res.status(403).json({ error: "sorry you dont have permission to access SIS contracts" });
      return;
    }
  }
  const now = new Date().toISOString();
  const creatorName = req.currentUser!.fullName || req.currentUser!.username;
  const contract = await createDoc<ContractDoc>("contracts", {
    ...parsed.data,
    value: Number(parsed.data.value),
    createdById: req.currentUser!.id,
    createdByName: creatorName,
    createdByPhotoUrl: req.currentUser!.photoUrl ?? null,
    createdAt: now,
    updatedAt: now,
  } as ContractDoc);
  await createDoc("activity", {
    type: "contract",
    description: `Contract "${contract.title}" was created`,
    entityId: contract.id!,
    timestamp: now,
  });
  emitChange("contract", "created", contract.id);
  res.status(201).json(mapContract(contract));
});

router.get("/contracts/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const contract = await getDoc<ContractDoc>("contracts", id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (!canViewContractType(req.currentUser!, contract.type)) {
    res.status(403).json({ error: "sorry you dont have permission to view this contract" });
    return;
  }
  const mapped = mapContract(contract);
  if (contract.createdById) {
    const u = await getDoc<{ photoUrl?: string | null }>("users", contract.createdById);
    if (u) mapped.createdByPhotoUrl = u.photoUrl ?? mapped.createdByPhotoUrl ?? null;
  }
  res.json(mapped);
});

router.patch("/contracts/:id", requireRole("admin", "ADMIN", "IT", "manager"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await getDoc<ContractDoc>("contracts", id);
  if (!existing) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  const updateData: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.value !== undefined) updateData.value = Number(parsed.data.value);
  await updateDoc("contracts", id, updateData);
  const updated = await getDoc<ContractDoc>("contracts", id);
  await createDoc("activity", {
    type: "contract",
    description: `Contract "${updated!.title}" was updated`,
    entityId: id,
    timestamp: new Date().toISOString(),
  });
  emitChange("contract", "updated", id);
  res.json(mapContract(updated!));
});

router.post("/contracts/:id/renew", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const original = await getDoc<ContractDoc>("contracts", id);
  if (!original) { res.status(404).json({ error: "Contract not found" }); return; }
  if (!canViewContractType(req.currentUser!, original.type)) {
    res.status(403).json({ error: "sorry you dont have permission to renew this contract" });
    return;
  }
  const oldEnd = new Date(original.endDate);
  const newStart = new Date(oldEnd.getTime() + 24 * 60 * 60 * 1000);
  const duration = oldEnd.getTime() - new Date(original.startDate).getTime();
  const newEnd = new Date(newStart.getTime() + duration);
  const now = new Date().toISOString();
  const renewed = await createDoc<ContractDoc>("contracts", {
    ...original,
    id: undefined,
    title: original.title,
    type: original.type,
    status: "active",
    serviceType: original.serviceType,
    contractNumber: `${original.contractNumber}-R${Math.floor((Date.now() - new Date(original.createdAt).getTime()) / (365 * 24 * 60 * 60 * 1000)) + 1}`,
    clientName: original.clientName,
    startDate: newStart.toISOString().split("T")[0],
    endDate: newEnd.toISOString().split("T")[0],
    value: original.value,
    description: original.description,
    assignedTo: original.assignedTo,
    createdById: req.currentUser!.id,
    createdByName: req.currentUser!.fullName || req.currentUser!.username,
    createdByPhotoUrl: req.currentUser!.photoUrl ?? null,
    createdAt: now,
    updatedAt: now,
  } as ContractDoc);
  await createDoc("activity", {
    type: "contract",
    description: `Contract "${renewed.title}" was renewed`,
    entityId: renewed.id!,
    timestamp: now,
  });
  emitChange("contract", "created", renewed.id);
  res.status(201).json(mapContract(renewed));
});

router.get("/contracts/:id/timeline", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const contract = await getDoc<ContractDoc>("contracts", id);
  if (!contract) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  if (!canViewContractType(req.currentUser!, contract.type)) {
    res.status(403).json({ error: "sorry you dont have permission to view this contract timeline" });
    return;
  }
  const rows = await queryWhere<{ id?: string; type: string; description: string; timestamp: string }>(
    "activity", "entityId", "==", id,
  );
  const filtered = rows.filter(a => a.type === "contract");
  filtered.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());
  res.json(filtered.map(a => ({
    id: a.id,
    description: a.description,
    timestamp: a.timestamp,
  })));
});

router.delete("/contracts/:id", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<ContractDoc>("contracts", id);
  if (!existing) {
    res.status(404).json({ error: "Contract not found" });
    return;
  }
  await deleteDoc("contracts", id);
  emitChange("contract", "deleted", id);
  res.sendStatus(204);
});

const BulkDeleteContractsBody = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
});

router.post("/contracts/bulk-delete", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const parsed = BulkDeleteContractsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errors: string[] = [];
  let deleted = 0;
  const now = new Date().toISOString();
  for (const id of parsed.data.ids) {
    const idStr = String(id);
    const existing = await getDoc<ContractDoc>("contracts", idStr);
    if (!existing) { errors.push(`${idStr}: not found`); continue; }
    await deleteDoc("contracts", idStr);
    emitChange("contract", "deleted", idStr);
    deleted++;
  }
  if (deleted > 0) {
    await createDoc("activity", {
      type: "contract",
      description: `Bulk deleted ${deleted} contracts`,
      entityId: null,
      timestamp: now,
    });
  }
  res.json({ deleted, errors });
});

export default router;