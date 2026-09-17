import { Link } from "wouter";
import { Icon } from "@/components/ui/icon"
import { useGetMe } from "@workspace/api-client-react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default function AdminDashboard() {
  const { data: currentUser } = useGetMe();

  if (currentUser && !(["ADMIN", "admin"].includes(currentUser.role) || currentUser.roles?.some(r => ["ADMIN", "admin"].includes(r)) || currentUser.canAccessAdmin)) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <Icon name="shield-alert" className="text-destructive mb-4" size={48} />
        <h2 className="text-2xl font-bold">Access Denied</h2>
        <p className="text-muted-foreground mt-2">You do not have company admin privileges to view this page.</p>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-in fade-in duration-500">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight flex items-center gap-2">
            <Icon name="building-2" className="text-primary" size={28} />
            Company Administration
          </h1>
          <p className="text-muted-foreground mt-1">Select a portal to manage.</p>
        </div>
      </div>

      <div className="grid gap-8 md:grid-cols-2 max-w-3xl mx-auto mt-8">
        <Link href="/hris" className="block">
          <Card className="neu rounded-lg hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="users" className="text-primary" size={40} />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">Open HRIS Portal</h2>
                <p className="text-muted-foreground mt-2">Manage employee records, HR documents, and clerical tasks</p>
              </div>
              <Button size="lg" className="mt-4">Open HRIS Portal</Button>
            </CardContent>
          </Card>
        </Link>

        <Link href="/admin/portal" className="block">
          <Card className="neu rounded-lg hover:border-primary/50 hover:shadow-lg transition-all cursor-pointer group border-2">
            <CardContent className="flex flex-col items-center justify-center py-16 gap-6">
              <div className="h-20 w-20 rounded-2xl bg-primary/10 flex items-center justify-center group-hover:scale-110 transition-transform">
                <Icon name="layout-dashboard" className="text-primary" size={40} />
              </div>
              <div className="text-center">
                <h2 className="text-2xl font-bold">Open Admin Portal</h2>
                <p className="text-muted-foreground mt-2">Manage legal files, billing, expenses, and government compliance</p>
              </div>
              <Button size="lg" className="mt-4">Open Admin Portal</Button>
            </CardContent>
          </Card>
        </Link>
      </div>
    </div>
  );
}
