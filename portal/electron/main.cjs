const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const path = require("path");
const { spawn } = require("child_process");
const { startServer } = require("./server.cjs");
const { startDetectServer, stopDetectServer } = require("./detect-server.cjs");
const { initUpdater, stopUpdater, registerUpdaterIpc } = require("./updater.cjs");
const fs = require("fs");

const isDev = process.env.NODE_ENV === "development";
const DEV_SERVER_URL = "http://localhost:5173";
const API_PORT = process.env.PORT || "5000";

// When this env var is set, the packaged (installed) app loads the Vite dev
// server instead of the bundled build, so source edits hot-reload live without
// rebuilding. Usage: set JMCS_DEV_URL=http://localhost:5173 and launch the app.
const DEV_URL_OVERRIDE = process.env.JMCS_DEV_URL || "";

let apiProcess = null;
let serverInstance = null;

const PROTOCOL = "jmcs";

// Register the custom protocol so `jmcs://open` launches this app.
if (process.defaultApp) {
  if (process.argv.length >= 2) {
    app.setAsDefaultProtocolClient(PROTOCOL, process.execPath, [path.resolve(process.argv[1])]);
  }
} else {
  app.setAsDefaultProtocolClient(PROTOCOL);
}

// Ensure a single running instance; a second launch (e.g. via protocol link)
// is forwarded to the primary instance.
if (!app.requestSingleInstanceLock()) {
  app.quit();
}

function handleProtocol(url) {
  if (typeof url !== "string" || !url.startsWith(`${PROTOCOL}://`)) return;
  // Only accept known, safe actions. Ignore anything unexpected to avoid
  // handling attacker-controlled deep links.
  const action = url.slice(`${PROTOCOL}://`.length).split("?")[0];
  const ALLOWED_ACTIONS = new Set(["open", "focus", ""]);
  if (!ALLOWED_ACTIONS.has(action)) {
    console.warn("[electron] Ignored unknown protocol action:", action);
    return;
  }
  console.log("[electron] Protocol URL:", url);
  const wins = BrowserWindow.getAllWindows();
  if (wins.length > 0) {
    wins[0].show();
    wins[0].focus();
  } else {
    createWindow(isDev ? DEV_SERVER_URL : `http://localhost:${API_PORT}`);
  }
}

// macOS launches the app via the protocol URL.
app.on("open-url", (event, url) => {
  event.preventDefault();
  handleProtocol(url);
});

// Windows/Linux: clicking `jmcs://open` starts a second instance that we
// forward to the already-running one.
app.on("second-instance", (event, argv) => {
  const url = argv.find((a) => a.startsWith(`${PROTOCOL}://`));
  if (url) handleProtocol(url);
  const win = BrowserWindow.getAllWindows()[0];
  if (win) win.show();
});

function createWindow(url) {
  const win = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    icon: isDev
      ? path.join(__dirname, "..", "public", "logo.png")
      : path.join(__dirname, "..", "dist-website", "logo.png"),
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
    show: false,
  });

  win.loadURL(url);

  if (isDev) {
    win.webContents.openDevTools();
  }

  win.once("ready-to-show", () => {
    win.show();
  });

  return win;
}

function registerPrintIpc() {
  ipcMain.handle("print:open", (event) => {
    const win = BrowserWindow.fromWebContents(event.sender);
    if (!win) return { ok: false, error: "No window" };
    win.webContents.print({ printBackground: true });
    return { ok: true };
  });
}

function findApiServerPath() {
  if (isDev) {
    return path.join(__dirname, "..", "..", "api-server", "dist", "index.mjs");
  }
  return path.join(process.resourcesPath, "api-server", "index.mjs");
}

function findApiServerDir() {
  if (isDev) {
    return path.join(__dirname, "..", "..", "api-server");
  }
  return path.join(process.resourcesPath, "api-server");
}

function startApiServer() {
  return new Promise((resolve, reject) => {
    const entry = findApiServerPath();
    const cwd = findApiServerDir();

    if (!fs.existsSync(entry)) {
      reject(new Error(`API server not found at ${entry}. Run the build first.`));
      return;
    }

    const env = {
      ...process.env,
      NODE_ENV: "production",
      PORT: API_PORT,
    };

    // Set NODE_PATH so Node can resolve externalized packages (firebase-admin, etc.)
    const nodeModulesPath = path.join(cwd, "node_modules");
    if (fs.existsSync(nodeModulesPath)) {
      env.NODE_PATH = env.NODE_PATH
        ? `${nodeModulesPath};${env.NODE_PATH}`
        : nodeModulesPath;
    }

    const envFile = path.join(cwd, ".env");
    if (fs.existsSync(envFile)) {
      const dotenvContent = fs.readFileSync(envFile, "utf-8");
      for (const line of dotenvContent.split("\n")) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith("#")) continue;
        const eqIdx = trimmed.indexOf("=");
        if (eqIdx === -1) continue;
        const key = trimmed.slice(0, eqIdx).trim();
        const value = trimmed.slice(eqIdx + 1).trim();
        if (key && value) env[key] = value;
      }
    }

    // Use ELECTRON_RUN_AS_NODE=1 so Electron runs the script as Node.js, not as an Electron app
    const spawnEnv = {
      ...env,
      ELECTRON_RUN_AS_NODE: "1",
    };

    apiProcess = spawn(process.execPath, [entry], {
      cwd,
      env: spawnEnv,
      stdio: ["ignore", "pipe", "pipe"],
    });

    let started = false;
    let stderrBuf = "";

    apiProcess.stdout.on("data", (data) => {
      const text = data.toString();
      process.stdout.write(`[api-server] ${text}`);
      if (!started && text.includes("Server listening")) {
        started = true;
        resolve();
      }
    });

    apiProcess.stderr.on("data", (data) => {
      const text = data.toString();
      stderrBuf += text;
      process.stderr.write(`[api-server:err] ${text}`);
    });

    apiProcess.on("error", (err) => {
      if (!started) reject(err);
    });

    apiProcess.on("exit", (code) => {
      if (!started) {
        const detail = stderrBuf.trim() ? `\n${stderrBuf.trim().slice(0, 1000)}` : "";
        reject(new Error(`API server exited with code ${code}.${detail}`));
      }
    });
  });
}

function stopApiServer() {
  if (apiProcess) {
    apiProcess.kill();
    apiProcess = null;
  }
  if (serverInstance) {
    serverInstance.close();
    serverInstance = null;
  }
  stopDetectServer();
  stopUpdater();
}

app.whenReady().then(async () => {
  // Register updater IPC handlers early so the renderer can call
  // invoke("updater:getState") without a race condition.
  try {
    registerUpdaterIpc();
    registerPrintIpc();
  } catch (err) {
    console.error("[electron] IPC registration failed:", err);
  }

  // Loopback server that lets the web portal verify this desktop app is
  // installed and running on the user's machine.
  try {
    await startDetectServer(app.getVersion());
  } catch (err) {
    console.error("[electron] detect server failed to start:", err);
  }

  if (isDev) {
    console.log("[electron] Running in development mode");
    console.log(`[electron] Loading from: ${DEV_SERVER_URL}`);
    const win = createWindow(DEV_SERVER_URL);
    try {
      initUpdater(win);
    } catch (err) {
      console.error("[electron] updater failed to initialize:", err);
    }
  } else {
    try {
      // Dev-override: skip the bundled build and load the live Vite dev server
      // so source changes show up immediately in the installed app.
      if (DEV_URL_OVERRIDE) {
        console.log(`[electron] Dev override: loading from ${DEV_URL_OVERRIDE}`);
        createWindow(DEV_URL_OVERRIDE);
        return;
      }

      console.log("[electron] Starting API server...");
      await startApiServer();
      const appUrl = `http://localhost:${API_PORT}`;
      console.log(`[electron] Application ready at ${appUrl}`);
      const win = createWindow(appUrl);

      // Auto-updates only apply to packaged/production builds.
      try {
        initUpdater(win);
      } catch (err) {
        console.error("[electron] updater failed to initialize:", err);
      }
    } catch (err) {
      console.error("[electron] Failed to start:", err);
      dialog.showErrorBox(
        "Startup Error",
        `The application failed to start:\n\n${err.message}\n\nMake sure you've run 'npm run electron:package' successfully.`
      );
      app.quit();
    }
  }
});

app.on("window-all-closed", () => {
  stopApiServer();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) {
    createWindow(
      isDev ? DEV_SERVER_URL : DEV_URL_OVERRIDE || `http://localhost:${API_PORT}`
    );
  }
});

app.on("before-quit", () => {
  stopApiServer();
});
