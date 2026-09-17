import { Router, type IRouter } from "express";
import { z } from "zod";
import { getAll, getDoc, createDoc, updateDoc, deleteDoc, queryWhere } from "../lib/firebase-db";
import { requireAuth, requireRole } from "../middlewares/auth";
import { emitChange } from "./sse";

const router: IRouter = Router();

router.use(requireAuth);

const ANNOUNCEMENT_TYPES = ["info", "warning", "announcement"] as const;
const PRIORITY_LEVELS = ["low", "normal", "high", "urgent"] as const;
const TARGET_AUDIENCES = ["all", "staff", "admin"] as const;

const CreateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200),
  body: z.string().min(1).max(5000),
  type: z.enum(ANNOUNCEMENT_TYPES).default("announcement"),
  priority: z.enum(PRIORITY_LEVELS).default("normal"),
  targetAudience: z.enum(TARGET_AUDIENCES).default("all"),
  isPinned: z.boolean().default(false),
});

const UpdateAnnouncementSchema = z.object({
  title: z.string().min(1).max(200).optional(),
  body: z.string().min(1).max(5000).optional(),
  type: z.enum(ANNOUNCEMENT_TYPES).optional(),
  priority: z.enum(PRIORITY_LEVELS).optional(),
  targetAudience: z.enum(TARGET_AUDIENCES).optional(),
  isPinned: z.boolean().optional(),
  isPublished: z.boolean().optional(),
});

function mapAnnouncement(a: any) {
  return {
    id: a.id,
    title: a.title || "",
    body: a.body || "",
    type: a.type || "announcement",
    priority: a.priority || "normal",
    targetAudience: a.targetAudience || "all",
    isPinned: a.isPinned || false,
    isPublished: a.isPublished !== false,
    createdBy: a.createdBy || "",
    createdById: a.createdById || "",
    createdAt: a.createdAt,
    updatedAt: a.updatedAt,
  };
}

router.get("/announcements", async (_req, res): Promise<void> => {
  const announcements = await getAll("announcements", "createdAt", "desc");
  const published = announcements.filter((a: any) => a.isPublished !== false);
  res.json(published.map(mapAnnouncement));
});

router.get("/announcements/unpublished", async (req, res): Promise<void> => {
  const all = await getAll("announcements", "createdAt", "desc");
  const unpublished = all.filter((a: any) => a.isPublished === false);
  res.json(unpublished.map(mapAnnouncement));
});

router.get("/announcements/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const announcement = await getDoc("announcements", id);
  if (!announcement) { res.status(404).json({ error: "Announcement not found" }); return; }
  res.json(mapAnnouncement(announcement));
});

router.post("/announcements", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const parsed = CreateAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const currentUser = req.currentUser!;
  const doc = await createDoc("announcements", {
    ...parsed.data,
    createdBy: currentUser.fullName || currentUser.username || "",
    createdById: currentUser.id,
    isPublished: true,
    createdAt: now,
    updatedAt: now,
  });
  await createDoc("activity", {
    type: "announcement",
    description: `Announcement "${parsed.data.title}" published`,
    entityId: doc.id,
    timestamp: now,
  });
  emitChange("announcement", "created", doc.id);
  res.status(201).json(mapAnnouncement(doc));
});

router.patch("/announcements/:id", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc("announcements", id);
  if (!existing) { res.status(404).json({ error: "Announcement not found" }); return; }
  const parsed = UpdateAnnouncementSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  await updateDoc("announcements", id, { ...parsed.data, updatedAt: now });
  const updated = await getDoc("announcements", id);
  await createDoc("activity", {
    type: "announcement",
    description: `Announcement "${existing.title}" updated`,
    entityId: id,
    timestamp: now,
  });
  emitChange("announcement", "updated", id);
  res.json(mapAnnouncement(updated));
});

router.delete("/announcements/:id", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  await deleteDoc("announcements", id);
  await createDoc("activity", {
    type: "announcement",
    description: `Announcement deleted`,
    entityId: id,
    timestamp: new Date().toISOString(),
  });
  emitChange("announcement", "deleted", id);
  res.sendStatus(204);
});

router.get("/announcements/stats", async (_req, res): Promise<void> => {
  const all = await getAll("announcements", "createdAt", "desc");
  const published = all.filter((a: any) => a.isPublished !== false);
  const pinned = published.filter((a: any) => a.isPinned);
  res.json({
    total: all.length,
    published: published.length,
    pinned: pinned.length,
    thisWeek: published.filter((a: any) => {
      const weekAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      return new Date(a.createdAt) >= weekAgo;
    }).length,
  });
});

export default router;
