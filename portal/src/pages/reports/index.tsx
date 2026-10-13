import { useState, useEffect, useCallback, useMemo } from "react";
import type { ReactElement } from "react";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import {
  ResponsiveContainer,
  BarChart,
  XAxis,
  YAxis,
  Tooltip,
  Legend,
  Bar,
  CartesianGrid
} from "recharts";
import { addMonths, format, getMonth, getYear, parseISO, subMonths } from "date-fns";

import { LeadTarget, PerEmployeeRow, useLeadsPerEmployee, useListLeadTargets, useUpsertLeadTarget, useDeleteLeadTarget } from "@/lib/hooks/use-leads-reports";
import { useEmployees } from "@/lib/hooks/use-hris";
import { useListUsers } from "@workspace/api-client-react";
import { ReportCard } from "@/components/page-header";
import { StatTile } from "@/components/stat-tile";

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

interface ProjectsPerClientRow {
  client: string;
  total: number;
  active: number;
  planning: number;
  on_hold: number;
  completed: number;
  cancelled: number;
  budget: number;
  progress: number;
}

interface ProjectItem {
  id: string;
  title: string;
  status: string;
  priority: string;
  startDate: string;
  endDate: string | null;
  budget: number | null;
  projectManager: string | null;
  clientName: string | null;
  progress: number;
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
  contacted: "tone-info",
  qualified: "tone-success",
  lost: "tone-danger",
};

const projectStatusBadge: Record<string, string> = {
  planning: "bg-muted/60 text-foreground border-border dark:bg-slate-800 dark:text-muted-foreground/60",
  active: "tone-info",
  on_hold: "tone-warning",
  completed: "tone-success",
  cancelled: "tone-danger",
};

const projectPriorityColor: Record<string, string> = {
  low: "text-muted-foreground bg-slate-100 dark:bg-slate-800",
  medium: "tone-info",
  high: "tone-warning",
  critical: "tone-danger",
};

export default function ReportsPage() {
  const { toast } = useToast();
  const { user } = useAuth();
  const [exporting, setExporting] = useState<string | null>(null);
  const [view, setView] = useState<"home" | "contracts" | "leads" | "employee" | "projects" | "projects-client">("home");

  const isDevTools = !!user?.canAccessDevelopers || !!user?.roles?.some(r => devRoles.includes(r)) || devRoles.includes(user?.role ?? "");
  const isVince = (user?.username || "").toLowerCase() === "vince" || (user?.fullName || "").toLowerCase().includes("gatchalian") || isDevTools;

  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [appliedFrom, setAppliedFrom] = useState("");
  const [appliedTo, setAppliedTo] = useState("");

  const [targetDialogOpen, setTargetDialogOpen] = useState(false);
  const [selectedTargetMonth, setSelectedTargetMonth] = useState(format(new Date(), "yyyy-MM"));
  const [selectedTargetEmployeeId, setSelectedTargetEmployeeId] = useState("");
  const [dailyTargetValue, setDailyTargetValue] = useState<number | "">("");

  const { data: perEmployee, isLoading: perEmployeeLoading, refetch: refetchPerEmployeeLeads } = useLeadsPerEmployee(appliedFrom, appliedTo, view === "leads");
  const { data: allTargets, refetch: refetchTargets } = useListLeadTargets(undefined, view === "leads");
  const { data: allEmployees, isLoading: employeesLoading } = useEmployees({ enabled: view === "leads" && isVince });
  const { data: users = [], isLoading: usersLoading } = useListUsers();
  const upsertTargetMutation = useUpsertLeadTarget();
  const deleteTargetMutation = useDeleteLeadTarget();

  const [contractsSummary, setContractsSummary] = useState<ContractPerEmployeeRow[] | null>(null);
  const [contractsLoading, setContractsLoading] = useState(false);
  const [employeeTarget, setEmployeeTarget] = useState<{ key: string; name: string } | null>(null);
  const [employeeLeads, setEmployeeLeads] = useState<EmployeeLeadsItem[] | null>(null);
  const [employeeLeadsLoading, setEmployeeLeadsLoading] = useState(false);

  const [projectsSummary, setProjectsSummary] = useState<ProjectsPerClientRow[] | null>(null);
  const [projectsList, setProjectsList] = useState<ProjectItem[] | null>(null);
  const [projectsLoading, setProjectsLoading] = useState(false);
  const [selectedClient, setSelectedClient] = useState<{ name: string; total: number } | null>(null);

  const dateQuery = useMemo(() => {
    const p = new URLSearchParams();
    if (appliedFrom) p.set("from", appliedFrom);
    if (appliedTo) p.set("to", appliedTo);
    return p.toString();
  }, [appliedFrom, appliedTo]);

  const applyDates = useCallback(() => {
    setAppliedFrom(dateFrom);
    setAppliedTo(dateTo);
    refetchPerEmployeeLeads(); // Refetch leads data with new dates
  }, [dateFrom, dateTo, refetchPerEmployeeLeads]);

  const resetDates = useCallback(() => {
    setDateFrom("");
    setDateTo("");
    setAppliedFrom("");
    setAppliedTo("");
    refetchPerEmployeeLeads(); // Refetch leads data with no dates
  }, [refetchPerEmployeeLeads]);

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

  const loadProjects = useCallback(async () => {
    setProjectsLoading(true);
    try {
      const [summaryRes, listRes] = await Promise.all([
        fetch("/api/reports/projects-per-client"),
        fetch("/api/projects"),
      ]);
      if (!summaryRes.ok || !listRes.ok) throw new Error("Failed to load");
      setProjectsSummary(await summaryRes.json());
      setProjectsList(await listRes.json());
    } catch {
      setProjectsSummary(null);
      setProjectsList(null);
      toast({ title: "Failed to load projects report", variant: "destructive" });
    } finally {
      setProjectsLoading(false);
    }
  }, [toast]);

  const openClientProjects = (row: ProjectsPerClientRow) => {
    setSelectedClient({ name: row.client, total: row.total });
    setView("projects-client");
  };

  useEffect(() => {
    if (view === "contracts") loadContracts();
  }, [view, loadContracts]);

  useEffect(() => {
    if (view === "projects") loadProjects();
  }, [view, loadProjects]);

  // Refetch leads per employee when dates change
  useEffect(() => {
    if (view === "leads" && isVince) {
      refetchPerEmployeeLeads();
      refetchTargets();
    }
  }, [view, isVince, appliedFrom, appliedTo, refetchPerEmployeeLeads, refetchTargets]);

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

  const handleSetTarget = useCallback(async () => {
    if (!selectedTargetEmployeeId || !selectedTargetMonth || dailyTargetValue === "" || isNaN(Number(dailyTargetValue))) {
      toast({ title: "Please fill all target fields", variant: "destructive" });
      return;
    }
    const dailyTarget = Number(dailyTargetValue);
    if (dailyTarget < 0) {
      toast({ title: "Daily target must be a non-negative number", variant: "destructive" });
      return;
    }

    upsertTargetMutation.mutate({ userId: selectedTargetEmployeeId, month: selectedTargetMonth, target: dailyTarget }, {
      onSuccess: () => {
        toast({ title: "Lead target set successfully" });
        setTargetDialogOpen(false);
        setDailyTargetValue("");
        setSelectedTargetEmployeeId("");
        refetchPerEmployeeLeads();
        refetchTargets();
      },
      onError: () => {
        toast({ title: "Failed to set lead target", variant: "destructive" });
      },
    });
  }, [selectedTargetEmployeeId, selectedTargetMonth, dailyTargetValue, upsertTargetMutation, toast, refetchPerEmployeeLeads, refetchTargets]);

  const getEmployeeName = useCallback((userId: string) => {
    const fromUsers = users?.find((u: any) => u.id === userId);
    if (fromUsers) return fromUsers.fullName || fromUsers.username;
    const fromHris = allEmployees?.find(e => e.userId === userId);
    if (fromHris) return fromHris.username || fromHris.employeeId;
    return perEmployee?.find(e => e.key === userId)?.employee || userId;
  }, [users, allEmployees, perEmployee]);

  const selectableEmployees = useMemo(() => {
    const map = new Map<string, string>();
    users?.filter((u: any) => u.isActive !== false).forEach((u: any) => {
      map.set(u.id, u.fullName ? `${u.fullName} (${u.username})` : u.username);
    });
    perEmployee?.forEach(p => {
      if (p.key && !map.has(p.key)) {
        map.set(p.key, p.employee);
      }
    });
    allEmployees?.forEach(emp => {
      if (emp.userId && !map.has(emp.userId)) {
        map.set(emp.userId, emp.username || emp.employeeId);
      }
    });
    return Array.from(map.entries())
      .map(([userId, name]) => ({ userId, name }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [users, perEmployee, allEmployees]);

  const renderMonthlyTargetOptions = () => {
    const months = [];
    // Show past 6 months and next 6 months for easier selection
    for (let i = -6; i <= 6; i++) {
      const month = addMonths(new Date(), i);
      months.push(format(month, "yyyy-MM"));
    }
    return months.map(m => (
      <SelectItem key={m} value={m}>{format(parseISO(m + "-01"), "MMMM yyyy")}</SelectItem>
    ));
  };

  if (!isDevTools) {
    return (
      <div className="space-y-6 page-enter">
        <Card className="surface rounded-lg">
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
      <div className="space-y-6 page-enter">
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
          <Card className="surface rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : !contractsSummary || contractsSummary.length === 0 ? (
          <Card className="surface rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No contracts yet.</p>
          </CardContent></Card>
        ) : (
          <Card className="surface rounded-lg">
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
      <div className="space-y-6 page-enter">
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
          <Card className="surface rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : !employeeLeads || employeeLeads.length === 0 ? (
          <Card className="surface rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No leads for this employee yet.</p>
          </CardContent></Card>
        ) : (
          <Card className="surface rounded-lg">
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

  if (view === "projects-client") {
    const clientKey = selectedClient?.name;
    const clientProjects = clientKey
      ? (projectsList ?? []).filter(p => ((p.clientName || "").trim() || "(Internal)") === clientKey)
      : [];
    return (
      <div className="space-y-6 page-enter">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="briefcase" className="text-primary" size={18} />
            <h2 className="text-base font-semibold tracking-tight">Projects by {selectedClient?.name ?? "Client"}</h2>
            {selectedClient && (
              <span className="text-xs text-muted-foreground bg-muted/30 border rounded-md px-2 py-0.5">
                {selectedClient.total} project{selectedClient.total === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="ghost" onClick={() => { setSelectedClient(null); setView("projects"); }}>
              <Icon name="arrow-left" className="mr-2" size={14} /> Back to Projects per Client
            </Button>
          </div>
        </div>

        {projectsLoading ? (
          <Card className="surface rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : clientProjects.length === 0 ? (
          <Card className="surface rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No projects for this client yet.</p>
          </CardContent></Card>
        ) : (
          <Card className="surface rounded-lg">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead className="min-w-[220px]">Project</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Priority</TableHead>
                    <TableHead>Start</TableHead>
                    <TableHead>End</TableHead>
                    <TableHead>Manager</TableHead>
                    <TableHead>Budget</TableHead>
                    <TableHead>Progress</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {clientProjects.map((p) => (
                    <TableRow key={p.id}>
                      <TableCell className="font-medium">{p.title}</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${projectStatusBadge[p.status] || ""}`}>{p.status ? p.status.replace("_", " ") : "—"}</Badge>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className={`capitalize ${projectPriorityColor[p.priority] || ""}`}>{p.priority || "—"}</Badge>
                      </TableCell>
                      <TableCell className="text-sm">{p.startDate ? formatDate(p.startDate) : "—"}</TableCell>
                      <TableCell className="text-sm">{p.endDate ? formatDate(p.endDate) : "—"}</TableCell>
                      <TableCell className="text-sm">{p.projectManager || <span className="text-muted-foreground italic">—</span>}</TableCell>
                      <TableCell>{p.budget != null ? formatMoney(p.budget) : <span className="text-muted-foreground italic">—</span>}</TableCell>
                      <TableCell>
                        {p.progress != null ? (
                          <span className={`font-semibold tabular ${p.progress >= 100 ? "text-tone-success-fg" : p.progress >= 70 ? "text-tone-warning-fg" : "text-tone-danger-fg"}`}>{p.progress}%</span>
                        ) : "—"}
                      </TableCell>
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

  if (view === "projects") {
    const grand = (projectsSummary ?? []).reduce(
      (acc, r) => {
        acc.total += r.total;
        acc.active += r.active;
        acc.planning += r.planning;
        acc.on_hold += r.on_hold;
        acc.completed += r.completed;
        acc.cancelled += r.cancelled;
        acc.budget += r.budget;
        acc.progress += r.progress * r.total;
        return acc;
      },
      { total: 0, active: 0, planning: 0, on_hold: 0, completed: 0, cancelled: 0, budget: 0, progress: 0 },
    );
    const grandProgress = grand.total ? Math.round(grand.progress / grand.total) : 0;
    return (
      <div className="space-y-6 page-enter">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <Icon name="briefcase" className="text-primary" size={18} />
            <h2 className="text-base font-semibold tracking-tight">Projects per Client</h2>
          </div>
          <div className="flex items-center gap-2">
            <Button size="sm" variant="outline" disabled={exporting !== null || projectsLoading} onClick={() => handleExport("/api/reports/projects-per-client?format=csv", "projects-per-client.csv")}>
              {exporting === "projects-per-client.csv" ? "Exporting..." : "Export Summary (CSV)"}
            </Button>
            <Button size="sm" variant="outline" disabled={exporting !== null || projectsLoading} onClick={() => handleExport("/api/projects/summary-excel", "project-summary-per-client.xlsx")}>
              {exporting === "project-summary-per-client.xlsx" ? "Exporting..." : "Export Excel (per client)"}
            </Button>
            {backButton}
          </div>
        </div>

        {projectsLoading ? (
          <Card className="surface rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
        ) : !projectsSummary || projectsSummary.length === 0 ? (
          <Card className="surface rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
            <p className="text-muted-foreground">No projects yet.</p>
          </CardContent></Card>
        ) : (
          <>
            <Card className="surface rounded-lg">
              <CardContent className="p-4">
                <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-7 gap-3">
                  {[
                    { label: "Total Projects", value: projectsList?.length ?? grand.total, cls: "text-foreground" },
                    { label: "Active", value: grand.active, cls: "text-tone-info-fg" },
                    { label: "Planning", value: grand.planning, cls: "text-muted-foreground" },
                    { label: "On Hold", value: grand.on_hold, cls: "text-tone-warning-fg" },
                    { label: "Completed", value: grand.completed, cls: "text-tone-success-fg" },
                    { label: "Cancelled", value: grand.cancelled, cls: "text-tone-danger-fg" },
                    { label: "Total Budget", value: formatMoney(grand.budget), cls: "text-muted-foreground" },
                  ].map(s => (
                    <div key={s.label} className="rounded-lg border bg-muted/20 p-3 text-center">
                      <div className={`text-lg font-bold tabular sm:text-2xl ${s.cls}`}>{s.value}</div>
                      <div className="mt-0.5 text-xs text-muted-foreground">{s.label}</div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>

            <Card className="surface rounded-lg">
              <CardContent className="p-0 overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableHead>Client</TableHead>
                      <TableHead>Projects</TableHead>
                      <TableHead>Active</TableHead>
                      <TableHead>Planning</TableHead>
                      <TableHead>On Hold</TableHead>
                      <TableHead>Completed</TableHead>
                      <TableHead>Cancelled</TableHead>
                      <TableHead>Total Budget</TableHead>
                      <TableHead>Avg Progress</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {projectsSummary.map((row) => (
                      <TableRow key={row.client} className="cursor-pointer hover:bg-muted/20" onClick={() => openClientProjects(row)}>
                        <TableCell className="font-medium">
                          <button type="button" className="text-primary underline-offset-4 hover:underline inline-flex items-center gap-1.5">
                            {row.client}
                            <Icon name="chevron-right" size={14} />
                          </button>
                        </TableCell>
                        <TableCell>{row.total}</TableCell>
                        <TableCell>{row.active}</TableCell>
                        <TableCell>{row.planning}</TableCell>
                        <TableCell>{row.on_hold}</TableCell>
                        <TableCell>{row.completed}</TableCell>
                        <TableCell>{row.cancelled}</TableCell>
                        <TableCell>{formatMoney(row.budget)}</TableCell>
                        <TableCell>{row.progress}%</TableCell>
                      </TableRow>
                    ))}
                    <TableRow className="bg-muted/10 font-semibold hover:bg-muted/10">
                      <TableCell>Grand Total</TableCell>
                      <TableCell>{grand.total}</TableCell>
                      <TableCell>{grand.active}</TableCell>
                      <TableCell>{grand.planning}</TableCell>
                      <TableCell>{grand.on_hold}</TableCell>
                      <TableCell>{grand.completed}</TableCell>
                      <TableCell>{grand.cancelled}</TableCell>
                      <TableCell>{formatMoney(grand.budget)}</TableCell>
                      <TableCell>{grandProgress}%</TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </>
        )}
      </div>
    );
  }

  if (view === "leads") {
    return (
      <LeadsPerEmployeeView
        perEmployee={perEmployee ?? null}
        perEmployeeLoading={perEmployeeLoading}
        appliedFrom={appliedFrom}
        appliedTo={appliedTo}
        handleExport={handleExport}
        exporting={exporting}
        backButton={backButton}
        dateFrom={dateFrom}
        setDateFrom={setDateFrom}
        dateTo={dateTo}
        setDateTo={setDateTo}
        applyDates={applyDates}
        resetDates={resetDates}
        isVince={isVince}
        openEmployeeLeads={openEmployeeLeads}
      />
    );
  }

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="bar-chart-2" className="text-primary" size={28} />
            Reports
          </h1>
          <p className="text-muted-foreground">Open reports for contracts, leads and projects.</p>
        </div>
        {isVince && (
          <Dialog open={targetDialogOpen} onOpenChange={setTargetDialogOpen}>
            <DialogTrigger asChild>
              <Button size="sm" variant="secondary">
                <Icon name="target" className="mr-2" size={16} /> Set Lead Targets
              </Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-md max-h-[80vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Set Lead Target</DialogTitle>
                <DialogDescription>
                  Set a daily lead target for an employee. Monthly target will be calculated automatically. Existing targets will be updated.
                </DialogDescription>
              </DialogHeader>
              <div className="grid gap-4 py-4">
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="employee" className="text-right">Employee</Label>
                  <Select value={selectedTargetEmployeeId} onValueChange={setSelectedTargetEmployeeId}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select an employee" />
                    </SelectTrigger>
                    <SelectContent>
                      {(employeesLoading || usersLoading) && <SelectItem value="" disabled>Loading employees...</SelectItem>}
                      {!employeesLoading && !usersLoading && selectableEmployees.length === 0 && (
                        <SelectItem value="" disabled>No employees found</SelectItem>
                      )}
                      {selectableEmployees.map((emp) => (
                        <SelectItem key={emp.userId} value={emp.userId}>{emp.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="month" className="text-right">Month</Label>
                  <Select value={selectedTargetMonth} onValueChange={setSelectedTargetMonth}>
                    <SelectTrigger className="col-span-3">
                      <SelectValue placeholder="Select a month" />
                    </SelectTrigger>
                    <SelectContent>
                      {renderMonthlyTargetOptions()}
                    </SelectContent>
                  </Select>
                </div>
                <div className="grid grid-cols-4 items-center gap-4">
                  <Label htmlFor="dailyTarget" className="text-right">Daily Target</Label>
                  <Input
                    id="dailyTarget"
                    type="number"
                    value={dailyTargetValue}
                    onChange={(e) => setDailyTargetValue(e.target.value === "" ? "" : Number(e.target.value))}
                    className="col-span-3"
                    placeholder={`e.g. 15`}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setTargetDialogOpen(false)}>Cancel</Button>
                <Button onClick={handleSetTarget} disabled={upsertTargetMutation.isPending || !selectedTargetEmployeeId || !selectedTargetMonth || dailyTargetValue === ""}>
                  {upsertTargetMutation.isPending ? "Saving..." : "Set Target"}
                </Button>
              </DialogFooter>
              {allTargets && allTargets.length > 0 && (
                <div className="mt-4 pt-4 border-t">
                  <h3 className="text-md font-semibold mb-2">Existing Targets</h3>
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>Employee</TableHead>
                        <TableHead>Month</TableHead>
                        <TableHead className="text-right">Daily Target</TableHead>
                        <TableHead className="text-center w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {allTargets.map((target) => (
                        <TableRow key={target.id}>
                          <TableCell>{getEmployeeName(target.userId)}</TableCell>
                          <TableCell>{format(parseISO(target.month + "-01"), "MMMM yyyy")}</TableCell>
                          <TableCell className="text-right">{target.target}</TableCell>
                          <TableCell className="text-center">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                if (target.id) {
                                  deleteTargetMutation.mutate(target.id, {
                                    onSuccess: () => refetchTargets()
                                  });
                                } else {
                                  console.error("Cannot delete: Target ID is missing", target);
                                  toast({ title: "Cannot delete: Target ID is missing", variant: "destructive" });
                                }
                              }}
                              disabled={deleteTargetMutation.isPending}
                              className="text-destructive hover:text-destructive"
                            >
                              <Icon name="trash-2" size={16} />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </DialogContent>
          </Dialog>
        )}
      </div>

      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
        <ReportCard
          title="Contracts Report"
          description="Summary of contracts per employee."
          icon="file-text"
          tone="info"
          onSelect={() => setView("contracts")}
        />
        <ReportCard
          title="Leads Report"
          description="Summary of leads per employee."
          icon="target"
          tone="warning"
          onSelect={() => setView("leads")}
        />
        <ReportCard
          title="Projects Report"
          description="Summary of projects per client."
          icon="briefcase"
          tone="progress"
          onSelect={() => setView("projects")}
        />
      </div>
    </div>
  );
}

// Leads per Employee View
// This will be nested inside the main ReportsPage component
// and shown when `view === "leads"`
function LeadsPerEmployeeView({
  perEmployee,
  perEmployeeLoading,
  appliedFrom,
  appliedTo,
  handleExport,
  exporting,
  backButton,
  dateFrom,
  setDateFrom,
  dateTo,
  setDateTo,
  applyDates,
  resetDates,
  isVince,
  openEmployeeLeads,
}: {
  perEmployee: PerEmployeeRow[] | null;
  perEmployeeLoading: boolean;
  appliedFrom: string;
  appliedTo: string;
  handleExport: (url: string, filename: string) => Promise<void>;
  exporting: string | null;
  backButton: ReactElement;
  dateFrom: string;
  setDateFrom: (date: string) => void;
  dateTo: string;
  setDateTo: (date: string) => void;
  applyDates: () => void;
  resetDates: () => void;
  isVince: boolean;
  openEmployeeLeads: (row: PerEmployeeRow) => void;
}) {
  const chartData = useMemo(() => {
    return perEmployee?.map(emp => ({
      name: emp.employee,
      Target: emp.dailyTarget || 0,
      Actual: emp.dailyActual || 0,
      totalActual: emp.actual,
      achievementPct: emp.achievementPct
    })) || [];
  }, [perEmployee]);

  const CustomTooltip = ({ active, payload, label }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="rounded-md border bg-popover p-2 text-sm shadow-md">
          <p className="font-bold">{label}</p>
          <p className="text-blue-500">Daily Actual: {data.Actual}</p>
          <p className="text-green-500">Daily Target: {data.Target}</p>
          <p className="text-muted-foreground">Total Leads: {data.totalActual}</p>
          <p className="border-t mt-1 pt-1 font-semibold">Achievement: {data.achievementPct ?? 0}%</p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6 page-enter">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Icon name="target" className="text-primary" size={18} />
          <h2 className="text-base font-semibold tracking-tight">Leads per Employee</h2>
          {!isVince && <span className="text-xs text-muted-foreground">Visible to Vince Gatchalian only</span>}
        </div>
        <div className="flex items-center gap-2">
          <Button size="sm" variant="outline" disabled={exporting !== null} onClick={() => handleExport(`/api/reports/leads?${appliedFrom || appliedTo ? `from=${appliedFrom}&to=${appliedTo}` : ""}`, "leads.csv")}>
            {exporting === "leads.csv" ? "Exporting..." : "Export Lead List (CSV)"}
          </Button>
          {isVince && (
            <>
              <Button size="sm" variant="outline" disabled={exporting !== null || perEmployeeLoading} onClick={() => handleExport(`/api/reports/leads-per-employee?format=csv&${appliedFrom || appliedTo ? `from=${appliedFrom}&to=${appliedTo}` : ""}`, "leads-per-employee.csv")}>
                {exporting === "leads-per-employee.csv" ? "Exporting..." : "Export Summary (CSV)"}
              </Button>
              <Button size="sm" disabled={exporting !== null || perEmployeeLoading} onClick={() => handleExport(`/api/reports/leads-per-employee-excel?${appliedFrom || appliedTo ? `from=${appliedFrom}&to=${appliedTo}` : ""}`, "leads-per-employee.xlsx")}>
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
        <Card className="surface rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <Icon name="lock" className="text-muted-foreground" size={40} />
          <p className="text-muted-foreground">Leads per employee is restricted to Vince Gatchalian. You can still export the full lead list above.</p>
        </CardContent></Card>
      ) : perEmployeeLoading ? (
        <Card className="surface rounded-lg"><CardContent className="p-6"><div className="flex justify-center"><Skeleton className="h-5 w-52" /></div></CardContent></Card>
      ) : !perEmployee || perEmployee.length === 0 ? (
        <Card className="surface rounded-lg"><CardContent className="flex flex-col items-center justify-center py-16 gap-3 text-center">
          <p className="text-muted-foreground">No leads yet.</p>
        </CardContent></Card>
      ) : (
        <>
          <Card className="surface rounded-lg">
            <CardHeader className="flex flex-row items-center justify-between pb-2">
              <CardTitle className="text-base font-semibold">Lead Achievement</CardTitle>
              <CardDescription className="text-sm text-muted-foreground">Target vs Actual</CardDescription>
            </CardHeader>
            <CardContent className="pb-4">
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={chartData} margin={{ top: 5, right: 30, left: 20, bottom: 5 }}>
                    <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" stroke="hsl(var(--muted-foreground))" />
                    <YAxis stroke="hsl(var(--muted-foreground))" />
                    <Tooltip content={<CustomTooltip />} cursor={{ fill: "hsl(var(--muted)/50)" }} />
                    <Legend />
                    <Bar dataKey="Actual" fill="hsl(var(--primary))" />
                    <Bar dataKey="Target" fill="hsl(var(--accent))" />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          <Card className="surface rounded-lg">
            <CardContent className="p-0 overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead>Employee</TableHead>
                    <TableHead>Total Leads (Actual)</TableHead>
                    <TableHead>Daily Target</TableHead>
                    <TableHead>Achievement</TableHead>
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
                      <TableCell>{row.actual}</TableCell>
                      <TableCell>{row.dailyTarget ?? "—"}</TableCell>
                      <TableCell>
                        {row.achievementPct !== null ? (
                          <span className={`font-semibold tabular ${row.achievementPct >= 100 ? "text-tone-success-fg" : row.achievementPct >= 70 ? "text-tone-warning-fg" : "text-tone-danger-fg"}`}>
                            {row.achievementPct}%
                          </span>
                        ) : (
                          "—"
                        )}
                      </TableCell>
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
        </>
      )}
    </div>
  );
}
