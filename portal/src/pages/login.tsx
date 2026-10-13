import { useState, useEffect } from "react";
import { useLocation } from "wouter";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";

import { useAuth } from "@/lib/auth-context";
import { auth, signInWithEmailAndPassword, setPersistence, sendPasswordResetEmail, browserLocalPersistence, browserSessionPersistence } from "@/lib/firebase";
import { useToast } from "@/hooks/use-toast";
import { useAppUpdate } from "@/hooks/use-app-update";
import { ToastAction } from "@/components/ui/toast";
import { Icon } from "@/components/ui/icon";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

const loginSchema = z.object({
  email: z.string().min(1, "Email is required").email("Invalid email address"),
  password: z.string().min(1, "Password is required"),
});

type LoginFormValues = z.infer<typeof loginSchema>;

const PANEL_IMAGE_SRC = "/hi proffesional.png";

const REMEMBER_KEY = "jmcs_remember_me";

function loadRememberPref(): boolean {
  try {
    return localStorage.getItem(REMEMBER_KEY) === "1";
  } catch {
    return false;
  }
}

export default function Login() {
  const [, setLocation] = useLocation();
  const { setUser } = useAuth();
  const { toast } = useToast();

  const [isLoading, setIsLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [remember, setRemember] = useState(loadRememberPref);
  const [showSignUpWarning, setShowSignUpWarning] = useState(false);

  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstalled, setIsInstalled] = useState(false);

  const update = useAppUpdate();
  const [checkingUpdate, setCheckingUpdate] = useState(false);
  const [resettingPassword, setResettingPassword] = useState(false);
  const [forgotOpen, setForgotOpen] = useState(false);
  const [resetEmail, setResetEmail] = useState("");

  const handleToggleRemember = () => {
    setRemember((prev) => {
      const next = !prev;
      try {
        if (next) localStorage.setItem(REMEMBER_KEY, "1");
        else localStorage.removeItem(REMEMBER_KEY);
      } catch {
        /* noop */
      }
      return next;
    });
  };

  const handleForgotPassword = async () => {
    const email = resetEmail.trim();
    if (!email) return;
    setResettingPassword(true);
    try {
      if (!auth) throw new Error("Firebase Auth not initialized");
      await sendPasswordResetEmail(auth, email);
      toast({ title: "Password reset email sent", description: `Check your inbox at ${email} for further instructions.` });
      setForgotOpen(false);
      setResetEmail("");
    } catch (err: any) {
      toast({ title: "Failed to send reset email", description: err?.message || "An error occurred", variant: "destructive" });
    } finally {
      setResettingPassword(false);
    }
  };

  const handleCheckUpdate = () => {
    if (!update.isDesktop) return;
    setCheckingUpdate(true);
    update.check();
    toast({ title: "Checking for updates…" });
  };

  useEffect(() => {
    if (!checkingUpdate) return;
    if (update.phase === "checking") return;
    setCheckingUpdate(false);
    if (update.phase === "available") {
      toast({
        title: "Update available",
        description: `Version ${update.version ?? ""} is ready to download.`,
        action: (
          <ToastAction altText="Download update" onClick={() => update.download()}>
            Download
          </ToastAction>
        ),
      });
    } else if (update.phase === "idle") {
      toast({ title: "You're up to date", description: "No new updates available." });
    } else if (update.phase === "error") {
      toast({ title: "Update check failed", description: update.error, variant: "destructive" });
    }
  }, [checkingUpdate, update.phase, update.version, update.error, toast]);

  useEffect(() => {
    const mq = window.matchMedia("(display-mode: standalone)");
    setIsInstalled(mq.matches || (navigator as any).standalone === true);
    const onPrompt = (e: any) => {
      e.preventDefault();
      setDeferredPrompt(e);
    };
    const onInstalled = () => setIsInstalled(true);
    window.addEventListener("beforeinstallprompt", onPrompt);
    window.addEventListener("appinstalled", onInstalled);
    return () => {
      window.removeEventListener("beforeinstallprompt", onPrompt);
      window.removeEventListener("appinstalled", onInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    try { await deferredPrompt.userChoice; } catch {}
    setDeferredPrompt(null);
  };

  const {
    register,
    handleSubmit,
    setValue,
    formState: { errors },
  } = useForm<LoginFormValues>({
    resolver: zodResolver(loginSchema),
    defaultValues: { email: "", password: "" },
  });

  async function onSubmit(data: LoginFormValues) {
    if (!auth) {
      toast({
        title: "Firebase not configured",
        description: "Firebase Auth initialization failed.",
        variant: "destructive",
      });
      return;
    }
    setIsLoading(true);
    try {
      if (auth) {
        await setPersistence(auth, remember ? browserLocalPersistence : browserSessionPersistence);
      }

      const userCredential = await signInWithEmailAndPassword(auth, data.email, data.password);
      const idToken = await userCredential.user.getIdToken();

      const res = await fetch("/api/auth/firebase", {
        method: "POST",
        body: JSON.stringify({ idToken, rememberMe: remember }),
        headers: { "Content-Type": "application/json" },
      });

      let body: any;
      try {
        body = await res.json();
      } catch {
        const text = await res.text().catch(() => "");
        throw new Error(text ? `Server error: ${text.slice(0, 200)}` : "Server returned an invalid response");
      }

      if (!res.ok) {
        throw new Error(body.error || "Authentication failed");
      }

      setUser(body.user);
      toast({
        title: "Authentication successful",
        description: `Welcome back, ${body.user.fullName || body.user.username}.`,
      });
      if (body.user.mustChangePassword) {
        setLocation("/change-password");
      } else {
        setLocation("/");
      }
    } catch (err: any) {
      const message = err?.message || "Authentication failed";
      const isFirebaseClientError = typeof err?.code === "string" && err.code.startsWith("auth/");
      toast({
        title: "Authentication failed",
        description: isFirebaseClientError ? `${message} (${err.code})` : message,
        variant: "destructive",
      });
      setValue("password", "");
    } finally {
      setIsLoading(false);
    }
  }

  return (
    <>
      <style>{`
        @keyframes shine-sweep {
          0%   { left: -80%; }
          100% { left: 130%; }
        }
        .btn-shine { position: relative; overflow: hidden; }
        .btn-shine .shine-layer {
          position: absolute;
          top: -10%; left: -80%;
          width: 55%; height: 120%;
          background: linear-gradient(
            120deg,
            rgba(255,255,255,0)    0%,
            rgba(255,255,255,0.38) 50%,
            rgba(255,255,255,0)    100%
          );
          transform: skewX(-20deg);
          pointer-events: none;
          opacity: 0;
          transition: opacity 0.15s;
        }
        .btn-shine:hover:not(:disabled) .shine-layer {
          opacity: 1;
          animation: shine-sweep 0.55s ease forwards;
        }
        @keyframes fade-in-up {
          from { opacity: 0; transform: translateY(16px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .neo-fade { animation: fade-in-up 0.6s ease both; }
      `}</style>

      <div className="min-h-screen w-full flex items-center justify-center p-4 sm:p-6 bg-background">
        <div className="w-full max-w-md">

          {/* Right: Form */}
          <div className="flex-1 w-full max-w-md">

          {/* Heading */}
          <div className="text-center lg:text-left mb-8 neo-fade">
            <h1 className="font-serif text-3xl sm:text-4xl font-semibold text-foreground tracking-tight" style={{ letterSpacing: "-0.01em" }}>
              Welcome back
            </h1>
            <p className="text-sm text-muted-foreground mt-2">
              Don't have an account?{" "}
              <button
                type="button"
                className="font-semibold text-primary underline underline-offset-2 hover:text-primary/80 transition-colors"
                onClick={() => setShowSignUpWarning(true)}
              >
                Sign Up
              </button>
            </p>
          </div>

          {/* Sign-up restricted warning */}
          {showSignUpWarning && (
            <div className="neo-fade bg-amber-50 border border-amber-200 flex items-start gap-3 rounded-2xl px-5 py-4 mb-6 text-sm"
            >
              <Icon name="shield-alert" className="text-amber-500 flex-shrink-0 mt-0.5" size={18} />
              <div className="flex-1">
                <p className="font-semibold text-amber-700">Sign-up Restricted</p>
                <p className="mt-0.5 text-xs text-muted-foreground leading-relaxed">
                  Account registration is temporarily disabled. All accounts are managed by your system administrator.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setShowSignUpWarning(false)}
                className="flex-shrink-0 text-muted-foreground/80 hover:text-foreground/80 transition-colors mt-0.5"
              >
                <Icon name="x" size={16} />
              </button>
            </div>
          )}

          {/* Desktop update banner */}
          {update.isDesktop && (
            <div className="neo-fade bg-white border border-border flex items-center justify-between gap-3 rounded-2xl px-5 py-3 mb-6 text-sm"
            >
              <div className="flex items-center gap-2">
                <Icon name="refresh-cw" className={`text-muted-foreground ${checkingUpdate ? "animate-spin" : ""}`} size={16} />
                <span className="font-medium text-foreground/80">Internal Portal</span>
              </div>
              <button
                type="button"
                onClick={handleCheckUpdate}
                className="font-semibold text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
              >
                Check for updates
              </button>
            </div>
          )}

          {/* Neomorphism card */}
          <div className="neo-fade surface rounded-xl p-8 sm:p-10"
          >
            <form onSubmit={handleSubmit(onSubmit)} className="space-y-5">
              {/* Email */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/80" size={16} />
                  <input
                    type="email"
                    {...register("email")}
                    data-testid="input-email"
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-input bg-white pl-11 pr-4 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
                {errors.email && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <Icon name="alert-circle" size={12} /> {errors.email.message}
                  </p>
                )}
              </div>

              {/* Password */}
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Password
                </label>
                <div className="relative">
                  <Icon name="lock" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/80" size={16} />
                  <input
                    type={showPass ? "text" : "password"}
                    {...register("password")}
                    data-testid="input-password"
                    autoComplete="current-password"
                    placeholder="Enter your password"
                    className="w-full rounded-lg border border-input bg-white pl-11 pr-12 py-3.5 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPass(!showPass)}
                    className="absolute inset-y-0 right-0 pr-4 flex items-center text-muted-foreground/80 hover:text-foreground/80 transition-colors"
                  >
                    <Icon name={showPass ? "eye-off" : "eye"} size={18} />
                  </button>
                </div>
                {errors.password && (
                  <p className="mt-2 text-xs text-red-500 flex items-center gap-1">
                    <Icon name="alert-circle" size={12} /> {errors.password.message}
                  </p>
                )}
              </div>

              {/* Remember + Forgot */}
              <div className="flex items-center justify-between pt-1">
                <label className="flex items-center gap-3 cursor-pointer select-none group" onClick={handleToggleRemember}>
                  <div
                    className={`w-5 h-5 rounded-md flex items-center justify-center transition-all cursor-pointer flex-shrink-0 border ${remember ? "border-primary bg-primary/10" : "border-input bg-white"}`}
                  >
                    {remember && (
                      <Icon name="check" size={14} className="text-primary" />
                    )}
                  </div>
                  <span className="text-sm text-muted-foreground group-hover:text-foreground transition-colors">Keep me logged in</span>
                </label>
                <button
                  type="button"
                  onClick={() => setForgotOpen(true)}
                  disabled={resettingPassword}
                  className="text-sm font-medium text-muted-foreground/80 hover:text-foreground/80 transition-colors"
                >
                  Forgot Password?
                </button>
              </div>

              {/* Login button */}
              <button
                type="submit"
                disabled={isLoading}
                data-testid="button-login"
                className="btn-shine bg-primary hover:bg-primary/90 w-full py-4 rounded-lg text-sm font-bold text-white transition-all duration-200 disabled:opacity-60 mt-2"
              >
                <span className="shine-layer" />
                {isLoading ? (
                  <span className="flex items-center justify-center gap-2">
                    <svg className="animate-spin w-4 h-4" viewBox="0 0 24 24" fill="none">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="white" strokeWidth="3" />
                      <path className="opacity-75" fill="white" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                    </svg>
                    Signing in...
                  </span>
                ) : "Sign In"}
              </button>
              {isLoading && (
                <div className="mt-3">
                  <div className="bg-gray-200 rounded-full h-1.5 overflow-hidden">
                    <div className="h-full rounded-full bg-white/60 animate-[progress-indeterminate_1.5s_ease-in-out_infinite]" style={{ width: "40%" }} />
                  </div>
                </div>
              )}
            </form>
          </div>
          </div>

          {/* Forgot password dialog */}
          <Dialog open={forgotOpen} onOpenChange={setForgotOpen}>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Reset your password</DialogTitle>
                <DialogDescription>
                  Enter the email address associated with your account and we'll send you a link to reset your password.
                </DialogDescription>
              </DialogHeader>
              <div>
                <label className="block text-sm font-medium text-foreground/80 mb-2">
                  Email
                </label>
                <div className="relative">
                  <Icon name="mail" className="absolute left-4 top-1/2 -translate-y-1/2 text-muted-foreground/80" size={16} />
                  <input
                    type="email"
                    value={resetEmail}
                    onChange={(e) => setResetEmail(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter" && resetEmail.trim() && !resettingPassword) handleForgotPassword(); }}
                    autoFocus
                    autoComplete="email"
                    placeholder="you@company.com"
                    className="w-full rounded-lg border border-input bg-white pl-11 pr-4 py-3 text-sm text-foreground placeholder:text-muted-foreground/80 focus:outline-none focus:ring-2 focus:ring-primary/30 focus:border-primary transition-all"
                  />
                </div>
              </div>
              <DialogFooter>
                <button
                  type="button"
                  onClick={() => setForgotOpen(false)}
                  className="rounded-lg border border-input px-4 py-2 text-sm font-medium hover:bg-muted transition-colors"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={handleForgotPassword}
                  disabled={resettingPassword || !resetEmail.trim()}
                  className="rounded-lg bg-primary hover:bg-primary/90 px-4 py-2 text-sm font-bold text-white transition-colors disabled:opacity-60"
                >
                  {resettingPassword ? "Sending..." : "Send Reset Link"}
                </button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

        </div>
      </div>
    </>
  );
}
