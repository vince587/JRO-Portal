const { contextBridge, ipcRenderer } = require("electron");

const UPDATER_EVENT = "updater:event";

contextBridge.exposeInMainWorld("electronAPI", {
  platform: process.platform,
  isDesktopApp: true,
  print: () => ipcRenderer.invoke("print:open"),
  updater: {
    getState: () => ipcRenderer.invoke("updater:getState"),
    check: () => ipcRenderer.invoke("updater:check"),
    download: () => ipcRenderer.invoke("updater:download"),
    install: () => ipcRenderer.invoke("updater:install"),
    // Subscribe to main-process updater events. Returns an unsubscribe fn.
    onEvent: (callback) => {
      const listener = (_event, data) => callback(data);
      ipcRenderer.on(UPDATER_EVENT, listener);
      return () => ipcRenderer.removeListener(UPDATER_EVENT, listener);
    },
  },
});
