import { useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { useToast } from "@/hooks/use-toast";

interface AccessEmailsManagerProps {
  basePath?: string; // e.g. "/api/library/folders/:id" or "/api/library/:id". Omit for local-only (unsaved) mode.
  emails: string[];
  onChange: (emails: string[]) => void;
  disabled?: boolean;
}

function isValidEmail(v: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v.trim());
}

/**
 * Lists every external participant with access to a shared material/folder and
 * lets the owner add or remove emails. Each change is persisted through the
 * backend access endpoints, which also fire the grant/revoke emails.
 */
export function AccessEmailsManager({ basePath, emails, onChange, disabled }: AccessEmailsManagerProps) {
  const { toast } = useToast();
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);

  const addEmail = async () => {
    // Support adding several emails at once (comma / space / newline separated).
    const raw = draft.split(/[,\s\n]+/).map(s => s.trim().toLowerCase()).filter(Boolean);
    const valid = raw.filter(isValidEmail);
    const invalid = raw.filter(s => !isValidEmail(s));
    if (valid.length === 0) {
      toast({ title: invalid.length ? "Enter a valid email address" : "Enter at least one email", variant: "destructive" });
      return;
    }
    const newOnes = valid.filter(e => !emails.includes(e));
    if (newOnes.length === 0) {
      toast({ title: "All entered emails already have access" });
      setDraft("");
      return;
    }
    // Local-only mode (unsaved item): update parent state and skip backend.
    if (!basePath) {
      onChange([...emails, ...newOnes]);
      toast({ title: `Added ${newOnes.length} email${newOnes.length === 1 ? "" : "s"}` });
      setDraft("");
      return;
    }
    setBusy(true);
    try {
      // Send all new emails in a single batched request.
      const res = await fetch(`${basePath}/access`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ emails: newOnes }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.accessEmails) {
        onChange(data.accessEmails);
        toast({ title: `Granted access to ${newOnes.length} email${newOnes.length === 1 ? "" : "s"}` });
      } else if (res.status === 409) {
        onChange(data?.accessEmails ?? emails);
        toast({ title: "All entered emails already have access" });
      } else {
        toast({ title: data?.error || "Failed to add email", variant: "destructive" });
      }
      setDraft("");
    } catch {
      toast({ title: "Failed to add email", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  const removeEmail = async (value: string) => {
    if (!basePath) {
      onChange(emails.filter(e => e !== value));
      return;
    }
    setBusy(true);
    try {
      const res = await fetch(`${basePath}/access`, {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: value }),
      });
      const data = await res.json().catch(() => null);
      if (res.ok && data?.accessEmails) {
        onChange(data.accessEmails);
        toast({ title: "Access removed" });
      } else {
        toast({ title: data?.error || "Failed to remove email", variant: "destructive" });
      }
    } catch {
      toast({ title: "Failed to remove email", variant: "destructive" });
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-1.5">
        {emails.length === 0 ? (
          <p className="text-xs text-muted-foreground">No participants have access yet.</p>
        ) : (
          emails.map((e) => (
            <span
              key={e}
              className="inline-flex items-center gap-1.5 rounded-full bg-blue-50 px-2.5 py-1 text-xs font-medium text-blue-700"
            >
              <Icon name="mail" size={12} />
              {e}
              {!disabled && (
                <button
                  type="button"
                  onClick={() => removeEmail(e)}
                  disabled={busy}
                  className="ml-0.5 rounded-full p-0.5 text-blue-400 transition-colors hover:bg-blue-100 hover:text-blue-700 disabled:opacity-50"
                  aria-label={`Remove ${e}`}
                >
                  <Icon name="x" size={12} />
                </button>
              )}
            </span>
          ))
        )}
      </div>
      {!disabled && (
        <div className="flex items-center gap-2">
          <Input
            value={draft}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addEmail(); } }}
            placeholder="add email(s), separate with comma"
            className="text-sm"
          />
          <Button type="button" size="sm" variant="outline" onClick={addEmail} disabled={busy || !draft.trim()}>
            <Icon name="plus" size={14} className="mr-1" /> Add
          </Button>
        </div>
      )}
    </div>
  );
}
