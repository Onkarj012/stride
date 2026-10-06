import { useNavigate } from "react-router-dom";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { Doc, Id } from "@convex/_generated/dataModel";
import { useUser } from "@clerk/react";
import { MacroSummary, MobileIcon, ScreenHeader } from "@/components/mobile/MobileKit";
import { NarrativeCard, StatChip, StrideMark, WaterTracker } from "@/components/ui-kit";
import { Skeleton } from "@/components/primitives/Skeleton";
import { useDailyWindow } from "@/hooks/useDailyWindow";
import { submitWaterIntent } from "@/hooks/useLogs";
import { localDateStr } from "@/lib/utils";

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

function greetingFor(firstName: string, window?: TodayBrief["window"]): string {
  switch (window) {
    case "morning": return `Morning, ${firstName}.`;
    case "day": return `Hi, ${firstName}.`;
    case "evening": return `Evening, ${firstName}.`;
    case "night": return `Hey ${firstName}.`;
    default: {
      const hour = new Date().getHours();
      if (hour < 12) return `Morning, ${firstName}.`;
      if (hour < 18) return `Hi, ${firstName}.`;
      return `Evening, ${firstName}.`;
    }
  }
}

export function HomePage() {
  const navigate = useNavigate();
  const { user } = useUser();
  const today = localDateStr();
  const dailyWindow = useDailyWindow();
  const brief = useQuery(api.insights.getTodayBrief, { today, window: dailyWindow }) as TodayBrief | undefined;
  const waterLogs = useQuery(api.wellness.getWater, { date: today });
  const addWater = useMutation(api.wellness.addWater);
  const deleteWater = useMutation(api.wellness.deleteWater);
  const stats = brief?.stats;
  const totals = {
    kcal: Math.round(stats?.todayCals ?? 0),
    protein: Math.round(stats?.todayProtein ?? 0),
    carbs: Math.round(stats?.todayCarbs ?? 0),
    fat: Math.round(stats?.todayFat ?? 0),
  };
  const target = {
    kcal: Math.round(stats?.adjustedCalorieTarget ?? stats?.calorieTarget ?? 0),
    protein: Math.round(stats?.proteinTarget ?? 0),
    carbs: Math.round(stats?.carbTarget ?? 0),
    fat: Math.round(stats?.fatTarget ?? 0),
  };
  const todayLabel = new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" });
  const firstName = user?.firstName ?? user?.username ?? "there";
  const initial = [user?.firstName?.[0], user?.lastName?.[0]].filter(Boolean).join("").toUpperCase() || user?.username?.[0]?.toUpperCase() || "?";
  const waterMl = waterLogs
    ? waterLogs.reduce((sum: number, row: Doc<"water_logs">) => sum + row.ml, 0)
    : (stats?.waterMl ?? 0);

  async function handleAddWater(ml: number, idempotencyToken: string) {
    await submitWaterIntent(addWater, { ml, date: today, idempotencyToken });
  }

  async function handleRemoveWater(ml: number) {
    const latest = [...(waterLogs ?? [])]
      .filter((row) => row.ml === ml)
      .sort((a, b) => (b._creationTime ?? 0) - (a._creationTime ?? 0))[0];
    if (!latest) return;
    await deleteWater({ id: latest._id as Id<"water_logs"> });
  }

  if (brief === undefined) {
    return (
      <>
        <div className="px-5 pt-4 pb-6">
          <ScreenHeader
            title={`Hi, ${firstName}.`}
            sub={todayLabel}
            right={
              <div className="flex items-center gap-2 pt-1">
                <button onClick={() => navigate("/history")} aria-label="History" className="w-10 h-10 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_6px_18px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/60 dark:text-white/60 active:scale-95 transition-transform">
                  <MobileIcon size={18}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></MobileIcon>
                </button>
                <button onClick={() => navigate("/settings")} aria-label="Account" className="w-10 h-10 rounded-full bg-lavender flex items-center justify-center text-[16px] font-extrabold text-ink active:scale-95 transition-transform">{initial}</button>
              </div>
            }
          />
          <div className="space-y-3">
            <Skeleton className="h-40 w-full rounded-[20px]" />
            <Skeleton className="h-24 w-full rounded-[20px]" />
          </div>
        </div>
      </>
    );
  }

  return (
    <>
      <div className="px-5 pt-4 pb-6">
        <ScreenHeader
          title={greetingFor(firstName, brief?.window)}
          sub={todayLabel}
          right={
            <div className="flex items-center gap-2 pt-1">
              <button onClick={() => navigate("/history")} aria-label="History" className="w-10 h-10 rounded-full bg-white dark:bg-[#1a1e2e] shadow-[0_6px_18px_rgba(13,16,27,0.08)] flex items-center justify-center text-ink/60 dark:text-white/60 active:scale-95 transition-transform">
                <MobileIcon size={18}><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M3 9h18M8 2v4M16 2v4" /></MobileIcon>
              </button>
              <button onClick={() => navigate("/settings")} aria-label="Account" className="w-10 h-10 rounded-full bg-lavender flex items-center justify-center text-[16px] font-extrabold text-ink active:scale-95 transition-transform">{initial}</button>
            </div>
          }
        />

        <div className="space-y-4">
          <NarrativeCard
            type="daily"
            narrative={brief?.priority ?? brief?.command?.why ?? "Tell Stry what you eat, how you train, or how you feel. It will turn the day into a useful log."}
            date="Today"
          />
          <MacroSummary totals={totals} target={target} />
          <div className="flex gap-2 overflow-x-auto -mx-5 px-5 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <StatChip label="Meals" value={String(stats?.mealsLogged ?? 0)} color="peach" />
            <StatChip label="Workouts" value={String(stats?.workoutsLogged ?? 0)} color="lavender" />
            <StatChip label="Water" value={String(Math.round(waterMl / 100) / 10)} unit="L" color="sky" />
          </div>
          <WaterTracker current={waterMl} target={stats?.waterTarget ?? 2500} unit="ml" onAdd={handleAddWater} onRemove={handleRemoveWater} />
          <button
            onClick={() => navigate("/coach")}
            className="w-full text-left bg-ink dark:bg-lavender rounded-[20px] p-5 shadow-[0_14px_38px_rgba(13,16,27,0.22)] active:scale-[0.98] transition-transform"
          >
            <div className="flex items-center gap-3">
              <span className="w-11 h-11 rounded-full bg-white/15 dark:bg-ink/15 flex items-center justify-center text-white dark:text-ink shrink-0">
                <StrideMark className="w-7 h-7" />
              </span>
              <div className="min-w-0">
                <p className="text-[15px] font-extrabold text-white dark:text-ink">Tell Stry about your day</p>
                <p className="text-[13px] font-medium text-white/55 dark:text-ink/55 mt-0.5 truncate">Type, speak, or snap a photo to log</p>
              </div>
              <span className="ml-auto text-white/60 dark:text-ink/60"><MobileIcon size={20}><path d="M9 6l6 6-6 6" /></MobileIcon></span>
            </div>
          </button>
        </div>
      </div>
    </>
  );
}
