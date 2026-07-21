import { format } from "date-fns";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { useToast } from "@/hooks/use-toast";
import {
  useTodayAttendance,
  useClockIn,
  useClockOut,
  type GeoLocation,
} from "@/lib/hooks/use-attendance";

function getLocation(): Promise<GeoLocation | undefined> {
  return new Promise((resolve) => {
    if (!("geolocation" in navigator)) { resolve(undefined); return; }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }),
      () => resolve(undefined),
      { timeout: 5000 },
    );
  });
}

function fmtTime(iso: string | null): string {
  if (!iso) return "—";
  try { return format(new Date(iso), "h:mm a"); } catch { return "—"; }
}

export function TimeClockCard() {
  const { toast } = useToast();
  const { data: today, isLoading: todayLoading } = useTodayAttendance();
  const clockIn = useClockIn();
  const clockOut = useClockOut();

  const handleClockIn = async () => {
    const location = await getLocation();
    try {
      await clockIn.mutateAsync({ location });
      toast({ title: "Clocked in", description: location ? "Location captured." : "Location unavailable." });
    } catch (e: any) {
      toast({ title: "Clock in failed", description: e.message, variant: "destructive" });
    }
  };

  const handleClockOut = async () => {
    const location = await getLocation();
    try {
      await clockOut.mutateAsync({ location });
      toast({ title: "Clocked out" });
    } catch (e: any) {
      toast({ title: "Clock out failed", description: e.message, variant: "destructive" });
    }
  };

  const clockedIn = today && !today.clockOut;
  const completed = today && today.clockOut;

  return (
    <Card>
      <CardHeader className="pb-3 border-b">
        <CardTitle className="text-base flex items-center gap-2">
          <Icon name="clock" size={16} className="text-muted-foreground" />
          Time Clock
        </CardTitle>
        <CardDescription>Clock in and out to track your working hours.</CardDescription>
      </CardHeader>
      <CardContent className="pt-4">
        {todayLoading ? (
          <p className="text-sm text-muted-foreground">Loading…</p>
        ) : (
          <div className="flex flex-col sm:flex-row sm:items-center gap-4">
            <div className="flex-1 space-y-1">
              <p className="text-sm text-muted-foreground">Today, {format(new Date(), "EEEE, MMM d")}</p>
              {today ? (
                <p className="text-sm">
                  Clocked in at <span className="font-medium">{fmtTime(today.clockIn)}</span>
                  {today.clockOut && <> · out at <span className="font-medium">{fmtTime(today.clockOut)}</span> · <span className="font-medium">{today.hoursWorked}h</span></>}
                </p>
              ) : (
                <p className="text-sm">Not clocked in yet.</p>
              )}
              {today?.clockInLocation && (
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Icon name="map-pin" size={12} /> {today.clockInLocation.lat.toFixed(4)}, {today.clockInLocation.lng.toFixed(4)}
                </p>
              )}
            </div>
            <div className="flex gap-2">
              <Button onClick={handleClockIn} disabled={clockIn.isPending || !!today}>
                {clockIn.isPending ? <Icon name="loader-2" size={16} className="animate-spin mr-2" /> : <Icon name="log-in" size={16} className="mr-2" />}
                Clock In
              </Button>
              <Button variant="outline" onClick={handleClockOut} disabled={clockOut.isPending || !clockedIn}>
                {clockOut.isPending ? <Icon name="loader-2" size={16} className="animate-spin mr-2" /> : <Icon name="log-out" size={16} className="mr-2" />}
                Clock Out
              </Button>
            </div>
          </div>
        )}
        {completed && <p className="mt-3 text-xs text-emerald-600">Attendance completed for today.</p>}
      </CardContent>
    </Card>
  );
}
