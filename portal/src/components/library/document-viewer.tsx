import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";
import { Separator } from "@/components/ui/separator";

export interface ViewerAttachment {
  id: string;
  filename: string;
  type: string;
  size: number;
  url: string;
}

const IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const EXCEL_TYPES = ["xls", "xlsx"];
const OFFICE_TYPES = ["doc", "docx", "ppt", "pptx"];

function absolute(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

type ViewerKind = "pdf" | "image" | "excel" | "office" | "other";

function resolve(att: ViewerAttachment): { kind: ViewerKind; src: string } {
  const t = att.type.toLowerCase();
  if (t === "pdf") return { kind: "pdf", src: absolute(att.url) };
  if (IMAGE_TYPES.includes(t)) return { kind: "image", src: absolute(att.url) };
  if (EXCEL_TYPES.includes(t)) return { kind: "excel", src: absolute(att.url) };
  if (OFFICE_TYPES.includes(t)) return { kind: "office", src: absolute(att.url) };
  return { kind: "other", src: absolute(att.url) };
}

export function DocumentViewer({
  attachment,
  open,
  onOpenChange,
  allowDownload = true,
  startFullScreen = false,
}: {
  attachment: ViewerAttachment | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allowDownload?: boolean;
  startFullScreen?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [excelHtml, setExcelHtml] = useState<string | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

  useEffect(() => {
    if (open && startFullScreen) {
      setFullScreen(true);
    } else if (!open) {
      setFullScreen(false);
    }
  }, [open, startFullScreen]);

  useEffect(() => {
    if (!attachment || !EXCEL_TYPES.includes(attachment.type.toLowerCase())) {
      setExcelHtml(null);
      setExcelLoading(false);
      return;
    }
    setExcelLoading(true);
    setExcelHtml(null);
    setFailed(false);
    fetch(attachment.url)
      .then((res) => {
        if (!res.ok) throw new Error("fetch failed");
        return res.arrayBuffer();
      })
      .then((buf) => {
        const wb = XLSX.read(buf, { type: "array" });
        const html = wb.SheetNames.map((name) => {
          const ws = wb.Sheets[name];
          const table = XLSX.utils.sheet_to_html(ws, { id: `sheet-${name}` });
          return `<div class="excel-sheet"><h3 class="excel-sheet-name">${name}</h3>${table}</div>`;
        }).join("");
        setExcelHtml(html);
      })
      .catch(() => setFailed(true))
      .finally(() => setExcelLoading(false));
  }, [attachment]);

  useEffect(() => {
    if (fullScreen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => { document.body.style.overflow = ""; };
  }, [fullScreen]);

  if (!attachment) return null;
  const { kind, src } = resolve(attachment);

  const renderContent = () => {
    if (failed) {
      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8 text-center">
          <div className="mb-6">
            <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-muted/50 mb-3">
              <Icon name="alert-triangle" size={24} className="text-amber-400" />
            </div>
            <p className="text-lg font-medium text-muted-foreground">Unable to load document</p>
            <p className="text-sm text-muted-foreground/60 mt-2">
              Please check your connection and try again, or download the file to view it locally.
            </p>
          </div>
          {allowDownload && (
            <Button
              variant="outline"
              size="icon"
              onClick={() => window.open(src, "_blank")}
              className="flex items-center gap-2 px-4 py-2 text-sm"
            >
              <Icon name="external-link" size={16} />
              Open in New Tab
            </Button>
          )}
        </div>
      );
    }

    if (kind === "excel") {
      if (excelLoading) {
        return (
          <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
            <div className="mb-4">
              <div className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-primary/20 mb-2">
                <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
              </div>
              <p className="text-sm text-muted-foreground/60">Loading spreadsheet data...</p>
            </div>
          </div>
        );
      }

      if (excelHtml) {
        return (
          <div className="space-y-6">
            <div className="overflow-x-auto">
              <div className="space-y-4" dangerouslySetInnerHTML={{ __html: excelHtml }} />
            </div>
          </div>
        );
      }

      return (
        <div className="flex min-h-[60vh] flex-col items-center justify-center p-8">
          <div className="mb-4">
            <div className="w-12 h-12 flex items-center justify-center rounded-full border-2 border-primary/20 mb-2">
              <div className="w-8 h-8 border-2 border-primary border-t-transparent rounded-full animate-spin"></div>
            </div>
            <p className="text-sm text-muted-foreground/60">Preparing spreadsheet preview...</p>
          </div>
        </div>
      );
    }

    if (kind === "pdf") {
      return (
        <div className="relative">
          <iframe
            title="PDF preview"
            className={`w-full ${fullScreen ? "h-[calc(100vh-80px)]" : "h-[60vh]"} min-h-[400px] rounded-xl border-0 shadow-lg bg-white`}
            src={src}
          />
        </div>
      );
    }

    if (kind === "office") {
      const isLocal =
        window.location.hostname === "localhost" ||
        window.location.hostname === "127.0.0.1" ||
        window.location.hostname === "[::1]" ||
        window.location.hostname.startsWith("192.168.") ||
        window.location.hostname.startsWith("10.");

      if (isLocal) {
        return (
          <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center bg-muted/60 dark:bg-slate-950 rounded-xl">
            <div className="mb-6">
              <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-amber-50 dark:bg-amber-950/30 mx-auto mb-4 border border-amber-200 dark:border-amber-900/30">
                <Icon name="alert-triangle" size={28} className="text-amber-500" />
              </div>
              <p className="text-lg font-medium text-foreground dark:text-slate-200">Local Preview Restricted</p>
              <p className="text-sm text-muted-foreground/80 mt-2 max-w-sm mx-auto">
                Microsoft Office documents can only be previewed when hosted on a publicly reachable live server. Please download the file to view its contents locally.
              </p>
            </div>
            {allowDownload && (
              <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
                <a href={src} target="_blank" rel="noreferrer" download>
                  <Icon name="download" size={16} className="mr-2" />
                  Download File
                </a>
              </Button>
            )}
          </div>
        );
      }

      return (
        <div className="relative">
          <iframe
            title="Office Document Preview"
            className={`w-full ${fullScreen ? "h-[calc(100vh-80px)]" : "h-[60vh]"} min-h-[400px] rounded-xl border-0 shadow-lg bg-white`}
            src={`https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(src)}`}
          />
        </div>
      );
    }

    if (kind === "image") {
      return (
        <div className="flex min-h-[40vh] items-center justify-center p-4 bg-muted/60 dark:bg-slate-950 rounded-xl overflow-hidden">
          <img
            src={src}
            alt={attachment.filename}
            className={`max-w-full ${fullScreen ? "max-h-[calc(100vh-100px)]" : "max-h-[60vh]"} object-contain rounded-lg shadow-md`}
            onError={() => setFailed(true)}
          />
        </div>
      );
    }

    // "other" / word / powerpoint / docx / unsupported types
    return (
      <div className="flex min-h-[50vh] flex-col items-center justify-center p-8 text-center">
        <div className="mb-6">
          <div className="w-16 h-16 flex items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800 mx-auto mb-4">
            <Icon name="file-text" size={28} className="text-muted-foreground/80" />
          </div>
          <p className="text-lg font-medium text-foreground dark:text-slate-200">Preview not available</p>
          <p className="text-sm text-muted-foreground/80 mt-2 max-w-sm mx-auto">
            Previewing is not supported for {attachment.filename.split('.').pop()?.toUpperCase()} files. Please download the file to view its contents.
          </p>
        </div>
        {allowDownload && (
          <Button asChild className="bg-emerald-600 hover:bg-emerald-700 text-white">
            <a href={src} target="_blank" rel="noreferrer" download>
              <Icon name="download" size={16} className="mr-2" />
              Download File
            </a>
          </Button>
        )}
      </div>
    );
  };

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: "var(--background)" }}>
        {/* Fullscreen header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-muted/20 bg-background/90 backdrop-blur-sm shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="eye" size={18} className="text-muted-foreground shrink-0" />
            <span className="font-medium text-foreground truncate">{attachment.filename}</span>
            <span className="text-xs text-muted-foreground/60 shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {allowDownload && (
              <a href={src} target="_blank" rel="noreferrer" download className="flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-hover">
                <Icon name="external-link" size={16} />
                Open in New Tab
              </a>
            )}
            <button
              onClick={() => setFullScreen(false)}
              className="p-2 rounded-hover hover:bg-muted/50 transition-colors"
            >
              <Icon name="minimize-2" size={18} className="text-muted-foreground hover:text-foreground" />
            </button>
            <button
              onClick={() => { setFullScreen(false); onOpenChange(false); }}
              className="p-2 rounded-hover hover:bg-red-50 hover:text-red-600 transition-colors"
            >
              <Icon name="x" size={18} className="text-red-500 hover:text-red-600" />
            </button>
          </div>
        </div>
        {/* Fullscreen content */}
        <div className="flex-1 min-h-0 overflow-hidden">
          {renderContent()}
        </div>
      </div>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="p-0 w-full h-full max-w-[90vw] max-h-[90vh] [&>button]:hidden">
        <DialogHeader className="px-5 py-3 border-b border-border shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base min-w-0">
              <Icon name="eye" size={16} className="text-emerald-500 shrink-0" />
              <span className="truncate">{attachment.filename}</span>
            </DialogTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setFullScreen(true)}
                className="surface rounded-lg px-3 py-1.5 text-xs font-medium text-foreground/80 hover:shadow-md transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="maximize-2" size={14} /> Full view
              </button>
              <button
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-muted-foreground/80 hover:text-red-500 hover:bg-red-50 transition-all"
              >
                <Icon name="x" size={18} />
              </button>
            </div>
          </div>
          <DialogDescription>View-only preview — no download required.</DialogDescription>
        </DialogHeader>

        <div className="flex-1 min-h-0 bg-slate-100 dark:bg-slate-900">
          {renderContent()}
        </div>

        <div className="px-5 py-3 border-t border-border flex items-center justify-between shrink-0">
          <span className="text-xs text-muted-foreground/80">{(attachment.size / 1024).toFixed(0)} KB</span>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => onOpenChange(false)}>Close</Button>
            {allowDownload && (
              <Button asChild variant="outline">
                <a href={src} target="_blank" rel="noreferrer" download>
                  <Icon name="download" size={16} className="mr-2" /> Download
                </a>
              </Button>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

export function useDocumentViewer(allowDownload = true, startFullScreen = false) {
  const [attachment, setAttachment] = useState<ViewerAttachment | null>(null);
  const open = (a: ViewerAttachment) => setAttachment(a);
  const node = (
    <DocumentViewer
      attachment={attachment}
      open={!!attachment}
      onOpenChange={(v) => { if (!v) setAttachment(null); }}
      allowDownload={allowDownload}
      startFullScreen={startFullScreen}
    />
  );
  return { open, node };
}

export function viewerAttachmentUrl(materialId: string, attachmentId: string, code?: string): string {
  const base = `/api/library/public/${materialId}/attachments/${attachmentId}`;
  return code ? `${base}?code=${encodeURIComponent(code)}` : base;
}

export function viewerIcon(type: string) {
  const t = type.toLowerCase();
  if (IMAGE_TYPES.includes(t)) return <Icon name="file-text" size={16} className="text-sky-500" />;
  return <Icon name="file-text" size={16} className="text-emerald-500" />;
}
