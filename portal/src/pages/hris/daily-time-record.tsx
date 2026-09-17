import { useState, useMemo, useEffect } from "react";
import { format, parseISO, eachDayOfInterval, getDay } from "date-fns";
import { useRoute, useLocation } from "wouter";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent } from "@/components/ui/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useTodayAttendance, useAttendance, usePayrollPeriods, useCreatePayrollPeriod, useDeletePayrollPeriod, useOfficialHours } from "@/lib/hooks/use-attendance";
import { useEmployee, useEmployees, useMyEmployeeProfile } from "@/lib/hooks/use-hris";
import { useGetMe, useListUsers } from "@workspace/api-client-react";
import type { Employee } from "@/lib/hooks/use-hris";

const controlNumbers: Record<string, string> = {
  "JMCS": "JMCS-DC-03",
  "SIS Certification and Inspection Philippines OPC": "SISOPC-DC-03",
};

const PH_HOLIDAYS: Record<string, string> = {
  "2026-01-01": "New Year's Day",
  "2026-02-17": "Chinese New Year",
  "2026-02-25": "EDSA Revolution Anniversary",
  "2026-04-02": "Maundy Thursday",
  "2026-04-03": "Good Friday",
  "2026-04-04": "Black Saturday",
  "2026-04-09": "Araw ng Kagitingan",
  "2026-05-01": "Labor Day",
  "2026-06-12": "Independence Day",
  "2026-08-21": "Ninoy Aquino Day",
  "2026-08-31": "National Heroes Day",
  "2026-11-01": "All Saints' Day",
  "2026-11-02": "All Souls' Day",
  "2026-11-30": "Bonifacio Day",
  "2026-12-08": "Feast of the Immaculate Conception",
  "2026-12-24": "Christmas Eve",
  "2026-12-25": "Christmas Day",
  "2026-12-30": "Rizal Day",
  "2026-12-31": "Last Day of the Year",
};

export interface OfficialConfig {
  regular: { arrival: string; departure: string; hours: number };
  saturday: { arrival: string; departure: string; hours: number };
}

const DEFAULT_OFFICIAL_HOURS: OfficialConfig = {
  regular: { arrival: "08:30", departure: "17:30", hours: 8 },
  saturday: { arrival: "08:30", departure: "12:00", hours: 4 },
};

const NINE_AM_START_EMPLOYEES = ["jonas", "vince", "earvin", "charlene"];

const LATE_GRACE_MINUTES = 5;

const WORK_DAY_END: Record<string, string> = {
  "08:30": "17:30",
  "09:00": "18:00",
};

function defaultArrivalFor(employeeName: string, position: string): string {
  if (position?.trim().toLowerCase() === "admin") return "09:00";
  const first = employeeName.trim().toLowerCase().split(/\s+/)[0] ?? "";
  return NINE_AM_START_EMPLOYEES.includes(first) ? "09:00" : "08:30";
}

function defaultDepartureFor(employeeName: string, position: string): string {
  return WORK_DAY_END[defaultArrivalFor(employeeName, position)] || "17:30";
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "h:mm a"); } catch { return "—"; }
}

function fmtTimeShort(iso: string | null): string {
  if (!iso) return "";
  try { return format(new Date(iso), "h:mm a"); } catch { return ""; }
}

function fmtHm(hhmm: string): string {
  const [h, m] = hhmm.split(":").map(Number);
  const ampm = h >= 12 ? "PM" : "AM";
  const hour12 = h % 12 === 0 ? 12 : h % 12;
  return `${hour12}:${String(m).padStart(2, "0")} ${ampm}`;
}

function computeLate(clockIn: string | null, isSaturday: boolean, official: OfficialConfig): string {
  if (!clockIn) return "—";
  const arrival = isSaturday ? official.saturday.arrival : official.regular.arrival;
  const [oh, om] = arrival.split(":").map(Number);
  const clockInDate = parseISO(clockIn);
  const clockInMinutes = clockInDate.getHours() * 60 + clockInDate.getMinutes();
  const officialMinutes = oh * 60 + om;
  const diff = clockInMinutes - officialMinutes - LATE_GRACE_MINUTES;
  if (diff <= 0) return "0h 0m";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}

function fmtTotalHm(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function computeUndertime(clockIn: string | null, clockOut: string | null, isSaturday: boolean, official: OfficialConfig): string {
  if (!clockIn || !clockOut) return "—";
  const config = isSaturday ? official.saturday : official.regular;
  const expectedMinutes = config.hours * 60;
  const clockInDate = parseISO(clockIn);
  const clockOutDate = parseISO(clockOut);
  const actualMinutes = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60);
  const diff = Math.round(expectedMinutes - actualMinutes);
  if (diff <= 0) return "0h 0m";
  const h = Math.floor(diff / 60);
  const m = diff % 60;
  return `${h}h ${m}m`;
}

export default function DailyTimeRecord() {
  const [, params] = useRoute("/hris/daily-time-record/:id");
  const [, setLocation] = useLocation();
  const employeeId = params?.id;
  const { data: currentUser } = useGetMe();
  const { data: users } = useListUsers();
  const isAdmin = currentUser && (["ADMIN", "admin"].includes(currentUser.role as string) || currentUser.roles?.some((r: string) => ["ADMIN", "admin"].includes(r)) || !!currentUser.canAccessAdmin);

  const { data: employees, isLoading: employeesLoading } = useEmployees({ enabled: isAdmin });
  const { data: myProfile, isLoading: myProfileLoading } = useMyEmployeeProfile();
  const { data: employee, isLoading: employeeLoading } = useEmployee(employeeId || undefined);
  const { data: today } = useTodayAttendance();
  const { data: records, isLoading: recordsLoading } = useAttendance();

  const [selectedPeriodId, setSelectedPeriodId] = useState<string>("");
  const [newPeriod, setNewPeriod] = useState({ startDate: "", endDate: "" });
  const { data: periods } = usePayrollPeriods();
  const createPeriod = useCreatePayrollPeriod();
  const deletePeriod = useDeletePayrollPeriod();

  const selectedPeriod = periods?.find((p) => p.id === selectedPeriodId) ?? null;

  const { data: officialHours } = useOfficialHours();
  const baseOfficial: OfficialConfig = officialHours ?? DEFAULT_OFFICIAL_HOURS;

  useEffect(() => {
    if (!periods || periods.length === 0) {
      setSelectedPeriodId("");
      return;
    }
    if (selectedPeriodId && periods.some((p) => p.id === selectedPeriodId)) return;
    const today = format(new Date(), "yyyy-MM-dd");
    const current = periods.find((p) => today >= p.startDate && today <= p.endDate);
    setSelectedPeriodId(current?.id ?? periods[periods.length - 1].id);
  }, [periods, selectedPeriodId]);

  const allEmployees = useMemo(() => {
    if (isAdmin && employees) return employees;
    if (myProfile) return [myProfile];
    return [];
  }, [isAdmin, employees, myProfile]);

  const selectedEmployeeId = employeeId || myProfile?.id || null;

  const targetEmployee = employeeId ? employee : undefined;
  const targetUserId = targetEmployee?.userId || myProfile?.userId || currentUser?.id;
  const linkedUser = users?.find(u => String(u.id) === String(targetEmployee?.userId || myProfile?.userId));
  const targetName = linkedUser?.fullName || linkedUser?.username || targetEmployee?.username || targetEmployee?.employeeId || myProfile?.employeeId || currentUser?.username || "—";
  const targetEmployeeId = targetEmployee?.employeeId || myProfile?.employeeId || "—";
  const targetPosition = targetEmployee?.position || myProfile?.position || "—";

  const employeeName = linkedUser?.fullName || linkedUser?.username || targetEmployee?.username || targetEmployee?.employeeId || myProfile?.employeeId || currentUser?.username || "";
  const effectiveOfficial: OfficialConfig = {
    regular: { ...baseOfficial.regular, arrival: defaultArrivalFor(employeeName, targetPosition), departure: defaultDepartureFor(employeeName, targetPosition) },
    saturday: { ...baseOfficial.saturday, arrival: defaultArrivalFor(employeeName, targetPosition) },
  };

  const controlNo = controlNumbers["JMCS"] || "JMCS-DC-03";

  const coverageDays = useMemo(() => {
    if (!selectedPeriod) return [];
    const start = parseISO(selectedPeriod.startDate);
    const end = parseISO(selectedPeriod.endDate);
    if (isNaN(start.getTime()) || isNaN(end.getTime()) || end < start) return [];
    return eachDayOfInterval({ start, end });
  }, [selectedPeriod]);

  const coverageLabel = useMemo(() => {
    const from = coverageDays[0];
    const to = coverageDays[coverageDays.length - 1];
    if (!from || !to) return "";
    return `${format(from, "MMMM d")} - ${format(to, "d, yyyy")}`;
  }, [coverageDays]);

  const filteredRecords = useMemo(() => {
    if (!records) return [];
    if (!targetUserId) return records;
    return records.filter(r => r.userId === targetUserId);
  }, [records, targetUserId]);

  const recordsByDate = useMemo(() => {
    const map = new Map<string, typeof filteredRecords extends { length: number } ? (typeof filteredRecords)[number] : never>();
    for (const r of filteredRecords) {
      map.set(r.date, r);
    }
    return map;
  }, [filteredRecords]);

  const totalLateMinutes = useMemo(() => {
    let total = 0;
    for (const day of coverageDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const rec = recordsByDate.get(dateStr);
      if (rec?.clockIn) {
        const isSat = getDay(day) === 6;
        const [oh, om] = (isSat ? effectiveOfficial.saturday.arrival : effectiveOfficial.regular.arrival).split(":").map(Number);
        const clockInMinutes = parseISO(rec.clockIn).getHours() * 60 + parseISO(rec.clockIn).getMinutes();
        const officialMinutes = oh * 60 + om;
        const diff = clockInMinutes - officialMinutes - LATE_GRACE_MINUTES;
        if (diff > 0) total += diff;
      }
    }
    return total;
  }, [coverageDays, recordsByDate, effectiveOfficial]);

  const totalUndertimeMinutes = useMemo(() => {
    let total = 0;
    for (const day of coverageDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const rec = recordsByDate.get(dateStr);
      if (rec?.clockIn && rec?.clockOut) {
        const isSat = getDay(day) === 6;
        const official = isSat ? effectiveOfficial.saturday : effectiveOfficial.regular;
        const expectedMinutes = official.hours * 60;
        const clockInDate = parseISO(rec.clockIn);
        const clockOutDate = parseISO(rec.clockOut);
        const actualMinutes = (clockOutDate.getTime() - clockInDate.getTime()) / (1000 * 60);
        const diff = Math.round(expectedMinutes - actualMinutes);
        if (diff > 0) total += diff;
      }
    }
    return total;
  }, [coverageDays, recordsByDate, effectiveOfficial]);

  const totalHoursWorkedMinutes = useMemo(() => {
    let total = 0;
    for (const day of coverageDays) {
      const dateStr = format(day, "yyyy-MM-dd");
      const rec = recordsByDate.get(dateStr);
      if (rec?.clockIn && rec?.clockOut) {
        total += (parseISO(rec.clockOut).getTime() - parseISO(rec.clockIn).getTime()) / (1000 * 60);
      }
    }
    return total;
  }, [coverageDays, recordsByDate]);

  const handleEmployeeChange = (value: string) => {
    setLocation(`/hris/daily-time-record/${value}`);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Button variant="ghost" asChild>
          <a href="/hris"><Icon name="arrow-left" className="mr-2" size={16} /> Back to HRIS</a>
        </Button>
        <Button onClick={() => window.print()}>
          <Icon name="printer" className="mr-2" size={16} /> Print Daily Time Record
        </Button>
      </div>

      <Card className="neu rounded-lg">
        <CardContent className="pt-4 pb-2">
          <div className="flex flex-wrap items-center gap-4 mb-2">
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Employee:</label>
              <Select value={selectedEmployeeId || ""} onValueChange={handleEmployeeChange}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select employee…" />
                </SelectTrigger>
                <SelectContent>
                  {(employeesLoading || myProfileLoading) && (
                    <SelectItem value="" disabled>Loading…</SelectItem>
                  )}
                  {!employeesLoading && !myProfileLoading && allEmployees.length === 0 && (
                    <SelectItem value="" disabled>No employees found</SelectItem>
                  )}
                  {allEmployees.map((emp: Employee) => (
                    <SelectItem key={emp.id} value={emp.id}>
                      {emp.employeeId} — {emp.position}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <label className="text-sm font-medium whitespace-nowrap">Pay Period:</label>
              <Select value={selectedPeriodId} onValueChange={setSelectedPeriodId}>
                <SelectTrigger className="w-full max-w-xs">
                  <SelectValue placeholder="Select pay period…" />
                </SelectTrigger>
                <SelectContent>
                  {(!periods || periods.length === 0) && (
                    <SelectItem value="" disabled>No pay periods defined</SelectItem>
                  )}
                  {periods?.map((p) => (
                    <SelectItem key={p.id} value={p.id}>
                      {format(parseISO(p.startDate), "MMM d, yyyy")} - {format(parseISO(p.endDate), "MMM d, yyyy")}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>

          {isAdmin && (
            <div className="no-print w-full border-t pt-3 mt-2 space-y-3">
              <div className="text-sm font-medium">Pay Periods <span className="font-normal text-muted-foreground">(admin-suggested cutoff dates)</span></div>
              <div className="flex flex-wrap items-end gap-3">
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">Start</label>
                  <Input type="date" value={newPeriod.startDate} onChange={(e) => setNewPeriod(p => ({ ...p, startDate: e.target.value }))} className="w-40" />
                </div>
                <div>
                  <label className="text-xs text-muted-foreground block mb-1">End</label>
                  <Input type="date" value={newPeriod.endDate} onChange={(e) => setNewPeriod(p => ({ ...p, endDate: e.target.value }))} className="w-40" />
                </div>
                <Button onClick={() => { if (newPeriod.startDate && newPeriod.endDate) createPeriod.mutate(newPeriod); }} disabled={createPeriod.isPending || !newPeriod.startDate || !newPeriod.endDate}>
                  {createPeriod.isPending ? "Adding…" : "Add Period"}
                </Button>
                {createPeriod.isError && (
                  <span className="text-sm text-destructive">Failed to add. Check that End is not before Start.</span>
                )}
              </div>
              <div className="flex flex-wrap gap-2">
                {periods?.map((p) => (
                  <div key={p.id} className="flex items-center gap-2 rounded-md border px-3 py-1.5 text-sm">
                    <span>{format(parseISO(p.startDate), "MMM d, yyyy")} - {format(parseISO(p.endDate), "MMM d, yyyy")}</span>
                    <button type="button" onClick={() => deletePeriod.mutate(p.id)} className="text-destructive hover:text-destructive/70 disabled:opacity-50" disabled={deletePeriod.isPending} aria-label="Delete pay period">
                      <Icon name="trash-2" size={14} />
                    </button>
                  </div>
                ))}
                {(!periods || periods.length === 0) && (
                  <span className="text-sm text-muted-foreground">No pay periods yet. Add one above.</span>
                )}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {!targetEmployee && employeeId && !employeeLoading && (
        <Card className="neu rounded-lg">
          <CardContent className="pt-6 pb-6 text-center">
            <Icon name="shield-alert" className="text-destructive mb-4" size={48} />
            <h2 className="text-xl font-bold">Access Denied</h2>
            <p className="text-muted-foreground mt-2">You can only view your own daily time record unless you are an administrator.</p>
          </CardContent>
        </Card>
      )}

      {(employeeLoading || recordsLoading) && (
        <Card className="neu rounded-lg">
          <CardContent className="pt-6 pb-6 text-center">
            <p className="text-muted-foreground">Loading daily time record…</p>
          </CardContent>
        </Card>
      )}

      {targetEmployee && !employeeLoading && !recordsLoading && (
        <Card className="neu rounded-lg print:shadow-none print:border print:border-gray-300 print:rounded-none" id="daily-time-record">
          <CardContent className="pt-4 print:pt-2">
            {/* Header */}
            <div className="text-center mb-4">
              <h1 className="text-xl font-bold tracking-tight uppercase">DAILY TIME RECORD</h1>
            </div>

            {/* Metadata */}
            <div className="grid grid-cols-2 gap-x-6 gap-y-2 mb-4 text-sm">
              <div>
                <span className="text-muted-foreground">Employee Name:</span>
                <span className="font-medium underline ml-2">{targetName}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Employee ID:</span>
                <span className="font-medium underline ml-2">{targetEmployeeId}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Coverage Period:</span>
                <span className="font-medium underline ml-2">{coverageLabel}</span>
              </div>
              <div>
                <span className="text-muted-foreground">Position:</span>
                <span className="font-medium underline ml-2">{targetPosition}</span>
              </div>
              <div className="col-span-2">
                <div>
                  <span className="text-muted-foreground">Official Hours (Regular Days):</span>
                  <span className="font-medium underline ml-2">{fmtHm(effectiveOfficial.regular.arrival)} — {fmtHm(effectiveOfficial.regular.departure)} ({effectiveOfficial.regular.hours} hrs)</span>
                </div>
              </div>
            </div>

            {/* Main DTR Table */}
            {!selectedPeriod && (
              <div className="mb-4 p-6 text-center text-sm text-muted-foreground border rounded-md">
                No pay period selected. Pick a pay period above.
              </div>
            )}
            {selectedPeriod && (
            <div className="overflow-x-auto mb-4">
              <table className="w-full border-collapse text-xs" style={{ fontFamily: "monospace" }}>
                <thead>
                  <tr>
                    <th className="border-2 border-black p-1 text-center w-8">Day</th>
                    <th className="border-2 border-black p-1 text-center" colSpan={2}>A.M.</th>
                    <th className="border-2 border-black p-1 text-center" colSpan={2}>P.M.</th>
                    <th className="border-2 border-black p-1 text-center" colSpan={2}>Undertime</th>
                    <th className="border-2 border-black p-1 text-center">Late</th>
                    <th className="border-2 border-black p-1 text-center">Remarks</th>
                  </tr>
                  <tr>
                    <th className="border-2 border-black p-1 text-center">Date</th>
                    <th className="border-2 border-black p-1 text-center">In</th>
                    <th className="border-2 border-black p-1 text-center">Out</th>
                    <th className="border-2 border-black p-1 text-center">In</th>
                    <th className="border-2 border-black p-1 text-center">Out</th>
                    <th className="border-2 border-black p-1 text-center">Hrs</th>
                    <th className="border-2 border-black p-1 text-center">Min</th>
                    <th className="border-2 border-black p-1 text-center">Hrs</th>
                    <th className="border-2 border-black p-1 text-center"></th>
                  </tr>
                </thead>
                <tbody>
                  {coverageDays.map((day) => {
                    const dateStr = format(day, "yyyy-MM-dd");
                    const rec = recordsByDate.get(dateStr);
                    const isSat = getDay(day) === 6;
                    const dow = getDay(day);
                    const dayTag = dow === 0 ? "Sun" : dow === 6 ? "Sat" : null;
                    const holiday = PH_HOLIDAYS[dateStr];
                    const late = computeLate(rec?.clockIn ?? null, isSat, effectiveOfficial);
                    const undertime = computeUndertime(rec?.clockIn ?? null, rec?.clockOut ?? null, isSat, effectiveOfficial);
                    const [utH, utM] = undertime === "—" ? ["0", "0"] : undertime.replace(/h|m/g, "").split(" ");

                    return (
                      <tr key={dateStr} className={holiday ? "dtr-holiday" : dayTag ? "dtr-weekend" : ""}>
                        <td className="border-2 border-black p-1 text-center">
                          {format(day, "MMM d")}
                          {dayTag && <span className="dtr-day">{dayTag}</span>}
                          {holiday && <span className="dtr-holiday-tag">{holiday}</span>}
                        </td>
                        <td className="border-2 border-black p-1 text-center">{rec ? fmtTimeShort(rec.clockIn) : ""}</td>
                        <td className="border-2 border-black p-1 text-center">{rec ? fmtTimeShort(rec.clockOut) : ""}</td>
                        <td className="border-2 border-black p-1 text-center">—</td>
                        <td className="border-2 border-black p-1 text-center">—</td>
                        <td className="border-2 border-black p-1 text-center">{utH}</td>
                        <td className="border-2 border-black p-1 text-center">{utM}</td>
                        <td className="border-2 border-black p-1 text-center">{late === "0h 0m" && rec ? "0h 0m" : late}</td>
                        <td className="border-2 border-black p-1 text-center">{holiday ? "HOLIDAY" : rec ? (rec.status === "approved" ? "OK" : rec.status) : ""}</td>
                      </tr>
                    );
                  })}
                  {/* Total Row */}
                  <tr className="font-bold border-t-4 border-black">
                    <td className="border-2 border-black p-1 text-center" colSpan={5}>TOTAL</td>
                    <td className="border-2 border-black p-1 text-center">{Math.floor(totalUndertimeMinutes / 60)}</td>
                    <td className="border-2 border-black p-1 text-center">{Math.round(totalUndertimeMinutes % 60)}</td>
                    <td className="border-2 border-black p-1 text-center">{fmtTotalHm(totalLateMinutes)}</td>
                    <td className="border-2 border-black p-1"></td>
                  </tr>
                </tbody>
            </table>
          </div>
            )}

          {/* Footer */}
            <div className="border-t pt-4 mt-4">
              <p className="text-xs italic text-center mb-6">
                I certify that the above entries are true and correct. I have logged my arrival and departure daily as required.
              </p>
              <div className="grid grid-cols-2 gap-16 mt-8">
                <div className="text-center">
                  <div className="border-t border-black pt-2 mt-16">
                    <p className="text-xs font-medium">Employee Signature</p>
                    <p className="text-xs text-muted-foreground mt-1">{targetName}</p>
                  </div>
                </div>
                <div className="text-center">
                  <div className="border-t border-black pt-2 mt-16">
                    <p className="text-xs font-medium">In Charge</p>
                    <p className="text-xs text-muted-foreground mt-1">________________________</p>
                  </div>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      <style>{`
        @page {
          margin: 0.25in;
          size: letter portrait;
        }
        .dtr-holiday td { color: #cc0000; font-weight: 600; }
        .dtr-weekend td { color: #cc0000; }
        .dtr-day {
          display: inline-block;
          margin-left: 4px;
          padding: 0 4px;
          border-radius: 3px;
          background: #cc0000;
          color: #fff;
          font-size: 0.6rem;
          font-weight: 700;
          text-transform: uppercase;
        }
        .dtr-holiday-tag {
          display: block;
          font-size: 0.6rem;
          font-weight: 700;
          color: #cc0000;
          text-transform: uppercase;
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
          #daily-time-record { break-inside: avoid; display: block !important; }
          #daily-time-record, #daily-time-record * { visibility: visible !important; }
          #daily-time-record { zoom: 0.8; }
          #daily-time-record .text-xl { font-size: 13pt !important; }
          #daily-time-record .text-sm { font-size: 8pt !important; }
          #daily-time-record table { font-size: 7pt; }
          #daily-time-record th, #daily-time-record td { padding: 1px 3px; }
          #daily-time-record .mb-4 { margin-bottom: 6px !important; }
          #daily-time-record .pt-4 { padding-top: 4px !important; }
        }
      `}</style>
    </div>
  );
}