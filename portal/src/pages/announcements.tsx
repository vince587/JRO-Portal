import { useState } from "react";
import { Link } from "wouter";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/lib/auth-context";
import { SaveProgressIndicator } from "@/components/upload-progress";

const TYPE_LABELS: Record<string, string> = {
  info: "Info",
  warning: "Warning",
  announcement: "Announcement",
};

const PRIORITY_LABELS: Record<string, string> = {
  low: "Low",
  normal: "Normal",
  high: "High",
  urgent: "Urgent",
};

const AUDIENCE_LABELS: Record<string, string> = {
  all: "All Staff",
  staff: "Staff",
  admin: "Admin Only",
};

const PRIORITY_COLORS: Record<string, string> = {
  low: "bg-slate-100 text-slate-700 border-slate-200",
  normal: "bg-blue-100 text-blue-700 border-blue-200",
  high: "bg-amber-100 text-amber-700 border-amber-200",
  urgent: "bg-red-100 text-red-700 border-red-200",
};

const TYPE_COLORS: Record<string, string> = {
  info: "bg-blue-50 text-blue-700",
  warning: "bg-amber-50 text-amber-700",
  announcement: "bg-emerald-50 text-emerald-700",
};

const CreateAnnouncementSchema = z.object({
  title: z.string().min(1, "Title is required").max(200),
  body: z.string().min(1, "Content is required").max(5000),
  type: z.enum(["info", "warning", "announcement"]).default("announcement"),
  priority: z.enum(["low", "normal", "high", "urgent"]).default("normal"),
  targetAudience: z.enum(["all", "staff", "admin"]).default("all"),
});

type CreateAnnouncementValues = z.infer<typeof CreateAnnouncementSchema>;

function useAnnouncements() {
  return useQuery({
    queryKey: ["announcements"],
    queryFn: async () => {
      const res = await fetch("/api/announcements");
      if (!res.ok) throw new Error("Failed to fetch announcements");
      return res.json();
    },
    refetchInterval: 30_000,
  });
}

export default function Announcements() {
  const { user } = useAuth();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const isAdmin = user?.roles?.some(r => ["admin", "ADMIN", "IT"].includes(r)) || ["admin", "ADMIN", "IT"].includes(user?.role ?? "");

  const [dialogOpen, setDialogOpen] = useState(false);
  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");

  const { data: announcements, isLoading } = useAnnouncements();

  const form = useForm<CreateAnnouncementValues>({
    resolver: zodResolver(CreateAnnouncementSchema),
    defaultValues: {
      title: "",
      body: "",
      type: "announcement",
      priority: "normal",
      targetAudience: "all",
    },
  });

  const filtered = (announcements ?? []).filter((a: any) => {
    const q = searchTerm.toLowerCase();
    return (
      a.title.toLowerCase().includes(q) ||
      a.body.toLowerCase().includes(q) ||
      a.type.toLowerCase().includes(q)
    );
  });

  const createMutation = useMutation({
    mutationFn: async (data: CreateAnnouncementValues) => {
      const res = await fetch("/api/announcements", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to create announcement");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Announcement published" });
      setDialogOpen(false);
      form.reset();
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: () => toast({ title: "Failed to create announcement", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<CreateAnnouncementValues> }) => {
      const res = await fetch(`/api/announcements/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) throw new Error("Failed to update announcement");
      return res.json();
    },
    onSuccess: () => {
      toast({ title: "Announcement updated" });
      setEditingId(null);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: () => toast({ title: "Failed to update announcement", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/announcements/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete");
    },
    onSuccess: () => {
      toast({ title: "Announcement deleted" });
      setDeleteDialogOpen(false);
      setDeletingId(null);
      queryClient.invalidateQueries({ queryKey: ["announcements"] });
    },
    onError: () => toast({ title: "Failed to delete announcement", variant: "destructive" }),
  });

  const handleEdit = (item: any) => {
    setEditingId(item.id);
    form.reset({
      title: item.title,
      body: item.body,
      type: item.type,
      priority: item.priority,
      targetAudience: item.targetAudience,
    });
    setDialogOpen(true);
  };

  const handleSubmit = (data: CreateAnnouncementValues) => {
    if (editingId) {
      updateMutation.mutate({ id: editingId, data });
    } else {
      createMutation.mutate(data);
    }
  };

  const handleCloseDialog = () => {
    setDialogOpen(false);
    setEditingId(null);
    form.reset();
  };

  const openDeleteDialog = (id: string) => {
    setDeletingId(id);
    setDeleteDialogOpen(true);
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <p className="text-muted-foreground">
            Manage and broadcast announcements to the team.
          </p>
        </div>
        {isAdmin && (
          <Button onClick={() => { setEditingId(null); form.reset(); setDialogOpen(true); }}>
            <Icon name="plus" className="mr-2" size={16} /> New Announcement
          </Button>
        )}
      </div>

      <Card className="neu rounded-lg">
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Icon name="megaphone" className="text-primary" size={18} />
            Announcement Board
          </CardTitle>
          <CardDescription>
            {(announcements ?? []).length} total announcements
          </CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="p-4 border-b neu-inset rounded-xl flex flex-col sm:flex-row gap-3 items-start sm:items-center">
            <div className="relative flex-1 w-full">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder="Search announcements..."
                className="pl-9 bg-background w-full max-w-md"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
          </div>

          {isLoading ? (
            <div className="space-y-3 p-4">
              {Array(4).fill(0).map((_, i) => (
                <Skeleton key={i} className="h-20 w-full" />
              ))}
            </div>
          ) : filtered.length === 0 ? (
            <div className="h-64 flex flex-col items-center justify-center text-muted-foreground">
              <Icon name="megaphone" className="opacity-30 mb-4" size={48} />
              <p>No announcements found.</p>
            </div>
          ) : (
            <div className="divide-y">
              {filtered.map((item: any) => (
                <div key={item.id} className="p-4 hover:bg-muted/30 transition-colors">
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <h3 className="text-sm font-semibold text-foreground truncate">{item.title}</h3>
                        {item.isPinned && (
                          <Badge variant="outline" className="text-[10px] bg-amber-50 text-amber-700 border-amber-200">Pinned</Badge>
                        )}
                      </div>
                      <p className="text-xs text-muted-foreground line-clamp-2 mb-2">{item.body}</p>
                      <div className="flex items-center gap-2 flex-wrap">
                        <Badge className={`text-[10px] capitalize ${TYPE_COLORS[item.type] || "bg-slate-100"}`}>
                          {TYPE_LABELS[item.type] || item.type}
                        </Badge>
                        <Badge variant="outline" className={`text-[10px] capitalize border ${PRIORITY_COLORS[item.priority]}`}>
                          {PRIORITY_LABELS[item.priority]}
                        </Badge>
                        <Badge variant="outline" className="text-[10px] capitalize">
                          {AUDIENCE_LABELS[item.targetAudience] || item.targetAudience}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground">{format(new Date(item.createdAt), "MMM d, yyyy h:mm a")}</span>
                        <span className="text-[10px] text-muted-foreground">by {item.createdBy || "—"}</span>
                      </div>
                    </div>
                    {isAdmin && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Icon name="more-horizontal" size={16} />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem onClick={() => handleEdit(item)}>
                            Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-red-600"
                            onClick={() => openDeleteDialog(item.id)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      <Dialog open={dialogOpen} onOpenChange={handleCloseDialog}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editingId ? "Edit Announcement" : "New Announcement"}</DialogTitle>
            <DialogDescription>
              {editingId ? "Update the announcement details." : "Create a new announcement for the team."}
            </DialogDescription>
          </DialogHeader>
          <form onSubmit={form.handleSubmit(handleSubmit)} className="space-y-4 py-2">
            <div className="space-y-2">
              <Label>Title *</Label>
              <Input {...form.register("title")} placeholder="Announcement title" disabled={!!createMutation.isPending || !!updateMutation.isPending} />
            </div>
            <div className="space-y-2">
              <Label>Content *</Label>
              <Textarea {...form.register("body")} placeholder="Announcement content..." rows={5} disabled={!!createMutation.isPending || !!updateMutation.isPending} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Type</Label>
                <Select onValueChange={v => form.setValue("type", v as any)} value={form.watch("type")} disabled={!!createMutation.isPending || !!updateMutation.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="info">Info</SelectItem>
                    <SelectItem value="warning">Warning</SelectItem>
                    <SelectItem value="announcement">Announcement</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Priority</Label>
                <Select onValueChange={v => form.setValue("priority", v as any)} value={form.watch("priority")} disabled={!!createMutation.isPending || !!updateMutation.isPending}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="low">Low</SelectItem>
                    <SelectItem value="normal">Normal</SelectItem>
                    <SelectItem value="high">High</SelectItem>
                    <SelectItem value="urgent">Urgent</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Audience</Label>
              <Select onValueChange={v => form.setValue("targetAudience", v as any)} value={form.watch("targetAudience")} disabled={!!createMutation.isPending || !!updateMutation.isPending}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Staff</SelectItem>
                  <SelectItem value="staff">Staff</SelectItem>
                  <SelectItem value="admin">Admin Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <DialogFooter className="justify-between !mt-6">
              <Button
                type="button"
                variant="outline"
                className="text-red-500 border-red-200 hover:bg-red-50 dark:hover:bg-red-950"
                onClick={() => {
                  if (editingId) {
                    deleteMutation.mutate(editingId);
                    handleCloseDialog();
                  }
                }}
                disabled={!editingId || deleteMutation.isPending || updateMutation.isPending}
              >
                Delete
              </Button>
              <div className="flex gap-2">
                <Button type="button" variant="outline" onClick={handleCloseDialog}>Cancel</Button>
                <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                  {createMutation.isPending ? "Saving..." : updateMutation.isPending ? "Updating..." : editingId ? "Update" : "Publish"}
                </Button>
              </div>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <AlertDialog open={deleteDialogOpen} onOpenChange={setDeleteDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete announcement?</AlertDialogTitle>
            <AlertDialogDescription>
              This action cannot be undone. The announcement will be permanently removed.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={() => deleteMutation.mutate(deletingId!)}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={deleteMutation.isPending}
            >
              {deleteMutation.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <SaveProgressIndicator saving={createMutation.isPending || updateMutation.isPending} label="Saving announcement..." />
    </div>
  );
}
