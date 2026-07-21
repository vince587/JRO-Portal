import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppUpdate } from "@/hooks/use-app-update";

export function UpdateNotifier() {
  const { isDesktop, phase, version, percent, download, install } = useAppUpdate();

  if (!isDesktop) return null;

  // The blocking overlay only appears once the user has committed to updating
  // (download started or finished). "available" is surfaced non-intrusively via
  // the bell notification so users can keep working until they choose to update.
  if (phase !== "downloading" && phase !== "downloaded") return null;

  // Blocking overlay: covers the whole app so nothing behind it can be clicked
  // until the update is downloaded and installed.
  return (
    <div className="fixed inset-0 z-[300] flex items-center justify-center bg-black/60 backdrop-blur-sm animate-in fade-in">
      <div className="w-[26rem] max-w-[90vw] rounded-lg border bg-background p-6 shadow-2xl animate-in zoom-in-95">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
            {phase === "downloading" ? (
              <Icon name="loader-2" size={20} className="animate-spin text-primary" />
            ) : (
              <Icon name="refresh-cw" size={20} className="text-primary" />
            )}
          </div>
          <div>
            <p className="text-base font-semibold">
              {phase === "downloading" && "Downloading update"}
              {phase === "downloaded" && "Update ready"}
            </p>
            {version && (
              <p className="text-xs text-muted-foreground">Version {version}</p>
            )}
          </div>
        </div>

        <div className="mt-5 space-y-4">
          {phase === "downloading" && (
            <>
              <Progress value={percent} />
              <p className="text-center text-sm text-muted-foreground">
                {percent}% downloaded
              </p>
            </>
          )}

          {phase === "downloaded" && (
            <>
              <p className="text-sm text-muted-foreground">
                The update has been downloaded. Restart now to finish installing.
              </p>
              <Button className="w-full" onClick={install}>
                <Icon name="refresh-cw" size={16} className="mr-2" />
                Restart &amp; install
              </Button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
