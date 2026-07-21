const { autoUpdater } = require("electron-updater");
const { ipcMain } = require("electron");

// Channel names shared with the renderer (see preload.cjs). Main -> renderer
// events are pushed on UPDATER_EVENT; renderer -> main requests use the
// `updater:*` invoke channels below.
const UPDATER_EVENT = "updater:event";

// How often to re-check for updates while the app stays open, so a version
// published after launch still pops on the user's screen without a restart.
const CHECK_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes

let mainWindow = null;
let initialized = false;
let checkTimer = null;
// Last event pushed to the renderer. Cached so the UI can hydrate the current
// state the moment it mounts (avoids missing an "available" event fired before
// the renderer subscribed).
let lastEvent = null;

function send(status, payload) {
  lastEvent = { status, ...payload };
  if (mainWindow && !mainWindow.isDestroyed()) {
    mainWindow.webContents.send(UPDATER_EVENT, lastEvent);
  }
}

// Wire electron-updater events -> renderer so the UpdateNotifier component can
// reflect live state (available, progress, downloaded, error).
function registerAutoUpdaterEvents() {
  autoUpdater.on("checking-for-update", () => {
    send("checking");
  });

  autoUpdater.on("update-available", (info) => {
    send("available", { version: info.version, releaseDate: info.releaseDate });
  });

  autoUpdater.on("update-not-available", (info) => {
    send("not-available", { version: info && info.version });
  });

  autoUpdater.on("error", (err) => {
    send("error", { message: err == null ? "unknown" : (err.message || String(err)) });
  });

  autoUpdater.on("download-progress", (progress) => {
    send("downloading", {
      percent: progress.percent,
      transferred: progress.transferred,
      total: progress.total,
      bytesPerSecond: progress.bytesPerSecond,
    });
  });

  autoUpdater.on("update-downloaded", (info) => {
    send("downloaded", { version: info.version });
  });
}

// IPC handlers the renderer invokes.
function registerIpcHandlers() {
  // Called by the renderer on mount to hydrate any state it may have missed
  // (e.g. an update was already detected before the UI subscribed).
  ipcMain.handle("updater:getState", () => lastEvent);

  ipcMain.handle("updater:check", async () => {
    try {
      const result = await autoUpdater.checkForUpdates();
      return { ok: true, version: result && result.updateInfo && result.updateInfo.version };
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle("updater:download", async () => {
    try {
      await autoUpdater.downloadUpdate();
      return { ok: true };
    } catch (err) {
      return { ok: false, message: err.message || String(err) };
    }
  });

  ipcMain.handle("updater:install", () => {
    // Quit and install. `isSilent=false`, `isForceRunAfter=true`.
    autoUpdater.quitAndInstall(false, true);
    return { ok: true };
  });
}

// Register IPC handlers early (before the window loads) so the renderer can
// call invoke("updater:getState") without a race condition.
function registerUpdaterIpc() {
  if (initialized) return;
  initialized = true;

  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;
  autoUpdater.logger = console;

  registerAutoUpdaterEvents();
  registerIpcHandlers();
}

function initUpdater(win) {
  mainWindow = win;

  if (!initialized) {
    registerUpdaterIpc();
  }

  const runCheck = () => {
    autoUpdater.checkForUpdates().catch((err) => {
      console.error("[updater] check failed:", err && err.message);
    });
  };

  // Immediate check on launch...
  runCheck();

  // ...and re-check on an interval so updates published while the app is open
  // pop as soon as they're detected, no restart required.
  if (checkTimer) clearInterval(checkTimer);
  checkTimer = setInterval(runCheck, CHECK_INTERVAL_MS);
}

function stopUpdater() {
  if (checkTimer) {
    clearInterval(checkTimer);
    checkTimer = null;
  }
}

module.exports = { initUpdater, stopUpdater, registerUpdaterIpc, UPDATER_EVENT };
