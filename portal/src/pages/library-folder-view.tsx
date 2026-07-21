import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
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

interface PublicFolder {
  id: string;
  name: string;
  access: "open" | "restricted" | "disabled";
  materials: PublicMaterial[];
}

function fileIcon(type: string) {
  const t = type.toLowerCase();
  if (t === "pdf") return <Icon name="file-text" className="text-red-400" size={16} />;
  if (["ppt", "pptx"].includes(t)) return <Icon name="presentation" className="text-orange-400" size={16} />;
  if (["xls", "xlsx"].includes(t)) return <Icon name="file-spreadsheet" className="text-green-400" size={16} />;
  if (["doc", "docx"].includes(t)) return <Icon name="file-text" className="text-blue-400" size={16} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(t)) return <Icon name="file-image" className="text-purple-400" size={16} />;
  if (["zip", "rar", "7z"].includes(t)) return <Icon name="archive" className="text-yellow-500" size={16} />;
  return <Icon name="file" className="text-slate-400" size={16} />;
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

export default function LibraryFolderView() {
  const params = useParams();
  const id = params.id as string;
  const [folder, setFolder] = useState<PublicFolder | null>(null);
  const [status, setStatus] = useState<"loading" | "ready" | "denied" | "missing">("loading");
  const [denialReason, setDenialReason] = useState<string>("");
  const [expanded, setExpanded] = useState<string | null>(null);
  const [codeInput, setCodeInput] = useState("");
  const [codeError, setCodeError] = useState(false);
  const [validCode, setValidCode] = useState<string | null>(null);
  const { open: openViewer, node: viewerNode } = useDocumentViewer(false);

  const fetchFolder = useCallback((code?: string) => {
    const qs = code ? `?code=${encodeURIComponent(code)}` : "";
    return fetch(`/api/library/folder/public/${id}${qs}`);
  }, [id]);

  useEffect(() => {
    if (!id) { setStatus("missing"); return; }
    let active = true;
    const urlCode = new URLSearchParams(window.location.search).get("code");
    (async () => {
      try {
        const res = await fetchFolder(urlCode ?? undefined);
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
        if (active) { setFolder(data); setStatus("ready"); setValidCode(urlCode ?? null); }
      } catch {
        if (active) setStatus("missing");
      }
    })();
    return () => { active = false; };
  }, [id, fetchFolder]);

  const submitCode = async () => {
    if (!codeInput.trim()) return;
    setCodeError(false);
    try {
      const res = await fetchFolder(codeInput.trim());
      if (res.ok) {
        const data = await res.json();
        setFolder(data);
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
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
            <Skeleton className="h-14 w-full rounded-2xl" />
          </div>
        )}

        {/* Access code required */}
        {status === "denied" && (
          <div className="neu rounded-3xl p-8 text-center">
            <div className="neu-inset inline-flex items-center justify-center w-16 h-16 rounded-2xl mb-5">
              <Icon name="lock" className="text-slate-500" size={28} />
            </div>
            <h1 className="text-xl font-bold text-slate-800 mb-1">Protected folder</h1>
            <p className="text-sm text-slate-500 mb-7 max-w-sm mx-auto leading-relaxed">
              {denialReason === "This shared access has expired"
                ? "This access link has expired. Please contact the sender for a new one."
                : denialReason === "This material is not available"
                  ? "This folder is currently unavailable."
                  : "Enter the access code from your email to view this folder."}
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
              This link is invalid or the folder has been removed.
            </p>
            <button onClick={() => window.history.back()} className="text-sm text-slate-400 hover:text-slate-600 transition-colors">
              <Icon name="arrow-left" className="inline mr-1" size={14} /> Go back
            </button>
          </div>
        )}

        {/* Ready — folder content */}
        {status === "ready" && folder && (
          <div className="space-y-5">
            {/* Folder header */}
            <div className="neu rounded-2xl p-5">
              <div className="flex items-center gap-3">
                <div className="neu-inset h-11 w-11 rounded-xl flex items-center justify-center shrink-0">
                  <Icon name="folder" className="text-primary" size={22} />
                </div>
                <div>
                  <h1 className="text-xl font-bold text-slate-800 leading-tight">{folder.name}</h1>
                  <p className="text-xs text-slate-400 mt-0.5">
                    {folder.materials.length} {folder.materials.length === 1 ? "file" : "files"}
                  </p>
                </div>
              </div>
            </div>

            {/* File list */}
            {folder.materials.length === 0 ? (
              <div className="neu rounded-2xl py-12 text-center">
                <Icon name="folder-open" className="mx-auto text-slate-300 mb-3" size={32} />
                <p className="text-sm text-slate-400">This folder is empty.</p>
              </div>
            ) : (
              <div className="space-y-3">
                {folder.materials.map(m => {
                  const isOpen = expanded === m.id;
                  const hasFiles = m.attachments && m.attachments.length > 0;
                  return (
                    <Collapsible
                      key={m.id}
                      open={isOpen}
                      onOpenChange={(o) => setExpanded(o ? m.id : null)}
                    >
                      <div className="neu rounded-2xl overflow-hidden">
                        <CollapsibleTrigger asChild>
                          <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-white/30 transition-colors text-left">
                            <Icon name="chevron-right" className={`text-slate-300 transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`} size={16} />
                            <div className="neu-inset h-8 w-8 rounded-lg flex items-center justify-center shrink-0">
                              <Icon name="file-text" className="text-primary" size={14} />
                            </div>
                            <div className="flex-1 min-w-0">
                              <span className="block text-sm font-semibold text-slate-700 truncate">{m.title}</span>
                              {m.category && (
                                <span className="block text-xs text-slate-400 truncate mt-0.5">{m.category}</span>
                              )}
                            </div>
                            {hasFiles && (
                              <span className="neu-inset text-xs font-medium text-slate-500 px-2.5 py-1 rounded-full shrink-0">
                                {m.attachments.length} {m.attachments.length === 1 ? "file" : "files"}
                              </span>
                            )}
                          </button>
                        </CollapsibleTrigger>
                        <CollapsibleContent>
                          <div className="px-5 pb-5 pt-1">
                            {m.description && (
                              <p className="text-sm text-slate-500 mb-3 whitespace-pre-line leading-relaxed">{m.description}</p>
                            )}

                            {m.url ? (
                              <div className="neu rounded-xl overflow-hidden mb-3">
                                <iframe
                                  src={m.url}
                                  title={m.title}
                                  referrerPolicy="no-referrer"
                                  sandbox="allow-scripts allow-same-origin allow-popups"
                                  className="w-full h-[55vh] border-0"
                                />
                              </div>
                            ) : (
                              !hasFiles && (
                                <p className="text-sm text-slate-400 py-4 text-center">No content linked.</p>
                              )
                            )}

                            {hasFiles && (
                              <div className="space-y-2">
                                {m.attachments!.map(a => (
                                  <button
                                    key={a.id}
                                    type="button"
                                    onClick={() => openViewer({ ...a, url: viewerAttachmentUrl(m.participantLink!, a.id, validCode ?? undefined) })}
                                    className="w-full flex items-center gap-3 neu-sm rounded-xl px-4 py-3 hover:shadow-md transition-all text-left group"
                                  >
                                    <div className="neu-inset h-8 w-8 rounded-lg flex items-center justify-center shrink-0">
                                      {fileIcon(a.type)}
                                    </div>
                                    <span className="flex-1 min-w-0 text-sm text-slate-700 truncate group-hover:text-primary transition-colors">{a.filename}</span>
                                    <span className="text-xs text-slate-400 shrink-0">{fileSize(a.size)}</span>
                                    <Icon name="external-link" className="text-slate-300 group-hover:text-primary shrink-0 transition-colors" size={14} />
                                  </button>
                                ))}
                              </div>
                            )}
                          </div>
                        </CollapsibleContent>
                      </div>
                    </Collapsible>
                  );
                })}
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
