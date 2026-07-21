import { Router, type IRouter } from "express";
import { z } from "zod";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type CertificateDoc,
} from "../lib/firebase-db";
import {
  ListCertificatesQueryParams,
  CreateCertificateBody,
  UpdateCertificateBody,
} from "../../lib/api-zod/index.js";
import { requireAuth, requirePermission, hasRole } from "../middlewares/auth";
import { emitChange } from "./sse";

const router: IRouter = Router();

router.use(requireAuth);

function getCertStatus(expiryDate: string): "active" | "expiring_soon" | "expired" {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);
  if (expiry < now) return "expired";
  if (expiry <= thirtyDaysFromNow) return "expiring_soon";
  return "active";
}

function mapCert(c: CertificateDoc) {
  return {
    id: c.id,
    title: c.title,
    recipientName: c.recipientName,
    recipientEmail: c.recipientEmail,
    issuedBy: c.issuedBy,
    issueDate: c.issueDate,
    expiryDate: c.expiryDate,
    status: getCertStatus(c.expiryDate),
    certificateNumber: c.certificateNumber,
    trainingType: c.trainingType,
    category: c.category,
    standard: c.standard,
    fileUrl: c.fileUrl,
    qrCodeUrl: c.qrCodeUrl,
    notes: c.notes,
    result: (c.result as "passed" | "attended") || null,
    hours: c.hours,
    trainingDate: c.trainingDate,
    createdById: c.createdById,
    createdByName: c.createdByName,
    createdAt: c.createdAt,
  };
}

router.get("/certificates", async (req, res): Promise<void> => {
  const params = ListCertificatesQueryParams.safeParse(req.query);
  const rows = await getAll<CertificateDoc>("certificates", "createdAt", "desc");
  let mapped = rows.map(mapCert);
  if (params.success && params.data.status) {
    mapped = mapped.filter(c => c.status === params.data.status);
  }
  if (params.success && params.data.category) {
    // Treat legacy/uncategorized records as visible under any category filter
    // so restricted (single-department) accounts don't see an empty list just
    // because older certificates were stored without a `category` value.
    mapped = mapped.filter(c =>
      c.category === params.data.category ||
      !c.category
    );
  }
  res.json(mapped);
});

router.post("/certificates", async (req, res): Promise<void> => {
  const parsed = CreateCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date().toISOString();
  const creatorName = req.currentUser!.fullName || req.currentUser!.username;
  const cert = await createDoc<CertificateDoc>("certificates", {
    ...parsed.data,
    result: parsed.data.result ?? "attended",
    createdById: req.currentUser!.id,
    createdByName: creatorName,
    createdAt: now,
    updatedAt: now,
  } as CertificateDoc);
  await createDoc("activity", {
    type: "certificate",
    description: `Certificate "${cert.title}" was issued to ${cert.recipientName}`,
    entityId: cert.id!,
    timestamp: now,
  });
  emitChange("certificate", "created", cert.id);
  res.status(201).json(mapCert(cert));
});

router.get("/certificates/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const cert = await getDoc<CertificateDoc>("certificates", id);
  if (!cert) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }
  res.json(mapCert(cert));
});

router.patch("/certificates/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateCertificateBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await getDoc<CertificateDoc>("certificates", id);
  if (!existing) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }
  const isPrivileged = hasRole(req.currentUser!, "admin", "ADMIN", "IT", "manager");
  if (!isPrivileged && !req.currentUser!.canManageCertificates) {
    res.status(403).json({ error: "sorry you dont have permission to manage certificates" });
    return;
  }
  await updateDoc("certificates", id, {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  });
  const updated = await getDoc<CertificateDoc>("certificates", id);
  emitChange("certificate", "updated", id);
  res.json(mapCert(updated!));
});

router.delete("/certificates/:id", async (req, res): Promise<void> => {
  const isPrivileged = hasRole(req.currentUser!, "admin", "ADMIN", "IT", "manager");
  if (!isPrivileged && !req.currentUser!.canManageCertificates) {
    res.status(403).json({ error: "sorry you dont have permission to manage certificates" });
    return;
  }
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<CertificateDoc>("certificates", id);
  if (!existing) {
    res.status(404).json({ error: "Certificate not found" });
    return;
  }
  await deleteDoc("certificates", id);
  emitChange("certificate", "deleted", id);
  res.sendStatus(204);
});

const BulkDeleteCertificatesBody = z.object({
  ids: z.array(z.union([z.string(), z.number()])).min(1).max(500),
});

router.post("/certificates/bulk-delete", async (req, res): Promise<void> => {
  const isPrivileged = hasRole(req.currentUser!, "admin", "ADMIN", "IT", "manager");
  if (!isPrivileged && !req.currentUser!.canManageCertificates) {
    res.status(403).json({ error: "sorry you dont have permission to manage certificates" });
    return;
  }
  const parsed = BulkDeleteCertificatesBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const errors: string[] = [];
  let deleted = 0;
  const now = new Date().toISOString();
  for (const id of parsed.data.ids) {
    const idStr = String(id);
    const existing = await getDoc<CertificateDoc>("certificates", idStr);
    if (!existing) { errors.push(`${idStr}: not found`); continue; }
    await deleteDoc("certificates", idStr);
    emitChange("certificate", "deleted", idStr);
    deleted++;
  }
  if (deleted > 0) {
    await createDoc("activity", {
      type: "certificate",
      description: `Bulk deleted ${deleted} certificates`,
      entityId: null,
      timestamp: now,
    });
  }
  res.json({ deleted, errors });
});

export default router;
