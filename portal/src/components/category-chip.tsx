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
 *
 * Every entry is a solid, dark hue so white text stays readable on top of it.
 */
export const CATEGORY: Record<string, string> = {
  // Calendar event types. Lightness kept in the 26-44% band so white text
  // clears contrast on every swatch.
  meeting: "hsl(204 80% 38%)",
  deadline: "hsl(0 68% 42%)",
  training: "hsl(28 85% 38%)",
  review: "hsl(268 55% 46%)",
  audit: "hsl(142 71% 27%)",
  "lead-audit": "hsl(330 62% 42%)",
  "internal-audit": "hsl(192 75% 33%)",
  other: "hsl(215 20% 38%)",
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
 * Inline style for a category tag: a solid fill in the category colour with
 * white text, so the label stays readable at any size.
 */
export function categoryChipStyle(key: string | null | undefined): React.CSSProperties {
  return { backgroundColor: categoryColor(key), color: "#ffffff", borderColor: "transparent" };
}

/**
 * Category tag: a solid block in the category colour with white text. The fill
 * carries the hue so siblings stay distinguishable without a dot or a pill.
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
      className={cn("gap-1.5 font-medium", className)}
      style={categoryChipStyle(category)}
    >
      {icon}
      {label ?? categoryLabel(category)}
    </Badge>
  );
}
