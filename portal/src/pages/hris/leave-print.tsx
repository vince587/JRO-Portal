import { useParams, Link } from "wouter";
import { Icon } from "@/components/ui/icon"
import { useLeave } from "@/lib/hooks/use-hris";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";

const statusColor: Record<string, string> = {
  pending: "bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-900/20 dark:text-amber-400",
  approved: "bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-400",
  rejected: "bg-red-50 text-red-700 border-red-200 dark:bg-red-900/20 dark:text-red-400",
};

const companyLogos: Record<string, string> = {
  "JMCS": "/JMCS LOGO.png",
  "SIS Certification and Inspection Philippines OPC": "/SIS LOGO.png",
};

const controlNumbers: Record<string, string> = {
  "JMCS": "JMCS-DC-02",
  "SIS Certification and Inspection Philippines OPC": "SISOPC-DC-02",
};

export default function HrisLeavePrint() {
  const params = useParams();
  const id = params?.id;
  const { data: leave, isLoading, isError } = useLeave(id);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-[50vh]">
        <p className="text-muted-foreground">Loading leave request...</p>
      </div>
    );
  }

  if (isError || !leave) {
    return (
      <div className="flex flex-col items-center justify-center h-[50vh] text-center">
        <h2 className="text-2xl font-bold">Leave Not Found</h2>
        <p className="text-muted-foreground mt-2">This leave request does not exist or you don't have access.</p>
        <Button variant="outline" className="mt-4" asChild>
          <Link href="/hris">Back to HRIS</Link>
        </Button>
      </div>
    );
  }

  const logoUrl = companyLogos[leave.company] || null;
  const controlNo = controlNumbers[leave.company] || "JMCS-DC-02";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between no-print">
        <Button variant="ghost" asChild>
          <Link href="/hris"><Icon name="arrow-left" className="mr-2" size={16} /> Back to HRIS</Link>
        </Button>
        <Button onClick={() => window.print()}>
          <Icon name="printer" className="mr-2" size={16} /> Print Form
        </Button>
      </div>

      <Card className="neu rounded-2xl print:shadow-none print:border print:border-gray-300 print:rounded-none" id="leave-form">
        <CardHeader className="text-center border-b pb-6 print:pb-4">
          <div className="flex flex-col items-center gap-3">
            {logoUrl && (
              <img
                src={logoUrl}
                alt={leave.company}
                className="h-16 w-auto object-contain"
              />
            )}
            <div>
              <div className="text-2xl font-bold tracking-tight uppercase">Leave Application Form</div>
              <p className="text-xs text-muted-foreground mt-1">Control No: {controlNo}</p>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-6 print:pt-4 space-y-6">
          <div className="flex justify-between items-center text-sm">
            <span className="text-muted-foreground">Status:</span>
              <Badge variant="outline" className={statusColor[leave.status] || ""}>
                {leave.status === "approved" ? "Admin Approved" : leave.status.charAt(0).toUpperCase() + leave.status.slice(1)}
              </Badge>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-b pb-1">Employee Information</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Employee Name</span>
                <span className="font-medium">{leave.userFullName || leave.userId}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Employee ID</span>
                <span className="font-medium">{leave.employeeId}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-b pb-1">Leave Details</h3>
            <div className="grid sm:grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-muted-foreground block text-xs">Leave Type</span>
                <span className="font-medium">{leave.type}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Number of Days</span>
                <span className="font-medium">{leave.daysCount}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">Start Date</span>
                <span className="font-medium">{leave.startDate}</span>
              </div>
              <div>
                <span className="text-muted-foreground block text-xs">End Date</span>
                <span className="font-medium">{leave.endDate}</span>
              </div>
              <div className="sm:col-span-2">
                <span className="text-muted-foreground block text-xs">Reason</span>
                <span className="font-medium">{leave.reason}</span>
              </div>
            </div>
          </div>

          <div>
            <h3 className="text-sm font-semibold text-muted-foreground uppercase tracking-wide mb-3 border-b pb-1">Approval / Acknowledgment</h3>

            <div className="grid sm:grid-cols-3 gap-8 mt-6 pt-4">
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-16 sm:mt-24">
                  <p className="text-sm font-medium">Employee Signature</p>
                  <p className="text-xs text-muted-foreground mt-1">{leave.userFullName || leave.userId}</p>
                  <p className="text-xs text-muted-foreground">Date: _______________</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-16 sm:mt-24">
                  <p className="text-sm font-medium">Director</p>
                  <p className="text-xs text-muted-foreground mt-1">Jason Russell Aguilar</p>
                  <p className="text-xs text-muted-foreground">Date: _______________</p>
                </div>
              </div>
              <div className="text-center">
                <div className="border-t border-gray-400 pt-2 mt-16 sm:mt-24">
                  <p className="text-sm font-medium">Company Admin</p>
                  <p className="text-xs text-muted-foreground mt-1">Charlene Estrada</p>
                  <p className="text-xs text-muted-foreground">
                    {leave.status === "approved" ? <span className="text-red-600 font-bold text-sm tracking-wider uppercase">Admin Approved</span> : leave.status === "rejected" ? "Rejected" : "Pending"}
                  </p>
                  {leave.approverComment && (
                    <p className="text-xs text-muted-foreground mt-2 italic">
                      "{leave.approverComment}"
                    </p>
                  )}
                  <p className="text-xs text-muted-foreground">Date: _______________</p>
                </div>
              </div>
            </div>
          </div>

          
        </CardContent>
      </Card>

      <style>{`
        @page {
          margin: 0.3in;
          size: auto;
        }
        @media print {
          html, body { background: white !important; height: auto !important; overflow: visible !important; }
          .no-print { display: none !important; }
          [data-sidebar] { display: none !important; }
          header { display: none !important; }
          nav, aside, footer { display: none !important; }
          [role="dialog"] { display: none !important; }
          [data-radix-popper-content-wrapper] { display: none !important; }
          .fixed, .absolute { display: none !important; }
          #leave-form { break-inside: avoid; display: block !important; }
          #leave-form, #leave-form * { visibility: visible !important; }
        }
      `}</style>
    </div>
  );
}
