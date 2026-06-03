import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, CheckCircle2, Droplets, EyeOff, HeartPulse, Minus, Plus, Sparkles, Target, Zap, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AssistantConsole } from "@/components/home/AssistantConsole";
import { SpecialistDock } from "@/components/home/SpecialistDock";
import { NudgeInbox } from "@/components/home/NudgeInbox";
import { QuickLogBar } from "@/components/home/QuickLogBar";
import { Card } from "@/components/primitives/Card";
import { SuggestionChip } from "@/components/primitives/SuggestionChip";
import { StreakCard } from "@/components/insights/StreakCard";
import { useShortcut } from "@/hooks/useShortcut";
import { useLogs } from "@/hooks/useLogs";
import { categoryById } from "@/data/mock";
import type { LogEntry } from "@/lib/storage";
import { cn } from "@/lib/utils";

type TodayBrief = {
  window: "morning" | "day" | "evening" | "night";
  headline: string;
  priority: string;
  nudge: { action: string; reason: string };
  command?: {
    doToday: { title: string; action: string; reason: string; category: string };
    recoverFrom?: { title: string; action: string } | null;
    ignoreToday?: { title: string; reason: string } | null;
    why: string;
    tone: "steady" | "recovery" | "momentum" | "light";
  };
  checkIn?: {
    type: "quick_question";
    id: string;
    title: string;
    body?: string;
    options: Array<{ label: string; value: string; prompt?: string }>;
    queue?: Array<{
      id: string;
      title: string;
      body?: string;
      options: Array<{ label: string; value: string; prompt?: string }>;
    }>;
  } | null;
  stats?: {
    todayCals: number;
    calorieTarget: number;
    adjustedCalorieTarget?: number;
    todayProtein: number;
    proteinTarget: number;
    todayCarbs?: number;
    carbTarget?: number;
    todayFat?: number;
    fatTarget?: number;
    waterMl: number;
    waterTarget: number;
    mealsLogged: number;
    workoutsLogged: number;
  };
};

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


/* ── Compact context — secondary to the command layer ── */
function TodaysPulse({ logs, brief, compact = false }: { logs: LogEntry[]; brief?: TodayBrief | null; compact?: boolean }) {
  const today = todayLogs(logs);
  const kcal = today.reduce((s, l) => s + (l.meal?.kcal ?? 0), 0);
  const protein = today.reduce((s, l) => s + (l.meal?.protein ?? 0), 0);
  const carbs = today.reduce((s, l) => s + (l.meal?.carbs ?? 0), 0);
  const fat = today.reduce((s, l) => s + (l.meal?.fat ?? 0), 0);
  const water = today.reduce((s, l) => s + (l.water?.ml ?? 0), 0);
  const moveMin = today.reduce((s, l) => s + (l.workout?.duration ?? 0), 0);
  const kcalBurned = today.reduce((s, l) => s + (l.workout?.kcal ?? 0), 0);
  const lastSleep = logs.find((l) => l.sleep)?.sleep;
  const stats = brief?.stats;

  const tiles = [
    { label: "Calories", value: kcal > 0 ? Math.round(kcal).toLocaleString() : "-", unit: "kcal", pct: Math.min(1, kcal / (stats?.adjustedCalorieTarget ?? stats?.calorieTarget ?? 2000)), tone: "peach" },
    { label: "Protein", value: protein > 0 ? `${Math.round(protein)}g` : "-", unit: "", pct: Math.min(1, protein / (stats?.proteinTarget ?? 90)), tone: "mint" },
    { label: "Water", value: water > 0 ? (water / 1000).toFixed(1) : "-", unit: "L", pct: Math.min(1, water / (stats?.waterTarget ?? 2000)), tone: "sky" },
    { label: "Movement", value: moveMin > 0 ? String(moveMin) : "-", unit: "min", pct: Math.min(1, moveMin / 30), tone: "lavender" },
  ];

  const detailTiles = [
    { label: "Carbs", value: carbs > 0 ? `${Math.round(carbs)}g` : "-", unit: "", pct: Math.min(1, carbs / (stats?.carbTarget ?? 250)), tone: "sky" },
    { label: "Fat", value: fat > 0 ? `${Math.round(fat)}g` : "-", unit: "", pct: Math.min(1, fat / (stats?.fatTarget ?? 65)), tone: "peach" },
    { label: "Burned", value: kcalBurned > 0 ? Math.round(kcalBurned).toLocaleString() : "-", unit: "kcal", pct: Math.min(1, kcalBurned / 300), tone: "mint" },
    { label: "Sleep", value: lastSleep ? lastSleep.hours.toFixed(1) : "-", unit: "h", pct: lastSleep ? Math.min(1, lastSleep.hours / 8) : 0, tone: "lavender" },
  ];

  const TONE_BAR: Record<string, string> = { peach: "bg-peach", sky: "bg-sky", mint: "bg-mint", lavender: "bg-lavender" };

  return (
    <Card tone="card" radius="lg" padding="none" className="overflow-hidden">
      <div className="flex items-baseline justify-between px-4 pt-3.5">
        <h3 className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Quick context</h3>
        <Link to="/insights" className="inline-flex items-center gap-1 text-[12px] font-medium text-text-muted hover:text-text">
          Details <ArrowRight className="h-3 w-3" strokeWidth={2} />
        </Link>
      </div>
      <AnimatePresence mode="wait">
        <motion.div
          key="quick-context"
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
          className={cn("grid gap-px bg-border mt-3", compact ? "grid-cols-2" : "grid-cols-2 sm:grid-cols-4")}
        >
          {[...tiles, ...(!compact ? detailTiles : [])].map((t) => (
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
    </Card>
  );
}

function TodayCommandCard({ brief }: { brief?: TodayBrief | null }) {
  const command = brief?.command;

  if (!command) {
    return (
      <Card tone="lavender" radius="xl" padding="lg" className="space-y-3">
        <div className="flex items-center gap-2">
          <Sparkles className="h-4 w-4 text-ink/70" strokeWidth={2} />
          <span className="text-[12px] font-bold uppercase tracking-wider text-ink/60">Today command</span>
        </div>
        <div className="h-5 w-40 bg-ink/10 rounded animate-pulse" />
        <div className="h-3 w-full bg-ink/10 rounded animate-pulse" />
      </Card>
    );
  }

  const toneClass = {
    steady: "border-l-lavender",
    recovery: "border-l-sky",
    momentum: "border-l-mint",
    light: "border-l-peach",
  }[command.tone];

  return (
    <Card tone="card" radius="xl" padding="none" className={cn("overflow-hidden border-l-4", toneClass)}>
      <div className="p-5 sm:p-6 space-y-5">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Today command</p>
            <h2 className="mt-1 text-[22px] font-extrabold tracking-tight text-text leading-tight">
              {command.doToday.title}
            </h2>
          </div>
          <div className="grid h-11 w-11 shrink-0 place-items-center rounded-full bg-lavender/20">
            <Target className="h-5 w-5 text-lavender" strokeWidth={2} />
          </div>
        </div>

        <div className="rounded-[18px] bg-card-elev border border-border p-4">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-mint" strokeWidth={2} />
            <div>
              <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Do today</p>
              <p className="mt-1 text-[15px] font-semibold leading-snug text-text">{command.doToday.action}</p>
              <p className="mt-1 text-[12.5px] leading-relaxed text-text-muted">{command.doToday.reason}</p>
            </div>
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2">
          {command.recoverFrom && (
            <div className="rounded-[16px] border border-border bg-bg/40 p-3.5">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-text-muted">
                <HeartPulse className="h-4 w-4 text-sky" strokeWidth={2} />
                Recover from
              </div>
              <p className="mt-1.5 text-[13.5px] font-semibold text-text">{command.recoverFrom.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">{command.recoverFrom.action}</p>
            </div>
          )}

          {command.ignoreToday && (
            <div className="rounded-[16px] border border-border bg-bg/40 p-3.5">
              <div className="flex items-center gap-2 text-[12px] font-bold uppercase tracking-wider text-text-muted">
                <EyeOff className="h-4 w-4 text-peach" strokeWidth={2} />
                Ignore today
              </div>
              <p className="mt-1.5 text-[13.5px] font-semibold text-text">{command.ignoreToday.title}</p>
              <p className="mt-0.5 text-[12.5px] leading-relaxed text-text-muted">{command.ignoreToday.reason}</p>
            </div>
          )}
        </div>
      </div>
    </Card>
  );
}

function nextActionPrompts(brief?: TodayBrief | null) {
  const category = brief?.command?.doToday.category;
  const base = brief?.command?.doToday.action;
  const prompts = [
    base ? `Help me with this: ${base}` : "What should I focus on right now?",
    "Log my last meal",
    "I feel off today",
  ];
  if (category === "water") prompts.splice(1, 0, "Log 250ml water");
  if (category === "recovery") prompts.splice(1, 0, "Plan a recovery workout");
  if (category === "meal") prompts.splice(1, 0, "Suggest a simple protein meal");
  if (category === "reflection") prompts.splice(1, 0, "Close out today");
  return Array.from(new Set(prompts)).slice(0, 5);
}

function NextBestActions({ brief, onPick }: { brief?: TodayBrief | null; onPick: (prompt: string) => void }) {
  return (
    <section aria-label="Next best actions" className="w-full">
      <div className="flex items-center gap-1.5 mb-2 px-1">
        <Zap className="h-3.5 w-3.5 text-peach" strokeWidth={2.5} />
        <h2 className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Next best actions</h2>
      </div>
      <div className="flex flex-wrap gap-2">
        {nextActionPrompts(brief).map((prompt) => (
          <SuggestionChip key={prompt} label={prompt} onClick={() => onPick(prompt)} />
        ))}
      </div>
    </section>
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
          className="inline-flex h-10 w-10 items-center justify-center rounded-full border border-border text-text-muted hover:text-text disabled:opacity-30 disabled:cursor-not-allowed transition-colors"
        >
          <Minus className="h-4 w-4" strokeWidth={2} />
        </motion.button>
        <motion.button
          type="button"
          whileTap={{ scale: 0.88 }}
          onClick={onAdd}
          aria-label="Add glass of water"
          className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-sky/20 text-sky hover:bg-sky/30 transition-colors"
        >
          <Plus className="h-4 w-4" strokeWidth={2} />
        </motion.button>
      </div>
    </div>
  );
}

/* ── Memory context hint — shows known food count + expandable list ── */
function MemoryContextHint() {
  const [open, setOpen] = useState(false);
  const memories = useQuery(api.food_memory.getTopMemoriesPublic, {}) as
    | Array<{ name: string; kcal: number; timesLogged: number }>
    | undefined;

  if (!memories || memories.length === 0) return null;

  return (
    <motion.div
      initial={{ opacity: 0, y: 4 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
      className="w-full rounded-2xl border border-border bg-card overflow-hidden"
    >
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-2.5 px-4 py-3 text-left hover:bg-card-elev transition-colors"
      >
        <Brain className="h-4 w-4 text-lavender shrink-0" strokeWidth={1.75} />
        <span className="flex-1 text-[13px] font-medium text-text">
          I know {memories.length} of your usual meal{memories.length !== 1 ? "s" : ""}
        </span>
        <span className="text-[11px] text-text-muted">
          {open ? <ChevronUp className="h-3.5 w-3.5" strokeWidth={2} /> : <ChevronDown className="h-3.5 w-3.5" strokeWidth={2} />}
        </span>
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            key="memory-list"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="border-t border-border px-4 pb-3 pt-2 flex flex-wrap gap-2">
              {memories.map((m) => (
                <span key={m.name} className="inline-flex items-center gap-1.5 rounded-full bg-lavender/10 border border-lavender/20 px-2.5 py-1 text-[12px] font-medium text-text">
                  {m.name}
                  <span className="text-[11px] text-text-muted">{m.kcal} kcal</span>
                </span>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </motion.div>
  );
}

export function HomePage() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const { logs, add, remove } = useLogs();
  const brief = useQuery(api.insights.getTodayBrief, {}) as TodayBrief | undefined;
  const homepageChat = useQuery(api.chat.getHomepageMessages, {}) as { messages?: unknown[] } | undefined;
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
  const presenceLine = brief?.command?.doToday
    ? `I'm watching today for: ${brief.command.doToday.title.toLowerCase()}.`
    : undefined;
  const hasHomeConversation = (homepageChat?.messages?.length ?? 0) > 0;

  return (
    <div className="w-full mx-auto max-w-7xl flex flex-col gap-6 lg:gap-8">
      {/* Hero + side rail */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 lg:gap-8 items-start">
        {/* Left: the AI companion — this IS the product */}
        <div className="lg:col-span-7 flex flex-col items-center gap-5">
          <AssistantConsole
            inputRef={inputRef}
            queuedPrompt={queuedPrompt}
            onPromptConsumed={() => setQueuedPrompt(null)}
            presenceLine={presenceLine}
            initialActions={brief?.checkIn ? [brief.checkIn] : []}
          />
          <MemoryContextHint />
          {!hasHomeConversation && (
            <>
              <WaterTracker logs={sortedLogs} onAdd={addWater} onUndo={undoWater} />
              <NextBestActions brief={brief} onPick={setQueuedPrompt} />
            </>
          )}
        </div>

        {/* Right: just enough context — what matters now */}
        <aside className="lg:col-span-5 flex flex-col gap-4">
          <TodayCommandCard brief={brief} />
          <NudgeInbox />
          <TodaysPulse logs={sortedLogs} brief={brief} compact />
          <StreakCard />
        </aside>
      </div>

      {/* One-tap quick log */}
      <QuickLogBar />

      {/* Specialist agents — optional depth, after the daily action layer */}
      <SpecialistDock focusCategory={brief?.command?.doToday.category} />

      {/* Recent strip */}
      <RecentStrip logs={sortedLogs} />
    </div>
  );
}
