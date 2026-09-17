import { format } from "date-fns";
import { Link } from "wouter";
import { Icon } from "@/components/ui/icon"
import { 
  useGetDashboardStats, 
  useGetRecentActivity,
  useGetContractsSummary,
  useGetProjectsSummary
} from "@workspace/api-client-react";
import { useNotifications } from "@/hooks/use-notifications";
import { Card, CardContent, CardDescription, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { PieChart as RePieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer } from "recharts";
import { useAuth } from "@/lib/auth-context";

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444"];

function StatCard({ title, value, icon, children, accent, hint }: { title: string; value: string | number; icon: string; children?: React.ReactNode; accent?: string; hint?: string }) {
  return (
    <Card className="overflow-hidden rounded-xl border-border/70 shadow-sm hover:shadow-md transition-shadow bg-white dark:bg-zinc-900">
      <CardContent className="p-5">
        <div className="flex items-center justify-between mb-4">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{title}</span>
          <div className="h-10 w-10 rounded-xl flex items-center justify-center shrink-0 shadow-sm ring-1 ring-black/5" style={{ backgroundColor: `${accent}14`, color: accent }}>
            <Icon name={icon} size={18} />
          </div>
        </div>
        <div className="text-3xl font-bold tracking-tight text-foreground tabular-nums">{value}</div>
        {hint && <p className="text-xs text-muted-foreground mt-1">{hint}</p>}
        {children && <div className="flex items-center gap-2 mt-3 flex-wrap">{children}</div>}
      </CardContent>
    </Card>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const { data: stats, isLoading: statsLoading } = useGetDashboardStats();
  const { data: activities, isLoading: activitiesLoading } = useGetRecentActivity();
  const { data: contractsSummary, isLoading: contractsLoading } = useGetContractsSummary();
  const { data: projectsSummary, isLoading: projectsLoading } = useGetProjectsSummary();
  const { data: notifications = [] } = useNotifications();

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

  const renderStatsCards = () => {
    if (statsLoading) {
      return Array(4).fill(0).map((_, i) => (
        <Card key={i} className="rounded-xl border-border/70 shadow-sm">
          <CardContent className="p-5">
            <Skeleton className="h-4 w-1/2 mb-5" />
            <Skeleton className="h-9 w-1/3 mb-4" />
            <Skeleton className="h-3 w-2/3" />
          </CardContent>
        </Card>
      ));
    }
    if (!stats) return null;

    return (
      <>
        <StatCard title="Contracts" value={stats.totalContracts} icon="file-text" accent="#3b82f6">
          <Badge variant="secondary" className="font-normal text-[10px] h-5 bg-blue-50 text-blue-600">{stats.activeContracts} Active</Badge>
        </StatCard>

        <StatCard title="Certificates" value={stats.totalCertificates} icon="shield-check" accent="#10b981">
          {stats.expiringCertificates > 0 ? (
            <Badge variant="outline" className="font-normal text-[10px] h-5 border-amber-300 text-amber-700">{stats.expiringCertificates} Expiring</Badge>
          ) : (
            <Badge variant="outline" className="font-normal text-[10px] h-5 text-green-600 border-green-300">All valid</Badge>
          )}
        </StatCard>

        <StatCard title="Projects" value={stats.totalProjects} icon="briefcase" accent="#8b5cf6">
          <Badge variant="secondary" className="font-normal text-[10px] h-5 bg-purple-50 text-purple-600">{stats.activeProjects} Active</Badge>
        </StatCard>

        <StatCard title="Contract Value" value={`₱${((stats as any).totalContractValue || 0).toLocaleString()}`} icon="trending-up" accent="#06b6d4">
          <Badge variant="secondary" className="font-normal text-[10px] h-5 bg-cyan-50 text-cyan-600">JMCS: ₱{((stats as any).jmcsContractValue || 0).toLocaleString()}</Badge>
        </StatCard>
      </>
    );
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'contract': return <Icon name="file-text" className="text-blue-500" size={15} />;
      case 'project': return <Icon name="briefcase" className="text-indigo-500" size={15} />;
      case 'certificate': return <Icon name="shield-check" className="text-emerald-500" size={15} />;
      case 'event': return <Icon name="calendar-days" className="text-amber-500" size={15} />;
      case 'user': return <Icon name="users" className="text-sky-500" size={15} />;
      default: return <Icon name="activity" className="text-muted-foreground" size={15} />;
    }
  };

  const getEntityUrl = (type: string, id?: number | null) => {
    if (!id) return '#';
    switch (type) {
      case 'contract': return `/contracts/${id}`;
      case 'project': return `/projects/${id}`;
      case 'certificate': return `/certificates/${id}`;
      case 'event': return `/calendar`;
      case 'user': return `/admin`;
      default: return '#';
    }
  };

  const contractStatusData = contractsSummary ? [
    { name: "Active", value: contractsSummary.byStatus.active, color: "#3b82f6" },
    { name: "Pending", value: contractsSummary.byStatus.pending, color: "#f59e0b" },
    { name: "Completed", value: contractsSummary.byStatus.completed, color: "#10b981" },
    { name: "Expired", value: contractsSummary.byStatus.expired, color: "#ef4444" },
  ].filter(d => d.value > 0) : [];

  const expiryData = stats ? [
    { name: "30 days", expiring: (stats as any).certExpiring30 ?? 0, contracts: (stats as any).contractsEnding30 ?? 0 },
    { name: "60 days", expiring: (stats as any).certExpiring60 ?? 0, contracts: (stats as any).contractsEnding60 ?? 0 },
    { name: "90 days", expiring: (stats as any).certExpiring90 ?? 0, contracts: (stats as any).contractsEnding90 ?? 0 },
  ] : [];

  const hour = new Date().getHours();
  const greeting = hour < 12 ? "morning" : hour < 18 ? "afternoon" : "evening";

  return (
    <div data-page="dashboard" className="space-y-6">
      {/* Welcome banner */}
      <div className="relative overflow-hidden rounded-xl border border-border/70 bg-gradient-to-br from-white via-white to-primary/5 dark:from-zinc-900 dark:via-zinc-900 dark:to-primary/10 p-6 shadow-sm">
        <div aria-hidden className="pointer-events-none absolute inset-0">
          <div className="absolute -top-16 -right-10 h-48 w-48 rounded-full bg-primary/10 blur-3xl" />
          <div className="absolute -bottom-20 right-1/4 h-40 w-40 rounded-full bg-sky-400/10 blur-3xl" />
          <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/25 to-transparent" />
        </div>
        <div className="relative flex items-center gap-4 sm:justify-between">
          <div className="flex items-center gap-4 min-w-0">
            <Avatar className="h-12 w-12 ring-2 ring-primary/20 shrink-0">
              <AvatarImage src={(user as any)?.photoUrl || undefined} alt={user?.fullName || user?.username} />
              <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(user?.fullName || user?.username)}</AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-primary/70">Good {greeting},</p>
              <h1 className="font-serif text-2xl font-semibold tracking-tight leading-tight text-foreground">
                {user?.fullName?.split(" ")[0] || "User"}
                <span className="ml-1.5 text-sm font-medium text-muted-foreground">
                  {" · "}{(user as any)?.department ? ((user as any).department === "Both" ? "SIS & JMCS" : (user as any).department) : "Company"}
                </span>
              </h1>
            </div>
          </div>
          <div className="hidden shrink-0 text-right sm:block">
            <p className="font-serif text-3xl font-semibold tabular-nums leading-none text-foreground">
              {format(new Date(), "hh:mm a")}
            </p>
            <p className="text-xs text-muted-foreground mt-1">{format(new Date(), "EEEE, MMM d")}</p>
          </div>
        </div>
      </div>

      {/* KPI row */}
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {renderStatsCards()}
      </div>

      {/* Expirations + Action Required */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border-border/70 shadow-sm lg:col-span-2">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                <Icon name="bar-chart-3" className="text-amber-500" size={16} />
              </div>
              <div>
                <CardTitle className="font-serif text-base font-semibold text-foreground">Upcoming Expirations</CardTitle>
                <CardDescription>Certificates &amp; Contracts timeline</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {statsLoading ? <Skeleton className="h-[240px] w-full" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={expiryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: "#9ca3af" }} axisLine={false} tickLine={false} />
                  <YAxis className="text-xs" tick={{ fill: "#9ca3af" }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "rgba(0,0,0,0.04)" }} contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="expiring" fill="#f59e0b" name="Certificates" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="contracts" fill="#3b82f6" name="Contracts" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/70 shadow-sm">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Icon name="alert-circle" className="text-red-500" size={16} />
                </div>
                <CardTitle className="font-serif text-base font-semibold text-foreground">Action Required</CardTitle>
              </div>
              {notifications.length > 0 && (
                <Badge variant="outline" className="text-[10px] h-5 px-1.5 bg-red-50 text-red-600 border-red-200">{notifications.length}</Badge>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 max-h-[280px] overflow-y-auto">
            <div className="space-y-3">
              {notifications.length === 0 ? (
                <div className="flex items-center gap-3 p-3 rounded-xl bg-secondary/50">
                  <Icon name="check-circle" className="text-emerald-500 shrink-0" size={20} />
                  <p className="text-sm font-medium text-muted-foreground">No urgent items</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <Link key={n.id} href={n.link} className="block">
                    <div className="flex items-start gap-3 p-3 rounded-xl border border-border/70 bg-white dark:bg-zinc-900 shadow-sm hover:shadow-md transition-all">
                      {n.type === "certificate_expiring" ? (
                        <Icon name="shield-alert" className="mt-0.5 shrink-0 text-amber-500" size={20} />
                      ) : (
                        <Icon name="clock" className="mt-0.5 shrink-0 text-blue-500" size={20} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground">{n.title}</h4>
                          <span className={`text-[10px] font-medium px-1.5 py-0.5 rounded shrink-0 border ${
                            n.daysUntil === 0 || n.daysUntil <= 7 ? "border-red-200 text-red-600" : "border-border text-muted-foreground"
                          }`}>
                            {n.daysUntil === 0 ? "OVERDUE" : `${n.daysUntil}d`}
                          </span>
                        </div>
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.description}</p>
                        <span className="text-xs font-medium text-red-500 mt-1.5 inline-block">View details →</span>
                      </div>
                    </div>
                  </Link>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity + Contracts by Status */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="rounded-xl border-border/70 shadow-sm lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="h-8 w-8 rounded-lg bg-red-500/10 flex items-center justify-center">
                  <Icon name="activity" className="text-red-500" size={16} />
                </div>
                <div>
                  <CardTitle className="font-serif text-base font-semibold text-foreground">Recent Activity</CardTitle>
                  <CardDescription>Latest actions across the portal</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" className="text-red-600 hover:text-red-700 hover:bg-red-50" asChild>
                <Link href="/activity" className="flex items-center gap-1">View All <Icon name="chevron-right" size={14} /></Link>
              </Button>
            </div>
          </CardHeader>
          <CardContent className="flex-1 overflow-auto p-0">
            {activitiesLoading ? (
              <div className="p-6 space-y-6">
                {Array(5).fill(0).map((_, i) => (
                  <div key={i} className="flex gap-4">
                    <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                    <div className="space-y-2 flex-1"><Skeleton className="h-4 w-3/4" /><Skeleton className="h-3 w-1/4" /></div>
                  </div>
                ))}
              </div>
            ) : activities && activities.length > 0 ? (
              <div className="divide-y divide-border/60">
                {activities.slice(0, 8).map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-muted/40 transition-colors flex gap-4 group">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary/60">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-snug text-foreground">{activity.description}</p>
                      <div className="flex items-center text-xs text-muted-foreground gap-2">
                        <span>{format(new Date(activity.timestamp), "MMM d, h:mm a")}</span>
                        <span className="w-1 h-1 rounded-full bg-gray-300"></span>
                        <span className="capitalize">{activity.type}</span>
                      </div>
                    </div>
                    {activity.entityId && (
                      <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 opacity-0 group-hover:opacity-100 transition-opacity" asChild>
                        <Link href={getEntityUrl(activity.type, activity.entityId)}>
                          <Icon name="arrow-up-right" size={16} />
                        </Link>
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            ) : (
              <div className="h-full flex flex-col items-center justify-center text-muted-foreground p-6">
                <Icon name="activity" className="mb-4" size={48} />
                <p>No recent activity found</p>
              </div>
            )}
          </CardContent>
        </Card>

        <Card className="rounded-xl border-border/70 shadow-sm flex flex-col">
          <CardHeader className="pb-3 border-b border-border/60">
            <div className="flex items-center gap-2.5">
              <div className="h-8 w-8 rounded-lg bg-blue-500/10 flex items-center justify-center">
                <Icon name="pie-chart" className="text-blue-500" size={16} />
              </div>
              <CardTitle className="font-serif text-base font-semibold text-foreground">Contracts by Status</CardTitle>
            </div>
          </CardHeader>
          <CardContent className="pt-4 flex-1">
            {contractsLoading ? (
              <div className="space-y-4">
                <Skeleton className="h-[140px] w-full" />
                <Skeleton className="h-4 w-full" />
                <Skeleton className="h-4 w-full" />
              </div>
            ) : contractsSummary ? (
              <>
                {contractStatusData.length > 0 && (
                  <div className="flex items-center gap-4 mb-5">
                    <ResponsiveContainer width="50%" height={130}>
                      <RePieChart>
                        <Pie data={contractStatusData} dataKey="value" nameKey="name" cx="50%" cy="50%" outerRadius={55} innerRadius={30} paddingAngle={3}>
                          {contractStatusData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                        </Pie>
                        <Tooltip contentStyle={{ borderRadius: 12, border: "1px solid #e5e7eb", boxShadow: "0 4px 12px rgba(0,0,0,0.06)" }} />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 text-sm">
                      {contractStatusData.map(d => (
                        <div key={d.name} className="flex items-center gap-2.5">
                          <div className="h-2.5 w-2.5 rounded-full shrink-0" style={{ backgroundColor: d.color }} />
                          <span className="text-muted-foreground">{d.name}: <strong className="text-foreground">{d.value}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  {[
                    { label: "Active", count: contractsSummary.byStatus.active, color: "bg-blue-500" },
                    { label: "Pending", count: contractsSummary.byStatus.pending, color: "bg-amber-500" },
                    { label: "Completed", count: contractsSummary.byStatus.completed, color: "bg-emerald-500" },
                    { label: "Expired", count: contractsSummary.byStatus.expired, color: "bg-red-500" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="flex justify-between items-end mb-1.5">
                        <span className="text-sm font-medium text-foreground/80">{s.label}</span>
                        <span className="text-sm tabular-nums text-muted-foreground">{s.count}</span>
                      </div>
                      <Progress value={(s.count / Math.max(contractsSummary.total, 1)) * 100} className={`h-1.5 rounded-full ${s.color}`} />
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
          <CardFooter className="pt-0 pb-4">
            <Button variant="ghost" size="sm" className="w-full text-blue-600 hover:text-blue-700 hover:bg-blue-50" asChild>
              <Link href="/contracts" className="flex items-center gap-1">Manage Contracts <Icon name="chevron-right" size={14} /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
