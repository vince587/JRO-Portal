import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getAll, queryWhere,
  type CertificateDoc, type ContractDoc, type NotificationDoc,
} from "../lib/firebase-db";

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

function daysUntil(dateStr: string): number {
  const target = new Date(dateStr);
  const now = new Date();
  const diff = target.getTime() - now.getTime();
  return Math.ceil(diff / (1000 * 60 * 60 * 24));
}

router.get("/notifications", async (_req, res): Promise<void> => {
  const [certs, contracts] = await Promise.all([
    getAll<CertificateDoc>("certificates"),
    getAll<ContractDoc>("contracts"),
  ]);

  const notifications: Array<{
    id: string;
    type: "certificate_expiring" | "contract_ending";
    title: string;
    description: string;
    entityId: string;
    severity: "warning" | "danger";
    link: string;
    daysUntil: number;
  }> = [];

  for (const cert of certs) {
    const status = getCertStatus(cert.expiryDate);
    if (status === "expiring_soon") {
      const days = daysUntil(cert.expiryDate);
      notifications.push({
        id: `cert-${cert.id}`,
        type: "certificate_expiring",
        title: "Certificate Expiring Soon",
        description: `"${cert.title}" for ${cert.recipientName} expires in ${days} day${days === 1 ? "" : "s"}`,
        entityId: cert.id!,
        severity: days <= 7 ? "danger" : "warning",
        link: `/certificates/${cert.id}`,
        daysUntil: days,
      });
    } else if (status === "expired") {
      notifications.push({
        id: `cert-expired-${cert.id}`,
        type: "certificate_expiring",
        title: "Certificate Expired",
        description: `"${cert.title}" for ${cert.recipientName} has expired`,
        entityId: cert.id!,
        severity: "danger",
        link: `/certificates/${cert.id}`,
        daysUntil: 0,
      });
    }
  }

  const now = new Date();
  const thirtyDaysFromNow = new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000);

  for (const contract of contracts) {
    if (contract.status !== "active" && contract.status !== "pending") continue;
    const endDate = new Date(contract.endDate);
    if (endDate > now && endDate <= thirtyDaysFromNow) {
      const days = daysUntil(contract.endDate);
      notifications.push({
        id: `contract-${contract.id}`,
        type: "contract_ending",
        title: "Contract Ending Soon",
        description: `"${contract.title}" (${contract.contractNumber}) ends in ${days} day${days === 1 ? "" : "s"}`,
        entityId: contract.id!,
        severity: days <= 7 ? "danger" : "warning",
        link: `/contracts/${contract.id}`,
        daysUntil: days,
      });
    }
  }

  notifications.sort((a, b) => a.daysUntil - b.daysUntil);

  // Merge in-app notifications (e.g., leave requests/decisions) for the current user
  try {
    const stored = await queryWhere<NotificationDoc>("notifications", "userId", "==", _req.currentUser!.id, "createdAt", "desc");
    for (const n of stored) {
      notifications.push({
        id: `ntf-${n.id}`,
        type: (n.type === "certificate_expiring" || n.type === "contract_ending" ? n.type : "certificate_expiring") as "certificate_expiring" | "contract_ending",
        title: n.title,
        description: n.description,
        entityId: n.entityId || "",
        severity: n.severity === "danger" ? "danger" : "warning",
        link: n.link,
        daysUntil: 0,
      });
    }
  } catch (e) {
    // notifications collection may not exist yet; ignore
  }

  // In-app notifications are displayed in the UI notification bell.
  // Note: Automated email blasting on certificate expiration was removed to avoid consuming Resend/SMTP quota limits.

  res.json(notifications);
});

export default router;
