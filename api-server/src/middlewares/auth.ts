import type { Request, Response, NextFunction } from "express";
import { getDoc, getDocByField, type UserDoc } from "../lib/firebase-db";

// Canonicalize a stored role string to a known uppercase value. Centralizing
// this avoids case-mismatch authz bugs (e.g. "IT" vs "it").
export function normalizeRole(role: string | undefined): string {
  if (!role) return "staff";
  const r = role.trim();
  if (r.toLowerCase() === "admin") return "ADMIN";
  if (r.toLowerCase() === "it") return "IT";
  if (r.toLowerCase() === "manager") return "manager";
  return r; // keep staff/other as-is
}

export function hasRole(user: { role: string; roles?: string[] }, ...roles: string[]) {
  if (roles.includes(user.role)) return true;
  if (user.roles?.some(r => roles.includes(r))) return true;
  return false;
}

declare global {
  namespace Express {
    interface Request {
      currentUser?: {
        id: string;
        username: string;
        email: string;
        role: string;
        roles?: string[];
        fullName: string | null;
        department: string | null;
        photoUrl?: string | null;
        canAccessSis: boolean;
        canAccessJmcs: boolean;
        canEditCalendar: boolean;
        canEditTrainingProposal: boolean;
        canManageContracts: boolean;
        canManageCertificates: boolean;
        canAccessProjects: boolean;
        canAccessAdmin: boolean;
      };
    }
  }
}

export async function loadUser(req: Request, _res: Response, next: NextFunction) {
  const cookie = req.signedCookies?.jmcs_auth as string | undefined;
  if (cookie) {
    try {
      const decoded = Buffer.from(cookie, "base64").toString("utf-8");
      const [uid] = decoded.split(":");
      if (uid) {
        let user = await getDoc<UserDoc>("users", uid);
        if (!user) {
          user = await getDocByField<UserDoc>("users", "uid", uid);
        }
        if (user && user.isActive) {
          req.currentUser = {
            id: user.id ?? user.uid,
            username: user.username,
            email: user.email,
            role: normalizeRole(user.role),
            roles: user.roles?.map(normalizeRole) ?? [normalizeRole(user.role)],
            fullName: user.fullName,
            department: user.department,
            canAccessSis: user.canAccessSis ?? false,
            canAccessJmcs: user.canAccessJmcs ?? false,
            canEditCalendar: user.canEditCalendar ?? false,
            canEditTrainingProposal: user.canEditTrainingProposal ?? false,
            canManageContracts: user.canManageContracts ?? false,
            canManageCertificates: user.canManageCertificates ?? false,
            canAccessProjects: user.canAccessProjects ?? false,
            canAccessAdmin: user.canAccessAdmin ?? false,
          };
        }
      }
    } catch { }
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.currentUser) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }
  next();
}

export function requireRole(...roles: string[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (!hasRole(req.currentUser, ...roles)) {
      res.status(403).json({ error: "sorry you dont have permission to access this resource" });
      return;
    }
    next();
  };
}

export function requirePermission(...permissions: (keyof NonNullable<Request["currentUser"]>)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (hasRole(req.currentUser, "admin", "ADMIN", "IT")) {
      next();
      return;
    }
    for (const perm of permissions) {
      if (!req.currentUser[perm]) {
        res.status(403).json({ error: "sorry you dont have permission to access this resource" });
        return;
      }
    }
    next();
  };
}

export function requireAnyPermission(...permissions: (keyof NonNullable<Request["currentUser"]>)[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.currentUser) {
      res.status(401).json({ error: "Not authenticated" });
      return;
    }
    if (hasRole(req.currentUser, "admin", "ADMIN", "IT")) {
      next();
      return;
    }
    const hasAny = permissions.some(p => req.currentUser![p]);
    if (!hasAny) {
      res.status(403).json({ error: "sorry you dont have permission to access this resource" });
      return;
    }
    next();
  };
}


