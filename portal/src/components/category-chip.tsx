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
 * Inline style for a category tag. Flat by design: the hue is carried by the
 * text and a leading dot, never by a pastel fill or tinted border.
 */
export function categoryChipStyle(key: string | null | undefined): React.CSSProperties {
  return { color: categoryColor(key) };
}

/**
 * Category label: a colored dot plus the category name. The dot carries the
 * hue so siblings stay distinguishable without a filled chip.
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
      className={cn("gap-1.5 border-transparent bg-transparent font-medium", className)}
      style={categoryChipStyle(category)}
    >
      {icon ?? <CategoryDot category={category} />}
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
      className={cn("inline-block size-2 shrink-0 rounded-full", className)}
      style={{ backgroundColor: categoryColor(category) }}
    />
  );
}
