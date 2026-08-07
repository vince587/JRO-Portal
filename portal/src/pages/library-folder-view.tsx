import { useState, useEffect, useCallback } from "react";
import { useParams } from "wouter";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from "@/components/ui/collapsible";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
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
  if (t === "pdf") return <Icon name="file-text" className="text-red-500" size={18} />;
  if (["ppt", "pptx"].includes(t)) return <Icon name="presentation" className="text-orange-500" size={18} />;
  if (["xls", "xlsx"].includes(t)) return <Icon name="file-spreadsheet" className="text-green-500" size={18} />;
  if (["doc", "docx"].includes(t)) return <Icon name="file-text" className="text-blue-500" size={18} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg"].includes(t)) return <Icon name="file-image" className="text-purple-500" size={18} />;
  if (["zip", "rar", "7z"].includes(t)) return <Icon name="archive" className="text-amber-500" size={18} />;
  return <Icon name="file" className="text-muted-foreground" size={18} />;
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
      <span className="text-sm font-semibold text-slate-700">JMCS</span>
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
  const { open: openViewer, node: viewerNode } = useDocumentViewer(false, true);

  const fetchFolder = useCallback((code?: string) => {
    const qs = code ? `?code=${encodeURIComponent(code)}` : "";
    return fetch(`/api/library/folder/public/${id}${qs}`);
  }, [id]);

  useEffect(() => {
    if (!id) { setStatus("missing"); return; }
    let active = true;
    (async () => {
      try {
        const res = await fetchFolder(undefined);
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
        if (active) { setFolder(data); setStatus("ready"); setValidCode(null); }
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

  const renderLoadingState = () => (
    <div className="space-y-6">
      <div className="animate-pulse space-y-4">
        <div className="h-8 bg-muted/30 rounded-xl w-1/3" />
        <div className="h-4 bg-muted/30 rounded-xl w-1/2" />
        <Separator />
        <div className="h-24 bg-muted/30 rounded-xl" />
        <div className="h-24 bg-muted/30 rounded-xl" />
        <div className="h-24 bg-muted/30 rounded-xl" />
      </div>
    </div>
  );

  const renderAccessDenied = () => (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-8 pb-6 px-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mb-6">
          <Icon name="lock" className="text-muted-foreground" size={28} />
        </div>
        <CardTitle className="text-xl font-semibold text-foreground">Protected Folder</CardTitle>
        <CardDescription className="mt-2 mb-6 max-w-sm mx-auto">
          {denialReason === "This shared access has expired"
            ? "This access link has expired. Please contact the sender for a new one."
            : denialReason === "This material is not available"
              ? "This folder is currently unavailable."
              : "Enter the access code from your email to view this folder."}
        </CardDescription>

        {(denialReason !== "This shared access has expired" && denialReason !== "This material is not available") && (
          <div className="max-w-xs mx-auto space-y-4">
            <div className="flex gap-2">
              <Input
                value={codeInput}
                onChange={e => { setCodeInput(e.target.value.toUpperCase()); setCodeError(false); }}
                onKeyDown={e => e.key === "Enter" && submitCode()}
                placeholder="Enter code"
                className={`flex-1 text-center font-mono text-base tracking-widest ${codeError ? "border-destructive focus-visible:ring-destructive" : ""}`}
                autoFocus
                maxLength={10}
              />
              <Button
                onClick={submitCode}
                disabled={!codeInput.trim()}
                className="whitespace-nowrap bg-primary text-primary-foreground hover:bg-primary/90"
              >
                <Icon name="key-round" className="mr-1.5 h-4 w-4" /> Unlock
              </Button>
            </div>
            {codeError && (
              <p className="text-sm text-destructive">
                {denialReason || "Invalid code. Please check your email and try again."}
              </p>
            )}
          </div>
        )}

        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="mt-6 text-muted-foreground hover:text-foreground"
        >
          <Icon name="arrow-left" className="mr-1.5 h-3.5 w-3.5" /> Go back
        </Button>
      </CardContent>
    </Card>
  );

  const renderNotFound = () => (
    <Card className="w-full max-w-md mx-auto">
      <CardContent className="pt-8 pb-6 px-6 text-center">
        <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-muted/50 mb-6">
          <Icon name="alert-triangle" className="text-muted-foreground" size={28} />
        </div>
        <CardTitle className="text-xl font-semibold text-foreground">Not Found</CardTitle>
        <CardDescription className="mt-2 mb-6">
          This link is invalid or the folder has been removed.
        </CardDescription>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => window.history.back()}
          className="text-muted-foreground hover:text-foreground"
        >
          <Icon name="arrow-left" className="mr-1.5 h-3.5 w-3.5" /> Go back
        </Button>
      </CardContent>
    </Card>
  );

  const renderFolderContent = () => {
    if (!folder) return null;

    return (
      <div className="space-y-6">
        {/* Folder Header */}
        <Card>
          <CardContent className="pt-6 pb-4 px-6">
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 shrink-0">
                <Icon name="folder" className="text-primary" size={24} />
              </div>
              <div>
                <CardTitle className="text-xl font-semibold text-foreground leading-tight">{folder.name}</CardTitle>
                <CardDescription className="mt-1">
                  {folder.materials.length} {folder.materials.length === 1 ? "file" : "files"}
                </CardDescription>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* File List */}
        {folder.materials.length === 0 ? (
          <Card>
            <CardContent className="py-12 px-6 text-center">
              <Icon name="folder-open" className="mx-auto text-muted-foreground/40 mb-4" size={36} />
              <p className="text-sm text-muted-foreground">This folder is empty.</p>
            </CardContent>
          </Card>
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
                  <Card className="overflow-hidden">
                    <CardContent className="p-0">
                      <CollapsibleTrigger asChild>
                        <button className="w-full flex items-center gap-3 px-5 py-4 hover:bg-muted/30 transition-colors text-left">
                          <Icon
                            name="chevron-right"
                            className={`text-muted-foreground/40 transition-transform shrink-0 ${isOpen ? "rotate-90" : ""}`}
                            size={16}
                          />
                          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 shrink-0">
                            <Icon name="file-text" className="text-primary" size={16} />
                          </div>
                          <div className="flex-1 min-w-0">
                            <span className="block text-sm font-medium text-foreground truncate">{m.title}</span>
                            {m.category && (
                              <span className="block text-xs text-muted-foreground truncate mt-0.5">{m.category}</span>
                            )}
                          </div>
                          {hasFiles && (
                            <Badge variant="outline" className="text-xs shrink-0">
                              {m.attachments.length} {m.attachments.length === 1 ? "file" : "files"}
                            </Badge>
                          )}
                        </button>
                      </CollapsibleTrigger>
                      <CollapsibleContent>
                        <div className="px-5 pb-5 pt-1 space-y-3">
                          {m.description && (
                            <CardDescription className="block whitespace-pre-line leading-relaxed">
                              {m.description}
                            </CardDescription>
                          )}

                          {m.url ? (
                            <Card className="border-muted/30">
                              <CardContent className="p-0">
                                <iframe
                                  src={m.url}
                                  title={m.title}
                                  referrerPolicy="no-referrer"
                                  sandbox="allow-scripts allow-same-origin allow-popups"
                                  className="w-full h-[55vh] border-0 rounded-xl"
                                />
                              </CardContent>
                            </Card>
                          ) : (
                            !hasFiles && (
                              <div className="py-4 text-center">
                                <p className="text-sm text-muted-foreground">No content linked.</p>
                              </div>
                            )
                          )}

                          {hasFiles && (
                            <div className="space-y-2 border-t pt-3">
                              {m.attachments!.map(a => (
                                <button
                                  key={a.id}
                                  type="button"
                                  onClick={() => openViewer({ ...a, url: viewerAttachmentUrl(m.participantLink!, a.id, validCode ?? undefined) })}
                                  className="w-full flex items-center gap-3 rounded-lg px-4 py-3 hover:bg-muted/50 transition-colors text-left group"
                                >
                                  <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-muted/50 shrink-0">
                                    {fileIcon(a.type)}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="text-sm font-medium text-foreground truncate group-hover:text-primary transition-colors">{a.filename}</p>
                                    <p className="text-xs text-muted-foreground mt-0.5">{fileSize(a.size)}</p>
                                  </div>
                                  <Icon name="external-link" className="text-muted-foreground/40 group-hover:text-foreground shrink-0 transition-colors" size={16} />
                                </button>
                              ))}
                            </div>
                          )}
                        </div>
                      </CollapsibleContent>
                    </CardContent>
                  </Card>
                </Collapsible>
              );
            })}
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between pt-4 border-t">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => window.history.back()}
            className="text-muted-foreground hover:text-foreground"
          >
            <Icon name="arrow-left" className="mr-1.5 h-3.5 w-3.5" /> Back
          </Button>
          <Logo />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-background p-4 pt-6 sm:pt-10">
      <div className="w-full max-w-3xl mx-auto flex-1">
        {/* Brand Header */}
        <div className="mb-8">
          <Logo />
        </div>

        {/* Loading */}
        {status === "loading" && renderLoadingState()}

        {/* Access Code Required */}
        {status === "denied" && renderAccessDenied()}

        {/* Not Found */}
        {status === "missing" && renderNotFound()}

        {/* Ready - Folder Content */}
        {status === "ready" && folder && renderFolderContent()}
      </div>
      {viewerNode}
    </div>
  );
}