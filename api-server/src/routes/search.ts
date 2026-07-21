import { Router, type IRouter } from "express";
import { requireAuth } from "../middlewares/auth";
import {
  getAll,
  type ContractDoc, type CertificateDoc, type ProjectDoc, type UserDoc,
} from "../lib/firebase-db";

const router: IRouter = Router();

router.use(requireAuth);

router.get("/search", async (req, res): Promise<void> => {
  const q = ((req.query.q as string) || "").trim().toLowerCase();
  if (!q) { res.json({ contracts: [], certificates: [], projects: [], users: [] }); return; }

  const [contracts, certificates, projects, users] = await Promise.all([
    getAll<ContractDoc>("contracts"),
    getAll<CertificateDoc>("certificates"),
    getAll<ProjectDoc>("projects"),
    getAll<UserDoc>("users"),
  ]);

  res.json({
    contracts: contracts.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.contractNumber.toLowerCase().includes(q) ||
      c.clientName.toLowerCase().includes(q)
    ).slice(0, 5).map(c => ({ id: c.id, title: c.title, subtitle: c.contractNumber })),
    certificates: certificates.filter(c =>
      c.title.toLowerCase().includes(q) ||
      c.recipientName.toLowerCase().includes(q) ||
      (c.certificateNumber || "").toLowerCase().includes(q)
    ).slice(0, 5).map(c => ({ id: c.id, title: c.title, subtitle: c.recipientName })),
    projects: projects.filter(p =>
      p.title.toLowerCase().includes(q) ||
      (p.clientName || "").toLowerCase().includes(q) ||
      (p.projectManager || "").toLowerCase().includes(q)
    ).slice(0, 5).map(p => ({ id: p.id, title: p.title, subtitle: p.clientName || "" })),
    users: users.filter(u =>
      u.username.toLowerCase().includes(q) ||
      u.email.toLowerCase().includes(q) ||
      (u.fullName || "").toLowerCase().includes(q)
    ).slice(0, 5).map(u => ({ id: u.id, title: u.fullName || u.username, subtitle: u.email })),
  });
});

export default router;
