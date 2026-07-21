import { useState } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import {
  useMyEmployeeProfile,
  useLeaves,
  useCreateLeave,
  useLeaveBalance,
  LEAVE_TYPES,
  COMPANY_OPTIONS,
  type LeaveRequest,
} from "@/lib/hooks/use-hris";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useToast } from "@/hooks/use-toast";
import { TimeClockCard } from "@/components/hris/TimeClockCard";

const statusColor: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
};

export default function EmployeeDashboard() {
  const { user: currentUser } = useAuth();
  const { data: profile, isLoading: profileLoading } = useMyEmployeeProfile();
  const { data: leaves, isLoading: leavesLoading } = useLeaves();
  const { data: leaveBalance } = useLeaveBalance();
  const createLeaveMutation = useCreateLeave();
  const [, setLocation] = useLocation();
  const { toast } = useToast();

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

  const handleOpenLeaveDialog = () => {
    if (profile) {
      setLeaveForm(prev => ({ ...prev, employeeId: profile.employeeId }));
    }
    setLeaveDialogOpen(true);
  };

  const handleFileLeave = async () => {
    if (!leaveForm.startDate || !leaveForm.endDate || !leaveForm.reason) {
      toast({ title: "Missing fields", description: "All leave fields are required.", variant: "destructive" });
      return;
    }
    if (new Date(leaveForm.endDate) < new Date(leaveForm.startDate)) {
      toast({ title: "Invalid dates", description: "End date cannot be before the start date.", variant: "destructive" });
      return;
    }
    const bal = leaveBalance?.balances.find(b => b.type === leaveForm.type);
    if (bal && leaveForm.daysCount > bal.remaining) {
      toast({ title: "Insufficient balance", description: `You only have ${bal.remaining} day(s) of ${leaveForm.type} leave remaining.`, variant: "destructive" });
      return;
    }
    try {
      await createLeaveMutation.mutateAsync(leaveForm);
      toast({ title: "Leave filed", description: "Your leave request has been submitted." });
      setLeaveDialogOpen(false);
      setLeaveForm({ employeeId: profile?.employeeId || "", type: "Vacation", company: "JMCS", startDate: "", endDate: "", daysCount: 1, reason: "" });
    } catch (e: any) {
      toast({ title: "Failed to file leave", description: e.message, variant: "destructive" });
    }
  };

  const pendingLeaves = leaves?.filter(l => l.status === "pending") ?? [];
  const approvedLeaves = leaves?.filter(l => l.status === "approved") ?? [];

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-3">
          <Avatar className="h-12 w-12 border border-border">
            <AvatarImage src={(currentUser as any)?.photoUrl || undefined} />
            <AvatarFallback className="bg-primary/10 text-primary">
              {(currentUser?.fullName || currentUser?.username || "E").split(" ").map(n => n[0]).join("").toUpperCase().substring(0, 2)}
            </AvatarFallback>
          </Avatar>
          <div>
            <h1 className="text-2xl font-bold tracking-tight">
              Welcome, {currentUser?.fullName || currentUser?.username}
            </h1>
            <p className="text-muted-foreground text-sm">Employee Dashboard</p>
          </div>
        </div>
        <Button onClick={handleOpenLeaveDialog} size="lg">
          <Icon name="calendar-days" className="mr-2" size={16} /> File a Leave
        </Button>
      </div>

      {profileLoading ? (
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Skeleton className="h-64 rounded-lg" />
            <Skeleton className="h-48 rounded-lg" />
          </div>
          <Skeleton className="h-48 rounded-lg" />
        </div>
      ) : !profile ? (
        <Card className="neu rounded-2xl">
          <CardContent className="flex flex-col items-center justify-center py-12">
            <Icon name="shield-alert" className="text-muted-foreground mb-4" size={48} />
            <h2 className="text-xl font-bold">No Employee Record Found</h2>
            <p className="text-muted-foreground mt-2 text-center max-w-md">
              Your user account is not yet linked to an employee record. Please contact the company administrator to set up your HR profile.
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
        <TimeClockCard />
        <div className="grid md:grid-cols-3 gap-6">
          <div className="md:col-span-2 space-y-6">
            <Card className="neu rounded-2xl">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="user" className="text-muted-foreground" size={16} />
                  My Profile
                </CardTitle>
                <CardDescription>Employment details and government numbers</CardDescription>
              </CardHeader>
              <CardContent className="pt-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="hash" size={12} /> Employee ID</Label>
                    <p className="text-sm font-medium">{profile.employeeId}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="briefcase" size={12} /> Position</Label>
                    <p className="text-sm font-medium">{profile.position}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="calendar" size={12} /> Date Hired</Label>
                    <p className="text-sm font-medium">{profile.dateHired}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="badge-check" size={12} /> Status</Label>
                    <Badge variant="outline" className={
                      profile.employmentStatus === "Regular" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
                      profile.employmentStatus === "Probationary" ? "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400" :
                      "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400"
                    }>{profile.employmentStatus}</Badge>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="phone" size={12} /> Contact Number</Label>
                    <p className="text-sm font-medium">{profile.contactNumber || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="map-pin" size={12} /> Address</Label>
                    <p className="text-sm font-medium">{profile.address || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="user" size={12} /> Emergency Contact</Label>
                    <p className="text-sm font-medium">{profile.emergencyContact || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="phone" size={12} /> Emergency #</Label>
                    <p className="text-sm font-medium">{profile.emergencyContactNumber || "—"}</p>
                  </div>
                  <div className="col-span-2 space-y-1">
                    <Label className="text-xs text-muted-foreground flex items-center gap-1"><Icon name="graduation-cap" size={12} /> Educational Attainment</Label>
                    <p className="text-sm font-medium">{profile.educationalAttainment || "—"}</p>
                  </div>
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
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">SSS Number</Label>
                    <p className="text-sm font-medium">{profile.sssNumber || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">TIN Number</Label>
                    <p className="text-sm font-medium">{profile.tinNumber || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">PhilHealth Number</Label>
                    <p className="text-sm font-medium">{profile.philhealthNumber || "—"}</p>
                  </div>
                  <div className="space-y-1">
                    <Label className="text-xs text-muted-foreground">Pag-IBIG Number</Label>
                    <p className="text-sm font-medium">{profile.pagibigNumber || "—"}</p>
                  </div>
                </div>
              </CardContent>
            </Card>

            <Card className="neu rounded-2xl">
              <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <Icon name="calendar-days" className="text-muted-foreground" size={16} />
                    My Leave Requests
                  </CardTitle>
                  <CardDescription>Your submitted leave requests and their status.</CardDescription>
                </div>
                <Button variant="outline" size="sm" onClick={handleOpenLeaveDialog}>
                  <Icon name="plus" className="mr-2" size={16} /> New Leave
                </Button>
              </CardHeader>
              <CardContent className="p-0">
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10 hover:bg-muted/10">
                        <TableHead>Type</TableHead>
                        <TableHead>Dates</TableHead>
                        <TableHead>Days</TableHead>
                        <TableHead className="hidden sm:table-cell">Reason</TableHead>
                        <TableHead>Status</TableHead>
                        <TableHead className="w-[50px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {leavesLoading ? Array(3).fill(0).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell><Skeleton className="h-5 w-20" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-32" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                          <TableCell className="hidden sm:table-cell"><Skeleton className="h-5 w-40" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-20 rounded-full" /></TableCell>
                          <TableCell><Skeleton className="h-5 w-8" /></TableCell>
                        </TableRow>
                      )) : !leaves || leaves.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={6} className="text-center py-12 text-muted-foreground">
                            <Icon name="calendar-days" className="mx-auto mb-2 opacity-50" size={32} />
                            <p>No leave requests yet.</p>
                            <Button variant="link" onClick={handleOpenLeaveDialog} className="mt-2">File your first leave</Button>
                          </TableCell>
                        </TableRow>
                      ) : leaves.map(lv => (
                        <TableRow key={lv.id}>
                          <TableCell>
                            <Badge variant="outline" className="bg-primary/5 text-primary border-primary/20">
                              {lv.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-sm text-muted-foreground whitespace-nowrap">
                            {lv.startDate} → {lv.endDate}
                          </TableCell>
                          <TableCell className="text-sm">{lv.daysCount}</TableCell>
                          <TableCell className="hidden sm:table-cell text-sm text-muted-foreground max-w-[180px] truncate">
                            {lv.reason}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline" className={statusColor[lv.status] || ""}>
                              {lv.status.charAt(0).toUpperCase() + lv.status.slice(1)}
                            </Badge>
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8" asChild>
                              <Link href={`/hris/leaves/${lv.id}`}><Icon name="printer" size={16} /></Link>
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </div>

          <div className="space-y-6">
            <Card className="neu rounded-2xl">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="clock" className="text-muted-foreground" size={16} />
                  Leave Summary
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-3">
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Icon name="clock" className="text-muted-foreground" size={16} />
                    <span className="text-sm font-medium">Pending</span>
                  </div>
                  <span className="text-lg font-bold">{pendingLeaves.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Icon name="badge-check" className="text-muted-foreground" size={16} />
                    <span className="text-sm font-medium">Approved</span>
                  </div>
                  <span className="text-lg font-bold">{approvedLeaves.length}</span>
                </div>
                <div className="flex items-center justify-between p-3 bg-muted/50 rounded-lg border">
                  <div className="flex items-center gap-2">
                    <Icon name="calendar-days" className="text-muted-foreground" size={16} />
                    <span className="text-sm font-medium">Total Filed</span>
                  </div>
                  <span className="text-lg font-bold">{leaves?.length || 0}</span>
                </div>
              </CardContent>
            </Card>

            <Card className="neu rounded-2xl">
              <CardHeader className="pb-3 border-b">
                <CardTitle className="text-base flex items-center gap-2">
                  <Icon name="file-text" className="text-muted-foreground" size={16} />
                  Quick Actions
                </CardTitle>
              </CardHeader>
              <CardContent className="pt-4 space-y-2">
                <Button className="w-full justify-start" onClick={handleOpenLeaveDialog}>
                  <Icon name="calendar-days" className="mr-2" size={16} /> File a Leave
                </Button>
                <Button variant="outline" className="w-full justify-start" onClick={() => {
                  if (leaves?.[0]?.id) {
                    setLocation(`/hris/leaves/${leaves[0].id}`);
                  } else {
                    toast({ title: "No leave requests", description: "You don't have any filed leave required.", variant: "destructive" });
                  }
                }}>
                  <Icon name="printer" className="mr-2" size={16} /> Print Leave Form
                </Button>
                <Button variant="outline" className="w-full justify-start" asChild>
                  <Link href={profile?.id ? `/hris/${profile.id}` : "/hris"}>
                    <Icon name="user" className="mr-2" size={16} /> My Employee Profile
                  </Link>
                </Button>
              </CardContent>
            </Card>
          </div>
        </div>
        </div>
      )}

      <Dialog open={leaveDialogOpen} onOpenChange={o => { if (!o) setLeaveDialogOpen(false); }}>
        <DialogContent className="sm:max-w-md max-h-[75vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>File a Leave Request</DialogTitle>
            <DialogDescription>Submit a leave request for approval.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-1">
            <div className="space-y-2">
              <Label>Employee ID</Label>
              <Input value={leaveForm.employeeId} onChange={e => setLeaveForm(p => ({ ...p, employeeId: e.target.value }))} placeholder="EMP-001" />
            </div>
            <div className="space-y-2">
              <Label>Leave Type</Label>
              <Select value={leaveForm.type} onValueChange={v => setLeaveForm(p => ({ ...p, type: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
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
            <div className="space-y-2">
              <Label>Company</Label>
              <Select value={leaveForm.company} onValueChange={v => setLeaveForm(p => ({ ...p, company: v }))}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {COMPANY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-2">
                <Label>Start Date</Label>
                <Input type="date" value={leaveForm.startDate} onChange={e => setLeaveForm(p => ({ ...p, startDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>End Date</Label>
                <Input type="date" value={leaveForm.endDate} onChange={e => setLeaveForm(p => ({ ...p, endDate: e.target.value }))} />
              </div>
              <div className="space-y-2">
                <Label>Number of Days</Label>
                <Input type="number" min={1} value={leaveForm.daysCount} onChange={e => setLeaveForm(p => ({ ...p, daysCount: Number(e.target.value) }))} />
              </div>
              <div className="space-y-2">
                <Label>Reason</Label>
                <Textarea value={leaveForm.reason} onChange={e => setLeaveForm(p => ({ ...p, reason: e.target.value }))} placeholder="Explain the reason for your leave..." rows={3} />
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLeaveDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleFileLeave} disabled={createLeaveMutation.isPending}>
              {createLeaveMutation.isPending ? <Icon name="loader-2" className="animate-spin mr-2" size={16} /> : <Icon name="calendar-days" className="mr-2" size={16} />}
              Submit Leave
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
