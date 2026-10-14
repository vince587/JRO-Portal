import { useState, useRef } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"

import { useListContracts, getListContractsQueryKey } from "@workspace/api-client-react";
import { ContractType, ContractStatus } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { UserAvatar } from "@/components/user-avatar";
import { SaveProgressIndicator, UploadProgressOverlay } from "@/components/upload-progress";
import { useUploadProgress } from "@/hooks/use-upload-progress";
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
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Checkbox } from "@/components/ui/checkbox";
import { useQueryClient, useMutation, useQuery } from "@tanstack/react-query";
import ContractsImportDialog, { downloadContractsTemplate } from "@/pages/contracts-import-dialog";
import { StatusBadge, statusLabel } from "@/components/status-badge";
import { PageHeader } from "@/components/page-header";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextYearStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

function formatCurrency(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function addYearsStr(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return dateStr;
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().split("T")[0];
}

const TRAINING_SUGGESTIONS: { label: string; keywords: string[] }[] = [
  { label: "ISO 9001:2015 Training", keywords: ["iso", "9001", "training"] },
  { label: "ISO 14001:2015 Training", keywords: ["iso", "14001", "training"] },
  { label: "ISO 45001:2018 Training", keywords: ["iso", "45001", "training"] },
  { label: "ISO 27001:2022 Training", keywords: ["iso", "27001", "training"] },
  { label: "IMS Training", keywords: ["ims", "integrated"] },
  { label: "ISO 9001:2015 Internal Auditor Training", keywords: ["internal auditor", "auditor"] },
  { label: "ISO 14001:2015 Internal Auditor Training", keywords: ["internal auditor", "auditor"] },
  { label: "ISO 45001:2018 Internal Auditor Training", keywords: ["internal auditor", "auditor"] },
  { label: "ISO 27001:2022 Internal Auditor Training", keywords: ["internal auditor", "auditor"] },
  { label: "ISO 9001:2015 Lead Auditor Training", keywords: ["lead auditor", "auditor"] },
  { label: "ISO 14001:2015 Lead Auditor Training", keywords: ["lead auditor", "auditor"] },
  { label: "ISO 45001:2018 Lead Auditor Training", keywords: ["lead auditor", "auditor"] },
  { label: "ISO 27001:2022 Lead Auditor Training", keywords: ["lead auditor", "auditor"] },
  { label: "ISO Consultancy", keywords: ["consultancy", "consultant"] },
  { label: "ISO 9001:2015 Certification", keywords: ["certification", "cert", "9001", "sis"] },
  { label: "ISO 14001:2015 Certification", keywords: ["certification", "cert", "14001", "sis"] },
  { label: "ISO 45001:2018 Certification", keywords: ["certification", "cert", "45001", "sis"] },
  { label: "ISO 27001:2022 Certification", keywords: ["certification", "cert", "27001", "sis"] },
];

function matchSuggestions(query: string, type: ContractType): string[] {
  const q = query.trim().toLowerCase();
  const pool = TRAINING_SUGGESTIONS.filter(s =>
    type === "SIS" ? s.keywords.includes("sis") : type === "JMCS" ? !s.keywords.includes("sis") : true
  );
  if (!q) {
    return type === "SIS" ? pool.map(s => s.label) : [];
  }
  return pool
    .filter(s => {
      const label = s.label.toLowerCase();
      if (label.includes(q)) return true;
      return s.keywords.some(k => k.includes(q) || q.includes(k));
    })
    .map(s => s.label);
}

export default function ContractsList() {
  const [location] = useLocation();
  const isSisRoute = location === "/contracts/sis";
  const isJmcsRoute = location === "/contracts/jmcs";
  const isTypeRoute = isSisRoute || isJmcsRoute;
  const routeType: ContractType | undefined = isSisRoute ? "SIS" : isJmcsRoute ? "JMCS" : undefined;

  const [searchTerm, setSearchTerm] = useState("");
  const [typeFilter, setTypeFilter] = useState<"ALL" | ContractType>(routeType || "ALL");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ContractStatus>("ALL");
  const [showAddRow, setShowAddRow] = useState(false);
  const [showNameSuggestions, setShowNameSuggestions] = useState(false);
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const uploadProgress = useUploadProgress();

  const canManageContracts = !!user?.canManageContracts;
  const canCreateJmcs = canManageContracts;
  const canCreateSis = canManageContracts;
  const canCreateAny = canManageContracts;

  const [newRow, setNewRow] = useState({
    title: "",
    type: (routeType || "JMCS") as ContractType,
    status: "pending" as ContractStatus,
    contractNumber: "",
    clientName: "",
    startDate: todayStr(),
    endDate: (routeType === "SIS" ? addYearsStr(todayStr(), 3) : nextYearStr()),
    value: "",
    description: "",
    contactPerson: "",
    designation: "",
    contactNumber: "",
    contactEmail: "",
    salesInCharge: "",
    translatedToSales: false,
  });

  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function clearSelectedFile() {
    setSelectedFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

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
      const res = await fetch("/api/contracts/bulk-delete", {
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
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      if (result.errors?.length) {
        toast({ title: `Deleted ${result.deleted}, ${result.errors.length} failed`, variant: "destructive" });
      } else {
        toast({ title: `Deleted ${result.deleted} contracts` });
      }
    },
    onError: (e: Error) => toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" }),
  });

  const queryParams = {
    ...(typeFilter !== "ALL" ? { type: typeFilter as ContractType } : {}),
    ...(statusFilter !== "ALL" ? { status: statusFilter as ContractStatus } : {}),
  };

  const { data: contracts, isLoading } = useListContracts(queryParams);

  const { data: contractAnalysis } = useQuery({
    queryKey: ["contracts-analysis"],
    queryFn: async () => {
      const res = await fetch("/api/contracts/summary");
      if (!res.ok) throw new Error("Failed to fetch contract summary");
      return res.json() as Promise<{
        total: number;
        bySis: number;
        byJmcs: number;
        byStatus: Record<string, number>;
      }>;
    },
  });

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newRow.title || (newRow.clientName ? `${newRow.clientName} Services` : "General Services"),
          type: newRow.type,
          status: newRow.status,
          contractNumber: newRow.contractNumber,
          clientName: newRow.clientName,
          startDate: newRow.startDate,
          endDate: newRow.endDate,
          value: Number(newRow.value) || 0,
          description: newRow.description || undefined,
          contactPerson: newRow.contactPerson || undefined,
          designation: newRow.designation || undefined,
          contactNumber: newRow.contactNumber || undefined,
          contactEmail: newRow.contactEmail || undefined,
          salesInCharge: newRow.salesInCharge || undefined,
          translatedToSales: newRow.translatedToSales,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create contract");
      }
      const created = await res.json();
      if (selectedFile) {
        try {
          const fd = new FormData();
          fd.append("file", selectedFile);
          uploadProgress.startUpload(selectedFile.name, selectedFile.size);
          const up = await uploadProgress.uploadWithProgress(`/api/upload/contract/${created.id}`, fd);
          toast({ title: "File uploaded", description: up?.filename ?? selectedFile.name });
        } catch (e: any) {
          toast({ title: "Contract created but file upload failed", description: e?.message, variant: "destructive" });
        }
      }
      return created;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      setShowAddRow(false);
      setNewRow({
        title: "",
        type: routeType || "JMCS",
        status: "pending",
        contractNumber: "",
        clientName: "",
        startDate: todayStr(),
        endDate: (routeType === "SIS" ? addYearsStr(todayStr(), 3) : nextYearStr()),
        value: "",
        description: "",
        contactPerson: "",
        designation: "",
        contactNumber: "",
        contactEmail: "",
        salesInCharge: "",
        translatedToSales: false,
      });
      clearSelectedFile();
      toast({ title: "Contract created" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to create contract", description: e.message, variant: "destructive" });
    },
  });

  const filteredContracts = contracts?.filter(contract => {
    if (!searchTerm) return true;
    const lowerSearch = searchTerm.toLowerCase();
    const anyC = contract as any;
    return (
      contract.title.toLowerCase().includes(lowerSearch) ||
      contract.contractNumber.toLowerCase().includes(lowerSearch) ||
      (contract.clientName && contract.clientName.toLowerCase().includes(lowerSearch)) ||
      (anyC.contactPerson && anyC.contactPerson.toLowerCase().includes(lowerSearch)) ||
      (anyC.designation && anyC.designation.toLowerCase().includes(lowerSearch)) ||
      (anyC.salesInCharge && anyC.salesInCharge.toLowerCase().includes(lowerSearch)) ||
      (anyC.contactNumber && anyC.contactNumber.toLowerCase().includes(lowerSearch)) ||
      (anyC.contactEmail && anyC.contactEmail.toLowerCase().includes(lowerSearch))
    );
  });

  function resetAddRow() {
    setShowAddRow(false);
    setNewRow({
      title: "",
      type: routeType || "JMCS",
      status: "pending",
      contractNumber: "",
      clientName: "",
      startDate: todayStr(),
      endDate: (routeType === "SIS" ? addYearsStr(todayStr(), 3) : nextYearStr()),
      value: "",
      description: "",
      contactPerson: "",
      designation: "",
      contactNumber: "",
      contactEmail: "",
      salesInCharge: "",
      translatedToSales: false,
    });
    clearSelectedFile();
  }

  function handleCellChange(field: string, value: any) {
    setNewRow(prev => {
      const next = { ...prev, [field]: value };
      if (field === "type") {
        if (value === "SIS") next.endDate = addYearsStr(prev.startDate, 3);
        else if (value === "JMCS") next.endDate = addYearsStr(prev.startDate, 1);
      } else if (field === "startDate" && prev.type === "SIS") {
        next.endDate = addYearsStr(value, 3);
      }
      return next;
    });
    if (field === "type") {
      setShowNameSuggestions(value === "SIS");
    }
  }

  const isAddValid = Boolean(newRow.contractNumber.trim() && newRow.clientName.trim());
  const nameSuggestions = matchSuggestions(newRow.title, newRow.type);

  /**
   * Enter saves the row, same as pressing the green tick. Escape abandons it.
   * Typing a whole contract should not need a trip to the mouse.
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

  const getStatusBadge = (status: ContractStatus) => <StatusBadge status={status} />;

  const getTypeBadge = (type: ContractType) => (
    <Badge variant="outline" className={`font-mono text-[10px] tracking-wider ${type === "JMCS" ? "tone-success" : "tone-info"}`}>
      {type}
    </Badge>
  );

  // Inline cell editing state
  const [editingCell, setEditingCell] = useState<{ id: string | number; field: string } | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string | number; data: Record<string, any> }) => {
      const res = await fetch(`/api/contracts/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || "Failed to update contract");
      }
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
      queryClient.invalidateQueries({ queryKey: ["contracts-analysis"] });
      setEditingCell(null);
      toast({ title: "Contract updated" });
    },
    onError: (e: Error) => {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    },
  });

  function startCellEdit(id: string | number, field: string, initialValue: any) {
    if (!canManageContracts) return;
    setEditingCell({ id, field });
    setEditValue(initialValue !== null && initialValue !== undefined ? String(initialValue) : "");
  }

  function saveCellEdit(id: string | number, field: string, originalValue: any) {
    if (!editingCell || editingCell.id !== id || editingCell.field !== field) return;
    const finalVal = field === "value" ? Number(editValue) || 0 : editValue.trim();
    const origVal = field === "value" ? Number(originalValue) || 0 : String(originalValue ?? "").trim();
    if (String(finalVal) !== String(origVal)) {
      updateMutation.mutate({ id, data: { [field]: finalVal } });
    } else {
      setEditingCell(null);
    }
  }

  function handleToggleSales(id: string | number, currentValue: boolean) {
    if (!canManageContracts) return;
    updateMutation.mutate(
      { id, data: { translatedToSales: !currentValue } },
      {
        onSuccess: () => {
          toast({
            title: !currentValue ? "Marked as translated to sales" : "Removed from sales",
          });
        },
      }
    );
  }

  function EditableCell({
    contractId,
    field,
    value,
    displayValue,
    placeholder = "—",
    className = "",
    mono = false,
    numeric = false,
  }: {
    contractId: string | number;
    field: string;
    value: any;
    displayValue?: React.ReactNode;
    placeholder?: string;
    className?: string;
    mono?: boolean;
    numeric?: boolean;
  }) {
    const isEditing = editingCell?.id === contractId && editingCell?.field === field;

    if (isEditing) {
      return (
        <Input
          autoFocus
          type={numeric ? "number" : "text"}
          min={numeric ? "0" : undefined}
          step={numeric ? "0.01" : undefined}
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={() => saveCellEdit(contractId, field, value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") saveCellEdit(contractId, field, value);
            if (e.key === "Escape") setEditingCell(null);
          }}
          className={`h-7 text-xs ${mono ? "font-mono" : ""} ${numeric ? "text-right tabular-nums" : ""} w-full min-w-[70px] bg-background`}
        />
      );
    }

    return (
      <div
        onClick={(e) => {
          e.stopPropagation();
          startCellEdit(contractId, field, value);
        }}
        title={canManageContracts ? "Click to edit" : undefined}
        className={`group/cell relative inline-flex items-center gap-1 rounded px-1.5 py-1 -mx-1.5 transition-all max-w-full ${
          canManageContracts ? "cursor-pointer hover:bg-muted/70 hover:ring-1 hover:ring-border/80" : ""
        } ${className}`}
      >
        <span className="truncate">{displayValue ?? (value || <span className="text-muted-foreground italic">{placeholder}</span>)}</span>
        {canManageContracts && (
          <Icon
            name="edit-2"
            size={11}
            className="opacity-0 group-hover/cell:opacity-60 text-muted-foreground shrink-0 transition-opacity ml-0.5"
          />
        )}
      </div>
    );
  }

  return (
    <div className="page-enter space-y-6">
      <PageHeader
        title={isSisRoute ? "SIS Contracts" : isJmcsRoute ? "JMCS Contracts" : "Contracts"}
        description={isSisRoute ? "Manage SIS certification contracts." : isJmcsRoute ? "Manage JMCS training contracts." : "Manage and monitor organizational contracts."}
        actions={
        <div className="flex items-center gap-2">
          <Button variant="outline" onClick={downloadContractsTemplate} title="Download an empty Excel template">
            <Icon name="file-spreadsheet" className="mr-2" size={16} />
            Template
          </Button>
          <Button variant="outline" onClick={() => setImportDialogOpen(true)}>
            <Icon name="upload" className="mr-2" size={16} />
            Import Excel
          </Button>
          {canCreateAny ? (
            <Button onClick={() => setShowAddRow(true)} disabled={showAddRow}>
              <Icon name="plus" className="mr-2" size={16} />
              Add Contract
            </Button>
          ) : (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button disabled>
                  <Icon name="plus" className="mr-2" size={16} />
                  Add Contract
                </Button>
              </TooltipTrigger>
              <TooltipContent>
                <p>sorry you dont have permission to add contracts</p>
              </TooltipContent>
            </Tooltip>
          )}
        </div>
        }
      />

      <Card className="surface rounded-lg">
        <CardContent className="pt-5 pb-4">
          <div className="flex items-center gap-2 mb-4">
            <Icon name="bar-chart-2" className="text-primary" size={18} />
            <h2 className="text-base font-semibold tracking-tight">Analysis on Contracts</h2>
            <Badge variant="outline" className="ml-1 tabular text-[10px]">
              {contractAnalysis?.total ?? "…"} total
            </Badge>
          </div>
          <div className="grid gap-4 md:grid-cols-2">
            <div className="space-y-2">
              <div className="grid grid-cols-2 gap-3">
                {[["JMCS", contractAnalysis?.byJmcs ?? 0], ["SIS", contractAnalysis?.bySis ?? 0]].map(([type, count]) => (
                  <div key={type} className="surface-sunken rounded-md p-3">
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <Icon name={type === "JMCS" ? "building-2" : "users"} size={12} /> {type}
                    </div>
                    <div className="text-xl font-bold tabular">{count}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              {["active", "pending", "completed", "expired"].map((s) => (
                <div key={s} className="surface-sunken rounded-md p-3">
                  <div className="text-xs text-muted-foreground">
                    {statusLabel(s)}
                  </div>
                  <div className="text-xl font-bold tabular">{contractAnalysis?.byStatus?.[s] ?? 0}</div>
                </div>
              ))}
            </div>
          </div>
        </CardContent>
      </Card>

      {selectedIds.size > 0 && (
        <div className="surface-sunken flex items-center justify-between rounded-lg px-4 py-2">
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

      <Card className="surface rounded-lg">
        <CardContent className="p-0">
          <div className="surface-sunken flex flex-col gap-4 border-b p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex-1 w-full flex items-center relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input 
                placeholder="Search contracts by name, number, or client..." 
                className="pl-9 bg-background w-full max-w-md"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              {!isTypeRoute && (
                <Tabs value={typeFilter} onValueChange={(v) => setTypeFilter(v as any)} className="w-full md:w-auto">
                  <TabsList className="grid w-full grid-cols-3 md:w-[200px]">
                    <TabsTrigger value="ALL">All</TabsTrigger>
                    <TabsTrigger value="JMCS">JMCS</TabsTrigger>
                    <TabsTrigger value="SIS">SIS</TabsTrigger>
                  </TabsList>
                </Tabs>
              )}
              
              <Select value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
                <SelectTrigger className="w-[140px] bg-background">
                  <div className="flex items-center gap-2">
                    <Icon name="filter" className="opacity-50" size={16} />
                    <SelectValue placeholder="Status" />
                  </div>
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ALL">All Statuses</SelectItem>
                  <SelectItem value="active">Active</SelectItem>
                  <SelectItem value="pending">Pending</SelectItem>
                  <SelectItem value="completed">Completed</SelectItem>
                  <SelectItem value="expired">Expired</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableHead className="w-[40px]" aria-label="Selection" />
                  <TableHead className="w-[130px] whitespace-nowrap">Ref No.</TableHead>
                  <TableHead className="min-w-[170px]">Company Name</TableHead>
                  <TableHead className="min-w-[190px]">Services</TableHead>
                  <TableHead className="min-w-[140px]">Contact Person</TableHead>
                  <TableHead className="min-w-[130px] hidden md:table-cell">Designation</TableHead>
                  <TableHead className="min-w-[120px] hidden lg:table-cell">Contact</TableHead>
                  <TableHead className="text-right whitespace-nowrap">Price / Rates</TableHead>
                  <TableHead className="w-[80px] text-center whitespace-nowrap">
                    <span className="flex items-center justify-center gap-1" title="Translates to Sales">
                      <Icon name="trending-up" size={13} className="text-emerald-600" />
                      Sales?
                    </span>
                  </TableHead>
                  <TableHead className="min-w-[110px] hidden sm:table-cell">Sales In Charge</TableHead>
                  <TableHead className="w-[85px] hidden xl:table-cell">Type</TableHead>
                  <TableHead className="w-[90px]">Status</TableHead>
                  <TableHead className="w-[120px] hidden lg:table-cell">Doc</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {showAddRow && (
                  <TableRow className="bg-primary/5 border-b-2 border-primary/30">
                    <TableCell className="w-[40px]" />
                    <TableCell>
                      <Input
                        placeholder="Ref# 2026-..."
                        aria-label="Reference Number"
                        className="h-8 text-xs font-mono"
                        value={newRow.contractNumber}
                        onChange={e => handleCellChange("contractNumber", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Company name"
                        aria-label="Company Name"
                        className="h-8 text-xs"
                        value={newRow.clientName}
                        onChange={e => handleCellChange("clientName", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell className="relative">
                      <Input
                        placeholder={newRow.type === "SIS" ? "e.g. ISO 9001:2015 Certification" : "e.g. Overview Training Course"}
                        aria-label="Services"
                        className="h-8 text-xs"
                        value={newRow.title}
                        onChange={e => { handleCellChange("title", e.target.value); setShowNameSuggestions(true); }}
                        onFocus={() => setShowNameSuggestions(true)}
                        onBlur={() => setTimeout(() => setShowNameSuggestions(false), 150)}
                        onKeyDown={(e) => {
                          handleAddRowKey(e);
                          if (e.key === "ArrowDown" && nameSuggestions.length > 0) {
                            e.preventDefault();
                            handleCellChange("title", nameSuggestions[0]);
                          }
                        }}
                      />
                      {showNameSuggestions && nameSuggestions.length > 0 && (
                        <div className="absolute left-0 right-0 top-[calc(100%+4px)] z-30 bg-popover border rounded-lg shadow-lg max-h-56 overflow-y-auto">
                          {nameSuggestions.map(opt => (
                            <button
                              key={opt}
                              type="button"
                              className="w-full text-left px-3 py-1.5 text-xs hover:bg-accent hover:text-accent-foreground transition-colors"
                              onMouseDown={(e) => e.preventDefault()}
                              onClick={() => { handleCellChange("title", opt); setShowNameSuggestions(false); }}
                            >
                              {opt}
                            </button>
                          ))}
                        </div>
                      )}
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Contact person"
                        aria-label="Contact Person"
                        className="h-8 text-xs"
                        value={newRow.contactPerson}
                        onChange={e => handleCellChange("contactPerson", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Input
                        placeholder="Designation"
                        aria-label="Designation"
                        className="h-8 text-xs"
                        value={newRow.designation}
                        onChange={e => handleCellChange("designation", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <Input
                        placeholder="Contact no."
                        aria-label="Contact Number"
                        className="h-8 text-xs"
                        value={newRow.contactNumber}
                        onChange={e => handleCellChange("contactNumber", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        inputMode="decimal"
                        placeholder="0.00"
                        aria-label="Price"
                        className="h-8 text-xs text-right tabular-nums"
                        value={newRow.value}
                        onChange={e => handleCellChange("value", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell className="text-center w-[80px]">
                      <div className="flex items-center justify-center">
                        <Checkbox
                          checked={newRow.translatedToSales}
                          onCheckedChange={(checked) => handleCellChange("translatedToSales", Boolean(checked))}
                          aria-label="Translates to sales"
                          className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                        />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <Input
                        placeholder="Sales in charge"
                        aria-label="Sales In Charge"
                        className="h-8 text-xs"
                        value={newRow.salesInCharge}
                        onChange={e => handleCellChange("salesInCharge", e.target.value)}
                        onKeyDown={handleAddRowKey}
                      />
                    </TableCell>
                    <TableCell className="hidden xl:table-cell">
                      {isTypeRoute ? (
                        <div className="h-8 px-2 flex items-center text-xs font-mono text-muted-foreground rounded-md bg-muted">
                          {routeType}
                        </div>
                      ) : (
                        <Select value={newRow.type} onValueChange={v => handleCellChange("type", v)}>
                          <SelectTrigger className="h-8 text-xs" aria-label="Type"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {canCreateJmcs && <SelectItem value="JMCS">JMCS</SelectItem>}
                            {canCreateSis && <SelectItem value="SIS">SIS</SelectItem>}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={newRow.status} onValueChange={v => handleCellChange("status", v)}>
                        <SelectTrigger className="h-8 text-xs" aria-label="Status"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="hidden lg:table-cell">
                      <input
                        ref={fileInputRef}
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.txt"
                        className="hidden"
                        onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                      />
                      {selectedFile ? (
                        <button
                          type="button"
                          onClick={() => fileInputRef.current?.click()}
                          title={selectedFile.name}
                          className="flex items-center gap-1.5 max-w-full text-left text-xs text-muted-foreground hover:text-primary transition-colors"
                        >
                          <Icon name="paperclip" className="shrink-0" size={13} />
                          <span className="truncate">{selectedFile.name}</span>
                        </button>
                      ) : (
                        <Button
                          type="button"
                          variant="outline"
                          className="h-7 px-2 text-xs text-muted-foreground"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Icon name="paperclip" className="mr-1" size={13} />
                          Attach
                        </Button>
                      )}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button
                          size="icon"
                          variant="ghost"
                          aria-label="Save contract"
                          title={isAddValid ? "Save contract" : "Fill in Reference Number and Company Name"}
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
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-36" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-44" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-28" /></TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-16 ml-auto" /></TableCell>
                      <TableCell className="text-center"><Skeleton className="h-4 w-4 mx-auto" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-20" /></TableCell>
                      <TableCell className="hidden xl:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-8 w-20" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredContracts?.length === 0 && !showAddRow ? (
                  <TableRow>
                    <TableCell colSpan={14} className="h-48 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center">
                        <Icon name="file-text" className="opacity-20 mb-4" size={40} />
                        <p>No contracts found matching your criteria.</p>
                        {(searchTerm || typeFilter !== "ALL" || statusFilter !== "ALL") && (
                          <Button 
                            variant="link" 
                            onClick={() => {
                              setSearchTerm("");
                              setTypeFilter("ALL");
                              setStatusFilter("ALL");
                            }}
                          >
                            Clear filters
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredContracts?.map((contract) => (
                    <TableRow key={contract.id} className={`group ${selectedIds.has(contract.id) ? "row-selected" : ""}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(contract.id)}
                          onCheckedChange={() => toggleRow(contract.id)}
                          aria-label={`Select ${contract.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-semibold whitespace-nowrap">
                        <EditableCell
                          contractId={contract.id}
                          field="contractNumber"
                          value={contract.contractNumber}
                          mono
                        />
                      </TableCell>

                      <TableCell className="min-w-[170px]">
                        <EditableCell
                          contractId={contract.id}
                          field="clientName"
                          value={contract.clientName}
                          className="font-medium text-foreground"
                        />
                      </TableCell>
                      <TableCell className="min-w-[190px]">
                        <EditableCell
                          contractId={contract.id}
                          field="title"
                          value={contract.title}
                          className="text-sm text-foreground"
                        />
                      </TableCell>
                      <TableCell className="min-w-[140px]">
                        <EditableCell
                          contractId={contract.id}
                          field="contactPerson"
                          value={(contract as any).contactPerson}
                          className="text-sm font-medium text-foreground"
                        />
                      </TableCell>
                      <TableCell className="min-w-[130px] hidden md:table-cell">
                        <EditableCell
                          contractId={contract.id}
                          field="designation"
                          value={(contract as any).designation}
                          className="text-xs text-muted-foreground"
                        />
                      </TableCell>
                      <TableCell className="min-w-[120px] hidden lg:table-cell">
                        <EditableCell
                          contractId={contract.id}
                          field="contactNumber"
                          value={(contract as any).contactNumber}
                          mono
                          displayValue={
                            <div className="flex flex-col text-xs text-muted-foreground text-left">
                              {(contract as any).contactNumber ? (
                                <span className="font-mono text-[11px]">{(contract as any).contactNumber}</span>
                              ) : (
                                <span className="italic">—</span>
                              )}
                              {(contract as any).contactEmail && (
                                <span className="text-[11px] truncate text-primary/80">{(contract as any).contactEmail}</span>
                              )}
                            </div>
                          }
                        />
                      </TableCell>
                      <TableCell className="text-right font-medium tabular whitespace-nowrap">
                        <EditableCell
                          contractId={contract.id}
                          field="value"
                          value={contract.value}
                          numeric
                          displayValue={formatCurrency(contract.value) ?? <span className="text-muted-foreground italic">—</span>}
                        />
                      </TableCell>
                      <TableCell className="text-center w-[80px]">
                        <div className="flex items-center justify-center">
                          <Checkbox
                            checked={Boolean((contract as any).translatedToSales)}
                            disabled={!canManageContracts || updateMutation.isPending}
                            onCheckedChange={() => handleToggleSales(contract.id, Boolean((contract as any).translatedToSales))}
                            aria-label="Translates to sales"
                            title={Boolean((contract as any).translatedToSales) ? "Translates to sales (click to toggle)" : "Click to mark as translated to sales"}
                            className="data-[state=checked]:bg-emerald-600 data-[state=checked]:border-emerald-600"
                          />
                        </div>
                      </TableCell>
                      <TableCell className="min-w-[110px] hidden sm:table-cell">
                        <EditableCell
                          contractId={contract.id}
                          field="salesInCharge"
                          value={(contract as any).salesInCharge || (contract as any).assignedTo}
                          className="text-xs font-medium text-foreground/80"
                        />
                      </TableCell>
                      <TableCell className="hidden xl:table-cell">
                        {editingCell?.id === contract.id && editingCell?.field === "type" ? (
                          <Select
                            defaultValue={contract.type}
                            onValueChange={(v) => {
                              updateMutation.mutate({ id: contract.id, data: { type: v } });
                              setEditingCell(null);
                            }}
                            open
                            onOpenChange={(open) => { if (!open) setEditingCell(null); }}
                          >
                            <SelectTrigger className="h-7 text-xs w-[85px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="JMCS">JMCS</SelectItem>
                              <SelectItem value="SIS">SIS</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              startCellEdit(contract.id, "type", contract.type);
                            }}
                            title={canManageContracts ? "Click to change type" : undefined}
                            className={`inline-block ${canManageContracts ? "cursor-pointer hover:opacity-80" : ""}`}
                          >
                            {getTypeBadge(contract.type)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        {editingCell?.id === contract.id && editingCell?.field === "status" ? (
                          <Select
                            defaultValue={contract.status}
                            onValueChange={(v) => {
                              updateMutation.mutate({ id: contract.id, data: { status: v } });
                              setEditingCell(null);
                            }}
                            open
                            onOpenChange={(open) => { if (!open) setEditingCell(null); }}
                          >
                            <SelectTrigger className="h-7 text-xs w-[105px]"><SelectValue /></SelectTrigger>
                            <SelectContent>
                              <SelectItem value="active">Active</SelectItem>
                              <SelectItem value="pending">Pending</SelectItem>
                              <SelectItem value="completed">Completed</SelectItem>
                              <SelectItem value="expired">Expired</SelectItem>
                            </SelectContent>
                          </Select>
                        ) : (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              startCellEdit(contract.id, "status", contract.status);
                            }}
                            title={canManageContracts ? "Click to change status" : undefined}
                            className={`inline-block ${canManageContracts ? "cursor-pointer hover:opacity-80" : ""}`}
                          >
                            {getStatusBadge(contract.status)}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell">
                        <DocPreview contract={contract as any} />
                      </TableCell>
                      <TableCell>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                              <span className="sr-only">Open menu</span>
                              <Icon name="more-horizontal" size={16} />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuLabel>Actions</DropdownMenuLabel>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem asChild>
                              <Link href={`/contracts/${contract.id}`} className="cursor-pointer flex w-full">
                                <Icon name="eye" className="mr-2" size={16} />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            {canManageContracts && (
                              <>
                                <DropdownMenuItem asChild>
                                  <Link href={`/contracts/${contract.id}?edit=true`} className="cursor-pointer flex w-full">
                                    <Icon name="edit" className="mr-2" size={16} />
                                    Edit Contract
                                  </Link>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  className="text-destructive focus:bg-destructive/10 cursor-pointer"
                                  onClick={() => {
                                    setSelectedIds(prev => {
                                      const next = new Set(prev);
                                      next.add(contract.id);
                                      return next;
                                    });
                                    setBulkDeleteOpen(true);
                                  }}
                                >
                                  <Icon name="trash-2" className="mr-2" size={16} />
                                  Delete
                                </DropdownMenuItem>
                              </>
                            )}
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
            <span className="tabular">
              Showing {filteredContracts?.length || 0} {filteredContracts?.length === 1 ? 'contract' : 'contracts'}
            </span>
          </div>
        </CardContent>
      </Card>

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} contract{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected contracts will be permanently removed.
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
      <ContractsImportDialog
        open={importDialogOpen}
        onOpenChange={setImportDialogOpen}
        onImported={() => {
          queryClient.invalidateQueries({ queryKey: getListContractsQueryKey() });
          queryClient.invalidateQueries({ queryKey: ["contracts-analysis"] });
        }}
        defaultType={(routeType || "JMCS") as "JMCS" | "SIS"}
      />
      <SaveProgressIndicator saving={createMutation.isPending} label="Creating contract..." />
      <SaveProgressIndicator saving={bulkDeleteMutation.isPending} label="Deleting contracts..." />
      <UploadProgressOverlay uploading={uploadProgress.uploading} progress={uploadProgress.progress} fileName={uploadProgress.fileName} fileSize={uploadProgress.fileSize} />
    </div>
  );
}

function DocPreview({ contract }: { contract: { documentName?: string | null; documentUrl?: string | null } }) {
  const name = contract.documentName ?? null;
  const url = contract.documentUrl ?? null;

  if (!name) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  // Document exists but its download URL could not be signed (e.g. storage
  // config issue) — still show the file name so users know a doc is attached.
  if (!url) {
    return (
      <span className="flex items-center gap-2 max-w-[180px]" title={name ?? undefined}>
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon name="file-text" size={16} className="text-muted-foreground" />
        </span>
        <span className="max-w-[130px] truncate text-xs text-muted-foreground">{name}</span>
      </span>
    );
  }

  const ext = name.split(".").pop()?.toLowerCase();
  const isImage = ["jpg", "jpeg", "png", "gif", "webp", "bmp"].includes(ext ?? "");

  return (
    <a
      href={url}
      target="_blank"
      rel="noopener noreferrer"
      className="group flex items-center gap-2 max-w-[180px]"
      title={name}
    >
      {isImage ? (
        <img
          src={url}
          alt={name}
          className="h-9 w-9 shrink-0 rounded-md border border-border object-cover"
        />
      ) : (
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md border border-border bg-muted/40">
          <Icon name="file-text" size={16} className="text-muted-foreground" />
        </span>
      )}
      <span className="max-w-[130px] truncate text-xs text-muted-foreground transition-colors group-hover:text-primary">
        {name}
      </span>
    </a>
  );
}
