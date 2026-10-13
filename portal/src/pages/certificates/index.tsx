import { useState, useRef, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"

import { useListCertificates, getListCertificatesQueryKey } from "@workspace/api-client-react";
import { CertificateStatus } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
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
import { SaveProgressIndicator } from "@/components/upload-progress";
import { PageHeader } from "@/components/page-header";
import { storage, hasConfig as hasFirebase } from "@/lib/firebase";
import { ref, listAll, getDownloadURL } from "firebase/storage";

const ISO_STANDARDS = ["ISO 9001", "ISO 14001", "ISO 45001", "ISO 27001"];

const VERIFY_URL = "https://certvrfy.jro-jmcs.com";

/** Show a small QR code thumbnail image, or a placeholder if not yet generated */
function QRCodeThumbnail({ url, onClick }: { url?: string | null; onClick?: () => void }) {
  return (
    <div
      className="w-10 h-10 rounded-md surface-sunken flex items-center justify-center overflow-hidden cursor-pointer hover:border-primary/50 hover:shadow-sm transition-all shrink-0"
      onClick={onClick}
      title={url ? "Click to view QR code" : "QR code not yet generated"}
    >
      {url ? (
        <img src={url} alt="QR Code" className="w-full h-full object-contain" />
      ) : (
        <Icon name="qr-code" className="text-muted-foreground/40" size={20} />
      )}
    </div>
  );
}

function formatDateSafe(date: string | undefined): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  return format(d, "MMM d, yyyy");
}

/** Add N years to a date string, for computing surveillance/recertification due dates off the issue date */
function addYearsSafe(date: string | undefined, years: number): string | null {
  if (!date) return null;
  const d = new Date(date);
  if (isNaN(d.getTime())) return null;
  d.setFullYear(d.getFullYear() + years);
  return format(d, "MMM d, yyyy");
}

function FirebaseImportDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [files, setFiles] = useState<{ name: string; url: string }[]>([]);
  const [loading, setLoading] = useState(false);
  const [importing, setImporting] = useState<string[]>([]);

  const openDialog = async () => {
    setOpen(true);
    if (!storage) return;
    setLoading(true);
    try {
      const certRef = ref(storage, "certificates");
      const result = await listAll(certRef);
      const items = await Promise.all(
        result.items.map(async (item) => ({
          name: item.name,
          url: await getDownloadURL(item),
        }))
      );
      setFiles(items);
    } catch (e: any) {
      toast({ title: "Failed to list Firebase files", description: e.message, variant: "destructive" });
    } finally {
      setLoading(false);
    }
  };

  const importFile = async (file: { name: string; url: string }) => {
    setImporting(prev => [...prev, file.name]);
    try {
      const title = file.name.replace(/\.[^/.]+$/, "").replace(/[-_]/g, " ");
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          recipientName: "Pending",
          issuedBy: "Pending",
          issueDate: format(new Date(), "yyyy-MM-dd"),
          expiryDate: format(new Date(new Date().setFullYear(new Date().getFullYear() + 1)), "yyyy-MM-dd"),
          category: file.name.toLowerCase().includes("iso") ? "iso" : "training",
          fileUrl: file.url,
        }),
      });
      if (!res.ok) throw new Error("Import failed");
      queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
      toast({ title: `Imported "${title}"` });
    } catch (e: any) {
      toast({ title: `Failed to import ${file.name}`, description: e.message, variant: "destructive" });
    } finally {
      setImporting(prev => prev.filter(n => n !== file.name));
    }
  };

  return (
    <>
      
        
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from Firebase Storage</DialogTitle>
            <DialogDescription>Select certificate files from Firebase Storage to import.</DialogDescription>
          </DialogHeader>
          {loading ? (
            <div className="space-y-2">
              {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full rounded" />)}
            </div>
          ) : files.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No files found in Firebase Storage</p>
          ) : (
            <div className="space-y-2">
              {files.map(f => (
                <div key={f.name} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{f.name}</p>
                    <p className="text-xs text-muted-foreground truncate">{f.url}</p>
                  </div>
                  <Button size="sm" variant="outline" onClick={() => importFile(f)} disabled={importing.includes(f.name)} className="ml-2 shrink-0">
                    {importing.includes(f.name) ? "..." : "Import"}
                  </Button>
                </div>
              ))}
            </div>
          )}
          <DialogFooter>
            <Button variant="outline" onClick={() => setOpen(false)}>Close</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

function BulkImportButton() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);

  const importMutation = useMutation({
    mutationFn: async (file: File) => {
      const formData = new FormData();
      formData.append("file", file);
      const res = await fetch("/api/upload/bulk-certificates", { method: "POST", body: formData });
      if (!res.ok) throw new Error("Import failed");
      return res.json();
    },
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
      toast({ title: `Imported ${data.imported} certificates`, description: data.errors?.length ? `${data.errors.length} errors` : undefined });
      setOpen(false);
    },
    onError: () => toast({ title: "Import failed", variant: "destructive" }),
  });

  return (
    <>
      <input type="file" ref={fileRef} accept=".csv" className="hidden" onChange={e => { if (e.target.files?.[0]) importMutation.mutate(e.target.files[0]); }} />
      <Button variant="outline" onClick={() => fileRef.current?.click()} disabled={importMutation.isPending}>
        <Icon name="file-up" className="mr-2" size={16} />
        {importMutation.isPending ? "Importing..." : "Bulk Import"}
      </Button>
    </>
  );
}

function JsonImportDialog() {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [importing, setImporting] = useState<Record<string, boolean>>({});
  const [open, setOpen] = useState(false);
  const [jsonData, setJsonData] = useState<any[] | null>(null);
  const [fileName, setFileName] = useState("");

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setFileName(file.name);
    setOpen(true);
    try {
      const text = await file.text();
      const parsed = JSON.parse(text);
      const data = Array.isArray(parsed) ? parsed : [parsed];
      setJsonData(data);
      toast({ title: `Loaded ${data.length} certificates from JSON` });
    } catch (err: any) {
      toast({ title: "Invalid JSON file", description: err.message, variant: "destructive" });
      setJsonData(null);
    }
  };

  const importCert = async (cert: any) => {
    const key = cert.certificateNumber || cert.title || Math.random().toString();
    setImporting((prev) => ({ ...prev, [key]: true }));
    try {
      const res = await fetch("/api/certificates", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title: cert.title || cert.certificateNumber || "",
          recipientName: cert.participantName || cert.recipientName || "",
          recipientEmail: cert.recipientEmail || cert.email || "",
          issuedBy: cert.issuedBy || cert.trainer || "",
          issueDate: cert.dateIssued || cert.issueDate || "",
          expiryDate: cert.dateValidUntil || cert.expiryDate || "",
          certificateNumber: cert.certificateNumber || "",
          trainingType: cert.trainingType || "",
          category: (cert.category || "").toLowerCase() || "training",
          standard: cert.standard || "",
          fileUrl: cert.fileUrl || cert.pdfUrl || "",
          qrCodeUrl: cert.qrCodeUrl || "",
          notes: cert.notes || "",
          status: "active",
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
      return true;
    } catch (err: any) {
      toast({ title: `Failed: ${key}`, description: err.message, variant: "destructive" });
      return false;
    } finally {
      setImporting((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
    }
  };

  const importAll = async () => {
    if (!jsonData) return;
    let count = 0;
    for (const cert of jsonData) {
      const ok = await importCert(cert);
      if (ok) count++;
    }
    toast({ title: `Imported ${count} of ${jsonData.length} certificates` });
    setJsonData(null);
    setOpen(false);
    if (fileRef.current) fileRef.current.value = "";
  };

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept=".json"
        className="hidden"
        onChange={handleFileChange}
      />
      <Button
        variant="outline"
        onClick={() => fileRef.current?.click()}
        disabled={!!jsonData}
      >
        <Icon name="file-up" className="mr-2" size={16} />
        {jsonData ? `Importing ${jsonData.length}...` : "Import JSON"}
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Import from JSON</DialogTitle>
            <DialogDescription>
              {fileName ? `File: ${fileName} — ${jsonData?.length || 0} certificates` : "Select a JSON file to import certificates."}
            </DialogDescription>
          </DialogHeader>
          {jsonData && (
            <div className="space-y-2 max-h-[400px] overflow-y-auto">
              {jsonData.slice(0, 20).map((cert, i) => (
                <div key={i} className="flex items-center justify-between p-3 border rounded-lg hover:bg-muted/20">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">{cert.certificateNumber || cert.title || `#${i + 1}`}</p>
                    <p className="text-xs text-muted-foreground truncate">{cert.participantName || cert.recipientName}</p>
                  </div>
                  <Badge variant="outline" className={importing[cert.certificateNumber || cert.title] ? "bg-blue-100" : ""}>
                    {cert.category || "training"}
                  </Badge>
                </div>
              ))}
              {jsonData.length > 20 && (
                <p className="text-sm text-muted-foreground text-center">
                  ... and {jsonData.length - 20} more
                </p>
              )}
            </div>
          )}
          <DialogFooter>
            {jsonData && (
              <>
                <Button variant="outline" onClick={() => { setJsonData(null); setOpen(false); }}>
                  Cancel
                </Button>
                <Button onClick={importAll} disabled={Object.keys(importing).length > 0}>
                  {Object.keys(importing).length > 0 ? `Importing ${Object.keys(importing).length}...` : "Import All"}
                </Button>
              </>
            )}
            <Button variant="outline" onClick={() => setOpen(false)}>
              Close
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

export default function CertificatesList() {
  const [location] = useLocation();
  const isIsoRoute = location === "/certificates/iso";
  const isTrainingRoute = location === "/certificates/training";
  const isCategoryRoute = isIsoRoute || isTrainingRoute;
  const routeCategory: "iso" | "training" | undefined = isIsoRoute ? "iso" : isTrainingRoute ? "training" : undefined;

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | CertificateStatus>("ALL");
  // The department route (e.g. /certificates/iso) only influences the page
  // title and the "Add" button label. Certificate LIST visibility is NOT
  // restricted by department — every authenticated user sees all records
  // (admin-uploaded included). The ISO / Training tabs are just a view filter
  // the user can opt into, defaulting to "all".
  const [categoryFilter, setCategoryFilter] = useState<"all" | "iso" | "training">("all");
  const [standardFilter, setStandardFilter] = useState<string>("ALL");
  const [trainingTypeFilter, setTrainingTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [isoPage, setIsoPage] = useState(1);
  const [trainingPage, setTrainingPage] = useState(1);
  const pageSize = 10;
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { user } = useAuth();

  const isJmcsOnly = user?.canAccessJmcs && !user?.canAccessSis;
  const isSisOnly = user?.canAccessSis && !user?.canAccessJmcs;
  const canManageCertificates = !!user?.canManageCertificates;

  // Ensure categoryFilter respects user access
  useEffect(() => {
    let corrected = categoryFilter;
    if (isJmcsOnly && categoryFilter === "iso") corrected = "all";
    if (isSisOnly && categoryFilter === "training") corrected = "all";
    if (corrected !== categoryFilter) {
      setCategoryFilter(corrected);
    }
  }, [categoryFilter, isJmcsOnly, isSisOnly]);

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
      const res = await fetch("/api/certificates/bulk-delete", {
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
      queryClient.invalidateQueries({ queryKey: getListCertificatesQueryKey() });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      if (result.errors?.length) {
        toast({ title: `Deleted ${result.deleted}, ${result.errors.length} failed`, variant: "destructive" });
      } else {
        toast({ title: `Deleted ${result.deleted} certificates` });
      }
    },
    onError: (e: Error) => toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" }),
  });

  const queryParams = {
    ...(statusFilter !== "ALL" ? { status: statusFilter as CertificateStatus } : {}),
    // NOTE: The category tab (All / ISO / Training) is applied client-side
    // below. We intentionally do NOT send `category` to the server so that
    // every authenticated user receives the full certificate list — this
    // keeps admin-uploaded records visible to non-admin employees instead of
    // hiding them behind a department category they don't have access to.
  };

  const { data: certificates, isLoading } = useListCertificates(queryParams);

  // Build dynamic option lists from whatever standards/training types
  // actually exist in the data, so the filter never goes stale.
  const availableStandards = Array.from(
    new Set((certificates || []).map(c => c.standard).filter((s): s is string => !!s))
  ).sort();
  const availableTrainingTypes = Array.from(
    new Set((certificates || []).map(c => c.trainingType).filter((t): t is string => !!t))
  ).sort();

  const filteredCertificates = certificates?.filter(cert => {
    if (categoryFilter !== "all" && (cert.category || "") !== categoryFilter) return false;
    if (standardFilter !== "ALL" && cert.standard !== standardFilter) return false;
    if (trainingTypeFilter !== "ALL" && cert.trainingType !== trainingTypeFilter) return false;
    if (!searchTerm) return true;
    const lowerSearch = searchTerm.toLowerCase();
    const matchesTitle = cert.title && cert.title.toLowerCase().includes(lowerSearch);
    const matchesRecipient = cert.recipientName && cert.recipientName.toLowerCase().includes(lowerSearch);
    const matchesNumber = cert.certificateNumber && cert.certificateNumber.toLowerCase().includes(lowerSearch);
    return matchesTitle || matchesRecipient || matchesNumber;
  });

  const hasActiveFilters =
    statusFilter !== "ALL" || categoryFilter !== "all" || standardFilter !== "ALL" ||
    trainingTypeFilter !== "ALL" || !!searchTerm;

  const clearFilters = () => {
    setSearchTerm("");
    setStatusFilter("ALL");
    setCategoryFilter("all");
    setStandardFilter("ALL");
    setTrainingTypeFilter("ALL");
    setPage(1);
    setIsoPage(1);
    setTrainingPage(1);
  };

  const isoCerts = (filteredCertificates ?? []).filter(c => (c.category || "") === "iso");
  const trainingCerts = (filteredCertificates ?? []).filter(c => (c.category || "") !== "iso");

  const isIsoView = categoryFilter === "iso";
  const columnCount = 10;

  // Jump back to page 1 whenever the result set changes shape, so the user
  // never lands on a page that no longer has any rows.
  useEffect(() => {
    setPage(1);
    setIsoPage(1);
    setTrainingPage(1);
  }, [searchTerm, statusFilter, categoryFilter, standardFilter, trainingTypeFilter]);

  // Drop whichever sub-filter no longer applies when the category tab changes.
  useEffect(() => {
    if (categoryFilter !== "iso") setStandardFilter("ALL");
    if (categoryFilter !== "training") setTrainingTypeFilter("ALL");
  }, [categoryFilter]);

  const getStatusBadge = (status: CertificateStatus) => {
    switch (status) {
      case 'active':
        return <Badge variant="outline" className="tone-success">Active</Badge>;
      case 'expiring_soon':
        return <Badge variant="outline" className="tone-warning">Expiring Soon</Badge>;
      case 'expired':
        return <Badge variant="outline" className="tone-danger">Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const renderTable = (
    source: any[],
    opts: {
      isoColumns: boolean;
      showQR: boolean;
      page: number;
      setPage: React.Dispatch<React.SetStateAction<number>>;
      emptyLabel: string;
    }
  ) => {
    const { isoColumns, showQR, page, setPage, emptyLabel } = opts;
    const totalItems = source.length;
    const totalPages = Math.max(1, Math.ceil(totalItems / pageSize));
    const currentPage = Math.min(page, totalPages);
    const rows = source.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    return (
      <>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow className="bg-muted/10 hover:bg-muted/10">
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      rows.length > 0 && rows.every(c => selectedIds.has(c.id))
                        ? true
                        : rows.some(c => selectedIds.has(c.id))
                          ? "indeterminate"
                          : false
                    }
                    onCheckedChange={() => toggleAllVisible(rows.map(c => c.id))}
                    aria-label="Select all"
                  />
                </TableHead>
                {isoColumns ? (
                  <>
                    <TableHead>ISO Certificate</TableHead>
                    <TableHead className="hidden sm:table-cell">Certificate No</TableHead>
                    <TableHead className="hidden lg:table-cell">Issued Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Expiry</TableHead>
                    <TableHead className="hidden lg:table-cell">Surveillance 1 Due</TableHead>
                    <TableHead className="hidden lg:table-cell">Surveillance 2 Due</TableHead>
                    <TableHead className="hidden lg:table-cell">Recertification Due</TableHead>
                  </>
                ) : (
                  <>
                    <TableHead>Training Certificate</TableHead>
                    <TableHead className="hidden sm:table-cell">Certificate #</TableHead>
                    <TableHead className="hidden md:table-cell">Owner</TableHead>
                    <TableHead className="hidden lg:table-cell">Created By</TableHead>
                    <TableHead className="hidden lg:table-cell">Issue Date</TableHead>
                    <TableHead className="hidden lg:table-cell">Expiry</TableHead>
                  </>
                )}
                <TableHead>Status</TableHead>
                {showQR && <TableHead className="w-[70px]">QR</TableHead>}
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><Skeleton className="h-4 w-4" /></TableCell>
                    <TableCell>
                      <div className="space-y-2">
                        <Skeleton className="h-5 w-48" />
                        <Skeleton className="h-3 w-32 hidden sm:block" />
                      </div>
                    </TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-20" /></TableCell>
                    {isoColumns ? (
                      <>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      </>
                    ) : (
                      <>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                        <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                      </>
                    )}
                    <TableCell><Skeleton className="h-5 w-24 rounded-full" /></TableCell>
                    {showQR && <TableCell><Skeleton className="h-6 w-10" /></TableCell>}
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                ))
              ) : rows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={columnCount} className="h-40 text-center text-muted-foreground">
                    <div className="flex flex-col items-center justify-center">
                      <Icon name="shield-check" className="opacity-20 mb-3" size={36} />
                      <p>{emptyLabel}</p>
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                rows.map((cert) => {
                  const isExpiringSoon = cert.status === 'expiring_soon';
                  const isIso = cert.category === "iso";
                  return (
                    <TableRow key={cert.id} className={`group ${isExpiringSoon ? 'bg-amber-50 dark:bg-amber-900/10' : ''}`}>
                      <TableCell>
                        <Checkbox
                          checked={selectedIds.has(cert.id)}
                          onCheckedChange={() => toggleRow(cert.id)}
                          aria-label={`Select ${cert.title}`}
                        />
                      </TableCell>
                      {isoColumns ? (
                        <>
                          <TableCell>
                            <div className="font-medium">
                              {cert.standard || "ISO"}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell font-mono text-xs font-medium">
                            {cert.certificateNumber || <span className="italic">N/A</span>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {formatDateSafe(cert.issueDate) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {formatDateSafe(cert.expiryDate) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {addYearsSafe(cert.issueDate, 1) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {addYearsSafe(cert.issueDate, 2) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {addYearsSafe(cert.issueDate, 3) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                        </>
                      ) : (
                        <>
                          <TableCell>
                            <div className="font-medium">
                              {isIso ? cert.standard || "ISO" : cert.trainingType || "Training"}
                            </div>
                          </TableCell>
                          <TableCell className="hidden sm:table-cell font-mono text-xs font-medium">
                            {cert.certificateNumber || <span className="italic">N/A</span>}
                          </TableCell>
                          <TableCell>
                            <div className="font-medium">
                              {cert.recipientName || <span className="text-muted-foreground italic">Unspecified</span>}
                            </div>
                            {cert.recipientEmail && (
                              <div className="text-xs text-muted-foreground">{cert.recipientEmail}</div>
                            )}
                          </TableCell>
                          <TableCell className="hidden lg:table-cell text-xs text-muted-foreground">
                            {(cert as any).createdByName || <span className="italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            {formatDateSafe(cert.issueDate) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell text-sm">
                            {formatDateSafe(cert.expiryDate) ?? <span className="text-muted-foreground italic">—</span>}
                          </TableCell>
                        </>
                      )}
                      <TableCell>
                        {getStatusBadge(cert.status)}
                      </TableCell>
                      {showQR && (
                        <TableCell>
                          {cert.category === "iso" ? null : cert.qrCodeUrl ? (
                            <Dialog>
                              <DialogTrigger asChild>
                                <QRCodeThumbnail url={cert.qrCodeUrl} />
                              </DialogTrigger>
                              <DialogContent className="sm:max-w-sm">
                                <DialogHeader>
                                  <DialogTitle>QR Code — {cert.title}</DialogTitle>
                                  <DialogDescription>
                                    Scan this QR code to verify the certificate at {VERIFY_URL}
                                  </DialogDescription>
                                </DialogHeader>
                                <div className="flex justify-center p-4">
                                  <img
                                    src={cert.qrCodeUrl}
                                    alt="QR Code"
                                    className="w-48 h-48 object-contain border rounded-lg"
                                  />
                                </div>
                                <div className="text-center text-xs text-muted-foreground">
                                  <Icon name="external-link" className="inline mr-1" size={12} />
                                  <a href={VERIFY_URL} target="_blank" rel="noopener noreferrer" className="underline">
                                    {VERIFY_URL}
                                  </a>
                                </div>
                                <DialogFooter>
                                  <Button variant="outline" asChild>
                                    <a href={cert.qrCodeUrl} download={`qr-${cert.id}.png`}>
                                      <Icon name="download" className="mr-2" size={16} />
                                      Download
                                    </a>
                                  </Button>
                                </DialogFooter>
                              </DialogContent>
                            </Dialog>
                          ) : (
                            <QRCodeThumbnail url={null} />
                          )}
                        </TableCell>
                      )}
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
                              <Link href={`/certificates/${cert.id}`} className="cursor-pointer flex w-full">
                                <Icon name="eye" className="mr-2" size={16} />
                                View Details
                              </Link>
                            </DropdownMenuItem>
                            <DropdownMenuItem asChild>
                              <Link href={`/certificates/${cert.id}?edit=true`} className="cursor-pointer flex w-full">
                                <Icon name="edit" className="mr-2" size={16} />
                                Edit Record
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
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {!isLoading && totalItems > 0 && (
          <div className="flex flex-col sm:flex-row items-center justify-between gap-3 px-4 py-3 border-t surface-sunken rounded-lg">
            <span className="text-xs text-muted-foreground">
              Showing {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, totalItems)} of {totalItems}
            </span>
            <div className="flex items-center gap-2">
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={currentPage <= 1}
                onClick={() => setPage(p => Math.max(1, p - 1))}
              >
                <Icon name="chevron-left" size={16} />
                Previous
              </Button>
              <span className="text-xs text-muted-foreground tabular-nums px-1">
                Page {currentPage} of {totalPages}
              </span>
              <Button
                variant="outline"
                size="sm"
                className="gap-1"
                disabled={currentPage >= totalPages}
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              >
                Next
                <Icon name="chevron-right" size={16} />
              </Button>
            </div>
          </div>
        )}
      </>
    );
  };

  return (
    <div className="space-y-6 page-enter">
      <PageHeader
        title={isIsoRoute ? "ISO Certificates" : isTrainingRoute ? "Training Records" : "Certificates"}
        description={isIsoRoute ? "Manage ISO certification records." : isTrainingRoute ? "Manage training records." : "Track client ISO and Training Certificates"}
        actions={
          <div className="flex items-center gap-2">
            <FirebaseImportDialog />
            <BulkImportButton />
            <JsonImportDialog />
            <Button variant="outline" asChild>
              <a href="/api/reports/certificates" download>
                <Icon name="download" className="mr-2" size={16} />
                Export
              </a>
            </Button>
            {user && canManageCertificates ? (
              <Button asChild>
                <Link href="/certificates/new" className="flex items-center">
                  <Icon name="plus" className="mr-2" size={16} />
                  {isIsoRoute ? "Add ISO Certificate" : isTrainingRoute ? "Add Training Record" : "Add Record"}
                </Link>
              </Button>
            ) : (
              <Tooltip>
                <TooltipTrigger asChild>
                  <Button disabled>
                    <Icon name="plus" className="mr-2" size={16} />
                    {isIsoRoute ? "Add ISO Certificate" : isTrainingRoute ? "Add Training Record" : "Add Record"}
                  </Button>
                </TooltipTrigger>
                <TooltipContent>
                  <p>{user ? "sorry you dont have permission to add certificates" : "Please sign in to add certificates"}</p>
                </TooltipContent>
              </Tooltip>
            )}
          </div>
        }
      />

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

      <Card className="surface rounded-lg">
        <CardContent className="p-0">
          <div className="p-4 border-b flex flex-col md:flex-row gap-4 items-center justify-between surface-sunken rounded-lg">
            <div className="flex-1 w-full flex items-center relative">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input 
                placeholder="Search by title, recipient, or number..." 
                className="pl-9 bg-background w-full max-w-md"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>
            <div className="flex items-center gap-2 w-full md:w-auto">
              <Tabs value={categoryFilter} onValueChange={(v) => setCategoryFilter(v as any)} className="w-full md:w-auto">
                <TabsList className="grid w-full grid-cols-3 md:w-[300px]">
                  <TabsTrigger value="all">All</TabsTrigger>
                  <TabsTrigger value="iso">ISO</TabsTrigger>
                  <TabsTrigger value="training">Training</TabsTrigger>
                </TabsList>
              </Tabs>
            </div>
          </div>

          <div className="px-4 py-2 border-b flex flex-wrap gap-2 items-center surface-sunken rounded-lg">
            <span className="text-xs text-muted-foreground font-medium">Status:</span>
            <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)}>
              <TabsList className="h-7">
                <TabsTrigger value="ALL" className="text-xs px-3 h-6">All</TabsTrigger>
                <TabsTrigger value="active" className="text-xs px-3 h-6">Active</TabsTrigger>
                <TabsTrigger value="expiring_soon" className="text-xs px-3 h-6">Expiring Soon</TabsTrigger>
                <TabsTrigger value="expired" className="text-xs px-3 h-6">Expired</TabsTrigger>
              </TabsList>
            </Tabs>

            {categoryFilter === "iso" && (
              <>
                <span className="text-xs text-muted-foreground font-medium ml-2">Standard:</span>
                <Select value={standardFilter} onValueChange={setStandardFilter}>
                  <SelectTrigger className="h-7 w-[180px] text-xs">
                    <SelectValue placeholder="All standards" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ALL">All standards</SelectItem>
                    {(availableStandards.length ? availableStandards : ISO_STANDARDS).map(s => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {categoryFilter === "training" && availableTrainingTypes.length > 0 && (
              <>
                <span className="text-xs text-muted-foreground font-medium ml-2">Training Type:</span>
                <Select value={trainingTypeFilter} onValueChange={setTrainingTypeFilter}>
                  <SelectTrigger className="h-7 w-[220px] text-xs">
                    <SelectValue placeholder="All training types" />
                  </SelectTrigger>
                  <SelectContent className="max-h-64">
                    <SelectItem value="ALL">All training types</SelectItem>
                    {availableTrainingTypes.map(t => (
                      <SelectItem key={t} value={t}>{t}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </>
            )}

            {hasActiveFilters && (
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs ml-auto"
                onClick={clearFilters}
              >
                <Icon name="x" className="mr-1" size={12} />
                Clear filters
              </Button>
            )}
          </div>
        </CardContent>
      </Card>

      {categoryFilter === "all" ? (
        <div className="space-y-6">
          <Card className="surface rounded-lg">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="shield-check" className="text-amber-500" size={18} />
                  <h2 className="text-base font-semibold">ISO Certificates</h2>
                  <Badge variant="secondary">{isoCerts.length}</Badge>
                </div>
              </div>
              {renderTable(isoCerts, { isoColumns: true, showQR: false, page: isoPage, setPage: setIsoPage, emptyLabel: "No ISO certificates found." })}
            </CardContent>
          </Card>

          <Card className="surface rounded-lg">
            <CardContent className="p-0">
              <div className="px-4 py-3 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Icon name="graduation-cap" className="text-emerald-500" size={18} />
                  <h2 className="text-base font-semibold">Training Certificates</h2>
                  <Badge variant="secondary">{trainingCerts.length}</Badge>
                </div>
              </div>
              {renderTable(trainingCerts, { isoColumns: false, showQR: true, page: trainingPage, setPage: setTrainingPage, emptyLabel: "No training certificates found." })}
            </CardContent>
          </Card>
        </div>
      ) : (
        <Card className="surface rounded-lg">
          <CardContent className="p-0">
            {renderTable(filteredCertificates ?? [], { isoColumns: isIsoView, showQR: !isIsoView, page, setPage, emptyLabel: "No certificates found matching your criteria." })}
          </CardContent>
        </Card>
      )}

      <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete {selectedIds.size} certificate{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The selected records will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => bulkDeleteMutation.mutate(Array.from(selectedIds))}
              className='bg-destructive text-destructive-foreground hover:bg-destructive/90'
              disabled={bulkDeleteMutation.isPending}
            >
              {bulkDeleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SaveProgressIndicator saving={bulkDeleteMutation.isPending} label="Deleting certificates..." />
    </div>
  );
}
