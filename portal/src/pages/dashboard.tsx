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
import { StatTile, Banner } from "@/components/stat-tile";
import { TonePill, toneHex, type Tone } from "@/components/status-badge";
import { SnowEffect } from "@/components/snow-effect";

const COLORS = ["#3b82f6", "#f59e0b", "#10b981", "#ef4444"];

/** Chart series colours, read from the theme so charts follow light/dark. */
const CHART = {
  active: "hsl(var(--chart-2))",
  pending: "hsl(var(--chart-3))",
  completed: "hsl(var(--chart-1))",
  expired: "hsl(var(--chart-4))",
};


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
      return Array(6).fill(0).map((_, i) => (
        <div key={i} className="surface rounded-2xl p-5 border border-border/80">
          <Skeleton className="h-3 w-1/2" />
          <Skeleton className="mt-3 h-8 w-1/3" />
          <Skeleton className="mt-2.5 h-3 w-2/3" />
        </div>
      ));
    }
    if (!stats) return null;

    const totalCerts = stats.totalCertificates || 0;
    const expiringCerts = stats.expiringCertificates || 0;
    const validCerts = Math.max(0, totalCerts - expiringCerts);

    return (
      <>
        <StatTile
          label="Total Contracts"
          value={stats.totalContracts}
          icon="file-text"
          tone="success"
        />
        <StatTile
          label="Active Contracts"
          value={stats.activeContracts}
          icon="calendar"
          tone="info"
        />
        <StatTile
          label="Available Certificates"
          value={`${validCerts} / ${totalCerts}`}
          icon="shield-check"
          tone="warning"
          detail={expiringCerts > 0 ? `${expiringCerts} expiring soon` : undefined}
          detailTone="warning"
        />
        <StatTile
          label="Monthly Value"
          value={`₱${((stats as any).totalContractValue || 0).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
          icon="trending-up"
          tone="success"
        />
        <StatTile
          label="Active Projects"
          value={stats.activeProjects}
          icon="briefcase"
          tone="info"
        />
        <StatTile
          label="Active Leads"
          value={(stats as any).totalLeads ?? 0}
          icon="target"
          tone="progress"
        />
      </>
    );
  };

  const getActivityIcon = (type: string) => {
    switch (type) {
      case 'contract': return <Icon name="file-text" className="text-chart-2" size={15} />;
      case 'project': return <Icon name="briefcase" className="text-chart-5" size={15} />;
      case 'certificate': return <Icon name="shield-check" className="text-chart-1" size={15} />;
      case 'event': return <Icon name="calendar-days" className="text-chart-3" size={15} />;
      case 'user': return <Icon name="users" className="text-chart-2" size={15} />;
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
    { name: "Active", value: contractsSummary.byStatus.active, color: CHART.active },
    { name: "Pending", value: contractsSummary.byStatus.pending, color: CHART.pending },
    { name: "Completed", value: contractsSummary.byStatus.completed, color: CHART.completed },
    { name: "Expired", value: contractsSummary.byStatus.expired, color: CHART.expired },
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
      <SnowEffect />
      {/* Welcome banner */}
      <Banner
        title={
          <>
            Good {greeting}, {user?.fullName?.split(" ")[0] || "there"}
          </>
        }
      />

      {/* KPI row - 3x2 Grid matching reference */}
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {renderStatsCards()}
      </div>

      {/* Expirations + Action Required */}
      <div className="grid gap-6 lg:grid-cols-3">
        <Card className="surface rounded-lg lg:col-span-2 min-w-0">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2.5">
              <span className="icon-tile" style={{ ["--tile-tone" as string]: "hsl(var(--chart-3))" }}>
                <Icon name="bar-chart-3" size={16} />
              </span>
              <div>
                <CardTitle className="text-base font-semibold text-foreground">Upcoming Expirations</CardTitle>
                <CardDescription>Certificates &amp; Contracts timeline</CardDescription>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-4">
            {statsLoading ? <Skeleton className="h-[240px] w-full" /> : (
              <ResponsiveContainer width="100%" height={240}>
                <BarChart data={expiryData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                  <XAxis dataKey="name" className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} axisLine={false} tickLine={false} />
                  <YAxis className="text-xs" tick={{ fill: "hsl(var(--muted-foreground))" }} allowDecimals={false} axisLine={false} tickLine={false} />
                  <Tooltip cursor={{ fill: "hsl(var(--muted) / 0.5)" }} />
                  <Legend iconType="circle" iconSize={8} />
                  <Bar dataKey="expiring" fill={CHART.pending} name="Certificates" radius={[4, 4, 0, 0]} maxBarSize={32} />
                  <Bar dataKey="contracts" fill={CHART.active} name="Contracts" radius={[4, 4, 0, 0]} maxBarSize={32} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        <Card className="surface rounded-lg">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="icon-tile" style={{ ["--tile-tone" as string]: "hsl(var(--chart-4))" }}>
                  <Icon name="alert-circle" size={16} />
                </span>
                <CardTitle className="text-base font-semibold text-foreground">Action Required</CardTitle>
              </div>
              {notifications.length > 0 && (
                <TonePill tone="danger">{notifications.length}</TonePill>
              )}
            </div>
          </CardHeader>
          <CardContent className="pt-4 max-h-[280px] overflow-y-auto">
            <div className="space-y-2">
              {notifications.length === 0 ? (
                <div className="surface-sunken flex items-center gap-3 rounded-md p-3">
                  <Icon name="check-circle" className="shrink-0 text-chart-1" size={18} />
                  <p className="text-sm font-medium text-muted-foreground">No urgent items</p>
                </div>
              ) : (
                notifications.map((n) => (
                  <Link key={n.id} href={n.link} className="block">
                    <div className="surface-sunken flex items-start gap-3 rounded-md p-3 transition-colors hover:bg-accent">
                      {n.type === "certificate_expiring" ? (
                        <Icon name="shield-alert" className="mt-0.5 shrink-0 text-chart-3" size={18} />
                      ) : (
                        <Icon name="clock" className="mt-0.5 shrink-0 text-chart-2" size={18} />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <h4 className="text-sm font-medium text-foreground">{n.title}</h4>
                          <TonePill tone={n.daysUntil === 0 || n.daysUntil <= 7 ? "danger" : "neutral"}>
                            {n.daysUntil === 0 ? "Overdue" : `${n.daysUntil}d`}
                          </TonePill>
                        </div>
                        <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{n.description}</p>
                        <span className="mt-1.5 inline-block text-xs font-medium text-primary">View details</span>
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
        <Card className="surface rounded-lg lg:col-span-2 flex flex-col">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <span className="icon-tile" style={{ ["--tile-tone" as string]: "hsl(var(--chart-1))" }}>
                  <Icon name="activity" size={16} />
                </span>
                <div>
                  <CardTitle className="text-base font-semibold text-foreground">Recent Activity</CardTitle>
                  <CardDescription>Latest actions across the portal</CardDescription>
                </div>
              </div>
              <Button variant="ghost" size="sm" asChild>
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
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-muted">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-snug text-foreground">{activity.description}</p>
                      <div className="flex items-center text-xs text-muted-foreground gap-2">
                        <span>{format(new Date(activity.timestamp), "MMM d, h:mm a")}</span>
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

        <Card className="surface rounded-lg flex flex-col min-w-0">
          <CardHeader className="pb-3 border-b">
            <div className="flex items-center gap-2.5">
              <span className="icon-tile" style={{ ["--tile-tone" as string]: "hsl(var(--chart-2))" }}>
                <Icon name="pie-chart" size={16} />
              </span>
              <CardTitle className="text-base font-semibold text-foreground">Contracts by Status</CardTitle>
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
                        <Tooltip />
                      </RePieChart>
                    </ResponsiveContainer>
                    <div className="space-y-2 text-sm">
                      {contractStatusData.map(d => (
                        <div key={d.name} className="flex items-center gap-2.5">
                          <span className="text-muted-foreground">{d.name}: <strong className="tabular text-foreground">{d.value}</strong></span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                <div className="space-y-4">
                  {[
                    { label: "Active", count: contractsSummary.byStatus.active, tone: "info" },
                    { label: "Pending", count: contractsSummary.byStatus.pending, tone: "warning" },
                    { label: "Completed", count: contractsSummary.byStatus.completed, tone: "success" },
                    { label: "Expired", count: contractsSummary.byStatus.expired, tone: "danger" },
                  ].map(s => (
                    <div key={s.label}>
                      <div className="mb-1.5 flex items-end justify-between">
                        <span className="text-sm font-medium text-foreground/80">{s.label}</span>
                        <span className="tabular text-sm text-muted-foreground">{s.count}</span>
                      </div>
                      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted">
                        <div
                          className="h-full rounded-full"
                          style={{
                            width: `${(s.count / Math.max(contractsSummary.total, 1)) * 100}%`,
                            backgroundColor: toneHex(s.tone as Tone),
                          }}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              </>
            ) : null}
          </CardContent>
          <CardFooter className="pt-0 pb-4">
            <Button variant="ghost" size="sm" className="w-full" asChild>
              <Link href="/contracts" className="flex items-center gap-1">Manage Contracts <Icon name="chevron-right" size={14} /></Link>
            </Button>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
