import { useState } from "react";
import { motion } from "motion/react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ExpenditureCard } from "@/components/progress/ExpenditureCard";
import { LogWeightCard } from "@/components/progress/LogWeightCard";
import { StrengthCard } from "@/components/progress/StrengthCard";
import { TargetCard } from "@/components/progress/TargetCard";
import { WeightCard } from "@/components/progress/WeightCard";
import { Eyebrow, pressSpring } from "@/components/ui";
import { SUMMARY_DAYS } from "@/lib/log";
import { savedUnits } from "@/lib/units";
import { cn } from "@/lib/utils";

const RANGES = [
  { label: "2W", days: SUMMARY_DAYS },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
] as const;

// Progress page: weight trend and logging, daily burn, target, and strength, in a grid that reads left to right.
export function ProgressPage() {
  const [range, setRange] = useState<number>(SUMMARY_DAYS);
  const summary = useQuery(api.progress_v2.summary, { rangeDays: range });
  const profile = useQuery(api.progress_v2.profile, {});
  const units = savedUnits(profile?.units);

  return (
    <div className="flex flex-col gap-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <Eyebrow>Progress</Eyebrow>
          <h1 className="mt-2 type-screen-title">Your trend</h1>
        </div>
        <div role="group" aria-label="Chart range" className="flex rounded-pill bg-card2 p-[3px]">
          {RANGES.map((option) => {
            const on = option.days === range;
            return (
              <button
                key={option.days}
                type="button"
                aria-pressed={on}
                onClick={() => setRange(option.days)}
                className={cn("relative rounded-pill px-4 py-[7px] type-button-small transition-colors", on ? "text-ink" : "text-ink2 hover:text-ink")}
              >
                {on ? <motion.span layoutId="range-pill" transition={pressSpring} className="absolute inset-0 rounded-pill bg-card shadow-card" /> : null}
                <span className="relative">{option.label}</span>
              </button>
            );
          })}
        </div>
      </header>
      <div className="grid items-start gap-6 xl:grid-cols-3">
        <div className="xl:col-span-2">
          <WeightCard summary={summary} range={range} units={units} />
        </div>
        <div className="flex flex-col gap-6">
          <LogWeightCard units={profile === undefined ? undefined : units} />
          <TargetCard summary={summary} sex={profile?.sex} />
        </div>
        <ExpenditureCard summary={summary} />
        <div className="xl:col-span-2">
          <StrengthCard />
        </div>
      </div>
    </div>
  );
}
