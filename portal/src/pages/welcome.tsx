import { useEffect, useRef, useState } from "react";
import { PROTOCOL_URL, useDownloadUrl } from "@/lib/desktop-guard";

export default function Welcome() {
  // null = checking, true = app launched, false = not installed
  const [installed, setInstalled] = useState<boolean | null>(null);
  const blurred = useRef(false);
  const download = useDownloadUrl();

  useEffect(() => {
    const iframe = document.createElement("iframe");
    iframe.style.display = "none";
    iframe.src = PROTOCOL_URL;
    document.body.appendChild(iframe);

    const onBlur = () => {
      blurred.current = true;
    };
    window.addEventListener("blur", onBlur);
    document.addEventListener("visibilitychange", () => {
      if (document.hidden) blurred.current = true;
    });

    const timer = window.setTimeout(() => {
      setInstalled(blurred.current);
      try {
        document.body.removeChild(iframe);
      } catch {
        /* noop */
      }
    }, 2500);

    return () => {
      window.clearTimeout(timer);
      window.removeEventListener("blur", onBlur);
      try {
        document.body.removeChild(iframe);
      } catch {
        /* noop */
      }
    };
  }, []);

  const openApp = () => {
    window.location.href = PROTOCOL_URL;
  };

  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ background: "linear-gradient(135deg, #f8fafc 0%, #eef2f7 100%)" }}
    >
      <div
        className="w-full max-w-md rounded-2xl overflow-hidden shadow-2xl surface"
        style={{ backgroundColor: "#ffffff", minHeight: "420px" }}
      >
        <div className="flex flex-col items-center justify-center gap-6 px-10 py-14 text-center">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center"
            style={{ backgroundColor: "hsl(var(--primary))" }}
          >
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#fff" strokeWidth="2">
              <path d="M12 2 2 7l10 5 10-5-10-5z" />
              <path d="m2 17 10 5 10-5" />
              <path d="m2 12 10 5 10-5" />
           </svg>
         </div>

          <div>
            <h1 className="text-2xl font-bold mb-1" style={{ color: "#001B48" }}>Internal Portal</h1>
            <p className="text-sm" style={{ color: "rgba(15,23,42,0.6)" }}>
              Opening the desktop app…
           </p>
         </div>

          {installed === null && (
            <div className="flex items-center gap-2 text-sm" style={{ color: "rgba(15,23,42,0.5)" }}>
              <span
                className="w-4 h-4 rounded-full border-2 border-input animate-spin"
                style={{ borderTopColor: "hsl(var(--primary))" }}
              />
              Checking for the desktop app
           </div>
          )}

          {installed === true && (
            <p className="text-sm" style={{ color: "rgba(15,23,42,0.6)" }}>
              The desktop app is opening. If it didn't start, use the button below.
            </p>
          )}

          {installed === false && (
            <div className="w-full flex flex-col gap-3">
              <p className="text-sm" style={{ color: "rgba(15,23,42,0.6)" }}>
                The desktop app isn't installed yet. Install it for the best experience.
             </p>
              {download.url ? (
                <a
                  href={download.url}
                  download
                  className="w-full py-3 rounded-lg text-sm font-bold text-white transition-all text-center"
                  style={{ backgroundColor: "hsl(var(--primary))", boxShadow: "0 4px 16px rgba(37,99,235,0.35)" }}
                >
                  Download for Windows
               </a>
              ) : !download.loading ? (
                <p
                  className="w-full py-3 rounded-lg text-sm font-semibold text-center border border-border"
                  style={{ color: "rgba(15,23,42,0.4)" }}
                >
                  Installer not published yet. Contact your administrator.
               </p>
              ) : null}
              <button
                onClick={openApp}
                className="w-full py-3 rounded-lg text-sm font-semibold border border-input hover:bg-muted/60 transition-all"
                style={{ color: "#001B48" }}
              >
                Open desktop app
             </button>
           </div>
          )}
       </div>
     </div>
   </div>
 );
}
