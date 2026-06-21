import { useEffect, useRef } from "react";
import { Link } from "react-router-dom";
import { motion, useScroll, useTransform } from "motion/react";
import {
  Sparkles, Mic, Salad, LineChart, ShieldCheck, Cpu, KeyRound,
  ArrowRight, MessageSquareHeart, ListChecks, TrendingUp,
} from "lucide-react";
import { useMediaQuery } from "@/hooks/useMediaQuery";
import { StrideMark } from "@/components/primitives/StrideMark";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { DeviceShowcase } from "@/components/landing/DeviceShowcase";
import { cn } from "@/lib/utils";

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* Apply the visitor's OS light/dark preference to the signed-out shell.
   The landing page lives outside ThemeProvider, so we sync the .dark class
   directly. We leave the class in place on unmount so the auth pages stay
   consistent with the visitor's system theme. */
function useSystemTheme() {
  useEffect(() => {
    const mql = window.matchMedia("(prefers-color-scheme: dark)");
    const apply = () => document.documentElement.classList.toggle("dark", mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);
}

function Reveal({
  children, delay = 0, y = 18, className,
}: { children: React.ReactNode; delay?: number; y?: number; className?: string }) {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  if (reduce) return <div className={className}>{children}</div>;
  return (
    <motion.div
      initial={{ opacity: 0, y }}
      whileInView={{ opacity: 1, y: 0 }}
      viewport={{ once: true, margin: "-80px" }}
      transition={{ duration: 0.6, delay, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Nav() {
  return (
    <header className="sticky top-0 z-50 border-b border-border/60 bg-bg/80 backdrop-blur-xl">
      <div className="mx-auto flex max-w-6xl items-center justify-between px-5 py-3.5 lg:px-8">
        <div className="flex items-center gap-2.5">
          <StrideMark className="h-7 w-7" />
          <span className="text-[20px] font-extrabold tracking-tight text-text">Stride</span>
        </div>
        <div className="flex items-center gap-2.5">
          <Link
            to="/sign-in"
            className="rounded-full px-4 py-2 text-[14px] font-semibold text-text-muted transition-colors hover:text-text"
          >
            Sign in
          </Link>
          <Link
            to="/sign-up"
            className="rounded-full bg-ink px-4.5 py-2 text-[14px] font-semibold text-text-on-ink transition-transform hover:-translate-y-0.5"
          >
            Get started
          </Link>
        </div>
      </div>
    </header>
  );
}

function Hero() {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({ target: ref, offset: ["start start", "end start"] });
  const showcaseY = useTransform(scrollYProgress, [0, 1], [0, reduce ? 0 : -40]);

  return (
    <section ref={ref} className="relative overflow-hidden px-5 pt-14 pb-24 lg:px-8 lg:pt-20">
      {/* floating ambient blobs */}
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          animate={reduce ? {} : { y: [0, 24, 0], x: [0, 12, 0] }}
          transition={{ duration: 14, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -left-20 top-10 h-72 w-72 rounded-full bg-lavender/30 blur-3xl"
        />
        <motion.div
          animate={reduce ? {} : { y: [0, -28, 0], x: [0, -16, 0] }}
          transition={{ duration: 16, repeat: Infinity, ease: "easeInOut" }}
          className="absolute -right-16 top-0 h-80 w-80 rounded-full bg-sky/25 blur-3xl"
        />
        <motion.div
          animate={reduce ? {} : { y: [0, 20, 0] }}
          transition={{ duration: 18, repeat: Infinity, ease: "easeInOut" }}
          className="absolute bottom-0 left-1/3 h-72 w-72 rounded-full bg-peach/20 blur-3xl"
        />
      </div>

      <div className="mx-auto max-w-3xl text-center">
        <Reveal y={12}>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-3.5 py-1.5 text-[13px] font-semibold text-text-muted">
            <Sparkles className="h-3.5 w-3.5 text-lavender" strokeWidth={2.5} />
            Adaptive AI wellness
          </span>
        </Reveal>
        <Reveal delay={0.08}>
          <h1 className="mt-6 text-balance text-[clamp(2.25rem,6vw,4rem)] font-extrabold leading-[1.05] tracking-tight text-text">
            The wellness companion that{" "}
            <span className="bg-gradient-to-r from-lavender via-bubblegum to-peach bg-clip-text text-transparent">
              actually learns you
            </span>
          </h1>
        </Reveal>
        <Reveal delay={0.16}>
          <p className="mx-auto mt-5 max-w-xl text-pretty text-[17px] leading-relaxed text-text-muted">
            Stride tracks your nutrition and workouts, then adapts its coaching to your habits —
            so the more you use it, the more personal it gets.
          </p>
        </Reveal>
        <Reveal delay={0.24}>
          <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
            <Link
              to="/sign-up"
              className="group inline-flex items-center gap-2 rounded-full bg-ink px-6 py-3 text-[15px] font-semibold text-text-on-ink shadow-[var(--shadow-float)] transition-transform hover:-translate-y-0.5"
            >
              Get started
              <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
            </Link>
            <Link
              to="/sign-in"
              className="inline-flex items-center gap-2 rounded-full border border-border bg-card px-6 py-3 text-[15px] font-semibold text-text transition-colors hover:bg-card-elev"
            >
              Sign in
            </Link>
          </div>
        </Reveal>
      </div>

      <motion.div style={{ y: showcaseY }} className="mx-auto mt-16 max-w-5xl lg:mt-20">
        <Reveal delay={0.1} y={28}>
          <DeviceShowcase />
        </Reveal>
      </motion.div>
    </section>
  );
}

const FEATURES = [
  {
    icon: Sparkles, tone: "lavender" as const,
    title: "An AI coach that adapts",
    body: "Stry learns your routines and goals, then tailors every nudge to you — gentle, motivating, or data-first.",
  },
  {
    icon: Mic, tone: "peach" as const,
    title: "Frictionless logging",
    body: "Log by voice, text, or barcode in seconds. Just say what you ate — Stride does the macro math for you.",
  },
  {
    icon: Salad, tone: "mint" as const,
    title: "Nutrition + workouts, together",
    body: "Calories, macros, movement, sleep, and mood in one place. The full picture, not scattered apps.",
  },
  {
    icon: LineChart, tone: "sky" as const,
    title: "Insights that compound",
    body: "Streaks, weekly recaps, and milestones surface the patterns that move you forward.",
  },
];

function Features() {
  return (
    <section className="px-5 py-20 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-6xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-tight text-text">
              Everything you need to stay on track
            </h2>
            <p className="mx-auto mt-3 max-w-lg text-[16px] leading-relaxed text-text-muted">
              Built around a single idea: tracking should feel effortless, and your coach should
              actually know you.
            </p>
          </div>
        </Reveal>
        <div className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {FEATURES.map((f, i) => (
            <Reveal key={f.title} delay={i * 0.08}>
              <Card tone="card" radius="lg" padding="lg" lift className="h-full border border-border">
                <span className={cn("grid h-11 w-11 place-items-center rounded-2xl", `bg-${f.tone}`)}>
                  <f.icon className="h-5 w-5 text-text-on-accent" strokeWidth={2.25} />
                </span>
                <h3 className="mt-4 text-[17px] font-bold text-text">{f.title}</h3>
                <p className="mt-1.5 text-[14px] leading-relaxed text-text-muted">{f.body}</p>
              </Card>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const STEPS = [
  { icon: ListChecks, title: "Log it your way", body: "Snap a barcode, speak it, or type a sentence. Logging takes seconds, not menus." },
  { icon: MessageSquareHeart, title: "Your coach learns", body: "Stride spots your patterns and adapts — surfacing the right nudge at the right moment." },
  { icon: TrendingUp, title: "You improve", body: "Streaks build, insights compound, and progress turns into momentum you can feel." },
];

function HowItWorks() {
  return (
    <section className="px-5 py-20 lg:px-8 lg:py-28">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <div className="mx-auto max-w-2xl text-center">
            <Pill tone="lavender" size="sm" className="mb-4">How it works</Pill>
            <h2 className="text-[clamp(1.75rem,4vw,2.5rem)] font-extrabold tracking-tight text-text">
              A simple loop that gets smarter
            </h2>
          </div>
        </Reveal>
        <div className="relative mt-14 grid gap-8 md:grid-cols-3">
          {/* connector line */}
          <div aria-hidden className="absolute left-0 right-0 top-7 hidden h-px bg-gradient-to-r from-transparent via-border-strong to-transparent md:block" />
          {STEPS.map((s, i) => (
            <Reveal key={s.title} delay={i * 0.12} className="relative text-center">
              <div className="mx-auto grid h-14 w-14 place-items-center rounded-2xl border border-border bg-card shadow-[var(--shadow-card-hover)]">
                <s.icon className="h-6 w-6 text-lavender" strokeWidth={2.25} />
              </div>
              <div className="mx-auto mt-4 inline-flex items-center gap-1.5">
                <span className="text-[12px] font-bold uppercase tracking-wider text-text-subtle">Step {i + 1}</span>
              </div>
              <h3 className="mt-1 text-[19px] font-bold text-text">{s.title}</h3>
              <p className="mx-auto mt-2 max-w-xs text-[14px] leading-relaxed text-text-muted">{s.body}</p>
            </Reveal>
          ))}
        </div>
      </div>
    </section>
  );
}

const TRUST = [
  { icon: ShieldCheck, title: "Your data stays yours", body: "Private by default. Your logs power your coaching — never sold, never the product." },
  { icon: Cpu, title: "Powered by frontier AI", body: "Stride taps best-in-class models so your coach reasons like a thoughtful expert." },
  { icon: KeyRound, title: "Bring your own key", body: "Plug in your own OpenRouter key and pick any model — you stay in full control." },
];

function TrustStrip() {
  return (
    <section className="px-5 py-20 lg:px-8">
      <div className="mx-auto max-w-5xl">
        <Reveal>
          <Card tone="ink" radius="xl" padding="xl">
            <div className="grid gap-8 md:grid-cols-3">
              {TRUST.map((t) => (
                <div key={t.title} className="space-y-2.5">
                  <span className="grid h-10 w-10 place-items-center rounded-2xl bg-white/10">
                    <t.icon className="h-5 w-5 text-lavender" strokeWidth={2.25} />
                  </span>
                  <h3 className="text-[16px] font-bold text-text-on-ink">{t.title}</h3>
                  <p className="text-[14px] leading-relaxed text-text-on-ink/65">{t.body}</p>
                </div>
              ))}
            </div>
          </Card>
        </Reveal>
      </div>
    </section>
  );
}

function ClosingCTA() {
  const reduce = useMediaQuery("(prefers-reduced-motion: reduce)");
  return (
    <section className="relative overflow-hidden px-5 py-24 lg:px-8">
      <div aria-hidden className="pointer-events-none absolute inset-0 -z-10">
        <motion.div
          animate={reduce ? {} : { scale: [1, 1.12, 1], opacity: [0.5, 0.7, 0.5] }}
          transition={{ duration: 12, repeat: Infinity, ease: "easeInOut" }}
          className="absolute left-1/2 top-1/2 h-[420px] w-[420px] -translate-x-1/2 -translate-y-1/2 rounded-full bg-gradient-to-tr from-lavender/30 to-peach/25 blur-3xl"
        />
      </div>
      <Reveal>
        <div className="mx-auto max-w-2xl text-center">
          <StrideMark className="mx-auto h-12 w-12" />
          <h2 className="mt-6 text-[clamp(2rem,5vw,3rem)] font-extrabold leading-[1.08] tracking-tight text-text">
            Start your stride today
          </h2>
          <p className="mx-auto mt-4 max-w-md text-[17px] leading-relaxed text-text-muted">
            Your adaptive companion is ready whenever you are.
          </p>
          <Link
            to="/sign-up"
            className="group mt-8 inline-flex items-center gap-2 rounded-full bg-ink px-7 py-3.5 text-[15px] font-semibold text-text-on-ink shadow-[var(--shadow-float)] transition-transform hover:-translate-y-0.5"
          >
            Get started
            <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" strokeWidth={2.5} />
          </Link>
        </div>
      </Reveal>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-border px-5 py-10 lg:px-8">
      <div className="mx-auto flex max-w-6xl flex-col items-center justify-between gap-5 sm:flex-row">
        <div className="flex items-center gap-2.5">
          <StrideMark className="h-6 w-6" />
          <span className="text-[16px] font-extrabold tracking-tight text-text">Stride</span>
          <span className="text-[13px] text-text-subtle">· adaptive AI wellness</span>
        </div>
        <div className="flex items-center gap-6 text-[13px] text-text-muted">
          <Link to="/sign-in" className="transition-colors hover:text-text">Sign in</Link>
          <a href="#" className="transition-colors hover:text-text">Privacy</a>
          <a href="#" className="transition-colors hover:text-text">Terms</a>
        </div>
      </div>
      <p className="mx-auto mt-6 max-w-6xl text-[12px] text-text-subtle">
        © {new Date().getFullYear()} Stride. All rights reserved.
      </p>
    </footer>
  );
}

export function LandingPage() {
  useSystemTheme();
  return (
    <div className="min-h-dvh bg-bg">
      <Nav />
      <main>
        <Hero />
        <Features />
        <HowItWorks />
        <TrustStrip />
        <ClosingCTA />
      </main>
      <Footer />
    </div>
  );
}
