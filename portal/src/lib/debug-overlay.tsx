import { Component, useEffect, useState, type ErrorInfo, type ReactNode } from "react";

// ── Global error store ─────────────────────────────────────────────────────

type LogEntry = {
  type: "uncaught" | "rejection" | "react-error" | "log";
  message: string;
  detail?: string;
  time: string;
};

const logs: LogEntry[] = [];
const MAX_LOGS = 50;
let listeners: Array<() => void> = [];

function addLog(entry: LogEntry) {
  logs.push(entry);
  if (logs.length > MAX_LOGS) logs.shift();
  listeners.forEach((fn) => fn());
}

function subscribe(fn: () => void) {
  listeners.push(fn);
  return () => {
    listeners = listeners.filter((f) => f !== fn);
  };
}

// ── Install global listeners (call once at startup) ───────────────────────

export function installGlobalErrorListeners() {
  window.onerror = (msg, source, line, col, err) => {
    addLog({
      type: "uncaught",
      message: String(msg),
      detail: err?.stack || `at ${source}:${line}:${col}`,
      time: new Date().toLocaleTimeString(),
    });
  };

  window.addEventListener("unhandledrejection", (e) => {
    const reason = e.reason;
    addLog({
      type: "rejection",
      message: String(reason?.message || reason || "Unhandled rejection"),
      detail: reason?.stack || "",
      time: new Date().toLocaleTimeString(),
    });
  });
}

// ── React Error Boundary ───────────────────────────────────────────────────

type Props = { children: ReactNode };
type State = { hasError: boolean; error: Error | null; errorInfo: ErrorInfo | null };

export class DebugErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false, error: null, errorInfo: null };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    this.setState({ errorInfo });
    addLog({
      type: "react-error",
      message: error.message,
      detail: error.stack,
      time: new Date().toLocaleTimeString(),
    });
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ padding: 24, background: "#1a1a2e", color: "#e0e0e0", minHeight: "100vh", fontFamily: "monospace", fontSize: 13 }}>
          <h2 style={{ color: "#ff6b6b", marginBottom: 8, fontSize: 18 }}>React Error Boundary</h2>
          <pre style={{ whiteSpace: "pre-wrap", background: "#16213e", padding: 12, borderRadius: 6, border: "1px solid #ff6b6b66" }}>
            {this.state.error?.message}
            {"\n\n"}
            {this.state.error?.stack}
          </pre>
          <p style={{ marginTop: 16, color: "#888" }}>
            <button onClick={() => this.setState({ hasError: false, error: null, errorInfo: null })} style={{ background: "#0f3460", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 4, cursor: "pointer" }}>
              Dismiss
            </button>{" "}
            <button onClick={() => window.location.reload()} style={{ background: "#533483", color: "#fff", border: "none", padding: "6px 14px", borderRadius: 4, cursor: "pointer" }}>
              Reload
            </button>
          </p>
          <p style={{ color: "#888", fontSize: 11, marginTop: 8 }}>component stack:</p>
          <pre style={{ whiteSpace: "pre-wrap", background: "#16213e", padding: 12, borderRadius: 6, fontSize: 11, color: "#aaa" }}>
            {this.state.errorInfo?.componentStack}
          </pre>
        </div>
      );
    }
    return this.props.children;
  }
}

// ── Live Console Overlay (bottom-right corner) ────────────────────────────

export function DebugConsole() {
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    setEntries([...logs]);
    return subscribe(() => setEntries([...logs]));
  }, []);

  return (
    <div style={{
      position: "fixed", bottom: 8, right: 8, zIndex: 99999,
      maxWidth: 500, maxHeight: collapsed ? 36 : 300, overflow: "auto",
      background: "rgba(10,10,30,0.92)", color: "#0f0",
      fontFamily: "monospace", fontSize: 11, lineHeight: 1.5,
      borderRadius: 6, padding: "6px 10px", border: "1px solid #333",
      boxShadow: "0 4px 24px rgba(0,0,0,0.6)",
    }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: collapsed ? 0 : 4, cursor: "pointer" }} onClick={() => setCollapsed(!collapsed)}>
        <span style={{ fontWeight: "bold", color: entries.some(e => e.type !== "log") ? "#ff6b6b" : "#0f0" }}>
          Debug ({entries.length})
        </span>
        <span style={{ color: "#888" }}>{collapsed ? "▸" : "▾"}</span>
      </div>
      {!collapsed && entries.map((e, i) => (
        <div key={i} style={{ marginBottom: 2, borderBottom: "1px solid #222", paddingBottom: 2 }}>
          <span style={{ color: e.type === "uncaught" ? "#ff6b6b" : e.type === "rejection" ? "#ffa500" : e.type === "react-error" ? "#ff69b4" : "#888" }}>
            [{e.type}] {e.message}
          </span>
          {e.detail && (
            <div style={{ color: "#aaa", paddingLeft: 12, fontSize: 10, whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
              {e.detail}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
