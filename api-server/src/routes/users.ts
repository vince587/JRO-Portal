import { Router, type IRouter } from "express";
import {
  getAll, getDoc, getDocByField, createDoc, updateDoc, deleteDoc,
  type UserDoc,
} from "../lib/firebase-db";
import {
  CreateUserBody,
  UpdateUserBody,
} from "../../lib/api-zod/index.js";
import { requireRole, requireAuth, hasRole, normalizeRole } from "../middlewares/auth";
import { emitChange } from "./sse";
import { sendEmail } from "../lib/mailer";
import { verifyPassword, getFirebaseAuth } from "../lib/firebase-auth";
import { logger } from "../lib/logger";

const router: IRouter = Router();

function mapUser(u: UserDoc) {
  const normalizedRole = normalizeRole(u.role);
  return {
    id: u.id ?? u.uid,
    username: u.username,
    email: u.email,
    fullName: u.fullName,
    role: normalizedRole,
    roles: u.roles?.map(normalizeRole) ?? [normalizedRole],
    department: u.department,
    isActive: u.isActive,
    canAccessSis: u.canAccessSis ?? false,
    canAccessJmcs: u.canAccessJmcs ?? false,
    canEditCalendar: u.canEditCalendar ?? false,
    canEditTrainingProposal: u.canEditTrainingProposal ?? false,
    canManageContracts: u.canManageContracts ?? false,
    canManageCertificates: u.canManageCertificates ?? false,
    canAccessProjects: u.canAccessProjects ?? false,
    canAccessAdmin: u.canAccessAdmin ?? false,
    photoUrl: u.photoUrl ?? null,
    mustChangePassword: u.mustChangePassword ?? false,
    createdAt: u.createdAt,
  };
}

router.get("/users", async (req, res): Promise<void> => {
  const users = await getAll<UserDoc>("users", "createdAt", "desc");
  res.json(users.map(mapUser));
});

router.post("/users", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const parsed = CreateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  try {
    const firebaseAuth = getFirebaseAuth();
    if (!firebaseAuth) {
      res.status(503).json({ error: "Firebase Auth not configured" });
      return;
    }
    const userRecord = await firebaseAuth.createUser({
      email: parsed.data.email,
      password: parsed.data.password,
      displayName: parsed.data.fullName || parsed.data.username,
    });
    const now = new Date().toISOString();
    const user = await createDoc("users", {
      uid: userRecord.uid,
      username: parsed.data.username,
      email: parsed.data.email,
      fullName: parsed.data.fullName || null,
      role: parsed.data.role || "staff",
      roles: parsed.data.roles ?? (parsed.data.role ? [parsed.data.role] : ["staff"]),
      department: parsed.data.department || null,
      isActive: true,
      canAccessSis: parsed.data.canAccessSis ?? false,
      canAccessJmcs: parsed.data.canAccessJmcs ?? true,
      canEditCalendar: parsed.data.canEditCalendar ?? false,
      canEditTrainingProposal: parsed.data.canEditTrainingProposal ?? false,
      canManageContracts: parsed.data.canManageContracts ?? false,
      canManageCertificates: parsed.data.canManageCertificates ?? false,
      canAccessProjects: parsed.data.canAccessProjects ?? false,
      canAccessAdmin: parsed.data.canAccessAdmin ?? false,
      photoUrl: parsed.data.photoUrl || null,
      mustChangePassword: true,
      createdAt: now,
      updatedAt: now,
    }, userRecord.uid);
    await createDoc("activity", {
      type: "user",
      description: `User "${user.username}" was created`,
      entityId: userRecord.uid,
      timestamp: now,
    });
    const baseUrl = process.env.BASE_URL || "https://jmcs-portal.replit.app";
    const welcomeSubject = "[JMCS Portal] Welcome to the JMCS Portal";
    const welcomeText = `Hi ${user.fullName || user.username},\n\nWelcome to the JMCS Portal! Your account has been created and you can now access the system using the credentials below:\n\nUsername: ${user.username}\nPassword: ${parsed.data.password}\n\nGet started here: ${baseUrl}/login\n\nFor your security, you will be asked to change this password the first time you log in.\n\nIf you have any questions, please contact your system administrator.\n\nJMCS Portal Team`;
    const emailSent = await sendEmail({ to: user.email, subject: welcomeSubject, text: welcomeText });
    if (!emailSent) {
      logger.warn({ email: user.email }, "Welcome email failed to send (check SMTP/domain verification)");
    }
    emitChange("user", "created", user.id);
    res.status(201).json({ ...mapUser({ ...user, uid: userRecord.uid }), emailSent });
  } catch (err: any) {
    res.status(400).json({ error: err.message || "Failed to create user" });
  }
});

router.get("/users/:id", async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const resolved = await resolveUser(id);
  if (!resolved) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(mapUser(resolved.user));
});

async function resolveUser(id: string): Promise<{ user: UserDoc; docId: string } | null> {
  const user = await getDoc<UserDoc>("users", id);
  if (user) return { user, docId: id };
  const byUid = await getDocByField<UserDoc>("users", "uid", id);
  if (byUid) return { user: byUid, docId: byUid.id! };
  return null;
}

router.patch("/users/:id", requireAuth, async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const currentUser = req.currentUser!;
  const isSelf = currentUser.id === id;
  const isAdmin = hasRole(currentUser, "admin", "ADMIN", "IT");
  // Non-admins may only update their own profile, and only safe self-service
  // fields (fullName, photoUrl). Everything else requires admin.
  if (!isAdmin && !isSelf) {
    res.status(403).json({ error: "sorry you dont have permission to access this resource" });
    return;
  }
  const parsed = UpdateUserBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  if (!isAdmin) {
    const allowed = ["fullName", "email", "photoUrl"];
    const extra = Object.keys(parsed.data).filter(k => !allowed.includes(k));
    if (extra.length > 0) {
      res.status(403).json({ error: "sorry you dont have permission to access this resource" });
      return;
    }
  }
  const resolved = await resolveUser(id);
  if (!resolved) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user: existing, docId } = resolved;

  // Build the update payload strictly from fields the caller is allowed to set.
  // Non-admins can only update a small self-service allowlist; privileged
  // fields (role, permissions, isActive, department) are admin-only and are
  // never copied from a non-admin request, even if present in the body.
  const updateData: Record<string, unknown> = {
    updatedAt: new Date().toISOString(),
  };
  if (isAdmin) {
    if (parsed.data.email) updateData.email = parsed.data.email;
    if (parsed.data.fullName !== undefined) updateData.fullName = parsed.data.fullName;
    if (parsed.data.role) updateData.role = parsed.data.role;
    if (parsed.data.roles) {
      updateData.roles = parsed.data.roles;
      updateData.role = parsed.data.roles[0] || parsed.data.role;
    }
    if (parsed.data.department !== undefined) updateData.department = parsed.data.department;
    if (parsed.data.isActive !== undefined) updateData.isActive = parsed.data.isActive;
    if (parsed.data.canAccessSis !== undefined) updateData.canAccessSis = parsed.data.canAccessSis;
    if (parsed.data.canAccessJmcs !== undefined) updateData.canAccessJmcs = parsed.data.canAccessJmcs;
    if (parsed.data.canEditCalendar !== undefined) updateData.canEditCalendar = parsed.data.canEditCalendar;
    if (parsed.data.canEditTrainingProposal !== undefined) updateData.canEditTrainingProposal = parsed.data.canEditTrainingProposal;
    if (parsed.data.canManageContracts !== undefined) updateData.canManageContracts = parsed.data.canManageContracts;
    if (parsed.data.canManageCertificates !== undefined) updateData.canManageCertificates = parsed.data.canManageCertificates;
    if (parsed.data.canAccessProjects !== undefined) updateData.canAccessProjects = parsed.data.canAccessProjects;
    if (parsed.data.canAccessAdmin !== undefined) updateData.canAccessAdmin = parsed.data.canAccessAdmin;
    if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl || null;
  } else {
    if (parsed.data.fullName !== undefined) updateData.fullName = parsed.data.fullName;
    if (parsed.data.email) updateData.email = parsed.data.email;
    if (parsed.data.photoUrl !== undefined) updateData.photoUrl = parsed.data.photoUrl || null;
  }

  // Password changes require the current password (re-authentication) and are
  // only permitted on the caller's own account.
  if (parsed.data.password) {
    if (!isSelf) {
      res.status(403).json({ error: "sorry you dont have permission to access this resource" });
      return;
    }
    const currentPassword = parsed.data.currentPassword;
    if (!currentPassword) {
      res.status(400).json({ error: "currentPassword is required to change your password" });
      return;
    }
    const fbAuth = getFirebaseAuth();
    if (!fbAuth) {
      res.status(503).json({ error: "Firebase Auth not configured" });
      return;
    }
    try {
      const verified = await verifyPassword(existing.email || existing.username, currentPassword);
      if (!verified) {
        res.status(401).json({ error: "Current password is incorrect" });
        return;
      }
      await fbAuth.updateUser(existing.uid, { password: parsed.data.password });
    } catch (err: any) {
      res.status(400).json({ error: err.message || "Failed to update password" });
      return;
    }
  }
  await updateDoc("users", docId, updateData);
  emitChange("user", "updated", docId);
  const updated = await getDoc<UserDoc>("users", docId);
  res.json(mapUser(updated!));
});

router.delete("/users/:id", requireRole("admin", "ADMIN", "IT"), async (req, res): Promise<void> => {
  const id = Array.isArray(req.params.id) ? req.params.id[0] : req.params.id;
  const resolved = await resolveUser(id);
  if (!resolved) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  const { user: existing, docId } = resolved;
  try {
    const firebaseAuth = getFirebaseAuth();
    if (firebaseAuth) await firebaseAuth.deleteUser(existing.uid);
  } catch { }
  await deleteDoc("users", docId);
  emitChange("user", "deleted", docId);
  res.sendStatus(204);
});

export default router;