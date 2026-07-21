import { useState } from "react";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useToast } from "@/hooks/use-toast";
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
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SaveProgressIndicator } from "@/components/upload-progress";

const LEAD_STATUSES = ["new", "contacted", "qualified", "lost"];

const statusColor: Record<string, string> = {
  new: "bg-slate-100 text-slate-700 border-slate-200 dark:bg-slate-800 dark:text-slate-300",
  contacted: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  qualified: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  lost: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
};

function EditLeadDialog({
  lead,
  open,
  onOpenChange,
  onSuccess,
}: {
  lead: any;
  open: boolean;
  onOpenChange: (v: boolean) => void;
  onSuccess: () => void;
}) {
  const { toast } = useToast();
  const [companyName, setCompanyName] = useState(lead?.companyName || "");
  const [contactPerson, setContactPerson] = useState(lead?.contactPerson || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [serviceInterest, setServiceInterest] = useState(lead?.serviceInterest || "");
  const [notes, setNotes] = useState(lead?.notes || "");
  const [status, setStatus] = useState(lead?.status || "new");
  const [saving, setSaving] = useState(false);

  if (lead && !companyName && open) {
    setCompanyName(lead.companyName);
    setContactPerson(lead.contactPerson);
    setEmail(lead.email || "");
    setPhone(lead.phone || "");
    setServiceInterest(lead.serviceInterest || "");
    setNotes(lead.notes || "");
    setStatus(lead.status || "new");
  }

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, contactPerson, email, phone, serviceInterest, notes, status }),
      });
      if (!res.ok) throw new Error("Failed to update");
      toast({ title: "Lead updated" });
      onOpenChange(false);
      onSuccess();
    } catch {
      toast({ title: "Failed to update lead", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/leads/${lead.id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
      toast({ title: "Lead deleted" });
      onOpenChange(false);
      onSuccess();
    } catch {
      toast({ title: "Failed to delete lead", variant: "destructive" });
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[85vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Edit Lead</DialogTitle>
          <DialogDescription>Update lead details and status.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div className="space-y-2">
            <Label>Company Name</Label>
            <Input value={companyName} onChange={e => setCompanyName(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Contact Person</Label>
            <Input value={contactPerson} onChange={e => setContactPerson(e.target.value)} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input value={email} onChange={e => setEmail(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Phone</Label>
              <Input value={phone} onChange={e => setPhone(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Service Interest</Label>
            <Input value={serviceInterest} onChange={e => setServiceInterest(e.target.value)} />
          </div>
          <div className="space-y-2">
            <Label>Status</Label>
            <Select value={status} onValueChange={setStatus}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                {LEAD_STATUSES.map(s => (
                  <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Textarea value={notes} onChange={e => setNotes(e.target.value)} className="min-h-[80px]" />
          </div>
        </div>
        <DialogFooter className="justify-between">
          <Button variant="outline" className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950" onClick={handleDelete} disabled={saving}>
            Delete
          </Button>
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? "Saving..." : "Save"}</Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function Leads() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | "JMCS" | "SIS">("ALL");
  const [showAddRow, setShowAddRow] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canCreateJmcsLead = user?.canAccessJmcs;
  const canCreateSisLead = user?.canAccessSis || user?.roles?.some(r => ["admin", "ADMIN", "IT", "manager"].includes(r)) || ["admin", "ADMIN", "IT", "manager"].includes(user?.role ?? "");

  const [newRow, setNewRow] = useState({
    companyName: "",
    contactPerson: "",
    email: "",
    phone: "",
    serviceInterest: "",
    notes: "",
    type: canCreateJmcsLead ? "JMCS" : "SIS",
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
  };

  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);

  function toggleRow(id: string | number) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function toggleAllVisible(ids: (string | number)[]) {
    setSelectedIds(prev => {
      const next = new Set(prev);
      const allSelected = ids.length > 0 && ids.every(id => prev.has(id));
      if (allSelected) ids.forEach(id => next.delete(id));
      else ids.forEach(id => next.add(id));
      return next;
    });
  }

  const bulkDeleteMutation = useMutation({
    mutationFn: async (ids: (string | number)[]) => {
      const res = await fetch("/api/leads/bulk-delete", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ids }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Bulk delete failed");
      }
      return res.json() as Promise<{ deleted: number; errors: string[] }>;
    },
    onSuccess: (result) => {
      refetch();
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      if (result.errors?.length) {
        toast({ title: `Deleted ${result.deleted}, ${result.errors.length} failed`, variant: "destructive" });
      } else {
        toast({ title: `Deleted ${result.deleted} leads` });
      }
    },
    onError: (e: Error) => toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" }),
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/leads", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...newRow, type: newRow.type }),
      });
      if (!res.ok) throw new Error("Failed to create lead");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setShowAddRow(false);
      setNewRow({ companyName: "", contactPerson: "", email: "", phone: "", serviceInterest: "", notes: "", type: canCreateJmcsLead ? "JMCS" : "SIS" });
      toast({ title: "Lead created" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to create lead", description: e.message, variant: "destructive" });
    },
  });

  const resetAddRow = () => {
    setShowAddRow(false);
    setNewRow({ companyName: "", contactPerson: "", email: "", phone: "", serviceInterest: "", notes: "", type: canCreateJmcsLead ? "JMCS" : "SIS" });
  };

  const handleCellChange = (field: string, value: string) => {
    setNewRow(prev => ({ ...prev, [field]: value }));
  };

  const filteredLeads = leads?.filter((lead: any) => {
    if (!searchTerm && !statusFilter && typeFilter === "ALL") return true;
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      lead.companyName.toLowerCase().includes(q) ||
      lead.contactPerson.toLowerCase().includes(q) ||
      (lead.email || "").toLowerCase().includes(q);
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    const matchesType = typeFilter === "ALL" || lead.type === typeFilter;
    return matchesSearch && matchesStatus && matchesType;
  });

  const isAdmin = user?.roles?.some(r => ["admin", "ADMIN", "IT", "manager"].includes(r)) || ["admin", "ADMIN", "IT", "manager"].includes(user?.role ?? "");
  const isAddValid = newRow.companyName.trim() && newRow.contactPerson.trim();

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="target" className="text-rose-500" size={28} />
            Leads
          </h1>
          <p className="text-muted-foreground mt-1">
            {isAdmin ? "Manage all sales leads." : "Track your sales leads."}
            {!isAdmin && " Only you can see your own leads."}
          </p>
        </div>
        <Button onClick={() => setShowAddRow(true)} disabled={showAddRow}>
          <Icon name="plus" className="mr-2" size={16} />
          Add Lead
        </Button>
      </div>

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between rounded-lg border bg-muted/40 px-4 py-2">
          <span className="text-sm font-medium">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Icon name="trash-2" className="mr-2" size={16} />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      <Card className="neu rounded-2xl">
        <CardContent className="p-0">
          <div className="p-4 border-b neu-inset rounded-xl space-y-3">
            <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
              <div className="relative flex-1 w-full">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input
                  placeholder="Search leads by company, contact, or email..."
                  className="pl-9 bg-background w-full max-w-md"
                  value={searchTerm}
                  onChange={e => setSearchTerm(e.target.value)}
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-[150px] bg-background">
                  <SelectValue placeholder="All Statuses" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Statuses</SelectItem>
                  {LEAD_STATUSES.map(s => (
                    <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground font-medium">Type:</span>
              <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)}>
                <TabsList className="h-7">
                  <TabsTrigger value="ALL" className="text-xs px-3 h-6">All</TabsTrigger>
                  <TabsTrigger value="JMCS" className="text-xs px-3 h-6">JMCS</TabsTrigger>
                  <TabsTrigger value="SIS" className="text-xs px-3 h-6">SIS</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        (filteredLeads?.length ?? 0) > 0 &&
                        (filteredLeads?.every((l: any) => selectedIds.has(l.id)) ?? false)
                          ? true
                          : (filteredLeads?.some((l: any) => selectedIds.has(l.id)) ?? false)
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={() => toggleAllVisible((filteredLeads ?? []).map((l: any) => l.id))}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="min-w-[160px]">Company</TableHead>
                  <TableHead className="min-w-[150px]">Contact Person</TableHead>
                  <TableHead className="min-w-[140px]">Contact Info</TableHead>
                    <TableHead className="min-w-[160px]">Service Interest</TableHead>
                    <TableHead className="min-w-[80px]">Type</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                    {isAdmin && <TableHead className="hidden sm:table-cell min-w-[100px]">Created By</TableHead>}
                  <TableHead className="hidden sm:table-cell min-w-[100px]">Date</TableHead>
                  <TableHead className="w-[70px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showAddRow && (
                  <TableRow className="bg-primary/5 border-b-2 border-primary/30">
                    <TableCell>
                      <Checkbox disabled aria-label="New row" />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Company name"
                        className="h-8 text-xs"
                        value={newRow.companyName}
                        onChange={e => handleCellChange("companyName", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Full name"
                        className="h-8 text-xs"
                        value={newRow.contactPerson}
                        onChange={e => handleCellChange("contactPerson", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          placeholder="Email"
                          className="h-7 text-xs"
                          value={newRow.email}
                          onChange={e => handleCellChange("email", e.target.value)}
                        />
                        <Input
                          placeholder="Phone"
                          className="h-7 text-xs"
                          value={newRow.phone}
                          onChange={e => handleCellChange("phone", e.target.value)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="e.g. ISO 9001"
                        className="h-8 text-xs"
                        value={newRow.serviceInterest}
                        onChange={e => handleCellChange("serviceInterest", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <span className="text-xs text-muted-foreground italic">New</span>
                    </TableCell>
                    <TableCell>
                      <Select value={newRow.type} onValueChange={v => setNewRow(prev => ({ ...prev, type: v }))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {canCreateJmcsLead && <SelectItem value="JMCS">JMCS</SelectItem>}
                          {canCreateSisLead && <SelectItem value="SIS">SIS</SelectItem>}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    {isAdmin && <TableCell className="hidden sm:table-cell"></TableCell>}
                    <TableCell className="hidden sm:table-cell"></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          disabled={!isAddValid || createMutation.isPending}
                          onClick={() => createMutation.mutate()}
                        >
                          <Icon name="check" size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          className="h-7 w-7 text-muted-foreground hover:text-foreground"
                          onClick={resetAddRow}
                        >
                          <Icon name="x" size={16} />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
                {isLoading ? Array(3).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    {isAdmin && <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-16" /></TableCell>}
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                )) : filteredLeads?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 8} className="h-48 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Icon name="target" className="opacity-20 mb-4" size={40} />
                        <p>No leads found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads?.map((lead: any) => (
                    <TableRow key={lead.id} className="group">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(lead.id)}
                          onCheckedChange={() => toggleRow(lead.id)}
                          aria-label={`Select ${lead.companyName}`}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Icon name="building-2" className="text-muted-foreground shrink-0" size={16} />
                          {lead.companyName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <Icon name="user" className="text-muted-foreground shrink-0" size={16} />
                          {lead.contactPerson}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {lead.email && (
                            <span className="flex items-center gap-1">
                              <Icon name="mail" size={12} /> {lead.email}
                            </span>
                          )}
                          {lead.phone && (
                            <span className="flex items-center gap-1">
                              <Icon name="phone" size={12} /> {lead.phone}
                            </span>
                          )}
                          {!lead.email && !lead.phone && <span className="italic">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">
                        {lead.serviceInterest || <span className="text-muted-foreground italic">None</span>}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`font-mono text-[10px] tracking-wider ${lead.type === "JMCS" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" : "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"}`}>
                          {lead.type || "—"}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${statusColor[lead.status] || ""}`}>
                          {lead.status}
                        </Badge>
                      </TableCell>
                      {isAdmin && (
                        <TableCell className="hidden sm:table-cell text-sm text-muted-foreground">
                          #{lead.createdById}
                        </TableCell>
                      )}
                      <TableCell className="hidden sm:table-cell text-xs text-muted-foreground">
                        {format(new Date(lead.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="sr-only">Menu</span>
                              <Icon name="more-horizontal" size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="cursor-pointer" onClick={() => {
                              setEditingLead(lead);
                              setEditDialogOpen(true);
                            }}>
                              Edit Lead
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="p-4 border-t bg-muted/10 text-xs text-muted-foreground flex justify-between items-center">
            <span>Showing {filteredLeads?.length || 0} {filteredLeads?.length === 1 ? 'lead' : 'leads'}</span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} lead{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected leads will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <EditLeadDialog
        lead={editingLead}
        open={editDialogOpen}
        onOpenChange={setEditDialogOpen}
        onSuccess={refetch}
      />
      <SaveProgressIndicator saving={createMutation.isPending} label="Creating lead..." />
    </div>
  );
}
