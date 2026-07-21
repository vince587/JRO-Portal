import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "../../lib/api-zod/index.js";
import { publicOrigin, publicViewerUrl } from "../lib/mailer.js";

const router: IRouter = Router();

router.get("/healthz", (_req, res) => {
  const data = HealthCheckResponse.parse({ status: "ok" });
  res.json(data);
});

// Public, unauthenticated: exposes the canonical public base URL used for
// participant/external share links so the frontend builds them from a trusted
// server value instead of window.location.origin (which can be wrong on dev,
// staging, or behind a proxy). `publicRedirectUrl` is where anonymous/public
// visitors who land on non-material pages (or invalid share links) are sent.
// `publicViewerUrl` is the standalone training-materials viewer base used for
// participant share links (?token=...).
router.get("/config", (req, res) => {
  res.json({
    publicUrl: publicOrigin(req) || "",
    publicViewerUrl: publicViewerUrl(),
    publicRedirectUrl: process.env.PUBLIC_REDIRECT_URL || "https://materials.jro-jmcs.com",
  });
});

export default router;
