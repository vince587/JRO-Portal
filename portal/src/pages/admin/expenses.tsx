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
import { useToast } from "@/hooks/use-toast";
import { useCollection, useDeleteItem, FormDialog, CompanySelect } from "./shared";

export default function AdminExpenses() {
  const { data: expenses, loading, refetch } = useCollection<any>("/api/admin/expenses");
  const del = useDeleteItem("/api/admin/expenses", refetch);
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [form, setForm] = useState({ company: "JMCS", category: "", amount: 0, description: "", date: "", receiptUrl: "", notes: "" });
  const [saving, setSaving] = useState(false);

  const openAdd = () => { setEdit(null); setForm({ company: "JMCS", category: "", amount: 0, description: "", date: "", receiptUrl: "", notes: "" }); setOpen(true); };
  const openEdit = (f: any) => { setEdit(f); setForm({ company: f.company, category: f.category, amount: f.amount, description: f.description, date: f.date, receiptUrl: f.receiptUrl, notes: f.notes }); setOpen(true); };

  const handleSave = async () => {
    if (!form.category || !form.description) { toast({ title: "Category and Description required", variant: "destructive" }); return; }
    setSaving(true);
    try {
      const r = edit
        ? await window.fetch(`/api/admin/expenses/${edit.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) })
        : await window.fetch("/api/admin/expenses", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(form) });
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
        <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Icon name="wallet" className="text-primary" size={24} /> Expenses</h1></div>
      </div>

      <div className="flex justify-end"><Button size="sm" onClick={openAdd}><Icon name="plus" className="mr-2" size={16} /> Add Expense</Button></div>

      <Card className="neu rounded-2xl"><CardContent className="p-0">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Category</TableHead><TableHead>Company</TableHead><TableHead>Description</TableHead><TableHead>Amount</TableHead><TableHead>Date</TableHead><TableHead className="w-20"></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? Array(3).fill(0).map((_, i) => (
              <TableRow key={i}><TableCell colSpan={6}><div className="h-8 bg-muted/50 animate-pulse rounded" /></TableCell></TableRow>
            )) : expenses.length === 0 ? (
              <TableRow><TableCell colSpan={6} className="text-center py-12 text-muted-foreground">No expenses yet.</TableCell></TableRow>
            ) : expenses.map((f: any) => (
              <TableRow key={f.id}>
                <TableCell><Badge variant="outline">{f.category}</Badge></TableCell>
                <TableCell className="text-sm">{f.company}</TableCell>
                <TableCell className="text-sm max-w-[200px] truncate">{f.description}</TableCell>
                <TableCell className="text-sm font-medium">₱{(f.amount || 0).toLocaleString()}</TableCell>
                <TableCell className="text-sm">{f.date || "—"}</TableCell>
                <TableCell><div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(f)}><Icon name="pencil" size={14} /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-red-500" onClick={() => del(f.id)}><Icon name="trash-2" size={14} /></Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </CardContent></Card>

      <FormDialog open={open} onOpenChange={setOpen} title={edit ? "Edit Expense" : "Add Expense"} onSave={handleSave} saving={saving}>
        <div className="space-y-2"><Label>Company</Label><CompanySelect value={form.company} onChange={v => setForm(p => ({ ...p, company: v }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Category</Label><Input value={form.category} onChange={e => setForm(p => ({ ...p, category: e.target.value }))} placeholder="Office Supplies, Travel, etc." /></div>
          <div className="space-y-2"><Label>Amount (₱)</Label><Input type="number" min={0} value={form.amount} onChange={e => setForm(p => ({ ...p, amount: Number(e.target.value) }))} /></div>
        </div>
        <div className="space-y-2"><Label>Description</Label><Input value={form.description} onChange={e => setForm(p => ({ ...p, description: e.target.value }))} /></div>
        <div className="grid grid-cols-2 gap-4">
          <div className="space-y-2"><Label>Date</Label><Input type="date" value={form.date} onChange={e => setForm(p => ({ ...p, date: e.target.value }))} /></div>
          <div className="space-y-2"><Label>Receipt URL (optional)</Label><Input value={form.receiptUrl} onChange={e => setForm(p => ({ ...p, receiptUrl: e.target.value }))} placeholder="https://..." /></div>
        </div>
        <div className="space-y-2"><Label>Notes (optional)</Label><Textarea value={form.notes} onChange={e => setForm(p => ({ ...p, notes: e.target.value }))} rows={2} /></div>
      </FormDialog>
    </div>
  );
}
