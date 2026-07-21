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
    <div className="min-h-screen w-full flex items-center justify-center bg-gray-50">
      <div className="text-center max-w-md mx-4">
        <h1 className="text-2xl font-bold text-gray-900 mb-2">JMCS Materials</h1>
        <p className="text-sm text-gray-600">
          Please use the link from your email to access your materials.
        </p>
      </div>
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
