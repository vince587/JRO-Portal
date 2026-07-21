import { Router, type IRouter, type Request, type Response } from "express";
import { requireAuth } from "../middlewares/auth";

type SseClient = {
  id: number;
  res: Response;
};

let clientId = 0;
const clients: SseClient[] = [];

// Guard against connection exhaustion: cap total concurrent SSE clients.
const MAX_SSE_CLIENTS = Number(process.env.MAX_SSE_CLIENTS || 200);

function broadcast(event: string, data: object) {
  const message = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  for (const client of clients) {
    try {
      client.res.write(message);
    } catch {
      clients.splice(clients.indexOf(client), 1);
    }
  }
}

export function emitChange(entity: string, action: string, id?: string) {
  broadcast("data-changed", { entity, action, id, timestamp: Date.now() });
}

const router: IRouter = Router();

router.use(requireAuth);

router.get("/events/stream", (req: Request, res: Response) => {
  if (clients.length >= MAX_SSE_CLIENTS) {
    res.status(503).json({ error: "Too many live connections" });
    return;
  }
  res.writeHead(200, {
    "Content-Type": "text/event-stream",
    "Cache-Control": "no-cache",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });

  res.write("event: connected\ndata: {}\n\n");

  const id = ++clientId;
  const client: SseClient = { id, res };
  clients.push(client);

  const heartbeat = setInterval(() => {
    try { res.write(":heartbeat\n\n"); } catch { clearInterval(heartbeat); }
  }, 30000);

  req.on("close", () => {
    clearInterval(heartbeat);
    const idx = clients.indexOf(client);
    if (idx !== -1) clients.splice(idx, 1);
  });
});

export default router;