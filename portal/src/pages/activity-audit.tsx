import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"
import { useQuery } from "@tanstack/react-query";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface ActivityItem {
  id: number;
  type: string;
  description: string;
  timestamp: string;
  entityId: number | null;
}

interface ActivityResponse {
  items: ActivityItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

function getActivityIcon(type: string) {
  switch (type) {
    case "contract": return <Icon name="file-text" className="text-muted-foreground" size={16} />;
    case "project": return <Icon name="briefcase" className="text-muted-foreground" size={16} />;
    case "certificate": return <Icon name="shield-check" className="text-muted-foreground" size={16} />;
    case "event": return <Icon name="calendar-days" className="text-muted-foreground" size={16} />;
    case "user": return <Icon name="users" className="text-muted-foreground" size={16} />;
    default: return <Icon name="activity" className="text-muted-foreground" size={16} />;
  }
}

function getEntityUrl(type: string, id?: number | null) {
  if (!id) return "#";
  switch (type) {
    case "contract": return `/contracts/${id}`;
    case "project": return `/projects/${id}`;
    case "certificate": return `/certificates/${id}`;
    case "event": return `/calendar`;
    case "user": return `/admin`;
    default: return "#";
  }
}

export default function ActivityAudit() {
  const [page, setPage] = useState(1);
  const [typeFilter, setTypeFilter] = useState("");
  const [search, setSearch] = useState("");

  const { data, isLoading } = useQuery<ActivityResponse>({
    queryKey: ["activity-log", page, typeFilter, search],
    queryFn: async () => {
      const params = new URLSearchParams({ page: String(page), limit: "50" });
      if (typeFilter) params.set("type", typeFilter);
      if (search) params.set("search", search);
      const res = await fetch(`/api/dashboard/activity-log?${params}`);
      if (!res.ok) throw new Error("Failed to fetch");
      return res.json();
    },
  });

  return (
    <div className="space-y-6 pb-8 animate-in fade-in duration-500">
      <div>
        <h1 className="text-3xl font-bold tracking-tight">Activity Audit Log</h1>
        <p className="text-muted-foreground mt-1">Full searchable history of all system actions.</p>
      </div>

      <Card className="neu rounded-2xl">
        <CardHeader className="pb-3 border-b">
          <div className="flex flex-col md:flex-row gap-3 items-start md:items-center justify-between">
            <CardTitle className="text-lg font-semibold flex items-center gap-2">
              <Icon name="activity" className="text-primary" size={20} />
              System Activity
              {data && <Badge variant="secondary" className="ml-2">{data.total} entries</Badge>}
            </CardTitle>
            <div className="flex gap-2 w-full md:w-auto neu-inset rounded-xl p-2">
              <div className="relative flex-1 md:w-48">
                <Icon name="search" className="absolute left-2.5 top-2.5 text-muted-foreground" size={16} />
                <Input
                  placeholder="Search..."
                  className="pl-8 h-9"
                  value={search}
                  onChange={(e) => { setSearch(e.target.value); setPage(1); }}
                />
              </div>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-32 h-9">
                  <SelectValue placeholder="All types" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value=" ">All types</SelectItem>
                  <SelectItem value="contract">Contract</SelectItem>
                  <SelectItem value="certificate">Certificate</SelectItem>
                  <SelectItem value="project">Project</SelectItem>
                  <SelectItem value="event">Event</SelectItem>
                  <SelectItem value="user">User</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-6 space-y-4">
              {Array(10).fill(0).map((_, i) => (
                <div key={i} className="flex gap-4">
                  <Skeleton className="h-8 w-8 rounded-full shrink-0" />
                  <div className="space-y-2 flex-1">
                    <Skeleton className="h-4 w-3/4" />
                    <Skeleton className="h-3 w-1/4" />
                  </div>
                </div>
              ))}
            </div>
          ) : data && data.items.length > 0 ? (
            <>
              <div className="divide-y max-h-[600px] overflow-y-auto">
                {data.items.map((activity) => (
                  <div key={activity.id} className="p-4 hover:bg-muted/30 transition-colors flex gap-4 group">
                    <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-secondary border">
                      {getActivityIcon(activity.type)}
                    </div>
                    <div className="flex-1 space-y-1 min-w-0">
                      <p className="text-sm font-medium leading-snug">{activity.description}</p>
                      <div className="flex items-center text-xs text-muted-foreground gap-2">
                        <span>{format(new Date(activity.timestamp), "MMM d, yyyy h:mm a")}</span>
                        <span className="w-1 h-1 rounded-full bg-muted-foreground/30" />
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
              <div className="flex items-center justify-between p-4 border-t">
                <span className="text-sm text-muted-foreground">
                  Page {data.page} of {data.totalPages} ({data.total} total)
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(p => p - 1)}>
                    <Icon name="chevron-left" className="mr-1" size={16} /> Previous
                  </Button>
                  <Button variant="outline" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(p => p + 1)}>
                    Next <Icon name="chevron-right" className="ml-1" size={16} />
                  </Button>
                </div>
              </div>
            </>
          ) : (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground p-6">
              <Icon name="activity" className="text-muted mb-4" size={48} />
              <p>No activity found</p>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
