import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { cn } from "@/lib/utils";
import { toneHex, type Tone } from "@/components/status-badge";

interface StatTileProps {
  /** Small uppercase label. Reads as a category, not a sentence. */
  label: string;
  value: ReactNode;
  icon?: string;
  /** Tints the icon tile and left indicator bar. Defaults to brand progress tone. */
  tone?: Tone;
  /**
   * Short line under the figure, e.g. "+12% this month" or "3 need renewal".
   */
  detail?: string;
  detailTone?: Tone;
  className?: string;
}

/**
 * StatTile matching the PickleDash visual style:
 * Clean white card with high border radius (rounded-2xl), colored indicator bar on the left edge,
 * pastel tinted icon badge on top right, large bold figure, and colored status line below.
 */
export function StatTile({
  label,
  value,
  icon,
  tone = "progress",
  detail,
  detailTone = "success",
  className,
}: StatTileProps) {
  return (
    <div
      className={cn(
        "surface relative overflow-hidden rounded-2xl p-5 border border-border/80 shadow-xs hover:shadow-md transition-all flex flex-col justify-between border-l-[5px]",
        className,
      )}
      style={{ borderLeftColor: toneHex(tone) }}
    >
      <div className="flex items-start justify-between gap-3 mb-2">
        <p className="text-[11px] font-bold uppercase tracking-wider text-muted-foreground/80">
          {label}
        </p>
        {icon && (
          <span
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl transition-transform"
            style={{
              backgroundColor: `color-mix(in oklab, ${toneHex(tone)} 15%, transparent)`,
              color: toneHex(tone),
            }}
          >
            <Icon name={icon} size={20} strokeWidth={2.2} />
          </span>
        )}
      </div>

      <div>
        <p className="text-3xl font-extrabold leading-tight tracking-tight tabular text-foreground">
          {value}
        </p>
        {detail && (
          <p
            className="mt-2 text-xs font-semibold flex items-center gap-1.5"
            style={{ color: toneHex(detailTone) }}
          >
            {detail}
          </p>
        )}
      </div>
    </div>
  );
}

interface BannerProps {
  title: ReactNode;
  description?: ReactNode;
  /** Rendered on the trailing side, e.g. a clock or a call to action. */
  trailing?: ReactNode;
  /** Large faint glyph bled off the trailing edge. */
  watermark?: string;
  className?: string;
}

/**
 * Solid forest green brand banner with high border radius (rounded-3xl).
 */
export function Banner({
  title,
  description,
  trailing,
  watermark,
  className,
}: BannerProps) {
  return (
    <section className={cn("relative overflow-hidden rounded-3xl bg-primary text-primary-foreground p-6 sm:p-8 shadow-sm", className)}>
      {watermark && (
        <Icon
          name={watermark}
          size={148}
          strokeWidth={1.2}
          className="absolute right-2 -bottom-4 opacity-15 pointer-events-none select-none text-white"
        />
      )}
      <div className="relative z-10 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-extrabold leading-tight tracking-tight text-white sm:text-3xl">
            {title}
          </h1>
          {description && (
            <p className="mt-2 max-w-2xl text-sm leading-relaxed text-emerald-100/90 font-normal">
              {description}
            </p>
          )}
        </div>
        {trailing && <div className="shrink-0 text-white">{trailing}</div>}
      </div>
    </section>
  );
}
