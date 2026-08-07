import { Switch, Route, Router as WouterRouter, useLocation } from "wouter";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { AuthProvider } from "@/lib/auth-context";
import { AppLayout } from "@/components/layout/app-layout";
import { UpdateNotifier } from "@/components/update-notifier";
import { SseInit } from "@/hooks/use-sse";
import { useAuth } from "@/lib/auth-context";
import { isMobileDevice } from "@/lib/mobile-detect";
import { usePublicRedirect } from "@/lib/use-public-redirect";
import { Icon } from "@/components/ui/icon";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";

import Login from "@/pages/login";
import Welcome from "@/pages/welcome";
import InstallRequired from "@/pages/install-required";
import ChangePassword from "@/pages/change-password";
import Dashboard from "@/pages/dashboard";
import ContractsList from "@/pages/contracts/index";
import ContractDetail from "@/pages/contracts/detail";
import CertificatesList from "@/pages/certificates/index";
import CertificateDetail from "@/pages/certificates/detail";
import CertificateNew from "@/pages/certificates/new";
import ProjectsList from "@/pages/projects/index";
import ProjectDetail from "@/pages/projects/detail";
import ClientProgress from "@/pages/client-progress";
import Calendar from "@/pages/calendar";
import Library from "@/pages/library";
import LibraryView from "@/pages/library-view";
import LibraryFolderView from "@/pages/library-folder-view";
import Admin from "@/pages/admin/index";
import AdminLegalFiles from "@/pages/admin/legal-files";
import AdminInvoices from "@/pages/admin/invoices";
import AdminExpenses from "@/pages/admin/expenses";
import AdminRemittances from "@/pages/admin/remittances";
import AdminCalendar from "@/pages/admin/calendar";
import AdminPortal from "@/pages/admin/portal";
import Developers from "@/pages/developers";
import HrisList from "@/pages/hris/index";
import HrisEmployeeDetail from "@/pages/hris/detail";
import HrisLeavePrint from "@/pages/hris/leave-print";
import HrisTimeCardReport from "@/pages/hris/time-card-report";
import HrisDailyTimeRecord from "@/pages/hris/daily-time-record";
import EmployeeDashboard from "@/pages/employee/dashboard";
import ActivityAudit from "@/pages/activity-audit";
import Profile from "@/pages/profile";
import Leads from "@/pages/leads";

import NotFound from "@/pages/not-found";

function isPublicViewerDomain(): boolean {
  return window.location.hostname === "materials.jro-jmcs.com";
}

function PublicRoot() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      {/* Header */}
      <header className="border-b border-muted/30">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center gap-3">
          <div className="h-10 w-10 rounded-xl overflow-hidden shadow-sm">
            <img src="/logo internal.png" alt="JMCS" className="h-full w-full object-contain" />
          </div>
          <div>
            <p className="text-sm font-semibold text-foreground leading-tight">JMCS</p>
            <p className="text-[11px] text-muted-foreground">Materials Portal</p>
          </div>
        </div>
      </header>

      {/* Hero */}
      <main className="flex-1 flex flex-col items-center justify-center px-4 py-16">
        <Card className="w-full max-w-lg mx-auto">
          <CardContent className="pt-10 pb-8 px-8 text-center">
            <div className="inline-flex items-center justify-center w-20 h-20 rounded-2xl bg-primary/10 mb-6">
              <Icon name="library" className="text-primary" size={36} />
            </div>
            <CardTitle className="text-2xl font-bold text-foreground mb-2">JMCS Materials</CardTitle>
            <CardDescription className="text-base max-w-sm mx-auto mb-8">
              Please use the link from your email to access your shared materials and training resources.
            </CardDescription>

            <Separator className="mb-6" />

            <p className="text-sm text-muted-foreground/60 leading-relaxed max-w-sm mx-auto">
              If you were sent materials to review, check your email for a personalized link.
              Protected materials require an access code sent to your registered email address.
            </p>

            <div className="mt-8 flex flex-col items-center gap-3 text-xs text-muted-foreground/50">
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/50">
                  <Icon name="lock" size={12} />
                </div>
                <span>End-to-end encrypted delivery</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/50">
                  <Icon name="eye" size={12} />
                </div>
                <span>View-only — no download required</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-muted/50">
                  <Icon name="clock" size={12} />
                </div>
                <span>Access expires automatically after set period</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Help prompt */}
        <div className="mt-8 text-center max-w-md">
          <p className="text-xs text-muted-foreground/50">
            Need help? Contact your JMCS representative or IT support.
          </p>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-muted/30 py-4">
        <div className="max-w-3xl mx-auto px-4 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="h-6 w-6 rounded-md overflow-hidden">
              <img src="/logo internal.png" alt="JMCS" className="h-full w-full object-contain" />
            </div>
            <span className="text-[11px] text-muted-foreground">JMCS Materials Portal</span>
          </div>
          <span className="text-[11px] text-muted-foreground/40">&copy; {new Date().getFullYear()} JMCS. All rights reserved.</span>
        </div>
      </footer>
    </div>
  );
}

function PublicRouter() {
  return (
    <Switch>
      <Route path="/client-progress/:id" component={ClientProgress} />
      <Route path="/library/folder/:id" component={LibraryFolderView} />
      <Route path="/library/:id" component={LibraryView} />
      <Route path="/" component={PublicRoot} />
      <Route component={NotFound} />
    </Switch>
  );
}

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      retry: 1,
      refetchOnWindowFocus: false,
    },
  },
});

function ProtectedRoute({ component: Component }: { component: React.ComponentType<any> }) {
  return (
    <AppLayout>
      <Component />
    </AppLayout>
  );
}

function AuthenticatedSseInit() {
  const { user } = useAuth();
  if (!user) return null;
  return <SseInit />;
}

function LibraryEntry() {
  const { user, isLoading } = useAuth();
  const [params] = useLocation();
  const redirected = usePublicRedirect(!user && !isLoading);
  // Participants reach this route by editing/deleting the share token. When no
  // valid session exists, send them to the public participant portal instead of
  // the staff login page.
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wider">Please wait...</p>
      </div>
    );
  }
  if (!user) {
    if (redirected) return null;
    if (params.startsWith("/library/folder")) return <LibraryFolderView />;
    return <LibraryView />;
  }
  return (
    <AppLayout>
      <Library />
    </AppLayout>
  );
}

function RootEntry() {
  const { user, isLoading } = useAuth();
  const redirected = usePublicRedirect(!user && !isLoading);
  if (isLoading) {
    return (
      <div className="min-h-screen bg-background flex flex-col items-center justify-center">
        <p className="text-muted-foreground text-sm font-medium tracking-wider">Please wait...</p>
      </div>
    );
  }
  // Anonymous visitors (e.g. a participant who mangled a share link down to the
  // bare domain) are sent to the public participant portal, never the staff login.
  if (!user) {
    if (redirected) return null;
    const token = new URLSearchParams(window.location.search).get("token");
    if (token) {
      const code = new URLSearchParams(window.location.search).get("code");
      const codeParam = code ? `?code=${code}` : "";
      window.location.replace(`/library/${token}${codeParam}`);
      return null;
    }
    return <Login />;
  }
  return (
    <AppLayout>
      <Dashboard />
    </AppLayout>
  );
}

function Router() {
  if (isPublicViewerDomain()) {
    return <PublicRouter />;
  }

  return (
    <Switch>
      <Route path="/login" component={Login} />
      <Route path="/welcome" component={Welcome} />
      <Route path="/install-required" component={InstallRequired} />
      <Route path="/change-password" component={ChangePassword} />
      
      <Route path="/">
        <RootEntry />
      </Route>
      
      <Route path="/contracts/sis">
        <ProtectedRoute component={ContractsList} />
      </Route>

      <Route path="/contracts/jmcs">
        <ProtectedRoute component={ContractsList} />
      </Route>

      <Route path="/contracts">
        <ProtectedRoute component={ContractsList} />
      </Route>
      
      <Route path="/contracts/:id">
        <ProtectedRoute component={ContractDetail} />
      </Route>
      
      <Route path="/certificates/iso">
        <ProtectedRoute component={CertificatesList} />
      </Route>

      <Route path="/certificates/training">
        <ProtectedRoute component={CertificatesList} />
      </Route>

      <Route path="/certificates">
        <ProtectedRoute component={CertificatesList} />
      </Route>
      
      <Route path="/certificates/:id">
        <ProtectedRoute component={CertificateDetail} />
      </Route>

      <Route path="/certificates/new">
        <ProtectedRoute component={CertificateNew} />
      </Route>
      
      <Route path="/projects">
        <ProtectedRoute component={ProjectsList} />
      </Route>
      
      <Route path="/projects/:id">
        <ProtectedRoute component={ProjectDetail} />
      </Route>
      
      <Route path="/calendar">
        <ProtectedRoute component={Calendar} />
      </Route>

      <Route path="/library/folder" component={LibraryFolderView} />

      <Route path="/library/folder/:id" component={LibraryFolderView} />

      <Route path="/library">
        <LibraryEntry />
      </Route>

      <Route path="/library/:id" component={LibraryView} />

      <Route path="/activity">
        <ProtectedRoute component={ActivityAudit} />
      </Route>

      <Route path="/profile">
        <ProtectedRoute component={Profile} />
      </Route>
      
      <Route path="/leads">
        <ProtectedRoute component={Leads} />
      </Route>

      <Route path="/admin/legal-files">
        <ProtectedRoute component={AdminLegalFiles} />
      </Route>
      <Route path="/admin/invoices">
        <ProtectedRoute component={AdminInvoices} />
      </Route>
      <Route path="/admin/expenses">
        <ProtectedRoute component={AdminExpenses} />
      </Route>
      <Route path="/admin/remittances">
        <ProtectedRoute component={AdminRemittances} />
      </Route>
      <Route path="/admin/calendar">
        <ProtectedRoute component={AdminCalendar} />
      </Route>
      <Route path="/admin/portal">
        <ProtectedRoute component={AdminPortal} />
      </Route>
      <Route path="/admin">
        <ProtectedRoute component={Admin} />
      </Route>

      <Route path="/developers">
        <ProtectedRoute component={Developers} />
      </Route>

      <Route path="/employee">
        <ProtectedRoute component={EmployeeDashboard} />
      </Route>

      <Route path="/hris">
        <ProtectedRoute component={HrisList} />
      </Route>

      <Route path="/hris/leaves/:id">
        <ProtectedRoute component={HrisLeavePrint} />
      </Route>

      <Route path="/hris/time-card-report">
        <ProtectedRoute component={HrisTimeCardReport} />
      </Route>

      <Route path="/hris/daily-time-record/:id">
        <ProtectedRoute component={HrisDailyTimeRecord} />
      </Route>

      <Route path="/hris/daily-time-record">
        <ProtectedRoute component={HrisDailyTimeRecord} />
      </Route>

      <Route path="/hris/:id">
        <ProtectedRoute component={HrisEmployeeDetail} />
      </Route>
      
      <Route component={NotFound} />
    </Switch>
  );
}

function MobileBlocked() {
  return (
    <div
      className="min-h-screen w-full flex items-center justify-center p-6"
      style={{ backgroundColor: "#ffffff" }}
    >
      <div className="text-center">
        <h1 className="text-6xl font-bold text-gray-900 mb-3">404</h1>
        <p className="text-base text-gray-600">This page could not be found.</p>
      </div>
    </div>
  );
}

function App() {
  if (isMobileDevice()) {
    return <MobileBlocked />;
  }
  return (
      <ThemeProvider attribute="class" forcedTheme="light" defaultTheme="light" disableTransitionOnChange>
        <QueryClientProvider client={queryClient}>
        <AuthProvider>
          <AuthenticatedSseInit />
          <TooltipProvider>
            <WouterRouter>
              <Router />
            </WouterRouter>
            <UpdateNotifier />
            <Toaster />
          </TooltipProvider>
        </AuthProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

export default App;
