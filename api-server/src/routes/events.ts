import { Router, type IRouter } from "express";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc,
  type EventDoc,
} from "../lib/firebase-db";
import { requirePermission, requireAnyPermission } from "../middlewares/auth";
import {
  ListEventsQueryParams,
  CreateEventBody,
  UpdateEventBody,
} from "../../lib/api-zod/index.js";

const router: IRouter = Router();

function mapEvent(e: EventDoc) {
  return {
    id: e.id,
    title: e.title,
    description: e.description,
    startDate: e.startDate,
    endDate: e.endDate || null,
    allDay: e.allDay,
    eventType: e.eventType,
    location: e.location,
    relatedTo: e.relatedTo,
    status: e.status ?? null,
    createdAt: e.createdAt,
  };
}

router.get("/events", requireAnyPermission("canAccessJmcs", "canEditCalendar"), async (req, res): Promise<void> => {
  const params = ListEventsQueryParams.safeParse(req.query);
  let rows = await getAll<EventDoc>("events", "startDate", "asc");
  if (params.success) {
    if (params.data.from) {
      const from = new Date(params.data.from).getTime();
      rows = rows.filter(e => new Date(e.startDate).getTime() >= from);
    }
    if (params.data.to) {
      const to = new Date(params.data.to).getTime();
      rows = rows.filter(e => new Date(e.startDate).getTime() <= to);
    }
  }
  res.json(rows.map(mapEvent));
});

router.post("/events", requirePermission("canEditCalendar"), async (req, res): Promise<void> => {
  const parsed = CreateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const now = new Date().toISOString();
  const event = await createDoc<EventDoc>("events", {
    ...parsed.data,
    startDate: new Date(parsed.data.startDate).toISOString(),
    endDate: parsed.data.endDate ? new Date(parsed.data.endDate).toISOString() : null,
    status: parsed.data.status || "confirmed",
    recurrenceRule: null,
    createdAt: now,
    updatedAt: now,
  } as EventDoc);
  await createDoc("activity", {
    type: "event",
    description: `Event "${event.title}" was scheduled`,
    entityId: event.id!,
    timestamp: now,
  });
  res.status(201).json(mapEvent(event));
});

router.get("/events/:id", requireAnyPermission("canAccessJmcs", "canEditCalendar"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const event = await getDoc<EventDoc>("events", id);
  if (!event) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  res.json(mapEvent(event));
});

router.patch("/events/:id", requirePermission("canEditCalendar"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateEventBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const existing = await getDoc<EventDoc>("events", id);
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  const updateData: Record<string, unknown> = {
    ...parsed.data,
    updatedAt: new Date().toISOString(),
  };
  if (parsed.data.startDate) updateData.startDate = new Date(parsed.data.startDate).toISOString();
  if (parsed.data.endDate) updateData.endDate = new Date(parsed.data.endDate).toISOString();
  await updateDoc("events", id, updateData);
  const updated = await getDoc<EventDoc>("events", id);
  res.json(mapEvent(updated!));
});

router.delete("/events/:id", requirePermission("canEditCalendar"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<EventDoc>("events", id);
  if (!existing) {
    res.status(404).json({ error: "Event not found" });
    return;
  }
  await deleteDoc("events", id);
  res.sendStatus(204);
});

export default router;
