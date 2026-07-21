const http = require("http");

// Fixed loopback port the web portal probes to verify the desktop app is
// actually installed AND running on this machine. Must match DETECT_PORT in
// src/lib/desktop-guard.ts.
const DETECT_PORT = 43117;

let detectServer = null;

function startDetectServer(version) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      res.setHeader("Access-Control-Allow-Origin", "*");
      res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
      res.setHeader("Access-Control-Allow-Headers", "*");
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate");
      res.setHeader("Content-Type", "application/json");

      if (req.method === "OPTIONS") {
        res.statusCode = 204;
        res.end();
        return;
      }

      res.statusCode = 200;
      res.end(
        JSON.stringify({
          installed: true,
          app: "jmcs-portal",
          version: version || "unknown",
          ts: Date.now(),
        }),
      );
    });

    server.on("error", (err) => {
      // EADDRINUSE almost always means another copy of the desktop app is
      // already running and holding the port — which still means "installed".
      console.error(`[detect-server] ${err.message}`);
      resolve(null);
    });

    server.listen(DETECT_PORT, "127.0.0.1", () => {
      detectServer = server;
      console.log(`[detect-server] listening on http://127.0.0.1:${DETECT_PORT}`);
      resolve(server);
    });
  });
}

function stopDetectServer() {
  if (detectServer) {
    detectServer.close();
    detectServer = null;
  }
}

module.exports = { startDetectServer, stopDetectServer, DETECT_PORT };
