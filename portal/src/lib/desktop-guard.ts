// Desktop-app install guard.
//
// A browser cannot read a user's filesystem, so we verify the JMCS desktop app
// is really installed by probing a loopback server the installed Electron app
// runs (see electron/detect-server.cjs). If the app isn't currently running we
// first try to launch it via its custom `jmcs://` protocol (which only works if
// it is installed) and then poll the loopback endpoint.

import { useEffect, useState } from "react";

// Must match DETECT_PORT in electron/detect-server.cjs.
export const DETECT_PORT = 43117;
export const DETECT_URL = `http://127.0.0.1:${DETECT_PORT}/jmcs-desktop-check`;
export const PROTOCOL_URL = "jmcs://open";

// Placeholder for callers that still want a synchronous URL. Always empty at
// runtime — call `getDownloadUrl()` or `useDownloadUrl()` to get the real one.
export const DOWNLOAD_URL = "";

// Persist a successful verification for the browser session so we don't re-probe
// on every navigation. Cleared when the browser/tab session ends.
export const VERIFIED_FLAG = "jmcs_desktop_verified";

export function isDesktopApp(): boolean {
  if (typeof window === "undefined") return false;
  if (window.electronAPI?.isDesktopApp) return true;
  return /electron/i.test(navigator.userAgent || "");
}

export function isDesktopVerified(): boolean {
  if (isDesktopApp()) return true;
  try {
    return sessionStorage.getItem(VERIFIED_FLAG) === "1";
  } catch {
    return false;
  }
}

export function setDesktopVerified(verified: boolean): void {
  try {
    if (verified) sessionStorage.setItem(VERIFIED_FLAG, "1");
    else sessionStorage.removeItem(VERIFIED_FLAG);
  } catch {
    /* noop */
  }
}

// Single request to the loopback endpoint. Resolves true only if the desktop
// app answers with the expected payload.
export async function probeDesktop(timeoutMs = 1500): Promise<boolean> {
  if (typeof fetch === "undefined") return false;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(`${DETECT_URL}?t=${Date.now()}`, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
    });
    if (!res.ok) return false;
    const data = await res.json().catch(() => null);
    return !!(data && data.installed && data.app === "jmcs-portal");
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

function launchProtocol(): void {
  try {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = PROTOCOL_URL;
    document.body.appendChild(iframe);
    setTimeout(() => {
      try {
        document.body.removeChild(iframe);
      } catch {
        /* noop */
      }
    }, 4000);
  } catch {
    /* noop */
  }
}

interface VerifyOptions {
  // Whether to attempt launching the app via the custom protocol. Default true.
  launch?: boolean;
  // Total time to keep polling for the app to come up. Default 9000ms.
  totalMs?: number;
}

// Full verification used by the "I've installed it" button. Returns true only
// when the installed desktop app responds on the loopback port.
export async function verifyDesktopInstalled(opts: VerifyOptions = {}): Promise<boolean> {
  if (isDesktopApp()) {
    setDesktopVerified(true);
    return true;
  }

  // Fast path: the app is already running.
  if (await probeDesktop(1200)) {
    setDesktopVerified(true);
    return true;
  }

  // Try to launch the installed app, then poll until it comes online.
  if (opts.launch !== false) launchProtocol();

  const deadline = Date.now() + (opts.totalMs ?? 9000);
  while (Date.now() < deadline) {
    await new Promise((r) => setTimeout(r, 800));
    if (await probeDesktop(1200)) {
      setDesktopVerified(true);
      return true;
    }
  }

  setDesktopVerified(false);
  return false;
}

// ---------------------------------------------------------------------------
// Platform detection
// ---------------------------------------------------------------------------

export type Platform = "windows" | "mac" | "linux";

export function detectPlatform(): Platform {
  if (typeof navigator === "undefined") return "windows";
  const ua = navigator.userAgent.toLowerCase();
  if (ua.includes("mac")) return "mac";
  if (ua.includes("linux")) return "linux";
  return "windows";
}

// ---------------------------------------------------------------------------
// Installer download discovery
// ---------------------------------------------------------------------------
//
// The installer binaries live at /downloads/<filename> on Firebase Hosting.
// The manifest now contains per-platform entries: { windows: {...}, mac: {...} }.
// The frontend resolves the correct download URL based on the detected platform.

export interface InstallerManifest {
  name: string;
  size: number;
  sha256: string;
}

export interface InstallerManifestFull {
  windows?: InstallerManifest;
  mac?: InstallerManifest;
  ts: string;
}

export interface DownloadUrlState {
  /** Absolute path under the hosted origin, e.g. "/downloads/Internal Portal Setup 1.0.0.exe". Empty when not available. */
  url: string;
  /** The filename for display. */
  filename: string;
  /** Platform-specific manifest, or null while loading / on failure. */
  manifest: InstallerManifest | null;
  /** Detected platform. */
  platform: Platform;
  /** True until the first fetch settles (success or failure). */
  loading: boolean;
}

const EMPTY_DOWNLOAD: Omit<DownloadUrlState, "loading"> = {
  url: "",
  filename: "",
  manifest: null,
  platform: detectPlatform(),
};

let cachedPromise: Promise<DownloadUrlState> | null = null;

export function fetchDownloadUrl(): Promise<DownloadUrlState> {
  if (typeof window === "undefined") {
    return Promise.resolve({ ...EMPTY_DOWNLOAD, loading: false });
  }
  if (cachedPromise) return cachedPromise;

  cachedPromise = (async (): Promise<DownloadUrlState> => {
    const platform = detectPlatform();
    try {
      const res = await fetch("/downloads/installer.json", { cache: "no-store" });
      if (!res.ok) return { ...EMPTY_DOWNLOAD, platform, loading: false };
      const data = (await res.json()) as Partial<InstallerManifestFull>;
      if (!data) return { ...EMPTY_DOWNLOAD, platform, loading: false };

      // Pick the right installer for the detected platform
      const entry = platform === "mac" ? data.mac : data.windows;

      if (!entry || typeof entry.name !== "string") {
        // Fallback: if only .exe exists (old manifest format), use it for Windows
        if (platform !== "mac" && typeof (data as any).name === "string") {
          const legacy = data as any;
          if (/\.exe$/i.test(legacy.name)) {
            return {
              url: `/downloads/${encodeURIComponent(legacy.name)}`,
              filename: legacy.name,
              manifest: legacy,
              platform,
              loading: false,
            };
          }
        }
        return { ...EMPTY_DOWNLOAD, platform, loading: false };
      }

      return {
        url: `/downloads/${encodeURIComponent(entry.name)}`,
        filename: entry.name,
        manifest: entry,
        platform,
        loading: false,
      };
    } catch {
      return { ...EMPTY_DOWNLOAD, platform, loading: false };
    }
  })();

  return cachedPromise;
}

/**
 * React hook for components that want to render the download button: gives
 * them `{ url, filename, manifest, platform, loading }` once the manifest
 * has been fetched.
 */
export function useDownloadUrl(): DownloadUrlState {
  const [state, setState] = useState<DownloadUrlState>({
    ...EMPTY_DOWNLOAD,
    loading: true,
  });
  useEffect(() => {
    let cancelled = false;
    fetchDownloadUrl().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);
  return state;
}
