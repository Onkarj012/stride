import { useMemo, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Target, Brain, ChevronDown, ChevronUp } from "lucide-react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AssistantConsole } from "@/components/home/AssistantConsole";
import { NudgeInbox } from "@/components/home/NudgeInbox";
import { StreakCard } from "@/components/insights/StreakCard";
import { useShortcut } from "@/hooks/useShortcut";
import { useLogs } from "@/hooks/useLogs";
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
  const { logs } = useLogs();
  const brief = useQuery(api.insights.getTodayBrief, {}) as TodayBrief | undefined;
  useShortcut("k", () => inputRef.current?.focus(), { meta: true });

  const sortedLogs = useMemo(
    () => [...logs].sort((a, b) => b.createdAt - a.createdAt),
    [logs],
  );

  const presenceLine = brief?.command?.doToday
    ? `I'm watching today for: ${brief.command.doToday.title.toLowerCase()}.`
    : undefined;

  return (
    /* Full-height layout — break out of AppLayout padding to fill the screen */
    <div className="flex -mx-4 lg:-mx-10 -mt-[max(env(safe-area-inset-top),16px)] lg:-mt-10 -mb-[max(calc(env(safe-area-inset-bottom)+7rem),7rem)] lg:-mb-12 h-dvh lg:h-[calc(100dvh-0px)]" style={{ height: "100dvh" }}>

      {/* ── Chat column — full height, full width on mobile ── */}
      <div className="flex-1 min-w-0 flex flex-col min-h-0 border-r border-border">
        <AssistantConsole
          inputRef={inputRef}
          queuedPrompt={queuedPrompt}
          onPromptConsumed={() => setQueuedPrompt(null)}
          presenceLine={presenceLine}
          initialActions={brief?.checkIn ? [brief.checkIn] : []}
        />
      </div>

      {/* ── Context sidebar — desktop only, 300px, scrollable ── */}
      <aside className="hidden lg:flex w-[300px] shrink-0 flex-col gap-4 overflow-y-auto px-5 py-5 bg-bg">
        <TodayCommandCard brief={brief} />
        <MemoryContextHint />
        <PulseSummary logs={sortedLogs} brief={brief} />
        <NudgeInbox />
        <StreakCard />
      </aside>

    </div>
  );
}
