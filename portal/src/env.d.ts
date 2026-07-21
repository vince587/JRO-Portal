/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_FIREBASE_API_KEY: string;
  readonly VITE_FIREBASE_AUTH_DOMAIN: string;
  readonly VITE_FIREBASE_PROJECT_ID: string;
  readonly VITE_FIREBASE_STORAGE_BUCKET: string;
  readonly VITE_FIREBASE_MESSAGING_SENDER_ID: string;
  readonly VITE_FIREBASE_APP_ID: string;
  readonly VITE_FIREBASE_EMULATOR_HOST: string;
}

interface ImportMeta {
  readonly env: ImportMetaEnv;
}

type UpdaterEvent =
  | { status: "checking" }
  | { status: "available"; version?: string; releaseDate?: string }
  | { status: "not-available"; version?: string }
  | { status: "error"; message?: string }
  | {
      status: "downloading";
      percent?: number;
      transferred?: number;
      total?: number;
      bytesPerSecond?: number;
    }
  | { status: "downloaded"; version?: string };

interface UpdaterResult {
  ok: boolean;
  version?: string;
  message?: string;
}

interface Window {
  electronAPI?: {
    platform?: string;
    isDesktopApp?: boolean;
    updater?: {
      getState: () => Promise<UpdaterEvent | null>;
      check: () => Promise<UpdaterResult>;
      download: () => Promise<UpdaterResult>;
      install: () => Promise<UpdaterResult>;
      onEvent: (callback: (data: UpdaterEvent) => void) => () => void;
    };
  };
}
