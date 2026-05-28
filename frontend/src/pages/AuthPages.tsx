import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useSignIn, useSignUp } from "@clerk/react";
import { Eye, EyeOff, Loader2, Mail, Lock, User } from "lucide-react";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { Brand } from "@/components/layout/Brand";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 280, damping: 28 } as const;

function AuthShell({ children, hero }: { children: React.ReactNode; hero: { headline: string; sub: string } }) {
  return (
    <div className="min-h-dvh w-full bg-bg flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 bg-lavender flex-col justify-between p-12 relative overflow-hidden">
        <Brand />
        <div className="space-y-3 z-10">
          <h2 className="text-display text-ink leading-[1.05] max-w-md">{hero.headline}</h2>
          <p className="text-[16px] text-ink/75 max-w-sm leading-relaxed">{hero.sub}</p>
        </div>
        <div className="absolute -bottom-8 -right-8 w-[380px] h-[380px] overflow-hidden">
          <VoxelAgent agent="main" size={380} state="idle" />
        </div>
        <div className="text-[12px] text-ink/55 z-10">Stride · adaptive AI wellness</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex flex-col items-center gap-4">
            <div className="w-28 h-28 rounded-full bg-lavender overflow-hidden relative">
              <div className="absolute inset-0 flex items-center justify-center">
                <VoxelAgent agent="main" size={112} state="idle" />
              </div>
            </div>
            <Brand />
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

function Field({ icon: Icon, label, ...rest }: {
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
  label: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <label className="block space-y-1.5">
      <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
      <div className="flex items-center gap-2 rounded-2xl bg-card border border-border focus-within:border-lavender transition-colors px-4 py-3">
        <Icon className="h-4 w-4 text-text-muted shrink-0" strokeWidth={1.75} />
        <input {...rest} className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none" />
      </div>
    </label>
  );
}

function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" onClick={onClick}
      className="w-full inline-flex items-center justify-center gap-2 rounded-full border border-border bg-card text-text py-3 text-[14px] font-semibold hover:bg-card-elev transition-colors">
      <svg className="h-4 w-4" viewBox="0 0 24 24">
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"/>
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
      </svg>
      Continue with Google
    </button>
  );
}

function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1 h-px bg-border" />
      <span className="text-[11px] text-text-subtle uppercase tracking-wider">or</span>
      <div className="flex-1 h-px bg-border" />
    </div>
  );
}

/* ── Sign In ── */
export function SignInPage() {
  const { signIn } = useSignIn();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null);
    setLoading(true);
    try {
      const { error: createErr } = await signIn.create({ identifier: email });
      if (createErr) { setError(createErr.message); return; }

      const { error: pwErr } = await signIn.password({ password });
      if (pwErr) { setError(pwErr.message); return; }

      const { error: finalErr } = await signIn.finalize();
      if (finalErr) { setError(finalErr.message); return; }

      navigate("/");
    } catch (err: any) {
      setError(err?.message ?? "Couldn't sign in");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (!signIn) return;
    try {
      await signIn.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: "/",
      });
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Google sign-in failed");
    }
  }

  return (
    <AuthShell hero={{ headline: "Welcome back. Let's pick up where you left off.", sub: "Your wellness companion remembers your habits, not just your data." }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-h1 text-text">Sign in</h1>
          <p className="text-[14px] text-text-muted">
            New here?{" "}
            <Link to="/sign-up" className="font-semibold text-text underline-offset-4 hover:underline">Create an account</Link>
          </p>
        </div>

        <form onSubmit={onSubmit} className="space-y-4">
          <Field icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
          <label className="block space-y-1.5">
            <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Password</span>
            <div className="flex items-center gap-2 rounded-2xl bg-card border border-border focus-within:border-lavender transition-colors px-4 py-3">
              <Lock className="h-4 w-4 text-text-muted shrink-0" strokeWidth={1.75} />
              <input type={showPwd ? "text" : "password"} autoComplete="current-password" required value={password}
                onChange={(e) => setPassword(e.target.value)} placeholder="••••••••"
                className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none" />
              <button type="button" onClick={() => setShowPwd((s) => !s)} className="text-text-muted hover:text-text">
                {showPwd ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
              </button>
            </div>
          </label>

          <AnimatePresence>
            {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-bubblegum">{error}</motion.p>}
          </AnimatePresence>

          <button type="submit" disabled={loading || !email || !password}
            className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || !email || !password) && "opacity-50")}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
          </button>
        </form>

        <Divider />
        <GoogleButton onClick={onGoogle} />
      </motion.div>
    </AuthShell>
  );
}

/* ── Sign Up ── */
export function SignUpPage() {
  const { signUp } = useSignUp();
  const navigate = useNavigate();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await signUp.create({ emailAddress: email, password, firstName });
      if (err) { setError(err.message); return; }
      const { error: verifyErr } = await (signUp as any).sendEmailCode();
      if (verifyErr) { setError(verifyErr.message); return; }
      setStep("verify");
    } catch (err: any) {
      setError(err?.message ?? "Couldn't sign up");
    } finally {
      setLoading(false);
    }
  }

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    setError(null);
    setLoading(true);
    try {
      const result = await (signUp as any).attemptEmailAddressVerification({ code });
      if (result.status !== "complete") {
        setError("Verification incomplete — please try again");
        return;
      }
      navigate("/onboarding");
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Couldn't verify code");
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (!signUp) return;
    try {
      await signUp.authenticateWithRedirect({
        strategy: "oauth_google",
        redirectUrl: `${window.location.origin}/sso-callback`,
        redirectUrlComplete: "/onboarding",
      });
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Google sign-in failed");
    }
  }

  return (
    <AuthShell hero={{ headline: "An adaptive wellness companion that learns with you.", sub: "Frictionless tracking, personalized coaching, and a system that gets better the more you use it." }}>
      <motion.div initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} transition={SPRING} className="space-y-6">
        <div className="space-y-1">
          <h1 className="text-h1 text-text">{step === "form" ? "Create your account" : "Verify your email"}</h1>
          <p className="text-[14px] text-text-muted">
            {step === "form"
              ? <><Link to="/sign-in" className="font-semibold text-text underline-offset-4 hover:underline">Sign in</Link> if you already have one</>
              : <>We sent a code to <span className="text-text font-semibold">{email}</span></>}
          </p>
        </div>

        {step === "form" ? (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field icon={User} label="First name" type="text" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sandra" />
              <Field icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Password</span>
                <div className="flex items-center gap-2 rounded-2xl bg-card border border-border focus-within:border-lavender transition-colors px-4 py-3">
                  <Lock className="h-4 w-4 text-text-muted shrink-0" strokeWidth={1.75} />
                  <input type={showPwd ? "text" : "password"} autoComplete="new-password" required minLength={8} value={password}
                    onChange={(e) => setPassword(e.target.value)} placeholder="At least 8 characters"
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none" />
                  <button type="button" onClick={() => setShowPwd((s) => !s)} className="text-text-muted hover:text-text">
                    {showPwd ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  </button>
                </div>
              </label>
              <div id="clerk-captcha" />
              <AnimatePresence>
                {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-bubblegum">{error}</motion.p>}
              </AnimatePresence>
              <button type="submit" disabled={loading || !email || !password || !firstName}
                className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || !email || !password || !firstName) && "opacity-50")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Create account"}
              </button>
            </form>
            <Divider />
            <GoogleButton onClick={onGoogle} />
          </>
        ) : (
          <form onSubmit={onVerify} className="space-y-4">
            <Field icon={Mail} label="Verification code" type="text" inputMode="numeric" maxLength={6} required
              value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} placeholder="123456" />
            <AnimatePresence>
              {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-bubblegum">{error}</motion.p>}
            </AnimatePresence>
            <button type="submit" disabled={loading || code.length < 6}
              className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || code.length < 6) && "opacity-50")}>
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify and continue"}
            </button>
            <button type="button" onClick={() => setStep("form")} className="w-full text-[12.5px] text-text-muted hover:text-text">← Back</button>
          </form>
        )}
      </motion.div>
    </AuthShell>
  );
}
