import { useState } from "react";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { UserAvatar } from "@/components/user-avatar";
import { Input } from "@/components/ui/input";
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
import { StatusBadge } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";
import LeadsImportDialog, { downloadLeadsTemplate } from "./leads-import-dialog";

const LEAD_STATUSES = ["new", "contacted", "qualified", "lost"];

/** Business-unit pill. SIS is blue, JMCS is green, everywhere in the app. */
function unitBadge(type: string) {
  return (
    <Badge variant="outline" className={`font-mono text-[10px] tracking-wider ${type === "JMCS" ? "tone-success" : "tone-info"}`}>
      {type || "—"}
    </Badge>
  );
}

interface LeadSummary {
  total: number;
  thisMonth: number;
  byType: Record<string, number>;
  byStatus: Record<string, number>;
  byTypeAndStatus: Record<string, Record<string, number>>;
  withPhone: number;
  withEmail: number;
  byTypeWithPhone: Record<string, number>;
  byTypeWithEmail: Record<string, number>;
}

const QUICK_REMARKS = ["Called", "Emailed", "Called & Emailed", "No Answer", "Follow Up", "Qualified", "Lost"];

function RemarkInput({ lead, onSave }: { lead: any; onSave: (id: string, notes: string) => void }) {
  const current = lead.notes || "";
  const options = QUICK_REMARKS.includes(current) ? QUICK_REMARKS : [current, ...QUICK_REMARKS];
  return (
    <Select value={current ? options.find(o => o === current) : undefined} onValueChange={(v) => {
      if (v !== current) onSave(lead.id, v);
    }}>
      <SelectTrigger className="h-7 text-xs w-[130px]">
        <SelectValue placeholder="Remark…" />
      </SelectTrigger>
      <SelectContent>
        {current && !QUICK_REMARKS.includes(current) && (
          <SelectItem value={current} className="italic">{current}</SelectItem>
        )}
        {QUICK_REMARKS.map((r) => (
          <SelectItem key={r} value={r}>{r}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

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
  const [position, setPosition] = useState(lead?.position || "");
  const [email, setEmail] = useState(lead?.email || "");
  const [phone, setPhone] = useState(lead?.phone || "");
  const [serviceInterest, setServiceInterest] = useState(lead?.serviceInterest || "");
  const [notes, setNotes] = useState(lead?.notes || "");
  const [status, setStatus] = useState(lead?.status || "new");
  const [saving, setSaving] = useState(false);

  if (lead && !companyName && open) {
    setCompanyName(lead.companyName);
    setContactPerson(lead.contactPerson);
    setPosition(lead.position || "");
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
        body: JSON.stringify({ companyName, contactPerson, position, email, phone, serviceInterest, notes, status }),
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
          <div className="space-y-2">
            <Label>Contact Position</Label>
            <Input value={position} onChange={e => setPosition(e.target.value)} placeholder="e.g. Purchasing Manager" />
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
            <Label>Remarks</Label>
            <Select value={notes} onValueChange={setNotes}>
              <SelectTrigger><SelectValue placeholder="Select remark" /></SelectTrigger>
              <SelectContent>
                {notes && !QUICK_REMARKS.includes(notes) && (
                  <SelectItem value={notes} className="italic">{notes}</SelectItem>
                )}
                {QUICK_REMARKS.map(r => (
                  <SelectItem key={r} value={r}>{r}</SelectItem>
                ))}
              </SelectContent>
            </Select>
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
  const [periodFilter, setPeriodFilter] = useState("");
  const [showAddRow, setShowAddRow] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editingLead, setEditingLead] = useState<any | null>(null);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const isAdmin = user?.roles?.some(r => ["admin", "ADMIN", "IT"].includes(r)) || ["admin", "ADMIN", "IT"].includes(user?.role ?? "") || !!user?.canAccessAdmin;
  const canCreateJmcsLead = user?.canAccessJmcs || isAdmin;
  const canCreateSisLead = user?.canAccessSis || isAdmin;

  const [newRow, setNewRow] = useState({
    companyName: "",
    contactPerson: "",
    position: "",
    email: "",
    phone: "",
    serviceInterest: "",
    notes: "",
    type: canCreateJmcsLead ? "JMCS" : "SIS",
    status: "new",
  });

  const { data: leads, isLoading } = useQuery({
    queryKey: ["leads"],
    queryFn: async () => {
      const res = await fetch("/api/leads");
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  const { data: analysis } = useQuery({
    queryKey: ["leads-analysis"],
    queryFn: async (): Promise<LeadSummary | null> => {
      const res = await fetch("/api/leads/summary");
      if (!res.ok) return null;
      return res.json();
    },
  });

  const refetch = () => {
    queryClient.invalidateQueries({ queryKey: ["leads"] });
    queryClient.invalidateQueries({ queryKey: ["leads-analysis"] });
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
        body: JSON.stringify({ ...newRow }),
      });
      if (!res.ok) throw new Error("Failed to create lead");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      setShowAddRow(false);
      setNewRow({ companyName: "", contactPerson: "", position: "", email: "", phone: "", serviceInterest: "", notes: "", type: canCreateJmcsLead ? "JMCS" : "SIS", status: "new" });
      toast({ title: "Lead created" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to create lead", description: e.message, variant: "destructive" });
    },
  });

  const resetAddRow = () => {
    setShowAddRow(false);
    setNewRow({ companyName: "", contactPerson: "", position: "", email: "", phone: "", serviceInterest: "", notes: "", type: canCreateJmcsLead ? "JMCS" : "SIS", status: "new" });
  };

  const updateRemarks = useMutation({
    mutationFn: async ({ id, notes }: { id: string; notes: string }) => {
      const res = await fetch(`/api/leads/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ notes }),
      });
      if (!res.ok) throw new Error("Failed to save remarks");
      return res.json();
    },
    onSuccess: () => {
      refetch();
      toast({ title: "Remarks saved" });
    },
    onError: () => toast({ title: "Failed to save remarks", variant: "destructive" }),
  });

  const handleCellChange = (field: string, value: string) => {
    setNewRow(prev => ({ ...prev, [field]: value }));
  };

  const leadMonths = Array.from(new Set<string>(
    (leads ?? []).map((l: any) => (l.createdAt || "").slice(0, 7)).filter(Boolean)
  )).sort().reverse();

  const weekStartMs = (() => {
    const now = new Date();
    const day = now.getDay();
    const mon = new Date(now);
    mon.setDate(now.getDate() + (day === 0 ? -6 : 1 - day));
    mon.setHours(0, 0, 0, 0);
    return mon.getTime();
  })();

  const filteredLeads = leads?.filter((lead: any) => {
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm ||
      lead.companyName.toLowerCase().includes(q) ||
      lead.contactPerson.toLowerCase().includes(q) ||
      (lead.position || "").toLowerCase().includes(q) ||
      (lead.email || "").toLowerCase().includes(q);
    const matchesStatus = !statusFilter || lead.status === statusFilter;
    const matchesType = typeFilter === "ALL" || lead.type === typeFilter;
    let matchesPeriod = true;
    if (periodFilter === "week") {
      matchesPeriod = !!lead.createdAt && new Date(lead.createdAt).getTime() >= weekStartMs;
    } else if (periodFilter) {
      matchesPeriod = (lead.createdAt || "").startsWith(periodFilter);
    }
    return matchesSearch && matchesStatus && matchesType && matchesPeriod;
  });

  const isAddValid = newRow.companyName.trim() && newRow.contactPerson.trim();

  /**
   * Enter saves the row, same as pressing the green tick. Escape abandons it.
   * Typing a whole lead should not need a trip to the mouse.
   */
  function handleAddRowKey(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      e.preventDefault();
      if (isAddValid && !createMutation.isPending) createMutation.mutate();
      return;
    }
    if (e.key === "Escape") {
      e.preventDefault();
      resetAddRow();
    }
  }

  return (
    <div className="page-enter space-y-6">
<div className="hidden print:block mb-4">
          <div className="text-center">
            <h1 className="text-xl font-bold uppercase tracking-wide">Leads Report</h1>
            <p className="text-sm">{isAdmin ? "All Leads" : "Granted Services Leads"}</p>
          </div>
          <div className="flex justify-between text-xs mt-3">
            <div className="space-y-0.5">
              <p><span className="font-semibold">Date Generated:</span> {new Date().toLocaleDateString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric" })}</p>
              {periodFilter && (
                <p><span className="font-semibold">Period:</span> {periodFilter === "week" ? "This Week" : format(new Date(`${periodFilter}-01`), "MMMM yyyy")}</p>
              )}
              {statusFilter && <p><span className="font-semibold">Status:</span> <span className="capitalize">{statusFilter}</span></p>}
              {typeFilter !== "ALL" && <p><span className="font-semibold">Type:</span> {typeFilter}</p>}
            </div>
            <div className="text-right">
              <p><span className="font-semibold">Prepared by:</span> {user?.fullName || user?.username || "—"}</p>
              <p><span className="font-semibold">Total Leads:</span> {filteredLeads?.length ?? 0}</p>
            </div>
          </div>
        </div>

        <div className="no-print">
          <PageHeader
            title="Leads"
            description={isAdmin ? "Manage all sales leads." : "Manage sales leads for your granted services."}
            actions={
              <div className="flex items-center gap-2">
                <Button variant="outline" onClick={() => window.print()}>
                  <Icon name="printer" className="mr-2" size={16} />
                  Print Report
                </Button>
                <Button variant="outline" onClick={downloadLeadsTemplate} title="Download an empty Excel template">
                  <Icon name="file-spreadsheet" className="mr-2" size={16} />
                  Template
                </Button>
                <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
                  <Icon name="upload" className="mr-2" size={16} />
                  Import Excel
                </Button>
                <Button onClick={() => setShowAddRow(true)} disabled={showAddRow}>
                  <Icon name="plus" className="mr-2" size={16} />
                  Add Lead
                </Button>
              </div>
            }
          />
        </div>

      {selectedIds.size > 0 && (
        <div className="surface-sunken flex items-center justify-between rounded-lg px-4 py-2 no-print">
          <span className="text-sm font-medium tabular">{selectedIds.size} selected</span>
          <div className="flex items-center gap-2">
            <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>Clear selection</Button>
            <Button variant="destructive" size="sm" onClick={() => setBulkDeleteOpen(true)}>
              <Icon name="trash-2" className="mr-2" size={16} />
              Delete selected
            </Button>
          </div>
        </div>
      )}

      <Card className="surface rounded-lg print:mb-2">
        <CardContent className="pt-5 pb-4 print:pt-2 print:pb-2">
          <div className="flex items-center gap-2 mb-4 print:mb-1">
            <Icon name="bar-chart-2" className="text-primary print:hidden" size={18} />
            <h2 className="text-base font-semibold tracking-tight print:text-xs">Analysis on Leads</h2>
            <Badge variant="outline" className="ml-1 font-mono text-[10px]">
              {analysis?.thisMonth ?? "–"} new this month
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2 print:grid-cols-2 print:gap-1">
            <div className="rounded-lg border p-4 space-y-3 print:p-1 print:space-y-1">
              <div className="flex items-center justify-between print:mb-0">
                <span className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground print:text-[9px]">
                  <Icon name="target" className="print:hidden" size={16} /> Leads
                </span>
                <Badge variant="outline">{analysis?.total ?? "…"} total</Badge>
              </div>
              <div className="space-y-2 print:space-y-1">
                {["JMCS", "SIS"].map((type) => (
                  <div key={type} className="rounded-md bg-muted/30 p-3 space-y-2 print:p-1 print:space-y-0.5">
                    <div className="flex items-center justify-between text-sm print:text-[9px]">
                      <span className="font-medium flex items-center gap-2">
                        <Icon name={type === "JMCS" ? "building-2" : "users"} size={14} className="text-muted-foreground print:hidden" />
                        {type}
                      </span>
                      <span className="font-bold text-base print:text-[10px]">{analysis?.byType?.[type] ?? 0}</span>
                    </div>
                    <div className="flex flex-wrap gap-1.5 text-xs print:gap-0.5 print:text-[8px]">
                      {LEAD_STATUSES.map((s) => (
                        <Badge key={s} variant="outline" className="capitalize">
                          {s}: {analysis?.byTypeAndStatus?.[type]?.[s] ?? 0}
                        </Badge>
                      ))}
                    </div>
                    <div className="flex gap-4 text-xs text-muted-foreground print:gap-2 print:text-[8px]">
                      <span className="flex items-center gap-1">
                        <Icon name="phone" className="print:hidden" size={12} /> {analysis?.byTypeWithPhone?.[type] ?? 0} calls
                      </span>
                      <span className="flex items-center gap-1">
                        <Icon name="mail" className="print:hidden" size={12} /> {analysis?.byTypeWithEmail?.[type] ?? 0} emails
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 no-print">
        <h2 className="text-lg font-semibold tracking-tight flex items-center gap-2">
          <Icon name="users" size={20} className="text-primary" />
          Your Leads
          {filteredLeads && (
            <span className="text-sm font-normal text-muted-foreground">({filteredLeads.length})</span>
          )}
        </h2>
        <div className="flex items-center gap-2">
          <span className="text-xs text-muted-foreground font-medium">Period:</span>
          <Select value={periodFilter} onValueChange={setPeriodFilter}>
            <SelectTrigger className="w-[160px] bg-background">
              <SelectValue placeholder="All Time" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="">All Time</SelectItem>
              <SelectItem value="week">This Week</SelectItem>
              {leadMonths.map((m) => (
                <SelectItem key={m} value={m}>{format(new Date(`${m}-01`), "MMMM yyyy")}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      <Card className="surface rounded-lg">
        <CardContent className="p-0">
          <div className="surface-sunken space-y-3 border-b p-4 no-print">
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
                  <TableHead className="w-[40px] no-print"></TableHead>
                  <TableHead className="min-w-[160px]">Company</TableHead>
                  <TableHead className="min-w-[150px]">Contact Person</TableHead>
                  <TableHead className="min-w-[140px]">Contact Info</TableHead>
                    <TableHead className="min-w-[160px]">Service Interest</TableHead>
                    <TableHead className="min-w-[80px]">Type</TableHead>
                    <TableHead className="min-w-[100px]">Status</TableHead>
                  <TableHead className="hidden sm:table-cell print:table-cell min-w-[130px]">Created By</TableHead>
                  <TableHead className="min-w-[110px]">Date</TableHead>
                  <TableHead className="min-w-[130px]">Remarks</TableHead>
                  <TableHead className="w-[70px] no-print"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showAddRow && (
                  <TableRow className="bg-primary/5 border-b-2 border-primary/30 print:hidden">
                    <TableCell className="no-print">
                      <Checkbox disabled aria-label="New row" />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Company name"
                        aria-label="Company Name"
                        className="h-8 text-xs"
                        value={newRow.companyName}
                        onChange={e => handleCellChange("companyName", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          placeholder="Full name"
                          aria-label="Full Name"
                          className="h-7 text-xs"
                          value={newRow.contactPerson}
                          onChange={e => handleCellChange("contactPerson", e.target.value)}
                          onKeyDown={handleAddRowKey}
                        />
                        <Input
                          placeholder="Position"
                          aria-label="Position"
                          className="h-7 text-xs"
                          value={newRow.position}
                          onChange={e => handleCellChange("position", e.target.value)}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <div className="flex flex-col gap-1">
                        <Input
                          placeholder="Email"
                          aria-label="Email"
                          className="h-7 text-xs"
                          value={newRow.email}
                          onChange={e => handleCellChange("email", e.target.value)}
                        />
                        <Input
                          placeholder="Phone"
                          aria-label="Phone"
                          className="h-7 text-xs"
                          value={newRow.phone}
                          onChange={e => handleCellChange("phone", e.target.value)}
                          onKeyDown={handleAddRowKey}
                        />
                      </div>
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="e.g. ISO 9001"
                        aria-label="Service Interest"
                        className="h-8 text-xs"
                        value={newRow.serviceInterest}
                        onChange={e => handleCellChange("serviceInterest", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell>
                      <Select value={newRow.type} onValueChange={v => setNewRow(prev => ({ ...prev, type: v }))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="JMCS">JMCS</SelectItem>
                          <SelectItem value="SIS">SIS</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <Select value={newRow.status} onValueChange={v => setNewRow(prev => ({ ...prev, status: v }))}>
                        <SelectTrigger className="h-8 text-xs capitalize">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {LEAD_STATUSES.map(s => (
                            <SelectItem key={s} value={s} className="capitalize">{s}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"></TableCell>
                    <TableCell></TableCell>
                    <TableCell>
                      <Select value={newRow.notes} onValueChange={v => setNewRow(prev => ({ ...prev, notes: v }))}>
                        <SelectTrigger className="h-8 text-xs">
                          <SelectValue placeholder="Remark…" />
                        </SelectTrigger>
                        <SelectContent>
                          {QUICK_REMARKS.map(r => (
                            <SelectItem key={r} value={r}>{r}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Save lead"
                          title={isAddValid ? "Save lead" : "Fill in Company name and Full name"}
                          className="h-7 w-7 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50"
                          disabled={!isAddValid || createMutation.isPending}
                          onClick={() => createMutation.mutate()}
                        >
                          <Icon name="check" size={16} />
                        </Button>
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Cancel"
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
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-16" /></TableCell>
                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8" /></TableCell>
                  </TableRow>
                )) : filteredLeads?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-48 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Icon name="target" className="opacity-20 mb-4" size={40} />
                        <p>No leads found.</p>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLeads?.map((lead: any) => (
                    <TableRow key={lead.id} className={`group ${selectedIds.has(lead.id) ? "row-selected" : ""}`}>
                      <TableCell className="no-print">
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
                          <div className="min-w-0">
                            <div className="truncate">{lead.contactPerson}</div>
                            {lead.position && <div className="text-xs text-muted-foreground truncate">{lead.position}</div>}
                          </div>
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
                        {unitBadge(lead.type)}
                      </TableCell>
                      <TableCell>
                        <StatusBadge status={lead.status} />
                      </TableCell>
                      <TableCell className="hidden sm:table-cell print:table-cell text-sm text-muted-foreground">
                        <div className="flex items-center gap-2">
                          {lead.createdByName ? (
                            <>
                              <UserAvatar name={lead.createdByName} photoUrl={lead.createdByPhotoUrl} className="h-6 w-6" fallbackClassName="bg-primary/10 text-primary text-[9px] font-semibold" />
                              <span className="truncate max-w-[120px]">{lead.createdByName}</span>
                            </>
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">
                        {format(new Date(lead.createdAt), "MMM d, yyyy")}
                      </TableCell>
                      <TableCell>
                        <div className="print:hidden">
                          <RemarkInput lead={lead} onSave={(id, notes) => updateRemarks.mutate({ id, notes })} />
                        </div>
                        <span className="hidden print:inline text-sm">{lead.notes || "—"}</span>
                      </TableCell>
                      <TableCell className="no-print">
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

          <div className="surface-sunken flex items-center justify-between border-t px-4 py-3 text-xs text-muted-foreground">
            <span className="tabular">Showing {filteredLeads?.length || 0} {filteredLeads?.length === 1 ? 'lead' : 'leads'}</span>
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

      <LeadsImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={refetch}
        defaultType={canCreateJmcsLead ? "JMCS" : "SIS"}
        canImportJmcs={canCreateJmcsLead}
        canImportSis={canCreateSisLead}
      />
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
