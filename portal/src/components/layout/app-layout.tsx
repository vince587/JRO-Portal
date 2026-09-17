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
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import TutorialOverlay from "@/components/tutorial-overlay";
import { Input } from "@/components/ui/input";
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
import { SidebarProvider, SidebarTrigger, useSidebar } from "@/components/ui/sidebar";
import {
  Command,
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
  return (
    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg overflow-hidden shadow-sm">
      <img src="/logo.png" alt="JMCS" className="h-full w-full object-contain" />
    </div>
  );
}

function SidebarBadge({ value }: { value: number | string }) {
  return (
    <span className="ml-auto inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-primary/10 px-1.5 text-xs font-medium text-primary dark:text-sidebar-accent-foreground">
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
            "relative flex h-9 w-9 items-center justify-center rounded-md transition-colors duration-150",
            active ? "bg-sidebar-accent text-sidebar-accent-foreground" : "text-sidebar-foreground/60 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
          ].join(" ")}
        >
          <Icon name={item.icon} size={18} />
          {item.badge !== undefined && (
            <span className="absolute -right-0.5 -top-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-red-500" />
          )}
        </Link>
        <span className="pointer-events-none absolute left-full top-1/2 z-20 ml-3 -translate-y-1/2 whitespace-nowrap rounded-md bg-zinc-800 px-2.5 py-1 text-xs font-medium text-white opacity-0 shadow-lg transition-opacity duration-200 group-hover/item:opacity-100">
          {item.title}
          <span className="absolute -left-1 top-1/2 h-2 w-2 -translate-y-1/2 rotate-45 bg-zinc-800" />
        </span>
      </div>
    );
  }
  return (
    <Link
      href={item.url}
      className={[
        "group/nav relative flex w-full items-center gap-2.5 rounded-md px-2.5 py-1.5 text-[13px] leading-tight transition-colors duration-150",
        active ? "bg-sidebar-accent font-medium text-sidebar-accent-foreground" : "text-sidebar-foreground/70 hover:bg-sidebar-accent/60 hover:text-sidebar-foreground",
      ].join(" ")}
    >
      {active && (
        <span aria-hidden className="absolute -left-0 top-0 h-full w-[3px] rounded-r-full bg-primary" />
      )}
      <Icon
        name={item.icon}
        size={16}
        className={[
          "shrink-0 transition-colors duration-150",
          active ? "text-primary" : "text-sidebar-foreground/50 group-hover/nav:text-sidebar-foreground",
        ].join(" ")}
      />
      <span className="flex-1 truncate">{item.title}</span>
      {item.badge !== undefined && <SidebarBadge value={item.badge} />}
    </Link>
  );
}

function SidebarSectionLabel({ children, collapsed }: { children: ReactNode; collapsed: boolean }) {
  if (collapsed) return <div className="py-1.5" />;
  return (
    <p className="px-2.5 pb-1 pt-3 text-[10px] font-semibold uppercase tracking-wider text-sidebar-foreground/40">
      {children}
    </p>
  );
}

function AppSidebar({ collapsed = false }: { collapsed?: boolean }) {
  const [location, setLocation] = useLocation();
  const { user, logout } = useAuth();
  const logoutMutation = useLogout();
  const { toast } = useToast();
  const { data: notifications = [] } = useNotifications();
  const navItems = useNavItems();

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

  const getInitials = (name?: string | null) => {
    if (!name) return "U";
    return name.split(" ").map((n) => n[0]).join("").toUpperCase().substring(0, 2);
  };

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
    ...(canAdminPage
      ? [{ key: "admin", title: "Company Admin", url: "/admin", icon: "building-2" }]
      : []),
    ...(canDeveloper
      ? [{ key: "developers", title: "Developers", url: "/developers", icon: "code" }]
      : []),
  ];

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
         collapsed ? "w-16 p-2.5" : "w-64 p-3",
       ].join(" ")}
    >
      {/* Header */}
      <div className={collapsed ? "relative z-10 flex justify-center pb-4" : "relative z-10 flex items-center gap-3 px-1 pb-4"}>
        <SidebarLogo />
        {!collapsed && (
          <div className="leading-tight">
            <p className="font-serif text-base font-bold text-sidebar-foreground">Internal Portal</p>
          </div>
        )}
      </div>

      {/* Navigation */}
       <nav className="relative z-10 flex-1 space-y-0.5 overflow-y-auto scrollbar-hide">
         <SidebarSectionLabel collapsed={collapsed}>Menu</SidebarSectionLabel>
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

        <SidebarSectionLabel collapsed={collapsed}>Insights</SidebarSectionLabel>
        {insightsItems.map((item) => (
          <SidebarNavItem key={item.key} item={item} active={isActive(item.url)} collapsed={collapsed} />
        ))}

        {adminItems.length > 0 && (
          <>
            <SidebarSectionLabel collapsed={collapsed}>Administration</SidebarSectionLabel>
            {adminItems.map((item) => (
              <SidebarNavItem key={item.key} item={item} active={isActive(item.url)} collapsed={collapsed} />
            ))}
          </>
        )}

        <SidebarSectionLabel collapsed={collapsed}>Profile</SidebarSectionLabel>
        <SidebarNavItem
          item={{ key: "profile", title: "My Profile", url: "/profile", icon: "user" }}
          active={isActive("/profile")}
          collapsed={collapsed}
        />
      </nav>

      {/* Footer / Profile */}
      <div className="relative z-10 mt-auto shrink-0 border-t border-sidebar-border pt-4">
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <button
              type="button"
              className={[
                "flex w-full items-center gap-3 rounded-md px-2 py-1.5 text-left transition-colors hover:bg-sidebar-accent/60",
                collapsed ? "justify-center" : "",
              ].join(" ")}
            >
              <Avatar className="h-9 w-9 shrink-0 ring-1 ring-zinc-200">
                <AvatarImage src={(user as any)?.photoUrl || undefined} alt={user?.fullName || user?.username} />
                <AvatarFallback className="bg-red-500 text-sm font-semibold text-white">
                  {getInitials(user?.fullName || user?.username)}
                </AvatarFallback>
              </Avatar>
              {!collapsed && (
                <>
                  <div className="min-w-0 flex-1 leading-tight">
                    <p className="truncate text-sm font-medium text-sidebar-foreground">{user?.fullName || user?.username}</p>
                    <p className="truncate text-xs text-sidebar-foreground/60">{formatRole(user?.role)}</p>
                  </div>
                  <Icon name="more-vertical" size={18} className="text-sidebar-foreground/60" />
                </>
              )}
            </button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="start" side="top" className="w-52">
            <DropdownMenuLabel>My Account</DropdownMenuLabel>
            <DropdownMenuSeparator />
            <DropdownMenuItem onClick={handleLogout} className="cursor-pointer text-destructive">
              <Icon name="log-out" size={16} className="mr-2" />
              Log out
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
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
  const { user, isLoading } = useAuth();
  const [location, setLocation] = useLocation();
  const { data: notifications = [] } = useNotifications();
  const update = useAppUpdate();
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<{ contracts: any[]; certificates: any[]; projects: any[]; users: any[] }>({ contracts: [], certificates: [], projects: [], users: [] });
  const { toast } = useToast();
  const page = getCurrentPage(location);

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
  const dangerCount = notifications.filter(n => n.severity === "danger").length;

  return (
    <SidebarProvider>
      <div className="flex h-screen w-full bg-background overflow-hidden">
        <SidebarShell />
        <div className="flex flex-1 flex-col min-w-0 overflow-hidden relative">
          <header className="relative h-16 shrink-0 border-b border-border/70 bg-white/70 dark:bg-zinc-900/70 backdrop-blur-2xl flex items-center px-4 md:px-6 sticky top-0 z-10 overflow-hidden">
            <div aria-hidden className="pointer-events-none absolute inset-0 -z-0 opacity-60">
              <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-primary/30 to-transparent" />
              <div className="absolute -top-16 left-1/3 h-40 w-40 rounded-full bg-primary/10 blur-3xl" />
              <div className="absolute -top-20 right-1/4 h-44 w-44 rounded-full bg-sky-400/10 blur-3xl" />
              <div className="absolute inset-0" style={{ background: "linear-gradient(90deg, hsl(20 60% 96%) 0%, transparent 35%, transparent 65%, hsl(210 60% 95%) 100%)" }} />
            </div>
            <SidebarTrigger className="relative z-10 mr-4" />
            <div className="relative z-10 flex items-center gap-3 mr-auto">
              <div className="leading-none">
                <h1 className="text-lg font-semibold tracking-tight text-foreground">{page.title}</h1>
              </div>
            </div>
            <div className="relative z-10 flex items-center gap-2">
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="relative rounded-full text-muted-foreground hover:bg-foreground/5 hover:text-foreground transition-colors"
                    aria-label="Notifications"
                  >
                    <Icon name="bell" size={20} />
                    {alertCount > 0 && (
                      <span className="absolute top-0.5 right-0.5 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-500 text-[10px] font-bold text-white px-1 ring-2 ring-white dark:ring-zinc-900">
                        {dangerCount > 0 ? dangerCount : alertCount}
                      </span>
                    )}
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="w-80 max-h-96 overflow-y-auto">
                  <DropdownMenuLabel className="flex items-center gap-2">
                    <Icon name="bell" size={16} />
                    Notifications
                    {alertCount > 0 && (
                      <Badge variant="outline" className="ml-auto text-[10px] h-4 px-1.5 bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-900/30 dark:text-amber-300 dark:border-amber-800">{alertCount}</Badge>
                    )}
                  </DropdownMenuLabel>
                  <DropdownMenuSeparator />
                  {updateAvailable && (
                    <DropdownMenuItem
                      className="p-0"
                      onSelect={(e) => { e.preventDefault(); update.download(); }}
                    >
                      <div className="flex items-start gap-3 px-3 py-2.5 w-full cursor-pointer">
                        <Icon name="refresh-cw" size={16} className="mt-0.5 shrink-0 text-primary" />
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-1.5">
                            <span className="text-sm font-medium text-primary">App update available</span>
                            {update.version && (
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">v{update.version}</span>
                            )}
                          </div>
                          <p className="text-xs text-muted-foreground leading-snug mt-0.5">
                            A new version is ready. Click to download and install.
                          </p>
                        </div>
                      </div>
                    </DropdownMenuItem>
                  )}
                  {notifications.length === 0 && !updateAvailable ? (
                    <div className="px-3 py-6 text-center text-sm text-muted-foreground">No alerts at this time</div>
                  ) : (
                    notifications.map((n) => (
                      <DropdownMenuItem key={n.id} className="p-0" asChild>
                        <Link href={n.link} className="flex items-start gap-3 px-3 py-2.5 w-full">
                          {n.type === "certificate_expiring" ? (
                            <Icon name="shield-alert" size={16} className={`mt-0.5 shrink-0 ${n.severity === "danger" ? "text-red-500" : "text-amber-500"}`} />
                          ) : (
                            <Icon name="clock" size={16} className={`mt-0.5 shrink-0 ${n.severity === "danger" ? "text-red-500" : "text-blue-500"}`} />
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className={`text-sm font-medium ${n.severity === "danger" ? "text-red-600 dark:text-red-400" : ""}`}>{n.title}</span>
                              <span className="text-[10px] text-muted-foreground ml-auto shrink-0">{n.daysUntil === 0 ? "Overdue" : `${n.daysUntil}d`}</span>
                            </div>
                            <p className="text-xs text-muted-foreground leading-snug mt-0.5 line-clamp-2">{n.description}</p>
                          </div>
                        </Link>
                      </DropdownMenuItem>
                    ))
                  )}
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </header>
          <main className="flex-1 overflow-auto paper-canvas p-4 md:p-6 lg:p-8">
            <div className="mx-auto max-w-7xl h-full page-enter">
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
