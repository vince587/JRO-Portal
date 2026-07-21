import { useEffect, useRef, useState } from "react";

let cachedRedirect: string | null = null;
let redirectPromise: Promise<string> | null = null;

// Don't bounce local/dev visitors to the public portal — they're staff testing
// the app. Match localhost, 127.x, private/loopback IP ranges, and Vite dev mode.
function isLocalHost(): boolean {
  if (import.meta.env.DEV) return true;
  const h = window.location.hostname;
  if (h === "localhost" || h === "127.0.0.1" || h === "[::1]") return true;
  // 10.x, 192.168.x, 172.16-31.x
  if (/^10\./.test(h)) return true;
  if (/^192\.168\./.test(h)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(h)) return true;
  return false;
}

function getPublicRedirectUrl(): Promise<string> {
  if (cachedRedirect) return Promise.resolve(cachedRedirect);
  if (!redirectPromise) {
    redirectPromise = isLocalHost()
      ? Promise.resolve("")
      : fetch("/api/config")
          .then(r => (r.ok ? r.json() : null))
          .then(d => {
            cachedRedirect = (d?.publicRedirectUrl && d.publicRedirectUrl.trim()) || "https://materials.jro-jmcs.com";
            return cachedRedirect as string;
          })
          .catch(() => "https://materials.jro-jmcs.com");
  }
  return redirectPromise;
}

// Redirects the current tab to the public participant portal. Used for the bare
// site root, token-less library paths, and invalid/garbage share tokens so
// anonymous visitors never see the staff login page. On local/dev hosts this is
// a no-op so staff can use the app normally.
export function usePublicRedirect(enabled = true) {
  const [done, setDone] = useState(false);
  const fired = useRef(false);
  useEffect(() => {
    if (!enabled || fired.current) return;
    // Don't redirect when the URL carries a share token — the participant is
    // accessing a valid share link and should see the material, not be bounced
    // to the public portal.
    if (new URLSearchParams(window.location.search).has("token")) return;
    fired.current = true;
    getPublicRedirectUrl().then(target => {
      if (target) {
        window.location.replace(target);
        setDone(true);
      }
    });
  }, [enabled]);
  return done;
}
