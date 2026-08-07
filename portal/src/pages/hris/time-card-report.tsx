import { useState } from "react";
import { format } from "date-fns";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { useTodayAttendance, useAttendance, useClockIn, useClockOut } from "@/lib/hooks/use-attendance";
import { Link } from "wouter";
import { useToast } from "@/hooks/use-toast";

const companyLogos: Record<string, string> = {
  "JMCS": "/JMCS LOGO.png",
  "SIS Certification and Inspection Philippines OPC": "/SIS LOGO.png",
};

const controlNumbers: Record<string, string> = {
  "JMCS": "JMCS-DC-02",
  "SIS Certification and Inspection Philippines OPC": "SISOPC-DC-02",
};

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "h:mm a"); } catch { return "—"; }
}

export default function TimeCardReport() {
  const { toast } = useToast();
  const { data: today, isLoading: todayLoading } = useTodayAttendance();
  const { data: records, isLoading: recordsLoading } = useAttendance();
  const clockIn = useClockIn();
  const clockOut = useClockOut();
  const [company, setCompany] = useState("JMCS");

  const logoUrl = companyLogos[company] || null;
  const controlNo = controlNumbers[company] || "JMCS-DC-02";

  const handleClockIn = async () => {
    try {
      await clockIn.mutateAsync({});
      toast({ title: "Clocked in" });
    } catch (e: any) {
      toast({ title: "Clock in failed", description: e.message, variant: "destructive" });
    }
  };

  const handleClockOut = async () => {
    try {
      await clockOut.mutateAsync({});
      toast({ title: "Clocked out" });
    } catch (e: any) {
      toast({ title: "Clock out failed", description: e.message, variant: "destructive" });
    }
  };

  const clockedIn = today && !today.clockOut;
  const completed = today && today.clockOut;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Button variant="ghost" asChild>
          <a href="/hris"><Icon name="arrow-left" className="mr-2" size={16} /> Back to HRIS</a>
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" asChild>
            <Link href="/hris/daily-time-record">
              <Icon name="file-text" className="mr-2" size={16} /> Daily Time Record
            </Link>
          </Button>
          <Button onClick={() => window.print()}>
            <Icon name="printer" className="mr-2" size={16} /> Print Report
          </Button>
        </div>
      </div>

      <Card className="neu rounded-2xl print:shadow-none print:border print:border-gray-300 print:rounded-none" id="time-card-report">
        <CardHeader className="text-center border-b pb-6 print:pb-4">
          <div className="flex flex-col items-center gap-3">
            {logoUrl && (
              <img src={logoUrl} alt={company} className="h-16 w-auto object-contain" />
            )}
            <div>
              <div className="text-2xl font-bold tracking-tight uppercase">Time Card & Attendance Report</div>
              <p className="text-xs text-muted-foreground mt-1">Control No: {controlNo}</p>
              <p className="text-xs text-muted-foreground">{format(new Date(), "MMMM d, yyyy")}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 print:pt-4 space-y-6">
          {/* Time Card Summary */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-b pb-1">Time Card — Today</h3>
            {todayLoading ? (
              <p className="text-sm text-muted-foreground">Loading…</p>
            ) : (
              <div className="grid sm:grid-cols-2 gap-4 text-sm">
                <div>
                  <span className="text-muted-foreground block text-xs">Date</span>
                  <span className="font-medium">{format(new Date(), "EEEE, MMM d, yyyy")}</span>
                </div>
                <div>
                  <span className="text-muted-foreground block text-xs">Status</span>
                  {today ? (
                    <span className="font-medium">
                      Clocked in at {fmtTime(today.clockIn)}
                      {today.clockOut && <> · out at {fmtTime(today.clockOut)} · <span className="font-medium">{today.hoursWorked}h</span></>}
                    </span>
                  ) : (
                    <span className="font-medium">Not clocked in</span>
                  )}
                </div>
                {today?.clockInLocation && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground block text-xs">Clock In Location</span>
                    <span className="font-medium text-xs">{today.clockInLocation.lat.toFixed(4)}, {today.clockInLocation.lng.toFixed(4)}</span>
                  </div>
                )}
                {today?.clockOutLocation && (
                  <div className="sm:col-span-2">
                    <span className="text-muted-foreground block text-xs">Clock Out Location</span>
                    <span className="font-medium text-xs">{today.clockOutLocation.lat.toFixed(4)}, {today.clockOutLocation.lng.toFixed(4)}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Clock In/Out Buttons */}
          <div className="flex gap-2 no-print">
            <Button onClick={handleClockIn} disabled={clockIn.isPending || !!today}>
              {clockIn.isPending ? <Icon name="loader-2" size={16} className="animate-spin mr-2" /> : <Icon name="log-in" size={16} className="mr-2" />}
              Clock In
            </Button>
            <Button variant="outline" onClick={handleClockOut} disabled={clockOut.isPending || !clockedIn}>
              {clockOut.isPending ? <Icon name="loader-2" size={16} className="animate-spin mr-2" /> : <Icon name="log-out" size={16} className="mr-2" />}
              Clock Out
            </Button>
          </div>

          {completed && <p className="text-xs text-emerald-600">Attendance completed for today.</p>}

          {/* Attendance Records */}
          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-b pb-1">Attendance Records</h3>
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/10 hover:bg-muted/10">
                    <TableHead>Date</TableHead>
                    <TableHead>Clock In</TableHead>
                    <TableHead>Clock Out</TableHead>
                    <TableHead>Hours</TableHead>
                    <TableHead>Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recordsLoading ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">Loading…</TableCell>
                    </TableRow>
                  ) : !records || records.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={5} className="text-center py-12 text-muted-foreground">No attendance records yet.</TableCell>
                    </TableRow>
                  ) : records.map(r => (
                    <TableRow key={r.id}>
                      <TableCell className="text-sm">{r.date}</TableCell>
                      <TableCell className="text-sm">{fmtTime(r.clockIn)}</TableCell>
                      <TableCell className="text-sm">{fmtTime(r.clockOut)}</TableCell>
                      <TableCell className="text-sm">{r.hoursWorked}h</TableCell>
                      <TableCell>
                        <Badge variant="outline" className={
                          r.status === "approved" ? "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400" :
                          r.status === "rejected" ? "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400" :
                          "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400"
                        }>
                          {r.status.charAt(0).toUpperCase() + r.status.slice(1)}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </div>
        </CardContent>
      </Card>

      <style>{`
        @page {
          margin: 0.3in;
          size: auto;
        }
        @media print {
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          .no-print { display: none !important; }
          [data-sidebar] { display: none !important; }
          header { display: none !important; }
          nav, aside, footer { display: none !important; }
          [role="dialog"] { display: none !important; }
          [data-radix-popper-content-wrapper] { display: none !important; }
          .fixed, .absolute { display: none !important; }
          #time-card-report { break-inside: avoid; display: block !important; }
          #time-card-report, #time-card-report * { visibility: visible !important; }
        }
      `}</style>
    </div>
  );
}