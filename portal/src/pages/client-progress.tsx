import { useState, useEffect } from "react";
import { useRoute } from "wouter";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";

const STATUS_LABELS: Record<string, string> = {
  planning: "Planning",
  active: "Active",
  on_hold: "On Hold",
  completed: "Completed",
  cancelled: "Cancelled",
};

const STATUS_COLORS: Record<string, string> = {
  planning: "tone-info",
  active: "tone-success",
  on_hold: "tone-warning",
  completed: "tone-success",
  cancelled: "tone-danger",
};

export default function ClientProgress() {
  const [, params] = useRoute("/client-progress/:id");
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    const id = params?.id;
    const token = new URLSearchParams(window.location.search).get("token");
    if (!id || !token) { setError("Invalid link"); setLoading(false); return; }
    (async () => {
      try {
        const r = await fetch(`/api/projects/public/${id}/client-progress?token=${token}`);
        if (r.ok) setData(await r.json());
        else setError("Project not found or invalid access link");
      } catch { setError("Unable to load project data"); }
      finally { setLoading(false); }
    })();
  }, [params?.id]);

  if (loading) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-2xl surface rounded-lg">
          <CardContent className="p-8 space-y-4">
            <Skeleton className="h-8 w-48" />
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-full" />
            <Skeleton className="h-24 w-full" />
          </CardContent>
        </Card>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 flex items-center justify-center p-4">
        <Card className="w-full max-w-md text-center surface rounded-lg">
          <CardContent className="p-8">
            <div className="text-5xl mb-4">🔒</div>
            <h2 className="text-xl font-bold mb-2">Access Denied</h2>
            <p className="text-muted-foreground">{error}</p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50">
      <div className="max-w-3xl mx-auto p-4 sm:p-8">
        <Card className="overflow-hidden border-0 shadow-lg surface rounded-lg">
          <div className="h-2 bg-gradient-to-r from-blue-500 via-emerald-500 to-amber-500" />
          <CardHeader className="border-b bg-white pb-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-muted-foreground mb-1">Project Progress Report</p>
                <CardTitle className="text-2xl">{data?.title || "Project"}</CardTitle>
                {data?.clientName && (
                  <p className="text-muted-foreground mt-1">Client: {data.clientName}</p>
                )}
              </div>
              <span className={`text-xs font-medium px-3 py-1 rounded-full ${STATUS_COLORS[data?.status] || "bg-secondary"}`}>
                {STATUS_LABELS[data?.status] || data?.status}
              </span>
            </div>
          </CardHeader>
          <CardContent className="p-6 sm:p-8 space-y-8">
            <div>
              <div className="flex justify-between items-center mb-2">
                <h3 className="font-semibold text-sm">Overall Completion</h3>
                <span className="text-2xl font-bold text-primary">{data?.progress ?? 0}%</span>
              </div>
              <Progress value={data?.progress ?? 0} className="h-3" />
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="bg-emerald-50 rounded-xl p-4 text-center border border-emerald-100">
                <div className="text-3xl font-bold text-emerald-600">
                  {data?.checklist?.received ?? 0}<span className="text-lg text-emerald-400">/{data?.checklist?.total ?? 0}</span>
                </div>
                <div className="text-xs text-emerald-700 mt-1 font-medium">Documents Received</div>
                <div className="text-xs text-emerald-500 mt-0.5">{data?.checklist?.approved ?? 0} approved</div>
              </div>
              <div className="bg-amber-50 rounded-xl p-4 text-center border border-amber-100">
                <div className="text-3xl font-bold text-amber-600">{data?.departmentTargets ?? 0}</div>
                <div className="text-xs text-amber-700 mt-1 font-medium">Departments Tracked</div>
                <div className="text-xs text-amber-500 mt-0.5">with targets</div>
              </div>
            </div>

            {data?.projectManager && (
              <div className="text-center text-sm text-muted-foreground pt-4 border-t">
                Project Manager: <span className="font-medium text-foreground">{data.projectManager}</span>
              </div>
            )}
          </CardContent>
        </Card>
        <p className="text-center text-xs text-muted-foreground mt-6">
          Powered by Internal Portal
        </p>
      </div>
    </div>
  );
}
