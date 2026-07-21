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
  useAttendance,
  useAttendanceReport,
  useTimesheets,
  useSubmitTimesheet,
  useReviewTimesheet,
} from "@/lib/hooks/use-attendance";

function statusBadge(status: string) {
  const cls =
    status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
    status === "rejected" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400" :
    "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400";
  return <Badge variant="outline" className={cls}>{status.charAt(0).toUpperCase() + status.slice(1)}</Badge>;
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "h:mm a"); } catch { return "—"; }
}

interface AttendanceTabProps {
  isAdmin: boolean;
}

export function AttendanceTab({ isAdmin }: AttendanceTabProps) {
  const { toast } = useToast();
  const { data: records, isLoading: recordsLoading } = useAttendance();
  const { data: timesheets } = useTimesheets();
  const { data: report } = useAttendanceReport(undefined, undefined, { enabled: isAdmin });
  const submitTimesheet = useSubmitTimesheet();
  const reviewTimesheet = useReviewTimesheet();

  const [tsDialogOpen, setTsDialogOpen] = useState(false);
  const [tsForm, setTsForm] = useState({ periodStart: "", periodEnd: "" });
  const [tsError, setTsError] = useState("");

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
      {/* Admin report */}
      {isAdmin && report && report.summary.length > 0 && (
        <Card>
          <CardHeader className="pb-3 border-b">
            <CardTitle className="text-base">Attendance Summary</CardTitle>
            <CardDescription>Total hours worked per employee across all records.</CardDescription>
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

      {/* Attendance records */}
      <Card>
        <CardHeader className="pb-3 border-b">
          <CardTitle className="text-base">{isAdmin ? "Attendance Records" : "My Attendance"}</CardTitle>
          <CardDescription>Recent clock in/out history.</CardDescription>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/10 hover:bg-muted/10">
                  {isAdmin && <TableHead>Employee</TableHead>}
                  <TableHead>Date</TableHead>
                  <TableHead>Clock In</TableHead>
                  <TableHead>Clock Out</TableHead>
                  <TableHead>Hours</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recordsLoading ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                  </TableRow>
                ) : !records || records.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 5 : 4} className="text-center py-12 text-muted-foreground">
                      <Icon name="clock" size={32} className="mx-auto mb-2 opacity-50" />
                      <p>No attendance records yet.</p>
                    </TableCell>
                  </TableRow>
                ) : records.map(r => (
                  <TableRow key={r.id}>
                    {isAdmin && <TableCell className="text-sm font-medium">{r.userFullName || r.employeeId || r.userId}</TableCell>}
                    <TableCell className="text-sm">{r.date}</TableCell>
                    <TableCell className="text-sm">{fmtTime(r.clockIn)}</TableCell>
                    <TableCell className="text-sm">{fmtTime(r.clockOut)}</TableCell>
                    <TableCell className="text-sm">{r.hoursWorked}h</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

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
    </div>
  );
}
