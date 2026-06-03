import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { ArrowRight, Droplets, Minus, Plus, Target, Zap, Brain, ChevronDown, ChevronUp } from "lucide-react";
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


/* ── Collapsed stats summary bar — expandable on tap ── */
function PulseSummary({ logs, brief }: { logs: LogEntry[]; brief?: TodayBrief | null }) {
  const [open, setOpen] = useState(false);
  const today = todayLogs(logs);
  const kcal = Math.round(today.reduce((s, l) => s + (l.meal?.kcal ?? 0), 0));
  const protein = Math.round(today.reduce((s, l) => s + (l.meal?.protein ?? 0), 0));
  const water = today.reduce((s, l) => s + (l.water?.ml ?? 0), 0);
  const moveMin = today.reduce((s, l) => s + (l.workout?.duration ?? 0), 0);
  const stats = brief?.stats;
  const kcalTarget = stats?.adjustedCalorieTarget ?? stats?.calorieTarget ?? 2000;
  const proteinTarget = stats?.proteinTarget ?? 90;
  const kcalPct = Math.min(1, kcal / kcalTarget);

  const TONE_BAR: Record<string, string> = { peach: "bg-peach", sky: "bg-sky", mint: "bg-mint", lavender: "bg-lavender" };
  const detailTiles = [
    { label: "Calories", value: kcal > 0 ? kcal.toLocaleString() : "—", unit: "kcal", pct: kcalPct, tone: "peach" },
    { label: "Protein", value: protein > 0 ? `${protein}g` : "—", unit: "", pct: Math.min(1, protein / proteinTarget), tone: "mint" },
    { label: "Water", value: water > 0 ? (water >= 1000 ? `${(water / 1000).toFixed(1)}L` : `${water}ml`) : "—", unit: "", pct: Math.min(1, water / (stats?.waterTarget ?? 2000)), tone: "sky" },
    { label: "Movement", value: moveMin > 0 ? `${moveMin}m` : "—", unit: "", pct: Math.min(1, moveMin / 30), tone: "lavender" },
  ];

  return (
    <div className="w-full rounded-2xl border border-border bg-card overflow-hidden">
      {/* Summary line */}
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="w-full flex items-center gap-3 px-4 py-3 hover:bg-card-elev transition-colors"
      >
        {/* Mini progress arc for calories */}
        <div className="relative h-8 w-8 shrink-0">
          <svg viewBox="0 0 32 32" className="h-8 w-8 -rotate-90">
            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3" className="text-border" />
            <circle cx="16" cy="16" r="12" fill="none" stroke="currentColor" strokeWidth="3"
              strokeDasharray={`${kcalPct * 75.4} 75.4`} className="text-peach transition-all duration-500" strokeLinecap="round" />
          </svg>
        </div>
        <div className="flex-1 min-w-0 flex items-center gap-3 flex-wrap">
          <span className="text-[13px] font-semibold text-text">
            {kcal > 0 ? `${kcal.toLocaleString()} kcal` : "Nothing logged yet"}
          </span>
          {protein > 0 && <span className="text-[12px] text-text-muted">{protein}g protein</span>}
          {water > 0 && <span className="text-[12px] text-text-muted">{water >= 1000 ? `${(water / 1000).toFixed(1)}L` : `${water}ml`} water</span>}
          {moveMin > 0 && <span className="text-[12px] text-text-muted">{moveMin}m movement</span>}
        </div>
        <div className="flex items-center gap-1.5 shrink-0">
          <Link to="/insights" onClick={(e) => e.stopPropagation()} className="text-[11px] font-medium text-text-muted hover:text-text">
            Full →
          </Link>
          {open
            ? <ChevronUp className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />
            : <ChevronDown className="h-3.5 w-3.5 text-text-muted" strokeWidth={2} />}
        </div>
      </button>

      {/* Expandable detail tiles */}
      <AnimatePresence>
        {open && (
          <motion.div
            key="pulse-detail"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.22, ease: [0.22, 1, 0.36, 1] }}
            className="overflow-hidden"
          >
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-px bg-border border-t border-border">
              {detailTiles.map((t) => (
                <div key={t.label} className="flex flex-col gap-1.5 p-4 bg-card">
                  <span className="text-[10.5px] font-semibold uppercase tracking-wider text-text-muted">{t.label}</span>
                  <span className="text-[20px] font-extrabold text-text leading-none">{t.value}</span>
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
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function TodayCommandCard({ brief }: { brief?: TodayBrief | null }) {
  const command = brief?.command;

  if (!command) {
    return (
      <div className="w-full rounded-2xl border border-border bg-card px-4 py-3.5 flex items-center gap-3">
        <div className="h-8 w-8 shrink-0 rounded-full bg-lavender/20 animate-pulse" />
        <div className="flex-1 space-y-1.5">
          <div className="h-3 w-28 bg-border rounded animate-pulse" />
          <div className="h-4 w-48 bg-border rounded animate-pulse" />
        </div>
      </div>
    );
  }

  const toneColors = {
    steady: { bg: "bg-lavender/15", icon: "text-lavender", border: "border-lavender/20" },
    recovery: { bg: "bg-sky/15", icon: "text-sky", border: "border-sky/20" },
    momentum: { bg: "bg-mint/15", icon: "text-mint", border: "border-mint/20" },
    light: { bg: "bg-peach/15", icon: "text-peach", border: "border-peach/20" },
  }[command.tone];

  return (
    <div className={cn("w-full rounded-2xl border px-4 py-3.5 flex items-start gap-3", toneColors.bg, toneColors.border)}>
      <div className={cn("mt-0.5 grid h-8 w-8 shrink-0 place-items-center rounded-full bg-white/20")}>
        <Target className={cn("h-4 w-4", toneColors.icon)} strokeWidth={2} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-[11px] font-bold uppercase tracking-wider text-text-muted">Today</p>
        <p className="mt-0.5 text-[15px] font-bold text-text leading-snug">{command.doToday.action}</p>
        {command.doToday.reason && (
          <p className="mt-1 text-[12px] leading-relaxed text-text-muted">{command.doToday.reason}</p>
        )}
      </div>
    </div>
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
    <div className="w-full mx-auto max-w-2xl lg:max-w-7xl flex flex-col gap-4 lg:gap-6">

      {/* ── LAYER 1: Context engine — answers "what should I do right now?" ── */}
      <div className="flex flex-col gap-3">
        {/* 1a. The input — primary element */}
        <AssistantConsole
          inputRef={inputRef}
          queuedPrompt={queuedPrompt}
          onPromptConsumed={() => setQueuedPrompt(null)}
          presenceLine={presenceLine}
          initialActions={brief?.checkIn ? [brief.checkIn] : []}
        />

        {/* 1b. What matters today — directly below the input */}
        <TodayCommandCard brief={brief} />

        {/* 1c. Memory hint — what the system knows about you */}
        <MemoryContextHint />

        {/* 1d. Stats summary — collapsed by default, details on tap */}
        <PulseSummary logs={sortedLogs} brief={brief} />
      </div>

      {/* ── LAYER 2: Supporting tools — below the fold ── */}
      <div className="flex flex-col gap-4 pt-2 border-t border-border">

        {/* Quick actions — only when no active conversation */}
        {!hasHomeConversation && (
          <div className="flex flex-col gap-3">
            <WaterTracker logs={sortedLogs} onAdd={addWater} onUndo={undoWater} />
            <NextBestActions brief={brief} onPick={setQueuedPrompt} />
          </div>
        )}

        {/* Nudges */}
        <NudgeInbox />

        {/* One-tap quick log */}
        <QuickLogBar />

        {/* Specialist agents */}
        <SpecialistDock focusCategory={brief?.command?.doToday.category} />

        {/* Streak */}
        <StreakCard />

        {/* Recent strip */}
        <RecentStrip logs={sortedLogs} />
      </div>

    </div>
  );
}
