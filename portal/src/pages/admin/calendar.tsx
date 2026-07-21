import { useState, useEffect } from "react";
import { Link } from "wouter";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";

export default function AdminCalendar() {
  const [events, setEvents] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try { const r = await window.fetch("/api/admin/compliance-calendar"); if (r.ok) setEvents(await r.json()); }
      catch {} finally { setLoading(false); }
    })();
  }, []);

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" asChild><Link href="/admin"><Icon name="arrow-left" className="mr-2" size={16} /> Back</Link></Button>
        <div><h1 className="text-2xl font-bold tracking-tight flex items-center gap-2"><Icon name="calendar-days" className="text-primary" size={24} /> Compliance Calendar</h1></div>
      </div>

      <Card className="neu rounded-2xl">
        <CardHeader><CardTitle className="text-base">Upcoming Deadlines & Expiries</CardTitle><CardDescription>All compliance events sorted by urgency.</CardDescription></CardHeader>
        <CardContent className="p-0">
          {loading ? (
            <div className="text-center py-12 text-muted-foreground">Loading...</div>
          ) : events.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <Icon name="calendar-days" className="mx-auto mb-2 opacity-50" size={32} />
              <p>No upcoming deadlines.</p>
            </div>
          ) : (
            <div className="divide-y">
              {events.map((e: any, i: number) => (
                <div key={`${e.type}-${e.id}-${i}`} className="flex items-center gap-4 px-6 py-4 text-sm hover:bg-muted/30">
                  <div className={`w-2.5 h-2.5 rounded-full shrink-0 ${e.daysUntil <= 0 ? "bg-red-500" : e.daysUntil <= 7 ? "bg-amber-500" : "bg-emerald-500"}`} />
                  <div className="flex-1 min-w-0">
                    <p className="font-medium truncate">{e.title}</p>
                    <p className="text-xs text-muted-foreground">{e.company} — {e.type === "remittance" ? "Payment" : "Legal File"}{e.amount ? ` — ₱${(e.amount || 0).toLocaleString()}` : ""}</p>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-medium ${e.daysUntil <= 0 ? "text-red-600" : e.daysUntil <= 7 ? "text-amber-600" : ""}`}>
                      {e.daysUntil <= 0 ? "Overdue" : `${e.daysUntil} day${e.daysUntil === 1 ? "" : "s"} left`}
                    </p>
                    <p className="text-xs text-muted-foreground">{e.dueDate}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
