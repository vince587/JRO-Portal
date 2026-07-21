import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getAll,
  type UserDoc, type ContractDoc, type CertificateDoc,
  type ProjectDoc, type EventDoc, type ActivityDoc,
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

router.get("/dashboard/stats", async (req, res): Promise<void> => {
  const [contracts, projects, certs, users, events] = await Promise.all([
    getAll<ContractDoc>("contracts"),
    getAll<ProjectDoc>("projects"),
    getAll<CertificateDoc>("certificates"),
    getAll<UserDoc>("users"),
    getAll<EventDoc>("events"),
  ]);

  const today = new Date();
  const thirtyDays = new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000);
  const sixtyDays = new Date(today.getTime() + 60 * 24 * 60 * 60 * 1000);
  const ninetyDays = new Date(today.getTime() + 90 * 24 * 60 * 60 * 1000);

  const upcomingEvents = events.filter(e => new Date(e.startDate) >= today);

  const totalContractValue = contracts.reduce((sum, c) => sum + Number(c.value), 0);
  const jmcsValue = contracts.filter(c => c.type === "JMCS").reduce((sum, c) => sum + Number(c.value), 0);
  const sisValue = contracts.filter(c => c.type === "SIS").reduce((sum, c) => sum + Number(c.value), 0);

  const certExpiring30 = certs.filter(c => {
    const s = getCertStatus(c.expiryDate);
    return s === "expiring_soon" || s === "expired";
  }).length;
  const certExpiring60 = certs.filter(c => {
    const expiry = new Date(c.expiryDate);
    return expiry <= sixtyDays;
  }).length;
  const certExpiring90 = certs.filter(c => {
    const expiry = new Date(c.expiryDate);
    return expiry <= ninetyDays;
  }).length;

  const contractsEnding30 = contracts.filter(c =>
    (c.status === "active" || c.status === "pending") &&
    new Date(c.endDate) > today && new Date(c.endDate) <= thirtyDays
  ).length;
  const contractsEnding60 = contracts.filter(c =>
    (c.status === "active" || c.status === "pending") &&
    new Date(c.endDate) > today && new Date(c.endDate) <= sixtyDays
  ).length;
  const contractsEnding90 = contracts.filter(c =>
    (c.status === "active" || c.status === "pending") &&
    new Date(c.endDate) > today && new Date(c.endDate) <= ninetyDays
  ).length;

  const projectsOnTrack = projects.filter(p => p.status === "active" || p.status === "planning").length;
  const projectsDelayed = projects.filter(p => {
    if (p.status !== "active") return false;
    if (p.endDate && new Date(p.endDate) < today) return true;
    return false;
  }).length;

  res.json({
    totalContracts: contracts.length,
    activeContracts: contracts.filter(c => c.status === "active").length,
    totalProjects: projects.length,
    activeProjects: projects.filter(p => p.status === "active").length,
    totalCertificates: certs.length,
    expiringCertificates: certs.filter(c => getCertStatus(c.expiryDate) === "expiring_soon").length,
    upcomingEvents: upcomingEvents.length,
    totalUsers: users.length,
    totalContractValue,
    jmcsContractValue: jmcsValue,
    sisContractValue: sisValue,
    certExpiring30,
    certExpiring60,
    certExpiring90,
    contractsEnding30,
    contractsEnding60,
    contractsEnding90,
    projectsOnTrack,
    projectsDelayed,
  });
});

router.get("/dashboard/recent-activity", async (req, res): Promise<void> => {
  const rows = await getAll<ActivityDoc>("activity");
  const sorted = rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
  const recent = sorted.slice(0, 20);
  res.json(recent.map(a => ({
    id: a.id,
    type: a.type,
    description: a.description,
    timestamp: a.timestamp,
    entityId: a.entityId,
  })));
});

router.get("/dashboard/activity-log", async (req, res): Promise<void> => {
  const page = Math.max(1, parseInt(req.query.page as string) || 1);
  const limit = Math.min(100, Math.max(1, parseInt(req.query.limit as string) || 50));
  const type = req.query.type as string;
  const search = req.query.search as string;

  let rows = await getAll<ActivityDoc>("activity");

  if (type) {
    rows = rows.filter(a => a.type === type);
  }

  let filtered = rows.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

  if (search) {
    const q = search.toLowerCase();
    filtered = filtered.filter(a => a.description.toLowerCase().includes(q));
  }

  const total = filtered.length;
  const offset = (page - 1) * limit;
  const items = filtered.slice(offset, offset + limit);

  res.json({
    items: items.map(a => ({
      id: a.id,
      type: a.type,
      description: a.description,
      timestamp: a.timestamp,
      entityId: a.entityId,
    })),
    total,
    page,
    limit,
    totalPages: Math.ceil(total / limit),
  });
});

export default router;
