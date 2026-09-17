import { useState } from "react";
import { Icon } from "@/components/ui/icon";

type NavItem = {
  icon: string;
  label: string;
  badge?: number;
  active?: boolean;
  chevron?: boolean;
};

type NavSection = {
  label: string;
  items: NavItem[];
};

const SECTIONS: NavSection[] = [
  {
    label: "MAIL",
    items: [
      { icon: "mail", label: "Inbox", badge: 14 },
      { icon: "message-circle", label: "Messages", badge: 9 },
      { icon: "download", label: "Downloads", badge: 5 },
    ],
  },
  {
    label: "CONTENT",
    items: [
      { icon: "tag", label: "Tags" },
      { icon: "file-text", label: "Documents" },
      { icon: "pencil", label: "Drafts" },
    ],
  },
  {
    label: "ACCOUNT",
    items: [
      { icon: "wrench", label: "Settings" },
      { icon: "user", label: "Profile" },
      { icon: "user", label: "Manage", badge: 2, active: true, chevron: true },
    ],
  },
];

function Logo() {
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-red-500 text-lg font-bold text-white shadow-sm">
      A
    </div>
  );
}

function Badge({ value }: { value: number }) {
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-secondary px-1.5 text-xs font-medium text-muted-foreground">
      {value}
    </span>
  );
}

/* ---------- Expanded Sidebar ---------- */
function ExpandedSidebar() {
  return (
    <aside className="flex h-[640px] w-64 flex-col rounded-xl bg-white p-4 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300">
      {/* Header */}
      <div className="flex items-center gap-3 px-1 pb-5">
        <Logo />
        <div className="leading-tight">
          <p className="text-sm font-bold text-foreground">Product title</p>
          <p className="text-xs text-muted-foreground">v 1.0</p>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 space-y-5 overflow-y-auto">
        {SECTIONS.map((section) => (
          <div key={section.label}>
            <p className="px-3 pb-2 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">
              {section.label}
            </p>
            <ul className="space-y-1">
              {section.items.map((item) => (
                <li key={item.label}>
                  <button
                    type="button"
                    className={[
                      "flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm transition-all duration-200",
                      item.active
                        ? "bg-secondary font-medium text-foreground"
                        : "text-foreground/70 hover:bg-muted/60 hover:text-foreground",
                    ].join(" ")}
                  >
                    <Icon name={item.icon} size={18} className="shrink-0 text-muted-foreground" />
                    <span className="flex-1 text-left">{item.label}</span>
                    {item.badge !== undefined && <Badge value={item.badge} />}
                    {item.chevron && (
                      <Icon name="chevron-right" size={16} className="text-muted-foreground" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Footer / Profile */}
      <div className="mt-4 flex items-center gap-3 border-t border-border pt-4">
        <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-indigo-400 to-purple-500 text-sm font-semibold text-white">
          JD
        </div>
        <div className="min-w-0 flex-1 leading-tight">
          <p className="truncate text-sm font-medium text-foreground">Jane Doe</p>
          <p className="truncate text-xs text-muted-foreground">jane@company.com</p>
        </div>
        <button
          type="button"
          className="rounded-md p-1 text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground/70"
          aria-label="Options"
        >
          <Icon name="more-vertical" size={18} />
        </button>
      </div>
    </aside>
  );
}

/* ---------- Collapsed Sidebar ---------- */
function CollapsedIconButton({
  item,
  tooltip,
  active,
}: {
  item: NavItem;
  tooltip?: string;
  active?: boolean;
}) {
  return (
    <div className="group/item relative flex justify-center">
      <button
        type="button"
        className={[
          "relative flex h-10 w-10 items-center justify-center rounded-lg transition-all duration-200",
          active
            ? "bg-secondary text-foreground ring-1 ring-gray-200"
            : "text-muted-foreground hover:bg-muted/60 hover:text-foreground",
        ].join(" ")}
      >
        <Icon name={item.icon} size={20} />
        {item.badge !== undefined && (
          <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
        )}
      </button>
      {tooltip && (
        <span className="pointer-events-none absolute left-full top-1/2 z-10 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-gray-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover/item:opacity-100">
          {tooltip}
          <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-gray-800" />
        </span>
      )}
    </div>
  );
}

function CollapsedSidebar() {
  const allItems = SECTIONS.flatMap((s) => s.items);
  return (
    <aside className="flex h-[640px] w-16 flex-col items-center rounded-xl bg-white p-3 shadow-[0_1px_3px_rgba(0,0,0,0.08),0_8px_24px_rgba(0,0,0,0.06)] transition-all duration-300">
      {/* Logo */}
      <div className="pb-5">
        <Logo />
      </div>

      {/* Icons */}
      <nav className="flex flex-1 flex-col items-center gap-2">
        {allItems.map((item) => (
          <CollapsedIconButton
            key={item.label}
            item={item}
            tooltip={item.active ? "Manage" : undefined}
            active={item.active}
          />
        ))}
      </nav>
    </aside>
  );
}

/* ---------- Showcase (side-by-side) ---------- */
export function SidebarShowcase() {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div className="min-h-screen w-full bg-background p-6 md:p-10">
      <div className="mx-auto flex max-w-4xl flex-col items-center gap-8 md:flex-row md:items-start md:gap-10">
        <div className="flex flex-col items-center gap-3">
          <ExpandedSidebar />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Expanded</p>
        </div>

        <div className="flex flex-col items-center gap-3">
          <CollapsedSidebar />
          <p className="text-xs font-medium uppercase tracking-wider text-muted-foreground">Collapsed</p>
        </div>

        <div className="flex flex-col items-start gap-3 self-center">
          <button
            type="button"
            onClick={() => setCollapsed((c) => !c)}
            className="rounded-lg bg-white px-4 py-2 text-sm font-medium text-foreground/80 shadow-sm transition-colors hover:bg-muted/60"
          >
            Toggle state (demo)
          </button>
          <p className="max-w-[200px] text-xs leading-relaxed text-muted-foreground">
            Two polished states rendered side-by-side for reference. Hover the
            collapsed <span className="font-medium text-muted-foreground">Manage</span> icon
            to preview the tooltip.
          </p>
        </div>
      </div>
    </div>
  );
}

export default SidebarShowcase;
