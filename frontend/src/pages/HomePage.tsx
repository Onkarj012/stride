import { useMemo, useRef, useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Sparkles, Lightbulb, Droplets, Plus, Minus } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AssistantConsole } from "@/components/home/AssistantConsole";
import { SpecialistDock } from "@/components/home/SpecialistDock";
import { Card } from "@/components/primitives/Card";
import { StreakCard } from "@/components/insights/StreakCard";
import { useShortcut } from "@/hooks/useShortcut";
import { useLogs } from "@/hooks/useLogs";
import { categoryById, dailyTargets } from "@/data/mock";
import type { LogEntry } from "@/lib/storage";
import { cn } from "@/lib/utils";

function startOfDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function todayLogs(logs: LogEntry[]) {
  const start = startOfDay().getTime();
  return logs.filter((l) => l.createdAt >= start);
}

function relTime(ts: number): string {
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return "just now";
  if (min < 60) return `${min}m ago`;
  const hr = Math.round(min / 60);
  if (hr < 24) return `${hr}h ago`;
  const day = Math.round(hr / 24);
  return `${day}d ago`;
}


/* ── Today's Pulse — auto-cycling detailed grid ── */
function TodaysPulse({ logs, compact = false }: { logs: LogEntry[]; compact?: boolean }) {
  const today = todayLogs(logs);
  const [slide, setSlide] = useState(0);

  const kcal = today.reduce((s, l) => s + (l.meal?.kcal ?? 0), 0);
  const protein = today.reduce((s, l) => s + (l.meal?.protein ?? 0), 0);
  const carbs = today.reduce((s, l) => s + (l.meal?.carbs ?? 0), 0);
  const fat = today.reduce((s, l) => s + (l.meal?.fat ?? 0), 0);
  const water = today.reduce((s, l) => s + (l.water?.ml ?? 0), 0);
  const moveMin = today.reduce((s, l) => s + (l.workout?.duration ?? 0), 0);
  const kcalBurned = today.reduce((s, l) => s + (l.workout?.kcal ?? 0), 0);
  const lastSleep = logs.find((l) => l.sleep)?.sleep;

  // Two "views" of the same 4-cell grid — cycle every 4s
  const views = [
    [
      { label: "Calories", value: kcal > 0 ? Math.round(kcal).toLocaleString() : "—", unit: "kcal", pct: Math.min(1, kcal / dailyTargets.kcal), tone: "peach" },
      { label: "Water", value: water > 0 ? (water / 1000).toFixed(1) : "—", unit: "L", pct: Math.min(1, water / dailyTargets.water), tone: "sky" },
      { label: "Movement", value: moveMin > 0 ? String(moveMin) : "—", unit: "min", pct: Math.min(1, moveMin / dailyTargets.workoutMinutes), tone: "mint" },
      { label: "Sleep", value: lastSleep ? lastSleep.hours.toFixed(1) : "—", unit: "h", pct: lastSleep ? Math.min(1, lastSleep.hours / dailyTargets.sleepHours) : 0, tone: "lavender" },
    ],
    [
      { label: "Protein", value: protein > 0 ? `${Math.round(protein)}g` : "—", unit: "", pct: Math.min(1, protein / 150), tone: "peach" },
      { label: "Carbs", value: carbs > 0 ? `${Math.round(carbs)}g` : "—", unit: "", pct: Math.min(1, carbs / 200), tone: "sky" },
      { label: "Fat", value: fat > 0 ? `${Math.round(fat)}g` : "—", unit: "", pct: Math.min(1, fat / 60), tone: "mint" },
      { label: "Burned", value: kcalBurned > 0 ? Math.round(kcalBurned).toLocaleString() : "—", unit: "kcal", pct: Math.min(1, kcalBurned / 500), tone: "lavender" },
    ],
  ];

  const TONE_BAR: Record<string, string> = { peach: "bg-peach", sky: "bg-sky", mint: "bg-mint", lavender: "bg-lavender" };

  // Auto-cycle
  useEffect(() => {
    const t = setInterval(() => setSlide((s) => (s + 1) % views.length), 4000);
    return () => clearInterval(t);
  }, [views.length]);

  const tiles = views[slide];

  return (
    <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-3.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Today's pulse</h3>
        <Link to="/insights" className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text">
          More <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key={slide}
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn("grid gap-px bg-border mt-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}
        >
          {tiles.map((t) => (
            <div key={t.label} className="flex flex-col gap-1.5 p-4 bg-card">
              <span className="text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">{t.label}</span>
              <div className="flex items-baseline gap-1">
                <span className="text-[22px] font-extrabold text-text leading-none">{t.value}</span>
                {t.unit && <span className="text-[12px] font-medium text-text-muted">{t.unit}</span>}
              </div>
              <div className="h-1 w-full rounded-full bg-border overflow-hidden">
                <motion.div
                  className={cn("h-full rounded-full", TONE_BAR[t.tone])}
                  initial={{ width: 0 }}
                  animate={{ width: `${t.pct * 100}%` }}
                  transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
                />
              </div>
            </div>
          ))}
        </motion.div>
      </AnimatePresence>
      {/* Dot indicators */}
      <div className="flex justify-center gap-1.5 py-2">
        {views.map((_, i) => (
          <div key={i} className={cn("h-1 rounded-full transition-all", i === slide ? "w-4 bg-text-muted" : "w-1 bg-border")} />
        ))}
      </div>
    </Card>
  );
}

/* ── Compact recent strip ── */
function RecentStrip({ logs }: { logs: LogEntry[] }) {
  // Hide noise: water quick-tap logs are already shown by the WaterTracker,
  // so they shouldn't clutter "recent" — users typically log 1L+ across
  // multiple taps and don't want each glass surfaced separately. We also
  // skip notes (legacy category).
  const meaningful = logs.filter(
    (l) => l.category !== "water" && l.category !== "note",
  );
  const items = meaningful.slice(0, 6);
  if (items.length === 0) return null;

  return (
    <section className="w-full">
      <header className="flex items-baseline justify-between mb-3 px-1">
        <h2 className="text-h3 text-text">Recent</h2>
        <Link
          to="/history"
          className="inline-flex items-center gap-1 text-[13px] font-medium text-text-muted hover:text-text"
        >
          See all
          <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
        </Link>
      </header>
      <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
        <ul role="list" className="divide-y divide-border">
          {items.map((log) => {
            const meta = categoryById[log.category];
            const Icon = meta.icon;
            const detail =
              log.meal
                ? `${log.meal.kcal} kcal`
                : log.workout
                  ? `${log.workout.duration} min`
                  : log.sleep
                    ? `${log.sleep.hours.toFixed(1)} h`
                    : log.water
                      ? `${log.water.ml} ml`
                      : log.steps
                        ? `${log.steps.count.toLocaleString()} steps`
                        : null;
            return (
              <li key={log.id} className="flex items-center gap-3 px-4 py-3">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-card-elev border border-border">
                  <Icon className="h-4 w-4 text-text-muted" strokeWidth={1.75} />
                </span>
                <div className="flex flex-1 flex-col gap-0.5 min-w-0">
                  <span className="text-[14.5px] font-semibold text-text truncate">
                    {log.text}
                  </span>
                  <span className="text-[12px] text-text-muted">
                    {meta.label}
                    {detail && ` · ${detail}`}
                    {" · "}
                    {relTime(log.createdAt)}
                  </span>
                </div>
              </li>
            );
          })}
        </ul>
      </Card>
    </section>
  );
}

/* ── Daily guidance card (backend-powered) ── */
function DailyGuidanceCard() {
  const brief = useQuery(api.insights.getTodayBrief, {});
  if (!brief) {
    return (
      <Card tone="lavender" radius="xl" padding="lg" className="space-y-2">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
          <span className="text-[12px] font-bold uppercase tracking-wider text-ink/60">Daily guidance</span>
        </div>
        <div className="h-4 w-32 bg-ink/10 rounded animate-pulse" />
        <div className="h-3 w-full bg-ink/10 rounded animate-pulse" />
      </Card>
    );
  }
  return (
    <Card tone="lavender" radius="xl" padding="lg" className="space-y-2">
      <div className="flex items-center gap-2">
        <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
        <span className="text-[12px] font-bold uppercase tracking-wider text-ink/60">{brief.headline}</span>
      </div>
      <p className="text-[15px] leading-relaxed text-ink/85">{brief.priority}</p>
    </Card>
  );
}

/* ── Coaching nudge (backend-powered) ── */
function CoachingNudgeCard() {
  const brief = useQuery(api.insights.getTodayBrief, {});
  if (!brief) {
    return (
      <Card tone="card" radius="lg" padding="md" className="flex items-center gap-3 border-l-4 border-l-peach">
        <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-peach/20">
          <Lightbulb className="h-4 w-4 text-peach" strokeWidth={2} />
        </div>
        <div className="flex-1 min-w-0 space-y-1">
          <div className="h-3 w-24 bg-text-muted/20 rounded animate-pulse" />
          <div className="h-2 w-full bg-text-muted/20 rounded animate-pulse" />
        </div>
      </Card>
    );
  }
  return (
    <Card tone="card" radius="lg" padding="md" className="flex items-center gap-3 border-l-4 border-l-peach">
      <div className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-peach/20">
        <Lightbulb className="h-4 w-4 text-peach" strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[13px] font-bold text-text">{brief.nudge.action}</p>
        <p className="text-[12px] text-text-muted">{brief.nudge.reason}</p>
      </div>
    </Card>
  );
}

/* ── Water tracker (the only thing that makes sense as a quick-tap) ── */
function WaterTracker({ logs, onAdd, onUndo }: {
  logs: LogEntry[];
  onAdd: () => void;
  onUndo: () => void;
}) {
  const todayStart = startOfDay().getTime();
  const todayWaterLogs = logs.filter((l) => l.water && l.createdAt >= todayStart);
  const glasses = todayWaterLogs.length;
  const ml = todayWaterLogs.reduce((s, l) => s + (l.water?.ml ?? 0), 0);

  return (
    <div className="w-full flex items-center gap-3 rounded-[16px] bg-card border border-border px-4 py-3">
      <Droplets className="h-5 w-5 text-sky shrink-0" strokeWidth={1.75} />
      <div className="flex-1 min-w-0">
        <span className="text-[14px] font-semibold text-text">{glasses} glass{glasses !== 1 ? "es" : ""}</span>
        <span className="text-[12px] text-text-muted ml-1.5">{ml} ml today</span>
      </div>
      <div className="flex items-center gap-1.5">
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={onUndo}
          disabled={glasses === 0}
          aria-label="Remove last glass"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-border text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={onAdd}
          aria-label="Add glass of water"
          className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-sky/20 text-sky hover:bg-sky/30 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </motion.button>
      </div>
    </div>
  );
}

export function HomePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const { logs, add, remove } = useLogs();
  useShortcut("k", () => inputRef.current?.focus(), { meta: true });

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.createdAt - a.createdAt),
    [logs],
  );

  const addWater = () => add("water", "Glass of water", { water: { ml: 250 }, agent: "water" });
  const undoWater = () => {
    const todayStart = startOfDay().getTime();
    const lastWater = sortedLogs.find((l) => l.water && l.createdAt >= todayStart);
    if (lastWater) remove(lastWater.id);
  };

  return (
    <div className="w-full mx-auto max-w-7xl flex flex-col gap-6 lg:gap-8">
      {/* Hero + side rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left: the AI companion — this IS the product */}
        <div className="lg:col-span-7 flex flex-col items-center gap-5">
          <AssistantConsole inputRef={inputRef} />
          <WaterTracker logs={sortedLogs} onAdd={addWater} onUndo={undoWater} />
        </div>

        {/* Right: just enough context — what matters now */}
        <aside className="lg:col-span-5 flex flex-col gap-4">
          <DailyGuidanceCard />
          <CoachingNudgeCard />
          <TodaysPulse logs={sortedLogs} compact />
          <StreakCard />
        </aside>
      </div>

      {/* Specialist agents — full width */}
      <SpecialistDock />

      {/* Recent strip */}
      <RecentStrip logs={sortedLogs} />
    </div>
  );
}
