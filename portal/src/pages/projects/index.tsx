import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"

import { useListProjects, useGetProjectsSummary, getListProjectsQueryKey, getGetProjectsSummaryQueryKey } from "@workspace/api-client-react";
import { ProjectStatus, ProjectPriority } from "@workspace/api-client-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Progress } from "@/components/ui/progress";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { useQueryClient, useMutation } from "@tanstack/react-query";

export default function ProjectsList() {
  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState<"ALL" | ProjectStatus>("ALL");
  const [selectedIds, setSelectedIds] = useState<Set<string | number>>(new Set());
  const [bulkDeleteOpen, setBulkDeleteOpen] = useState(false);
  const { toast } = useToast();
  const { user } = useAuth();
  const queryClient = useQueryClient();

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
      const res = await fetch("/api/projects/bulk-delete", {
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
      queryClient.invalidateQueries({ queryKey: getListProjectsQueryKey() });
      queryClient.invalidateQueries({ queryKey: getGetProjectsSummaryQueryKey() });
      setSelectedIds(new Set());
      setBulkDeleteOpen(false);
      if (result.errors?.length) {
        toast({ title: `Deleted ${result.deleted}, ${result.errors.length} failed`, variant: "destructive" });
      } else {
        toast({ title: `Deleted ${result.deleted} projects` });
      }
    },
    onError: (e: Error) => toast({ title: "Bulk delete failed", description: e.message, variant: "destructive" }),
  });

  const queryParams = {
    ...(statusFilter !== "ALL" ? { status: statusFilter as ProjectStatus } : {}),
  };

  const { data: projects, isLoading } = useListProjects(queryParams);
  const { data: summary } = useGetProjectsSummary();

  const filteredProjects = projects?.filter(project => {
    if (!searchTerm) return true;
    const lowerSearch = searchTerm.toLowerCase();
    return (
      project.title.toLowerCase().includes(lowerSearch) ||
      (project.clientName && project.clientName.toLowerCase().includes(lowerSearch)) ||
      (project.projectManager && project.projectManager.toLowerCase().includes(lowerSearch))
    );
  });

  const getStatusBadge = (status: ProjectStatus) => {
    switch (status) {
      case 'planning':
        return <Badge variant="outline" className="bg-muted/60 text-foreground border-border dark:bg-slate-900/20 dark:text-muted-foreground/80 dark:border-slate-900/50">Planning</Badge>;
      case 'active':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400 dark:border-blue-900/50">Active</Badge>;
      case 'on_hold':
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400 dark:border-amber-900/50">On Hold</Badge>;
      case 'completed':
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400 dark:border-emerald-900/50">Completed</Badge>;
      case 'cancelled':
        return <Badge variant="outline" className="bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400 dark:border-red-900/50">Cancelled</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getPriorityColor = (priority?: ProjectPriority) => {
    switch (priority) {
      case 'low': return "text-muted-foreground bg-slate-100 dark:bg-slate-800";
      case 'medium': return "text-blue-500 bg-blue-100 dark:bg-blue-900/40";
      case 'high': return "text-amber-500 bg-amber-100 dark:bg-amber-900/40";
      case 'critical': return "text-red-500 bg-red-100 dark:bg-red-900/40";
      default: return "text-muted-foreground bg-slate-100 dark:bg-slate-800";
    }
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-muted-foreground">
            Manage operational deployments and deliverables.
          </p>
        </div>
        {(user?.canAccessProjects && user?.canAccessJmcs) || user?.roles?.some(r => ["admin", "ADMIN", "IT"].includes(r)) || ["admin", "ADMIN", "IT"].includes(user?.role ?? "") ? (
          <Button asChild variant="success">
            <Link href="/projects/new" className="flex items-center">
              <Icon name="plus" className="mr-2" size={16} />
              New Project
            </Link>
          </Button>
        ) : (
          <Tooltip>
            <TooltipTrigger asChild>
              <Button disabled>
                <Icon name="plus" className="mr-2" size={16} />
                New Project
              </Button>
            </TooltipTrigger>
            <TooltipContent>
              <p>sorry you dont have permission to create projects</p>
            </TooltipContent>
          </Tooltip>
        )}
      </div>

      <div className="p-4 neu-inset rounded-xl flex flex-col md:flex-row gap-4 items-center justify-between">
        <div className="flex items-center gap-2 pr-3 mr-1 border-r">
          <Checkbox
            checked={
              (filteredProjects?.length ?? 0) > 0 &&
              (filteredProjects?.every(p => selectedIds.has(p.id)) ?? false)
                ? true
                : (filteredProjects?.some(p => selectedIds.has(p.id)) ?? false)
                  ? "indeterminate"
                  : false
            }
            onCheckedChange={() => toggleAllVisible((filteredProjects ?? []).map(p => p.id))}
            aria-label="Select all"
          />
          <span className="text-sm text-muted-foreground whitespace-nowrap">Select all</span>
        </div>
        <div className="flex-1 w-full flex items-center relative">
          <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
          <Input 
            placeholder="Search projects..." 
            className="pl-9 w-full max-w-md"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
        <div className="flex items-center gap-2 w-full md:w-auto">
          <Tabs value={statusFilter} onValueChange={(v) => setStatusFilter(v as any)} className="w-full md:w-auto">
            <TabsList className="grid w-full grid-cols-4 md:w-[400px]">
              <TabsTrigger value="ALL">All</TabsTrigger>
              <TabsTrigger value="active">Active</TabsTrigger>
              <TabsTrigger value="planning">Planning</TabsTrigger>
              <TabsTrigger value="completed">Completed</TabsTrigger>
            </TabsList>
          </Tabs>
        </div>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {Array(6).fill(0).map((_, i) => (
            <Card key={i} className="h-64 neu rounded-lg">
              <CardContent className="p-6 h-full flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-4">
                    <Skeleton className="h-6 w-3/4" />
                    <Skeleton className="h-5 w-16 rounded-full" />
                  </div>
                  <Skeleton className="h-4 w-full mb-2" />
                  <Skeleton className="h-4 w-2/3" />
                </div>
                <div className="space-y-4">
                  <Skeleton className="h-2 w-full rounded-full" />
                  <div className="flex justify-between">
                    <Skeleton className="h-4 w-20" />
                    <Skeleton className="h-4 w-20" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      ) : filteredProjects?.length === 0 ? (
        <Card className="neu rounded-lg">
          <CardContent className="h-64 flex flex-col items-center justify-center text-center">
            <Icon name="briefcase" className="text-muted-foreground/30 mb-4" size={48} />
            <p className="text-lg font-medium">No projects found</p>
            <p className="text-muted-foreground mt-1">Try adjusting your search or filters.</p>
            {(searchTerm || statusFilter !== "ALL") && (
              <Button 
                variant="outline" 
                className="mt-4"
                onClick={() => {
                  setSearchTerm("");
                  setStatusFilter("ALL");
                }}
              >
                Clear Filters
              </Button>
            )}
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
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
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredProjects?.map(project => (
              <Card key={project.id} className="flex flex-col hover:border-primary/50 transition-colors group relative overflow-hidden neu rounded-lg">
                <div className="absolute top-3 left-3 z-10 bg-background/80 backdrop-blur-sm rounded p-0.5">
                  <Checkbox
                    checked={selectedIds.has(project.id)}
                    onCheckedChange={() => toggleRow(project.id)}
                    onClick={(e) => e.stopPropagation()}
                    aria-label={`Select ${project.title}`}
                  />
                </div>
                <div className={`absolute top-0 left-0 w-1 h-full ${
                project.status === 'active' ? 'bg-blue-500' : 
                project.status === 'completed' ? 'bg-emerald-500' :
                project.status === 'cancelled' ? 'bg-red-500' :
                project.status === 'on_hold' ? 'bg-amber-500' : 'bg-slate-300'
              }`} />
              <CardHeader className="pb-2">
                <div className="flex justify-between items-start">
                  <div className="space-y-1.5 flex-1 pr-2">
                    <div className="flex items-center gap-2">
                      <div className={`text-[10px] uppercase font-bold tracking-wider px-1.5 py-0.5 rounded ${getPriorityColor(project.priority)}`}>
                        {project.priority || 'Medium'}
                      </div>
                      {getStatusBadge(project.status)}
                    </div>
                    <CardTitle className="text-xl leading-tight line-clamp-2">
                      <Link href={`/projects/${project.id}`} className="hover:underline">
                        {project.title}
                      </Link>
                    </CardTitle>
                  </div>
                  <DropdownMenu>
                    <DropdownMenuTrigger asChild>
                      <Button variant="ghost" size="icon" className="-mt-1 -mr-2 h-8 w-8">
                        <Icon name="more-horizontal" size={16} />
                      </Button>
                    </DropdownMenuTrigger>
                    <DropdownMenuContent align="end">
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/${project.id}`} className="cursor-pointer">
                          <Icon name="eye" className="mr-2" size={16} /> View Details
                        </Link>
                      </DropdownMenuItem>
                      <DropdownMenuItem asChild>
                        <Link href={`/projects/${project.id}?edit=true`} className="cursor-pointer">
                          <Icon name="edit" className="mr-2" size={16} /> Edit Project
                        </Link>
                      </DropdownMenuItem>
                    </DropdownMenuContent>
                  </DropdownMenu>
                </div>
              </CardHeader>
              <CardContent className="flex-1 flex flex-col">
                <p className="text-sm text-muted-foreground line-clamp-2 flex-1 mb-4">
                  {project.description || "No description provided."}
                </p>
                
                <div className="space-y-4 mt-auto">
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div className="flex items-center gap-1.5 text-muted-foreground">
                      <Icon name="calendar" size={14} />
                      <span>{format(new Date(project.startDate), "MMM d, yyyy")}</span>
                    </div>
                    <div className="flex justify-end text-muted-foreground font-medium">
                      {project.clientName || "Internal"}
                    </div>
                  </div>
                  
                  <div className="space-y-1.5">
                    <div className="flex justify-between text-xs font-medium">
                      <span>Progress</span>
                      <span>{project.progress || 0}%</span>
                    </div>
                    <Progress value={project.progress || 0} className="h-2" />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
          </div>

          <AlertDialog open={bulkDeleteOpen} onOpenChange={setBulkDeleteOpen}>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Delete {selectedIds.size} project{selectedIds.size === 1 ? "" : "s"}?</AlertDialogTitle>
                <AlertDialogDescription>
                  This action cannot be undone. The selected projects will be permanently removed.
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
        </div>
      )}
    </div>
  );
}
