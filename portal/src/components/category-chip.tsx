import type { ReactNode } from "react";
import { Badge } from "@/components/ui/badge";
import { cn } from "@/lib/utils";

/**
 * Categorical palette, for cases where colour distinguishes siblings rather
 * than conveying state.
 *
 * Use `--tone-*` (see status-badge.tsx) when a colour *means* something -
 * active, expired, approved. Use this when the colours only need to be told
 * apart, like the calendar's seven event types. Collapsing a categorical
 * palette onto tones is how you end up with two different event types wearing
 * the same colour.
 */
export const CATEGORY: Record<string, string> = {
  // Calendar event types.
  meeting: "hsl(var(--chart-2))",
  deadline: "hsl(var(--chart-4))",
  training: "hsl(var(--chart-3))",
  review: "hsl(var(--chart-5))",
  audit: "hsl(var(--chart-1))",
  "lead-audit": "hsl(var(--chart-7))",
  "internal-audit": "hsl(var(--chart-6))",
  other: "hsl(var(--muted-foreground))",
};

/** Human label for a category key ("lead-audit" -> "Lead Audit"). */
export function categoryLabel(key: string | null | undefined): string {
  if (!key) return "—";
  return key
    .replace(/-/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

export function categoryColor(key: string | null | undefined): string {
  return CATEGORY[key ?? ""] ?? CATEGORY.other;
}

/**
 * Inline style for a category chip: a 14% wash of the category colour behind
 * full-strength text, with a faint border of the same hue. Use this when the
 * element is a plain tag rather than a <Badge>.
 */
export function categoryChipStyle(key: string | null | undefined): React.CSSProperties {
  const colour = categoryColor(key);
  return {
    backgroundColor: `color-mix(in oklab, ${colour} 14%, transparent)`,
    borderColor: `color-mix(in oklab, ${colour} 28%, transparent)`,
    color: colour,
  };
}

/**
 * Filled chip in a category colour: a 14% wash behind text in the full colour.
 * Unlike a tone chip, the hue is the point - do not collapse it onto a tone.
 */
export function CategoryChip({
  category,
  label,
  className,
  icon,
}: {
  category: string | null | undefined;
  label?: ReactNode;
  className?: string;
  icon?: ReactNode;
}) {
  return (
    <Badge
      variant="outline"
      className={cn("font-normal", className)}
      style={categoryChipStyle(category)}
    >
      {icon}
      {label ?? categoryLabel(category)}
    </Badge>
  );
}

/** Small solid dot in a category colour, for legends and list rows. */
export function CategoryDot({
  category,
  className,
}: {
  category: string | null | undefined;
  className?: string;
}) {
  return (
    <span
      aria-hidden
      className={cn("inline-block size-2.5 shrink-0 rounded-full", className)}
      style={{ backgroundColor: categoryColor(category) }}
    />
  );
}
