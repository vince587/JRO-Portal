import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { useDocumentViewer, viewerAttachmentUrl } from "@/components/library/document-viewer";

interface PublicAttachment { id: string; filename: string; type: string; size: number; }
interface PublicMaterial {
  id: string;
  participantLink: string | null;
  title: string;
  description: string | null;
  section: "internal" | "external";
  department: string | null;
  category: string | null;
  url: string | null;
  access: "open" | "restricted" | "disabled";
  attachments: PublicAttachment[];
}

function fileIcon(type: string) {
  const t = type.toLowerCase();
  if (t === "pdf") return <Icon name="file-text" className="text-red-400" size={20} />;
  if (["ppt", "pptx"].includes(t)) return <Icon name="presentation" className="text-orange-400" size={20} />;
  if (["xls", "xlsx"].includes(t)) return <Icon name="file-spreadsheet" className="text-green-400" size={20} />;
  if (["doc", "docx"].includes(t)) return <Icon name="file-text" className="text-blue-400" size={20} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(t)) return <Icon name="file-image" className="text-purple-400" size={20} />;
  if (["zip", "rar", "7z"].includes(t)) return <Icon name="archive" className="text-yellow-500" size={20} />;
  return <Icon name="file" className="text-slate-400" size={20} />;
}

function fileSize(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1048576) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

function Logo() {
  return (
    <div className="flex items-center gap-2.5">
      <div className="h-8 w-8 rounded-lg overflow-hidden shadow-sm">
        <img src="/logo internal.png" alt="JMCS" className="h-full w-full object-contain" />
      </div>
      <span className="text-sm font-semibold text-slate-600">JMCS</span>
    </div>
  );
}

export default function LibraryView() {
  const params = useParams();
  const id = params.id as string;
  const [material, setMaterial] = useState<PublicMaterial | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "missing">("loading");
  const [denialReason, setDenialReason] = useState<string>("");
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [validCode, setValidCode] = useState<string | null>(null);
  const { open: openViewer, node: viewerNode } = useDocumentViewer(false);

  const fetchMaterial = useCallback((code?: string) => {
    const qs = code ? `?code=${encodeURIComponent(code)}` : "";
    return fetch(`/api/library/public/${id}${qs}`);
  }, [id]);

  useEffect(() => {
    if (!id) { setStatus("missing"); return; }
    let active = true;
    const urlCode = new URLSearchParams(window.location.search).get("code");
    (async () => {
      try {
        const res = await fetchMaterial(urlCode ?? undefined);
        if (res.status === 403) {
          if (active) {
            const data = await res.json().catch(() => null);
            setDenialReason(data?.error || "");
            setStatus("denied");
          }
          return;
        }
        if (res.status === 404) { if (active) setStatus("missing"); return; }
        if (!res.ok) { if (active) setStatus("missing"); return; }
        const data = await res.json();
        if (active) { setMaterial(data); setStatus("ready"); setValidCode(urlCode ?? null); }
      } catch {
        if (active) setStatus("missing");
      }
    })();
    return () => { active = false; };
  }, [id, fetchMaterial]);

  const submitCode = async () => {
    if (!codeInput.trim()) return;
    setCodeError(false);
    try {
      const res = await fetchMaterial(codeInput.trim());
      if (res.ok) {
        const data = await res.json();
        setMaterial(data);
        setStatus("ready");
        setValidCode(codeInput.trim());
        const url = new URL(window.location.href);
        url.searchParams.set("code", codeInput.trim());
        window.history.replaceState({}, "", url.toString());
      } else {
        const data = await res.json().catch(() => null);
        setDenialReason(data?.error || "");
        setCodeError(true);
      }
    } catch {
      setCodeError(true);
    }
  };

  return (
    <div className="min-h-screen flex flex-col p-4 pt-6 sm:pt-10" style={{ backgroundColor: "var(--neu-bg)" }}>
      <div className="w-full max-w-2xl mx-auto flex-1">

        {/* Brand header */}
        <div className="mb-6">
          <Logo />
        </div>

        {/* Loading */}
        {status === "loading" && (
          <div className="space-y-5">
            <Skeleton className="h-8 w-1/3 rounded-xl" />
            <Skeleton className="h-4 w-2/3 rounded-xl" />
            <Skeleton className="h-px w-full" />
            <Skeleton className="h-72 w-full rounded-2xl" />
          </div>
        )}

        {/* Access code required */}
        {status === "denied" && (
          <div className="neu rounded-3xl p-8 text-center">
            <div className="neu-inset inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5">
              <Icon name="lock" className="text-slate-500" size={28} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-1">Protected material</h1>
            <p className="text-sm text-slate-500 mb-7 max-w-sm mx-auto leading-relaxed">
              {denialReason === "This shared access has expired"
                ? "This access link has expired. Please contact the sender for a new one."
                : denialReason === "This material is not available"
                  ? "This material is currently unavailable."
                  : "Enter the access code from your email to view this material."}
            </p>

            {denialReason !== "This shared access has expired" && denialReason !== "This material is not available" && (
              <div className="max-w-xs mx-auto">
                <div className="flex gap-3">
                  <input
                    value={codeInput}
                    onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(false); }}
                    onKeyDown={e => e.key === "Enter" && submitCode()}
                    placeholder="Enter code"
                    className={`neu-inset flex-1 rounded-xl text-center font-mono text-base tracking-widest px-4 py-3 text-slate-700 placeholder:text-slate-400 focus:outline-none transition-all ${codeError ? "ring-2 ring-red-400" : ""}`}
                    autoFocus
                    maxLength={10}
                  />
                  <button
                    onClick={submitCode}
                    disabled={!codeInput.trim()}
                    className="neu-sm rounded-xl px-6 py-3 text-sm font-semibold text-white transition-all disabled:opacity-40"
                    style={{ backgroundColor: "#c0152b" }}
                  >
                    <Icon name="key-round" className="mr-1.5" size={16} /> Unlock
                  </button>
                </div>
                {codeError && (
                  <p className="text-sm text-red-500 mt-3">
                    {denialReason || "Invalid code. Please check your email and try again."}
                  </p>
                )}
              </div>
            )}

            <button onClick={() => window.history.back()} className="mt-8 text-sm text-slate-400 hover:text-slate-600 transition-colors">
              <Icon name="arrow-left" className="inline mr-1" size={14} /> Go back
            </button>
          </div>
        )}

        {/* Not found */}
        {status === "missing" && (
          <div className="neu rounded-3xl p-8 text-center">
            <div className="neu-inset inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5">
              <Icon name="alert-triangle" className="text-slate-400" size={28} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-1">Not found</h1>
            <p className="text-sm text-slate-500 mb-6 leading-relaxed">
              This link is invalid or the material has been removed.
            </p>
            <button onClick={() => window.history.back()} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              <Icon name="arrow-left" className="inline mr-1" size={14} /> Go back
            </button>
          </div>
        )}

        {/* Ready — material content */}
        {status === "ready" && material && (
          <div className="space-y-5">
            {/* Title card */}
            <div className="neu rounded-2xl p-6">
              <div className="flex items-start gap-3">
                <div className="neu-inset h-10 w-10 rounded-xl flex items-center justify-center shrink-0 mt-0.5">
                  <Icon name="book-open" className="text-primary" size={20} />
                </div>
                <div className="flex-1 min-w-0">
                  <h1 className="text-xl font-bold text-slate-800 leading-tight">{material.title}</h1>
                  {material.description && (
                    <p className="text-sm text-slate-500 mt-2 whitespace-pre-line leading-relaxed">{material.description}</p>
                  )}
                  <div className="flex items-center gap-3 mt-3 flex-wrap">
                    {material.category && (
                      <span className="neu-inset text-xs font-medium text-slate-600 px-3 py-1 rounded-full">
                        {material.category}
                      </span>
                    )}
                    {material.department && (
                      <span className="neu-inset text-xs font-medium text-slate-600 px-3 py-1 rounded-full">
                        {material.department}
                      </span>
                    )}
                    <span className="text-xs text-slate-400 flex items-center gap-1">
                      <Icon name="shield" size={12} /> View only
                    </span>
                  </div>
                </div>
              </div>
            </div>

            {/* Main content (iframe) */}
            {material.url ? (
              <div className="neu rounded-2xl overflow-hidden">
                <iframe
                  src={material.url}
                  title={material.title}
                  referrerPolicy="no-referrer"
                  sandbox="allow-scripts allow-same-origin allow-popups"
                  className="w-full h-[65vh] border-0"
                />
              </div>
            ) : (
              !material.attachments?.length && (
                <div className="neu rounded-2xl py-12 text-center">
                  <Icon name="file-x" className="mx-auto text-slate-300 mb-3" size={32} />
                  <p className="text-sm text-slate-400">No content linked to this material.</p>
                </div>
              )
            )}

            {/* Attachments */}
            {material.attachments && material.attachments.length > 0 && (
              <div className="neu rounded-2xl p-5">
                <div className="flex items-center gap-2 mb-4">
                  <div className="neu-inset h-8 w-8 rounded-lg flex items-center justify-center">
                    <Icon name="paperclip" className="text-primary" size={16} />
                  </div>
                  <h2 className="text-sm font-semibold text-slate-700">
                    Files ({material.attachments.length})
                  </h2>
                </div>
                <div className="space-y-2">
                  {material.attachments.map(a => (
                    <button
                      key={a.id}
                      type="button"
                      onClick={() => openViewer({ ...a, url: viewerAttachmentUrl(material.participantLink!, a.id, validCode ?? undefined) })}
                      className="w-full flex items-center gap-3 neu-sm rounded-xl px-4 py-3.5 hover:shadow-md transition-all text-left group"
                    >
                      <div className="neu-inset h-9 w-9 rounded-lg flex items-center justify-center shrink-0">
                        {fileIcon(a.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-medium text-slate-700 truncate group-hover:text-primary transition-colors">{a.filename}</p>
                        <p className="text-xs text-slate-400 mt-0.5">{fileSize(a.size)}</p>
                      </div>
                      <Icon name="external-link" className="text-slate-300 group-hover:text-primary shrink-0 transition-colors" size={16} />
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Footer */}
            <div className="flex items-center justify-between pb-6">
              <button onClick={() => window.history.back()} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
                <Icon name="arrow-left" className="inline mr-1" size={14} /> Back
              </button>
              <Logo />
            </div>
          </div>
        )}
      </div>
      {viewerNode}
    </div>
  );
}
