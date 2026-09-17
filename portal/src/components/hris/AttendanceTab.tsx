import { useState } from "react";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
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
import { useToast } from "@/hooks/use-toast";
import {
  useAttendanceReport,
  useTimesheets,
  useSubmitTimesheet,
  useReviewTimesheet,
  useAttendance,
  useAdminUpsertAttendance,
  useAdminDeleteAttendance,
} from "@/lib/hooks/use-attendance";
import { useEmployees } from "@/lib/hooks/use-hris";
import { useListUsers } from "@workspace/api-client-react";
import { useState as useReactState } from "react";
import { Link } from "wouter";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function statusBadge(status: string) {
  const cls =
    status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
    status === "rejected" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400" :
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400";
  return <Badge variant="outline" className={cls}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

interface AttendanceTabProps {
  isAdmin: boolean;
}

export function AttendanceTab({ isAdmin }: AttendanceTabProps) {
  const { toast } = useToast();
  const { data: timesheets } = useTimesheets();
  const { data: report } = useAttendanceReport(undefined, undefined, { enabled: isAdmin });
  const submitTimesheet = useSubmitTimesheet();
  const reviewTimesheet = useReviewTimesheet();
  const [timeinOpen, setTimeinOpen] = useReactState(false);

  const [tsDialogOpen, setTsDialogOpen] = useState(false);
  const [tsForm, setTsForm] = useState({ periodStart: "", periodEnd: "" });
  const [tsError, setTsError] = useState("");

  const { data: attendance } = useAttendance(undefined, undefined);
  const { data: employees } = useEmployees({ enabled: isAdmin });
  const { data: users } = useListUsers();
  const upsertAttendance = useAdminUpsertAttendance();
  const deleteAttendance = useAdminDeleteAttendance();

  const [editUserId, setEditUserId] = useState("");
  const [editDate, setEditDate] = useState(format(new Date(), "yyyy-MM-dd"));
  const [editClockIn, setEditClockIn] = useState("");
  const [editClockOut, setEditClockOut] = useState("");

  const userNameFor = (userId: string) => {
    const u = users?.find(usr => String(usr.id) === String(userId));
    return u?.fullName || u?.username || userId;
  };
  const employeeNameFor = (userId: string) => {
    const emp = employees?.find(e => String(e.userId) === String(userId));
    return emp ? `${userNameFor(userId)} (${emp.employeeId})` : userNameFor(userId);
  };

  const editRecords = (attendance || [])
    .filter(r => r.userId === editUserId)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, 10);

  const handleSaveAttendance = async () => {
    if (!editUserId || !editDate) return;
    try {
      await upsertAttendance.mutateAsync({ userId: editUserId, date: editDate, clockIn: editClockIn, clockOut: editClockOut });
      toast({ title: "Time card saved" });
      setEditClockIn("");
      setEditClockOut("");
    } catch (e: any) {
      toast({ title: "Failed to save time card", description: e.message || undefined, variant: "destructive" });
    }
  };

  const loadRecord = (rec: { date: string; clockIn: string | null; clockOut: string | null }) => {
    setEditDate(rec.date);
    setEditClockIn(rec.clockIn ? format(new Date(rec.clockIn), "HH:mm") : "");
    setEditClockOut(rec.clockOut ? format(new Date(rec.clockOut), "HH:mm") : "");
  };

  const handleDeleteAttendance = async (id: string) => {
    if (!window.confirm("Delete this attendance record? This cannot be undone.")) return;
    try {
      await deleteAttendance.mutateAsync(id);
      toast({ title: "Attendance record deleted" });
    } catch (e: any) {
      toast({ title: "Failed to delete record", description: e.message || undefined, variant: "destructive" });
    }
  };

  const handleSubmitTimesheet = async () => {
    if (!tsForm.periodStart || !tsForm.periodEnd) {
      setTsError("Both period start and end are required.");
      return;
    }
    if (tsForm.periodEnd < tsForm.periodStart) {
      setTsError("Period end cannot be before period start.");
      return;
    }
    try {
      await submitTimesheet.mutateAsync(tsForm);
      toast({ title: "Timesheet submitted" });
      setTsDialogOpen(false);
      setTsForm({ periodStart: "", periodEnd: "" });
      setTsError("");
    } catch (e: any) {
      setTsError(e.message || "Failed to submit timesheet");
    }
  };

  const handleReview = async (id: string, status: "approved" | "rejected") => {
    try {
      await reviewTimesheet.mutateAsync({ id, status });
      toast({ title: `Timesheet ${status}` });
    } catch (e: any) {
      toast({ title: "Failed to update timesheet", description: e.message, variant: "destructive" });
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-sm font-medium">Daily Time Record</p>
          <p className="text-xs text-muted-foreground">Print an employee's daily time record sheet.</p>
        </div>
        <Button variant="outline" size="sm" asChild>
          <Link href="/hris/daily-time-record">
            <Icon name="printer" size={16} className="mr-2" /> Daily Time Record
          </Link>
        </Button>
      </div>

      {/* Admin report */}
      {isAdmin && report && report.summary.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
            <div>
              <CardTitle className="text-base">Attendance Summary</CardTitle>
              <CardDescription>Total hours worked per employee across all records.</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => setTimeinOpen(true)}>
              <Icon name="clock" size={16} className="mr-2" /> Time-In Kiosk
            </Button>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  <TableHead>Employee</TableHead>
                  <TableHead>Days Present</TableHead>
                  <TableHead>Total Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {report.summary.map(row => (
                  <TableRow key={row.userId}>
                    <TableCell className="font-medium">{row.userFullName || row.employeeId || row.userId}</TableCell>
                    <TableCell>{row.daysPresent}</TableCell>
                    <TableCell>{row.totalHours}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      )}

      {/* Edit Time Card */}
      {isAdmin && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="clock" size={16} className="text-muted-foreground" />
              Edit Time Card
            </CardTitle>
            <CardDescription>Add or correct an employee's clock-in/out when they forgot to log in. Leave a field blank to clear it.</CardDescription>
          </CardHeader>
          <CardContent className="pt-4 space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <div className="space-y-1">
                <Label>Employee</Label>
                <Select value={editUserId} onValueChange={setEditUserId}>
                  <SelectTrigger className="w-full"><SelectValue placeholder="Select employee…" /></SelectTrigger>
                  <SelectContent>
                    {employees?.map(emp => (
                      <SelectItem key={emp.id} value={emp.userId || emp.id}>{employeeNameFor(emp.userId || emp.id)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label>Date</Label>
                <Input type="date" value={editDate} onChange={e => setEditDate(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Clock In</Label>
                <Input type="time" value={editClockIn} onChange={e => setEditClockIn(e.target.value)} />
              </div>
              <div className="space-y-1">
                <Label>Clock Out</Label>
                <Input type="time" value={editClockOut} onChange={e => setEditClockOut(e.target.value)} />
              </div>
            </div>
            <div className="flex items-center gap-3">
              <Button onClick={handleSaveAttendance} disabled={upsertAttendance.isPending || !editUserId || !editDate}>
                {upsertAttendance.isPending ? "Saving…" : "Save Time Card"}
              </Button>
              {upsertAttendance.isError && <span className="text-sm text-destructive">Failed to save.</span>}
              <span className="text-xs text-muted-foreground">New records use the selected date; editing an existing date updates it.</span>
            </div>

            {editUserId && (
              <div className="border-t pt-3">
                <h4 className="text-sm font-semibold mb-2">Recent records for {editUserId ? employeeNameFor(editUserId) : "—"}</h4>
                <div className="overflow-x-auto">
                  <Table>
                    <TableHeader>
                      <TableRow className="bg-muted/10 hover:bg-muted/10">
                        <TableHead>Date</TableHead>
                        <TableHead>Clock In</TableHead>
                        <TableHead>Clock Out</TableHead>
                        <TableHead>Hours</TableHead>
                        <TableHead className="w-[120px]"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editRecords.length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center py-6 text-muted-foreground">No attendance records for this employee yet.</TableCell>
                        </TableRow>
                      ) : editRecords.map(rec => (
                        <TableRow key={rec.id}>
                          <TableCell className="text-sm whitespace-nowrap">{rec.date}</TableCell>
                          <TableCell className="text-sm">{rec.clockIn ? format(new Date(rec.clockIn), "h:mm a") : "—"}</TableCell>
                          <TableCell className="text-sm">{rec.clockOut ? format(new Date(rec.clockOut), "h:mm a") : "—"}</TableCell>
                          <TableCell className="text-sm">{rec.hoursWorked}h</TableCell>
                          <TableCell>
                            <div className="flex gap-1">
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => loadRecord(rec)}>
                                <Icon name="edit" size={12} className="mr-1" /> Edit
                              </Button>
                              <Button variant="ghost" size="sm" className="h-7 px-2 text-xs text-destructive" onClick={() => handleDeleteAttendance(rec.id)}>
                                <Icon name="trash-2" size={12} className="mr-1" /> Delete
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Timesheets */}
      <Card>
        <CardHeader className="pb-3 border-b flex flex-row items-center justify-between">
          <div>
            <CardTitle className="text-base flex items-center gap-2">
              <Icon name="file-clock" size={16} className="text-muted-foreground" />
              {isAdmin ? "Timesheets" : "My Timesheets"}
            </CardTitle>
            <CardDescription>Submit and track timesheet approvals.</CardDescription>
          </div>
          <Button size="sm" onClick={() => setTsDialogOpen(true)}><Icon name="plus" size={16} className="mr-2" /> Submit Timesheet</Button>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  {isAdmin && <TableHead>Employee</TableHead>}
                  <TableHead>Period</TableHead>
                  <TableHead>Total Hours</TableHead>
                  <TableHead>Status</TableHead>
                  {isAdmin && <TableHead className="w-[100px]"></TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {!timesheets || timesheets.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 3} className="text-center py-12 text-muted-foreground">
                      <Icon name="file-clock" size={32} className="mx-auto mb-2 opacity-50" />
                      <p>No timesheets submitted yet.</p>
                    </TableCell>
                  </TableRow>
                ) : timesheets.map(ts => (
                  <TableRow key={ts.id}>
                    {isAdmin && <TableCell className="text-sm font-medium">{ts.userFullName || ts.employeeId || ts.userId}</TableCell>}
                    <TableCell className="text-sm whitespace-nowrap">{ts.periodStart} → {ts.periodEnd}</TableCell>
                    <TableCell className="text-sm">{ts.totalHours}h</TableCell>
                    <TableCell>{statusBadge(ts.status)}</TableCell>
                    {isAdmin && (
                      <TableCell>
                        {ts.status === "pending" && (
                          <div className="flex gap-1">
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-emerald-600" onClick={() => handleReview(ts.id, "approved")}>
                              <Icon name="check-circle-2" size={16} />
                            </Button>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => handleReview(ts.id, "rejected")}>
                              <Icon name="x-circle" size={16} />
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      <Dialog open={tsDialogOpen} onOpenChange={setTsDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Submit Timesheet</DialogTitle>
            <DialogDescription>Total hours are calculated from your attendance records in the selected period.</DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1">
                <Label>Period Start</Label>
                <Input type="date" value={tsForm.periodStart} onChange={e => setTsForm({ ...tsForm, periodStart: e.target.value })} className="h-9 text-sm" />
              </div>
              <div className="space-y-1">
                <Label>Period End</Label>
                <Input type="date" value={tsForm.periodEnd} onChange={e => setTsForm({ ...tsForm, periodEnd: e.target.value })} className="h-9 text-sm" />
              </div>
            </div>
            {tsError && <p className="text-sm text-destructive">{tsError}</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTsDialogOpen(false)}>Cancel</Button>
            <Button onClick={handleSubmitTimesheet} disabled={submitTimesheet.isPending}>
              {submitTimesheet.isPending ? "Submitting..." : "Submit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={timeinOpen} onOpenChange={setTimeinOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Time-In Kiosk</DialogTitle>
            <DialogDescription>Employees can clock in/out from any computer using this kiosk app.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-sm text-muted-foreground">
              The Time-In Kiosk is a standalone web app that employees can access from any computer.
              It shares the same attendance records as this portal.
            </p>
            <div className="flex items-center gap-2 p-3 bg-muted rounded-lg">
              <Icon name="link" size={16} className="text-muted-foreground" />
              <code className="text-sm">http://localhost:3001</code>
            </div>
            <p className="text-xs text-muted-foreground">
              Deploy the time-in-app to your server and replace the URL above.
            </p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setTimeinOpen(false)}>Close</Button>
            <Button onClick={() => { window.open("http://localhost:3001", "_blank"); setTimeinOpen(false); }}>
              Open Kiosk
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
