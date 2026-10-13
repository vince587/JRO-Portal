import { useState, useMemo } from "react";
import { Icon } from "@/components/ui/icon"
import { useListUsers, useGetMe, getListUsersQueryKey } from "@workspace/api-client-react";
import { useMutation, useQueryClient } from "@tanstack/react-query";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
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
import { useToast } from "@/hooks/use-toast";
import { PageHeader } from "@/components/page-header";

const ALL_ROLES = ["staff", "officer", "IT", "ADMIN"] as const;
const ALL_PERMISSIONS = ["canAccessSis", "canAccessJmcs", "canEditCalendar", "canEditTrainingProposal", "canManageContracts", "canManageCertificates", "canAccessProjects", "canAccessAdmin", "canAccessDevelopers"] as const;

type UserFormData = {
  username: string;
  email: string;
  password: string;
  fullName: string;
  role: string;
  roles: string[];
  department: string;
  isActive: boolean;
  permissions: Record<string, boolean>;
};

const EMPTY_FORM: UserFormData = {
  username: "",
  email: "",
  password: "",
  fullName: "",
  role: "staff",
  roles: ["staff"],
  department: "",
  isActive: true,
  permissions: Object.fromEntries(ALL_PERMISSIONS.map(p => [p, false])),
};

function getInitials(name?: string | null) {
  if (!name) return "U";
  return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
}

function hasRole(user: { role?: string; roles?: string[] }, role: string) {
  return user.roles?.includes(role) || user.role === role;
}

export default function UsersPage() {
  const { data: currentUser } = useGetMe();
  const { data: users = [], isLoading } = useListUsers();
  const queryClient = useQueryClient();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);
  const [editUser, setEditUser] = useState<any>(null);
  const [formData, setFormData] = useState<UserFormData>(EMPTY_FORM);

  const isAdmin = currentUser && (["ADMIN", "admin", "IT"].includes(currentUser.role) || currentUser.roles?.some((r: string) => ["ADMIN", "admin", "IT"].includes(r)) || currentUser.canAccessAdmin || currentUser.canAccessDevelopers);

  const createMutation = useMutation({
    mutationFn: async (data: UserFormData) => {
      const payload: any = {
        username: data.username,
        email: data.email,
        password: data.password,
        fullName: data.fullName,
        role: data.role,
        roles: data.roles,
        department: data.department,
        isActive: data.isActive,
      };
      ALL_PERMISSIONS.forEach(p => { if (data.permissions[p]) payload[p] = true; });
      const res = await fetch("/api/users", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Failed to create user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setAddDialogOpen(false);
      setFormData(EMPTY_FORM);
      toast({ title: "User created" });
    },
    onError: () => toast({ title: "Failed to create user", variant: "destructive" }),
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, data }: { id: number; data: UserFormData }) => {
      const payload: any = {
        email: data.email,
        fullName: data.fullName,
        role: data.role,
        roles: data.roles,
        department: data.department,
        isActive: data.isActive,
      };
      ALL_PERMISSIONS.forEach(p => { if (data.permissions[p]) payload[p] = true; });
      const res = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(payload) });
      if (!res.ok) throw new Error("Failed to update user");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      setEditDialogOpen(false);
      setEditUser(null);
      toast({ title: "User updated" });
    },
    onError: () => toast({ title: "Failed to update user", variant: "destructive" }),
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: number) => {
      const res = await fetch(`/api/users/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete user");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User deleted" });
    },
    onError: () => toast({ title: "Failed to delete user", variant: "destructive" }),
  });

  const toggleActiveMutation = useMutation({
    mutationFn: async ({ id, isActive }: { id: number; isActive: boolean }) => {
      const res = await fetch(`/api/users/${id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ isActive }) });
      if (!res.ok) throw new Error("Failed to toggle status");
      return { id, isActive };
    },
    onSuccess: async ({ id, isActive }) => {
      const targetId = String(id);
      queryClient.setQueryData(getListUsersQueryKey(), (old: any) => {
        if (!Array.isArray(old)) return old;
        return old.map((u: any) => (String(u.id) === targetId ? { ...u, isActive } : u));
      });
      await queryClient.invalidateQueries({ queryKey: getListUsersQueryKey() });
      toast({ title: "User status updated" });
    },
    onError: () => toast({ title: "Failed to update status", variant: "destructive" }),
  });

  const filteredUsers = useMemo(() => {
    if (!users) return [];
    return users.filter(user => {
      if (!searchTerm && !roleFilter) return true;
      const q = searchTerm.toLowerCase();
      const matchesSearch = !searchTerm || [user.username, user.email, user.fullName, user.department].some(f => f?.toLowerCase().includes(q));
      const matchesRole = !roleFilter || hasRole(user, roleFilter);
      return matchesSearch && matchesRole;
    });
  }, [users, searchTerm, roleFilter]);

  /** Role is a rank, so it earns a status tone. Matches Developers. */
  const getRoleBadge = (role: string) => {
    const icon = role === 'ADMIN' || role === 'admin' ? "shield-alert"
      : role === 'IT' ? "code"
      : role === 'officer' ? "shield"
      : "user";
    const tone = role === 'ADMIN' || role === 'admin' ? "tone-danger"
      : role === 'IT' || role === 'officer' ? "tone-info"
      : "tone-neutral";
    return (
      <Badge variant="outline" className={tone}>
        <Icon name={icon} size={12} /> {role}
      </Badge>
    );
  };

  if (!isAdmin) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="shield-alert" className="text-destructive mb-4" size={48} />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You do not have admin privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 page-enter">
      <PageHeader
        title="Users"
        description="Manage user accounts, roles, and permissions."
        actions={
          <Dialog open={addDialogOpen} onOpenChange={(open) => {
            setAddDialogOpen(open);
            if (open) setFormData(EMPTY_FORM);
          }}>
            <DialogTrigger asChild>
              <Button><Icon name="plus" className="mr-2" size={16} />Add User</Button>
            </DialogTrigger>
            <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
              <DialogHeader>
                <DialogTitle>Create User</DialogTitle>
                <DialogDescription>Add a new user to the system.</DialogDescription>
              </DialogHeader>
              <UserForm data={formData} onChange={setFormData} />
              <DialogFooter>
                <Button variant="outline" onClick={() => setAddDialogOpen(false)}>Cancel</Button>
                <Button onClick={() => createMutation.mutate(formData)} disabled={createMutation.isPending || !formData.username || !formData.email || !formData.password}>
                  {createMutation.isPending ? "Creating..." : "Create User"}
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        }
      />

      <Card className="surface rounded-lg">
        <CardContent className="p-0">
          <div className="p-4 border-b bg-muted/20 surface-sunken rounded-lg">
            <div className="flex flex-col sm:flex-row gap-3">
              <div className="relative flex-1">
                <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
                <Input placeholder="Search users..." className="pl-9 bg-background w-full" value={searchTerm} onChange={(e) => setSearchTerm(e.target.value)} />
              </div>
              <Select value={roleFilter} onValueChange={setRoleFilter}>
                <SelectTrigger className="w-[140px] bg-background"><SelectValue placeholder="All Roles" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="">All Roles</SelectItem>
                  {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableHead>User</TableHead>
                  <TableHead>Role</TableHead>
                  <TableHead className="hidden sm:table-cell">Department</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead className="w-[50px]"></TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? Array(5).fill(0).map((_, i) => (
                  <TableRow key={i}>
                    <TableCell><div className="flex items-center gap-3"><Skeleton className="h-10 w-10 rounded-full" /><div className="space-y-2"><Skeleton className="h-4 w-32" /><Skeleton className="h-3 w-24" /></div></div></TableCell>
                    <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                    <TableCell className="hidden sm:table-cell"><Skeleton className="h-4 w-24" /></TableCell>
                    <TableCell><Skeleton className="h-5 w-16 rounded-full" /></TableCell>
                    <TableCell><Skeleton className="h-8 w-8 rounded-md" /></TableCell>
                  </TableRow>
                )) : filteredUsers.map((user) => (
                  <TableRow key={user.id} className="group">
                    <TableCell>
                      <div className="flex items-center gap-3">
                        <Avatar className="h-10 w-10 border border-border">
                          <AvatarImage src={user.photoUrl || undefined} alt={user.fullName || user.username} className="object-cover" />
                          <AvatarFallback className="bg-primary/10 text-primary font-semibold">{getInitials(user.fullName || user.username)}</AvatarFallback>
                        </Avatar>
                        <div>
                          <div className="font-medium text-foreground">
                            {user.fullName || user.username}
                            {currentUser?.id === user.id && <span className="ml-2 text-[10px] bg-primary/20 text-primary px-1.5 py-0.5 rounded uppercase font-bold tracking-wider">You</span>}
                          </div>
                          <div className="text-xs text-muted-foreground">{user.email}</div>
                        </div>
                      </div>
                    </TableCell>
                    <TableCell>{getRoleBadge(user.role || "staff")}</TableCell>
                    <TableCell className="hidden sm:table-cell font-medium text-sm text-muted-foreground">{user.department || "—"}</TableCell>
                    <TableCell>
                      {user.isActive ? (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-tone-success-fg"><Icon name="check-circle-2" size={16} /> Active</span>
                      ) : (
                        <span className="flex items-center gap-1.5 text-sm font-medium text-muted-foreground"><Icon name="x-circle" size={16} /> Inactive</span>
                      )}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" className="h-8 w-8 p-0 opacity-0 group-hover:opacity-100 transition-opacity"><span className="sr-only">Menu</span><Icon name="more-horizontal" size={16} /></Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuLabel>Actions</DropdownMenuLabel>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="cursor-pointer" onClick={() => {
                            setEditUser(user);
                            setFormData({
                              username: user.username,
                              email: user.email,
                              password: "",
                              fullName: user.fullName || "",
                              role: user.role || "staff",
                              roles: user.roles?.length ? user.roles : [user.role || "staff"],
                              department: user.department || "",
                              isActive: user.isActive ?? true,
                              permissions: Object.fromEntries(ALL_PERMISSIONS.map(p => [p, user[p] ?? false])),
                            });
                            setEditDialogOpen(true);
                          }}>
                            <Icon name="edit" className="mr-2" size={16} /> Edit
                          </DropdownMenuItem>
                          <DropdownMenuItem className="cursor-pointer" onClick={() => toggleActiveMutation.mutate({ id: user.id, isActive: !user.isActive })}>
                            {user.isActive ? <Icon name="x-circle" className="mr-2" size={16} /> : <Icon name="check-circle-2" className="mr-2" size={16} />}
                            {user.isActive ? "Deactivate" : "Activate"}
                          </DropdownMenuItem>
                          <DropdownMenuSeparator />
                          <DropdownMenuItem className="text-destructive focus:bg-destructive/10 cursor-pointer" disabled={currentUser?.id === user.id} onClick={() => { if (confirm("Delete this user?")) deleteMutation.mutate(user.id) }}>
                            <Icon name="trash-2" className="mr-2" size={16} /> Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={editDialogOpen} onOpenChange={(open) => {
        setEditDialogOpen(open);
        if (!open) { setEditUser(null); setFormData(EMPTY_FORM); }
      }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
            <DialogDescription>Update user profile, role, and permissions.</DialogDescription>
          </DialogHeader>
          <UserForm data={formData} onChange={setFormData} isEdit />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditDialogOpen(false)}>Cancel</Button>
            <Button onClick={() => editUser && updateMutation.mutate({ id: editUser.id, data: formData })} disabled={updateMutation.isPending}>
              {updateMutation.isPending ? "Saving..." : "Save Changes"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function UserForm({ data, onChange, isEdit = false }: { data: UserFormData; onChange: (d: UserFormData) => void; isEdit?: boolean }) {
  const updateField = (field: keyof UserFormData, value: any) => {
    onChange({ ...data, [field]: value });
  };

  const handleRoleChange = (role: string) => {
    updateField("role", role);
    const roles = [role];
    if (role === "ADMIN" || role === "admin") roles.push("officer");
    updateField("roles", roles);
  };

  return (
    <div className="space-y-4 py-2">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Username *</Label>
          <Input placeholder="johndoe" value={data.username} onChange={(e) => updateField("username", e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label>Email *</Label>
          <Input type="email" placeholder="john@example.com" value={data.email} onChange={(e) => updateField("email", e.target.value)} required />
        </div>
      </div>
      {!isEdit && (
        <div className="space-y-2">
          <Label>Password *</Label>
          <Input type="password" placeholder="Min 6 characters" value={data.password} onChange={(e) => updateField("password", e.target.value)} required />
        </div>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Full Name</Label>
          <Input placeholder="John Doe" value={data.fullName} onChange={(e) => updateField("fullName", e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Department</Label>
          <Input placeholder="SIS or JMCS" value={data.department} onChange={(e) => updateField("department", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Role</Label>
          <Select value={data.role} onValueChange={handleRoleChange}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_ROLES.map(r => <SelectItem key={r} value={r}>{r}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Status</Label>
          <Select value={data.isActive ? "active" : "inactive"} onValueChange={(v) => updateField("isActive", v === "active")}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="active">Active</SelectItem>
              <SelectItem value="inactive">Inactive</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="space-y-2">
        <Label>Permissions</Label>
        <div className="grid grid-cols-2 gap-2">
          {ALL_PERMISSIONS.map(p => (
            <label key={p} className="flex items-center gap-2 text-sm">
              <input type="checkbox" checked={data.permissions[p] ?? false} onChange={(e) => {
                const newPerms = { ...data.permissions, [p]: e.target.checked };
                updateField("permissions", newPerms);
              }} />
              <span className="text-muted-foreground">{p.replace(/[A-Z]/g, m => ' ' + m.toLowerCase())}</span>
            </label>
          ))}
        </div>
      </div>
    </div>
  );
}
