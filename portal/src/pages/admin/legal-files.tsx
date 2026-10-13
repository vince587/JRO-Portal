import { useState } from "react";
import { Link } from "wouter";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useDeleteItem, FormDialog, CompanySelect } from "./shared";

export default function AdminLegalFiles() {
  const { data: files, loading, refetch } = useCollection<any>("/api/admin/legal-files");
  const del = useDeleteItem("/api/admin/legal-files", refetch);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ company: "JMCS", title: "", type: "", fileUrl: "", expiryDate: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEdit(null); setForm({ company: "JMCS", title: "", type: "", fileUrl: "", expiryDate: "", notes: "" }); setOpen(true); };
  const openEdit = (f: any) => { setEdit(f); setForm({ company: f.company, title: f.title, type: f.type, fileUrl: f.fileUrl, expiryDate: f.expiryDate, notes: f.notes }); setOpen(true); };

  const handleSave = async () => {
    if (!form.title || !form.type) { toast({ title: "Title and Type are required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = edit
        ? await window.fetch(`/api/admin/legal-files/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        : await window.fetch("/api/admin/legal-files", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
      if (!r.ok) { const b = await r.json().catch(() => null); throw new Error(b?.error || "Save failed"); }
      toast({ title: edit ? "Updated" : "Created" });
      setOpen(false); refetch();
    } catch (e: any) { toast({ title: "Error", description: e.message, variant: "destructive" }); }
    finally { setSaving(false); }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild><Link href="/admin"><Icon name="arrow-left" className="mr-2" size={16} /> Back</Link></Button>
        <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Icon name="file-text" className="text-primary" size={24} /> Legal Files</h1></div>
      </div>

      <div className="flex justify-end"><Button size="sm" onClick={openAdd}><Icon name="plus" className="mr-2" size={16} /> Add Legal File</Button></div>

      <Card className="surface rounded-lg"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Title</TableHead><TableHead>Company</TableHead><TableHead>Type</TableHead><TableHead>Expiry</TableHead><TableHead className="w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? Array(3).fill(0).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={5}><div className="h-8 bg-muted/50 animate-pulse rounded" /></TableCell></TableRow>
            )) : files.length === 0 ? (
              <TableRow><TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No legal files yet.</TableCell></TableRow>
            ) : files.map((f: any) => {
              const isExpired = f.expiryDate && new Date(f.expiryDate) < new Date();
              return (
                <TableRow key={f.id}>
                  <TableCell className="font-medium">{f.title}</TableCell>
                  <TableCell className="text-sm">{f.company}</TableCell>
                  <TableCell><Badge variant="outline">{f.type}</Badge></TableCell>
                  <TableCell className="text-sm">{f.expiryDate ? <span className={isExpired ? "text-red-600 font-medium" : ""}>{f.expiryDate}</span> : "—"}</TableCell>
                  <TableCell><div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Icon name="pencil" size={14} /></Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => del(f.id)}><Icon name="trash-2" size={14} /></Button>
                  </div></TableCell>
                </TableRow>
              );
            })}
          </TableBody>
        </Table>
      </CardContent></Card>

      <FormDialog open={open} onOpenChange={setOpen} title={edit ? "Edit Legal File" : "Add Legal File"} onSave={handleSave} saving={saving}>
        <div className="space-y-2"><Label>Company</Label><CompanySelect value={form.company} onChange={v => setForm(p => ({ ...p, company: v }))} /></div>
        <div className="space-y-2"><Label>Title</Label><Input value={form.title} onChange={e => setForm(p => ({ ...p, title: e.target.value }))} /></div>
        <div className="space-y-2"><Label>Type</Label><Input value={form.type} onChange={e => setForm(p => ({ ...p, type: e.target.value }))} placeholder="Contract, Permit, SEC, etc." /></div>
        <div className="space-y-2"><Label>File URL (optional)</Label><Input value={form.fileUrl} onChange={e => setForm(p => ({ ...p, fileUrl: e.target.value }))} placeholder="https://..." /></div>
        <div className="space-y-2"><Label>Expiry Date (optional)</Label><Input type="date" value={form.expiryDate} onChange={e => setForm(p => ({ ...p, expiryDate: e.target.value }))} /></div>
        <div className="space-y-2"><Label>Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
      </FormDialog>
    </div>
  );
}
