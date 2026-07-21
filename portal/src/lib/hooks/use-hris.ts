import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface Employee {
  id: string;
  userId: string;
  employeeId: string;
  position: string;
  dateHired: string;
  employmentStatus: string;
  contactNumber: string;
  address: string;
  emergencyContact: string;
  emergencyContactNumber: string;
  educationalAttainment: string;
  sssNumber: string;
  tinNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
  email?: string;
  username?: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface EmployeeFormData {
  userId: string;
  employeeId: string;
  position: string;
  dateHired: string;
  employmentStatus: string;
  contactNumber: string;
  address: string;
  emergencyContact: string;
  emergencyContactNumber: string;
  educationalAttainment: string;
  sssNumber: string;
  tinNumber: string;
  philhealthNumber: string;
  pagibigNumber: string;
}

export interface HrisStats {
  total: number;
  regular: number;
  probationary: number;
  contractual: number;
  partTime: number;
  intern: number;
}

export interface LeaveRequest {
  id: string;
  employeeId: string;
  userId: string;
  userFullName: string;
  type: string;
  company: string;
  startDate: string;
  endDate: string;
  daysCount: number;
  reason: string;
  status: string;
  approverComment: string;
  createdAt: string;
  updatedAt: string;
}

export interface HrisDocument {
  id: string;
  employeeRef: string;
  employeeId: string;
  filename: string;
  size: number;
  type: string;
  uploadedBy: string;
  uploadedAt: string;
}

export interface LeaveBalance {
  type: string;
  entitlement: number;
  used: number;
  remaining: number;
}

export interface LeaveBalanceResponse {
  balances: LeaveBalance[];
  pending: LeaveRequest[];
}

export const HRIS_DOCUMENTS_KEY = ["hris", "documents"] as const;
export const HRIS_LEAVE_BALANCE_KEY = ["hris", "leaves", "balance"] as const;

export const LEAVE_TYPES = ["Vacation", "Sick", "Emergency", "Personal", "Bereavement", "Maternity", "Paternity", "Offset"] as const;
export const COMPANY_OPTIONS = ["JMCS", "SIS Certification and Inspection Philippines OPC"] as const;

export const HRIS_QUERY_KEY = ["hris", "employees"] as const;
export const HRIS_STATS_KEY = ["hris", "stats"] as const;
export const HRIS_LEAVES_KEY = ["hris", "leaves"] as const;
export const HRIS_MY_PROFILE_KEY = ["hris", "my-profile"] as const;

async function fetchEmployees(): Promise<Employee[]> {
  const res = await fetch("/api/hris/employees");
  if (!res.ok) throw new Error("Failed to fetch employees");
  return res.json();
}

async function fetchEmployee(id: string): Promise<Employee> {
  const res = await fetch(`/api/hris/employees/${id}`);
  if (!res.ok) throw new Error("Failed to fetch employee");
  return res.json();
}

async function fetchStats(): Promise<HrisStats> {
  const res = await fetch("/api/hris/stats");
  if (!res.ok) throw new Error("Failed to fetch stats");
  return res.json();
}

export function useEmployees(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: HRIS_QUERY_KEY,
    queryFn: fetchEmployees,
    enabled: options?.enabled,
  });
}

export function useEmployee(id: string | undefined) {
  return useQuery({
    queryKey: [...HRIS_QUERY_KEY, id],
    queryFn: () => fetchEmployee(id!),
    enabled: !!id,
  });
}

export function useHrisStats() {
  return useQuery({
    queryKey: HRIS_STATS_KEY,
    queryFn: fetchStats,
  });
}

async function fetchMyProfile(): Promise<Employee | null> {
  const res = await fetch("/api/hris/my-profile");
  if (!res.ok) {
    // fallback: try to find by email or username via query? Not possible via existing endpoint.
    // we'll try alternative: fetch all employees and find matching email/username client-side? heavy.
    // Instead, we call a custom endpoint? Not available.
    // We'll just return null; the endpoint already tries userId, username, email.
    throw new Error("Failed to fetch profile");
  }
  const data = await res.json();
  return data;
}

export function useMyEmployeeProfile() {
  return useQuery({
    queryKey: HRIS_MY_PROFILE_KEY,
    queryFn: fetchMyProfile,
    refetchInterval: 10000,
  });
}

export function useCreateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: EmployeeFormData) => {
      const res = await fetch("/api/hris/employees", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create employee");
      }
      return res.json() as Promise<Employee>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HRIS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: HRIS_STATS_KEY });
      qc.invalidateQueries({ queryKey: HRIS_MY_PROFILE_KEY });
    },
  });
}

export function useUpdateEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, data }: { id: string; data: Partial<EmployeeFormData> }) => {
      const res = await fetch(`/api/hris/employees/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to update employee");
      }
      return res.json() as Promise<Employee>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HRIS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: HRIS_STATS_KEY });
      qc.invalidateQueries({ queryKey: HRIS_MY_PROFILE_KEY });
    },
  });
}

export function useDeleteEmployee() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const res = await fetch(`/api/hris/employees/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete employee");
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HRIS_QUERY_KEY });
      qc.invalidateQueries({ queryKey: HRIS_STATS_KEY });
      qc.invalidateQueries({ queryKey: HRIS_MY_PROFILE_KEY });
    },
  });
}

export function useUploadHrisDocument(onProgress?: (progress: number) => void) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, file }: { id: string; file: File }) => {
      const fd = new FormData();
      fd.append("file", file);
      return new Promise<{ id: string; filename: string; storedAs: string; size: number }>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", `/api/upload/hris/${id}`);
        xhr.upload.addEventListener("progress", (e) => {
          if (e.lengthComputable && onProgress) {
            onProgress(Math.round((e.loaded / e.total) * 100));
          }
        });
        xhr.addEventListener("load", () => {
          if (xhr.status >= 200 && xhr.status < 300) {
            resolve(JSON.parse(xhr.responseText));
          } else {
            reject(new Error("Failed to upload document"));
          }
        });
        xhr.addEventListener("error", () => reject(new Error("Failed to upload document")));
        xhr.send(fd);
      });
    },
    onSuccess: (_data, variables) => {
      qc.invalidateQueries({ queryKey: [...HRIS_DOCUMENTS_KEY, variables.id] });
    },
  });
}

async function fetchEmployeeDocuments(id: string): Promise<HrisDocument[]> {
  const res = await fetch(`/api/hris/employees/${id}/documents`);
  if (!res.ok) throw new Error("Failed to fetch documents");
  return res.json();
}

export function useEmployeeDocuments(id: string | undefined) {
  return useQuery({
    queryKey: [...HRIS_DOCUMENTS_KEY, id],
    queryFn: () => fetchEmployeeDocuments(id!),
    enabled: !!id,
  });
}

async function fetchLeaveBalance(): Promise<LeaveBalanceResponse> {
  const res = await fetch("/api/hris/leaves/balance");
  if (!res.ok) throw new Error("Failed to fetch leave balance");
  return res.json();
}

export function useLeaveBalance() {
  return useQuery({
    queryKey: HRIS_LEAVE_BALANCE_KEY,
    queryFn: fetchLeaveBalance,
  });
}

// --- Leave Requests ---

async function fetchLeaves(): Promise<LeaveRequest[]> {
  const res = await fetch("/api/hris/leaves");
  if (!res.ok) throw new Error("Failed to fetch leaves");
  return res.json();
}

async function fetchLeave(id: string): Promise<LeaveRequest> {
  const res = await fetch(`/api/hris/leaves/${id}`);
  if (!res.ok) throw new Error("Failed to fetch leave");
  return res.json();
}

export function useLeaves() {
  return useQuery({
    queryKey: HRIS_LEAVES_KEY,
    queryFn: fetchLeaves,
  });
}

export function useLeave(id: string | undefined) {
  return useQuery({
    queryKey: [...HRIS_LEAVES_KEY, id],
    queryFn: () => fetchLeave(id!),
    enabled: !!id,
  });
}

export function useCreateLeave() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: {
      employeeId: string;
      type: string;
      company: string;
      startDate: string;
      endDate: string;
      daysCount: number;
      reason: string;
    }) => {
      const res = await fetch("/api/hris/leaves", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(data),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to create leave");
      }
      return res.json() as Promise<LeaveRequest>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HRIS_LEAVES_KEY });
    },
  });
}

export function useUpdateLeaveStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, status, approverComment }: { id: string; status: string; approverComment?: string }) => {
      const res = await fetch(`/api/hris/leaves/${id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status, approverComment }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => null);
        throw new Error(body?.error || "Failed to update leave");
      }
      return res.json() as Promise<LeaveRequest>;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: HRIS_LEAVES_KEY });
    },
  });
}
