import { Router, type IRouter } from "express";
import { requirePermission } from "../middlewares/auth";
import {
  getAll, getDoc, createDoc, updateDoc, deleteDoc, queryWhere,
  type TaskDoc,
} from "../lib/firebase-db";

const router: IRouter = Router();

const allowedStatuses = ["todo", "in_progress", "done"];

router.get("/projects/:projectId/tasks", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
  const pId = req.params.projectId;
  const tasks = await queryWhere<TaskDoc>("tasks", "projectId", "==", pId, "createdAt", "asc");
  res.json(tasks);
});

router.post("/projects/:projectId/tasks", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
  const pId = req.params.projectId;
  const { title, description, assignee } = req.body;
  if (!title || typeof title !== "string") {
    res.status(400).json({ error: "title is required" });
    return;
  }
  const now = new Date().toISOString();
  const task = await createDoc("tasks", {
    projectId: pId,
    title,
    description: description || null,
    status: "todo",
    assignee: assignee || null,
    createdAt: now,
    updatedAt: now,
  });
  await createDoc("activity", {
    type: "project",
    description: `Task "${title}" added to project #${pId}`,
    entityId: pId,
    timestamp: now,
  });
  res.status(201).json(task);
});

router.patch("/tasks/:id", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const { title, description, status, assignee } = req.body;
  const update: Record<string, unknown> = { updatedAt: new Date().toISOString() };
  if (title !== undefined) update.title = title;
  if (description !== undefined) update.description = description;
  if (status !== undefined) {
    if (!allowedStatuses.includes(status)) { res.status(400).json({ error: "Invalid status" }); return; }
    update.status = status;
  }
  if (assignee !== undefined) update.assignee = assignee;
  const existing = await getDoc<TaskDoc>("tasks", id);
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  await updateDoc("tasks", id, update);
  const updated = await getDoc<TaskDoc>("tasks", id);
  res.json(updated);
});

router.delete("/tasks/:id", requirePermission("canAccessJmcs"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc<TaskDoc>("tasks", id);
  if (!existing) { res.status(404).json({ error: "Task not found" }); return; }
  await deleteDoc("tasks", id);
  res.sendStatus(204);
});

export default router;
