import { useEffect, useState, useCallback, useRef } from "react";
import { Icon } from "@/components/ui/icon";
import { useAuth } from "@/lib/auth-context";

const TUTORIAL_KEY = "jmcs-tutorial-seen";

interface Step {
  icon: React.ReactNode;
  title: string;
  desc: string;
}

const featureSteps: Step[] = [
  {
    icon: <Icon name="layout-dashboard" size={16} />,
    title: "Dashboard",
    desc: "This is your command center. View system status, contract values, KPI overview, recent activity, and expiring items all in one place.",
  },
  {
    icon: <Icon name="file-text" size={16} />,
    title: "Contracts",
    desc: "Create and manage contracts effortlessly. Track status, upload documents, and monitor contract timelines from a single screen.",
  },
  {
    icon: <Icon name="shield-check" size={16} />,
    title: "Certificates",
    desc: "Manage training and ISO certificates. Generate QR codes, upload attachments, and track expiration dates so nothing slips through.",
  },
  {
    icon: <Icon name="briefcase" size={16} />,
    title: "Projects",
    desc: "Oversee your projects, assign tasks to team members, track progress, and manage priorities across the organization.",
  },
  {
    icon: <Icon name="calendar-days" size={16} />,
    title: "Calendar",
    desc: "Schedule events, set reminders, and keep track of important dates and deadlines for you and your team.",
  },
  {
    icon: <Icon name="target" size={16} />,
    title: "Leads",
    desc: "Track and manage sales leads, monitor conversion rates, and follow up with potential clients to close more deals.",
  },
  {
    icon: <Icon name="users" size={16} />,
    title: "Admin Panel",
    desc: "Manage user accounts, assign roles and permissions, and configure system settings from the admin panel.",
  },
];

function useTypingEffect(text: string, speed = 30) {
  const [displayed, setDisplayed] = useState("");
  const [done, setDone] = useState(false);
  const indexRef = useRef(0);

  useEffect(() => {
    setDisplayed("");
    setDone(false);
    indexRef.current = 0;

    if (!text) {
      setDone(true);
      return;
    }

    const interval = setInterval(() => {
      indexRef.current++;
      setDisplayed(text.slice(0, indexRef.current));
      if (indexRef.current >= text.length) {
        setDone(true);
        clearInterval(interval);
      }
    }, speed);

    return () => clearInterval(interval);
  }, [text, speed]);

  return { displayed, done };
}

export default function TutorialOverlay() {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [showBubble, setShowBubble] = useState(false);
  const [exiting, setExiting] = useState(false);

  const totalSteps = featureSteps.length + 1;
  const isOutro = currentStep === featureSteps.length;

  const step = featureSteps[currentStep];
  const { displayed, done } = useTypingEffect(step?.desc ?? "", 28);

  useEffect(() => {
    const seen = localStorage.getItem(TUTORIAL_KEY);
    if (!seen) {
      setOpen(true);
      setTimeout(() => setShowBubble(true), 600);
    }
  }, []);

  const handleNext = useCallback(() => {
    if (currentStep < totalSteps - 1) {
      setShowBubble(false);
      setTimeout(() => {
        setCurrentStep((s) => s + 1);
        setTimeout(() => setShowBubble(true), 100);
      }, 300);
    }
  }, [currentStep, totalSteps]);

  const handlePrev = useCallback(() => {
    if (currentStep > 0) {
      setShowBubble(false);
      setTimeout(() => {
        setCurrentStep((s) => s - 1);
        setTimeout(() => setShowBubble(true), 100);
      }, 300);
    }
  }, [currentStep]);

  const handleClose = useCallback(() => {
    setExiting(true);
    setTimeout(() => {
      localStorage.setItem(TUTORIAL_KEY, "true");
      setOpen(false);
      setExiting(false);
    }, 400);
  }, []);

  if (!open) return null;

  const displaySteps = isOutro ? featureSteps : [step];

  return (
    <div
      className={`fixed inset-0 z-[60] flex flex-col items-center justify-center pt-10 px-4
        transition-all duration-500 ease-out
        ${exiting ? "opacity-0 scale-105" : "opacity-100 scale-100"}
      `}
      style={{
        background: exiting
          ? "rgba(0,0,0,0)"
          : "rgba(0,0,0,0.55)",
        backdropFilter: exiting ? "blur(0px)" : "blur(6px)",
        WebkitBackdropFilter: exiting ? "blur(0px)" : "blur(6px)",
      }}
    >
      {/* Modal */}
      <div
        className={`flex bg-background rounded-2xl shadow-2xl border border-border/60
          transition-all duration-500 ease-out
          ${showBubble ? "translate-y-0 opacity-100 scale-100" : "translate-y-8 opacity-0 scale-95"}
        `}
      >
        {/* Image side */}
        <div className="relative flex-shrink-0">
          <img
            src="/hi.png"
            alt="Guide"
            className="h-full w-auto max-h-[260px] object-contain rounded-l-2xl"
          />
          <button
            onClick={handleClose}
            className="absolute top-1.5 right-1.5 text-muted-foreground/60 hover:text-foreground transition-colors bg-background/60 hover:bg-background rounded-full p-0.5"
          >
            <Icon name="x" size={12} />
          </button>
        </div>

        {/* Content side */}
        <div className="flex flex-col justify-center min-w-[220px] max-w-[260px] py-4 pr-4 pl-3">
          {isOutro ? (
            <>
              <div className="flex flex-col items-center text-center gap-2 mb-3">
                <div className="flex h-8 w-8 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Icon name="party-popper" size={16} />
                </div>
                <h3 className="font-semibold text-sm">All Set!</h3>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  Thank you and welcome,{" "}
                  <span className="font-medium text-foreground">
                    {user?.fullName || user?.username || "Employee"}
                  </span>
                </p>
              </div>
              <button
                onClick={handleClose}
                className="w-full mt-1 rounded-lg bg-primary text-primary-foreground text-xs font-medium py-1.5 hover:bg-primary/90 transition-colors"
              >
                Get Started
              </button>
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 mb-2.5">
                <div className="flex h-6 w-6 items-center justify-center rounded-md bg-primary/10 text-primary shrink-0">
                  {step.icon}
                </div>
                <div>
                  <h3 className="font-semibold text-xs leading-tight">{step.title}</h3>
                  <p className="text-[10px] text-muted-foreground">
                    Step {currentStep + 1} of {totalSteps}
                  </p>
                </div>
              </div>

              <p className="text-xs text-foreground/85 leading-relaxed min-h-[3rem] mb-3">
                {displayed}
                {!done && (
                  <span className="inline-block w-[1.5px] h-[1em] ml-0.5 bg-primary align-middle animate-pulse" />
                )}
              </p>

              <div className="flex items-center justify-between">
                <div className="flex gap-1">
                  {featureSteps.map((_, i) => (
                    <button
                      key={i}
                      onClick={() => {
                        if (i === currentStep) return;
                        setShowBubble(false);
                        setTimeout(() => {
                          setCurrentStep(i);
                          setTimeout(() => setShowBubble(true), 100);
                        }, 300);
                      }}
                      className={`h-1.5 rounded-full transition-all duration-300 ${
                        i === currentStep
                          ? "w-4 bg-primary"
                          : "w-1.5 bg-muted-foreground/20 hover:bg-muted-foreground/40"
                      }`}
                      aria-label={`Go to step ${i + 1}`}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-1">
                  {currentStep > 0 && (
                    <button
                      onClick={handlePrev}
                      className="text-muted-foreground hover:text-foreground transition-colors p-0.5"
                    >
                      <Icon name="chevron-left" size={14} />
                    </button>
                  )}
                  <button
                    onClick={handleNext}
                    className="flex items-center gap-0.5 text-[11px] font-medium text-primary hover:text-primary/80 transition-colors"
                  >
                    Next
                    <Icon name="chevron-right" size={12} />
                  </button>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Skip link */}
      <button
        onClick={handleClose}
        className={`mt-4 text-xs text-white/50 hover:text-white/80 transition-all underline underline-offset-2
          ${showBubble ? "opacity-100" : "opacity-0"}
        `}
      >
        Skip tutorial
      </button>
    </div>
  );
}
