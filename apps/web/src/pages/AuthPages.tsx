import { useState, type ComponentType, type FormEvent, type InputHTMLAttributes, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useSignIn, useSignUp } from "@clerk/react";
import { ArrowLeft, Eye, EyeOff, KeyRound, Loader2, Lock, Mail, User } from "lucide-react";
import { Button, Polo, StrideMark, smoothSpring } from "@/components/ui";
import { cn } from "@/lib/utils";

type ErrorField = "email" | "password" | null;

const STEP_MOTION = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0 },
  exit: { opacity: 0, y: -4 },
  transition: smoothSpring,
} as const;

// The first Clerk error's code and message, read safely from whatever was thrown.
function clerkErrorParts(err: unknown): { code: string; message: string } {
  let code = "";
  let message = "";
  if (typeof err === "object" && err !== null) {
    if ("errors" in err && Array.isArray(err.errors)) {
      const first: unknown = err.errors[0];
      if (typeof first === "object" && first !== null) {
        if ("code" in first && typeof first.code === "string") code = first.code;
        if ("message" in first && typeof first.message === "string") message = first.message;
      }
    }
    if (!message && "message" in err && typeof err.message === "string") message = err.message;
  }
  return { code, message };
}

// A Clerk error as one plain line, and which field it belongs to.
function mapClerkError(err: unknown): { message: string; field: ErrorField } {
  const { code, message: raw } = clerkErrorParts(err);
  switch (code) {
    case "form_password_incorrect":
      return { message: "Incorrect password. Please try again.", field: "password" };
    case "form_identifier_exists":
      return { message: "An account with this email already exists. Try signing in instead.", field: "email" };
    case "form_identifier_not_found":
      return { message: "No account found with this email.", field: "email" };
    case "form_param_format_invalid":
      if (raw.toLowerCase().includes("email")) return { message: "Please enter a valid email address.", field: "email" };
      break;
  }
  return { message: raw || "Something went wrong. Please try again.", field: null };
}

// Two halves on wide screens: a quiet product panel on the left, the form on the right.
function AuthShell({ children, hero }: { children: ReactNode; hero: { headline: string; sub: string } }) {
  return (
    <div className="flex min-h-dvh w-full flex-col bg-bg lg:flex-row">
      <div className="relative hidden flex-col justify-between overflow-hidden bg-card2 p-12 lg:flex lg:w-1/2">
        <div className="flex items-center gap-2.5">
          <span className="grid size-9 place-items-center rounded-[11px] bg-polo text-on-polo">
            <StrideMark className="size-7" />
          </span>
          <span className="font-display text-[22px] font-bold tracking-[-0.03em] text-ink">Stride</span>
        </div>
        <div className="flex flex-col gap-10">
          <div className="flex max-w-md flex-col gap-3">
            <h2 className="type-onboard-title text-ink">{hero.headline}</h2>
            <p className="type-lead text-ink2">{hero.sub}</p>
          </div>
          <PreviewCard />
        </div>
        <p className="type-caption text-ink3">Stride · food log and progress</p>
      </div>

      <div className="flex flex-1 items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="flex flex-col items-center gap-4 lg:hidden">
            <span className="grid size-20 place-items-center rounded-card bg-polo text-on-polo shadow-card">
              <StrideMark className="size-14" />
            </span>
            <span className="font-display text-[22px] font-bold tracking-[-0.03em] text-ink">Stride</span>
          </div>
          {children}
        </div>
      </div>
    </div>
  );
}

// A small static picture of the Day hero, so the panel shows what the app is.
function PreviewCard() {
  const macros = [
    { name: "Protein", value: 72, target: 110, dot: "bg-protein" },
    { name: "Carbs", value: 140, target: 215, dot: "bg-carbs" },
    { name: "Fat", value: 38, target: 60, dot: "bg-fat" },
  ];
  return (
    <div aria-hidden className="relative max-w-[400px] rounded-card bg-card p-6 shadow-card">
      <div className="absolute -top-5 right-6">
        <Polo size={44} mood="happy" />
      </div>
      <div className="flex items-baseline justify-between">
        <span className="type-eyebrow text-ink3">Left today</span>
        <span className="type-caption text-ink3">1,240 eaten</span>
      </div>
      <div className="mt-2 flex items-end">
        <span className="font-display text-[64px] leading-[0.9] font-[720] tracking-[-0.055em] text-ink">650</span>
        <span className="mb-1.5 ml-2.5 type-hero-unit text-ink3">
          of
          <br />
          1,890 kcal
        </span>
      </div>
      <div className="mt-4 flex h-3 gap-[3px] overflow-hidden rounded-[8px] bg-card2">
        <i className="h-full w-[22%] rounded-[3px] rounded-l-[8px] bg-ink opacity-80" />
        <i className="h-full w-[34%] rounded-[3px] bg-ink opacity-80" />
        <i className="h-full w-[10%] rounded-[3px] bg-polo" />
      </div>
      <div className="mt-5 grid grid-cols-3 gap-3">
        {macros.map((macro) => (
          <div key={macro.name}>
            <div className="flex items-center gap-1.5 type-label text-ink2">
              <i className={cn("size-[7px] rounded-pill", macro.dot)} />
              {macro.name}
            </div>
            <p className="mt-0.5 type-value text-ink">
              {macro.value}
              <span className="type-label text-ink3"> / {macro.target} g</span>
            </p>
            <div className="mt-1.5 h-1 overflow-hidden rounded-[4px] bg-card2">
              <div className={cn("h-full rounded-[4px]", macro.dot)} style={{ width: `${(macro.value / macro.target) * 100}%` }} />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

type FieldProps = {
  icon: ComponentType<{ className?: string; strokeWidth?: number }>;
  label: ReactNode;
  invalid?: boolean;
  trailing?: ReactNode;
} & InputHTMLAttributes<HTMLInputElement>;

// One labelled input with a leading icon and an optional control on its right.
function Field({ icon: Icon, label, invalid = false, trailing, ...rest }: FieldProps) {
  return (
    <label className="block space-y-1.5">
      <span className="flex items-center justify-between type-label text-ink2">{label}</span>
      <div
        className={cn(
          "flex items-center gap-2.5 rounded-field border bg-card px-4 py-3 transition-colors focus-within:border-polo",
          invalid ? "border-polo-ink" : "border-line2 hover:border-ink3",
        )}
      >
        <Icon className="size-4 shrink-0 text-ink3" strokeWidth={1.9} />
        <input
          {...rest}
          aria-invalid={invalid || undefined}
          className="min-w-0 flex-1 bg-transparent type-input text-ink placeholder:text-ink3 focus:outline-none focus-visible:outline-none"
        />
        {trailing}
      </div>
    </label>
  );
}

// A password field with a show/hide toggle.
function PasswordField(props: Omit<FieldProps, "icon" | "type" | "trailing">) {
  const [show, setShow] = useState(false);
  return (
    <Field
      {...props}
      icon={Lock}
      type={show ? "text" : "password"}
      trailing={
        <button
          type="button"
          onClick={() => setShow((s) => !s)}
          aria-label={show ? "Hide password" : "Show password"}
          className="text-ink3 transition-colors hover:text-ink"
        >
          {show ? <EyeOff className="size-4" strokeWidth={1.9} /> : <Eye className="size-4" strokeWidth={1.9} />}
        </button>
      }
    />
  );
}

// Full-width submit button with a spinner while busy.
function SubmitButton({ loading, disabled, children }: { loading: boolean; disabled: boolean; children: ReactNode }) {
  return (
    <Button type="submit" variant="ink" disabled={loading || disabled} className="h-[52px] w-full type-body-strong">
      {loading ? <Loader2 className="size-4 animate-spin" /> : children}
    </Button>
  );
}

// The form's error line, sliding in when set.
function FormError({ error }: { error: string | null }) {
  return (
    <AnimatePresence>
      {error ? (
        <motion.p role="alert" initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="type-caption font-medium text-polo-ink">
          {error}
        </motion.p>
      ) : null}
    </AnimatePresence>
  );
}

// Title and one line under it, at the top of each step.
function StepHeading({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="space-y-2">
      <h1 className="type-screen-title text-ink">{title}</h1>
      <p className="type-callout text-ink2">{children}</p>
    </div>
  );
}

// Small text button for going back a step.
function BackLink({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className="mx-auto flex items-center gap-1.5 type-link text-ink2 transition-colors hover:text-ink">
      <ArrowLeft className="size-3.5" strokeWidth={2} />
      {children}
    </button>
  );
}

// Continue with Google, in the outline style.
function GoogleButton({ onClick }: { onClick: () => void }) {
  return (
    <Button variant="ghost" onClick={onClick} className="h-[52px] w-full border border-line2 bg-card type-body-strong hover:bg-card2">
      <svg className="size-4" viewBox="0 0 24 24" aria-hidden>
        <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
        <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
        <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z" />
        <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
      </svg>
      Continue with Google
    </Button>
  );
}

// A thin rule with "or" in the middle.
function Divider() {
  return (
    <div className="flex items-center gap-3">
      <div className="h-px flex-1 bg-line2" />
      <span className="type-tag text-ink3">or</span>
      <div className="h-px flex-1 bg-line2" />
    </div>
  );
}

// Sign in with email and password or Google, plus the reset-password steps.
export function SignInPage() {
  const { signIn } = useSignIn();
  const [view, setView] = useState<"signin" | "forgot_email" | "forgot_code" | "forgot_newpwd">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ErrorField>(null);
  const [loading, setLoading] = useState(false);

  // Shows a mapped error and marks its field.
  function setErr(mapped: { message: string; field: ErrorField }) {
    setError(mapped.message);
    setErrorField(mapped.field);
  }

  // Clears the error and moves to another step.
  function goTo(next: typeof view) {
    setError(null);
    setErrorField(null);
    setView(next);
  }

  // Signs in with email and password.
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null); setErrorField(null);
    setLoading(true);
    try {
      const { error: err } = await signIn.password({ emailAddress: email, password });
      if (err) { setErr(mapClerkError({ errors: [err] })); return; }
      if (signIn.status === "complete") {
        await signIn.finalize({ navigate: ({ decorateUrl }) => { window.location.href = decorateUrl("/"); } });
      } else if (signIn.status === "needs_second_factor" || signIn.status === "needs_client_trust") {
        const { error: mfaErr } = await signIn.mfa.sendEmailCode();
        if (mfaErr) { setErr(mapClerkError({ errors: [mfaErr] })); return; }
        setError("A verification code was sent to your email. MFA is required — please use the Clerk hosted sign-in page for now.");
      } else {
        setError("Sign-in incomplete. Please try again.");
      }
    } catch (err) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  // Starts the Google redirect.
  async function onGoogle() {
    if (!signIn) return;
    try {
      await signIn.sso({ strategy: "oauth_google", redirectCallbackUrl: `${window.location.origin}/sso-callback`, redirectUrl: "/" });
    } catch (err) {
      setError(clerkErrorParts(err).message || "Google sign-in failed");
    }
  }

  // Sends a reset code to the email.
  async function onForgotSendCode(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null); setErrorField(null);
    setLoading(true);
    try {
      await signIn.create({ identifier: email });
      const { error: err } = await signIn.resetPasswordEmailCode.sendCode();
      if (err) { setErr(mapClerkError({ errors: [err] })); return; }
      setView("forgot_code");
    } catch (err) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  // Checks the reset code.
  async function onForgotVerifyCode(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null); setErrorField(null);
    setLoading(true);
    try {
      const { error: err } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (err) { setErr(mapClerkError({ errors: [err] })); return; }
      setView("forgot_newpwd");
    } catch (err) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  // Saves the new password and signs in.
  async function onForgotSetPassword(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null); setErrorField(null);
    setLoading(true);
    try {
      const { error: err } = await signIn.resetPasswordEmailCode.submitPassword({ password: newPwd });
      if (err) { setErr(mapClerkError({ errors: [err] })); return; }
      if (signIn.status === "complete") {
        await signIn.finalize({ navigate: ({ decorateUrl }) => { window.location.href = decorateUrl("/"); } });
      } else {
        setError("Password reset incomplete. Please try signing in.");
        setView("signin");
      }
    } catch (err) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell
      hero={{
        headline: "Your log and progress, on a bigger screen.",
        sub: "Type what you ate, fix drafts, and read your weight trend. Same account as the phone app.",
      }}
    >
      <AnimatePresence mode="wait">
        {view === "signin" && (
          <motion.div key="signin" {...STEP_MOTION} className="space-y-6">
            <StepHeading title="Sign in">
              New here?{" "}
              <Link to="/sign-up" className="font-semibold text-ink underline-offset-4 hover:underline">
                Create an account
              </Link>
            </StepHeading>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field
                icon={Mail}
                label="Email"
                type="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="you@example.com"
                invalid={errorField === "email"}
              />
              <div className="space-y-1.5">
                <PasswordField
                  label="Password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="••••••••"
                  invalid={errorField === "password"}
                />
                <div className="flex justify-end">
                  <button type="button" onClick={() => goTo("forgot_email")} className="type-link text-ink2 underline-offset-2 hover:text-ink hover:underline">
                    Forgot password?
                  </button>
                </div>
              </div>
              <FormError error={error} />
              <SubmitButton loading={loading} disabled={!email || !password}>
                Sign in
              </SubmitButton>
            </form>
            <Divider />
            <GoogleButton onClick={onGoogle} />
          </motion.div>
        )}

        {view === "forgot_email" && (
          <motion.div key="forgot_email" {...STEP_MOTION} className="space-y-6">
            <StepHeading title="Reset password">Enter your email and we'll send a reset code.</StepHeading>
            <form onSubmit={onForgotSendCode} className="space-y-4">
              <Field icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" invalid={errorField === "email"} />
              <FormError error={error} />
              <SubmitButton loading={loading} disabled={!email}>
                Send reset code
              </SubmitButton>
            </form>
            <BackLink onClick={() => goTo("signin")}>Back to sign in</BackLink>
          </motion.div>
        )}

        {view === "forgot_code" && (
          <motion.div key="forgot_code" {...STEP_MOTION} className="space-y-6">
            <StepHeading title="Check your email">
              We sent a code to <span className="font-semibold text-ink">{email}</span>.
            </StepHeading>
            <form onSubmit={onForgotVerifyCode} className="space-y-4">
              <Field
                icon={KeyRound}
                label="Reset code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                maxLength={6}
                required
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
                placeholder="123456"
              />
              <FormError error={error} />
              <SubmitButton loading={loading} disabled={code.length < 6}>
                Verify code
              </SubmitButton>
            </form>
            <BackLink onClick={() => goTo("forgot_email")}>Back</BackLink>
          </motion.div>
        )}

        {view === "forgot_newpwd" && (
          <motion.div key="forgot_newpwd" {...STEP_MOTION} className="space-y-6">
            <StepHeading title="New password">Choose a strong password you haven't used before.</StepHeading>
            <form onSubmit={onForgotSetPassword} className="space-y-4">
              <PasswordField
                label="New password"
                autoComplete="new-password"
                required
                minLength={8}
                value={newPwd}
                onChange={(e) => setNewPwd(e.target.value)}
                placeholder="At least 8 characters"
              />
              <FormError error={error} />
              <SubmitButton loading={loading} disabled={newPwd.length < 8}>
                Set new password
              </SubmitButton>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
    </AuthShell>
  );
}

// Sign up with name, email and password or Google, then verify the email code.
export function SignUpPage() {
  const { signUp } = useSignUp();
  const [step, setStep] = useState<"form" | "verify">("form");
  const [firstName, setFirstName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Creates the account and sends the email code.
  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    setError(null);
    setLoading(true);
    try {
      const { error: err } = await signUp.password({ emailAddress: email, password, firstName });
      if (err) { setError(mapClerkError({ errors: [err] }).message); return; }
      await signUp.verifications.sendEmailCode();
      setStep("verify");
    } catch (err) {
      setError(mapClerkError(err).message);
    } finally {
      setLoading(false);
    }
  }

  // Checks the email code and signs in.
  async function onVerify(e: FormEvent) {
    e.preventDefault();
    if (!signUp) return;
    setError(null);
    setLoading(true);
    try {
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: ({ decorateUrl }) => { window.location.href = decorateUrl("/"); } });
      } else {
        setError("Verification incomplete. Please try again.");
      }
    } catch (err) {
      setError(mapClerkError(err).message);
    } finally {
      setLoading(false);
    }
  }

  // Starts the Google redirect.
  async function onGoogle() {
    if (!signUp) return;
    try {
      await signUp.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: `${window.location.origin}/sso-callback`,
        redirectUrl: "/",
      });
    } catch (err) {
      setError(mapClerkError(err).message);
    }
  }

  return (
    <AuthShell
      hero={{
        headline: "Make an account, then set up on your phone.",
        sub: "Your goal and targets come from the Stride mobile app. Once that's done, this is where you read your log and trend.",
      }}
    >
      <motion.div {...STEP_MOTION} className="space-y-6">
        <StepHeading title={step === "form" ? "Create your account" : "Verify your email"}>
          {step === "form" ? (
            <>
              Already have one?{" "}
              <Link to="/sign-in" className="font-semibold text-ink underline-offset-4 hover:underline">
                Sign in
              </Link>
            </>
          ) : (
            <>
              We sent a code to <span className="font-semibold text-ink">{email}</span>.
            </>
          )}
        </StepHeading>

        {step === "form" ? (
          <>
            <form onSubmit={onSubmit} className="space-y-4">
              <Field icon={User} label="First name" type="text" autoComplete="given-name" required value={firstName} onChange={(e) => setFirstName(e.target.value)} placeholder="Sandra" />
              <Field icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <PasswordField
                label="Password"
                autoComplete="new-password"
                required
                minLength={8}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="At least 8 characters"
              />
              <div id="clerk-captcha" />
              <FormError error={error} />
              <SubmitButton loading={loading} disabled={!email || !password || !firstName}>
                Create account
              </SubmitButton>
            </form>
            <Divider />
            <GoogleButton onClick={onGoogle} />
          </>
        ) : (
          <form onSubmit={onVerify} className="space-y-4">
            <Field
              icon={KeyRound}
              label="Verification code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              maxLength={6}
              required
              value={code}
              onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))}
              placeholder="123456"
            />
            <FormError error={error} />
            <SubmitButton loading={loading} disabled={code.length < 6}>
              Verify and continue
            </SubmitButton>
            <BackLink onClick={() => setStep("form")}>Back</BackLink>
          </form>
        )}
      </motion.div>
    </AuthShell>
  );
}
