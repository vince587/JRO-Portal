import { useState, useEffect, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { useQueryClient } from "@tanstack/react-query";
import { Icon } from "@/components/ui/icon"

import {
  useGetProject,
  useUpdateProject,
  useCreateProject,
  useDeleteProject,
  getGetProjectQueryKey,
  getListProjectsQueryKey,
  getGetProjectsSummaryQueryKey,
} from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Slider } from "@/components/ui/slider";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useUploadProgress } from "@/hooks/use-upload-progress";
import { UploadProgressOverlay, SaveProgressIndicator } from "@/components/upload-progress";
import { useAuth } from "@/lib/auth-context";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Progress } from "@/components/ui/progress";

const projectSchema = z.object({
  title: z.string().min(1, "Title is required"),
  description: z.string().optional().nullable(),
  status: z.enum(["planning", "active", "on_hold", "completed", "cancelled"] as const),
  priority: z.enum(["low", "medium", "high", "critical"] as const),
  startDate: z.string().min(1, "Start date is required"),
  endDate: z.string().optional().nullable(),
  projectManager: z.string().optional().nullable(),
  clientName: z.string().optional().nullable(),
  progress: z.number().min(0).max(100),
});

type ProjectFormValues = z.infer<typeof projectSchema>;

const MONTHS = [
  "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
  "JAN", "FEB", "MAR", "APR", "MAY", "JUNE",
];
const MONTH_YEARS = [
  "2026","2026","2026","2026","2026","2026","2026","2026","2026",
  "2027","2027","2027","2027","2027","2027",
];
const MONTH_RANGES = [
  "1–30","1–31","1–30","1–31","1–31","1–30","1–31","1–30","1–31",
  "1–31","1–28","1–31","1–30","1–31","1–30",
];
const WEEK_LABELS = ["W1","W2","W3","W4"];
const STATUS_OPTIONS = ["not_started", "in_progress", "complete", "on_hold", "overdue"] as const;
const PRIORITY_OPTIONS = ["low", "medium", "high"] as const;

const STATUS_COLORS: Record<string, string> = {
  not_started: "bg-slate-600 text-white",
  in_progress: "bg-blue-700 text-white",
  complete: "bg-emerald-700 text-white",
  on_hold: "bg-amber-600 text-white",
  overdue: "bg-red-700 text-white",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-muted/600 text-white",
  medium: "bg-amber-600 text-white",
  high: "bg-red-700 text-white",
};



const GANTT_BG: Record<string, string> = {
  not_started: "bg-slate-300",
  in_progress: "bg-blue-500",
  complete: "bg-emerald-500",
  on_hold: "bg-amber-400",
  overdue: "bg-red-500",
};

const GANTT_FG: Record<string, string> = {
  not_started: "text-slate-800",
  in_progress: "text-white",
  complete: "text-white",
  on_hold: "text-amber-900",
  overdue: "text-white",
};

function ProjectGanttTasks({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newTask, setNewTask] = useState("");
  const { toast } = useToast();

  const load = async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/gantt-tasks`);
      if (r.ok) {
        const data = await r.json();
        if (data.length === 0) {
          const seeded = await fetch(`/api/projects/${projectId}/gantt-tasks/seed`, { method: "POST" });
          if (seeded.ok) setItems(await seeded.json());
          else setItems([]);
        } else {
          setItems(data);
        }
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const update = async (id: string, field: string, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    await fetch(`/api/projects/${projectId}/gantt-tasks/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  };

  const remove = async (id: string) => {
    await fetch(`/api/projects/${projectId}/gantt-tasks/${id}`, { method: "DELETE" });
    load();
  };

  const add = async () => {
    if (!newTask.trim()) return;
    const r = await fetch(`/api/projects/${projectId}/gantt-tasks`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ task: newTask.trim(), weeks: "0".repeat(60) }),
    });
    if (r.ok) { setNewTask(""); load(); }
    else {
      const err = await r.json().catch(() => ({ error: "Unknown error" }));
      toast({ title: "Failed to add task", description: err.error, variant: "destructive" });
    }
  };

  const toggleAtRisk = async (id: string, current: boolean) => {
    update(id, "atRisk", !current);
  };

  function toggleWeek(weeks: string | undefined, idx: number): string {
    const w = (weeks || "0".repeat(60)).split("");
    w[idx] = w[idx] === "1" ? "0" : "1";
    return w.join("");
  }

  const [printMode, setPrintMode] = useState(false);

  const handlePrint = () => {
    setPrintMode(true);
    setTimeout(() => { window.print(); setPrintMode(false); }, 200);
  };

  const defaultWidths: Record<string, number> = {
    atRisk: 48, status: 80, priority: 80, task: 220,
    remarks: 120, assignedTo: 96, pctDone: 64, del: 32,
  };
  const [colWidths, setColWidths] = useState<Record<string, number>>(defaultWidths);
  const [resizing, setResizing] = useState<{ key: string; startX: number; startW: number } | null>(null);

  useEffect(() => {
    if (!resizing) return;
    document.body.style.userSelect = "none";
    document.body.style.cursor = "col-resize";
    const onMouseMove = (e: MouseEvent) => {
      const delta = e.clientX - resizing.startX;
      const newW = Math.max(30, resizing.startW + delta);
      setColWidths(p => ({ ...p, [resizing.key]: newW }));
    };
    const onMouseUp = () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      setResizing(null);
    };
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      document.body.style.userSelect = "";
      document.body.style.cursor = "";
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [resizing]);

  const colCount = 4 + MONTHS.length + 4;

  if (loading) {
    return <Card className="surface rounded-lg"><CardContent className="p-6"><Skeleton className="h-64 w-full" /></CardContent></Card>;
  }

  return (
    <>
      <style>{`
        @media print {
          body * { visibility: hidden; }
          .print-gantt, .print-gantt * { visibility: visible; }
          .print-gantt { position: absolute; left: 0; top: 0; width: 100%; }
          .print-gantt .no-print { display: none !important; }
          .print-gantt table { font-size: 8px !important; }
          .print-gantt th, .print-gantt td { padding: 2px 4px !important; }
          .print-gantt .sticky { position: static !important; }
          .print-gantt input, .print-gantt select { border: none !important; background: none !important; padding: 0 !important; }
          .print-gantt .hide-print { display: none !important; }
        }
      `}</style>
      <Card className={`surface rounded-lg ${printMode ? "print-gantt" : ""}`}>
        <CardHeader className="border-b bg-muted/20 flex items-center justify-between no-print">
          <CardTitle className="text-lg flex items-center gap-2">
            <Icon name="calendar-range" className="text-orange-500" size={20} />
            Project Timeline ({items.length} tasks)
          </CardTitle>
          <div className="flex items-center ml-auto text-xs">
            <Button size="sm" variant="outline" onClick={handlePrint} className="gap-1.5">
              <Icon name="printer" size={14} /> Print
            </Button>
          </div>
        </CardHeader>
        <CardContent className="p-0 overflow-auto">
          <table className="w-full text-[11px] border-collapse">
            <thead>
              <tr className="bg-muted/30 sticky top-0 z-10">
                <th className="sticky left-0 bg-muted/30 z-20 px-1.5 py-1.5 border-r text-center font-medium text-muted-foreground" style={{ width: colWidths.atRisk, minWidth: colWidths.atRisk }}>
                  AT RISK
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "atRisk", startX: e.clientX, startW: colWidths.atRisk }); }} />
                </th>
                <th className="sticky left-0 bg-muted/30 z-20 px-1.5 py-1.5 border-r text-center font-medium text-muted-foreground" style={{ width: colWidths.status, minWidth: colWidths.status, left: colWidths.atRisk }}>
                  STATUS
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "status", startX: e.clientX, startW: colWidths.status }); }} />
                </th>
                <th className="sticky left-0 bg-muted/30 z-20 px-1.5 py-1.5 border-r text-center font-medium text-muted-foreground" style={{ width: colWidths.priority, minWidth: colWidths.priority, left: colWidths.atRisk + colWidths.status }}>
                  PRIORITY
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "priority", startX: e.clientX, startW: colWidths.priority }); }} />
                </th>
                <th className="sticky left-0 bg-muted/30 z-20 px-1.5 py-1.5 border-r text-left font-medium text-muted-foreground" style={{ width: colWidths.task, minWidth: colWidths.task, left: colWidths.atRisk + colWidths.status + colWidths.priority }}>
                  TASK
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "task", startX: e.clientX, startW: colWidths.task }); }} />
                </th>
                {MONTHS.map((m, i) => (
                  <th key={i} colSpan={4} className={`px-1 py-1 text-center font-medium text-muted-foreground border-r ${MONTH_YEARS[i] === "2027" && MONTHS[i+1] ? "border-l-2 border-l-amber-400" : ""}`}>
                    {m}
                    <div className="text-[9px] text-muted-foreground/70">{MONTH_YEARS[i]}</div>
                    <div className="text-[8px] text-muted-foreground/50">{MONTH_RANGES[i]}</div>
                  </th>
                ))}
                <th className="px-1.5 py-1.5 border-r text-left font-medium text-muted-foreground relative" style={{ width: colWidths.remarks, minWidth: colWidths.remarks }}>
                  REMARKS
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "remarks", startX: e.clientX, startW: colWidths.remarks }); }} />
                </th>
                <th className="px-1.5 py-1.5 border-r text-left font-medium text-muted-foreground relative" style={{ width: colWidths.assignedTo, minWidth: colWidths.assignedTo }}>
                  ASSIGNED TO
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "assignedTo", startX: e.clientX, startW: colWidths.assignedTo }); }} />
                </th>
                <th className="px-1.5 py-1.5 text-center font-medium text-muted-foreground relative" style={{ width: colWidths.pctDone, minWidth: colWidths.pctDone }}>
                  % DONE
                  <div className="absolute right-0 top-0 bottom-0 w-1.5 cursor-col-resize select-none z-30 hover:bg-blue-400/50" onMouseDown={e => { e.preventDefault(); setResizing({ key: "pctDone", startX: e.clientX, startW: colWidths.pctDone }); }} />
                </th>
                <th className="px-1.5 py-1.5 no-print" style={{ width: colWidths.del, minWidth: colWidths.del }} />
              </tr>
              <tr className="bg-muted/20 sticky top-[50px] z-10">
                <th colSpan={4} className="sticky left-0 bg-muted/20 z-20 border-r" />
                {MONTHS.map((_, i) => WEEK_LABELS.map(w => (
                  <th key={`${i}-${w}`} className="px-0.5 py-1 text-center text-[9px] font-medium text-muted-foreground border-r">{w}</th>
                )))}
                <th className="border-r" />
                <th className="border-r" />
                <th />
                <th className="no-print" />
              </tr>
            </thead>
            <tbody>
              {items.map(item => {
                const status = item.status || "not_started";
                return (
                  <tr key={item.id} className="border-b hover:bg-muted/10 group">
                    <td className="sticky left-0 bg-background group-hover:bg-muted/10 z-10 px-1.5 py-1 border-r text-center" style={{ width: colWidths.atRisk, minWidth: colWidths.atRisk }}>
                      <input type="checkbox" checked={item.atRisk || false}
                        onChange={() => toggleAtRisk(item.id, item.atRisk)}
                        className="accent-red-500" />
                    </td>
                    <td className={`sticky z-10 border-r ${STATUS_COLORS[status] || "bg-background"} group-hover:brightness-90`} style={{ width: colWidths.status, minWidth: colWidths.status, left: colWidths.atRisk, padding: 0 }}>
                      <select className="w-full h-full appearance-none border-0 bg-transparent px-1 py-1 text-[10px] text-white cursor-pointer"
                        value={item.status} onChange={e => update(item.id, "status", e.target.value)}>
                        {STATUS_OPTIONS.map(s => <option key={s} value={s} className="bg-background text-foreground">{s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</option>)}
                      </select>
                    </td>
                    <td className={`sticky z-10 border-r ${PRIORITY_COLORS[item.priority] || "bg-background"} group-hover:brightness-90`} style={{ width: colWidths.priority, minWidth: colWidths.priority, left: colWidths.atRisk + colWidths.status, padding: 0 }}>
                      <select className="w-full h-full appearance-none border-0 bg-transparent px-1 py-1 text-[10px] text-white cursor-pointer"
                        value={item.priority} onChange={e => update(item.id, "priority", e.target.value)}>
                        {PRIORITY_OPTIONS.map(p => <option key={p} value={p} className="bg-background text-foreground">{p.charAt(0).toUpperCase() + p.slice(1)}</option>)}
                      </select>
                    </td>
                    <td className="sticky z-10 px-1.5 py-1 border-r bg-background group-hover:bg-muted/10" style={{ width: colWidths.task, minWidth: colWidths.task, left: colWidths.atRisk + colWidths.status + colWidths.priority, overflow: "hidden" }}>
                      <textarea
                        ref={el => { if (el) { el.style.height = "auto"; el.style.height = el.scrollHeight + "px"; } }}
                        className="w-full bg-transparent border-none outline-none text-[11px] font-medium resize-none p-0 leading-tight"
                        style={{ wordBreak: "break-word", overflowWrap: "break-word", whiteSpace: "pre-wrap", width: "100%", maxWidth: "100%", boxSizing: "border-box", overflow: "hidden" }}
                        rows={1}
                        value={item.task}
                        onChange={e => { update(item.id, "task", e.target.value); }}
                      />
                    </td>
                    {MONTHS.map((_, mi) => WEEK_LABELS.map((w, wi) => {
                      const idx = mi * 4 + wi;
                      const active = (item.weeks || "0".repeat(60))[idx] === "1";
                      return (
                        <td key={`${mi}-${wi}`}
                          className={`px-0 py-0.5 border-r text-center ${active ? GANTT_BG[status] + " " + GANTT_FG[status] : ""}`}
                          onClick={() => update(item.id, "weeks", toggleWeek(item.weeks, idx))}
                          title={active ? `${MONTHS[mi]} ${w} - Click to remove` : `${MONTHS[mi]} ${w} - Click to add`}
                        >
                          {active ? <div className="flex items-center justify-center min-h-[18px] font-bold text-[10px]">{w}</div> : <div className="min-h-[18px] opacity-30 text-[9px] flex items-center justify-center">·</div>}
                        </td>
                      );
                    }))}
                    <td className="px-1.5 py-1 border-r" style={{ width: colWidths.remarks, minWidth: colWidths.remarks }}>
                      <div className="overflow-hidden" style={{ width: "100%", maxWidth: colWidths.remarks }}>
                        <input className="w-full bg-transparent border-none outline-none text-[11px] whitespace-nowrap"
                          value={item.remarks || ""} onChange={e => update(item.id, "remarks", e.target.value)}
                          placeholder="—" />
                      </div>
                    </td>
                    <td className="px-1.5 py-1 border-r" style={{ width: colWidths.assignedTo, minWidth: colWidths.assignedTo }}>
                      <div className="overflow-hidden" style={{ width: "100%", maxWidth: colWidths.assignedTo }}>
                        <input className="w-full bg-transparent border-none outline-none text-[11px] whitespace-nowrap"
                          value={item.assignedTo || ""} onChange={e => update(item.id, "assignedTo", e.target.value)}
                          placeholder="—" />
                      </div>
                    </td>
                    <td className="px-1.5 py-1 text-center" style={{ width: colWidths.pctDone, minWidth: colWidths.pctDone }}>
                      <input className="w-full text-center bg-transparent border-none outline-none text-[11px] font-mono"
                        type="number" min={0} max={100}
                        value={item.percentDone ?? 0}
                        onChange={e => update(item.id, "percentDone", Number(e.target.value))} />
                    </td>
                    <td className="px-1.5 py-1 text-center no-print" style={{ width: colWidths.del, minWidth: colWidths.del }}>
                      <button onClick={() => remove(item.id)} className="text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity">
                        <Icon name="trash-2" size={12} />
                      </button>
                    </td>
                  </tr>
                );
              })}
              {items.length === 0 && (
                <tr><td colSpan={colCount} className="text-center py-8 text-muted-foreground text-xs">No tasks yet.</td></tr>
              )}
            </tbody>
          </table>
        </CardContent>
        <div className="p-3 border-t no-print">
          <div className="flex gap-2">
            <Input placeholder="Add a task..." value={newTask} onChange={e => setNewTask(e.target.value)}
              onKeyDown={e => e.key === "Enter" && add()} className="flex-1 text-sm h-8" />
            <Button size="sm" onClick={add} disabled={!newTask.trim()}><Icon name="plus" className="mr-1" size={14} />Add</Button>
          </div>
        </div>
      </Card>
    </>
  );
}

function ProjectUpload({ projectId, projectTitle, uploadProgress }: { projectId: string | number; projectTitle?: string; uploadProgress: ReturnType<typeof useUploadProgress> }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();

  const handleUpload = async () => {
    const file = fileRef.current?.files?.[0];
    if (!file) return;
    const formData = new FormData();
    formData.append("file", file);
    uploadProgress.startUpload(file.name, file.size);
    try {
      const res = await uploadProgress.uploadWithProgress(`/api/upload/project/${projectId}`, formData);
      if (res.ok) {
        toast({ title: "File uploaded", description: file.name });
        if (fileRef.current) fileRef.current.value = "";
      } else {
        toast({ title: "Upload failed", variant: "destructive" });
      }
    } catch { toast({ title: "Upload failed", variant: "destructive" }); }
  };

  return (
    <Card className="surface rounded-lg">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon name="paperclip" className="text-indigo-500" size={20} />
          Document Attachments
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4">
        <div className="flex items-center gap-2">
          <input type="file" ref={fileRef} className="flex-1 text-sm file:mr-3 file:py-2 file:px-4 file:rounded-md file:border-0 file:bg-primary/10 file:text-primary file:text-sm file:font-medium" />
          <Button size="sm" onClick={handleUpload} disabled={uploadProgress.uploading}>
            <Icon name="upload" className="mr-1" size={16} />
            {uploadProgress.uploading ? `${uploadProgress.progress}%` : "Upload"}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}

const CHECKLIST_ITEMS = [
  { key: "existing_forms_internal", label: "Existing Forms (Internal)" },
  { key: "existing_forms_external", label: "Existing Forms (External)" },
  { key: "hd_logo", label: "HD Logo" },
  { key: "company_profile", label: "Company Profile" },
  { key: "legal_permits", label: "Legal Permits" },
  { key: "job_description", label: "Job Description" },
  { key: "org_chart", label: "Org Chart" },
];

function ProjectChecklist({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/checklist`);
      if (r.ok) {
        const data = await r.json();
        if (data.length === 0) {
          const created = await Promise.all(
            CHECKLIST_ITEMS.map(item =>
              fetch(`/api/projects/${projectId}/checklist`, {
                method: "POST", headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ itemType: item.key, status: "missing" }),
              }).then(r => r.json())
            )
          );
          setItems(created);
        } else {
          setItems(data);
        }
      }
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const updateItem = async (id: string, field: string, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    await fetch(`/api/projects/${projectId}/checklist/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  };

  return (
    <Card className="surface rounded-lg">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon name="clipboard-check" className="text-emerald-500" size={20} />
          Client Document Checklist
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        {loading ? (
          <div className="p-6 space-y-3">
            {Array(7).fill(0).map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
          </div>
        ) : (
          <table className="w-full text-sm">
            <thead><tr className="border-b bg-muted/30">
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Item</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground w-36">Status</th>
              <th className="text-left px-4 py-2 font-medium text-muted-foreground">Notes</th>
            </tr></thead>
            <tbody>
              {items.map(item => {
                const info = CHECKLIST_ITEMS.find(i => i.key === item.itemType);
                return (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-4 py-2.5 font-medium">{info?.label || item.itemType}</td>
                    <td className="px-4 py-2.5">
                      <select
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        value={item.status}
                        onChange={e => updateItem(item.id, "status", e.target.value)}
                      >
                        {["missing", "received", "reviewed", "approved"].map(s => (
                          <option key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</option>
                        ))}
                      </select>
                    </td>
                    <td className="px-4 py-2.5">
                      <input
                        className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        value={item.notes || ""}
                        onChange={e => updateItem(item.id, "notes", e.target.value)}
                        placeholder="Add notes..."
                      />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </CardContent>
    </Card>
  );
}

function ProjectDepartmentTargets({ projectId }: { projectId: string }) {
  const [items, setItems] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [newDept, setNewDept] = useState("");

  const load = async () => {
    try {
      const r = await fetch(`/api/projects/${projectId}/department-targets`);
      if (r.ok) setItems(await r.json());
    } catch { /* ignore */ } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [projectId]);

  const add = async () => {
    if (!newDept.trim()) return;
    const r = await fetch(`/api/projects/${projectId}/department-targets`, {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ department: newDept.trim(), target: 0, actual: 0 }),
    });
    if (r.ok) { setNewDept(""); load(); }
  };

  const update = async (id: string, field: string, value: any) => {
    setItems(prev => prev.map(i => i.id === id ? { ...i, [field]: value } : i));
    await fetch(`/api/projects/${projectId}/department-targets/${id}`, {
      method: "PATCH", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ [field]: value }),
    });
  };

  const remove = async (id: string) => {
    await fetch(`/api/projects/${projectId}/department-targets/${id}`, { method: "DELETE" });
    load();
  };

  return (
    <Card className="surface rounded-lg">
      <CardHeader className="border-b bg-muted/20">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon name="target" className="text-indigo-500" size={20} />
          Targets per Department
        </CardTitle>
      </CardHeader>
      <CardContent className="p-4 space-y-3">
        {loading ? (
          <div className="space-y-2"><Skeleton className="h-8 w-full" /><Skeleton className="h-8 w-full" /></div>
        ) : (
          <>
            <table className="w-full text-sm">
              <thead><tr className="border-b bg-muted/30">
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Department</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Target</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground w-24">Actual</th>
                <th className="text-left px-3 py-2 font-medium text-muted-foreground">Notes</th>
                <th className="w-10 px-3 py-2" />
              </tr></thead>
              <tbody>
                {items.map(item => (
                  <tr key={item.id} className="border-b last:border-0 hover:bg-muted/20">
                    <td className="px-3 py-2">{item.department}</td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        value={item.target ?? 0}
                        onChange={e => update(item.id, "target", Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-2">
                      <input type="number" min={0} className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        value={item.actual ?? 0}
                        onChange={e => update(item.id, "actual", Number(e.target.value))} />
                    </td>
                    <td className="px-3 py-2">
                      <input className="w-full rounded border border-input bg-background px-2 py-1 text-xs"
                        value={item.notes || ""}
                        onChange={e => update(item.id, "notes", e.target.value)}
                        placeholder="Notes..." />
                    </td>
                    <td className="px-3 py-2">
                      <button onClick={() => remove(item.id)} className="text-muted-foreground hover:text-destructive"><Icon name="trash-2" size={14} /></button>
                    </td>
                  </tr>
                ))}
                {items.length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-xs">No departments added yet.</td></tr>
                )}
              </tbody>
            </table>
            <div className="flex gap-2 pt-1">
              <Input placeholder="Department name..." value={newDept} onChange={e => setNewDept(e.target.value)}
                onKeyDown={e => e.key === "Enter" && add()} className="flex-1" />
              <Button size="sm" onClick={add} disabled={!newDept.trim()}><Icon name="plus" className="mr-1" size={14} />Add</Button>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

function ClientProgressCard({ projectId, project }: { projectId: string; project: any }) {
  const [progress, setProgress] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  useEffect(() => {
    (async () => {
      try {
        const r = await fetch(`/api/projects/${projectId}/client-progress?token=${project.shareToken || ""}`);
        if (r.ok) setProgress(await r.json());
      } catch { /* ignore */ } finally { setLoading(false); }
    })();
  }, [projectId, project.shareToken]);

  const generateShare = async () => {
    const r = await fetch(`/api/projects/${projectId}/share`, { method: "POST" });
    if (r.ok) {
      const data = await r.json();
      setProgress((p: any) => ({ ...p, shareToken: data.shareToken }));
      const link = `${window.location.origin}/client-progress/${projectId}?token=${data.shareToken}`;
      await navigator.clipboard.writeText(link);
      toast({ title: "Share link copied!", description: link });
      window.location.reload();
    }
  };

  const copyLink = () => {
    const token = progress?.shareToken || project.shareToken;
    if (!token) return;
    const link = `${window.location.origin}/client-progress/${projectId}?token=${token}`;
    navigator.clipboard.writeText(link);
    toast({ title: "Link copied!" });
  };

  if (loading) return <Card className="surface rounded-lg"><CardContent className="p-6"><Skeleton className="h-32 w-full" /></CardContent></Card>;

  return (
    <Card className="surface rounded-lg">
      <CardHeader className="border-b bg-muted/20 flex flex-row items-center justify-between">
        <CardTitle className="text-lg flex items-center gap-2">
          <Icon name="eye" className="text-primary" size={20} />
          Client Progress
        </CardTitle>
        {project.shareToken ? (
          <Button size="sm" variant="outline" onClick={copyLink}>
            <Icon name="copy" className="mr-1" size={14} /> Copy Link
          </Button>
        ) : (
          <Button size="sm" onClick={generateShare}>
            <Icon name="share-2" className="mr-1" size={14} /> Share with Client
          </Button>
        )}
      </CardHeader>
      <CardContent className="p-4">
        {progress ? (
          <div className="grid grid-cols-3 gap-4">
            <div className="bg-primary/5 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-primary">{progress.progress}%</div>
              <div className="text-xs text-muted-foreground mt-1">Overall</div>
            </div>
            <div className="bg-emerald-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-emerald-600">{progress.checklist?.received ?? 0}/{progress.checklist?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Documents Received</div>
            </div>
            <div className="bg-blue-50 rounded-lg p-3 text-center">
              <div className="text-2xl font-bold text-blue-600">{progress.checklist?.approved ?? 0}/{progress.checklist?.total ?? 0}</div>
              <div className="text-xs text-muted-foreground mt-1">Documents Approved</div>
            </div>
          </div>
        ) : (
          <div className="text-center py-4 text-muted-foreground text-sm">
            {project.shareToken ? "Click refresh to load progress data" : "Generate a share link to enable client access"}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

export default function ProjectDetail() {
  const [, params] = useRoute("/projects/:id");
  const [location, setLocation] = useLocation();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { user } = useAuth();
  
  const idStr = params?.id;
  const isNew = !idStr || idStr === "new";
  const [createdId, setCreatedId] = useState<string | null>(null);
  const projectId = isNew ? createdId : idStr!;
  const [creating, setCreating] = useState(isNew);
  const uploadProgress = useUploadProgress();

  const { data: project, isLoading: isProjectLoading } = useGetProject(projectId as any, {
    query: {
      enabled: !!projectId && !isNew,
      queryKey: getGetProjectQueryKey(projectId as any),
    }
  });

  const createMutation = useCreateProject();
  const updateMutation = useUpdateProject();
  const deleteMutation = useDeleteProject();

  const form = useForm<ProjectFormValues>({
    resolver: zodResolver(projectSchema),
    defaultValues: {
      title: "",
      description: "",
      status: "planning",
      priority: "medium",
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      projectManager: "",
      clientName: "",
      progress: 0,
    },
  });

  useEffect(() => {
    if (!isNew) return;
    const defaults = {
      title: "New Project",
      description: "",
      status: "planning" as const,
      priority: "medium" as const,
      startDate: format(new Date(), "yyyy-MM-dd"),
      endDate: "",
      projectManager: "",
      clientName: "",
      progress: 0,
    };
    createMutation.mutate({ data: defaults as any }, {
      onSuccess: (newProject: any) => {
        setCreatedId(newProject.id);
        setCreating(false);
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectsSummaryQueryKey() });
        form.reset(defaults);
      },
      onError: () => {
        toast({ title: "Error creating project", variant: "destructive" });
        setCreating(false);
      }
    });
  }, []);

  const initRef = useRef<number | null>(null);

  useEffect(() => {
    if (project && !isNew && initRef.current !== project.id) {
      initRef.current = project.id;
      form.reset({
        title: project.title,
        description: project.description || "",
        status: project.status as any,
        priority: project.priority as any || "medium",
        startDate: project.startDate.split('T')[0],
        endDate: project.endDate ? project.endDate.split('T')[0] : "",
        projectManager: project.projectManager || "",
        clientName: project.clientName || "",
        progress: project.progress || 0,
      });
    }
  }, [project, isNew, form]);

  const onSubmit = (data: ProjectFormValues) => {
    const payload = { ...data };
    if (!payload.endDate) delete payload.endDate;
    updateMutation.mutate({ id: projectId as any, data: payload as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getGetProjectQueryKey(projectId as any) });
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectsSummaryQueryKey() });
        toast({ title: "Project updated" });
      },
      onError: () => {
        toast({ title: "Error saving", variant: "destructive" });
      }
    });
  };

  const handleDelete = () => {
    deleteMutation.mutate({ id: projectId as any }, {
      onSuccess: () => {
        queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
        queryClient.invalidateQueries({ queryKey: getGetProjectsSummaryQueryKey() });
        toast({ title: "Project deleted" });
        setLocation("/projects");
      },
      onError: () => {
        toast({ title: "Error deleting project", variant: "destructive" });
      }
    });
  };

  const isLoading = (!isNew && isProjectLoading) || creating;

  if (isLoading) {
    return (
      <div className="space-y-6 max-w-4xl mx-auto p-4">
        <Skeleton className="h-10 w-64" />
        <div className="space-y-4">
          <Skeleton className="h-48 w-full" />
          <div className="grid grid-cols-2 gap-4">
            <Skeleton className="h-64" /><Skeleton className="h-64" />
          </div>
        </div>
      </div>
    );
  }

  const effectiveProject = project || (projectId ? { id: projectId, title: "New Project", shareToken: null } : null);

  return (
    <div className="space-y-6 animate-in fade-in duration-300 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <Button variant="outline" size="icon" asChild>
            <Link href="/projects">
              <Icon name="arrow-left" size={16} />
            </Link>
          </Button>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              {project?.title || "New Project"}
            </h1>
            <p className="text-muted-foreground font-medium text-sm">
              Manager: {form.watch("projectManager") || "Unassigned"}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button type="submit" form="project-form" disabled={updateMutation.isPending} variant="success">
            {updateMutation.isPending ? "Saving..." : "Save Project"}
            <Icon name="save" className="ml-2" size={16} />
          </Button>
          {!isNew && (user?.roles?.some(r => ["admin", "ADMIN", "IT"].includes(r)) || ["admin", "ADMIN", "IT"].includes(user?.role ?? "")) && (
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button variant="destructive" size="icon">
                  <Icon name="trash-2" size={16} />
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>Delete project?</AlertDialogTitle>
                  <AlertDialogDescription>
                    This will permanently delete "{project?.title}".
                    This action cannot be undone.
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>Cancel</AlertDialogCancel>
                  <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground">
                    Delete
                  </AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          )}
        </div>
      </div>

      <Form {...form}>
        <form id="project-form" onSubmit={form.handleSubmit(onSubmit)}>
          <Card className="mb-6 surface rounded-lg">
            <CardHeader className="border-b bg-muted/20 py-3">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="briefcase" className="text-indigo-500" size={16} />
                Project Details
              </CardTitle>
            </CardHeader>
            <CardContent className="p-4">
              <div className="flex flex-wrap gap-4">
                <FormField control={form.control} name="title" render={({ field }) => (
                  <FormItem className="flex-1 min-w-[250px] space-y-1">
                    <FormLabel className="text-xs">Title</FormLabel>
                    <FormControl><Input {...field} className="h-8 text-sm" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="status" render={({ field }) => (
                  <FormItem className="w-32 space-y-1">
                    <FormLabel className="text-xs">Status</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["planning", "active", "on_hold", "completed", "cancelled"].map(s => (
                          <SelectItem key={s} value={s}>{s.replace("_", " ").replace(/\b\w/g, c => c.toUpperCase())}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="priority" render={({ field }) => (
                  <FormItem className="w-28 space-y-1">
                    <FormLabel className="text-xs">Priority</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value}>
                      <FormControl><SelectTrigger className="h-8 text-sm"><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        {["low", "medium", "high", "critical"].map(s => (
                          <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="progress" render={({ field }) => (
                  <FormItem className="flex-1 min-w-[200px] space-y-1">
                    <FormLabel className="text-xs flex justify-between">Progress <span className="font-mono">{field.value}%</span></FormLabel>
                    <FormControl><Slider min={0} max={100} step={1} value={[field.value]} onValueChange={v => field.onChange(v[0])} className="pt-1" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="flex flex-wrap gap-4 mt-3">
                <FormField control={form.control} name="clientName" render={({ field }) => (
                  <FormItem className="flex-1 min-w-[180px] space-y-1">
                    <FormLabel className="text-xs">Client</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} className="h-8 text-sm" placeholder="Client name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="projectManager" render={({ field }) => (
                  <FormItem className="flex-1 min-w-[180px] space-y-1">
                    <FormLabel className="text-xs">Manager</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} className="h-8 text-sm" placeholder="Manager name" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="startDate" render={({ field }) => (
                  <FormItem className="w-36 space-y-1">
                    <FormLabel className="text-xs">Start</FormLabel>
                    <FormControl><Input type="date" {...field} className="h-8 text-sm" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
                <FormField control={form.control} name="endDate" render={({ field }) => (
                  <FormItem className="w-36 space-y-1">
                    <FormLabel className="text-xs">End</FormLabel>
                    <FormControl><Input type="date" {...field} value={field.value || ""} className="h-8 text-sm" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
              <div className="mt-3">
                <FormField control={form.control} name="description" render={({ field }) => (
                  <FormItem className="space-y-1">
                    <FormLabel className="text-xs">Description</FormLabel>
                    <FormControl><Input {...field} value={field.value || ""} className="h-8 text-sm" placeholder="Project scope & description" /></FormControl>
                    <FormMessage />
                  </FormItem>
                )} />
              </div>
            </CardContent>
          </Card>
        </form>
      </Form>

      {projectId && (
        <div className="space-y-6">
          <ClientProgressCard projectId={projectId} project={effectiveProject} />
          <ProjectGanttTasks projectId={projectId} />
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <div className="space-y-6">
              <ProjectDepartmentTargets projectId={projectId} />
              <ProjectUpload projectId={projectId} projectTitle={effectiveProject?.title} uploadProgress={uploadProgress} />
            </div>
            <div className="space-y-6">
              <ProjectChecklist projectId={projectId} />
            </div>
          </div>
        </div>
      )}
      <UploadProgressOverlay uploading={uploadProgress.uploading} progress={uploadProgress.progress} fileName={uploadProgress.fileName} fileSize={uploadProgress.fileSize} onCancel={uploadProgress.cancelUpload} />
      <SaveProgressIndicator saving={updateMutation.isPending} label="Saving..." />
    </div>
  );
}
