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
import { requireAuth, requirePermission, requireRoleOrPermission } from "../middlewares/auth";
import { getStorageBucket } from "../lib/firebase-db";
import {
  cleanText,
  coerceContractType,
  coerceEnum,
  coerceDate,
  coerceMoney,
} from "../lib/coerce";
import { emitChange } from "./sse";

const router: IRouter = Router();

const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

async function resolveDocumentUrl(storedAs: string | null): Promise<string | null> {
  if (!storedAs) return null;
  try {
    const [url] = await getStorageBucket().file(storedAs).getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
    return url;
  } catch {
    return null;
  }
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
    assignedTo: c.assignedTo ?? c.salesInCharge ?? null,
    salesInCharge: c.salesInCharge ?? c.assignedTo ?? null,
    contactPerson: c.contactPerson ?? null,
    designation: c.designation ?? null,
    contactNumber: c.contactNumber ?? null,
    contactEmail: c.contactEmail ?? null,
    createdById: c.createdById,
    createdByName: c.createdByName,
    createdByPhotoUrl: c.createdByPhotoUrl ?? null,
    documentName: c.documentName ?? null,
    documentUrl: null as string | null,
    createdAt: c.createdAt,
  };
}

router.get("/contracts/summary", requireAuth, async (req, res): Promise<void> => {
  const all = await getAll<ContractDoc>("contracts", "createdAt", "desc");
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
  let rows = await getAll<ContractDoc>("contracts", "createdAt", "desc");
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
  const mapped = rows.map(c => {
    const m = mapContract(c);
    if (c.createdById && photoById.has(c.createdById)) {
      m.createdByPhotoUrl = photoById.get(c.createdById) ?? m.createdByPhotoUrl ?? null;
    }
    return m;
  });
  await Promise.all(mapped.map(async (m) => {
    m.documentUrl = await resolveDocumentUrl(m.documentName ? rows.find(r => r.id === m.id)?.documentStoredAs ?? null : null);
  }));
  res.json(mapped);
});

router.post("/contracts", requirePermission("canManageContracts"), async (req, res): Promise<void> => {
  const parsed = CreateContractBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date().toISOString();
  const creatorName = req.currentUser!.fullName || req.currentUser!.username;
  const contract = await createDoc<ContractDoc>("contracts", {
    ...parsed.data,
    value: Number(parsed.data.value),
    createdById: req.currentUser!.id,
    createdByName: creatorName,
    createdByPhotoUrl: req.currentUser!.photoUrl ?? null,
    contactPerson: (req.body as any).contactPerson ? cleanText((req.body as any).contactPerson) : null,
    designation: (req.body as any).designation ? cleanText((req.body as any).designation) : null,
    contactNumber: (req.body as any).contactNumber ? cleanText((req.body as any).contactNumber) : null,
    contactEmail: (req.body as any).contactEmail ? cleanText((req.body as any).contactEmail) : null,
    salesInCharge: (req.body as any).salesInCharge ? cleanText((req.body as any).salesInCharge) : ((req.body as any).assignedTo ? cleanText((req.body as any).assignedTo) : null),
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
  const mapped = mapContract(contract);
  if (contract.createdById) {
    const u = await getDoc<{ photoUrl?: string | null }>("users", contract.createdById);
    if (u) mapped.createdByPhotoUrl = u.photoUrl ?? mapped.createdByPhotoUrl ?? null;
  }
  mapped.documentUrl = await resolveDocumentUrl(contract.documentStoredAs ?? null);
  res.json(mapped);
});

router.patch("/contracts/:id", requirePermission("canManageContracts"), async (req, res): Promise<void> => {
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
  if ((req.body as any).contactPerson !== undefined) updateData.contactPerson = (req.body as any).contactPerson ? cleanText((req.body as any).contactPerson) : null;
  if ((req.body as any).designation !== undefined) updateData.designation = (req.body as any).designation ? cleanText((req.body as any).designation) : null;
  if ((req.body as any).contactNumber !== undefined) updateData.contactNumber = (req.body as any).contactNumber ? cleanText((req.body as any).contactNumber) : null;
  if ((req.body as any).contactEmail !== undefined) updateData.contactEmail = (req.body as any).contactEmail ? cleanText((req.body as any).contactEmail) : null;
  if ((req.body as any).salesInCharge !== undefined) updateData.salesInCharge = (req.body as any).salesInCharge ? cleanText((req.body as any).salesInCharge) : null;
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

router.post("/contracts/:id/renew", requirePermission("canManageContracts"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const original = await getDoc<ContractDoc>("contracts", id);
  if (!original) { res.status(404).json({ error: "Contract not found" }); return; }
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

router.delete("/contracts/:id", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canManageContracts"), async (req, res): Promise<void> => {
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

const CONTRACT_STATUSES = ["active", "pending", "completed", "expired"];
const MAX_IMPORT_ROWS = 2000;

interface RawContractRow {
  title?: unknown;
  services?: unknown;
  contractNumber?: unknown;
  clientName?: unknown;
  type?: unknown;
  status?: unknown;
  startDate?: unknown;
  endDate?: unknown;
  value?: unknown;
  description?: unknown;
  assignedTo?: unknown;
  date?: unknown;
  contactPerson?: unknown;
  designation?: unknown;
  contactNumber?: unknown;
  contactEmail?: unknown;
  salesInCharge?: unknown;
}

interface NormalizedContract {
  title: string;
  contractNumber: string;
  clientName: string;
  type: "JMCS" | "SIS";
  status: string;
  startDate: string;
  endDate: string;
  value: number | null;
  description: string | null;
  contactPerson: string | null;
  designation: string | null;
  contactNumber: string | null;
  contactEmail: string | null;
  salesInCharge: string | null;
}

function coerceContractStatus(v: unknown): string | null {
  return coerceEnum(v, CONTRACT_STATUSES);
}

function extractDateFromRef(ref: string): string | null {
  const m = String(ref).match(/(\d{4})\s*-*\s*(\d{2})(\d{2})/);
  if (m) {
    const yyyy = m[1];
    const mm = m[2];
    const dd = m[3];
    return `${yyyy}-${mm}-${dd}`;
  }
  return null;
}

/** End dates default by business unit: SIS certification runs 3 years, JMCS 1. */
function addYears(ymd: string, years: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return ymd;
  d.setUTCFullYear(d.getUTCFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function normalizeContractRow(raw: RawContractRow, defaultType: "JMCS" | "SIS"): NormalizedContract {
  // Type and Status are frequently swapped or mislabelled in exported sheets,
  // so both are sniffed by value rather than trusted by header name.
  const type = coerceContractType(raw.type) ?? coerceContractType(raw.status) ?? defaultType;
  const status = coerceContractStatus(raw.status) ?? coerceContractStatus(raw.type) ?? "active";
  const contractNumber = cleanText(raw.contractNumber);
  const clientName = cleanText(raw.clientName);
  const title = cleanText(raw.title) || cleanText(raw.services) || (clientName ? `${clientName} Services` : "General Services");
  const extractedDate = extractDateFromRef(contractNumber);
  const startDate = coerceDate(raw.startDate) ?? coerceDate(raw.date) ?? extractedDate ?? new Date().toISOString().slice(0, 10);
  return {
    title,
    contractNumber,
    clientName,
    type,
    status,
    startDate,
    endDate: coerceDate(raw.endDate) ?? addYears(startDate, type === "SIS" ? 3 : 1),
    value: coerceMoney(raw.value) ?? 0,
    description: cleanText(raw.description) || null,
    contactPerson: cleanText(raw.contactPerson) || null,
    designation: cleanText(raw.designation) || null,
    contactNumber: cleanText(raw.contactNumber) || null,
    contactEmail: cleanText(raw.contactEmail) || null,
    salesInCharge: cleanText(raw.salesInCharge) || cleanText(raw.assignedTo) || null,
  };
}

/** Stable identity for duplicate detection: contract number, else title+client. */
function contractDedupeKey(c: Pick<NormalizedContract, "contractNumber" | "title" | "clientName">): string | null {
  const number = c.contractNumber.toLowerCase().replace(/\s+/g, "");
  if (number) return `no:${number}`;
  const title = c.title.toLowerCase().replace(/\s+/g, " ").trim();
  const client = c.clientName.toLowerCase().replace(/\s+/g, " ").trim();
  if (!title && !client) return null;
  return `tc:${title}|${client}`;
}

const ContractImportBody = z.object({
  rows: z.array(z.record(z.string(), z.unknown())).min(1).max(MAX_IMPORT_ROWS),
  defaultType: z.enum(["SIS", "JMCS"]).optional(),
});

/** Shared validation so preview and commit never disagree. */
function validateContractRows(
  rows: RawContractRow[],
  defaultType: "JMCS" | "SIS",
): { index: number; contract: NormalizedContract; errors: string[]; duplicateKey: string | null }[] {
  return rows.map((raw, index) => {
    const contract = normalizeContractRow(raw, defaultType);
    const errors: string[] = [];
    if (!contract.contractNumber) errors.push("Reference Number is required");
    if (!contract.clientName) errors.push("Company Name is required");
    if (contract.value !== null && contract.value < 0) errors.push("Price cannot be negative");
    if (contract.endDate < contract.startDate) errors.push("End Date is before Start Date");
    return { index, contract, errors, duplicateKey: contractDedupeKey(contract) };
  });
}

router.post("/contracts/import/preview", requirePermission("canManageContracts"), async (req, res): Promise<void> => {
  const parsed = ContractImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" });
    return;
  }
  const defaultType = parsed.data.defaultType ?? "JMCS";
  const evaluated = validateContractRows(parsed.data.rows, defaultType);

  const existing = await getAll<ContractDoc>("contracts");
  const existingKeys = new Set<string>();
  for (const c of existing) {
    const key = contractDedupeKey(c as unknown as NormalizedContract);
    if (key) existingKeys.add(key);
  }

  const seenInFile = new Map<string, number>();
  const out = evaluated.map((row, i) => {
    let duplicateOfExisting = false;
    let duplicateOfRowIndex: number | null = null;
    if (row.duplicateKey) {
      if (existingKeys.has(row.duplicateKey)) duplicateOfExisting = true;
      else if (seenInFile.has(row.duplicateKey)) duplicateOfRowIndex = seenInFile.get(row.duplicateKey)!;
      else seenInFile.set(row.duplicateKey, i);
    }
    return {
      index: row.index,
      rowNumber: i + 2, // +1 header, +1 for 1-based display
      contract: row.contract,
      errors: row.errors,
      duplicateOfExisting,
      duplicateOfRowIndex,
      duplicate: duplicateOfExisting || duplicateOfRowIndex !== null,
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

router.post("/contracts/import", requirePermission("canManageContracts"), async (req, res): Promise<void> => {
  const parsed = ContractImportBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.issues[0]?.message ?? "Invalid import payload" });
    return;
  }
  const user = req.currentUser!;
  const defaultType = parsed.data.defaultType ?? "JMCS";
  const evaluated = validateContractRows(parsed.data.rows, defaultType);

  const existing = await getAll<ContractDoc>("contracts");
  const existingKeys = new Set<string>();
  for (const c of existing) {
    const key = contractDedupeKey(c as unknown as NormalizedContract);
    if (key) existingKeys.add(key);
  }

  const now = new Date().toISOString();
  const creatorName = user.fullName || user.username;
  let imported = 0;
  const errors: { row: number; message: string }[] = [];
  const seenInFile = new Set<string>();

  for (const row of evaluated) {
    if (row.errors.length > 0) {
      errors.push({ row: row.index + 2, message: row.errors.join("; ") });
      continue;
    }
    // Skip contracts that already exist in Firestore or repeat within the file.
    if (row.duplicateKey && (existingKeys.has(row.duplicateKey) || seenInFile.has(row.duplicateKey))) continue;
    if (row.duplicateKey) seenInFile.add(row.duplicateKey);
    const c = row.contract;
    const created = await createDoc<ContractDoc>("contracts", {
      title: c.title,
      type: c.type,
      serviceType: null,
      status: c.status,
      contractNumber: c.contractNumber,
      clientName: c.clientName,
      startDate: c.startDate,
      endDate: c.endDate,
      value: c.value ?? 0,
      description: c.description,
      contactPerson: c.contactPerson,
      designation: c.designation,
      contactNumber: c.contactNumber,
      contactEmail: c.contactEmail,
      salesInCharge: c.salesInCharge,
      assignedTo: c.salesInCharge || null,
      createdById: user.id,
      createdByName: creatorName,
      createdByPhotoUrl: user.photoUrl ?? null,
      documentName: null,
      documentStoredAs: null,
      createdAt: now,
      updatedAt: now,
    });
    await createDoc("activity", {
      type: "contract",
      description: `Contract "${c.title}" was created`,
      entityId: created.id!,
      timestamp: now,
    });
    emitChange("contract", "created", created.id);
    imported++;
  }

  if (imported > 0) {
    await createDoc("activity", {
      type: "contract",
      description: `Imported ${imported} contract${imported === 1 ? "" : "s"} from Excel`,
      entityId: null,
      timestamp: now,
    });
  }

  res.json({ imported, skipped: parsed.data.rows.length - imported - errors.length, errors });
});

const BulkDeleteContractsBody = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
});

router.post("/contracts/bulk-delete", requireRoleOrPermission(["admin", "ADMIN", "IT"], "canManageContracts"), async (req, res): Promise<void> => {
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