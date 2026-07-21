import { useEffect, useState } from "react";
import { Icon } from "@/components/ui/icon";
import { Button } from "@/components/ui/button";

const GUIDE_KEY = "jmcs-quick-guide-seen";

const steps = [
  {
    icon: <Icon name="layout-dashboard" size={20} />,
    title: "Dashboard",
    desc: "View system status, contract values, KPI overview, recent activity, and expiring items at a glance.",
  },
  {
    icon: <Icon name="shield-check" size={20} />,
    title: "Certificates",
    desc: "Manage training and ISO certificates. Generate QR codes, upload attachments, and track expiration dates.",
  },
  {
    icon: <Icon name="file-text" size={20} />,
    title: "Contracts",
    desc: "Create and manage contracts. Track status, upload documents, and monitor contract timelines.",
  },
  {
    icon: <Icon name="briefcase" size={20} />,
    title: "Projects",
    desc: "Oversee projects, assign tasks, track progress, and manage priorities across your organization.",
  },
  {
    icon: <Icon name="calendar-days" size={20} />,
    title: "Calendar",
    desc: "Schedule events, set reminders, and keep track of important dates and deadlines.",
  },
  {
    icon: <Icon name="target" size={20} />,
    title: "Leads",
    desc: "Track and manage sales leads, monitor conversions, and follow up with potential clients.",
  },
  {
    icon: <Icon name="users" size={20} />,
    title: "Admin",
    desc: "Manage user accounts, roles, permissions, and system settings from the admin panel.",
  },
];

export default function QuickGuideModal() {
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);

  useEffect(() => {
    const seen = localStorage.getItem(GUIDE_KEY);
    if (!seen) {
      setOpen(true);
    }
  }, []);

  function handleClose() {
    localStorage.setItem(GUIDE_KEY, "true");
    setOpen(false);
  }

  if (!open) return null;

  const step = steps[currentStep];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-background rounded-xl shadow-2xl border border-border w-full max-w-lg mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b">
          <h2 className="text-lg font-bold tracking-tight">Quick Guide</h2>
          <button onClick={handleClose} className="text-muted-foreground hover:text-foreground transition-colors">
            <Icon name="x" size={20} />
          </button>
        </div>

        <div className="px-6 py-6">
          <div className="flex items-center gap-3 mb-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10 text-primary shrink-0">
              {step.icon}
            </div>
            <div>
              <h3 className="font-semibold text-base">{step.title}</h3>
              <p className="text-xs text-muted-foreground">Step {currentStep + 1} of {steps.length}</p>
            </div>
          </div>
          <p className="text-sm text-muted-foreground leading-relaxed">{step.desc}</p>
        </div>

        <div className="flex items-center justify-between px-6 py-4 border-t bg-muted/20">
          <div className="flex gap-1.5">
            {steps.map((_, i) => (
              <div
                key={i}
                className={`h-2 w-2 rounded-full transition-colors ${i === currentStep ? "bg-primary" : "bg-muted-foreground/20"}`}
              />
            ))}
          </div>
          <div className="flex items-center gap-2">
            {currentStep < steps.length - 1 ? (
              <>
                <Button variant="ghost" size="sm" onClick={handleClose}>Skip</Button>
                <Button size="sm" onClick={() => setCurrentStep(s => s + 1)}>
                  Next <Icon name="chevron-right" size={16} className="ml-1" />
                </Button>
              </>
            ) : (
              <Button size="sm" onClick={handleClose}>Get Started</Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
