import { createRoot } from "react-dom/client";
import App from "./App";
import { DebugErrorBoundary } from "./lib/debug-overlay";
import "./index.css";

let fatalOverlayShown = false;

function showFatal(msg: string) {
  if (fatalOverlayShown) return;
  fatalOverlayShown = true;

  const overlay = document.createElement("div");
  overlay.id = "jmcs-fatal-error";
  overlay.style.cssText =
    "position:fixed;inset:0;z-index:999999;background:#1a1a2e;color:#ff6b6b;padding:24px;font-size:14px;font-family:monospace;white-space:pre-wrap;overflow:auto";
  overlay.textContent = "FATAL ERROR\n\n" + msg;
  document.body.appendChild(overlay);
}

window.addEventListener("error", (e) => {
  showFatal(`${e.message}\n\n${(e.error && e.error.stack) || ""}`);
});
window.addEventListener("unhandledrejection", (e) => {
  const r = (e as PromiseRejectionEvent).reason;
  showFatal(`Unhandled promise rejection:\n${r && r.stack ? r.stack : String(r)}`);
});

if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {});
  });
}

try {
  createRoot(document.getElementById("root")!).render(
    <DebugErrorBoundary>
      <App />
    </DebugErrorBoundary>
  );
} catch (err) {
  showFatal(`${(err as Error)?.message || String(err)}\n\n${(err as Error)?.stack || ""}`);
}
