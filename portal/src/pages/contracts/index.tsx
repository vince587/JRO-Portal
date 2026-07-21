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
import { SaveProgressIndicator } from "@/components/upload-progress";
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
import { useQueryClient, useMutation } from "@tanstack/react-query";

function todayStr() {
  return new Date().toISOString().split("T")[0];
}

function nextYearStr() {
  const d = new Date();
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().split("T")[0];
}

function formatDateRange(start: string | undefined, end: string | undefined): string | null {
  if (!start || !end) return null;
  const sd = new Date(start);
  const ed = new Date(end);
  if (isNaN(sd.getTime()) || isNaN(ed.getTime())) return null;
  return `${format(sd, "MMM d, yyyy")} - ${format(ed, "MMM d, yyyy")}`;
}

function formatCurrency(value: unknown): string | null {
  if (typeof value !== "number" || !Number.isFinite(value)) return null;
  return `₱${value.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
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
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

  const canManageContracts = user?.roles?.some(r => ["admin", "ADMIN", "IT", "manager"].includes(r)) || ["admin", "ADMIN", "IT", "manager"].includes(user?.role ?? "");
  const canCreateJmcs = canManageContracts || user?.canAccessJmcs;
  const canCreateSis = canManageContracts || user?.canAccessSis;
  const canCreateAny = canCreateJmcs || canCreateSis;

  const [newRow, setNewRow] = useState({
    title: "",
    type: (routeType || "JMCS") as ContractType,
    status: "pending" as ContractStatus,
    contractNumber: "",
    clientName: "",
    startDate: todayStr(),
    endDate: nextYearStr(),
    value: "",
    description: "",
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

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch("/api/contracts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: newRow.title,
          type: newRow.type,
          status: newRow.status,
          contractNumber: newRow.contractNumber,
          clientName: newRow.clientName,
          startDate: newRow.startDate,
          endDate: newRow.endDate,
          value: Number(newRow.value) || 0,
          description: newRow.description || undefined,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || "Failed to create contract");
      }
      const created = await res.json();
      if (selectedFile) {
        const fd = new FormData();
        fd.append("file", selectedFile);
        const up = await fetch(`/api/upload/contract/${created.id}`, {
          method: "POST",
          body: fd,
        });
        if (!up.ok) {
          throw new Error("Contract created but file upload failed");
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
        endDate: nextYearStr(),
        value: "",
        description: "",
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
    return (
      contract.title.toLowerCase().includes(lowerSearch) ||
      contract.contractNumber.toLowerCase().includes(lowerSearch) ||
      (contract.clientName && contract.clientName.toLowerCase().includes(lowerSearch))
    );
  });

  function resetAddRow() {
    setShowAddRow(false);
    setNewRow({
      title: "",
      type: "JMCS",
      status: "pending",
      contractNumber: "",
      clientName: "",
      startDate: todayStr(),
      endDate: nextYearStr(),
      value: "",
      description: "",
    });
    clearSelectedFile();
  }

  function handleCellChange(field: string, value: string) {
    setNewRow(prev => ({ ...prev, [field]: value }));
  }

  const isAddValid = newRow.title && newRow.contractNumber && newRow.clientName && newRow.value;

  const getStatusBadge = (status: ContractStatus) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50">Active</Badge>;
      case 'pending':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50">Pending</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/50">Completed</Badge>;
      case 'expired':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getTypeBadge = (type: ContractType) => {
    return (
      <Badge variant="secondary" className="font-mono text-[10px] tracking-wider">
        {type}
      </Badge>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="file-text" className="text-primary" size={28} />
            {isSisRoute ? "SIS Contracts" : isJmcsRoute ? "JMCS Contracts" : "Contracts"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {isSisRoute ? "Manage SIS certification contracts." : isJmcsRoute ? "Manage JMCS training contracts." : "Manage and monitor organizational contracts."}
          </p>
        </div>
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

      {selectedIds.size > 0 && (
        <div className="flex items-center justify-between neu-sm rounded-xl px-4 py-2">
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
          <div className="p-4 border-b flex flex-col md:flex-row gap-4 items-center justify-between neu-inset rounded-xl">
            <div className="flex-1 w-full flex items-center relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input 
                placeholder="Search contracts by title, number, or client..." 
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
                  <TableHead className="w-[40px]">
                    <Checkbox
                      checked={
                        (filteredContracts?.length ?? 0) > 0 &&
                        (filteredContracts?.every(c => selectedIds.has(c.id)) ?? false)
                          ? true
                          : (filteredContracts?.some(c => selectedIds.has(c.id)) ?? false)
                            ? "indeterminate"
                            : false
                      }
                      onCheckedChange={() => toggleAllVisible((filteredContracts ?? []).map(c => c.id))}
                      aria-label="Select all"
                    />
                  </TableHead>
                  <TableHead className="w-[100px]">Number</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead className="hidden md:table-cell">Client</TableHead>
                  <TableHead className="hidden sm:table-cell">Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="text-right">Value</TableHead>
                  <TableHead className="text-center min-w-[120px]">Created By</TableHead>
                  <TableHead className="hidden sm:table-cell w-[180px]">Doc</TableHead>
                  <TableHead className="w-[110px]"></TableHead>
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
                        placeholder="CN-XXX"
                        className="h-8 text-xs font-mono"
                        value={newRow.contractNumber}
                        onChange={e => handleCellChange("contractNumber", e.target.value)}
                      />
                    </TableCell>
                    <TableCell>
                      <Input
                        placeholder="Contract title"
                        className="h-8 text-xs"
                        value={newRow.title}
                        onChange={e => handleCellChange("title", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="hidden md:table-cell">
                      <Input
                        placeholder="Client name"
                        className="h-8 text-xs"
                        value={newRow.clientName}
                        onChange={e => handleCellChange("clientName", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="hidden sm:table-cell">
                      {isTypeRoute ? (
                        <span className="text-xs font-medium px-2 py-1 rounded bg-muted">{routeType}</span>
                      ) : (
                        <Select value={newRow.type} onValueChange={v => handleCellChange("type", v)}>
                          <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                          <SelectContent>
                            {canCreateJmcs && <SelectItem value="JMCS">JMCS</SelectItem>}
                            {canCreateSis && <SelectItem value="SIS">SIS</SelectItem>}
                          </SelectContent>
                        </Select>
                      )}
                    </TableCell>
                    <TableCell>
                      <Select value={newRow.status} onValueChange={v => handleCellChange("status", v)}>
                        <SelectTrigger className="h-8 text-xs"><SelectValue /></SelectTrigger>
                        <SelectContent>
                          <SelectItem value="pending">Pending</SelectItem>
                          <SelectItem value="active">Active</SelectItem>
                          <SelectItem value="completed">Completed</SelectItem>
                          <SelectItem value="expired">Expired</SelectItem>
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell className="text-right">
                      <Input
                        type="number"
                        min="0"
                        step="0.01"
                        placeholder="0.00"
                        className="h-8 text-xs text-right w-24 ml-auto"
                        value={newRow.value}
                        onChange={e => handleCellChange("value", e.target.value)}
                      />
                    </TableCell>
                    <TableCell className="hidden lg:table-cell"></TableCell>
                    <TableCell className="hidden sm:table-cell">
                      <div className="flex items-center gap-2">
                        <input
                          ref={fileInputRef}
                          type="file"
                          accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                          className="hidden"
                          onChange={(e) => setSelectedFile(e.target.files?.[0] ?? null)}
                        />
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          className="h-8 text-xs"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          <Icon name="upload" className="mr-1" size={12} />
                          {selectedFile ? "Change" : "Choose"}
                        </Button>
                        {selectedFile && (
                          <span className="text-xs text-muted-foreground truncate max-w-[140px]" title={selectedFile.name}>
                            {selectedFile.name}
                          </span>
                        )}
                      </div>
                    </TableCell>
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
                {isLoading ? (
                  Array(5).fill(0).map((_, i) => (
                    <TableRow key={i}>
                      <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-16" /></TableCell>
                      <TableCell>
                        <div className="space-y-2">
                          <Skeleton className="h-5 w-48" />
                          <Skeleton className="h-3 w-32 hidden sm:block" />
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell"><Skeleton className="h-4 w-32" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-12" /></TableCell>
                      <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                      <TableCell className="text-right"><Skeleton className="h-4 w-20 ml-auto" /></TableCell>
                      <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      <TableCell className="hidden sm:table-cell"><Skeleton className="h-8 w-24" /></TableCell>
                      <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                    </TableRow>
                  ))
                ) : filteredContracts?.length === 0 && !showAddRow ? (
                  <TableRow>
                    <TableCell colSpan={10} className="h-48 text-center text-muted-foreground">
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
                    <TableRow key={contract.id} className="group">
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(contract.id)}
                          onCheckedChange={() => toggleRow(contract.id)}
                          aria-label={`Select ${contract.title}`}
                        />
                      </TableCell>
                      <TableCell className="font-mono text-xs font-medium text-muted-foreground">
                        {contract.contractNumber}
                      </TableCell>
                      <TableCell>
                        <div className="font-medium text-foreground">{contract.title}</div>
                        <div className="text-xs text-muted-foreground hidden sm:block mt-1 flex items-center gap-2">
                          {formatDateRange(contract.startDate, contract.endDate) ?? (
                            <span className="italic">No dates</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden md:table-cell">
                        {contract.clientName || <span className="text-muted-foreground italic">Unspecified</span>}
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        {getTypeBadge(contract.type)}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(contract.status)}
                      </TableCell>
                      <TableCell className="text-right font-medium">
                        {formatCurrency(contract.value) ?? <span className="text-muted-foreground italic">—</span>}
                      </TableCell>
                      <TableCell>
                        <div className="flex justify-center">
                          {(contract as any).createdByName ? (
                            <UserAvatar name={(contract as any).createdByName} photoUrl={(contract as any).createdByPhotoUrl} className="h-8 w-8" fallbackClassName="bg-primary/10 text-primary text-xs font-semibold" />
                          ) : (
                            <span className="text-xs text-muted-foreground italic">—</span>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <span className="text-xs text-muted-foreground">—</span>
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
                            <DropdownMenuItem asChild>
                              <Link href={`/contracts/${contract.id}?edit=true`} className="cursor-pointer flex w-full">
                                <Icon name="edit" className="mr-2" size={16} />
                                Edit Contract
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuSeparator />
                            <DropdownMenuItem className="text-destructive focus:bg-destructive/10 cursor-pointer">
                              <Icon name="trash-2" className="mr-2" size={16} />
                              Delete
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
            <span>
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
      <SaveProgressIndicator saving={createMutation.isPending} label="Creating contract..." />
      <SaveProgressIndicator saving={bulkDeleteMutation.isPending} label="Deleting contracts..." />
    </div>
  );
}
