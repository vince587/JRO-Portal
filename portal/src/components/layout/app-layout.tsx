import React, { ReactNode, useState, useEffect, useCallback, useRef } from "react";
import { Link, useLocation } from "wouter";
import { useAuth } from "@/lib/auth-context";
import { isDesktopApp, isDesktopVerified } from "@/lib/desktop-guard";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import TutorialOverlay from "@/components/tutorial-overlay";
import { UserAvatar } from "@/components/user-avatar";
import { Icon } from "@/components/ui/icon";
import { useLogout } from "@workspace/api-client-react";
import { useToast } from "@/hooks/use-toast";
import { useNotifications } from "@/hooks/use-notifications";
import { useAppUpdate } from "@/hooks/use-app-update";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { SidebarProvider, useSidebar } from "@/components/ui/sidebar";
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from "@/components/ui/command";

const PAGE_TITLES: Record<string, string> = {
  "/": "Dashboard",
  "/contracts": "Contracts",
  "/certificates": "Certificates",
  "/projects": "Projects",
  "/calendar": "Calendar",
  "/library": "Library",
  "/leads": "Leads",
  "/activity": "Activity Log",
  "/profile": "Profile",
  "/employee": "Employee Dashboard",
  "/admin": "Administration",
  "/developers": "Developers",
  "/announcements": "Announcements",
  "/users": "Users",
  "/reports": "Reports",
};

const PAGE_ICONS: Record<string, string> = {
  "/": "layout-dashboard",
  "/contracts": "file-text",
  "/certificates": "shield-check",
  "/projects": "briefcase",
  "/calendar": "calendar-days",
  "/library": "library",
  "/leads": "target",
  "/activity": "history",
  "/profile": "user",
  "/employee": "badge-check",
  "/admin": "building-2",
  "/developers": "code",
  "/announcements": "megaphone",
  "/users": "users",
  "/reports": "chart-pie",
};

function formatRole(role?: string | null) {
  if (!role) return "Member";
  if (["manager", "officer"].includes(role.toLowerCase())) return "Officer";
  return role.charAt(0).toUpperCase() + role.slice(1);
}

function getCurrentPage(location: string): { title: string; icon: string } {
  const path = Object.keys(PAGE_TITLES).find(k => location === k || location.startsWith(k + "/"));
  if (path) return { title: PAGE_TITLES[path], icon: PAGE_ICONS[path] || "layout-dashboard" };
  return { title: "Page", icon: "layout-dashboard" };
}

function useNavItems() {
  const { user } = useAuth();
  const isAdmin = user?.roles?.some(r => ["admin", "ADMIN", "IT", "officer"].includes(r)) || ["admin", "ADMIN", "IT", "officer"].includes(user?.role ?? "") || !!user?.canAccessAdmin;
  const canDevTools = user?.roles?.some(r => ["admin", "ADMIN", "IT"].includes(r)) || ["admin", "ADMIN", "IT"].includes(user?.role ?? "") || !!user?.canAccessDevelopers;
  const canSis = isAdmin || user?.canAccessSis;
  const canJmcs = isAdmin || user?.canAccessJmcs;
  const hasBoth = canSis && canJmcs;

  const contractsUrl = "/contracts";
  const contractsTitle = "Contracts";

  const certsUrl = hasBoth ? "/certificates" : canSis ? "/certificates/iso" : "/certificates/training";
  const certsTitle = hasBoth ? "Certificates" : canSis ? "ISO Certificates" : "Training Certificates";

  return [
    { title: "Dashboard", url: "/", icon: "layout-dashboard" },
    { title: contractsTitle, url: contractsUrl, icon: "file-text" },
    { title: certsTitle, url: certsUrl, icon: "shield-check" },
    { title: "Projects", url: "/projects", icon: "briefcase" },
    { title: "Calendar", url: "/calendar", icon: "calendar-days" },
    { title: "Library", url: "/library", icon: "library" },
    { title: "Leads", url: "/leads", icon: "target" },
    { title: "Announcements", url: "/announcements", icon: "megaphone" },
    ...(canDevTools ? [
      { title: "Users", url: "/users", icon: "users" },
      { title: "Reports", url: "/reports", icon: "chart-pie" },
    ] : []),
  ];
}

function useSessionTimeout() {
  const { toast } = useToast();
  const { logout } = useAuth();
  const [, setLocation] = useLocation();
  const timeoutRef = useRef<ReturnType<typeof setTimeout>>(undefined);

  const resetTimer = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(() => {
      toast({
        title: "Session Expired",
        description: "Your session has timed out due to inactivity.",
        variant: "destructive",
      });
      logout();
      setLocation("/login");
    }, 30 * 60 * 1000);
  }, [logout, setLocation, toast]);

  useEffect(() => {
    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach(e => window.addEventListener(e, resetTimer));
    resetTimer();
    return () => {
      events.forEach(e => window.removeEventListener(e, resetTimer));
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [resetTimer]);
}

/* ───────────────────────── Sidebar pieces ───────────────────────── */

function SidebarLogo() {
  const [imgError, setImgError] = useState(false);
  return (
    <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-emerald-50 dark:bg-emerald-950/40 text-primary overflow-hidden">
      {imgError ? (
        <Icon name="target" size={24} className="text-primary" />
      ) : (
        <img
          src="/logo.png"
          alt="JMCS"
          className="h-full w-full object-contain p-1"
          onError={() => setImgError(true)}
        />
      )}
    </div>
  );
}

function SidebarBadge({ value, onBrand = false }: { value: number | string; onBrand?: boolean }) {
  return (
    <span
      className={[
        "ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full px-1.5 text-xs font-medium tabular",
        onBrand
          ? "bg-primary-foreground/20 text-primary-foreground"
          : "bg-primary/10 text-primary",
      ].join(" ")}
    >
      {value}
    </span>
  );
}

type NavItem = {
  key: string;
  title: string;
  url: string;
  icon: string;
  badge?: number;
};

function SidebarNavItem({ item, active, collapsed }: { item: NavItem; active: boolean; collapsed: boolean }) {
  if (collapsed) {
    return (
      <div className="group/item relative flex justify-center" title={item.title}>
        <Link
          href={item.url}
          className={[
            "relative flex h-10 w-10 items-center justify-center rounded-xl transition-all duration-150",
            active ? "bg-primary text-white shadow-xs" : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-foreground",
          ].join(" ")}
        >
          <Icon name={item.icon} size={18} />
          {item.badge !== undefined && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
          )}
        </Link>
        <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-foreground px-2.5 py-1 text-xs font-medium text-background opacity-0 shadow-lg transition-opacity duration-200 group-hover/item:opacity-100">
          {item.title}
          <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-foreground" />
        </span>
      </div>
    );
  }
  return (
    <Link
      href={item.url}
      aria-current={active ? "page" : undefined}
      className={[
        "group/nav relative flex w-full items-center gap-3 rounded-2xl px-4 py-2.5 text-[13px] font-semibold transition-all duration-150",
        active
          ? "bg-primary text-white shadow-xs font-semibold"
          : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-foreground font-medium",
      ].join(" ")}
    >
      <Icon
        name={item.icon}
        size={17}
        className={[
          "shrink-0 transition-colors duration-150",
          active ? "text-white" : "text-muted-foreground group-hover/nav:text-foreground",
        ].join(" ")}
      />
      <span className="flex-1 truncate">{item.title}</span>
      {item.badge !== undefined && <SidebarBadge value={item.badge} onBrand={active} />}
    </Link>
  );
}

function SidebarSectionLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="py-1.5" />;
  return (
    <p className="px-3 pb-1 pt-3 text-[10px] font-bold uppercase tracking-wider text-muted-foreground/60">
      {children}
    </p>
  );
}

function AppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const [location] = useLocation();
  const { user } = useAuth();
  const { data: notifications = [] } = useNotifications();
  const navItems = useNavItems();

  const notificationIconName = (type: string) => {
    switch (type) {
      case "certificate_expiring": return "shield-alert";
      case "contract_ending": return "clock";
      default: return "alert-triangle";
    }
  };

  const isActive = (url: string) =>
    location === url || (url !== "/" && location.startsWith(url));

  const isAdmin =
    user?.roles?.some(r => ["admin", "ADMIN", "IT", "officer"].includes(r)) ||
    ["admin", "ADMIN", "IT", "officer"].includes(user?.role ?? "") ||
    !!user?.canAccessAdmin;
  const canDeveloper =
    user?.roles?.some(r => ["IT", "ADMIN", "admin"].includes(r)) ||
    ["IT", "ADMIN", "admin"].includes(user?.role ?? "") ||
    !!user?.canAccessDevelopers;
  const canAdminPage =
    user?.roles?.some(r => ["ADMIN", "admin"].includes(r)) ||
    ["ADMIN", "admin"].includes(user?.role ?? "") ||
    !!user?.canAccessAdmin;

  const insightsItems: NavItem[] = [
    { key: "activity", title: "Activity Log", url: "/activity", icon: "history" },
    { key: "employee", title: "Employee Dashboard", url: "/employee", icon: "badge-check" },
  ];

  const adminItems: NavItem[] = [
    { key: "admin", title: "Company Admin", url: "/admin", icon: "building-2" },
    { key: "developers", title: "Developers", url: "/developers", icon: "code" },
  ].filter(item => {
    if (item.key === "admin") return isAdmin || canAdminPage;
    if (item.key === "developers") return canDeveloper;
    return false;
  });

  const alertItems: NavItem[] = notifications.map((n: any) => ({
    key: n.id,
    title: n.title,
    url: n.link,
    icon: notificationIconName(n.type),
    badge: n.daysUntil,
  }));

  return (
    <aside
      className={[
        "relative flex h-full flex-col overflow-hidden border-r border-sidebar-border bg-sidebar transition-all duration-300 scrollbar-hide",
        collapsed ? "w-16 p-2.5" : "w-64 p-4",
      ].join(" ")}
    >
      {/* Brand Header matching PickleDash */}
      <div className={collapsed ? "relative z-10 flex justify-center pb-4" : "relative z-10 flex items-center gap-3 px-1 pb-5 pt-1"}>
        <SidebarLogo />
        {!collapsed && (
          <div className="leading-tight min-w-0">
            <p className="text-base font-extrabold text-foreground tracking-tight">JMCS Portal</p>
            <p className="text-[11px] font-medium text-muted-foreground">Internal Management Pro</p>
          </div>
        )}
      </div>

      {/* Navigation */}
      <nav className="relative z-10 flex-1 space-y-1 overflow-y-auto scrollbar-hide">
        <SidebarSectionLabel collapsed={collapsed}>Main Menu</SidebarSectionLabel>
        {navItems.map((item) => (
          <SidebarNavItem
            key={item.url}
            item={{ key: item.url, title: item.title, url: item.url, icon: item.icon }}
            active={isActive(item.url)}
            collapsed={collapsed}
          />
        ))}

        {alertItems.length > 0 && (
          <>
            <SidebarSectionLabel collapsed={collapsed}>Alerts</SidebarSectionLabel>
            {alertItems.map((item) => (
              <SidebarNavItem key={item.key} item={item} active={isActive(item.url)} collapsed={collapsed} />
            ))}
          </>
        )}

        {insightsItems.length > 0 && (
          <>
            <SidebarSectionLabel collapsed={collapsed}>Insights</SidebarSectionLabel>
            {insightsItems.map((item) => (
              <SidebarNavItem key={item.key} item={item} active={isActive(item.url)} collapsed={collapsed} />
            ))}
          </>
        )}

        {adminItems.length > 0 && (
          <>
            <SidebarSectionLabel collapsed={collapsed}>Administration</SidebarSectionLabel>
            {adminItems.map((item) => (
              <SidebarNavItem key={item.key} item={item} active={isActive(item.url)} collapsed={collapsed} />
            ))}
          </>
        )}
      </nav>

      {/* Bottom Settings */}
      <div className="relative z-10 mt-auto shrink-0 border-t border-sidebar-border pt-3 space-y-1">
        <Link
          href="/profile"
          className={[
            "flex w-full items-center gap-3 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors",
            location === "/profile" ? "bg-primary text-white shadow-xs" : "text-muted-foreground hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-foreground",
            collapsed ? "justify-center" : "",
          ].join(" ")}
        >
          <Icon name="settings" size={16} />
          {!collapsed && <span>Settings</span>}
        </Link>
      </div>
    </aside>
  );
}

function SidebarShell() {
  const { state, openMobile, setOpenMobile } = useSidebar();
  return (
    <>
      <div className="hidden h-screen shrink-0 md:block">
        <AppSidebar collapsed={state === "collapsed"} />
      </div>
      <Sheet open={openMobile} onOpenChange={setOpenMobile}>
        <SheetContent side="left" className="w-64 border-0 bg-transparent p-3 shadow-none scrollbar-hide">
          <SheetHeader className="sr-only">
            <SheetTitle>Navigation</SheetTitle>
          </SheetHeader>
          <AppSidebar />
        </SheetContent>
      </Sheet>
    </>
  );
}

export function AppLayout({ children }: { children: ReactNode }) {
  const { user, isLoading, logout } = useAuth();
  const [location, setLocation] = useLocation();
  const { data: notifications = [] } = useNotifications();
  const update = useAppUpdate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ contracts: any[]; certificates: any[]; projects: any[]; users: any[] }>({ contracts: [], certificates: [], projects: [], users: [] });
  const { toast } = useToast();
  const logoutMutation = useLogout();

  const handleLogout = () => {
    logoutMutation.mutate(undefined, {
      onSuccess: () => {
        logout();
        setLocation("/login");
      },
      onError: () => {
        toast({ title: "Error logging out", variant: "destructive" });
      },
    });
  };

  useSessionTimeout();

  useEffect(() => {
    if (!isLoading && !user && location !== "/login") {
      setLocation("/login");
    }
  }, [isLoading, user, location, setLocation]);

  useEffect(() => {
    if (isLoading || !user) return;
    if (isDesktopApp() || isDesktopVerified()) return;
    if (user.mustChangePassword) return;
    if (location === "/install-required" || location === "/change-password" || location === "/login") return;
    setLocation("/install-required");
  }, [isLoading, user, location, setLocation]);

  useEffect(() => {
    if (isLoading || !user) return;
    if (user.mustChangePassword && location !== "/change-password") {
      setLocation("/change-password");
    } else if (!user.mustChangePassword && location === "/change-password") {
      setLocation("/");
    }
  }, [isLoading, user, location, setLocation]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults({ contracts: [], certificates: [], projects: [], users: [] }); return; }
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/search?q=${encodeURIComponent(searchQuery)}`);
        if (res.ok) setSearchResults(await res.json());
      } catch {}
    }, 300);
    return () => clearTimeout(timer);
  }, [searchQuery]);

  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wider">Please wait...</p>
      </div>
    );
  }

  if (!user && location !== "/login") {
    if (
      typeof window !== "undefined" &&
      !window.location.pathname.startsWith("/login")
    ) {
      window.location.replace("/login");
    }
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wider">Redirecting to login…</p>
      </div>
    );
  }

  const updateAvailable = update.isDesktop && update.phase === "available";
  const alertCount = notifications.length + (updateAvailable ? 1 : 0);

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <SidebarShell />
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden relative">
          {location === "/" && (
          <header className="surface sticky top-0 z-10 flex h-16 shrink-0 items-center overflow-hidden border-b px-4 md:px-6">
            {/* PickleDash Left Header Info */}
            <div className="relative z-10 flex flex-col mr-auto">
              <span className="text-[11px] font-bold text-primary uppercase tracking-tighter">JMCS Organization</span>
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-medium">
                <span className="flex items-center gap-1">
                  <span className="inline-block h-4 w-4 rounded bg-red-500 text-[10px] text-white flex items-center justify-center font-bold">{alertCount}</span>
                  {new Date().toLocaleString("en-US", { weekday: "short", month: "short", day: "numeric", year: "numeric", hour: "2-digit", minute: "2-digit" })}
                </span>
              </div>
            </div>

            {/* PickleDash Center Search */}
            <div className="relative z-10 hidden lg:flex items-center max-w-sm w-full mx-4">
              <Icon name="search" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" size={16} />
              <button 
                onClick={() => setSearchOpen(true)}
                className="w-full h-10 pl-9 pr-4 text-sm text-left text-muted-foreground bg-slate-50 dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl hover:bg-slate-100 transition-colors flex items-center"
              >
                Search contracts, people…
              </button>
            </div>

            <div className="relative z-10 flex items-center gap-4">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <button className="flex items-center gap-2 hover:opacity-80 transition-opacity focus:outline-none">
                    <UserAvatar
                      name={user?.fullName || user?.username}
                      photoUrl={(user as any)?.photoUrl}
                      className="h-9 w-9 ring-2 ring-emerald-100 dark:ring-emerald-900"
                      fallbackClassName="bg-emerald-50 text-emerald-600 text-xs font-semibold dark:bg-emerald-950 dark:text-emerald-400"
                    />
                    <div className="hidden sm:flex flex-col items-start leading-tight">
                      <span className="text-sm font-bold text-foreground truncate max-w-[120px]">{user?.fullName || user?.username}</span>
                      <span className="text-[10px] font-semibold text-muted-foreground uppercase">{formatRole(user?.role)}</span>
                    </div>
                    <Icon name="chevron-down" size={14} className="text-muted-foreground" />
                  </button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-52">
                  <DropdownMenuLabel>My Account</DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  <DropdownMenuItem asChild>
                    <Link href="/profile" className="cursor-pointer">Profile</Link>
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
                    <Icon name="log-out" size={16} className="mr-2" />
                    Log out
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          )}
          <main className="flex-1 overflow-auto paper-canvas p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl h-full">
              {children}
            </div>
          </main>
        </div>
      </div>

      <CommandDialog open={searchOpen} onOpenChange={setSearchOpen}>
        <CommandInput placeholder="Search contracts, certificates, projects, people..." value={searchQuery} onValueChange={setSearchQuery} />
        <CommandList>
          <CommandEmpty>No results found.</CommandEmpty>
          {searchResults.contracts.length > 0 && (
            <CommandGroup heading="Contracts">
              {searchResults.contracts.map((r: any) => (
                <CommandItem key={`c-${r.id}`} onSelect={() => { setLocation(`/contracts/${r.id}`); setSearchOpen(false); }}>
                  <Icon name="file-text" size={16} className="mr-2 text-blue-500" />
                  <span>{r.title}</span>
                  {r.subtitle && <span className="text-xs text-muted-foreground ml-2">({r.subtitle})</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searchResults.certificates.length > 0 && (
            <CommandGroup heading="Certificates">
              {searchResults.certificates.map((r: any) => (
                <CommandItem key={`cert-${r.id}`} onSelect={() => { setLocation(`/certificates/${r.id}`); setSearchOpen(false); }}>
                  <Icon name="shield-check" size={16} className="mr-2 text-amber-500" />
                  <span>{r.title}</span>
                  {r.subtitle && <span className="text-xs text-muted-foreground ml-2">({r.subtitle})</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searchResults.projects.length > 0 && (
            <CommandGroup heading="Projects">
              {searchResults.projects.map((r: any) => (
                <CommandItem key={`p-${r.id}`} onSelect={() => { setLocation(`/projects/${r.id}`); setSearchOpen(false); }}>
                  <Icon name="briefcase" size={16} className="mr-2 text-indigo-500" />
                  <span>{r.title}</span>
                  {r.subtitle && <span className="text-xs text-muted-foreground ml-2">({r.subtitle})</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
          {searchResults.users.length > 0 && (
            <CommandGroup heading="Users">
              {searchResults.users.map((r: any) => (
                <CommandItem key={`u-${r.id}`} onSelect={() => { setSearchOpen(false); }}>
                  <Icon name="users" size={16} className="mr-2 text-muted-foreground" />
                  <span>{r.title}</span>
                  {r.subtitle && <span className="text-xs text-muted-foreground ml-2">({r.subtitle})</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          )}
        </CommandList>
      </CommandDialog>
      <TutorialOverlay />
    </SidebarProvider>
  );
}
