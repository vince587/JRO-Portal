import { Router, type IRouter } from "express";
import multer from "multer";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { getAll, getDoc, getDocByField, createDoc, updateDoc, deleteDoc, queryWhere, getStorageBucket, type LibraryDoc, type LibraryFolderDoc, type LibraryAttachment } from "../lib/firebase-db";
import { requireAuth, requireRole, requireAnyPermission } from "../middlewares/auth";
import { sendAccessEmail, sendAccessRevokedEmail, sendFolderAccessEmail, sendAccessExpiredEmail, publicViewerUrl } from "../lib/mailer";
import { logger } from "../lib/logger";
import { emitChange } from "./sse";
import * as zod from "zod";

function genShareId() {
  return crypto.randomBytes(9).toString("base64url");
}

// Short, human-friendly access code (e.g. "K7Q2P9") included in the share email
// so participants must enter it before the material/folder is revealed. Stored
// on the doc/folder and validated server-side on every public request.
function genAccessCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no ambiguous 0/O/1/I
  let out = "";
  const bytes = crypto.randomBytes(6);
  for (let i = 0; i < 6; i++) out += alphabet[bytes[i] % alphabet.length];
  return out;
}

// A share (material or folder) is considered expired once the current time
// passes its `expiresAt` timestamp. Expired shares automatically lose public
// access without any manual action.
function isExpired(expiresAt?: string | null): boolean {
  if (!expiresAt) return false;
  const t = Date.parse(expiresAt);
  if (Number.isNaN(t)) return false;
  return Date.now() > t;
}

const SECTION = zod.enum(["internal", "external"]);
const ACCESS = zod.enum(["open", "restricted", "disabled"]);
const DEPARTMENT = zod.enum(["JMCS", "SIS", "Both"]);

const bodySchema = zod.object({
  title: zod.string().min(1, "Title is required"),
  description: zod.string().optional().nullable(),
  section: SECTION,
  department: DEPARTMENT.optional().nullable(),
  category: zod.string().optional().nullable(),
  url: zod.string().optional().nullable(),
  access: ACCESS.optional().nullable(),
  email: zod.string().optional().nullable(),
  accessEmails: zod.array(zod.string()).optional(),
  sendEmail: zod.boolean().optional(),
  folderId: zod.string().optional().nullable(),
  expiresAt: zod.string().optional().nullable(),
});

const updateSchema = bodySchema.partial();

const folderSchema = zod.object({
  name: zod.string().min(1, "Folder name is required"),
  section: SECTION,
  parentId: zod.string().optional().nullable(),
  access: ACCESS.optional().nullable(),
  email: zod.string().optional().nullable(),
  accessEmails: zod.array(zod.string()).optional(),
  sendEmail: zod.boolean().optional(),
  expiresAt: zod.string().optional().nullable(),
});

const folderUpdateSchema = zod.object({
  name: zod.string().min(1).optional(),
  access: ACCESS.optional().nullable(),
  email: zod.string().optional().nullable(),
  accessEmails: zod.array(zod.string()).optional(),
  sendEmail: zod.boolean().optional(),
  expiresAt: zod.string().optional().nullable(),
});

const UPLOAD_DIR = path.join(process.cwd(), "uploads", "library");
if (!fs.existsSync(UPLOAD_DIR)) fs.mkdirSync(UPLOAD_DIR, { recursive: true });

const SIGNED_URL_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

/**
 * Persist an uploaded library attachment to Firebase Storage so it survives
 * external/Cloud Run deployments where the local filesystem is ephemeral.
 * Returns a server-signed (rule-independent) download URL plus the full
 * storage path so it can be streamed back later.
 */
async function saveLibraryAttachmentToStorage(
  originalname: string,
  buffer: Buffer,
  mimetype: string,
): Promise<{ url: string; storedAs: string }> {
  const bucket = getStorageBucket();
  const ext = path.extname(originalname).toLowerCase();
  const storedAs = `documents/library/${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
  const file = bucket.file(storedAs);
  await file.save(buffer, {
    metadata: { contentType: mimetype, metadata: { originalName: originalname } },
  });
  const [url] = await file.getSignedUrl({ action: "read", expires: Date.now() + SIGNED_URL_TTL_MS });
  return { url, storedAs };
}

const ALLOWED_EXT = [".pdf", ".ppt", ".pptx", ".doc", ".docx", ".xls", ".xlsx"];
const libraryUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 50 * 1024 * 1024 },
  fileFilter: (_req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED_EXT.includes(ext)) cb(null, true);
    else cb(new Error("Only PDF, PPT, Word, and Excel files are allowed"));
  },
});

function publicFields(e: LibraryDoc) {
  return {
    id: e.id,
    participantLink: e.participantLink ?? null,
    title: e.title,
    description: e.description ?? null,
    section: e.section,
    department: e.department ?? null,
    category: e.category ?? null,
    url: e.url ?? null,
    access: e.access ?? "open",
    attachments: (e.attachments ?? []).map(a => ({ id: a.id, filename: a.filename, type: a.type, size: a.size })),
  };
}

function mapDoc(e: LibraryDoc) {
  return {
    id: e.id,
    title: e.title,
    description: e.description ?? null,
    section: e.section,
    department: e.department ?? null,
    category: e.category ?? null,
    url: e.url ?? null,
    access: e.access ?? "open",
    email: e.email ?? null,
    accessEmails: e.accessEmails ?? [],
    participantLink: e.participantLink ?? null,
    accessCode: e.accessCode ?? null,
    folderId: e.folderId ?? null,
    expiresAt: e.expiresAt ?? null,
    attachments: e.attachments ?? [],
    createdById: e.createdById ?? null,
    createdByName: e.createdByName ?? null,
    createdAt: e.createdAt,
    updatedAt: e.updatedAt,
  };
}

async function maybeSendEmail(req: any, doc: LibraryDoc, oldEmails: string[] = []) {
  const email = doc.email ?? req.body?.email;
  if (doc.section !== "external") return;
  const list = doc.accessEmails ?? [];
  const recipients = list.filter(e => !oldEmails.includes(e));
  if ((doc.access ?? "open") === "disabled") {
    // Revoke access for every participant that currently has it.
    for (const r of list) {
      await sendAccessRevokedEmail({ to: r, title: doc.title });
    }
    return;
  }
  if (recipients.length === 0) return;
  const base = publicViewerUrl();
  const link = doc.participantLink
    ? `${base}/library/${doc.participantLink}`
    : (doc.url ?? "");
  if (!link) return;
  const access = doc.access ?? "open";
  for (const to of recipients) {
    await sendAccessEmail({ to, title: doc.title, link, access, code: doc.accessCode ?? undefined, expiresAt: doc.expiresAt });
  }
}

// ── Expiry sweep ─────────────────────────────────────────────────────────────
// Periodically emails external participants once, right after their shared
// material/folder passes its expiry time and automatically loses access.
let sweepRunning = false;
export async function sweepExpiredLibraryShares(): Promise<void> {
  if (sweepRunning) return;
  sweepRunning = true;
  try {
    const now = new Date().toISOString();

    const materials = await getAll<LibraryDoc>("library", "createdAt", "desc");
    for (const m of materials) {
      if (m.section !== "external") continue;
      if (!m.expiresAt) continue;
      if (m.expiryNotifiedAt) continue;
      if (!isExpired(m.expiresAt)) continue;
      const recipients = (m.accessEmails && m.accessEmails.length > 0 ? m.accessEmails : (m.email ? [m.email] : []));
      let allOk = recipients.length > 0;
      for (const r of recipients) {
        const ok = await sendAccessExpiredEmail({ to: r, title: m.title, kind: "material", expiredAt: m.expiresAt });
        if (!ok) allOk = false;
      }
      if (allOk) await updateDoc("library", m.id!, { expiryNotifiedAt: now });
    }

    const folders = await getAll<LibraryFolderDoc>("libraryFolders", "createdAt", "desc");
    for (const f of folders) {
      if (f.section !== "external") continue;
      if (!f.expiresAt) continue;
      if (f.expiryNotifiedAt) continue;
      if (!isExpired(f.expiresAt)) continue;
      const recipients = (f.accessEmails && f.accessEmails.length > 0 ? f.accessEmails : (f.email ? [f.email] : []));
      let allOk = recipients.length > 0;
      for (const r of recipients) {
        const ok = await sendAccessExpiredEmail({ to: r, title: f.name, kind: "folder", expiredAt: f.expiresAt });
        if (!ok) allOk = false;
      }
      if (allOk) await updateDoc("libraryFolders", f.id!, { expiryNotifiedAt: now });
    }
  } catch (e) {
    logger.error({ err: e }, "sweepExpiredLibraryShares failed");
  } finally {
    sweepRunning = false;
  }
}

const router: IRouter = Router();

// ── Folders ────────────────────────────────────────────────────────────────
router.get("/library/folders", requireAuth, async (req, res): Promise<void> => {
  const section = typeof req.query.section === "string" ? req.query.section : undefined;
  let rows = await getAll<LibraryFolderDoc>("libraryFolders", "createdAt", "asc");
  if (section === "internal" || section === "external") rows = rows.filter(f => f.section === section);
  res.json(rows.map(f => ({
    id: f.id,
    name: f.name,
    section: f.section,
    parentId: f.parentId ?? null,
    access: f.access ?? "open",
    email: f.email ?? null,
    accessEmails: f.accessEmails ?? [],
    participantLink: f.participantLink ?? null,
    accessCode: f.accessCode ?? null,
    expiresAt: f.expiresAt ?? null,
    createdAt: f.createdAt,
  })));
});

router.post("/library/folders", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const parsed = folderSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const shareable = parsed.data.section === "external";
  const created = await createDoc<LibraryFolderDoc>("libraryFolders", {
    name: parsed.data.name,
    section: parsed.data.section,
    parentId: parsed.data.parentId ?? null,
    access: shareable ? (parsed.data.access ?? "open") : "open",
    email: shareable ? (parsed.data.email ?? null) : null,
    accessEmails: shareable && parsed.data.accessEmails && parsed.data.accessEmails.length > 0 ? parsed.data.accessEmails : (shareable && parsed.data.email ? [parsed.data.email] : []),
    participantLink: shareable ? genShareId() : null,
    accessCode: shareable ? genAccessCode() : null,
    expiresAt: shareable ? (parsed.data.expiresAt ?? null) : null,
    createdBy: req.currentUser?.id ?? null,
    createdAt: new Date().toISOString(),
  });
  res.status(201).json({
    id: created.id,
    name: created.name,
    section: created.section,
    parentId: created.parentId ?? null,
    access: created.access ?? "open",
    email: created.email ?? null,
    accessEmails: created.accessEmails ?? [],
    participantLink: created.participantLink ?? null,
    accessCode: created.accessCode ?? null,
    expiresAt: created.expiresAt ?? null,
    createdAt: created.createdAt,
  });
  if (shareable && parsed.data.sendEmail && (created.accessEmails ?? []).length > 0) {
    const base = publicViewerUrl();
    for (const to of (created.accessEmails ?? [])) {
      await sendFolderAccessEmail({ to, folderName: created.name, link: `${base}/library/folder/${created.participantLink}`, access: created.access ?? "open", code: created.accessCode ?? undefined, expiresAt: created.expiresAt });
    }
  }
});

router.patch("/library/folders/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = folderUpdateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await getDoc<LibraryFolderDoc>("libraryFolders", id);
  if (!existing) { res.status(404).json({ error: "Folder not found" }); return; }
  const updateData: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (parsed.data.name !== undefined) updateData.name = parsed.data.name;
  if (parsed.data.access !== undefined) updateData.access = parsed.data.access;
  if (parsed.data.email !== undefined) updateData.email = parsed.data.email;
  if (parsed.data.accessEmails !== undefined) updateData.accessEmails = parsed.data.accessEmails;
  if (parsed.data.expiresAt !== undefined) updateData.expiresAt = parsed.data.expiresAt;
  // Re-arm the expiry notification whenever the expiry time is (re)set/changed.
  if (parsed.data.expiresAt !== undefined && parsed.data.expiresAt !== existing.expiresAt) {
    updateData.expiryNotifiedAt = null;
  }
  await updateDoc("libraryFolders", id, updateData);
  const updated = await getDoc<LibraryFolderDoc>("libraryFolders", id);
  res.json({
    id: updated!.id,
    name: updated!.name,
    section: updated!.section,
    parentId: updated!.parentId ?? null,
    access: updated!.access ?? "open",
    email: updated!.email ?? null,
    accessEmails: updated!.accessEmails ?? [],
    participantLink: updated!.participantLink ?? null,
    accessCode: updated!.accessCode ?? null,
    expiresAt: updated!.expiresAt ?? null,
    createdAt: updated!.createdAt,
  });
    const recipients = (updated!.accessEmails && updated!.accessEmails.length > 0 ? updated!.accessEmails : (parsed.data.email ?? existing.email ? [parsed.data.email ?? existing.email!] : []));
    if (existing.section === "external" && recipients.length > 0) {
      const base = publicViewerUrl();
      const shareLink = updated!.participantLink ? `${base}/library/folder/${updated!.participantLink}` : "";
    if ((parsed.data.access ?? existing.access ?? "open") === "disabled") {
      // Revoke access for every participant that currently has it.
      const revoked = recipients;
      for (const r of revoked) {
        await sendAccessRevokedEmail({ to: r, title: `Folder: ${existing.name}` });
      }
    } else if (parsed.data.sendEmail === true && shareLink) {
      const newOnes = recipients.filter(e => !(existing.accessEmails ?? []).includes(e));
      for (const to of newOnes) {
        await sendFolderAccessEmail({ to, folderName: existing.name, link: shareLink, access: parsed.data.access ?? existing.access ?? "open", code: updated!.accessCode ?? undefined, expiresAt: updated!.expiresAt });
      }
    }
  }
});

router.delete("/library/folders/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const folder = await getDoc<LibraryFolderDoc>("libraryFolders", id);
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  const inFolder = await queryWhere<LibraryDoc>("library", "folderId", "==", id);
  for (const m of inFolder) {
    await updateDoc("library", m.id!, { folderId: null, updatedAt: new Date().toISOString() });
  }
  await deleteDoc("libraryFolders", id);
  res.sendStatus(204);
});

// ── Folder access emails ──────────────────────────────────────────────────
// A folder/material can be shared with many external participants. Each
// participant's email is stored in an `accessEmails` array; the single legacy
// `email` field now mirrors the first entry for backwards compatibility.
function normalizeEmail(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const e = v.trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e)) return null;
  return e;
}

const accessEmailBody = zod.object({
  email: zod.string().min(1).optional(),
  emails: zod.array(zod.string()).optional(),
}).refine((d) => !!(d.email || (d.emails && d.emails.length)), { message: "email or emails is required" });

router.get("/library/folders/:id/access", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const folder = await getDoc<LibraryFolderDoc>("libraryFolders", id);
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  res.json({ accessEmails: folder.accessEmails ?? [] });
});

router.post("/library/folders/:id/access", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = accessEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid email is required" }); return; }
  const rawList = Array.isArray(parsed.data.emails)
    ? parsed.data.emails
    : parsed.data.email
      ? [parsed.data.email]
      : [];
  const emails = Array.from(
    new Set(rawList.map(normalizeEmail).filter((e): e is string => !!e))
  );
  if (emails.length === 0) { res.status(400).json({ error: "A valid email is required" }); return; }
  const folder = await getDoc<LibraryFolderDoc>("libraryFolders", id);
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  if (folder.section !== "external") { res.status(400).json({ error: "Only external folders support shared access" }); return; }
  const list = folder.accessEmails ?? [];
  const newOnes = emails.filter(e => !list.includes(e));
  if (newOnes.length === 0) { res.status(409).json({ error: "Email(s) already have access", accessEmails: list }); return; }
  const next = [...list, ...newOnes];
  await updateDoc("libraryFolders", id, { accessEmails: next, email: next[0] ?? null, updatedAt: new Date().toISOString() });
  const base = publicViewerUrl();
  const code = folder.accessCode ? `?code=${folder.accessCode}` : "";
  const shareLink = folder.participantLink ? `${base}/library/folder/${folder.participantLink}${code}` : "";
  if (shareLink && (folder.access ?? "open") !== "disabled") {
    for (const to of newOnes) {
      await sendFolderAccessEmail({ to, folderName: folder.name, link: shareLink, access: folder.access ?? "open", code: folder.accessCode ?? undefined, expiresAt: folder.expiresAt });
    }
  }
  res.status(201).json({ accessEmails: next });
});

router.delete("/library/folders/:id/access", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = accessEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid email is required" }); return; }
  const email = normalizeEmail(parsed.data.email);
  if (!email) { res.status(400).json({ error: "Invalid email address" }); return; }
  const folder = await getDoc<LibraryFolderDoc>("libraryFolders", id);
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  const list = folder.accessEmails ?? [];
  if (!list.includes(email)) { res.status(404).json({ error: "Email not found", accessEmails: list }); return; }
  const next = list.filter(e => e !== email);
  await updateDoc("libraryFolders", id, { accessEmails: next, email: next[0] ?? null, updatedAt: new Date().toISOString() });
  if (folder.section === "external") {
    await sendAccessRevokedEmail({ to: email, title: `Folder: ${folder.name}` });
  }
  res.json({ accessEmails: next });
});

// ── Materials ──────────────────────────────────────────────────────────────
router.get("/library", requireAuth, async (req, res): Promise<void> => {
  const section = typeof req.query.section === "string" ? req.query.section : undefined;
  const folderId = typeof req.query.folderId === "string" ? req.query.folderId : undefined;
  let rows = await getAll<LibraryDoc>("library", "createdAt", "desc");
  if (section === "internal" || section === "external") rows = rows.filter(e => e.section === section);
  if (folderId) {
    rows = rows.filter(e => (e.folderId ?? null) === folderId);
  } else {
    // Top-level list only shows unfiled materials. Anything assigned to a
    // folder lives exclusively inside that folder and is hidden from "All".
    rows = rows.filter(e => !e.folderId);
  }
  res.json(rows.map(mapDoc));
});

router.post("/library", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const parsed = bodySchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const data: LibraryDoc = {
    ...parsed.data,
    description: parsed.data.description ?? null,
    department: parsed.data.department ?? null,
    category: parsed.data.category ?? null,
    url: parsed.data.url ?? null,
    access: parsed.data.access ?? "open",
    email: parsed.data.email ?? null,
    accessEmails: parsed.data.accessEmails && parsed.data.accessEmails.length > 0 ? parsed.data.accessEmails : (parsed.data.email ? [parsed.data.email] : []),
    participantLink: parsed.data.section === "external" ? genShareId() : null,
    accessCode: parsed.data.section === "external" ? genAccessCode() : null,
    folderId: parsed.data.folderId ?? null,
    expiresAt: parsed.data.expiresAt ?? null,
    expiryNotifiedAt: null,
    attachments: [],
    createdById: req.currentUser?.id ?? null,
    createdByName: req.currentUser?.username ?? req.currentUser?.fullName ?? null,
    createdAt: now,
    updatedAt: now,
  };
  const created = await createDoc<LibraryDoc>("library", data);
  res.status(201).json(mapDoc(created));
  await maybeSendEmail(req, created);
});

router.get("/library/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  res.json(mapDoc(doc));
});

router.patch("/library/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = updateSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const existing = await getDoc<LibraryDoc>("library", id);
  if (!existing) { res.status(404).json({ error: "Material not found" }); return; }
  const updateData: Record<string, unknown> = { ...parsed.data, updatedAt: new Date().toISOString() };
  // Re-arm the expiry notification whenever the expiry time is (re)set/changed.
  if (parsed.data.expiresAt !== undefined && parsed.data.expiresAt !== existing.expiresAt) {
    updateData.expiryNotifiedAt = null;
  }
  await updateDoc("library", id, updateData);
  const updated = await getDoc<LibraryDoc>("library", id);
  res.json(mapDoc(updated!));
  await maybeSendEmail(req, updated!, existing.accessEmails ?? []);
});

// Ensure an external material has a non-guessable share token (generating one
// if it was created before tokens existed). Returns the full material.
router.post("/library/:id/ensure-share", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<LibraryDoc>("library", id);
  if (!existing) { res.status(404).json({ error: "Material not found" }); return; }
  if (existing.section !== "external") { res.status(400).json({ error: "Only external materials can be shared" }); return; }
  if (!existing.participantLink) {
    await updateDoc("library", id, { participantLink: genShareId(), accessCode: existing.accessCode ?? genAccessCode(), updatedAt: new Date().toISOString() });
  } else if (!existing.accessCode) {
    await updateDoc("library", id, { accessCode: genAccessCode(), updatedAt: new Date().toISOString() });
  }
  const updated = await getDoc<LibraryDoc>("library", id);
  res.json(mapDoc(updated!));
});

router.delete("/library/:id", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<LibraryDoc>("library", id);
  if (!existing) { res.status(404).json({ error: "Material not found" }); return; }
  for (const a of existing.attachments ?? []) {
    try {
      if (a.storedAs.startsWith("documents/")) {
        await getStorageBucket().file(a.storedAs).delete().catch(() => {});
      } else {
        fs.unlinkSync(path.join(UPLOAD_DIR, a.storedAs));
      }
    } catch {}
  }
  await deleteDoc("library", id);
  res.sendStatus(204);
});

// ── Material access emails ──────────────────────────────────────────────────
router.get("/library/:id/access", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  res.json({ accessEmails: doc.accessEmails ?? [] });
});

router.post("/library/:id/access", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = accessEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid email is required" }); return; }
  const rawList = Array.isArray(parsed.data.emails)
    ? parsed.data.emails
    : parsed.data.email
      ? [parsed.data.email]
      : [];
  const emails = Array.from(
    new Set(rawList.map(normalizeEmail).filter((e): e is string => !!e))
  );
  if (emails.length === 0) { res.status(400).json({ error: "A valid email is required" }); return; }
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  if (doc.section !== "external") { res.status(400).json({ error: "Only external materials support shared access" }); return; }
  const list = doc.accessEmails ?? [];
  const newOnes = emails.filter(e => !list.includes(e));
  if (newOnes.length === 0) { res.status(409).json({ error: "Email(s) already have access", accessEmails: list }); return; }
  const next = [...list, ...newOnes];
  await updateDoc("library", id, { accessEmails: next, email: next[0] ?? null, updatedAt: new Date().toISOString() });
  const base = publicViewerUrl();
  const code = doc.accessCode ? `?code=${doc.accessCode}` : "";
  const link = doc.participantLink ? `${base}/library/${doc.participantLink}${code}` : (doc.url ?? "");
  if (link && (doc.access ?? "open") !== "disabled") {
    for (const to of newOnes) {
      await sendAccessEmail({ to, title: doc.title, link, access: doc.access ?? "open", code: doc.accessCode ?? undefined, expiresAt: doc.expiresAt });
    }
  }
  res.status(201).json({ accessEmails: next });
});

router.delete("/library/:id/access", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = accessEmailBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: "A valid email is required" }); return; }
  const email = normalizeEmail(parsed.data.email);
  if (!email) { res.status(400).json({ error: "Invalid email address" }); return; }
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  const list = doc.accessEmails ?? [];
  if (!list.includes(email)) { res.status(404).json({ error: "Email not found", accessEmails: list }); return; }
  const next = list.filter(e => e !== email);
  await updateDoc("library", id, { accessEmails: next, email: next[0] ?? null, updatedAt: new Date().toISOString() });
  if (doc.section === "external") {
    await sendAccessRevokedEmail({ to: email, title: doc.title });
  }
  res.json({ accessEmails: next });
});

// Delete every material (and its attachments) plus every folder in an optional
// section. Destructive by design — the client must confirm first.
router.delete("/library/all", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const section = typeof req.query.section === "string" ? req.query.section : undefined;
  const bucket = getStorageBucket();
  const mats = await getAll<LibraryDoc>("library", "createdAt", "desc");
  const folders = await getAll<LibraryFolderDoc>("libraryFolders", "createdAt", "desc");
  const targetMats = section ? mats.filter(m => m.section === section) : mats;
  const targetFolders = section ? folders.filter(f => f.section === section) : folders;
  let deleted = 0;
  for (const m of targetMats) {
    for (const a of m.attachments ?? []) {
      try {
        if (a.storedAs.startsWith("documents/")) {
          await bucket.file(a.storedAs).delete().catch(() => {});
        } else {
          fs.unlinkSync(path.join(UPLOAD_DIR, a.storedAs));
        }
      } catch {}
    }
    await deleteDoc("library", m.id!);
    deleted++;
  }
  for (const f of targetFolders) {
    await deleteDoc("libraryFolders", f.id!);
    deleted++;
  }
  res.json({ deleted });
});

// ── Attachments ─────────────────────────────────────────────────────────────
router.post("/library/:id/attachments", requireAnyPermission("canAccessJmcs", "canAccessSis"), libraryUpload.single("file"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  const ext = path.extname(req.file.originalname).toLowerCase().replace(/^\./, "");
  const { url, storedAs } = await saveLibraryAttachmentToStorage(req.file.originalname, req.file.buffer, req.file.mimetype);
  const attachment: LibraryAttachment = {
    id: `att_${Date.now()}_${Math.round(Math.random() * 1e6)}`,
    filename: req.file.originalname,
    storedAs,
    url,
    size: req.file.size,
    mime: req.file.mimetype,
    type: ext,
    uploadedAt: new Date().toISOString(),
  };
  const attachments = [...(doc.attachments ?? []), attachment];
  await updateDoc("library", id, { attachments, updatedAt: new Date().toISOString() });
  emitChange("library", "updated", id);
  res.status(201).json(attachment);
});

router.delete("/library/:id/attachments/:attachId", requireAnyPermission("canAccessJmcs", "canAccessSis"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const attachId = Array.isArray(req.params.attachId) ? req.params.attachId[0] : req.params.attachId;
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  const att = (doc.attachments ?? []).find(a => a.id === attachId);
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }
  try {
    if (att.storedAs.startsWith("documents/")) {
      await getStorageBucket().file(att.storedAs).delete().catch(() => {});
    } else {
      fs.unlinkSync(path.join(UPLOAD_DIR, att.storedAs));
    }
  } catch {}
  const attachments = (doc.attachments ?? []).filter(a => a.id !== attachId);
  await updateDoc("library", id, { attachments, updatedAt: new Date().toISOString() });
  emitChange("library", "updated", id);
  res.sendStatus(204);
});

// Stream an attachment's bytes back to the client, preferring Firebase Storage
// and falling back to the local upload dir for legacy attachments.
async function streamAttachment(res: any, att: LibraryAttachment, inline: boolean): Promise<boolean> {
  if (att.storedAs.startsWith("documents/")) {
    try {
      const bucket = getStorageBucket();
      const file = bucket.file(att.storedAs);
      const [exists] = await file.exists();
      if (exists) {
        res.setHeader("Content-Type", att.mime || "application/octet-stream");
        res.setHeader("Content-Disposition", `${inline ? "inline" : "attachment"}; filename="${encodeURIComponent(att.filename)}"`);
        file.createReadStream().pipe(res);
        return true;
      }
    } catch { /* fall through to local disk */ }
  }
  const filePath = path.join(UPLOAD_DIR, att.storedAs);
  if (fs.existsSync(filePath)) {
    if (inline) res.setHeader("Content-Disposition", `inline; filename="${encodeURIComponent(att.filename)}"`);
    res.download(filePath, att.filename);
    return true;
  }
  return false;
}

// Authenticated download
router.get("/library/:id/attachments/:attachId/download", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const attachId = Array.isArray(req.params.attachId) ? req.params.attachId[0] : req.params.attachId;
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  const att = (doc.attachments ?? []).find(a => a.id === attachId);
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }
  if (!(await streamAttachment(res, att, false))) { res.status(404).json({ error: "File missing" }); return; }
});

// Authenticated inline stream (for in-app viewing without downloading)
router.get("/library/:id/attachments/:attachId", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const attachId = Array.isArray(req.params.attachId) ? req.params.attachId[0] : req.params.attachId;
  const doc = await getDoc<LibraryDoc>("library", id);
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  const att = (doc.attachments ?? []).find(a => a.id === attachId);
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }
  if (!(await streamAttachment(res, att, true))) { res.status(404).json({ error: "File missing" }); return; }
});

// ── Public participant access ────────────────────────────────────────────────
// Participants are addressed by a non-guessable `participantLink` token (not the
// internal document id), so the share URL cannot be edited to reach other
// materials (prevents IDOR). Access additionally requires the unique `accessCode`
// (emailed with the link) and is blocked once `expiresAt` has passed.
function requireValidShare(res: any, doc: { access?: string | null; accessCode?: string | null; expiresAt?: string | null }, providedCode?: string): boolean {
  if ((doc.access ?? "open") === "disabled") {
    res.status(403).json({ error: "This material is not available" });
    return false;
  }
  if (isExpired(doc.expiresAt)) {
    res.status(403).json({ error: "This shared access has expired" });
    return false;
  }
  if (!doc.accessCode || doc.accessCode !== providedCode) {
    res.status(403).json({ error: "Invalid or missing access code" });
    return false;
  }
  return true;
}

export const getPublicLibraryItem = async (req: any, res: any): Promise<void> => {
  const token = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const docs = await queryWhere<LibraryDoc>("library", "participantLink", "==", token);
  const doc = docs[0];
  if (!doc) { res.status(404).json({ error: "Material not found" }); return; }
  if (doc.section !== "external") { res.status(404).json({ error: "Material not found" }); return; }
  logger.info({ token, expiresAt: doc.expiresAt, now: new Date().toISOString(), codeMatch: doc.accessCode === req.query.code }, "public item access attempt");
  if (!requireValidShare(res, doc, req.query.code)) return;
  res.json(publicFields(doc));
};

export const getPublicLibraryAttachment = async (req: any, res: any): Promise<void> => {
  const token = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const attachId = Array.isArray(req.params.attachId) ? req.params.attachId[0] : req.params.attachId;
  const docs = await queryWhere<LibraryDoc>("library", "participantLink", "==", token);
  const doc = docs[0];
  if (!doc || doc.section !== "external") { res.status(404).json({ error: "Not found" }); return; }
  if (!requireValidShare(res, doc, req.query.code)) return;
  const att = (doc.attachments ?? []).find(a => a.id === attachId);
  if (!att) { res.status(404).json({ error: "Attachment not found" }); return; }
  if (!(await streamAttachment(res, att, true))) { res.status(404).json({ error: "File missing" }); return; }
};

export const getPublicLibraryFolder = async (req: any, res: any): Promise<void> => {
  const token = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const folders = await queryWhere<LibraryFolderDoc>("libraryFolders", "participantLink", "==", token);
  const folder = folders[0];
  if (!folder) { res.status(404).json({ error: "Folder not found" }); return; }
  if (folder.section !== "external") { res.status(404).json({ error: "Folder not found" }); return; }
  if (!requireValidShare(res, folder, req.query.code)) return;
  const materials = (await queryWhere<LibraryDoc>("library", "folderId", "==", folder.id))
    .filter(m => m.section === "external" && (m.access ?? "open") !== "disabled")
    .map(publicFields);
  res.json({
    id: folder.id,
    name: folder.name,
    access: folder.access ?? "open",
    materials,
  });
};

export default router;
