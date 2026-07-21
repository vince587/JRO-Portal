import { useState, useEffect } from "react";
import { Link, useLocation } from "wouter";
import { Icon } from "@/components/ui/icon"

import {
  useEmployees,
  useHrisStats,
  useCreateEmployee,
  useUpdateEmployee,
  useDeleteEmployee,
  useUploadHrisDocument,
  useLeaves,
  useUpdateLeaveStatus,
  useMyEmployeeProfile,
  type Employee,
  type EmployeeFormData,
  type LeaveRequest,
} from "@/lib/hooks/use-hris";
import { useGetMe } from "@workspace/api-client-react";
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
import { Calendar } from "@/components/ui/calendar";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
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
import { SaveProgressIndicator } from "@/components/upload-progress";
import { EmployeeForm } from "@/components/hris/EmployeeForm";
import { AttendanceTab } from "@/components/hris/AttendanceTab";

const STATUS_OPTIONS = ["Regular", "Probationary", "Contractual", "Part-Time", "Intern"] as const;

export default function HrisList() {
  const { data: currentUser } = useGetMe();
  const isAdmin = currentUser && (["ADMIN", "admin"].includes(currentUser.role) || currentUser.roles?.some((r: string) => ["ADMIN", "admin"].includes(r)));
  const { data: employees, isLoading, error } = useEmployees({ enabled: isAdmin });
  const { data: myProfile, isLoading: myProfileLoading, error: myProfileError } = useMyEmployeeProfile();
  const { data: stats } = useHrisStats();
  const { data: leaves, isLoading: leavesLoading } = useLeaves();
  const createMutation = useCreateEmployee();
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();
  const uploadMutation = useUploadHrisDocument();
  const updateLeaveStatusMutation = useUpdateLeaveStatus();
  const { toast } = useToast();

  const [searchTerm, setSearchTerm] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [activeTab, setActiveTab] = useState("employees");
  const [leaveView, setLeaveView] = useState<"list" | "calendar">("list");
  const [calMonth, setCalMonth] = useState<Date>(new Date());

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editId, setEditId] = useState<string | null>(null);
  const [formData, setFormData] = useState<EmployeeFormData>({
    userId: "",
    employeeId: "",
    position: "",
    dateHired: "",
    employmentStatus: "Regular",
    contactNumber: "",
    address: "",
    emergencyContact: "",
    emergencyContactNumber: "",
    educationalAttainment: "",
    sssNumber: "",
    tinNumber: "",
    philhealthNumber: "",
    pagibigNumber: "",
  });
  const [deleteConfirm, setDeleteConfirm] = useState<string | null>(null);
  const [users, setUsers] = useState<any[]>([]);

  const [docEmployee, setDocEmployee] = useState<string | null>(null);
  const [docFile, setDocFile] = useState<File | null>(null);

  const fetchUsers = async () => {
    try {
      const res = await fetch("/api/users");
      if (res.ok) setUsers(await res.json());
    } catch {}
  };

  useEffect(() => { fetchUsers(); }, []);

  const userMap = new Map(users.map(u => [String(u.id), u]));

  const userId = currentUser?.id?.toString() || "";
  const userEmployee = isAdmin
    ? (employees?.find(emp => emp.userId === userId) ?? null)
    : (myProfile ?? null);
  const displayEmployees = isAdmin ? employees : (myProfile ? [myProfile] : []);
  const pageLoading = isAdmin ? isLoading : myProfileLoading;
  const pageError = isAdmin ? error : myProfileError;

  // Handle access control
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="loader-2" className="animate-spin text-muted-foreground" size={32} />
      </div>
    );
  }

  // For non-admin users without an employee record, show helpful message
  if (!isAdmin && !userEmployee) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="alert-circle" className="text-muted-foreground mb-4" size={48} />
        <h2 className="text-2xl font-bold">Employee Record Not Found</h2>
        <p className="text-muted-foreground mt-2">
          Your employee record could not be found. Please contact HR to have your profile created.
        </p>
      </div>
    );
  }

  // Filter employees based on user role and search filters
  const filtered = displayEmployees?.filter(emp => {
    // Non-admin users can only see their own record
    if (!isAdmin && emp.userId !== userId) return false;

    const user = userMap.get(emp.userId);
    const name = user?.fullName || user?.username || "";
    const q = searchTerm.toLowerCase();
    const matchesSearch = !searchTerm || name.toLowerCase().includes(q) || emp.employeeId.toLowerCase().includes(q) || emp.position.toLowerCase().includes(q);
    const matchesStatus = !statusFilter || emp.employmentStatus === statusFilter;
    return matchesSearch && matchesStatus;
  }) ?? [];

  const handleOpenAdd = () => {
    setEditId(null);
    setFormData({
      userId: "",
      employeeId: "",
      position: "",
      dateHired: "",
      employmentStatus: "Regular",
      contactNumber: "",
      address: "",
      emergencyContact: "",
      emergencyContactNumber: "",
      educationalAttainment: "",
      sssNumber: "",
      tinNumber: "",
      philhealthNumber: "",
      pagibigNumber: "",
    });
    fetchUsers();
    setDialogOpen(true);
  };

  const handleOpenEdit = (e: Employee) => {
    setEditId(e.id);
    setFormData({
      userId: e.userId,
      employeeId: e.employeeId,
      position: e.position,
      dateHired: e.dateHired,
      employmentStatus: e.employmentStatus,
      contactNumber: e.contactNumber || "",
      address: e.address || "",
      emergencyContact: e.emergencyContact || "",
      emergencyContactNumber: e.emergencyContactNumber || "",
      educationalAttainment: e.educationalAttainment || "",
      sssNumber: e.sssNumber || "",
      tinNumber: e.tinNumber || "",
      philhealthNumber: e.philhealthNumber || "",
      pagibigNumber: e.pagibigNumber || "",
    });
    fetchUsers();
    setDialogOpen(true);
  };

  const handleSave = async () => {
    if (!formData.userId || !formData.employeeId || !formData.position || !formData.dateHired) {
      toast({ title: "Missing fields", description: "Employee, ID, position, and date hired are required.", variant: "destructive" });
      return;
    }
    try {
      if (editId) {
        await updateMutation.mutateAsync({ id: editId, data: formData });
        toast({ title: "Employee updated" });
      } else {
        await createMutation.mutateAsync(formData);
        toast({ title: "Employee created" });
      }
      setDialogOpen(false);
      setEditId(null);
      setFormData({
        userId: "",
        employeeId: "",
        position: "",
        dateHired: "",
        employmentStatus: "Regular",
        contactNumber: "",
        address: "",
        emergencyContact: "",
        emergencyContactNumber: "",
        educationalAttainment: "",
        sssNumber: "",
        tinNumber: "",
        philhealthNumber: "",
        pagibigNumber: "",
      });
    } catch (e: any) {
      toast({ title: "Failed to save", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    if (!deleteConfirm) return;
    try {
      await deleteMutation.mutateAsync(deleteConfirm);
      toast({ title: "Employee record deleted" });
      setDeleteConfirm(null);
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleDocUpload = async () => {
    if (!docEmployee || !docFile) return;
    try {
      await uploadMutation.mutateAsync({ id: docEmployee, file: docFile });
      toast({ title: "Document uploaded", description: docFile.name });
      setDocEmployee(null);
      setDocFile(null);
    } catch (e: any) {
      toast({ title: "Upload failed", description: e.message, variant: "destructive" });
    }
  };

  const handleApproveLeave = async (id: string) => {
    try {
      await updateLeaveStatusMutation.mutateAsync({ id, status: "approved" });
      toast({ title: "Leave approved" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  const handleRejectLeave = async (id: string) => {
    const comment = window.prompt("Reason for rejection (optional):");
    try {
      await updateLeaveStatusMutation.mutateAsync({ id, status: "rejected", approverComment: comment || "" });
      toast({ title: "Leave rejected" });
    } catch (e: any) {
      toast({ title: "Failed", description: e.message, variant: "destructive" });
    }
  };

  // Determine what tabs to show based on user role
  const showFullHRIS = isAdmin;
  const showDocumentsTab = showFullHRIS || (userEmployee && userEmployee.id);

  const visibleLeaves = showFullHRIS ? (leaves ?? []) : (leaves ?? []).filter(l => l.userId === userId);
  const leaveModifiers: { approved: Date[]; pending: Date[]; rejected: Date[] } = { approved: [], pending: [], rejected: [] };
  for (const lv of visibleLeaves) {
    const start = new Date(lv.startDate);
    const end = new Date(lv.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime())) continue;
    const cursor = new Date(start);
    while (cursor <= end) {
      if (lv.status === "approved" || lv.status === "pending" || lv.status === "rejected") {
        leaveModifiers[lv.status].push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
  }
  const leaveModifierStyles = {
    approved: { backgroundColor: "#dcfce7", color: "#166534" },
    pending: { backgroundColor: "#fef9c3", color: "#854d0e" },
    rejected: { backgroundColor: "#fee2e2", color: "#991b1b" },
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="building-2" className="text-primary" size={28} />
            {showFullHRIS ? "HRIS Management" : "My Employee Profile"}
          </h1>
          <p className="text-muted-foreground mt-1">
            {showFullHRIS
              ? "Manage employee records, HR documents, and clerical tasks."
              : "View and update your personal employee information."}
          </p>
        </div>
        {showFullHRIS && (
          <Button onClick={handleOpenAdd}>
            <Icon name="plus" className="mr-2" size={16} /> Add Employee
          </Button>
        )}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        <TabsList>
          {/* Always show employees tab, but content differs based on role */}
          <TabsTrigger value="employees" className="flex items-center gap-2">
            <Icon name="users" size={16} />
            {showFullHRIS ? "Employee Records" : "My Profile"}
          </TabsTrigger>

          {/* Show documents tab only for admins or if user has an employee record */}
          {showDocumentsTab && (
            <TabsTrigger value="documents" className="flex items-center gap-2">
              <Icon name="file-text" size={16} />
              Documents
            </TabsTrigger>
          )}

          {/* Always show leaves tab (users can view their own leave requests) */}
          <TabsTrigger value="leaves" className="flex items-center gap-2">
            <Icon name="calendar-days" size={16} />
            Leave Requests
          </TabsTrigger>

          {/* Show attendance tab for all users */}
          <TabsTrigger value="attendance" className="flex items-center gap-2">
            <Icon name="clock" size={16} />
            Attendance
          </TabsTrigger>

          {/* Show performance tab for all users */}
          <TabsTrigger value="performance" className="flex items-center gap-2">
            <Icon name="bar-chart-3" size={16} />
            Performance
          </TabsTrigger>

          {/* Show overview tab only for admins */}
          {showFullHRIS && (
            <TabsTrigger value="overview" className="flex items-center gap-2">
              <Icon name="bar-chart-3" className="text-primary" size={20} />
              Overview
            </TabsTrigger>
          )}
        </TabsList>

        {/* Employees tab content - shows all employees for admins, only current user for non-admins */}
        <TabsContent value="employees" className="space-y-4">
          <div className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <Input
                placeholder={showFullHRIS ? "Search by name, ID, or position..." : "Search your profile..."}
                className="pl-9 bg-background w-full"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[180px] bg-background"><SelectValue placeholder="All Status" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="">All Status</SelectItem>
                {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          <Card className="neu rounded-2xl">
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      <TableHead>Employee</TableHead>
                      <TableHead>ID</TableHead>
                      <TableHead>Position</TableHead>
                      <TableHead className="hidden md:table-cell">Status</TableHead>
                      <TableHead className="hidden md:table-cell">Date Hired</TableHead>
                      <TableHead className="hidden lg:table-cell">Contact</TableHead>
                      <TableHead className="w-[90px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {pageLoading ? Array(5).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-24" /></TableCell>
                        <TableCell className="hidden lg:table-cell"><Skeleton className="h-5 w-28" /></TableCell>
                        <TableCell><Skeleton className="h-8 w-20 rounded-md" /></TableCell>
                      </TableRow>
                    )) : pageError ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-destructive">
                          <Icon name="alert-circle" className="mx-auto mb-2" size={24} />
                          Failed to load employees. Please try again.
                        </TableCell>
                      </TableRow>
                    ) : filtered.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={7} className="text-center py-12 text-muted-foreground">
                          {searchTerm || statusFilter ?
                            (showFullHRIS
                              ? "No employees match your filters."
                              : "No matching records found in your profile.") :
                            (showFullHRIS
                              ? "No employee records yet. Add your first employee."
                              : "No employee record found. Please contact HR.")}
                        </TableCell>
                      </TableRow>
                    ) : filtered.map(emp => {
                      const user = userMap.get(emp.userId);
                      return (
                        <TableRow key={emp.id} className="group">
                          <TableCell>
                            <div className="flex items-center gap-3">
                              <Avatar className="h-9 w-9 border border-border">
                                <AvatarImage src={(user as any)?.photoUrl || undefined} />
                                <AvatarFallback className="bg-primary/10 text-primary text-xs">
                                  {(user?.fullName || user?.username || "U").split(" ").map((n: string) => n[0]).join("").toUpperCase().substring(0, 2)}
                                </AvatarFallback>
                              </Avatar>
                              <div>
                                <div className="font-medium text-sm">{user?.fullName || user?.username || "Unknown"}</div>
                                <div className="text-xs text-muted-foreground">{user?.email}</div>
                              </div>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-sm">{emp.employeeId}</TableCell>
                          <TableCell className="text-sm">{emp.position}</TableCell>
                          <TableCell className="hidden md:table-cell">
                            <Badge variant="outline" className={
                              emp.employmentStatus === "Regular" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
                              emp.employmentStatus === "Probationary" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400" :
                              "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
                            }>{emp.employmentStatus}</Badge>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground">{emp.dateHired}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">{emp.contactNumber || "—"}</TableCell>
                          <TableCell>
                            <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <Link href={`/hris/${emp.id}`}><Icon name="eye" size={16} /></Link>
                              </Button>
                              {/* Only show edit button for admins or when viewing own profile */}
                              {(showFullHRIS || (!showFullHRIS && emp.userId === userId)) && (
                                <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleOpenEdit(emp)}>
                                  <Icon name="edit" size={16} />
                                </Button>
                              )}
                              {/* Only show delete button for admins */}
                              {showFullHRIS && (
                                <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteConfirm(emp.id)}>
                                  <Icon name="trash-2" size={16} />
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Documents tab content */}
        {showDocumentsTab && (
          <TabsContent value="documents">
            {showFullHRIS ? (
              <Card className="neu rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon name="upload" className="text-muted-foreground" size={20} />
                    HR Document Management
                  </CardTitle>
                  <CardDescription>Upload documents and associate them with employee records.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="flex flex-col sm:flex-row gap-3 items-end">
                    <div className="space-y-2 flex-1">
                      <Label>User Account</Label>
                      {employees && (
                        <Select value={docEmployee || ""} onValueChange={v => setDocEmployee(v)}>
                          <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                          <SelectContent>
                            {employees.map(emp => {
                              const u = userMap.get(emp.userId);
                              return (
                                <SelectItem key={emp.id} value={emp.id}>
                                  {u?.fullName || u?.username || emp.employeeId} ({emp.employeeId})
                                </SelectItem>
                              );
                            })}
                          </SelectContent>
                        </Select>
                      )}
                    </div>
                    <div className="space-y-2">
                      <Label>File</Label>
                      <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={e => setDocFile(e.target.files?.[0] || null)} />
                    </div>
                    <Button onClick={handleDocUpload} disabled={!docEmployee || !docFile || uploadMutation.isPending}>
                      {uploadMutation.isPending ? <Icon name="loader-2" className="animate-spin mr-1" size={16} /> : <Icon name="upload" className="mr-1" size={16} />}
                      Upload
                    </Button>
                  </div>
                  <div className="mt-8 text-center py-8 text-sm text-muted-foreground">
                    <Icon name="file-text" className="mx-auto mb-2 opacity-50" size={32} />
                    <p>Uploaded documents will be stored on the server.</p>
                    <p className="text-xs mt-1">Document listing and per-employee views are available from the employee detail page.</p>
                  </div>
                </CardContent>
              </Card>
            ) : (
              // Non-admin view: show documents associated with current user only
              <Card className="neu rounded-2xl">
                <CardHeader>
                  <CardTitle className="text-lg flex items-center gap-2">
                    <Icon name="upload" className="text-muted-foreground" size={20} />
                    My Documents
                  </CardTitle>
                  <CardDescription>View and upload your HR documents.</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="space-y-4">
                    {/* In a real implementation, we would fetch and display the user's documents here */}
                    <div className="text-center py-8">
                      <Icon name="file-text" className="mx-auto mb-4 opacity-50" size={32} />
                      <p className="text-sm">No documents uploaded yet.</p>
                      <p className="text-xs text-muted-foreground">
                        Upload HR documents using the button below.
                      </p>
                    </div>
                    <div className="space-y-2">
                      <Label>File</Label>
                      <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={e => setDocFile(e.target.files?.[0] || null)} />
                    </div>
                    <Button onClick={handleDocUpload} disabled={!docFile || uploadMutation.isPending}>
                      {uploadMutation.isPending ? <Icon name="loader-2" className="animate-spin mr-1" size={16} /> : <Icon name="upload" className="mr-1" size={16} />}
                      Upload Document
                    </Button>
                  </div>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* Leave requests tab content */}
        <TabsContent value="leaves" className="space-y-4">
          <Card className="neu rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="calendar-days" className="text-muted-foreground" size={20} />
                {showFullHRIS ? "Leave Requests" : "My Leave Requests"}
              </CardTitle>
              <CardDescription>
                {showFullHRIS
                  ? "All employee leave requests submitted via the Employee Dashboard."
                  : "Your leave requests submitted via the Employee Dashboard."}
              </CardDescription>
            </CardHeader>
            <CardContent className="p-0">
              <div className="flex gap-2 px-4 pb-3 pt-1">
                <Button variant={leaveView === "list" ? "secondary" : "outline"} size="sm" onClick={() => setLeaveView("list")}>List</Button>
                <Button variant={leaveView === "calendar" ? "secondary" : "outline"} size="sm" onClick={() => setLeaveView("calendar")}>Calendar</Button>
              </div>
              {leaveView === "calendar" ? (
                <div className="p-4 flex flex-col items-center gap-4">
                  <Calendar
                    month={calMonth}
                    onMonthChange={setCalMonth}
                    modifiers={leaveModifiers}
                    modifiersStyles={leaveModifierStyles}
                  />
                  <div className="flex flex-wrap gap-4 text-xs text-muted-foreground">
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-emerald-200" /> Approved</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-amber-200" /> Pending</span>
                    <span className="flex items-center gap-1"><span className="w-3 h-3 rounded-sm bg-red-200" /> Rejected</span>
                  </div>
                </div>
              ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/10 hover:bg-muted/10">
                      {showFullHRIS && <TableHead>Employee</TableHead>}
                      <TableHead>Type</TableHead>
                      <TableHead>Dates</TableHead>
                      <TableHead>Days</TableHead>
                      <TableHead className="hidden md:table-cell">Reason</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-[120px]"></TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {leavesLoading ? Array(3).fill(0).map((_, i) => (
                      <TableRow key={i}>
                        {showFullHRIS && <TableCell><Skeleton className="h-5 w-28" /></TableCell>}
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                        <TableCell className="hidden md:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                        <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                      </TableRow>
                    )) : !leaves || leaves.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={showFullHRIS ? 8 : 7} className="text-center py-12 text-muted-foreground">
                          <Icon name="calendar-days" className="mx-auto mb-2 opacity-50" size={32} />
                          <p>
                            {showFullHRIS
                              ? "No leave requests yet. Employees can file leaves from the Employee Dashboard."
                              : "You have no leave requests yet. You can submit leave requests from the Employee Dashboard."}
                          </p>
                        </TableCell>
                      </TableRow>
                    ) : leaves
                      // Filter leaves to only show current user's leaves if not admin
                      .filter(leave => showFullHRIS || leave.userId === userId)
                      .map(lv => (
                        <TableRow key={lv.id}>
                          {showFullHRIS && (
                            <TableCell className="text-sm font-medium">{lv.userFullName || lv.userId}</TableCell>
                          )}
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                              {lv.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {lv.startDate} → {lv.endDate}
                          </TableCell>
                          <TableCell className="text-sm">{lv.daysCount}</TableCell>
                          <TableCell className="hidden md:table-cell text-sm text-muted-foreground max-w-[200px] truncate">
                            {lv.reason}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={
                              lv.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
                              lv.status === "rejected" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400" :
                              "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400"
                            }>
                              {lv.status.charAt(0).toUpperCase() + lv.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <Link href={`/hris/leaves/${lv.id}`}><Icon name="printer" size={16} /></Link>
                              </Button>
                              {/* Only show approve/reject buttons for admins */}
                              {showFullHRIS && lv.status === "pending" && (
                                <>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => handleApproveLeave(lv.id)}>
                                    <Icon name="check-circle-2" size={16} />
                                  </Button>
                                  <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleRejectLeave(lv.id)}>
                                    <Icon name="x-circle" size={16} />
                                  </Button>
                                </>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance tab content */}
        <TabsContent value="attendance" className="space-y-4">
          <AttendanceTab isAdmin={!!showFullHRIS} />
        </TabsContent>

        {/* Overview tab content - only for admins */}
        {showFullHRIS && (
          <TabsContent value="overview">
            {stats ? (
              <>
                <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6">
                  <Card className="neu rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Total Employees</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.total}</p></CardContent></Card>
                  <Card className="neu rounded-2xl border-emerald-200 dark:border-emerald-900/50"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-emerald-600 dark:text-emerald-400">Regular</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-emerald-600 dark:text-emerald-400">{stats.regular}</p></CardContent></Card>
                  <Card className="neu rounded-2xl border-amber-200 dark:border-amber-900/50"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-amber-600 dark:text-amber-400">Probationary</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-amber-600 dark:text-amber-400">{stats.probationary}</p></CardContent></Card>
                  <Card className="neu rounded-2xl border-blue-200 dark:border-blue-900/50"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-blue-600 dark:text-blue-400">Contractual</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold text-blue-600 dark:text-blue-400">{stats.contractual}</p></CardContent></Card>
                  <Card className="neu rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Part-Time</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.partTime}</p></CardContent></Card>
                  <Card className="neu rounded-2xl"><CardHeader className="pb-2"><CardTitle className="text-sm font-medium text-muted-foreground">Intern</CardTitle></CardHeader><CardContent><p className="text-3xl font-bold">{stats.intern}</p></CardContent></Card>
                </div>

                <Card className="mt-6 neu rounded-2xl">
                  <CardHeader>
                    <CardTitle className="text-base">Distribution</CardTitle>
                    <CardDescription>Employment status breakdown</CardDescription>
                  </CardHeader>
                  <CardContent>
                    {stats.total > 0 ? (
                      <div className="space-y-3">
                        {([
                          { label: "Regular", value: stats.regular, color: "bg-emerald-500" },
                          { label: "Probationary", value: stats.probationary, color: "bg-amber-500" },
                          { label: "Contractual", value: stats.contractual, color: "bg-blue-500" },
                          { label: "Part-Time", value: stats.partTime, color: "bg-violet-500" },
                          { label: "Intern", value: stats.intern, color: "bg-slate-500" },
                        ] as const).map(({ label, value, color }) => (
                          <div key={label} className="space-y-1">
                            <div className="flex justify-between text-sm">
                              <span>{label}</span>
                              <span className="font-medium">{value} ({Math.round((value / stats.total) * 100)}%)</span>
                            </div>
                            <div className="h-2 bg-muted rounded-full overflow-hidden">
                              <div className={`h-full rounded-full transition-all ${color}`} style={{ width: `${(value / stats.total) * 100}%` }} />
                            </div>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <p className="text-sm text-muted-foreground text-center py-4">No employee data to display.</p>
                    )}
                  </CardContent>
                </Card>
              </>
            ) : (
              <div className="grid gap-6 md:grid-cols-3">
                {Array(3).fill(0).map((_, i) => <Card key={i} className="neu rounded-2xl"><CardHeader className="pb-2"><Skeleton className="h-4 w-24" /></CardHeader><CardContent><Skeleton className="h-8 w-16" /></CardContent></Card>)}
              </div>
            )}
          </TabsContent>
        )}

        {/* Quick Actions tab - show relevant actions based on role */}
        <TabsContent value="overview">
          <Card className="mt-6 neu rounded-2xl">
            <CardHeader>
              <CardTitle className="text-base">Quick Actions</CardTitle>
            </CardHeader>
            <CardContent className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {showFullHRIS && (
                <Button variant="outline" className="justify-start" onClick={handleOpenAdd}>
                  <Icon name="plus" className="mr-2" size={16} /> Add Employee Record
                </Button>
              )}
              <Button variant="outline" className="justify-start" asChild>
                <a href="/activity"><Icon name="alert-circle" className="mr-2" size={16} /> View Activity Log</a>
              </Button>
              <Button variant="outline" className="justify-start" onClick={() => window.location.reload()}>
                <Icon name="users" className="mr-2" size={16} /> Refresh Directory
              </Button>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={dialogOpen} onOpenChange={o => { if (!o) { setDialogOpen(false); setEditId(null); setFormData({
        userId: "",
        employeeId: "",
        position: "",
        dateHired: "",
        employmentStatus: "Regular",
        contactNumber: "",
        address: "",
        emergencyContact: "",
        emergencyContactNumber: "",
        educationalAttainment: "",
        sssNumber: "",
        tinNumber: "",
        philhealthNumber: "",
        pagibigNumber: "",
      }); } }}>
        <DialogContent className="sm:max-w-lg max-h-[85vh]">
          <DialogHeader>
            <DialogTitle>{editId ? "Edit Employee" : "Add Employee"}</DialogTitle>
            <DialogDescription>{editId ? "Update employee HR record." : "Create a new employee HR record."}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[55vh] overflow-y-auto pr-1">
            <EmployeeForm data={formData} onChange={setFormData} users={users} />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setDialogOpen(false); setEditId(null); setFormData({
              userId: "",
              employeeId: "",
              position: "",
              dateHired: "",
              employmentStatus: "Regular",
              contactNumber: "",
              address: "",
              emergencyContact: "",
              emergencyContactNumber: "",
              educationalAttainment: "",
              sssNumber: "",
              tinNumber: "",
              philhealthNumber: "",
              pagibigNumber: "",
            }); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={createMutation.isPending || updateMutation.isPending}>
              <Icon name="save" className="mr-2" size={16} /> {editId ? "Update" : "Create"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!deleteConfirm} onOpenChange={o => { if (!o) setDeleteConfirm(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee Record</AlertDialogTitle>
            <AlertDialogDescription>This will permanently remove this employee's HR record. The user account will not be affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <SaveProgressIndicator saving={createMutation.isPending || updateMutation.isPending} label="Saving..." />
    </div>
  );
}
