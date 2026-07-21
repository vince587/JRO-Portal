import { useQuery } from "@tanstack/react-query";

export interface Notification {
  id: string;
  type: "certificate_expiring" | "contract_ending";
  title: string;
  description: string;
  entityId: number;
  severity: "warning" | "danger";
  link: string;
  daysUntil: number;
}

export function useNotifications() {
  return useQuery<Notification[]>({
    queryKey: ["notifications"],
    queryFn: async () => {
      const res = await fetch("/api/notifications");
      if (!res.ok) throw new Error("Failed to fetch notifications");
      return res.json();
    },
    refetchInterval: 60_000,
  });
}
