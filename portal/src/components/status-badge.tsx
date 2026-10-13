import { Badge } from "@/components/ui/badge";

/**
 * The five states this system colours, and the tone each maps to.
 * Anything not listed here renders neutral, so an unrecognised status never
 * borrows a colour that already means something else.
 */
export type Tone = "neutral" | "info" | "progress" | "success" | "warning" | "danger";

const toneClass: Record<Tone, string> = {
  neutral: "tone-neutral",
  info: "tone-info",
  progress: "tone-progress",
  success: "tone-success",
  warning: "tone-warning",
  danger: "tone-danger",
};

/**
 * Status vocabularies, keyed by domain. Keeping them here means "pending" looks
 * the same on a contract, a leave request and an invoice.
 */
export const STATUS_TONE: Record<string, Tone> = {
  // Shared across contracts, certificates and projects.
  active: "info",
  pending: "warning",
  completed: "success",
  expired: "danger",
  cancelled: "neutral",
  // Leads.
  new: "neutral",
  contacted: "info",
  qualified: "success",
  lost: "danger",
  // Certificates.
  expiring_soon: "warning",
  // Projects.
  planning: "neutral",
  on_hold: "warning",
  // Requests, attendance, invoicing.
  approved: "success",
  rejected: "danger",
  paid: "success",
  overdue: "danger",
  sent: "info",
  draft: "neutral",
  regular: "success",
  probationary: "warning",
  contractual: "info",
  "part-time": "info",
  intern: "neutral",
  // Business unit.
  SIS: "info",
  JMCS: "success",
};

export function toneFor(status: string | null | undefined): Tone {
  if (!status) return "neutral";
  return STATUS_TONE[status] ?? STATUS_TONE[status.toLowerCase()] ?? "neutral";
}

/** Human label for a status key ("expiring_soon" -> "Expiring Soon"). */
export function statusLabel(status: string | null | undefined): string {
  if (!status) return "—";
  return status.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

interface StatusBadgeProps {
  status: string | null | undefined;
  /** Override the label shown, e.g. to abbreviate. */
  label?: string;
  className?: string;
}

/**
 * Status pill. Colour comes from the status vocabulary rather than a
 * per-page palette, so the same state is the same colour everywhere.
 */
export function StatusBadge({ status, label, className }: StatusBadgeProps) {
  const tone = toneFor(status);
  return (
    <Badge
      variant="outline"
      className={`font-normal ${toneClass[tone]} ${className ?? ""}`}
    >
      {label ?? statusLabel(status)}
    </Badge>
  );
}

interface TonePillProps {
  tone: Tone;
  children: React.ReactNode;
  className?: string;
}

/** Tone pill for counts and summaries that are not a status (e.g. "3 duplicates"). */
export function TonePill({ tone, children, className }: TonePillProps) {
  return (
    <Badge variant="outline" className={`font-normal ${toneClass[tone]} ${className ?? ""}`}>
      {children}
    </Badge>
  );
}

export { toneClass };

/**
 * CSS colour expression for a tone. Use for inline styles where a utility class
 * cannot reach, e.g. an icon tile's tint or a delta line's text colour.
 */
export function toneHex(tone: Tone): string {
  return `hsl(var(--tone-${tone}))`;
}

/** The readable foreground for a tone, for text sitting on a tinted background. */
export function toneFg(tone: Tone): string {
  return `hsl(var(--tone-${tone}-fg))`;
}
