import { Icon } from "@/components/ui/icon";

interface UploadProgressOverlayProps {
  uploading: boolean;
  progress: number;
  fileName: string;
  fileSize: number;
  onCancel?: () => void;
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + " " + sizes[i];
}

export function UploadProgressOverlay({ uploading, progress, fileName, fileSize, onCancel }: UploadProgressOverlayProps) {
  if (!uploading && progress === 0) return null;

  const isComplete = progress >= 100 && !uploading;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="surface rounded-lg p-4 w-72 shadow-lg">
        <div className="flex items-center gap-3 mb-3">
          <div className={`h-9 w-9 rounded-xl flex items-center justify-center shrink-0 ${isComplete ? "tone-success" : "surface-sunken text-primary"}`}>
            <Icon name={isComplete ? "check-circle" : "upload-cloud"} size={18} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground truncate">{fileName || "Uploading..."}</p>
            <p className="text-xs text-muted-foreground">
              {isComplete ? "Upload complete" : `${formatBytes(fileSize)} • ${progress}%`}
            </p>
          </div>
          {!isComplete && onCancel && (
            <button onClick={onCancel} className="text-muted-foreground hover:text-red-500 transition-colors">
              <Icon name="x" size={16} />
            </button>
          )}
        </div>
        <div className="surface-sunken rounded-full h-2.5 overflow-hidden">
          <div
            className={`h-full rounded-full transition-all duration-300 ease-out ${isComplete ? "bg-emerald-500" : "bg-primary"}`}
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>
    </div>
  );
}

interface SaveProgressProps {
  saving: boolean;
  label?: string;
}

export function SaveProgressIndicator({ saving, label = "Saving..." }: SaveProgressProps) {
  if (!saving) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 animate-in slide-in-from-bottom-4 fade-in duration-300">
      <div className="surface rounded-lg px-4 py-3 flex items-center gap-3 shadow-lg">
        <div className="relative h-5 w-5">
          <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
          <div className="absolute inset-0 rounded-full border-2 border-primary border-t-transparent animate-spin" />
        </div>
        <span className="text-sm font-medium text-foreground/80">{label}</span>
      </div>
    </div>
  );
}
