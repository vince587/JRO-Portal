import { useState, useEffect, useRef } from "react";
import { format, parseISO } from "date-fns";
import { Icon } from "@/components/ui/icon"
import { useMutation } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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
import { UploadProgressOverlay } from "@/components/upload-progress";
import { useAuth } from "@/lib/auth-context";
import { useDocumentViewer } from "@/components/library/document-viewer";
import { AccessEmailsManager } from "@/components/library/access-emails-manager";

type Section = "internal" | "external";
type Access = "open" | "restricted" | "disabled";
type Department = "JMCS" | "SIS" | "Both";

interface Attachment { id: string; filename: string; type: string; size: number; }
interface LibraryFolder {
  id: string;
  name: string;
  section: Section;
  parentId: string | null;
  access: Access;
  email: string | null;
  accessEmails: string[];
  participantLink: string | null;
  accessCode: string | null;
  expiresAt: string | null;
  createdAt: string;
}
interface LibraryMaterial {
  id: string;
  title: string;
  description: string | null;
  section: Section;
  department: Department | null;
  category: string | null;
  url: string | null;
  access: Access;
  email: string | null;
  accessEmails: string[];
  participantLink: string | null;
  accessCode: string | null;
  folderId: string | null;
  expiresAt: string | null;
  attachments: Attachment[];
  createdByName: string | null;
  createdAt: string;
  updatedAt: string;
}

const materialSchema = z.object({
  title: z.string().min(1, "Title is required"),
  section: z.enum(["internal", "external"]),
  department: z.enum(["JMCS", "SIS", "Both"]).optional().nullable(),
  category: z.string().optional(),
  description: z.string().optional(),
  url: z.string().optional(),
  access: z.enum(["open", "restricted", "disabled"]),
  email: z.string().optional(),
  sendEmail: z.boolean().optional(),
  folderId: z.string().optional().nullable(),
  expiresAt: z.string().optional().nullable(),
});

type MaterialFormValues = z.infer<typeof materialSchema>;

// Convert an ISO timestamp to the value a <input type="datetime-local"> expects
// (local time, "YYYY-MM-DDTHH:mm"), and back to an ISO string for the API.
function isoToLocalInput(iso: string | null | undefined): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const off = d.getTimezoneOffset();
  const local = new Date(d.getTime() - off * 60000);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(v: string | null | undefined): string | null {
  if (!v) return null;
  const d = new Date(v);
  if (Number.isNaN(d.getTime())) return null;
  return d.toISOString();
}

function attIcon(type: string) {
  const t = (type || "").toLowerCase().replace(/^\./, "");
  if (t === "pdf") return <Icon name="file-text" className="text-red-500" size={20} />;
  if (["ppt", "pptx"].includes(t)) return <Icon name="presentation" className="text-orange-500" size={20} />;
  if (["doc", "docx"].includes(t)) return <Icon name="file-text" className="text-blue-600" size={20} />;
  if (["xls", "xlsx", "csv"].includes(t)) return <Icon name="file-spreadsheet" className="text-green-600" size={20} />;
  if (["png", "jpg", "jpeg", "gif", "webp", "svg", "bmp"].includes(t)) return <Icon name="file-image" className="text-purple-500" size={20} />;
  if (["zip", "rar", "7z"].includes(t)) return <Icon name="file-up" className="text-muted-foreground" size={20} />;
  return <Icon name="file-text" className="text-muted-foreground" size={20} />;
}

function attTypeLabel(type: string): string {
  const t = (type || "").toLowerCase().replace(/^\./, "");
  if (!t) return "FILE";
  return t.toUpperCase();
}

function AttachmentList({ attachments, canEdit, onDelete, onView }: {
  attachments: Attachment[];
  canEdit: boolean;
  onDelete: (id: string) => void;
  onView: (att: Attachment) => void;
}) {
  if (attachments.length === 0) return <p className="text-xs text-muted-foreground">No attachments.</p>;
  return (
    <div className="space-y-1.5">
      {attachments.map(a => (
        <div key={a.id} className="flex items-center gap-2 text-sm bg-muted/40 rounded-md px-2 py-1.5">
          {attIcon(a.type)}
          <button type="button" onClick={() => onView(a)} className="flex-1 text-left truncate hover:underline text-foreground">
            {a.filename}
          </button>
          <span className="text-[10px] text-muted-foreground">{(a.size / 1024).toFixed(0)} KB</span>
          {canEdit && (
            <button type="button" onClick={() => onDelete(a.id)} className="text-muted-foreground hover:text-foreground" aria-label="Delete attachment">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
      ))}
    </div>
  );
}

let cachedPublicUrl: string | null = null;
let publicUrlPromise: Promise<string> | null = null;
function getPublicUrl(): Promise<string> {
  if (cachedPublicUrl) return Promise.resolve(cachedPublicUrl);
  if (!publicUrlPromise) {
    publicUrlPromise = fetch("/api/config")
      .then(r => (r.ok ? r.json() : null))
      .then(d => {
        // Participant share links point at the standalone training-materials
        // viewer (e.g. materials.jro-jmcs.com/?token=...). Fall back to the
        // app origin's /library path if the viewer URL isn't configured.
        cachedPublicUrl = (d?.publicViewerUrl && d.publicViewerUrl.trim()) ||
          (d?.publicUrl && d.publicUrl.trim()) || window.location.origin;
        return cachedPublicUrl as string;
      })
      .catch(() => window.location.origin);
  }
  return publicUrlPromise;
}

function MaterialDialog({
  open,
  onOpenChange,
  defaultSection,
  editing,
  folders,
  onSuccess,
  onCreated,
  canEdit,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  defaultSection: Section;
  editing?: LibraryMaterial | null;
  folders: LibraryFolder[];
  onSuccess: () => void;
  onCreated?: (m: LibraryMaterial) => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const isEditing = !!editing;
  const { open: openViewer } = useDocumentViewer();
  const [attachments, setAttachments] = useState<Attachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [accessEmails, setAccessEmails] = useState<string[]>([]);
  const fileRef = useRef<HTMLInputElement>(null);
  const uploadProgress = useUploadProgress();

  const form = useForm<MaterialFormValues>({
    resolver: zodResolver(materialSchema),
    defaultValues: {
      title: "",
      section: defaultSection,
      department: "JMCS",
      category: "",
      description: "",
      url: "",
      access: "open",
      email: "",
      sendEmail: false,
      folderId: null,
      expiresAt: "",
    },
  });

  useEffect(() => {
    if (!open) return;
    if (editing) {
      setAttachments(editing.attachments || []);
      setAccessEmails(editing.accessEmails ?? []);
      form.reset({
        title: editing.title,
        section: editing.section,
        department: editing.department,
        category: editing.category ?? "",
        description: editing.description ?? "",
        url: editing.url ?? "",
        access: editing.access,
        email: editing.email ?? "",
        sendEmail: false,
        folderId: editing.folderId,
        expiresAt: isoToLocalInput(editing.expiresAt),
      });
    } else {
      setAttachments([]);
      form.reset({
        title: "",
        section: defaultSection,
        department: "JMCS",
        category: "",
        description: "",
        url: "",
        access: "open",
        email: "",
        sendEmail: false,
        folderId: null,
        expiresAt: "",
      });
    }
  }, [open, editing, defaultSection, form]);

  const saveMutation = useMutation({
    mutationFn: async (data: MaterialFormValues) => {
      const body = {
        ...data,
        description: data.description || null,
        department: data.section === "internal" ? data.department ?? null : null,
        category: data.section === "external" ? data.category || null : null,
        url: data.url || null,
        access: data.section === "external" ? data.access : "open",
        email: data.email || null,
        accessEmails: data.section === "external" ? accessEmails : [],
        sendEmail: data.section === "external" ? !!data.sendEmail : false,
        folderId: data.folderId || null,
        expiresAt: data.section === "external" ? localInputToIso(data.expiresAt) : null,
      };
      const res = await fetch(editing ? `/api/library/${editing.id}` : "/api/library", {
        method: editing ? "PATCH" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = editing ? "Failed to update material" : "Failed to create material";
        try { const e = await res.json(); if (e?.error) msg = e.error; } catch {}
        throw new Error(msg);
      }
      return res.json();
    },
    onSuccess: () => {
      toast({ title: isEditing ? "Material updated" : "Material created" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast({ title: `Failed to ${isEditing ? "update" : "create"} material`, variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(`/api/library/${editing?.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete material");
    },
    onSuccess: () => {
      toast({ title: "Material deleted" });
      onOpenChange(false);
      onSuccess();
    },
    onError: () => toast({ title: "Failed to delete material", variant: "destructive" }),
  });

  const ensureSaved = async (fallbackTitle?: string): Promise<LibraryMaterial | null> => {
    if (editing) return editing;
    const v = form.getValues();
    // When attaching a file before the material is named, use the file name
    // so the auto-created material passes server-side validation.
    const title = v.title?.trim() || fallbackTitle?.replace(/\.[^.]+$/, "").trim() || "";
    const body = {
      title,
      section: v.section,
      department: v.section === "internal" ? v.department ?? null : null,
      category: v.section === "external" ? v.category || null : null,
      url: v.url || null,
      description: v.description || null,
      access: v.section === "external" ? v.access : "open",
      email: v.email || null,
      accessEmails: v.section === "external" ? accessEmails : [],
      sendEmail: false,
      folderId: v.folderId || null,
      expiresAt: v.section === "external" ? localInputToIso(v.expiresAt) : null,
    };
    try {
      const res = await fetch("/api/library", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        let msg = "Could not save material";
        try { const e = await res.json(); if (e?.error) msg = e.error; } catch {}
        toast({ title: msg, variant: "destructive" });
        return null;
      }
      const created = await res.json();
      onCreated?.(created);
      return created;
    } catch {
      return null;
    }
  };

  const uploadAttachment = async (file: File) => {
    setUploading(true);
    try {
      const mat = await ensureSaved(file.name);
      if (!mat) { setUploading(false); return; }
      const fd = new FormData();
      fd.append("file", file);
      uploadProgress.startUpload(file.name, file.size);
      const res = await uploadProgress.uploadWithProgress(`/api/library/${mat.id}/attachments`, fd);
      if (!res.ok) {
        let msg = "Upload failed";
        try { const t = await res.text(); if (t) msg = t.slice(0, 200); } catch {}
        throw new Error(msg);
      }
      const att = await res.json();
      setAttachments(a => [...a, att]);
      toast({ title: "Attachment uploaded" });
    } catch (e: any) {
      toast({ title: e?.message || "Upload failed", variant: "destructive" });
    } finally {
      setUploading(false);
    }
  };

  const deleteAttachment = async (attId: string) => {
    if (!editing) return;
    try {
      await fetch(`/api/library/${editing.id}/attachments/${attId}`, { method: "DELETE" });
      setAttachments(a => a.filter(x => x.id !== attId));
    } catch {
      toast({ title: "Failed to delete attachment", variant: "destructive" });
    }
  };

  const generateUrl = async () => {
    if (!editing) { toast({ title: "Save the material first", variant: "destructive" }); return; }
    try {
      // Ensure a non-guessable share token exists, then make the link live.
      const ensureRes = await fetch(`/api/library/${editing.id}/ensure-share`, { method: "POST" });
      if (!ensureRes.ok) throw new Error("ensure failed");
      const ensured = await ensureRes.json();
      await fetch(`/api/library/${editing.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ access: "open" }),
      });
      form.setValue("access", "open");
      const origin = await getPublicUrl();
      const code = ensured.accessCode ? `?code=${ensured.accessCode}` : "";
      const link = `${origin}/library/${ensured.participantLink}${code}`;
      await navigator.clipboard?.writeText(link);
      toast({ title: "Accessible link generated & copied" });
    } catch {
      const code = editing.accessCode ? `?code=${editing.accessCode}` : "";
      const link = `${window.location.origin}/library/${editing.participantLink ?? editing.id}${code}`;
      toast({ title: `Link: ${link}` });
    }
  };

  const onSubmit = (data: MaterialFormValues) => saveMutation.mutate(data);
  const section = form.watch("section");
  const isExternal = section === "external" || (editing?.section === "external");

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEditing ? "Edit Material" : "New Material"}</DialogTitle>
          <DialogDescription>{isEditing ? "Update this library material." : "Add a new material to the library."}</DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4 py-2">
            <FormField control={form.control} name="title" render={({ field }) => (
              <FormItem><FormLabel>Title *</FormLabel><FormControl><Input {...field} placeholder="Material title" disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
            )} />

            <FormField control={form.control} name="section" render={({ field }) => (
              <FormItem><FormLabel>Section</FormLabel>
                <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                  <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                  <SelectContent><SelectItem value="internal">Internal</SelectItem><SelectItem value="external">External</SelectItem></SelectContent>
                </Select><FormMessage /></FormItem>
            )} />

            <FormField control={form.control} name="folderId" render={({ field }) => (
              <FormItem><FormLabel>Folder</FormLabel>
                <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={!canEdit}>
                  <FormControl><SelectTrigger><SelectValue placeholder="Unfiled" /></SelectTrigger></FormControl>
                  <SelectContent>
                    <SelectItem value="">Unfiled</SelectItem>
                    {folders.filter(f => f.section === section).map(f => (
                      <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select><FormMessage /></FormItem>
            )} />

            {section === "internal" ? (
              <FormField control={form.control} name="department" render={({ field }) => (
                <FormItem><FormLabel>Department</FormLabel>
                  <Select onValueChange={field.onChange} value={field.value ?? ""} disabled={!canEdit}>
                    <FormControl><SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger></FormControl>
                    <SelectContent><SelectItem value="JMCS">JMCS</SelectItem><SelectItem value="SIS">SIS</SelectItem><SelectItem value="Both">Both</SelectItem></SelectContent>
                  </Select><FormMessage /></FormItem>
              )} />
            ) : (
              <>
                <FormField control={form.control} name="category" render={({ field }) => (
                  <FormItem><FormLabel>Training Program / Category</FormLabel><FormControl><Input {...field} placeholder="e.g. Safety Orientation" disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                )} />
                <FormField control={form.control} name="access" render={({ field }) => (
                  <FormItem><FormLabel>Access</FormLabel>
                    <Select onValueChange={field.onChange} value={field.value} disabled={!canEdit}>
                      <FormControl><SelectTrigger><SelectValue /></SelectTrigger></FormControl>
                      <SelectContent>
                        <SelectItem value="open">Open — anyone with the link can view</SelectItem>
                        <SelectItem value="restricted">Restricted — link shared but gated</SelectItem>
                        <SelectItem value="disabled">Disabled — not accessible</SelectItem>
                      </SelectContent>
                    </Select><FormMessage /></FormItem>
                )} />
                <Button type="button" variant="outline" onClick={generateUrl} disabled={!canEdit || !editing} className="w-full">
                  <Icon name="link-2" className="mr-2" size={16} /> Generate URL (accessible)
                </Button>
                {isExternal && (
                  <div className="space-y-2">
                    <Label className="flex items-center gap-1.5"><Icon name="users" size={14} /> People with access</Label>
                    <AccessEmailsManager
                      basePath={editing ? `/api/library/${editing.id}` : undefined}
                      emails={accessEmails}
                      onChange={setAccessEmails}
                      disabled={!canEdit}
                    />
                    <p className="text-[11px] text-muted-foreground">Add multiple emails separated by commas. Everyone listed receives the share link and access code by email. Remove an email to revoke access.</p>
                  </div>
                )}
                {!isExternal && (
                  <FormField control={form.control} name="email" render={({ field }) => (
                    <FormItem><FormLabel className="flex items-center gap-1.5"><Icon name="mail" size={14} /> Participant Email</FormLabel>
                      <FormControl><Input {...field} type="email" placeholder="participant@email.com" disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
                  )} />
                )}
                <FormField control={form.control} name="expiresAt" render={({ field }) => (
                  <FormItem><FormLabel className="flex items-center gap-1.5"><Icon name="clock" size={14} /> Access expires (optional)</FormLabel>
                    <FormControl><Input {...field} value={field.value ?? ""} type="datetime-local" disabled={!canEdit} /></FormControl>
                    <p className="text-[11px] text-muted-foreground">After this date &amp; time the participant automatically loses access. Leave blank for no limit.</p>
                    <FormMessage /></FormItem>
                )} />
              </>
            )}

            <FormField control={form.control} name="url" render={({ field }) => (
              <FormItem><FormLabel>{section === "external" ? "Participant Link / Resource URL" : "Resource URL"}</FormLabel>
                <FormControl><Input {...field} placeholder="https://..." disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
            )} />

            <FormField control={form.control} name="description" render={({ field }) => (
              <FormItem><FormLabel>Description</FormLabel><FormControl><Textarea {...field} placeholder="Optional description" disabled={!canEdit} /></FormControl><FormMessage /></FormItem>
            )} />

            <div>
              <div className="flex items-center justify-between mb-2">
                <Label className="flex items-center gap-1.5"><Icon name="paperclip" size={14} /> Attachments (PDF, PPT, Word, Excel)</Label>
                {canEdit && (
                  <Button type="button" variant="outline" size="sm" onClick={() => fileRef.current?.click()} disabled={!canEdit || uploading}>
                    {uploading ? <Icon name="loader-2" className="mr-1 animate-spin" size={16} /> : <Icon name="upload" className="mr-1" size={16} />} {uploadProgress.uploading ? `${uploadProgress.progress}%` : "Upload"}
                  </Button>
                )}
                <input ref={fileRef} type="file" accept=".pdf,.ppt,.pptx,.doc,.docx,.xls,.xlsx" className="hidden" onChange={e => { if (e.target.files?.[0]) uploadAttachment(e.target.files[0]); e.target.value = ""; }} />
              </div>
              <AttachmentList attachments={attachments} canEdit={canEdit} onDelete={deleteAttachment} onView={(a) => { if (!editing) return; openViewer({ ...a, url: `/api/library/${editing.id}/attachments/${a.id}` }); }} />
            </div>

            <DialogFooter className={isEditing ? "justify-between !mt-6" : "!mt-6"}>
              {canEdit ? (
                isEditing ? (
                  <>
                    <Button type="button" variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950" onClick={() => deleteMutation.mutate()} disabled={deleteMutation.isPending}>
                      <Icon name="trash-2" className="mr-1" size={16} /> {deleteMutation.isPending ? "Deleting..." : "Delete"}
                    </Button>
                    <div className="flex gap-2">
                      <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                      <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Saving..." : "Save"}</Button>
                    </div>
                  </>
                ) : (
                  <>
                    <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
                    <Button type="submit" disabled={saveMutation.isPending}>{saveMutation.isPending ? "Creating..." : "Create"}</Button>
                  </>
                )
              ) : (
                <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>Close</Button>
              )}
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
      <UploadProgressOverlay uploading={uploadProgress.uploading} progress={uploadProgress.progress} fileName={uploadProgress.fileName} fileSize={uploadProgress.fileSize} onCancel={uploadProgress.cancelUpload} />
    </Dialog>
  );
}

function getAccessBadge(access: Access) {
  switch (access) {
    case "open": return <Badge variant="outline" className="bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300 dark:border-emerald-800"><Icon name="globe" className="mr-1" size={12} /> Open</Badge>;
    case "restricted": return <Badge variant="outline" className="bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800"><Icon name="lock" className="mr-1" size={12} /> Restricted</Badge>;
    case "disabled": return <Badge variant="outline" className="bg-rose-100 text-rose-700 border-rose-200 dark:bg-rose-900/30 dark:text-rose-300 dark:border-rose-800"><Icon name="ban" className="mr-1" size={12} /> Disabled</Badge>;
  }
}

function FolderDialog({ open, onOpenChange, section, editing, onSaved, canEdit }: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  section: Section;
  editing: LibraryFolder | null;
  onSaved: () => void;
  canEdit: boolean;
}) {
  const { toast } = useToast();
  const isExternal = section === "external" || (editing?.section === "external");
  const [name, setName] = useState("");
  const [access, setAccess] = useState<Access>("open");
  const [email, setEmail] = useState("");
  const [sendEmail, setSendEmail] = useState(false);
  const [expiresAt, setExpiresAt] = useState("");
  const [saving, setSaving] = useState(false);
  const [copied, setCopied] = useState(false);
  const [accessEmails, setAccessEmails] = useState<string[]>([]);
  const [shareLink, setShareLink] = useState("");

  useEffect(() => {
    if (!open) return;
    setName(editing?.name ?? "");
    setAccess(editing?.access ?? "open");
    setEmail(editing?.email ?? "");
    setSendEmail(false);
    setExpiresAt(isoToLocalInput(editing?.expiresAt));
    setAccessEmails(editing?.accessEmails ?? []);
    setCopied(false);
    if (editing?.participantLink) {
      getPublicUrl().then(o => {
        const code = editing.accessCode ? `?code=${editing.accessCode}` : "";
        setShareLink(`${o}/library/folder/${editing.participantLink}${code}`);
      });
    } else {
      setShareLink("");
    }
  }, [open, editing]);

  const save = async () => {
    if (!name.trim()) return;
    setSaving(true);
    try {
      const body: any = { name: name.trim() };
      if (isExternal) {
        body.access = access;
        body.email = email || null;
        body.accessEmails = accessEmails;
        body.sendEmail = sendEmail;
        body.expiresAt = localInputToIso(expiresAt);
      }
      const res = editing
        ? await fetch(`/api/library/folders/${editing.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) })
        : await fetch("/api/library/folders", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...body, section }) });
      if (res.ok) {
        toast({ title: editing ? "Folder updated" : "Folder created" });
        onOpenChange(false);
        onSaved();
      } else {
        let msg = "Failed to save folder";
        try { const e = await res.json(); if (e?.error) msg = e.error; } catch {}
        toast({ title: msg, variant: "destructive" });
      }
    } catch (e: any) {
      toast({ title: e?.message || "Failed to save folder", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const copyShare = async () => {
    if (!shareLink || !editing) return;
    try {
      // Clear any expiry that has already passed so the copied link is live.
      const expired = editing.expiresAt ? new Date(editing.expiresAt).getTime() < Date.now() : false;
      if (expired) {
        await fetch(`/api/library/folders/${editing.id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ expiresAt: null }),
        });
      }
      await navigator.clipboard.writeText(shareLink);
      setCopied(true); setTimeout(() => setCopied(false), 1500);
    } catch {}
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{editing ? "Folder Sharing" : "New Folder"}</DialogTitle>
          <DialogDescription>{editing ? `Manage sharing for “${editing.name}” in the ${section} section.` : `Create a folder in the ${section} section.`}</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>Folder name</Label>
            <Input value={name} onChange={e => setName(e.target.value)} placeholder="Folder name" onKeyDown={e => { if (e.key === "Enter" && isExternal === false) save(); }} />
          </div>

          {isExternal && (
            <>
              <div>
                <Label>Access</Label>
                <Select onValueChange={(v) => setAccess(v as Access)} value={access}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="open">Open — anyone with the link can view</SelectItem>
                    <SelectItem value="restricted">Restricted — link shared but gated</SelectItem>
                    <SelectItem value="disabled">Disabled — not accessible</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label className="flex items-center gap-1.5"><Icon name="users" size={14} /> People with access</Label>
                <AccessEmailsManager
                  basePath={editing ? `/api/library/folders/${editing.id}` : undefined}
                  emails={accessEmails}
                  onChange={setAccessEmails}
                  disabled={!canEdit}
                />
                <p className="text-[11px] text-muted-foreground">Add multiple emails separated by commas. Everyone listed receives the folder link and access code by email. Remove an email to revoke access.</p>
              </div>
              <div>
                <Label className="flex items-center gap-1.5"><Icon name="clock" size={14} /> Access expires (optional)</Label>
                <Input value={expiresAt} onChange={e => setExpiresAt(e.target.value)} type="datetime-local" />
                <p className="text-[11px] text-muted-foreground mt-1">After this date &amp; time participants automatically lose access to this folder. Leave blank for no limit.</p>
              </div>

              {editing?.participantLink && (
                <div className="rounded-md border bg-muted/30 p-3">
                  <p className="text-xs uppercase tracking-wide text-muted-foreground font-medium mb-1">Public folder link</p>
                  <div className="flex items-center gap-2">
                    <Input readOnly value={shareLink} className="text-xs" />
                    <Button type="button" variant="outline" size="sm" onClick={copyShare}>{copied ? <Icon name="check" size={16} /> : <Icon name="copy" size={16} />}</Button>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-1">Participants open this link to view all materials and attachments inside the folder (view-only).</p>
                </div>
              )}
            </>
          )}
        </div>
        <DialogFooter className="!mt-2">
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={save} disabled={!name.trim() || saving}>{saving ? "Saving..." : editing ? "Save" : "Create"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Library() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r => ["admin", "ADMIN", "IT", "manager"].includes(r)) || ["admin", "ADMIN", "IT", "manager"].includes(user?.role ?? "");
  const canEdit = isAdmin || !!user?.canAccessJmcs || !!user?.canAccessSis;
  const { toast } = useToast();
  const { open: openViewer, node: viewerNode } = useDocumentViewer();
  const [section, setSection] = useState<Section>("internal");
  const [materials, setMaterials] = useState<LibraryMaterial[]>([]);
  const [folders, setFolders] = useState<LibraryFolder[]>([]);
  const [selectedFolder, setSelectedFolder] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<LibraryMaterial | null>(null);
  const [folderDialogOpen, setFolderDialogOpen] = useState(false);
  const [editingFolder, setEditingFolder] = useState<LibraryFolder | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkMoveOpen, setBulkMoveOpen] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);

  const toggleSelect = (id: string) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const visibleMaterialIds = materials.map(m => m.id);
  const allSelected = visibleMaterialIds.length > 0 && visibleMaterialIds.every(id => selectedIds.has(id));
  const toggleSelectAll = () => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (allSelected) visibleMaterialIds.forEach(id => next.delete(id));
      else visibleMaterialIds.forEach(id => next.add(id));
      return next;
    });
  };

  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`/api/library/${id}`, { method: "DELETE" })
      ));
      toast({ title: `Deleted ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}` });
      setSelectedIds(new Set());
      await fetchMaterials();
    } catch {
      toast({ title: "Some items failed to delete", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const bulkMove = async (folderId: string | null) => {
    setBulkBusy(true);
    try {
      await Promise.all(Array.from(selectedIds).map(id =>
        fetch(`/api/library/${id}`, {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ folderId }),
        })
      ));
      toast({ title: `Moved ${selectedIds.size} item${selectedIds.size === 1 ? "" : "s"}` });
      setBulkMoveOpen(false);
      setSelectedIds(new Set());
      await fetchMaterials();
    } catch {
      toast({ title: "Some items failed to move", variant: "destructive" });
    } finally {
      setBulkBusy(false);
    }
  };

  const fetchFolders = async () => {
    try {
      const res = await fetch(`/api/library/folders?section=${section}`);
      if (res.ok) {
        const data = await res.json();
        setFolders(data.map((f: any) => ({
          id: f.id,
          name: f.name,
          section: f.section,
          parentId: f.parentId ?? null,
          access: f.access ?? "open",
          email: f.email ?? null,
          participantLink: f.participantLink ?? null,
          expiresAt: f.expiresAt ?? null,
          createdAt: f.createdAt ?? new Date().toISOString(),
        })));
      }
    } catch {}
  };

  const fetchMaterials = async () => {
    setIsLoading(true);
    try {
      const url = selectedFolder ? `/api/library?section=${section}&folderId=${selectedFolder}` : `/api/library?section=${section}`;
      const res = await fetch(url);
      if (res.ok) setMaterials(await res.json());
    } catch {} finally { setIsLoading(false); }
  };

  useEffect(() => { fetchFolders(); setSelectedFolder(null); }, [section]);
  useEffect(() => { fetchMaterials(); }, [section, selectedFolder]);

  const openNew = () => { setEditing(null); setDialogOpen(true); };
  const openEdit = (m: LibraryMaterial) => { setEditing(m); setDialogOpen(true); };

  const viewMaterial = async (m: LibraryMaterial) => {
    try {
      if (m.section === "internal") {
        if ((m.attachments?.length ?? 0) > 0) {
          const origin = window.location.origin;
          openViewer({ ...m.attachments[0], url: `${origin}/api/library/${m.id}/attachments/${m.attachments[0].id}` });
          return;
        } else if (m.url) {
          window.open(m.url, "_blank", "noopener");
          return;
        }
        toast({ title: "No content to view for this internal material.", variant: "default" });
        return;
      }
      // External materials: ensure a share token exists, then open the public viewer
      const res = await fetch(`/api/library/${m.id}/ensure-share`, { method: "POST" });
      const ensured = res.ok ? await res.json() : null;
      const token = ensured?.participantLink ?? m.participantLink;
      if (!token) throw new Error("no token");
      const origin = await getPublicUrl();
      const code = (ensured?.accessCode ?? m.accessCode) ? `?code=${ensured?.accessCode ?? m.accessCode}` : "";
      window.open(`${origin}/library/${token}${code}`, "_blank", "noopener");
    } catch {
      toast({ title: "Could not open preview", variant: "destructive" });
    }
  };

  const copyLink = async (m: LibraryMaterial) => {
    try {
      const res = await fetch(`/api/library/${m.id}/ensure-share`, { method: "POST" });
      const ensured = res.ok ? await res.json() : null;
      const token = ensured?.participantLink ?? m.participantLink;
      if (!token) throw new Error("no token");
      const origin = await getPublicUrl();
      const code = (ensured?.accessCode ?? m.accessCode) ? `?code=${ensured?.accessCode ?? m.accessCode}` : "";
      const link = `${origin}/library/${token}${code}`;
      await navigator.clipboard.writeText(link);
      setCopiedId(m.id);
      setTimeout(() => setCopiedId(null), 1500);
    } catch {}
  };

  const copyText = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast({ title: "Share link copied" });
    } catch {}
  };

  const openNewFolder = () => { setEditingFolder(null); setFolderDialogOpen(true); };
  const openFolderShare = (f: LibraryFolder) => { setEditingFolder(f); setFolderDialogOpen(true); };

  const deleteFolder = async (id: string) => {
    if (!confirm("Delete this folder? Materials inside will be moved to Unfiled.")) return;
    await fetch(`/api/library/folders/${id}`, { method: "DELETE" });
    if (selectedFolder === id) setSelectedFolder(null);
    await fetchFolders();
    await fetchMaterials();
  };

  const folderName = (id: string | null) => folders.find(f => f.id === id)?.name ?? "Unfiled";

  const visibleFolders = !selectedFolder ? folders.filter(f => f.section === section) : [];
  const visibleMaterials = materials.filter(m => m.section === section && (selectedFolder ? m.folderId === selectedFolder : true));

  const accessIcon = (a: Access) =>
    a === "open" ? <Icon name="globe" size={12} /> : a === "restricted" ? <Icon name="lock" size={12} /> : <Icon name="ban" size={12} />;

  return (
    <div data-page="library" className="max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2.5">
            <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-muted">
              <Icon name="library" className="text-muted-foreground" size={20} />
            </div>
            Library
          </h1>
          <p className="text-sm text-muted-foreground mt-1 ml-11">Internal operations materials and external training resources.</p>
        </div>
        {canEdit && (
          <div className="flex gap-2 ml-11 sm:ml-0">
            <Button variant="outline" size="sm" onClick={openNewFolder}>
              <Icon name="folder-plus" className="mr-1.5" size={16} /> New Folder
            </Button>
            <Button size="sm" onClick={openNew}>
              <Icon name="plus" className="mr-1.5" size={16} /> New Material
            </Button>
          </div>
        )}
      </div>

      {/* Tabs + Breadcrumb row */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-5">
        <Tabs value={section} onValueChange={(v) => setSection(v as Section)}>
          <TabsList className="h-9">
            <TabsTrigger value="internal" className="gap-1.5 text-xs px-3">
              <Icon name="building-2" size={14} /> Internal
            </TabsTrigger>
            <TabsTrigger value="external" className="gap-1.5 text-xs px-3">
              <Icon name="graduation-cap" size={14} /> External
            </TabsTrigger>
          </TabsList>
        </Tabs>

        <div className="flex items-center gap-1.5 text-sm">
          <button
            onClick={() => setSelectedFolder(null)}
            className={`px-2 py-1 rounded-md transition-colors ${!selectedFolder ? "bg-muted font-medium text-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted/50"}`}
          >
            All
          </button>
          {selectedFolder && (
            <>
              <Icon name="chevron-right" className="text-muted-foreground shrink-0" size={14} />
              <span className="px-2 py-1 rounded-md bg-muted font-medium text-foreground truncate max-w-[200px]">
                {folderName(selectedFolder)}
              </span>
            </>
          )}
        </div>
      </div>

      {/* Bulk action bar */}
      {canEdit && selectedIds.size > 0 && (
        <div className="flex items-center justify-between gap-3 px-4 py-2.5 mb-4 rounded-lg border bg-primary/5">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setBulkMoveOpen(true)} disabled={bulkBusy}>
              <Icon name="folder" className="mr-1" size={16} /> Move
            </Button>
            <Button variant="destructive" size="sm" onClick={bulkDelete} disabled={bulkBusy}>
              <Icon name="trash-2" className="mr-1" size={16} /> Delete
            </Button>
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())} disabled={bulkBusy}>
              Clear
            </Button>
          </div>
        </div>
      )}

      {/* Select all bar */}
      {canEdit && selectedIds.size === 0 && materials.length > 0 && (
        <div className="flex items-center gap-2 mb-3 px-1">
          <Checkbox checked={allSelected} onCheckedChange={toggleSelectAll} id="select-all" />
          <label htmlFor="select-all" className="text-xs text-muted-foreground cursor-pointer select-none">
            Select all {materials.length} item{materials.length === 1 ? "" : "s"}
          </label>
        </div>
      )}

      {/* Content */}
      {(visibleFolders.length === 0 && visibleMaterials.length === 0) && !isLoading && (
        <div className="flex flex-col items-center justify-center py-16 px-4 rounded-lg border-2 border-dashed bg-muted/20">
          <div className="flex items-center justify-center w-14 h-14 rounded-full bg-muted mb-4">
            <Icon name="library" className="text-muted-foreground/60" size={28} />
          </div>
          <p className="text-sm font-medium text-muted-foreground">
            No {section} items{selectedFolder ? ` in "${folderName(selectedFolder)}"` : ""} yet
          </p>
          <p className="text-xs text-muted-foreground/60 mt-1 mb-4">
            {canEdit
              ? selectedFolder
              ? "Add materials to this folder or create a new one."
              : 'Click "New Material" or "New Folder" to get started.'
              : "No items available at the moment."}
          </p>
          {canEdit && !selectedFolder && (
            <div className="flex gap-2">
              <Button size="sm" variant="outline" onClick={openNewFolder}>
                <Icon name="folder-plus" className="mr-1" size={16} /> New Folder
              </Button>
              <Button size="sm" onClick={openNew}>
                <Icon name="plus" className="mr-1" size={16} /> New Material
              </Button>
            </div>
          )}
        </div>
      )}

      {!isLoading && (visibleFolders.length > 0 || visibleMaterials.length > 0) && (
        <div className="rounded-xl border bg-card overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b bg-muted/40 text-left text-xs font-medium text-muted-foreground">
                  <th className="px-4 py-3 font-medium">Name</th>
                  <th className="px-4 py-3 font-medium">Folder</th>
                  <th className="px-4 py-3 font-medium">Type</th>
                  <th className="px-4 py-3 font-medium">Date Uploaded</th>
                  <th className="px-4 py-3 font-medium">Uploaded By</th>
                  <th className="px-4 py-3 font-medium">Access Type</th>
                  <th className="px-4 py-3 font-medium">Email Access</th>
                  {canEdit && <th className="px-4 py-3 font-medium text-right">Actions</th>}
                </tr>
              </thead>
              <tbody>
                {visibleFolders.map(f => (
                  <tr key={f.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => setSelectedFolder(f.id)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg bg-blue-600 shrink-0">
                          <Icon name="folder" className="text-white" size={16} />
                        </div>
                        <span className="font-medium truncate">{f.name}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">—</td>
                    <td className="px-4 py-3"><span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">Folder</span></td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{format(parseISO(f.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 text-muted-foreground">—</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                        {accessIcon(f.access)} {f.access}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{(f.accessEmails?.length ?? 0) > 0 ? f.accessEmails!.length : "—"}</td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {f.section === "external" && f.participantLink && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={async () => { const o = await getPublicUrl(); copyText(`${o}/library/folder/${f.participantLink}`); }} title="Copy link">
                              <Icon name="link-2" className="text-muted-foreground" size={16} />
                            </Button>
                          )}
                          {f.section === "external" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openFolderShare(f)} title="Share">
                              <Icon name="external-link" className="text-muted-foreground" size={16} />
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => deleteFolder(f.id)} title="Delete">
                            <Icon name="trash-2" size={16} />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}

                {visibleMaterials.map(m => (
                  <tr key={m.id} className="border-b last:border-0 hover:bg-muted/30 transition-colors cursor-pointer" onClick={() => viewMaterial(m)}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5 min-w-0">
                        <div className="flex items-center justify-center w-8 h-8 rounded-lg shrink-0 bg-muted">
                          {(m.attachments?.length ?? 0) > 0 ? attIcon(m.attachments![0].type) : m.url ? <Icon name="external-link" className="text-muted-foreground" size={16} /> : <Icon name="file-text" className="text-muted-foreground" size={16} />}
                        </div>
                        <span className="font-medium truncate">{m.title}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">{m.folderId ? folderName(m.folderId) : "Unfiled"}</td>
                    <td className="px-4 py-3">
                      {(m.attachments?.length ?? 0) > 0 ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-semibold bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                          {attTypeLabel(m.attachments![0].type)}
                        </span>
                      ) : m.url ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">Link</span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded text-[11px] font-medium bg-muted text-muted-foreground">File</span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-muted-foreground whitespace-nowrap">{format(parseISO(m.createdAt), "MMM d, yyyy")}</td>
                    <td className="px-4 py-3 text-muted-foreground">{m.createdByName || "—"}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-medium bg-muted text-muted-foreground">
                        {accessIcon(m.access)} {m.access}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-muted-foreground">
                      {(m.accessEmails?.length ?? 0) > 0 ? (
                        <span className="inline-flex items-center gap-1" title={(m.accessEmails ?? []).join(", ")}>
                          <Icon name="mail" size={13} />
                          {m.accessEmails!.length}
                        </span>
                      ) : "—"}
                    </td>
                    {canEdit && (
                      <td className="px-4 py-3 text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-end gap-1">
                          {m.section === "external" && (
                            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => copyLink(m)} title="Copy link">
                              {copiedId === m.id ? <Icon name="check" className="text-muted-foreground" size={16} /> : <Icon name="copy" size={16} />}
                            </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground hover:text-foreground" onClick={() => openEdit(m)} title="Edit">
                            <Icon name="pencil" size={16} />
                          </Button>
                        </div>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {isLoading && (
        <div className="rounded-xl border bg-card divide-y">
          {Array(5).fill(0).map((_, i) => (
            <div key={i} className="flex items-center gap-4 px-4 py-3.5">
              <Skeleton className="h-8 w-8 rounded-lg" />
              <Skeleton className="h-4 w-1/3" />
              <Skeleton className="h-4 w-20 ml-auto" />
            </div>
          ))}
        </div>
      )}

      {viewerNode}

      <MaterialDialog open={dialogOpen} onOpenChange={setDialogOpen} defaultSection={section} editing={editing} folders={folders} onSuccess={fetchMaterials} onCreated={setEditing} canEdit={canEdit} />

      <FolderDialog open={folderDialogOpen} onOpenChange={setFolderDialogOpen} section={section} editing={editingFolder} onSaved={fetchFolders} canEdit={canEdit} />

      <Dialog open={bulkMoveOpen} onOpenChange={setBulkMoveOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Move {selectedIds.size} item{selectedIds.size === 1 ? "" : "s"}</DialogTitle>
            <DialogDescription>Choose a destination folder in the {section} section. Select “Unfiled” to remove from any folder.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2 max-h-72 overflow-y-auto">
            <button onClick={() => bulkMove(null)} className="w-full text-left px-3 py-2 rounded-md border hover:bg-muted/40 text-sm font-medium">Unfiled</button>
            {folders.filter(f => f.section === section).map(f => (
              <button key={f.id} onClick={() => bulkMove(f.id)} className="w-full text-left px-3 py-2 rounded-md border hover:bg-muted/40 text-sm flex items-center gap-2">
                <Icon name="folder" className="text-amber-500 shrink-0" size={16} /> {f.name}
              </button>
            ))}
          </div>
          <DialogFooter className="!mt-2">
            <Button variant="outline" onClick={() => setBulkMoveOpen(false)} disabled={bulkBusy}>Cancel</Button>
          </DialogFooter>
      </DialogContent>
    </Dialog>
    </div>
  );
}
