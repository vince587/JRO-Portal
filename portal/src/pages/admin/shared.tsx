import { useState, useEffect, useCallback } from "react";
import { Icon } from "@/components/ui/icon"
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useToast } from "@/hooks/use-toast";

export const COMPANY_OPTIONS = ["JMCS", "SIS Certification and Inspection Philippines OPC"] as const;

export const statusColor: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  paid: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
  overdue: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
  sent: "bg-blue-50 text-blue-700 border-blue-200 dark:bg-blue-900/20 dark:text-blue-400",
  draft: "bg-gray-50 text-foreground/80 border-border dark:bg-gray-900/20 dark:text-muted-foreground",
  cancelled: "bg-gray-50 text-foreground/80 border-border dark:bg-gray-900/20 dark:text-muted-foreground",
  active: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
  expiring: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  expired: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
};

export function useCollection<T>(endpoint: string) {
  const [data, setData] = useState<T[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await window.fetch(endpoint); if (r.ok) setData(await r.json()); }
    catch {} finally { setLoading(false); }
  }, [endpoint]);
  useEffect(() => { load(); }, [load]);
  return { data, loading, refetch: load };
}

export function useDeleteItem(endpoint: string, refetch: () => void) {
  const { toast } = useToast();
  return async (id: string) => {
    try {
      const r = await window.fetch(`${endpoint}/${id}`, { method: "DELETE" });
      if (!r.ok) throw new Error("Delete failed");
      toast({ title: "Deleted successfully" });
      refetch();
    } catch (e: any) {
      toast({ title: "Error", description: e.message, variant: "destructive" });
    }
  };
}

export function CompanySelect({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>
        {COMPANY_OPTIONS.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
      </SelectContent>
    </Select>
  );
}

export function FormDialog({ open, onOpenChange, title, children, onSave, saving }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string;
  children: React.ReactNode; onSave: () => void; saving?: boolean;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md max-h-[75vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>Fill in the details below.</DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">{children}</div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>Cancel</Button>
          <Button onClick={onSave} disabled={saving}>
            {saving && <Icon name="loader-2" className="animate-spin mr-2" size={16} />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}








