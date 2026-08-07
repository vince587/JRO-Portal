import { useState, useRef } from "react";
import { useRoute, useLocation, Link } from "wouter";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon"
import { z } from "zod";

import { useEmployee, useUpdateEmployee, useDeleteEmployee, useUploadHrisDocument, useEmployeeDocuments, useLeaveBalance, useCreateLeave, useLeaves, LEAVE_TYPES, COMPANY_OPTIONS } from "@/lib/hooks/use-hris";
import { AttendanceTab } from "@/components/hris/AttendanceTab";
import { useGetMe } from "@workspace/api-client-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@/components/ui/tabs";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
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

const STATUS_OPTIONS = ["Regular", "Probationary", "Contractual", "Part-Time", "Intern"] as const;

// Full employee schema (admins)
const employeeFormSchema = z.object({
  employeeId: z.string().min(1, "Employee ID is required"),
  position: z.string().min(1, "Position is required"),
  dateHired: z.string().min(1, "Date hired is required"),
  employmentStatus: z.string().min(1, "Employment status is required"),
  contactNumber: z.string().optional().default(""),
  address: z.string().optional().default(""),
  emergencyContact: z.string().optional().default(""),
  emergencyContactNumber: z.string().optional().default(""),
  educationalAttainment: z.string().optional().default(""),
  sssNumber: z.string().optional().default(""),
  tinNumber: z.string().optional().default(""),
  philhealthNumber: z.string().optional().default(""),
  pagibigNumber: z.string().optional().default(""),
});

// Self-service schema (non-admins can only update these fields)
const selfServiceSchema = z.object({
  contactNumber: z.string().optional().default(""),
  address: z.string().optional().default(""),
  emergencyContact: z.string().optional().default(""),
  emergencyContactNumber: z.string().optional().default(""),
  educationalAttainment: z.string().optional().default(""),
});

export default function HrisEmployeeDetail() {
  const [, params] = useRoute("/hris/:id");
  const [, setLocation] = useLocation();
  const { data: currentUser } = useGetMe();
  const { toast } = useToast();
  const id = params?.id;

  const { data: employee, isLoading } = useEmployee(id);
  const updateMutation = useUpdateEmployee();
  const deleteMutation = useDeleteEmployee();
  const uploadMutation = useUploadHrisDocument();
  const { data: documents } = useEmployeeDocuments(id);
  const { data: leaveBalance } = useLeaveBalance();
  const { data: allLeaves } = useLeaves();
  const createLeaveMutation = useCreateLeave();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [isEditing, setIsEditing] = useState(false);
  const [formData, setFormData] = useState<any>(null);
  const [editErrors, setEditErrors] = useState<Record<string, string>>({});
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [activeTab, setActiveTab] = useState("profile");
  const [leaveDialogOpen, setLeaveDialogOpen] = useState(false);
  const [leaveForm, setLeaveForm] = useState({
    employeeId: "",
    type: "Vacation",
    company: "JMCS",
    startDate: "",
    endDate: "",
    daysCount: 1,
    reason: "",
  });
  const [leaveError, setLeaveError] = useState("");

  // Handle access control
  if (!currentUser) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="alert-circle" className="text-muted-foreground mb-4" size={48} />
        <h2 className="text-2xl font-bold">Loading...</h2>
      </div>
    );
  }

  const isAdmin = currentUser && (["ADMIN", "admin"].includes(currentUser.role) || currentUser.roles?.some((r: string) => ["ADMIN", "admin"].includes(r)));
  const userId = currentUser.id?.toString() || "";

  // For non-admin users, only allow access to their own employee record
  if (!isAdmin && employee) {
    if (employee.userId !== userId) {
      return (
        <div className="flex flex-col items-center justify-center h-[50vh] text-center">
          <Icon name="shield-alert" className="text-destructive mb-4" size={48} />
          <h2 className="text-2xl font-bold">Access Denied</h2>
          <p className="text-muted-foreground mt-2">You can only view your own employee record.</p>
        </div>
      );
    }
  }

  if (isLoading) {
    return (
      <div className="space-y-6 animate-in fade-in duration-500 p-6">
        <Skeleton className="h-8 w-48" />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-48 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
          <Skeleton className="h-48 rounded-lg" />
        </div>
      </div>
    );
  }

  if (!employee) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="alert-circle" className="text-muted-foreground mb-4" size={48} />
        <h2 className="text-2xl font-bold">Employee Not Found</h2>
        <p className="text-muted-foreground mt-2">This employee record does not exist.</p>
        <Button variant="outline" className="mt-4" asChild><Link href="/">Back to Home</Link></Button>
      </div>
    );
  }

  const handleEdit = () => {
    if (isAdmin) {
      setFormData({
        employeeId: employee.employeeId,
        position: employee.position,
        dateHired: employee.dateHired,
        employmentStatus: employee.employmentStatus,
        contactNumber: employee.contactNumber || "",
        address: employee.address || "",
        emergencyContact: employee.emergencyContact || "",
        emergencyContactNumber: employee.emergencyContactNumber || "",
        educationalAttainment: employee.educationalAttainment || "",
        sssNumber: employee.sssNumber || "",
        tinNumber: employee.tinNumber || "",
        philhealthNumber: employee.philhealthNumber || "",
        pagibigNumber: employee.pagibigNumber || "",
      });
    } else {
      setFormData({
        contactNumber: employee.contactNumber || "",
        address: employee.address || "",
        emergencyContact: employee.emergencyContact || "",
        emergencyContactNumber: employee.emergencyContactNumber || "",
        educationalAttainment: employee.educationalAttainment || "",
      });
    }
    setEditErrors({});
    setIsEditing(true);
  };

  const handleSave = async () => {
    if (!formData) return;
    const schema = isAdmin ? employeeFormSchema : selfServiceSchema;
    const parsed = schema.safeParse(formData);
    if (!parsed.success) {
      const errs: Record<string, string> = {};
      for (const issue of parsed.error.issues) {
        const key = String(issue.path[0]);
        if (!errs[key]) errs[key] = issue.message;
      }
      setEditErrors(errs);
      toast({ title: "Please fix the highlighted fields", variant: "destructive" });
      return;
    }
    try {
      await updateMutation.mutateAsync({ id: employee.id, data: formData });
      toast({ title: "Employee updated" });
      setIsEditing(false);
      setFormData(null);
      setEditErrors({});
    } catch (e: any) {
      toast({ title: "Failed to update", description: e.message, variant: "destructive" });
    }
  };

  const handleDelete = async () => {
    try {
      await deleteMutation.mutateAsync(employee.id);
      toast({ title: "Employee record deleted" });
      setLocation("/hris");
    } catch {
      toast({ title: "Failed to delete", variant: "destructive" });
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      await uploadMutation.mutateAsync({ id: employee.id, file });
      toast({ title: "Document uploaded", description: file.name });
    } catch (err: any) {
      toast({ title: "Upload failed", description: err.message, variant: "destructive" });
    }
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleOpenLeaveDialog = () => {
    if (employee) {
      setLeaveForm(prev => ({ ...prev, employeeId: employee.employeeId }));
    }
    setLeaveError("");
    setLeaveDialogOpen(true);
  };

  const handleFileLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason.trim()) {
      setLeaveError("Start date, end date, and reason are required.");
      return;
    }
    if (new Date(leaveForm.endDate) < new Date(leaveForm.startDate)) {
      setLeaveError("End date cannot be before the start date.");
      return;
    }
    const bal = leaveBalance?.balances.find(b => b.type === leaveForm.type);
    if (bal && leaveForm.daysCount > bal.remaining) {
      setLeaveError(`You only have ${bal.remaining} day(s) of ${leaveForm.type} leave remaining.`);
      return;
    }
    try {
      await createLeaveMutation.mutateAsync(leaveForm);
      toast({ title: "Leave filed", description: "Your leave request has been submitted." });
      setLeaveDialogOpen(false);
      setLeaveForm({ employeeId: employee?.employeeId || "", type: "Vacation", company: "JMCS", startDate: "", endDate: "", daysCount: 1, reason: "" });
    } catch (e: any) {
      setLeaveError(e.message || "Failed to file leave");
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case "Regular":
        return <Badge variant="outline" className="bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400">Regular</Badge>;
      case "Probationary":
        return <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">Probationary</Badge>;
      default:
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400">{status}</Badge>;
    }
  };

  const Field = ({ label, value, icon }: { label: string; value: string; icon?: string }) => (
    <div className="space-y-1">
      <Label className="text-xs text-muted-foreground flex items-center gap-1">
        {icon && <Icon name={icon} size={12} />}
        {label}
      </Label>
      <p className="text-sm font-medium">{value || "—"}</p>
    </div>
  );

  const EditField = ({ field, label, type }: { field: string; label: string; type?: string }) => {
    const error = editErrors[field];
    const value = formData?.[field] ?? "";
    return (
      <div className="space-y-1">
        <Label className="text-xs text-muted-foreground">{label}</Label>
        {field === "employmentStatus" ? (
          <Select value={value} onValueChange={v => setFormData({ ...formData, [field]: v })}>
            <SelectTrigger className={error ? "h-9 text-sm border-destructive" : "h-9 text-sm"}><SelectValue /></SelectTrigger>
            <SelectContent>
              {STATUS_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        ) : field === "dateHired" ? (
          <Input type="date" value={value} onChange={e => setFormData({ ...formData, [field]: e.target.value })} className={error ? "h-9 text-sm border-destructive" : "h-9 text-sm"} />
        ) : (
          <Input value={value} onChange={e => setFormData({ ...formData, [field]: e.target.value })} className={error ? "h-9 text-sm border-destructive" : "h-9 text-sm"} type={type || "text"} />
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-in fade-in duration-500 p-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-4">
          <div>
            <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
              <Icon name="building-2" className="text-primary" size={24} />
              Employee Profile
            </h1>
            <p className="text-sm text-muted-foreground">{employee.employeeId}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {/* Only show edit button for admins or when viewing own profile */}
          {(isAdmin || (!isAdmin && employee.userId === userId)) && (
            <>
              {isEditing ? (
                <>
                  <Button variant="outline" onClick={() => { setIsEditing(false); setFormData(null); }}>Cancel</Button>
                  <Button onClick={handleSave} disabled={updateMutation.isPending}>
                    {updateMutation.isPending ? "Saving..." : "Save Changes"}
                  </Button>
                </>
              ) : (
                <>
                  <Button variant="outline" onClick={handleEdit}><Icon name="save" className="mr-2" size={16} /> Edit</Button>
                  <Button variant="outline" asChild>
                    <Link href={`/hris/daily-time-record/${employee.id}`}>
                      <Icon name="printer" className="mr-2" size={16} /> Daily Time Record
                    </Link>
                  </Button>
                  {/* Only show delete button for admins */}
                  {isAdmin && (
                    <Button variant="destructive" size="icon" onClick={() => setDeleteOpen(true)}><Icon name="trash-2" size={16} /></Button>
                  )}
                </>
              )}
            </>
          )}
          {/* Show delete button only for admins */}
          {isAdmin && !isEditing && (
            <Button variant="destructive" size="icon" onClick={() => setDeleteOpen(true)}><Icon name="trash-2" size={16} /></Button>
          )}
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="grid w-full grid-cols-3 gap-1">
          <TabsTrigger value="profile" className="flex-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-muted">
            <Icon name="user" className="mr-2" size={16} /> Profile
          </TabsTrigger>
          <TabsTrigger value="leave" className="flex-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-muted">
            <Icon name="calendar-days" className="mr-2" size={16} /> Leave
          </TabsTrigger>
          <TabsTrigger value="attendance" className="flex-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-muted">
            <Icon name="clock" className="mr-2" size={16} /> Attendance
          </TabsTrigger>
          <TabsTrigger value="benefits" className="flex-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-muted">
            <Icon name="heart" className="mr-2" size={16} /> Benefits
          </TabsTrigger>
          <TabsTrigger value="tax" className="flex-1 px-4 py-2 text-sm font-medium rounded-md hover:bg-muted">
            <Icon name="hash" className="mr-2" size={16} /> Tax Info
          </TabsTrigger>
        </TabsList>

        {/* Profile Tab */}
        <TabsContent value="profile" className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-6">
              <Card className="neu rounded-2xl">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon name="user" className="text-muted-foreground" size={16} />
                    Personal Information
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="Employee ID" value={employee.employeeId} icon="hash" />
                    <Field label="Position" value={employee.position} icon="briefcase" />
                    <Field label="Date Hired" value={employee.dateHired} icon="calendar" />
                    <div>
                      <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="alert-circle" size={12} /> Status</Label>
                      <div className="mt-1">{getStatusBadge(employee.employmentStatus)}</div>
                    </div>
                    <Field label="Contact Number" value={employee.contactNumber || "—"} icon="phone" />
                    <div className="col-span-2">
                      <Field label="Address" value={employee.address || "—"} icon="map-pin" />
                    </div>
                    <Field label="Emergency Contact" value={employee.emergencyContact || "—"} icon="user" />
                    <Field label="Emergency Contact #" value={employee.emergencyContactNumber || "—"} icon="phone" />
                    <div className="col-span-2">
                      <Field label="Educational Attainment" value={employee.educationalAttainment || "—"} icon="graduation-cap" />
                    </div>
                    <Field label="Created" value={employee.createdAt ? format(new Date(employee.createdAt), "MMM d, yyyy") : "—"} icon="calendar" />
                    <Field label="Updated" value={employee.updatedAt ? format(new Date(employee.updatedAt), "MMM d, yyyy") : "—"} icon="calendar" />
                  </div>
                </CardContent>
              </Card>

              <Card className="neu rounded-2xl">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon name="heart" className="text-muted-foreground" size={16} />
                    Government Numbers
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="grid grid-cols-2 gap-4">
                    <Field label="SSS Number" value={employee.sssNumber || "—"} />
                    <Field label="TIN Number" value={employee.tinNumber || "—"} />
                    <Field label="PhilHealth Number" value={employee.philhealthNumber || "—"} />
                    <Field label="Pag-IBIG Number" value={employee.pagibigNumber || "—"} />
                  </div>
                </CardContent>
              </Card>
            </div>

            <div className="space-y-6">
              <Card className="neu rounded-2xl">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon name="user" className="text-muted-foreground" size={16} />
                    User Account
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  <p className="text-sm text-muted-foreground">Linked user ID: <span className="font-mono text-xs">{employee.userId}</span></p>
                  <Button variant="outline" size="sm" className="mt-3 w-full" asChild>
                    <Link href={`/developers`}><Icon name="external-link" className="mr-2" size={12} /> View in Users</Link>
                  </Button>
                </CardContent>
              </Card>

              <Card className="neu rounded-2xl">
                <CardHeader className="pb-3 border-b">
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon name="file-text" className="text-muted-foreground" size={16} />
                    Employee Documents
                  </CardTitle>
                  <CardDescription>Upload and manage HR documents for this employee.</CardDescription>
                </CardHeader>
                <CardContent className="pt-4">
                  <div className="space-y-4">
                    <div className="flex flex-col sm:flex-row gap-3 items-end">
                      <div className="space-y-2 flex-1">
                        <Label>Document Type</Label>
                        <Select value="pdf" onValueChange={() => {}} disabled>
                          <SelectTrigger><SelectValue placeholder="Select type" /></SelectTrigger>
                          <SelectContent>
                            <SelectItem value="pdf">PDF</SelectItem>
                            <SelectItem value="doc">Word Document</SelectItem>
                            <SelectItem value="image">Image</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                      <div className="space-y-2">
                        <Label>File</Label>
                        <Input type="file" accept=".pdf,.doc,.docx,.xls,.xlsx,.jpg,.jpeg,.png" onChange={handleFileUpload} />
                      </div>
                      <Button onClick={() => fileInputRef.current?.click()} disabled={uploadMutation.isPending}>
                        {uploadMutation.isPending ? <Icon name="loader-2" className="animate-spin mr-1" size={16} /> : <Icon name="upload" className="mr-1" size={16} />}
                        Upload Document
                      </Button>
                    </div>
                    <div className="mt-4">
                      <div className="overflow-x-auto">
                        <table className="w-full text-sm text-left text-muted-foreground">
                          <thead className="bg-muted/50">
                            <tr>
                              <th className="p-2 text-left">Document Name</th>
                              <th className="p-2 text-left">Type</th>
                              <th className="p-2 text-left">Size</th>
                              <th className="p-2 text-left">Uploaded</th>
                              <th className="p-2 text-left">Actions</th>
                            </tr>
                          </thead>
                          <tbody>
                            {documents && documents.length > 0 ? (
                              documents.map(doc => (
                                <tr key={doc.id} className="border-b hover:bg-muted/50">
                                  <td className="p-2">{doc.filename}</td>
                                  <td className="p-2 uppercase">{doc.type}</td>
                                  <td className="p-2">{(doc.size / 1024).toFixed(1)} KB</td>
                                  <td className="p-2">{doc.uploadedAt ? format(new Date(doc.uploadedAt), "MMM d, yyyy") : "—"}</td>
                                  <td className="p-2 flex space-x-2">
                                    <Button variant="ghost" size="icon" asChild>
                                      <a href={`/api/hris/documents/${doc.id}/download`} target="_blank" rel="noreferrer"><Icon name="eye" size={16} /></a>
                                    </Button>
                                    <Button variant="ghost" size="icon" asChild>
                                      <a href={`/api/hris/documents/${doc.id}/download`} download={doc.filename}><Icon name="download" size={16} /></a>
                                    </Button>
                                  </td>
                                </tr>
                              ))
                            ) : (
                              <tr>
                                <td colSpan={5} className="p-4 text-center text-muted-foreground">
                                  No documents uploaded yet.
                                </td>
                              </tr>
                            )}
                          </tbody>
                        </table>
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            </div>
          </div>
        </TabsContent>

        {/* Leave Tab */}
        <TabsContent value="leave" className="space-y-4">
          <Card className="neu rounded-2xl">
            <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-lg flex items-center gap-2">
                  <Icon name="calendar-days" className="text-muted-foreground" size={20} />
                  Leave Balances
                </CardTitle>
                <CardDescription>Your remaining leave entitlement for the year.</CardDescription>
              </div>
              <Button onClick={handleOpenLeaveDialog}><Icon name="plus" className="mr-2" size={16} /> Request Time Off</Button>
            </CardHeader>
            <CardContent className="pt-4">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                {leaveBalance?.balances.map((b) => (
                  <div key={b.type} className="rounded-lg border p-3">
                    <p className="text-xs text-muted-foreground">{b.type}</p>
                    <p className="text-xl font-bold mt-1">{b.remaining}<span className="text-xs font-normal text-muted-foreground"> / {b.entitlement}</span></p>
                    <p className="text-xs text-muted-foreground mt-1">{b.used} used</p>
                  </div>
                ))}
                {!leaveBalance && (
                  <p className="col-span-full text-sm text-muted-foreground">Loading balances…</p>
                )}
              </div>
              {leaveBalance && leaveBalance.pending.length > 0 && (
                <div className="mt-4">
                  <p className="text-sm font-medium mb-2">Pending Requests</p>
                  <ul className="space-y-1">
                    {leaveBalance.pending.map((lv) => (
                      <li key={lv.id} className="text-sm flex items-center gap-2 text-muted-foreground">
                        <Badge variant="outline">{lv.type}</Badge>
                        <span>{lv.startDate} → {lv.endDate}</span>
                        <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400">pending</Badge>
                      </li>
                    ))}
                  </ul>
                </div>
              )}
            </CardContent>
          </Card>

          <Card className="neu rounded-2xl">
            <CardHeader className="pb-3 border-b">
              <CardTitle className="text-base flex items-center gap-2">
                <Icon name="calendar-days" className="text-muted-foreground" size={16} />
                Leave History
              </CardTitle>
              <CardDescription>All your leave requests and their status.</CardDescription>
            </CardHeader>
            <CardContent className="pt-4">
              {(() => {
                const myLeaves = (allLeaves ?? []).filter(l => l.userId === employee.userId);
                if (myLeaves.length === 0) {
                  return <p className="text-sm text-muted-foreground">No leave requests yet.</p>;
                }
                return (
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm text-left text-muted-foreground">
                      <thead className="bg-muted/50">
                        <tr>
                          <th className="p-2 text-left">Type</th>
                          <th className="p-2 text-left">Dates</th>
                          <th className="p-2 text-left">Days</th>
                          <th className="p-2 text-left">Status</th>
                          <th className="p-2 text-left">Actions</th>
                        </tr>
                      </thead>
                      <tbody>
                        {myLeaves.map(lv => (
                          <tr key={lv.id} className="border-b hover:bg-muted/50">
                            <td className="p-2"><Badge variant="outline">{lv.type}</Badge></td>
                            <td className="p-2 whitespace-nowrap">{lv.startDate} → {lv.endDate}</td>
                            <td className="p-2">{lv.daysCount}</td>
                            <td className="p-2">
                              <Badge variant="outline" className={
                                lv.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
                                lv.status === "rejected" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400" :
                                "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400"
                              }>
                                {lv.status.charAt(0).toUpperCase() + lv.status.slice(1)}
                              </Badge>
                            </td>
                            <td className="p-2">
                              <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                                <a href={`/hris/leaves/${lv.id}`} target="_blank" rel="noreferrer"><Icon name="printer" size={16} /></a>
                              </Button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Attendance Tab */}
        <TabsContent value="attendance" className="space-y-4">
          <AttendanceTab isAdmin={!!isAdmin} />
        </TabsContent>

        {/* Benefits Tab */}
        <TabsContent value="benefits" className="space-y-4">
          <Card className="neu rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="heart" className="text-muted-foreground" size={20} />
                Benefits Information
              </CardTitle>
              <CardDescription>View your employee benefits and enrollment information.</CardDescription>
            </CardHeader>
            <CardContent className="text-center py-8">
              <Icon name="heart" className="mx-auto mb-4 text-muted-foreground" size={48} />
              <p className="text-lg font-medium">Benefits information coming soon.</p>
              <p className="text-muted-foreground mt-2">
                This section will display your health insurance, retirement plans, and other employee benefits.
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Tax Information Tab */}
        <TabsContent value="tax" className="space-y-4">
          <Card className="neu rounded-2xl">
            <CardHeader>
              <CardTitle className="text-lg flex items-center gap-2">
                <Icon name="hash" className="text-muted-foreground" size={20} />
                Tax Information
              </CardTitle>
              <CardDescription>View your tax withholding and related information.</CardDescription>
            </CardHeader>
            <CardContent className="text-center py-8">
              <Icon name="hash" className="mx-auto mb-4 text-muted-foreground" size={48} />
              <p className="text-lg font-medium">Tax information coming soon.</p>
              <p className="text-muted-foreground mt-2">
                This section will display your W-4 information, tax withholdings, and year-end tax documents.
              </p>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Employee Record</AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently remove this employee's HR record. The user account will not be affected.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} className="bg-destructive text-destructive-foreground hover:bg-destructive/90" disabled={deleteMutation.isPending}>
              {deleteMutation.isPending ? "Deleting..." : "Delete Record"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={isEditing} onOpenChange={(o) => {
        if (!o) { setIsEditing(false); setFormData(null); setEditErrors({}); }
      }}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Edit Employee Profile</DialogTitle>
            <DialogDescription>{isAdmin ? "Update employment and personal details." : "Update your personal contact information."}</DialogDescription>
          </DialogHeader>
          <div className="space-y-6">
            {isAdmin && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Employment</h3>
                <div className="grid grid-cols-2 gap-4">
                  <EditField field="employeeId" label="Employee ID" />
                  <EditField field="position" label="Position" />
                  <EditField field="dateHired" label="Date Hired" type="date" />
                  <EditField field="employmentStatus" label="Employment Status" />
                </div>
              </section>
            )}
            <section>
              <h3 className="text-sm font-semibold mb-2">Personal & Contact</h3>
              <div className="grid grid-cols-2 gap-4">
                <EditField field="contactNumber" label="Contact Number" />
                <EditField field="emergencyContact" label="Emergency Contact" />
                <EditField field="emergencyContactNumber" label="Emergency Contact #" />
                <EditField field="educationalAttainment" label="Educational Attainment" />
                <div className="col-span-2"><EditField field="address" label="Address" /></div>
              </div>
            </section>
            {isAdmin && (
              <section>
                <h3 className="text-sm font-semibold mb-2">Government Numbers</h3>
                <div className="grid grid-cols-2 gap-4">
                  <EditField field="sssNumber" label="SSS Number" />
                  <EditField field="tinNumber" label="TIN Number" />
                  <EditField field="philhealthNumber" label="PhilHealth Number" />
                  <EditField field="pagibigNumber" label="Pag-IBIG Number" />
                </div>
              </section>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setIsEditing(false); setFormData(null); setEditErrors({}); }}>Cancel</Button>
            <Button onClick={handleSave} disabled={updateMutation.isPending}>{updateMutation.isPending ? "Saving..." : "Save Changes"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={leaveDialogOpen} onOpenChange={setLeaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Request Time Off</DialogTitle>
            <DialogDescription>Submit a leave request for approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Leave Type</Label>
                <Select value={leaveForm.type} onValueChange={v => setLeaveForm({ ...leaveForm, type: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {LEAVE_TYPES.map(t => <SelectItem key={t} value={t}>{t}</SelectItem>)}
                  </SelectContent>
                </Select>
                {leaveBalance?.balances.find(b => b.type === leaveForm.type) && (
                  <p className="text-xs text-muted-foreground">
                    {leaveBalance.balances.find(b => b.type === leaveForm.type)!.remaining} day(s) remaining
                  </p>
                )}
              </div>
              <div className="space-y-1">
                <Label>Company</Label>
                <Select value={leaveForm.company} onValueChange={v => setLeaveForm({ ...leaveForm, company: v })}>
                  <SelectTrigger className="h-9 text-sm"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {COMPANY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Start Date</Label>
                <Input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm({ ...leaveForm, startDate: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label>End Date</Label>
                <Input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm({ ...leaveForm, endDate: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>Number of Days</Label>
              <Input type="number" min={1} value={leaveForm.daysCount} onChange={e => setLeaveForm({ ...leaveForm, daysCount: Number(e.target.value) })} className="h-9 text-sm" />
            </div>
            <div className="space-y-1">
              <Label>Reason</Label>
              <Input value={leaveForm.reason} onChange={e => setLeaveForm({ ...leaveForm, reason: e.target.value })} className="h-9 text-sm" />
            </div>
            {leaveError && <p className="text-sm text-destructive">{leaveError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleFileLeave} disabled={createLeaveMutation.isPending}>{createLeaveMutation.isPending ? "Submitting..." : "Submit Request"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
