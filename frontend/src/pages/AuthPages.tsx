import { useState, type FormEvent } from "react";
import { useNavigate, Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useSignIn, useSignUp } from "@clerk/react";
import { Eye, EyeOff, Loader2, Mail, Lock, User, KeyRound } from "lucide-react";
import { cn } from "@/lib/utils";

/* App icon — S mark only, transparent bg. fill adapts per context. */
function StrideIcon({ fill = "#B194F7", className }: { fill?: string; className?: string }) {
  return (
    <svg viewBox="0 0 1254 1254" fill="none" xmlns="http://www.w3.org/2000/svg" className={className}>
      <path d="M791.863 218.875C796.785 221.146 800.167 223.783 803.423 228.093C805.045 230.055 806.744 231.603 808.689 233.242C812.935 236.9 816.903 240.775 820.85 244.752C821.589 245.493 822.328 246.234 823.09 246.997C824.682 248.592 826.272 250.189 827.861 251.786C830.382 254.32 832.906 256.85 835.431 259.38C841.699 265.661 847.961 271.947 854.223 278.233C859.524 283.554 864.828 288.874 870.135 294.19C872.611 296.674 875.085 299.16 877.559 301.647C879.089 303.181 880.62 304.714 882.15 306.248C882.829 306.932 883.508 307.616 884.207 308.32C888.079 312.193 892.057 315.88 896.211 319.449C913.703 334.609 913.703 334.609 915.426 344.426C915.856 352.321 913.187 359.927 907.909 365.82C906.698 367.05 905.471 368.265 904.231 369.466C903.559 370.14 902.887 370.815 902.195 371.51C899.991 373.714 897.768 375.896 895.543 378.078C893.995 379.618 892.448 381.158 890.902 382.7C886.843 386.743 882.765 390.766 878.684 394.786C875.363 398.063 872.055 401.354 868.748 404.645C864.788 408.585 860.823 412.52 856.855 416.453C856.105 417.197 855.355 417.941 854.582 418.708C852.443 420.825 850.301 422.939 848.157 425.052C847.534 425.669 846.911 426.286 846.269 426.922C842.802 430.331 839.248 433.574 835.521 436.697C833.214 438.673 831.116 440.823 829 443C827.844 444.183 826.687 445.366 825.53 446.549C824.896 447.2 824.261 447.851 823.607 448.521C820.735 451.46 817.85 454.386 814.963 457.312C813.447 458.853 811.935 460.399 810.428 461.949C808.239 464.199 806.033 466.433 803.824 468.664C802.827 469.7 802.827 469.7 801.81 470.757C796.229 476.341 790.637 479.425 782.5 479.437C775.522 479.215 771.14 477.092 766.188 472.25C760.725 464.135 760.587 457.074 760.707 447.531C760.711 446.255 760.716 444.979 760.72 443.664C760.734 440.297 760.761 436.931 760.794 433.564C760.825 430.118 760.838 426.672 760.854 423.227C760.887 416.484 760.937 409.742 761 403C735.399 403.037 709.798 403.097 684.197 403.184C672.308 403.224 660.42 403.256 648.531 403.271C638.16 403.284 627.79 403.311 617.419 403.355C611.936 403.377 606.452 403.393 600.969 403.392C595.791 403.391 590.614 403.409 585.436 403.441C583.551 403.45 581.667 403.451 579.782 403.446C543.731 403.352 508.842 415.894 482.797 441.199C469.087 454.928 458.662 471.361 453 490C452.701 490.927 452.402 491.854 452.094 492.809C447.292 510.616 447.674 531.981 455 549C455.284 549.674 455.568 550.348 455.861 551.043C467.616 578.21 489.012 594.891 515.921 605.777C526.02 609.709 536.305 611.574 547 613C548.215 613.169 549.43 613.337 550.682 613.511C554.605 613.998 558.457 614.13 562.413 614.138C563.114 614.141 563.815 614.144 564.538 614.147C566.864 614.155 569.19 614.156 571.516 614.158C573.194 614.162 574.872 614.167 576.55 614.173C580.156 614.184 583.761 614.193 587.367 614.199C593.091 614.21 598.815 614.23 604.539 614.252C620.814 614.314 637.089 614.368 653.364 614.401C662.359 614.42 671.354 614.449 680.35 614.489C685.096 614.51 689.842 614.526 694.589 614.528C713.935 614.54 732.88 614.651 752 618C753.525 618.247 755.05 618.493 756.576 618.737C778.12 622.294 798.832 630.722 818 641C818.619 641.331 819.238 641.663 819.876 642.004C828.033 646.419 835.655 651.33 843 657C844.21 657.92 844.21 657.92 845.445 658.859C868.689 676.946 886.526 698.859 900 725C900.322 725.603 900.643 726.206 900.975 726.827C916.434 755.925 920.215 788.575 919 821C918.972 821.888 918.944 822.777 918.915 823.692C917.513 858.897 901.573 895.572 880 923C879.41 923.793 878.819 924.586 878.211 925.402C866.949 939.962 853.149 953.532 838 964C836.894 964.797 835.789 965.593 834.684 966.391C810.545 983.459 782.58 994.893 753.613 1000.47C752.098 1000.78 750.585 1001.1 749.081 1001.45C733.106 1005.17 716.879 1005.29 700.556 1005.23C698.376 1005.23 696.196 1005.23 694.016 1005.23C688.159 1005.23 682.303 1005.22 676.447 1005.2C670.304 1005.19 664.161 1005.19 658.018 1005.19C646.412 1005.18 634.807 1005.16 623.202 1005.14C609.978 1005.12 596.754 1005.11 583.53 1005.1C556.354 1005.08 529.177 1005.04 502 1005C502.01 1005.97 502.01 1005.97 502.02 1006.96C502.087 1013.73 502.132 1020.49 502.165 1027.26C502.18 1029.78 502.2 1032.31 502.226 1034.83C502.263 1038.46 502.28 1042.09 502.293 1045.72C502.308 1046.85 502.324 1047.97 502.34 1049.13C502.342 1056.67 501.72 1061.75 496.75 1067.69C490.446 1072.99 485.265 1075.23 477 1075C467.538 1074.14 460.634 1066.1 454 1060C453.015 1059.1 452.029 1058.2 451.043 1057.3C449.237 1055.66 447.434 1054.01 445.633 1052.35C443.046 1050.04 440.393 1047.86 437.688 1045.69C432.632 1041.61 427.918 1037.25 423.194 1032.8C418.878 1028.76 414.395 1025 409.777 1021.31C406.576 1018.65 403.538 1015.85 400.5 1013C395.743 1008.54 390.842 1004.37 385.758 1000.29C381.62 996.857 377.703 993.201 373.762 989.551C366.839 983.157 359.624 977.091 352.465 970.965C351.617 970.237 351.617 970.237 350.752 969.495C349.537 968.458 348.317 967.428 347.092 966.403C346.472 965.882 345.853 965.361 345.215 964.824C344.655 964.357 344.096 963.89 343.519 963.409C339.31 959.506 337.35 955.319 336.762 949.738C336.566 943.335 337.274 938.319 341 933C347.177 926.482 354.233 920.933 361.219 915.312C364.24 912.8 367.124 910.176 370 907.5C374.588 903.231 379.334 899.242 384.219 895.312C387.24 892.8 390.124 890.176 393 887.5C397.588 883.231 402.334 879.242 407.219 875.312C410.24 872.8 413.124 870.176 416 867.5C420.61 863.21 425.378 859.196 430.285 855.246C433.107 852.912 435.806 850.48 438.5 848C442.939 843.914 447.528 840.088 452.227 836.305C456.119 833.07 459.806 829.63 463.492 826.164C469.803 820.718 475.027 819.618 483.184 819.727C489.295 820.32 493.343 822.982 497.375 827.5C501.068 832.039 502.251 835.326 502.227 841.237C502.227 843.129 502.227 843.129 502.227 845.059C502.216 846.43 502.206 847.801 502.195 849.172C502.192 850.579 502.189 851.985 502.187 853.392C502.179 857.088 502.16 860.783 502.137 864.479C502.117 868.253 502.108 872.027 502.098 875.801C502.076 883.201 502.042 890.6 502 898C530.061 897.963 558.122 897.903 586.183 897.816C599.214 897.776 612.245 897.744 625.276 897.729C636.642 897.716 648.009 897.689 659.375 897.645C665.386 897.623 671.396 897.607 677.407 897.608C683.081 897.609 688.755 897.591 694.429 897.559C696.496 897.55 698.562 897.549 700.629 897.554C729.731 897.623 758.885 891.095 781 871C781.904 870.189 782.807 869.378 783.738 868.543C800.665 852.552 809.67 831.904 810.33 808.727C810.628 788.575 805.249 771.462 792 756C791.566 755.423 791.131 754.845 790.684 754.25C777.938 737.814 754.614 727.667 734.623 724.427C727.576 723.597 720.504 723.726 713.419 723.745C711.675 723.742 709.93 723.738 708.186 723.734C704.449 723.726 700.712 723.723 696.975 723.726C691.04 723.728 685.105 723.714 679.17 723.697C662.3 723.65 645.429 723.626 628.558 723.619C619.225 723.615 609.892 723.597 600.559 723.564C595.638 723.547 590.718 723.538 585.797 723.547C565.133 723.582 545.304 723.306 525 719C523.147 718.631 521.295 718.265 519.441 717.901C511.204 716.274 503.045 714.416 495 712C493.747 711.63 492.494 711.26 491.203 710.879C461.241 701.89 433.592 686.491 410 666C409.458 665.532 408.916 665.065 408.357 664.583C389.538 648.225 374.633 629.237 363.116 607.124C362.068 605.129 360.983 603.16 359.887 601.191C349.956 582.946 344.861 562.458 342 542C341.898 541.313 341.797 540.625 341.692 539.917C340.723 532.541 340.757 525.116 340.75 517.687C340.749 516.979 340.748 516.271 340.747 515.541C340.766 495.975 343.582 476.839 350.184 458.348C350.806 456.559 351.371 454.75 351.91 452.934C358.011 433.014 368.052 414.971 380 398C380.512 397.272 381.024 396.543 381.552 395.793C388.369 386.201 395.807 377.435 404 369C404.549 368.425 405.098 367.85 405.664 367.258C413.348 359.223 421.303 351.964 430.225 345.327C432.013 343.99 433.781 342.628 435.547 341.262C448.732 331.18 463.019 323.283 477.938 316.062C478.86 315.614 479.782 315.165 480.732 314.703C486.475 311.986 492.248 309.832 498.298 307.898C501.172 306.988 501.172 306.988 504.52 305.465C509.461 303.385 514.524 301.985 519.688 300.562C520.661 300.276 521.635 299.989 522.639 299.693C549.755 292.229 577.155 292.444 605.023 292.594C610.525 292.62 616.028 292.622 621.53 292.627C631.903 292.639 642.275 292.672 652.648 292.712C664.476 292.757 676.305 292.779 688.134 292.799C712.423 292.84 736.711 292.91 761 293C760.98 291.902 760.98 291.902 760.96 290.783C760.839 283.854 760.748 276.926 760.689 269.997C760.658 266.436 760.616 262.875 760.547 259.314C760.469 255.21 760.441 251.108 760.414 247.004C760.383 245.738 760.352 244.472 760.32 243.168C760.317 235.127 761.549 230.036 767 224C774.189 217.324 782.398 215.982 791.863 218.875Z" fill={fill}/>
    </svg>
  );
}

const SPRING = { type: "spring", stiffness: 280, damping: 28 } as const;

type ErrorField = "email" | "password" | null;

function mapClerkError(err: any): { message: string; field: ErrorField } {
  const code: string = err?.errors?.[0]?.code ?? "";
  const raw: string = err?.errors?.[0]?.message ?? err?.message ?? "";
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

function AuthShell({ children, hero }: { children: React.ReactNode; hero: { headline: string; sub: string } }) {
  return (
    <div className="min-h-dvh w-full bg-bg flex flex-col lg:flex-row">
      <div className="hidden lg:flex lg:w-1/2 bg-lavender flex-col justify-between p-12 relative overflow-hidden">
        <div className="flex items-center gap-2.5">
          <StrideIcon fill="#3b1f8c" className="w-8 h-8 shrink-0" />
          <span className="text-[22px] font-extrabold tracking-tight text-ink">Stride</span>
        </div>
        <div className="space-y-3">
          <h2 className="text-display text-ink leading-[1.05] max-w-md">{hero.headline}</h2>
          <p className="text-[16px] text-ink/75 max-w-sm leading-relaxed">{hero.sub}</p>
        </div>
        <div className="text-[12px] text-ink/55">Stride · adaptive AI wellness</div>
      </div>

      <div className="flex-1 flex items-center justify-center p-6 lg:p-12">
        <div className="w-full max-w-sm space-y-6">
          <div className="lg:hidden flex flex-col items-center gap-4">
            {/* App icon — white S on lavender bg */}
            <div className="w-24 h-24 rounded-[22px] bg-lavender flex items-center justify-center shadow-[var(--shadow-elev)]">
              <StrideIcon fill="white" className="w-16 h-16" />
            </div>
            <span className="text-h3 font-extrabold tracking-tight text-text">Stride</span>
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
  const [view, setView] = useState<"signin" | "forgot_email" | "forgot_code" | "forgot_newpwd">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPwd, setShowPwd] = useState(false);
  const [code, setCode] = useState("");
  const [newPwd, setNewPwd] = useState("");
  const [showNewPwd, setShowNewPwd] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<ErrorField>(null);
  const [loading, setLoading] = useState(false);

  function setErr(mapped: { message: string; field: ErrorField }) {
    setError(mapped.message);
    setErrorField(mapped.field);
  }

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
    } catch (err: any) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (!signIn) return;
    try {
      await signIn.sso({ strategy: "oauth_google", redirectCallbackUrl: `${window.location.origin}/sso-callback`, redirectUrl: "/" });
    } catch (err: any) {
      setError(err?.errors?.[0]?.message ?? err?.message ?? "Google sign-in failed");
    }
  }

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
    } catch (err: any) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  async function onForgotVerifyCode(e: FormEvent) {
    e.preventDefault();
    if (!signIn) return;
    setError(null); setErrorField(null);
    setLoading(true);
    try {
      const { error: err } = await signIn.resetPasswordEmailCode.verifyCode({ code });
      if (err) { setErr(mapClerkError({ errors: [err] })); return; }
      setView("forgot_newpwd");
    } catch (err: any) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

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
    } catch (err: any) {
      setErr(mapClerkError(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <AuthShell hero={{ headline: "Welcome back. Let's pick up where you left off.", sub: "Your wellness companion remembers your habits, not just your data." }}>
      <AnimatePresence mode="wait">
        {view === "signin" && (
          <motion.div key="signin" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SPRING} className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-h1 text-text">Sign in</h1>
              <p className="text-[14px] text-text-muted">
                New here?{" "}
                <Link to="/sign-up" className="font-semibold text-text underline-offset-4 hover:underline">Create an account</Link>
              </p>
            </div>
            <form onSubmit={onSubmit} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Email</span>
                <div className={cn("flex items-center gap-2 rounded-2xl bg-card border focus-within:border-lavender transition-colors px-4 py-3", errorField === "email" ? "border-bubblegum" : "border-border")}>
                  <Mail className="h-4 w-4 text-text-muted shrink-0" strokeWidth={1.75} />
                  <input type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com"
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none" />
                </div>
              </label>
              <label className="block space-y-1.5">
                <div className="flex items-center justify-between">
                  <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Password</span>
                  <button type="button" onClick={() => { setError(null); setErrorField(null); setView("forgot_email"); }}
                    className="text-[12px] font-medium text-text-muted hover:text-text underline-offset-2 hover:underline">
                    Forgot password?
                  </button>
                </div>
                <div className={cn("flex items-center gap-2 rounded-2xl bg-card border focus-within:border-lavender transition-colors px-4 py-3", errorField === "password" ? "border-bubblegum" : "border-border")}>
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
                {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-error font-medium">{error}</motion.p>}
              </AnimatePresence>
              <button type="submit" disabled={loading || !email || !password}
                className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || !email || !password) && "opacity-50")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Sign in"}
              </button>
            </form>
            <Divider />
            <GoogleButton onClick={onGoogle} />
          </motion.div>
        )}

        {view === "forgot_email" && (
          <motion.div key="forgot_email" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SPRING} className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-h1 text-text">Reset password</h1>
              <p className="text-[14px] text-text-muted">Enter your email and we'll send a reset code.</p>
            </div>
            <form onSubmit={onForgotSendCode} className="space-y-4">
              <Field icon={Mail} label="Email" type="email" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" />
              <AnimatePresence>
                {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-error font-medium">{error}</motion.p>}
              </AnimatePresence>
              <button type="submit" disabled={loading || !email}
                className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || !email) && "opacity-50")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Send reset code"}
              </button>
            </form>
            <button type="button" onClick={() => { setError(null); setView("signin"); }} className="w-full text-[12.5px] text-text-muted hover:text-text">← Back to sign in</button>
          </motion.div>
        )}

        {view === "forgot_code" && (
          <motion.div key="forgot_code" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SPRING} className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-h1 text-text">Check your email</h1>
              <p className="text-[14px] text-text-muted">We sent a code to <span className="font-semibold text-text">{email}</span>.</p>
            </div>
            <form onSubmit={onForgotVerifyCode} className="space-y-4">
              <Field icon={KeyRound} label="Reset code" type="text" inputMode="numeric" maxLength={6} required
                value={code} onChange={(e) => setCode(e.target.value.replace(/[^0-9]/g, ""))} placeholder="123456" />
              <AnimatePresence>
                {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-error font-medium">{error}</motion.p>}
              </AnimatePresence>
              <button type="submit" disabled={loading || code.length < 6}
                className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || code.length < 6) && "opacity-50")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Verify code"}
              </button>
            </form>
            <button type="button" onClick={() => { setError(null); setView("forgot_email"); }} className="w-full text-[12.5px] text-text-muted hover:text-text">← Back</button>
          </motion.div>
        )}

        {view === "forgot_newpwd" && (
          <motion.div key="forgot_newpwd" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -4 }} transition={SPRING} className="space-y-6">
            <div className="space-y-1">
              <h1 className="text-h1 text-text">New password</h1>
              <p className="text-[14px] text-text-muted">Choose a strong password you haven't used before.</p>
            </div>
            <form onSubmit={onForgotSetPassword} className="space-y-4">
              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">New password</span>
                <div className="flex items-center gap-2 rounded-2xl bg-card border border-border focus-within:border-lavender transition-colors px-4 py-3">
                  <Lock className="h-4 w-4 text-text-muted shrink-0" strokeWidth={1.75} />
                  <input type={showNewPwd ? "text" : "password"} autoComplete="new-password" required minLength={8} value={newPwd}
                    onChange={(e) => setNewPwd(e.target.value)} placeholder="At least 8 characters"
                    className="min-w-0 flex-1 bg-transparent text-[14px] text-text placeholder:text-text-subtle focus:outline-none" />
                  <button type="button" onClick={() => setShowNewPwd((s) => !s)} className="text-text-muted hover:text-text">
                    {showNewPwd ? <EyeOff className="h-4 w-4" strokeWidth={1.75} /> : <Eye className="h-4 w-4" strokeWidth={1.75} />}
                  </button>
                </div>
              </label>
              <AnimatePresence>
                {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-error font-medium">{error}</motion.p>}
              </AnimatePresence>
              <button type="submit" disabled={loading || newPwd.length < 8}
                className={cn("w-full inline-flex items-center justify-center gap-2 rounded-full bg-ink text-text-on-ink py-3 text-[14px] font-semibold transition-opacity", (loading || newPwd.length < 8) && "opacity-50")}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : "Set new password"}
              </button>
            </form>
          </motion.div>
        )}
      </AnimatePresence>
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
      const { error: err } = await signUp.password({ emailAddress: email, password, firstName });
      if (err) { setError(mapClerkError({ errors: [err] }).message); return; }
      await signUp.verifications.sendEmailCode();
      setStep("verify");
    } catch (err: any) {
      setError(mapClerkError(err).message);
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
      await signUp.verifications.verifyEmailCode({ code });
      if (signUp.status === "complete") {
        await signUp.finalize({ navigate: ({ decorateUrl }) => { window.location.href = decorateUrl("/onboarding"); } });
      } else {
        setError("Verification incomplete — please try again");
      }
    } catch (err: any) {
      setError(mapClerkError(err).message);
    } finally {
      setLoading(false);
    }
  }

  async function onGoogle() {
    if (!signUp) return;
    try {
      await signUp.sso({
        strategy: "oauth_google",
        redirectCallbackUrl: `${window.location.origin}/sso-callback`,
        redirectUrl: "/onboarding",
      });
    } catch (err: any) {
      setError(mapClerkError(err).message);
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
                {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-error font-medium">{error}</motion.p>}
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
              {error && <motion.p initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }} className="text-[12.5px] text-error font-medium">{error}</motion.p>}
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
