import { useEffect, useRef, useState } from "react";
import { useLocation } from "wouter";
import {
  isDesktopApp,
  isDesktopVerified,
  probeDesktop,
  setDesktopVerified,
  useDownloadUrl,
  verifyDesktopInstalled,
  type Platform,
} from "@/lib/desktop-guard";

type Status = "idle" | "checking" | "not-found";

function platformLabel(p: Platform): string {
  switch (p) {
    case "mac": return "Mac";
    case "linux": return "Linux";
    default: return "Windows";
  }
}

function platformIcon(p: Platform) {
  if (p === "mac") {
    return (
      <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round">
        <path d="M12 2C8.5 2 5.5 4 5.5 4L3 8l4.5 2.5L6 16l3-1.5L12 17l3-2.5L11 13l1.5-5.5L19 8l-2.5-4S15.5 2 12 2z" />
      </svg>
    );
  }
  return (
    <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
      <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
      <polyline points="7 10 12 15 17 10" />
      <line x1="12" y1="15" x2="12" y2="3" />
    </svg>
  );
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function InstallRequired() {
  const [, setLocation] = useLocation();
  const [status, setStatus] = useState<Status>("idle");
  const mounted = useRef(true);
  const download = useDownloadUrl();

  const finish = () => {
    setDesktopVerified(true);
    sessionStorage.removeItem("jmcs_force_install");
    setLocation("/");
  };

  // If we're already inside the desktop app, or a previous verification is still
  // valid for this session, skip straight to the dashboard.
  useEffect(() => {
    mounted.current = true;
    if (isDesktopApp() || isDesktopVerified()) {
      finish();
      return;
    }

    // Silent check on load: if the desktop app is already running, pass through
    // without forcing the user to click anything.
    (async () => {
      const ok = await probeDesktop(1500);
      if (!mounted.current) return;
      if (ok) finish();
    })();

    return () => {
      mounted.current = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleVerify = async () => {
    if (status === "checking") return;
    setStatus("checking");
    const ok = await verifyDesktopInstalled({ launch: true });
    if (!mounted.current) return;
    if (ok) {
      finish();
    } else {
      setStatus("not-found");
    }
  };

  const platform = download.platform;
  const isMac = platform === "mac";
  const hasDownload = !!download.url;

  return (
    <div
      className="relative min-h-screen w-full overflow-hidden"
      style={{ background: "linear-gradient(135deg, #000f2e 0%, #001B48 55%, #12336e 100%)" }}
    >
      {/* Blurred, dimmed backdrop so this reads as a required notice */}
      <div
        className="absolute inset-0"
        style={{ backdropFilter: "blur(14px)", WebkitBackdropFilter: "blur(14px)", background: "rgba(5,12,24,0.72)" }}
      />

      <div className="relative z-10 min-h-screen w-full flex items-center justify-center p-6">
        <div
          className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl surface"
          style={{ backgroundColor: "#001B48", minHeight: "460px" }}
        >
          <div className="flex flex-col items-center justify-center gap-5 px-10 py-14 text-center">
            <div
              className="w-16 h-16 rounded-2xl flex items-center justify-center"
              style={{ backgroundColor: "hsl(var(--primary))" }}
            >
              {platformIcon(platform)}
            </div>

            <div>
              <h1 className="text-2xl font-bold text-white mb-1">Install required</h1>
              <p className="text-sm" style={{ color: "rgba(255,255,255,0.6)" }}>
                You must install the JMCS desktop app on this {isMac ? "Mac" : "computer"} before you can
                access your dashboard.
              </p>
            </div>

            {status === "not-found" && (
              <div
                className="w-full flex items-start gap-3 rounded-xl px-4 py-3 text-left text-sm"
                style={{
                  backgroundColor: "rgba(192,21,43,0.15)",
                  border: "1px solid rgba(192,21,43,0.4)",
                }}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" className="flex-shrink-0 mt-0.5" style={{ color: "#ff9aa6" }}>
                  <path d="M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" strokeLinejoin="round" />
                  <line x1="12" y1="9" x2="12" y2="13" stroke="currentColor" strokeWidth="1.75" strokeLinecap="round" />
                  <line x1="12" y1="17" x2="12.01" y2="17" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
                </svg>
                <p style={{ color: "rgba(255,200,205,0.9)" }}>
                  {isMac
                    ? "We couldn't detect the desktop app on this Mac. Please download and install it, then try again. If you just installed it, make sure to open it from your Applications folder."
                    : "We couldn't detect the desktop app on this computer. Please download and install it, then try again. If you just installed it, make sure it's allowed to open."}
                </p>
              </div>
            )}

            <div className="w-full flex flex-col gap-3">
              {hasDownload ? (
                <a
                  href={download.url}
                  download
                  className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all text-center"
                  style={{ backgroundColor: "hsl(var(--primary))", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
                >
                  Download for {platformLabel(platform)}
                  {download.manifest && (
                    <span className="block text-xs font-normal mt-0.5" style={{ color: "rgba(255,255,255,0.6)" }}>
                      {download.filename} ({formatFileSize(download.manifest.size)})
                    </span>
                  )}
                </a>
              ) : !download.loading ? (
                <div className="w-full flex flex-col gap-2">
                  <p
                    className="w-full py-3 rounded-lg text-sm font-semibold text-center border border-white/15"
                    style={{ color: "rgba(255,255,255,0.55)" }}
                  >
                    Installer not published yet for {platformLabel(platform)}.
                  </p>
                  {/* Show alternative platform download if available */}
                  {platform === "mac" && download.url && (
                    <a
                      href={download.url}
                      download
                      className="w-full py-2.5 rounded-lg text-xs font-medium text-center border border-white/15 hover:bg-white/5 transition-all"
                      style={{ color: "rgba(255,255,255,0.45)" }}
                    >
                      Download for Windows instead
                    </a>
                  )}
                </div>
              ) : null}
              <button
                onClick={handleVerify}
                disabled={status === "checking"}
                className="w-full py-2.5 rounded-lg text-sm font-semibold text-white border border-white/20 hover:bg-white/10 transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
              >
                {status === "checking" ? (
                  <>
                    <span
                      className="w-4 h-4 rounded-full border-2 border-white/30 animate-spin"
                      style={{ borderTopColor: "#fff" }}
                    />
                    Checking your {isMac ? "Mac" : "computer"}…
                  </>
                ) : (
                  "I've installed the desktop app"
                )}
              </button>
            </div>

            <p className="text-xs px-2" style={{ color: "rgba(255,255,255,0.45)" }}>
              The desktop app is required to access the portal. Clicking the button above
              verifies the app is actually installed on this {isMac ? "Mac" : "computer"}.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
