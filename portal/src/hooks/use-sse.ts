import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

type SseEvent = {
  entity: string;
  action: string;
  id?: number;
  timestamp: number;
};

const ENTITY_QUERY_MAP: Record<string, string[]> = {
  contract: ["/api/contracts"],
  certificate: ["/api/certificates"],
  project: ["/api/projects"],
  user: ["/api/users"],
  employee: ["hris"],
  hris: ["hris"],
};

export function SseInit() {
  const queryClient = useQueryClient();

  useEffect(() => {
    const url = `${window.location.origin}/api/events/stream`;
    let eventSource: EventSource | null = null;
    let reconnectTimer: ReturnType<typeof setTimeout>;

    function connect() {
      eventSource = new EventSource(url);

      eventSource.addEventListener("data-changed", (e: MessageEvent) => {
        try {
          const data: SseEvent = JSON.parse(e.data);
          const queryPrefixes = ENTITY_QUERY_MAP[data.entity];
          if (queryPrefixes) {
            for (const prefix of queryPrefixes) {
              queryClient.invalidateQueries({
                predicate: (query) =>
                  Array.isArray(query.queryKey) &&
                  typeof query.queryKey[0] === "string" &&
                  query.queryKey[0].startsWith(prefix),
              });
            }
          }
          if (data.entity === "contract") {
            queryClient.invalidateQueries({ queryKey: ["/api/contracts/summary"] });
          }
          if (data.entity === "project") {
            queryClient.invalidateQueries({ queryKey: ["/api/projects/summary"] });
          }
          if (data.entity === "certificate" || data.entity === "contract") {
            queryClient.invalidateQueries({ queryKey: ["/api/dashboard"] });
          }
        } catch {
          // ignore parse errors
        }
      });

      eventSource.onerror = (e) => {
        console.error("[debug] SSE connection failed. URL used:", url, "readyState:", eventSource?.readyState, e);
        eventSource?.close();
        reconnectTimer = setTimeout(connect, 5000);
      };
    }

    connect();

    return () => {
      eventSource?.close();
      clearTimeout(reconnectTimer);
    };
  }, [queryClient]);

  return null;
}