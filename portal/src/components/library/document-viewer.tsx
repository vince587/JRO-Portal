import { useState, useEffect } from "react";
import * as XLSX from "xlsx";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Icon } from "@/components/ui/icon";

export interface ViewerAttachment {
  id: string;
  filename: string;
  type: string;
  size: number;
  url: string;
}

const IMAGE_TYPES = ["png", "jpg", "jpeg", "gif", "webp", "bmp", "svg"];
const EXCEL_TYPES = ["xls", "xlsx"];

function absolute(url: string): string {
  if (url.startsWith("http://") || url.startsWith("https://")) return url;
  return `${window.location.origin}${url.startsWith("/") ? "" : "/"}${url}`;
}

type ViewerKind = "pdf" | "image" | "excel" | "other";

function resolve(att: ViewerAttachment): { kind: ViewerKind; src: string } {
  const t = att.type.toLowerCase();
  if (t === "pdf") return { kind: "pdf", src: absolute(att.url) };
  if (IMAGE_TYPES.includes(t)) return { kind: "image", src: absolute(att.url) };
  if (EXCEL_TYPES.includes(t)) return { kind: "excel", src: absolute(att.url) };
  return { kind: "other", src: absolute(att.url) };
}

export function DocumentViewer({
  attachment,
  open,
  onOpenChange,
  allowDownload = true,
}: {
  attachment: ViewerAttachment | null;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  allowDownload?: boolean;
}) {
  const [failed, setFailed] = useState(false);
  const [excelHtml, setExcelHtml] = useState<string | null>(null);
  const [excelLoading, setExcelLoading] = useState(false);
  const [fullScreen, setFullScreen] = useState(false);

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
        <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 p-6">
          <div className="neu-inset h-16 w-16 rounded-2xl flex items-center justify-center">
            <Icon name="alert-triangle" size={28} className="text-amber-500" />
          </div>
          <p className="text-sm text-slate-500 max-w-sm">Could not load this file.</p>
          {allowDownload && (
            <a href={src} target="_blank" rel="noreferrer" download className="neu-sm rounded-xl px-5 py-2.5 text-sm font-medium text-slate-700 hover:shadow-md transition-all inline-flex items-center gap-2">
              <Icon name="download" size={16} /> Download / Open
            </a>
          )}
        </div>
      );
    }

    if (kind === "excel") {
      if (excelLoading) {
        return (
          <div className="h-full min-h-[60vh] flex items-center justify-center">
            <div className="flex flex-col items-center gap-3">
              <div className="relative h-10 w-10">
                <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
              </div>
              <p className="text-sm text-slate-500">Loading spreadsheet...</p>
            </div>
          </div>
        );
      }
      if (excelHtml) {
        return (
          <div className="overflow-auto h-full bg-white" dangerouslySetInnerHTML={{ __html: excelHtml }} />
        );
      }
      return (
        <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 p-6">
          <div className="neu-inset h-16 w-16 rounded-2xl flex items-center justify-center">
            <Icon name="alert-triangle" size={28} className="text-amber-500" />
          </div>
          <p className="text-sm text-slate-500 max-w-sm">This file type can&apos;t be previewed here.</p>
          {allowDownload && (
            <a href={src} target="_blank" rel="noreferrer" download className="neu-sm rounded-xl px-5 py-2.5 text-sm font-medium text-slate-700 hover:shadow-md transition-all inline-flex items-center gap-2">
              <Icon name="download" size={16} /> Download / Open
            </a>
          )}
        </div>
      );
    }

    if (kind === "other") {
      return (
        <div className="h-full min-h-[60vh] flex flex-col items-center justify-center text-center gap-3 p-6">
          <div className="neu-inset h-16 w-16 rounded-2xl flex items-center justify-center">
            <Icon name="alert-triangle" size={28} className="text-amber-500" />
          </div>
          <p className="text-sm text-slate-500 max-w-sm">This file type can&apos;t be previewed here.</p>
          {allowDownload && (
            <a href={src} target="_blank" rel="noreferrer" download className="neu-sm rounded-xl px-5 py-2.5 text-sm font-medium text-slate-700 hover:shadow-md transition-all inline-flex items-center gap-2">
              <Icon name="download" size={16} /> Download / Open
            </a>
          )}
        </div>
      );
    }

    return (
      <iframe
        key={src}
        src={src}
        title={attachment.filename}
        referrerPolicy="no-referrer"
        onError={() => setFailed(true)}
        className="w-full h-full bg-white border-0"
      />
    );
  };

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-[9999] flex flex-col" style={{ backgroundColor: "var(--neu-bg)" }}>
        {/* Fullscreen header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-gray-200/60 shrink-0">
          <div className="flex items-center gap-3 min-w-0">
            <Icon name="eye" size={16} className="text-emerald-500 shrink-0" />
            <span className="text-sm font-semibold text-slate-700 truncate">{attachment.filename}</span>
            <span className="text-xs text-slate-400 shrink-0">{(attachment.size / 1024).toFixed(0)} KB</span>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {allowDownload && (
              <a href={src} target="_blank" rel="noreferrer" download className="neu-sm rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:shadow-md transition-all inline-flex items-center gap-1.5">
                <Icon name="download" size={14} /> Download
              </a>
            )}
            <button
              onClick={() => setFullScreen(false)}
              className="neu-sm rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:shadow-md transition-all inline-flex items-center gap-1.5"
            >
              <Icon name="minimize-2" size={14} /> Exit
            </button>
            <button
              onClick={() => { setFullScreen(false); onOpenChange(false); }}
              className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
            >
              <Icon name="x" size={18} />
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
    <Dialog open={open} onOpenChange={(v) => { if (!v) { setFailed(false); setExcelHtml(null); setFullScreen(false); } onOpenChange(v); }}>
      <DialogContent className="flex flex-col p-0 gap-0 overflow-hidden sm:max-w-4xl max-h-[92vh] [&>[data-radix-dialog-close]]:hidden">
        <DialogHeader className="px-5 py-3 border-b border-gray-200/60 shrink-0">
          <div className="flex items-center justify-between">
            <DialogTitle className="flex items-center gap-2 text-base min-w-0">
              <Icon name="eye" size={16} className="text-emerald-500 shrink-0" />
              <span className="truncate">{attachment.filename}</span>
            </DialogTitle>
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                onClick={() => setFullScreen(true)}
                className="neu-sm rounded-lg px-3 py-1.5 text-xs font-medium text-slate-600 hover:shadow-md transition-all inline-flex items-center gap-1.5"
              >
                <Icon name="maximize-2" size={14} /> Full view
              </button>
              <button
                onClick={() => onOpenChange(false)}
                className="h-8 w-8 rounded-lg flex items-center justify-center text-slate-400 hover:text-red-500 hover:bg-red-50 transition-all"
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

        <div className="px-5 py-3 border-t border-gray-200/60 flex items-center justify-between shrink-0">
          <span className="text-xs text-slate-400">{(attachment.size / 1024).toFixed(0)} KB</span>
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

export function useDocumentViewer(allowDownload = true) {
  const [attachment, setAttachment] = useState<ViewerAttachment | null>(null);
  const open = (a: ViewerAttachment) => setAttachment(a);
  const node = (
    <DocumentViewer
      attachment={attachment}
      open={!!attachment}
      onOpenChange={(v) => { if (!v) setAttachment(null); }}
      allowDownload={allowDownload}
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
