import { Router, type IRouter } from "express";
import { z } from "zod";
import { getAll, getDoc, createDoc, updateDoc, deleteDoc, queryWhere } from "../lib/firebase-db";
import { requireAuth } from "../middlewares/auth";
import { emitChange } from "./sse";

const router: IRouter = Router();

router.use(requireAuth);

const CreateCommentSchema = z.object({
  taskId: z.string().min(1),
  content: z.string().min(1).max(2000),
});

const UpdateCommentSchema = z.object({
  content: z.string().min(1).max(2000),
});

function mapComment(c: any) {
  return {
    id: c.id,
    taskId: c.taskId,
    content: c.content || "",
    author: c.author || "",
    authorName: c.authorName || "",
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
  };
}

router.get("/tasks/:taskId/comments", async (req, res): Promise<void> => {
  const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
  const comments = await queryWhere("taskComments", "taskId", "==", taskId, "createdAt", "asc");
  res.json(comments.map(mapComment));
});

router.post("/tasks/:taskId/comments", async (req, res): Promise<void> => {
  const taskId = Array.isArray(req.params.taskId) ? req.params.taskId[0] : req.params.taskId;
  const parsed = CreateCommentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  const currentUser = req.currentUser!;
  const comment = await createDoc("taskComments", {
    ...parsed.data,
    taskId,
    author: currentUser.id,
    authorName: currentUser.fullName || currentUser.username || "",
    createdAt: now,
    updatedAt: now,
  });
  await createDoc("activity", {
    type: "task",
    description: `Comment added to task`,
    entityId: taskId,
    timestamp: now,
  });
  emitChange("taskComment", "created", comment.id);
  res.status(201).json(mapComment(comment));
});

router.patch("/comments/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const parsed = UpdateCommentSchema.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const now = new Date().toISOString();
  await updateDoc("taskComments", id, { ...parsed.data, updatedAt: now });
  const updated = await getDoc("taskComments", id);
  res.json(mapComment(updated));
});

router.delete("/comments/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const existing = await getDoc("taskComments", id);
  if (!existing) { res.status(404).json({ error: "Comment not found" }); return; }
  await deleteDoc("taskComments", id);
  res.sendStatus(204);
});

export default router;
