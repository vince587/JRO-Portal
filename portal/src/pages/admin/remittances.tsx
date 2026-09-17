import { useState } from "react";
import { Link } from "wouter";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent } from "@/components/ui/card";
import { Table, TableHeader, TableBody, TableRow, TableHead, TableCell } from "@/components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";
import { useCollection, useDeleteItem, FormDialog, CompanySelect, statusColor } from "./shared";

const REMITTANCE_TYPES = ["BIR", "PhilHealth", "Pag-IBIG", "SSS"] as const;

export default function AdminRemittances() {
  const { data: remittances, loading, refetch } = useCollection<any>("/api/admin/remittances");
  const del = useDeleteItem("/api/admin/remittances", refetch);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ company: "JMCS", type: "BIR", amount: 0, dueDate: "", status: "pending", paidDate: "", referenceNo: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEdit(null); setForm({ company: "JMCS", type: "BIR", amount: 0, dueDate: "", status: "pending", paidDate: "", referenceNo: "", notes: "" }); setOpen(true); };
  const openEdit = (f: any) => { setEdit(f); setForm({ company: f.company, type: f.type, amount: f.amount, dueDate: f.dueDate, status: f.status, paidDate: f.paidDate, referenceNo: f.referenceNo, notes: f.notes }); setOpen(true); };

  const handleSave = async () => {
    if (!form.type) { toast({ title: "Type required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = edit
        ? await window.fetch(`/api/admin/remittances/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        : await window.fetch("/api/admin/remittances", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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
        <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Icon name="landmark" className="text-primary" size={24} /> Government Remittances</h1></div>
      </div>

      <div className="flex justify-end"><Button size="sm" onClick={openAdd}><Icon name="plus" className="mr-2" size={16} /> Add Remittance</Button></div>

      <Card className="neu rounded-lg"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Type</TableHead><TableHead>Company</TableHead><TableHead>Amount</TableHead><TableHead>Due Date</TableHead><TableHead>Status</TableHead><TableHead>Reference</TableHead><TableHead className="w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? Array(3).fill(0).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={7}><div className="h-8 bg-muted/50 animate-pulse rounded" /></TableCell></TableRow>
            )) : remittances.length === 0 ? (
              <TableRow><TableCell colSpan={7} className="text-center py-12 text-muted-foreground">No remittances yet.</TableCell></TableRow>
            ) : remittances.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell><Badge variant="outline">{f.type}</Badge></TableCell>
                <TableCell className="text-sm">{f.company}</TableCell>
                <TableCell className="text-sm font-medium">₱{(f.amount || 0).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{f.dueDate || "—"}</TableCell>
                <TableCell><Badge variant="outline" className={statusColor[f.status] || ""}>{f.status.charAt(0).toUpperCase() + f.status.slice(1)}</Badge></TableCell>
                <TableCell className="text-sm">{f.referenceNo || "—"}</TableCell>
                <TableCell><div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Icon name="pencil" size={14} /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => del(f.id)}><Icon name="trash-2" size={14} /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <FormDialog open={open} onOpenChange={setOpen} title={edit ? "Edit Remittance" : "Add Remittance"} onSave={handleSave} saving={saving}>
        <div className="space-y-2"><Label>Company</Label><CompanySelect value={form.company} onChange={v => setForm(p => ({ ...p, company: v }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Type</Label>
            <Select value={form.type} onValueChange={v => setForm(p => ({ ...p, type: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{REMITTANCE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="space-y-2"><Label>Status</Label>
            <Select value={form.status} onValueChange={v => setForm(p => ({ ...p, status: v }))}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{["pending", "paid", "overdue"].map(s => <SelectItem key={s} value={s}>{s.charAt(0).toUpperCase() + s.slice(1)}</SelectItem>)}</SelectContent>
            </Select>
          </div>
        </div>
        <div className="space-y-2"><Label>Amount (₱)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Due Date</Label><Input type="date" value={form.dueDate} onChange={e => setForm(p => ({ ...p, dueDate: e.target.value }))} /></div>
          {form.status === "paid" && <div className="space-y-2"><Label>Paid Date</Label><Input type="date" value={form.paidDate} onChange={e => setForm(p => ({ ...p, paidDate: e.target.value }))} /></div>}
        </div>
        <div className="space-y-2"><Label>Reference No. (optional)</Label><Input value={form.referenceNo} onChange={e => setForm(p => ({ ...p, referenceNo: e.target.value }))} /></div>
        <div className="space-y-2"><Label>Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
      </FormDialog>
    </div>
  );
}
