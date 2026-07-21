const express = require("express");
const { createProxyMiddleware } = require("http-proxy-middleware");
const path = require("path");
const fs = require("fs");

const PORT = process.env.PORT ? Number(process.env.PORT) : 0;
const API_TARGET = process.env.VITE_API_URL || "http://localhost:5000";
const STATIC_DIR = path.join(__dirname, "..", "dist-website");
const INDEX_HTML = path.join(STATIC_DIR, "index.html");

function startServer() {
  return new Promise((resolve, reject) => {
    if (!fs.existsSync(INDEX_HTML)) {
      console.error(`[server] Build not found at ${INDEX_HTML}. Run "npm run build" first.`);
      reject(new Error(`Build not found at ${INDEX_HTML}`));
      return;
    }

    const app = express();

    app.use(
      "/api",
      createProxyMiddleware({
        target: API_TARGET,
        changeOrigin: true,
        proxyTimeout: 5000,
        timeout: 5000,
        on: {
          error: (err, req, res) => {
            console.error(`[server] proxy error: ${err.message}`);
            if (!res.headersSent) {
              res.status(502).json({ error: "Backend server is not running" });
            }
          },
        },
      }),
    );

    app.use(express.static(STATIC_DIR));

    app.get("*", (req, res) => {
      res.sendFile(INDEX_HTML);
    });

    const server = app.listen(PORT, () => {
      const addr = server.address();
      const port = typeof addr === "object" ? addr.port : PORT;
      console.log(`[server] static: ${STATIC_DIR}`);
      console.log(`[server] proxy /api -> ${API_TARGET}`);
      console.log(`[server] listening on http://localhost:${port}`);
      resolve({ server, port });
    });

    server.on("error", reject);
  });
}

module.exports = { startServer };
