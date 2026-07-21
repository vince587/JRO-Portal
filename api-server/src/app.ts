import express, { type Express, type Request, type Response, type NextFunction } from "express";
import cors from "cors";
import pinoHttp from "pino-http";
import cookieParser from "cookie-parser";
import path from "path";
import { fileURLToPath } from "url";
import router from "./routes";
import { loadUser } from "./middlewares/auth";
import { logger } from "./lib/logger";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const app: Express = express();

// Session cookies are signed with SESSION_SECRET. In production a strong,
// unique secret MUST be set or the server refuses to start (a default secret
// would let anyone forge session cookies).
const SESSION_SECRET = process.env.SESSION_SECRET;
if (process.env.NODE_ENV === "production" && !SESSION_SECRET) {
  logger.error("SESSION_SECRET is not set — refusing to start in production.");
  process.exit(1);
}
const cookieSecret = SESSION_SECRET || "dev-only-insecure-secret-change-me";

// Only allow the desktop loopback origin and any explicitly configured web
// origins. Reflecting arbitrary origins with credentials enabled is unsafe.
const resolveCorsOrigin = (
  origin: string | undefined,
  callback: (err: Error | null, allow?: boolean | string) => void
) => {
  const allowed = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return callback(null, false); // no cross-origin by default
  if (origin && allowed.includes(origin)) return callback(null, origin);
  return callback(null, false);
};

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
app.use(cors({ origin: resolveCorsOrigin, credentials: true }));
app.use(cookieParser(cookieSecret));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Block requests with a non-allowed Origin on state-changing methods (CSRF
// defense) when CORS_ORIGINS is configured.
app.use((req, res, next) => {
  if (["GET", "HEAD", "OPTIONS"].includes(req.method)) return next();
  const allowed = (process.env.CORS_ORIGINS || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  if (allowed.length === 0) return next();
  const origin = req.headers.origin;
  if (!origin || allowed.includes(origin)) return next();
  res.status(403).json({ error: "Cross-origin request not allowed" });
});

app.use("/api", loadUser, router);

if (process.env.NODE_ENV === "production") {
  const staticDir = path.join(__dirname, "public");
  app.use(express.static(staticDir));
  app.use((_req, res) => {
    res.sendFile(path.join(staticDir, "index.html"));
  });
}

export default app;
