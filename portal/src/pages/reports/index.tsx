import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";

interface PerEmployeeRow {
  key: string;
  employee: string;
  total: number;
  new: number;
  contacted: number;
  qualified: number;
  lost: number;
  latest: string;
}

interface ContractPerEmployeeRow {
  employee: string;
  total: number;
  value: number;
  active: number;
  pending: number;
  completed: number;
  expired: number;
  latest: string;
}

const devRoles = ["admin", "ADMIN", "IT"];

interface EmployeeLeadsItem {
  id?: string;
  companyName: string;
  contactPerson: string;
  position?: string | null;
  email?: string | null;
  phone?: string | null;
  serviceInterest?: string | null;
  type?: string | null;
  status?: string;
  notes?: string | null;
  createdAt?: string;
  createdByName?: string | null;
}

const formatMoney = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "PHP", maximumFractionDigits: 2 });

const formatDate = (iso: string) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "—" : d.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
};

const statusColor: Record<string, string> = {
  new: "bg-slate-100 text-foreground border-border dark:bg-slate-800 dark:text-muted-foreground/60",
  contacted: "bg-blue-100 text-blue-700 border-blue-200 dark:bg-blue-900/30 dark:text-blue-300",
  qualified: "bg-emerald-100 text-emerald-700 border-emerald-200 dark:bg-emerald-900/30 dark:text-emerald-300",
  lost: "bg-red-100 text-red-700 border-red-200 dark:bg-red-900/30 dark:text-red-300",
};

export default function ReportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exporting, setExporting] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "contracts" | "leads" | "employee">("home");
  const [perEmployee, setPerEmployee] = useState<PerEmployeeRow[] | null>(null);
  const [perEmployeeLoading, setPerEmployeeLoading] = useState(false);
  const [contractsSummary, setContractsSummary] = useState<ContractPerEmployeeRow[] | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [employeeTarget, setEmployeeTarget] = useState<{ key: string; name: string } | null>(null);
  const [employeeLeads, setEmployeeLeads] = useState<EmployeeLeadsItem[] | null>(null);
  const [employeeLeadsLoading, setEmployeeLeadsLoading] = useState(false);
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  const dateQuery = (() => {
    const p = new URLSearchParams();
    if (appliedFrom) p.set("from", appliedFrom);
    if (appliedTo) p.set("to", appliedTo);
    return p.toString();
  })();

  const applyDates = () => {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
  };

  const resetDates = () => {
    setDateFrom("");
    setDateTo("");
    setAppliedFrom("");
    setAppliedTo("");
  };

  const isDevTools = !!user?.canAccessDevelopers || !!user?.roles?.some(r => devRoles.includes(r)) || devRoles.includes(user?.role ?? "");
  const isVince = (user?.username || "").toLowerCase() === "vince" || (user?.fullName || "").toLowerCase().includes("gatchalian");

  const loadPerEmployee = useCallback(async () => {
    setPerEmployeeLoading(true);
    try {
      const res = await fetch(`/api/reports/leads-per-employee?${dateQuery}`);
      if (res.status === 403) { setPerEmployee(null); return; }
      if (!res.ok) throw new Error("Failed to load");
      setPerEmployee(await res.json());
    } catch {
      setPerEmployee(null);
      toast({ title: "Failed to load leads per employee", variant: "destructive" });
    } finally {
      setPerEmployeeLoading(false);
    }
  }, [toast, dateQuery]);

  const loadContracts = useCallback(async () => {
    setContractsLoading(true);
    try {
      const res = await fetch("/api/reports/contracts-per-employee");
      if (!res.ok) throw new Error("Failed to load");
      setContractsSummary(await res.json());
    } catch {
      setContractsSummary(null);
      toast({ title: "Failed to load contracts per employee", variant: "destructive" });
    } finally {
      setContractsLoading(false);
    }
  }, [toast]);

  const loadEmployeeLeads = useCallback(async (key: string) => {
    setEmployeeLeadsLoading(true);
    setEmployeeLeads(null);
    try {
      const res = await fetch(`/api/reports/leads-by-creator?key=${encodeURIComponent(key)}${dateQuery ? `&${dateQuery}` : ""}`);
      if (!res.ok) throw new Error("Failed to load");
      setEmployeeLeads(await res.json());
    } catch {
      setEmployeeLeads([]);
      toast({ title: "Failed to load employee leads", variant: "destructive" });
    } finally {
      setEmployeeLeadsLoading(false);
    }
  }, [toast, dateQuery]);

  const openEmployeeLeads = (row: PerEmployeeRow) => {
    setEmployeeTarget({ key: row.key, name: row.employee });
    setView("employee");
    loadEmployeeLeads(row.key);
  };

  useEffect(() => {
    if (view === "contracts") loadContracts();
  }, [view, loadContracts]);

  useEffect(() => {
    if (view === "leads" && isVince) loadPerEmployee();
  }, [view, isVince, loadPerEmployee, dateQuery]);

  const handleExport = async (url: string, filename: string) => {
    setExporting(filename);
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`Failed to export ${filename}`);
      const blob = await res.blob();
      const downloadUrl = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = downloadUrl;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      window.URL.revokeObjectURL(downloadUrl);
      toast({ title: "Report exported" });
    } catch {
      toast({ title: `Failed to export ${filename}`, variant: "destructive" });
    } finally {
      setExporting(null);
    }
  };

  if (!isDevTools) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <Card className="neu rounded-lg">
          <CardContent className="flex flex-col items-center justify-center py-20 gap-4 text-center">
            <Icon name="lock" className="text-muted-foreground" size={40} />
            <h2 className="text-lg font-semibold">Reports are restricted to developers.</h2>
            <p className="text-sm text-muted-foreground">You don't have permission to view reports.</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  const backButton = (
    <Button size="sm" variant="ghost" onClick={() => setView("home")}>
      <Icon name="arrow-left" className="mr-2" size={14} /> Back to Reports
    </Button>
  );

  if (view === "contracts") {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="file-text" className="text-primary" size={18} />
            <h2 className="text-base font-semibold tracking-tight">Contracts per Employee</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={exporting !== null || contractsLoading} onClick={() => handleExport("/api/reports/contracts-per-employee?format=csv", "contracts-per-employee.csv")}>
              {exporting === "contracts-per-employee.csv" ? "Exporting..." : "Export CSV"}
            </Button>
            {backButton}
          </div>
        </div>

        {contractsLoading ? (
          <Card className="neu rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : !contractsSummary || contractsSummary.length === 0 ? (
          <Card className="neu rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No contracts yet.</p>
          </CardContent></Card>
        ) : (
          <Card className="neu rounded-lg">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead>Employee</TableHead>
                    <TableHead>Total Contracts</TableHead>
                    <TableHead>Total Value</TableHead>
                    <TableHead>Active</TableHead>
                    <TableHead>Pending</TableHead>
                    <TableHead>Completed</TableHead>
                    <TableHead>Expired</TableHead>
                    <TableHead>Last Contract</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {contractsSummary.map((row) => (
                    <TableRow key={row.employee}>
                      <TableCell className="font-medium">{row.employee}</TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>{formatMoney(row.value)}</TableCell>
                      <TableCell>{row.active}</TableCell>
                      <TableCell>{row.pending}</TableCell>
                      <TableCell>{row.completed}</TableCell>
                      <TableCell>{row.expired}</TableCell>
                      <TableCell>{formatDate(row.latest)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (view === "employee") {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="target" className="text-primary" size={18} />
            <h2 className="text-base font-semibold tracking-tight">Leads by {employeeTarget?.name ?? "Employee"}</h2>
            {(appliedFrom || appliedTo) && (
              <span className="text-xs text-muted-foreground bg-muted/30 border rounded-md px-2 py-0.5">
                {appliedFrom || "start"} — {appliedTo || "today"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setEmployeeTarget(null); setView("leads"); }}>
              <Icon name="arrow-left" className="mr-2" size={14} /> Back to Leads per Employee
            </Button>
          </div>
        </div>

        {employeeLeadsLoading ? (
          <Card className="neu rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : !employeeLeads || employeeLeads.length === 0 ? (
          <Card className="neu rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No leads for this employee yet.</p>
          </CardContent></Card>
        ) : (
          <Card className="neu rounded-lg">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="min-w-[160px]">Company</TableHead>
                    <TableHead className="min-w-[150px]">Contact Person</TableHead>
                    <TableHead className="min-w-[140px]">Contact Info</TableHead>
                    <TableHead className="min-w-[140px]">Service Interest</TableHead>
                    <TableHead>Type</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Date</TableHead>
                    <TableHead>Remarks</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {employeeLeads.map((lead, i) => (
                    <TableRow key={lead.id ?? i}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          <Icon name="building-2" className="text-muted-foreground shrink-0" size={16} />
                          {lead.companyName}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col">
                          <span>{lead.contactPerson}</span>
                          {lead.position && <span className="text-xs text-muted-foreground">{lead.position}</span>}
                        </div>
                      </TableCell>
                      <TableCell>
                        <div className="flex flex-col gap-0.5 text-xs text-muted-foreground">
                          {lead.email && <span className="flex items-center gap-1"><Icon name="mail" size={12} /> {lead.email}</span>}
                          {lead.phone && <span className="flex items-center gap-1"><Icon name="phone" size={12} /> {lead.phone}</span>}
                          {!lead.email && !lead.phone && <span className="italic">—</span>}
                        </div>
                      </TableCell>
                      <TableCell className="text-sm">{lead.serviceInterest || <span className="text-muted-foreground italic">None</span>}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-mono text-[10px]">{lead.type || "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${lead.status ? statusColor[lead.status] || "" : ""}`}>{lead.status || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-xs text-muted-foreground">{lead.createdAt ? formatDate(lead.createdAt) : "—"}</TableCell>
                      <TableCell className="text-sm">{lead.notes || <span className="text-muted-foreground italic">—</span>}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  if (view === "leads") {
    return (
      <div className="space-y-6 animate-in fade-in duration-500">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="target" className="text-primary" size={18} />
            <h2 className="text-base font-semibold tracking-tight">Leads per Employee</h2>
            {!isVince && <span className="text-xs text-muted-foreground">Visible to Vince Gatchalian only</span>}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => handleExport(`/api/reports/leads?${dateQuery}`, "leads.csv")}>
              {exporting === "leads.csv" ? "Exporting..." : "Export Lead List (CSV)"}
            </Button>
            {isVince && (
              <>
                <Button size="sm" variant="outline" disabled={exporting !== null || perEmployeeLoading} onClick={() => handleExport(`/api/reports/leads-per-employee?format=csv&${dateQuery}`, "leads-per-employee.csv")}>
                  {exporting === "leads-per-employee.csv" ? "Exporting..." : "Export Summary (CSV)"}
                </Button>
                <Button size="sm" disabled={exporting !== null || perEmployeeLoading} onClick={() => handleExport(`/api/reports/leads-per-employee-excel?${dateQuery}`, "leads-per-employee.xlsx")}>
                  {exporting === "leads-per-employee.xlsx" ? "Exporting..." : "Export Excel (tabs per employee)"}
                </Button>
              </>
            )}
            {backButton}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 rounded-lg border bg-muted/20 px-4 py-3">
          <span className="text-sm font-medium">Generate per date:</span>
          <Input type="date" className="h-8 w-[150px] text-xs bg-background" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
          <span className="text-xs text-muted-foreground">to</span>
          <Input type="date" className="h-8 w-[150px] text-xs bg-background" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          <Button size="sm" variant="outline" onClick={applyDates}>Generate</Button>
          {(appliedFrom || appliedTo) && (
            <Button size="sm" variant="ghost" onClick={resetDates}>Reset</Button>
          )}
        </div>

        {!isVince ? (
          <Card className="neu rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <Icon name="lock" className="text-muted-foreground" size={40} />
            <p className="text-muted-foreground">Leads per employee is restricted to Vince Gatchalian. You can still export the full lead list above.</p>
          </CardContent></Card>
        ) : perEmployeeLoading ? (
          <Card className="neu rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : !perEmployee || perEmployee.length === 0 ? (
          <Card className="neu rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No leads yet.</p>
          </CardContent></Card>
        ) : (
          <Card className="neu rounded-lg">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead>Employee</TableHead>
                    <TableHead>Total Leads</TableHead>
                    <TableHead>New</TableHead>
                    <TableHead>Contacted</TableHead>
                    <TableHead>Qualified</TableHead>
                    <TableHead>Lost</TableHead>
                    <TableHead>Last Lead</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {perEmployee.map((row) => (
                    <TableRow key={row.key}>
                      <TableCell className="font-medium">
                        <button
                          type="button"
                          className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-1.5"
                          onClick={() => openEmployeeLeads(row)}
                        >
                          {row.employee}
                          <Icon name="chevron-right" size={14} />
                        </button>
                      </TableCell>
                      <TableCell>{row.total}</TableCell>
                      <TableCell>{row.new}</TableCell>
                      <TableCell>{row.contacted}</TableCell>
                      <TableCell>{row.qualified}</TableCell>
                      <TableCell>{row.lost}</TableCell>
                      <TableCell>{formatDate(row.latest)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div>
        <p className="text-muted-foreground">Open reports for contracts and leads.</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card className="neu rounded-lg hover:border-primary/50 hover:shadow-lg transition-all group cursor-pointer" onClick={() => setView("contracts")}>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="h-20 w-20 rounded-2xl bg-blue-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icon name="file-text" className="text-blue-600" size={40} />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">Contracts Report</h2>
              <p className="text-muted-foreground mt-2">Open the summary of contracts per employee.</p>
            </div>
            <Button>
              <Icon name="arrow-right" className="mr-2" size={14} /> View per employee
            </Button>
          </CardContent>
        </Card>

        <Card className="neu rounded-lg hover:border-primary/50 hover:shadow-lg transition-all group cursor-pointer" onClick={() => setView("leads")}>
          <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
            <div className="h-20 w-20 rounded-2xl bg-amber-500/10 flex items-center justify-center group-hover:scale-110 transition-transform">
              <Icon name="target" className="text-amber-600" size={40} />
            </div>
            <div className="text-center">
              <h2 className="text-2xl font-bold">Leads Report</h2>
              <p className="text-muted-foreground mt-2">Open the summary of leads per employee.</p>
            </div>
            <Button>
              <Icon name="arrow-right" className="mr-2" size={14} /> View per employee
            </Button>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}