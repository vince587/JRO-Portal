import { Router, type IRouter } from "express";
import admin from "firebase-admin";
import { getDoc, getDocByField, createDoc, updateDoc, type UserDoc } from "../lib/firebase-db";
import { verifyPassword } from "../lib/firebase-auth";
import { normalizeRole } from "../middlewares/auth";
import { logger } from "../lib/logger";

let firebaseAuth: admin.auth.Auth | null = null;
try {
  let credential: admin.credential.Credential;
  const serviceAccountKey = process.env.FIREBASE_SERVICE_ACCOUNT_KEY;
  if (serviceAccountKey) {
    credential = admin.credential.cert(JSON.parse(serviceAccountKey));
  } else {
    credential = admin.credential.applicationDefault();
  }
  admin.initializeApp({
    credential,
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  firebaseAuth = admin.auth();
  logger.info("Firebase Admin initialized");
} catch (e) {
  logger.warn({ err: e }, "Firebase Admin not configured");
}

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
    canAccessDevelopers: u.canAccessDevelopers ?? false,
    photoUrl: u.photoUrl ?? null,
    mustChangePassword: u.mustChangePassword ?? false,
    createdAt: u.createdAt,
  };
}

router.post("/auth/logout", async (req, res): Promise<void> => {
  res.clearCookie("jmcs_auth");
  res.json({ ok: true });
});

router.post("/auth/change-password", async (req, res): Promise<void> => {
  const cookie = req.signedCookies?.jmcs_auth as string | undefined;
  if (!cookie) { res.status(401).json({ error: "Not authenticated" }); return; }
  const decoded = Buffer.from(cookie, "base64").toString("utf-8");
  const [uid] = decoded.split(":");
  const { currentPassword, newPassword } = req.body as { currentPassword?: string; newPassword?: string };
  if (!newPassword) {
    res.status(400).json({ error: "newPassword is required" }); return;
  }
  if (newPassword.length < 6) {
    res.status(400).json({ error: "Password must be at least 6 characters" }); return;
  }
  const user = (await getDoc<UserDoc>("users", uid)) ?? (await getDocByField<UserDoc>("users", "uid", uid));
  if (!user) { res.status(404).json({ error: "User not found" }); return; }

  if (!user.mustChangePassword) {
    if (!currentPassword) {
      res.status(400).json({ error: "currentPassword is required to change your password" });
      return;
    }
    const ok = await verifyPassword(user.email || user.username, currentPassword);
    if (!ok) {
      res.status(401).json({ error: "Current password is incorrect" });
      return;
    }
  }

  try {
    if (!firebaseAuth) { res.status(503).json({ error: "Firebase Auth not configured" }); return; }
    const userRecord = await firebaseAuth.getUser(uid);
    if (!userRecord) { res.status(404).json({ error: "User not found in Firebase Auth" }); return; }
    await firebaseAuth.updateUser(uid, { password: newPassword });
  } catch (err) {
    logger.error({ err }, "Firebase password change error");
    res.status(500).json({ error: "Failed to change password" }); return;
  }

  const docId = user.id ?? (await getDocByField<UserDoc>("users", "uid", uid))?.id;
  if (docId) {
    await updateDoc("users", docId, { mustChangePassword: false, updatedAt: new Date().toISOString() });
  }

  await createDoc("activity", {
    type: "user",
    description: `User "${user.username}" changed their password`,
    entityId: uid,
    timestamp: new Date().toISOString(),
  });
  res.json({ ok: true });
});

router.post("/auth/firebase", async (req, res): Promise<void> => {
  if (!firebaseAuth) {
    res.status(503).json({ error: "Firebase Auth not configured on server" });
    return;
  }
  const { idToken, rememberMe } = req.body as { idToken?: string; rememberMe?: boolean };
  if (!idToken) {
    res.status(400).json({ error: "Firebase ID token is required" });
    return;
  }
  try {
    const cookieMaxAge = rememberMe ? 1000 * 60 * 60 * 24 * 30 : undefined;
    const decoded = await firebaseAuth.verifyIdToken(idToken);
    const email = decoded.email;
    const name = decoded.name || email?.split("@")[0] || "Firebase User";
    const uid = decoded.uid;
    if (!email) {
      res.status(400).json({ error: "Firebase account must have an email" });
      return;
    }

    const existingUser = (await getDoc<UserDoc>("users", uid)) ?? (await getDocByField<UserDoc>("users", "uid", uid));
    if (existingUser) {
      if (!existingUser.isActive) {
        res.status(403).json({ error: "Account is disabled" });
        return;
      }
      const token = Buffer.from(`${existingUser.uid}:${existingUser.username}`).toString("base64");
      res.cookie("jmcs_auth", token, {
        httpOnly: true,
        signed: true,
        ...(cookieMaxAge ? { maxAge: cookieMaxAge } : {}),
        sameSite: "lax",
      });
      res.json({ user: mapUser(existingUser) });
      return;
    }

    const username = email.split("@")[0];
    const now = new Date().toISOString();
    const newUser = await createDoc("users", {
      uid,
      username,
      email,
      fullName: name,
      role: "staff",
      roles: ["staff"],
      department: null,
      isActive: true,
      canAccessSis: false,
      canAccessJmcs: true,
      canEditCalendar: false,
      canEditTrainingProposal: false,
      canManageContracts: false,
      canManageCertificates: false,
      canAccessProjects: false,
      canAccessAdmin: false,
      photoUrl: null,
      createdAt: now,
      updatedAt: now,
    }, uid);

    await createDoc("activity", {
      type: "user",
      description: `User "${newUser.username}" registered via Firebase`,
      entityId: uid,
      timestamp: now,
    });

    const token = Buffer.from(`${uid}:${username}`).toString("base64");
    res.cookie("jmcs_auth", token, {
      httpOnly: true,
      signed: true,
      ...(cookieMaxAge ? { maxAge: cookieMaxAge } : {}),
      sameSite: "lax",
    });
    res.json({ user: mapUser({ ...newUser, uid }) });
  } catch (err: any) {
    logger.error({ err }, "Firebase auth error");
    console.error("[auth/firebase] verifyIdToken FAILED:");
    console.error("  code:", err?.code);
    console.error("  message:", err?.message);
    console.error("  errorInfo:", err?.errorInfo);
    res.status(401).json({ error: "Invalid Firebase token" });
  }
});

router.get("/auth/me", async (req, res): Promise<void> => {
  const cookie = req.signedCookies?.jmcs_auth as string | undefined;
  if (!cookie) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  try {
    const decoded = Buffer.from(cookie, "base64").toString("utf-8");
    const [uid] = decoded.split(":");
    const user = (await getDoc<UserDoc>("users", uid)) ?? (await getDocByField<UserDoc>("users", "uid", uid));
    if (!user || !user.isActive) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    res.json(mapUser(user));
  } catch (err) {
    logger.error({ err }, "Error in /auth/me");
    res.status(401).json({ error: "Not authenticated" });
  }
});

export default router;