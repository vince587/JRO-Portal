import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";

export interface LeadTarget {
  id?: string;
  userId: string;
  month: string; // YYYY-MM
  target: number;
  createdAt?: string;
  updatedAt?: string;
}

export interface PerEmployeeRow {
  key: string;
  employee: string;
  total: number; // Actual leads
  new: number;
  contacted: number;
  qualified: number;
  lost: number;
  latest: string;
  target: number | null; // Monthly equivalent target for achievement
  dailyTarget: number | null; // Daily target for display
  dailyActual: number | null; // Daily average actual for display
  actual: number; // New: actual leads (same as total)
  achievementPct: number | null; // New: actual / target
}

export function getLeadsPerEmployeeQueryKey(from?: string, to?: string) {
  return ["leadsPerEmployee", from, to];
}

export function useLeadsPerEmployee(from?: string, to?: string, enabled: boolean = true) {
  const dateQuery = new URLSearchParams();
  if (from) dateQuery.set("from", from);
  if (to) dateQuery.set("to", to);
  const queryString = dateQuery.toString();

  return useQuery<PerEmployeeRow[], Error>({
    queryKey: getLeadsPerEmployeeQueryKey(from, to),
    queryFn: async () => {
      const res = await fetch(`/api/reports/leads-per-employee?${queryString}`);
      if (!res.ok) throw new Error("Failed to fetch leads per employee");
      return res.json();
    },
    enabled: enabled,
  });
}

export function getLeadTargetsQueryKey(month?: string) {
  return ["leadTargets", month];
}

export function useListLeadTargets(month?: string, enabled: boolean = true) {
  return useQuery<LeadTarget[], Error>({
    queryKey: getLeadTargetsQueryKey(month),
    queryFn: async () => {
      const queryString = month ? `month=${month}` : "";
      const res = await fetch(`/api/reports/lead-targets?${queryString}`);
      if (!res.ok) throw new Error("Failed to fetch lead targets");
      return res.json();
    },
    enabled: enabled,
  });
}

export function useUpsertLeadTarget() {
  const queryClient = useQueryClient();
  return useMutation<LeadTarget, Error, Omit<LeadTarget, "id" | "createdAt" | "updatedAt">>({
    mutationFn: async (targetData) => {
      const res = await fetch("/api/reports/lead-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(targetData),
      });
      if (!res.ok) throw new Error("Failed to upsert lead target");
      return res.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadTargets"] });
      queryClient.invalidateQueries({ queryKey: ["leadsPerEmployee"] });
    },
  });
}

import { useToast } from "@/hooks/use-toast";

export function useDeleteLeadTarget() {
  const queryClient = useQueryClient();
  const { toast } = useToast();
  return useMutation<void, Error, string>({
    mutationFn: async (id) => {
      const res = await fetch(`/api/reports/lead-targets/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to delete lead target");
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["leadTargets"] }); // Explicitly invalidate the base key
      queryClient.invalidateQueries({ queryKey: getLeadTargetsQueryKey() }); // Also invalidate the key used by the component
      queryClient.invalidateQueries({ queryKey: ["leadsPerEmployee"] });
      toast({ title: "Lead target deleted successfully" });
    },
    onError: (error) => {
      toast({ title: "Failed to delete lead target", description: error.message, variant: "destructive" });
    },
  });
}
