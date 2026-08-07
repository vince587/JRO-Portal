import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface GeoLocation {
  lat: number;
  lng: number;
}

export interface AttendanceRecord {
  id: string;
  userId: string;
  userFullName: string;
  employeeId: string;
  date: string;
  clockIn: string;
  clockOut: string | null;
  clockInLocation: GeoLocation | null;
  clockOutLocation: GeoLocation | null;
  hoursWorked: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface Timesheet {
  id: string;
  userId: string;
  userFullName: string;
  employeeId: string;
  periodStart: string;
  periodEnd: string;
  totalHours: number;
  status: string;
  approverComment: string;
  submittedAt: string;
  reviewedAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AttendanceReportRow {
  userId: string;
  userFullName: string;
  employeeId: string;
  totalHours: number;
  daysPresent: number;
}

export interface AttendanceReport {
  summary: AttendanceReportRow[];
  totalRecords: number;
}

export const ATTENDANCE_TODAY_KEY = ["attendance", "today"] as const;
export const ATTENDANCE_LIST_KEY = ["attendance", "list"] as const;
export const ATTENDANCE_REPORT_KEY = ["attendance", "report"] as const;
export const TIMESHEETS_KEY = ["timesheets"] as const;

async function fetchTodayAttendance(): Promise<AttendanceRecord | null> {
  const res = await fetch("/api/attendance/today");
  if (!res.ok) throw new Error("Failed to fetch today's attendance");
  return res.json();
}

export function useTodayAttendance() {
  return useQuery({
    queryKey: ATTENDANCE_TODAY_KEY,
    queryFn: fetchTodayAttendance,
  });
}

async function fetchAttendance(from?: string, to?: string): Promise<AttendanceRecord[]> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await fetch(`/api/attendance${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch attendance");
  return res.json();
}

export function useAttendance(from?: string, to?: string) {
  return useQuery({
    queryKey: [...ATTENDANCE_LIST_KEY, from ?? null, to ?? null],
    queryFn: () => fetchAttendance(from, to),
  });
}

async function fetchAttendanceReport(from?: string, to?: string): Promise<AttendanceReport> {
  const params = new URLSearchParams();
  if (from) params.set("from", from);
  if (to) params.set("to", to);
  const qs = params.toString();
  const res = await fetch(`/api/attendance/report${qs ? `?${qs}` : ""}`);
  if (!res.ok) throw new Error("Failed to fetch attendance report");
  return res.json();
}

export function useAttendanceReport(from?: string, to?: string, options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: [...ATTENDANCE_REPORT_KEY, from ?? null, to ?? null],
    queryFn: () => fetchAttendanceReport(from, to),
    enabled: options?.enabled,
  });
}

export function useClockIn() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { location?: GeoLocation; notes?: string }) => {
      const res = await fetch("/api/attendance/clock-in", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to clock in");
      }
      return res.json() as Promise<AttendanceRecord>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_TODAY_KEY });
      qc.invalidateQueries({ queryKey: ATTENDANCE_LIST_KEY });
    },
  });
}

export function useClockOut() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { location?: GeoLocation }) => {
      const res = await fetch("/api/attendance/clock-out", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to clock out");
      }
      return res.json() as Promise<AttendanceRecord>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ATTENDANCE_TODAY_KEY });
      qc.invalidateQueries({ queryKey: ATTENDANCE_LIST_KEY });
    },
  });
}

async function fetchTimesheets(): Promise<Timesheet[]> {
  const res = await fetch("/api/timesheets");
  if (!res.ok) throw new Error("Failed to fetch timesheets");
  return res.json();
}

export function useTimesheets() {
  return useQuery({
    queryKey: TIMESHEETS_KEY,
    queryFn: fetchTimesheets,
  });
}

export function useSubmitTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: { periodStart: string; periodEnd: string }) => {
      const res = await fetch("/api/timesheets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to submit timesheet");
      }
      return res.json() as Promise<Timesheet>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEETS_KEY });
    },
  });
}

export function useReviewTimesheet() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, approverComment }: { id: string; status: "approved" | "rejected"; approverComment?: string }) => {
      const res = await fetch(`/api/timesheets/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approverComment }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to review timesheet");
      }
      return res.json() as Promise<Timesheet>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: TIMESHEETS_KEY });
    },
  });
}

export interface PayrollPeriod {
  id: string;
  startDate: string;
  endDate: string;
  createdAt?: string;
  updatedAt?: string;
}

export const PAYROLL_PERIODS_KEY = ["payroll-periods"] as const;

async function fetchPayrollPeriods(): Promise<PayrollPeriod[]> {
  const res = await fetch("/api/payroll-periods");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to fetch payroll periods");
  }
  return res.json();
}

export function usePayrollPeriods() {
  return useQuery({
    queryKey: PAYROLL_PERIODS_KEY,
    queryFn: fetchPayrollPeriods,
  });
}

export function useCreatePayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { startDate: string; endDate: string }) => {
      const res = await fetch("/api/admin/payroll-periods", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to add pay period");
      }
      return res.json() as Promise<PayrollPeriod>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYROLL_PERIODS_KEY });
    },
  });
}

export function useDeletePayrollPeriod() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/admin/payroll-periods/${id}`, { method: "DELETE" });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to delete pay period");
      }
      return res.json();
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: PAYROLL_PERIODS_KEY });
    },
  });
}

export interface OfficialHours {
  regular: { arrival: string; departure: string; hours: number };
  saturday: { arrival: string; departure: string; hours: number };
  updatedAt?: string | null;
}

export const OFFICIAL_HOURS_KEY = ["official-hours"] as const;

async function fetchOfficialHours(): Promise<OfficialHours> {
  const res = await fetch("/api/official-hours");
  if (!res.ok) {
    const body = await res.json().catch(() => null);
    throw new Error(body?.error || "Failed to fetch official hours");
  }
  return res.json();
}

export function useOfficialHours() {
  return useQuery({
    queryKey: OFFICIAL_HOURS_KEY,
    queryFn: fetchOfficialHours,
  });
}

export function useUpdateOfficialHours() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { regular: { arrival: string; departure: string; hours: number }; saturday: { arrival: string; departure: string; hours: number } }) => {
      const res = await fetch("/api/admin/official-hours", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(input),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to update official hours");
      }
      return res.json() as Promise<OfficialHours>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: OFFICIAL_HOURS_KEY });
    },
  });
}
