import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { AssistantConsole } from "@/components/home/AssistantConsole";
import { useShortcut } from "@/hooks/useShortcut";

const LOG_PROMPTS: Record<string, string> = {
  breakfast: "Log breakfast: ",
  lunch: "Log lunch: ",
  dinner: "Log dinner: ",
  snack: "Log a snack: ",
  workout: "Log a workout: ",
};

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

export function HomePage() {
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const [queuedPrompt, setQueuedPrompt] = useState<string | null>(null);
  const [searchParams, setSearchParams] = useSearchParams();
  const brief = useQuery(api.insights.getTodayBrief, {}) as TodayBrief | undefined;
  useShortcut("k", () => inputRef.current?.focus(), { meta: true });

  // Deep-link queue: ?log=<section> pre-starts the composer
  useEffect(() => {
    const logParam = searchParams.get("log");
    if (!logParam) return;
    setQueuedPrompt(LOG_PROMPTS[logParam] ?? `Log ${logParam}: `);
    setSearchParams({}, { replace: true });
  }, [searchParams, setSearchParams]);

  const presenceLine = brief?.command?.doToday
    ? `I'm watching today for: ${brief.command.doToday.title.toLowerCase()}.`
    : undefined;

  return (
    <div
      className="flex -mx-4 lg:-mx-10 -mt-[max(env(safe-area-inset-top),16px)] lg:-mt-10 -mb-[max(env(safe-area-inset-bottom),1.5rem)] lg:-mb-12"
      style={{ height: "100dvh" }}
    >
      <div className="flex-1 min-w-0 flex flex-col min-h-0">
        <AssistantConsole
          inputRef={inputRef}
          queuedPrompt={queuedPrompt}
          onPromptConsumed={() => setQueuedPrompt(null)}
          presenceLine={presenceLine}
          initialActions={brief?.checkIn ? [brief.checkIn] : []}
        />
      </div>
    </div>
  );
}
