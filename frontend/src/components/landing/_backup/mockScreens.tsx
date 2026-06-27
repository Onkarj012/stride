import { motion } from "motion/react";
import {
  Sparkles, Mic, Plus, ArrowUp, Lightbulb, Dumbbell, TrendingUp, Flame,
} from "lucide-react";
import { Card } from "@/components/primitives/Card";
import { Pill } from "@/components/primitives/Pill";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { MacroBars } from "@/components/charts/MacroBars";
import { cn } from "@/lib/utils";

export type ScreenId = "home" | "nutrition" | "coach" | "insights";
export type Variant = "phone" | "desktop";

export const SCREENS: { id: ScreenId; label: string }[] = [
  { id: "home", label: "Home" },
  { id: "nutrition", label: "Nutrition" },
  { id: "coach", label: "Coach" },
  { id: "insights", label: "Insights" },
];

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

/* Subtle staggered rise for elements inside each screen. */
function Rise({ children, i = 0, className }: { children: React.ReactNode; i?: number; className?: string }) {
  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay: 0.06 + i * 0.08, ease: EASE }}
      className={className}
    >
      {children}
    </motion.div>
  );
}

function Pad({ children, variant, className }: { children: React.ReactNode; variant: Variant; className?: string }) {
  return (
    <div className={cn("h-full w-full overflow-hidden", variant === "phone" ? "px-4 py-5" : "px-7 py-6", className)}>
      {children}
    </div>
  );
}

/* Chat message bubble matching the real MessageBubble. */
function Bubble({ role, children }: { role: "ai" | "user"; children: React.ReactNode }) {
  return (
    <div className={cn("flex", role === "user" ? "justify-end" : "justify-start")}>
      <div
        className={cn(
          "max-w-[82%] px-3.5 py-2.5 text-[13.5px] leading-relaxed",
          role === "user"
            ? "rounded-2xl rounded-br-sm bg-[var(--color-bubble-user)] text-[var(--color-bubble-user-text)]"
            : "rounded-2xl rounded-bl-sm bg-card text-text shadow-[var(--shadow-soft)]",
        )}
      >
        {children}
      </div>
    </div>
  );
}

/* The real composer: pill input with Plus, placeholder, Mic, and an ink send button. */
function Composer({ placeholder, rounded = "rounded-full" }: { placeholder: string; rounded?: string }) {
  return (
    <div className={cn("flex items-center gap-1.5 border border-border bg-card px-3 py-2 shadow-[var(--shadow-float)]", rounded)}>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted">
        <Plus className="h-4 w-4" strokeWidth={2} />
      </span>
      <span className="min-w-0 flex-1 truncate text-[13.5px] text-text-subtle">{placeholder}</span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-text-muted">
        <Mic className="h-4 w-4" strokeWidth={1.75} />
      </span>
      <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-ink text-text-on-ink">
        <ArrowUp className="h-4 w-4" strokeWidth={2.25} />
      </span>
    </div>
  );
}

/* ── Home (chat-centric assistant) ── */
function HomeScreen({ variant }: { variant: Variant }) {
  return (
    <div className={cn("flex h-full w-full flex-col", variant === "phone" ? "px-4 py-5" : "px-7 py-6")}>
      <Rise i={0}>
        <div className="space-y-0.5">
          <h3 className={cn("font-extrabold tracking-tight text-text", variant === "phone" ? "text-[21px]" : "text-[24px]")}>
            Morning, Sandra.
          </h3>
          <p className="text-[14px] text-text-muted">What's on for today?</p>
        </div>
      </Rise>

      <div className="mt-4 flex flex-1 flex-col justify-end gap-2.5 overflow-hidden">
        <Rise i={1}><Bubble role="user">had oatmeal with banana and a coffee</Bubble></Rise>

        <Rise i={2}>
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] bg-lavender">
              <Sparkles className="h-2.5 w-2.5 text-ink" strokeWidth={2.5} />
            </span>
            <div className="space-y-2">
              <Bubble role="ai">Logged it. Slow-release start, nice. Here's the breakdown:</Bubble>
              <div className="rounded-2xl border border-mint/25 bg-mint-soft px-3.5 py-3">
                <p className="text-[13px] font-bold text-text">Oatmeal, banana &amp; coffee</p>
                <p className="mt-1 text-[12.5px] font-semibold">
                  <span className="text-peach">310 kcal</span>{"  "}
                  <span className="text-lavender">8g P</span>{"  "}
                  <span className="text-sky">54g C</span>{"  "}
                  <span className="text-mint">5g F</span>
                </p>
                <div className="mt-2.5 flex gap-2">
                  <span className="rounded-full bg-mint/20 border border-mint/25 px-3 py-1 text-[12px] font-bold text-text">Confirm</span>
                  <span className="rounded-full bg-card-elev border border-border px-3 py-1 text-[12px] font-bold text-text-muted">Discard</span>
                </div>
              </div>
            </div>
          </div>
        </Rise>

        <Rise i={3}><Bubble role="user">and a 30 min easy run before work</Bubble></Rise>

        <Rise i={4}>
          <div className="flex items-start gap-2.5">
            <span className="mt-1.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] bg-lavender">
              <Sparkles className="h-2.5 w-2.5 text-ink" strokeWidth={2.5} />
            </span>
            <Bubble role="ai">Nice — logged ~280 kcal burned. You're ahead on movement today.</Bubble>
          </div>
        </Rise>
      </div>

      <Rise i={5} className="mt-3">
        <Composer placeholder="Ask Stry, paste an image, or speak…" rounded="rounded-[18px]" />
      </Rise>
    </div>
  );
}

/* ── Nutrition ── */
const SECTIONS = [
  {
    label: "Breakfast",
    meals: [{ name: "Greek yogurt & berries", kcal: 320, p: 24, c: 38, f: 6 }],
  },
  {
    label: "Lunch",
    meals: [{ name: "Grilled chicken bowl", kcal: 540, p: 46, c: 52, f: 14 }],
  },
  {
    label: "Snack",
    meals: [{ name: "Apple & almond butter", kcal: 210, p: 5, c: 24, f: 11 }],
  },
  {
    label: "Dinner",
    meals: [],
  },
] as const;

function MacroRing({ pct }: { pct: number }) {
  const C = 175.9;
  return (
    <svg width="72" height="72" viewBox="0 0 72 72" className="shrink-0">
      <circle cx="36" cy="36" r="28" fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth="9" />
      <circle
        cx="36" cy="36" r="28" fill="none" stroke="#FDB572" strokeWidth="9" strokeLinecap="round"
        strokeDasharray={C} strokeDashoffset={C * (1 - pct / 100)} transform="rotate(-90 36 36)"
      />
      <text x="36" y="40" textAnchor="middle" fontSize="13" fontWeight="800" fontFamily="Manrope" fill="#fff">{pct}%</text>
    </svg>
  );
}

function MacroLine({ label, value, target, color }: { label: string; value: string; target: string; color: string }) {
  const pct = Math.min((parseFloat(value) / parseFloat(target)) * 100, 100);
  return (
    <div>
      <div className="flex justify-between text-[11px]">
        <span className="font-semibold text-white/55">{label}</span>
        <span className="font-extrabold text-white">{value} / {target}</span>
      </div>
      <div className="mt-1 h-1 overflow-hidden rounded-full" style={{ background: "rgba(255,255,255,0.18)" }}>
        <div className="h-full rounded-full" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

function NutritionScreen({ variant }: { variant: Variant }) {
  return (
    <Pad variant={variant}>
      <div className="flex flex-col gap-3.5">
        <Rise i={0}>
          <div className="space-y-0.5">
            <h3 className={cn("font-extrabold tracking-tight text-text", variant === "phone" ? "text-[21px]" : "text-[24px]")}>
              Nutrition
            </h3>
            <p className="text-[11.5px] text-text-muted">Tuesday, Jun 17</p>
          </div>
        </Rise>

        <Rise i={1}>
          <div className="flex w-fit gap-1 rounded-xl bg-card-elev p-1">
            <span className="rounded-lg bg-card px-4 py-1.5 text-[13px] font-bold text-text shadow-[var(--shadow-soft)]">Log</span>
            <span className="rounded-lg px-4 py-1.5 text-[13px] font-bold text-text-muted">Recipes</span>
          </div>
        </Rise>

        <Rise i={2}>
          <div className="flex items-center gap-4 rounded-[20px] bg-ink p-4">
            <MacroRing pct={61} />
            <div className="flex flex-1 flex-col gap-2">
              <MacroLine label="Calories" value="1280" target="2100" color="var(--color-peach)" />
              <MacroLine label="Protein" value="78" target="130" color="var(--color-lavender)" />
              <MacroLine label="Carbs" value="142" target="210" color="var(--color-sky)" />
            </div>
          </div>
        </Rise>

        {SECTIONS.map((section, si) => (
          <Rise i={3 + si} key={section.label}>
            <div>
              <div className="mb-1.5 flex items-center justify-between">
                <p className="text-[10px] font-extrabold uppercase tracking-[0.9px] text-text-muted">{section.label}</p>
                <span className="inline-flex items-center gap-1 text-[11px] font-bold text-lavender">
                  <Plus className="h-3 w-3" strokeWidth={2.5} /> Log
                </span>
              </div>
              {section.meals.length > 0 ? section.meals.map((m) => (
                <div key={m.name} className="mb-1.5 rounded-[14px] bg-card px-3 py-2.5 shadow-[0_2px_10px_rgba(13,16,27,0.06)]">
                  <div className="flex items-start justify-between">
                    <span className="mr-2 flex-1 truncate text-[13px] font-bold text-text">{m.name}</span>
                    <span className="text-[11.5px] font-extrabold text-text-muted">{m.kcal} kcal</span>
                  </div>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <span className="rounded-full bg-lavender-soft px-2 py-0.5 text-[10px] font-bold">{m.p}g P</span>
                    <span className="rounded-full bg-peach-soft px-2 py-0.5 text-[10px] font-bold">{m.c}g C</span>
                    <span className="rounded-full bg-mint-soft px-2 py-0.5 text-[10px] font-bold">{m.f}g F</span>
                  </div>
                </div>
              )) : (
                <div className="mb-1.5 rounded-[14px] border border-dashed border-border px-3 py-3">
                  <div className="flex items-center justify-between">
                    <span className="text-[13px] font-medium text-text-muted">Not logged yet</span>
                    <span className="text-[11.5px] font-extrabold text-lavender">+52g needed</span>
                  </div>
                </div>
              )}
            </div>
          </Rise>
        ))}

        <Rise i={3 + SECTIONS.length}>
          <div className="flex items-center justify-center gap-2 rounded-[14px] border border-dashed border-border py-2.5 text-[13px] font-bold text-text-muted">
            <Plus className="h-4 w-4" strokeWidth={1.8} /> Log a meal
          </div>
        </Rise>
      </div>
    </Pad>
  );
}

/* ── Coach ── */
function CoachScreen({ variant }: { variant: Variant }) {
  return (
    <div className="flex h-full w-full">
      {/* Collapsed sidebar strip (desktop only) */}
      {variant === "desktop" && (
        <div className="flex w-12 shrink-0 flex-col items-center gap-3 border-r border-border bg-bg/40 py-5">
          <span className="grid h-9 w-9 place-items-center rounded-full border border-border text-text-muted">
            <Sparkles className="h-4 w-4" strokeWidth={1.75} />
          </span>
          <span className="grid h-9 w-9 place-items-center rounded-full border border-border text-text-muted">
            <Plus className="h-4 w-4" strokeWidth={2} />
          </span>
        </div>
      )}

      <div className={cn("flex min-w-0 flex-1 flex-col", variant === "phone" ? "px-4 py-5" : "px-6 py-6")}>
        <div className="flex flex-1 flex-col justify-end gap-3">
          <Rise i={0}>
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] bg-lavender">
                <Sparkles className="h-2.5 w-2.5 text-ink" strokeWidth={2.5} />
              </span>
              <Bubble role="ai">Hey, I'm Stry. Ready to make today count? Let's go!</Bubble>
            </div>
          </Rise>

          <Rise i={1}><Bubble role="user">plan me a quick workout, feeling low energy</Bubble></Rise>

          <Rise i={2}>
            <div className="flex items-start gap-2.5">
              <span className="mt-1.5 grid h-[18px] w-[18px] shrink-0 place-items-center rounded-[6px] bg-lavender">
                <Sparkles className="h-2.5 w-2.5 text-ink" strokeWidth={2.5} />
              </span>
              <Bubble role="ai">Let's keep it gentle. A 20-minute mobility flow plus a short walk. Want me to log it?</Bubble>
            </div>
          </Rise>
        </div>

        <Rise i={3} className="mt-3">
          <div className="mb-2.5 flex flex-wrap gap-1.5">
            {[
              { label: "Log breakfast", dot: "bg-peach" },
              { label: "How is my week?", dot: "bg-lavender" },
              { label: "Plan a workout", dot: "bg-mint" },
              { label: "I'm feeling tired", dot: "bg-sky" },
            ].map((s) => (
              <span key={s.label} className="inline-flex items-center gap-1.5 rounded-full bg-card px-3 py-1.5 text-[12px] font-bold text-text shadow-[var(--shadow-soft)]">
                <span className={cn("h-1.5 w-1.5 rounded-full", s.dot)} />
                {s.label}
              </span>
            ))}
          </div>
          <Composer placeholder="Ask Stry anything…" />
        </Rise>
      </div>
    </div>
  );
}

/* ── Insights ── */
function InsightsScreen({ variant }: { variant: Variant }) {
  return (
    <Pad variant={variant}>
      <div className="flex flex-col gap-4">
        <Rise i={0}>
          <div className="flex flex-col items-center -space-y-0.5">
            <span className={cn("font-extrabold tracking-tight text-text", variant === "phone" ? "text-[20px]" : "text-[23px]")}>Insights</span>
            <span className="text-[12px] text-text-muted">Your day so far</span>
          </div>
        </Rise>

        <Rise i={1}>
          <div className="mx-auto flex gap-1 rounded-full bg-card-elev p-1">
            {["Today", "Week", "Month"].map((p, i) => (
              <span key={p} className={cn("rounded-full px-3.5 py-1 text-[12px] font-bold", i === 0 ? "bg-card text-text shadow-[var(--shadow-soft)]" : "text-text-muted")}>{p}</span>
            ))}
          </div>
        </Rise>

        <Rise i={2}>
          <Card tone="card" radius="lg" padding="lg" className="space-y-4 border border-border">
            <div className="flex items-center justify-between">
              <h4 className="text-[14px] font-bold text-text">Nutrition</h4>
              <span className="text-[12px] text-text-muted">1,280 / 2,100 kcal</span>
            </div>
            <div className={cn("flex items-center", variant === "phone" ? "flex-col gap-4" : "gap-6")}>
              <MacroDonut kcal={1280} protein={78} carbs={142} fat={38} size={variant === "phone" ? 116 : 132} />
              <MacroBars protein={78} carbs={142} fat={38} target={{ protein: 130, carbs: 210, fat: 60 }} />
            </div>
          </Card>
        </Rise>

        <Rise i={3}>
          <Card tone="lavender" radius="xl" padding="lg" className="space-y-2.5">
            <Pill tone="ink" size="sm" className="gap-1.5">
              <Sparkles className="h-3 w-3" strokeWidth={2.25} /> Today's insights
            </Pill>
            <p className="text-[13.5px] leading-relaxed text-ink/85">
              Protein's trending up 18% this week. Front-load it at lunch and you'll comfortably hit your target by dinner.
            </p>
            <div className="flex items-start gap-2 rounded-2xl bg-ink/5 px-3 py-2">
              <Lightbulb className="mt-0.5 h-4 w-4 shrink-0 text-ink/70" strokeWidth={2} />
              <div className="min-w-0">
                <p className="text-[13px] font-bold text-ink">Add a protein snack</p>
                <p className="text-[12px] text-ink/70">You're 28g short with dinner still to go.</p>
              </div>
            </div>
          </Card>
        </Rise>

        <Rise i={4}>
          <div className="grid grid-cols-3 gap-2.5">
            {[
              { icon: Dumbbell, label: "Workouts", value: "32", unit: "min" },
              { icon: Flame, label: "Avg calories", value: "1,940", unit: "kcal/day" },
              { icon: TrendingUp, label: "Calorie goal", value: "2,100", unit: "kcal" },
            ].map((s) => (
              <div key={s.label} className="space-y-2 rounded-[16px] border border-border bg-card p-3">
                <div className="flex items-center gap-1.5">
                  <s.icon className="h-3.5 w-3.5 text-text-muted" strokeWidth={1.75} />
                  <span className="text-[10px] font-semibold uppercase tracking-wider text-text-muted">{s.label}</span>
                </div>
                <div>
                  <span className="text-[20px] font-extrabold leading-none text-text">{s.value}</span>
                  <span className="ml-1 text-[11px] text-text-muted">{s.unit}</span>
                </div>
              </div>
            ))}
          </div>
        </Rise>
      </div>
    </Pad>
  );
}

export function MockScreen({ id, variant }: { id: ScreenId; variant: Variant }) {
  switch (id) {
    case "home": return <HomeScreen variant={variant} />;
    case "nutrition": return <NutritionScreen variant={variant} />;
    case "coach": return <CoachScreen variant={variant} />;
    case "insights": return <InsightsScreen variant={variant} />;
  }
}
