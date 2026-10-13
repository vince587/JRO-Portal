import type { ReactNode } from "react";
import { Icon } from "@/components/ui/icon";
import { toneHex, type Tone } from "@/components/status-badge";

interface PageHeaderProps {
  title: string;
  /** One line describing what the screen is for. Optional. */
  description?: string;
  /** Primary and secondary actions, right-aligned. */
  actions?: ReactNode;
  /**
   * Breadcrumb shown above the title, e.g. a Back link. Rendered small and
   * muted so it reads as navigation rather than content.
   */
  back?: { label: string; href?: string; onClick?: () => void };
  icon?: string;
}

/**
 * The single page-heading pattern. Previously each page built its own: some had
 * an icon and an h1, some had a bare muted paragraph, some had both. This keeps
 * title size, spacing and action alignment identical everywhere.
 */
export function PageHeader({ title, description, actions, back, icon }: PageHeaderProps) {
  return (
    <header className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
      <div className="min-w-0">
        {back && (
          back.href ? (
            <a
              href={back.href}
              className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="arrow-left" size={13} />
              {back.label}
            </a>
          ) : (
            <button
              type="button"
              onClick={back.onClick}
              className="mb-1.5 inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground transition-colors hover:text-foreground"
            >
              <Icon name="arrow-left" size={13} />
              {back.label}
            </button>
          )
        )}
        <h1 className="flex items-center gap-2 text-lg font-semibold tracking-tight text-foreground">
          {icon && <Icon name={icon} className="shrink-0 text-primary" size={18} />}
          <span className="truncate">{title}</span>
        </h1>
        {description && <p className="mt-0.5 text-sm text-muted-foreground">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
    </header>
  );
}

/** Standard page body: vertical rhythm, short entrance, no fade-out delay. */
export function Page({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`page-enter space-y-6 ${className}`}>{children}</div>;
}

/**
 * Tiles that open a report or section.
 *
 * Replaces a pattern that was copy-pasted per card: a 5rem coloured blob that
 * scaled on hover, an oversized shadow lift, and a nested button inside a
 * clickable card. The whole tile is the target, the affordance is a chevron that
 * slides on hover, and keyboard users get a real button rather than a div with a
 * click handler.
 */
export function ReportCard({
  title,
  description,
  icon,
  tone = "info",
  onSelect,
}: {
  title: string;
  description: string;
  icon: string;
  tone?: Tone;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      className="surface group flex w-full items-start gap-4 rounded-lg p-5 text-left transition-colors hover:border-primary/40 hover:bg-accent focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
    >
      <span className="icon-tile" style={{ ["--tile-tone" as string]: toneHex(tone) }}>
        <Icon name={icon} size={18} />
      </span>
      <span className="min-w-0 flex-1">
        <span className="block text-base font-semibold text-foreground">{title}</span>
        <span className="mt-0.5 block text-sm text-muted-foreground">{description}</span>
      </span>
      <Icon
        name="chevron-right"
        size={16}
        className="mt-1 shrink-0 text-muted-foreground transition-transform group-hover:translate-x-0.5"
      />
    </button>
  );
}
