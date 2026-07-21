import { useEffect, useState } from "react";

export type UpdatePhase =
  | "idle"
  | "checking"
  | "available"
  | "downloading"
  | "downloaded"
  | "error";

export interface UpdateState {
  phase: UpdatePhase;
  version?: string;
  percent: number;
  error?: string;
}

// Module-level singleton store so every component (the bell, the modal) shares
// one subscription to the Electron auto-updater and reflects identical state.
let state: UpdateState = { phase: "idle", percent: 0 };
const listeners = new Set<(s: UpdateState) => void>();
let initialized = false;

function setState(patch: Partial<UpdateState>) {
  state = { ...state, ...patch };
  listeners.forEach((l) => l(state));
}

function getUpdater() {
  return typeof window !== "undefined" ? window.electronAPI?.updater : undefined;
}

function apply(data: UpdaterEvent) {
  switch (data.status) {
    case "checking":
      setState({ phase: "checking" });
      break;
    case "available":
      setState({ phase: "available", version: data.version });
      break;
    case "not-available":
      setState({ phase: "idle" });
      break;
    case "downloading":
      setState({ phase: "downloading", percent: Math.round(data.percent ?? 0) });
      break;
    case "downloaded":
      setState({ phase: "downloaded", version: data.version });
      break;
    case "error":
      setState({ phase: "error", error: data.message });
      break;
  }
}

function init() {
  if (initialized) return;
  const updater = getUpdater();
  if (!updater) return;
  initialized = true;

  updater.onEvent(apply);
  // Hydrate from any state the main process already detected before mount.
  void updater.getState().then((s) => {
    if (s) apply(s);
  });
}

export function startUpdateDownload() {
  const updater = getUpdater();
  if (!updater) return;
  setState({ phase: "downloading", percent: 0 });
  void updater.download();
}

export function checkForUpdate() {
  const updater = getUpdater();
  if (!updater) return;
  setState({ phase: "checking" });
  void updater.check();
}

export function installUpdate() {
  const updater = getUpdater();
  if (!updater) return;
  void updater.install();
}

export function useAppUpdate(): UpdateState & {
  isDesktop: boolean;
  check: () => void;
  download: () => void;
  install: () => void;
} {
  const [snapshot, setSnapshot] = useState<UpdateState>(state);

  useEffect(() => {
    init();
    listeners.add(setSnapshot);
    setSnapshot(state);
    return () => {
      listeners.delete(setSnapshot);
    };
  }, []);

  return {
    ...snapshot,
    isDesktop: !!getUpdater(),
    check: checkForUpdate,
    download: startUpdateDownload,
    install: installUpdate,
  };
}
