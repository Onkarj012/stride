import { useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ExpenditureCard } from "@/components/progress/ExpenditureCard";
import { LogWeightCard } from "@/components/progress/LogWeightCard";
import { StrengthCard } from "@/components/progress/StrengthCard";
import { TargetCard } from "@/components/progress/TargetCard";
import { WeightCard } from "@/components/progress/WeightCard";
import { SUMMARY_DAYS } from "@/lib/log";
import { savedUnits } from "@/lib/units";

const RANGES = [
  { label: "2W", days: SUMMARY_DAYS },
  { label: "1M", days: 30 },
  { label: "3M", days: 90 },
] as const;

// Progress page: weight trend and logging, daily burn, target, and strength.
export function ProgressPage() {
  const [range, setRange] = useState<number>(SUMMARY_DAYS);
  const summary = useQuery(api.progress_v2.summary, { rangeDays: range });
  const profile = useQuery(api.progress_v2.profile, {});
  const units = savedUnits(profile?.units);

  return (
    <div className="flex flex-col gap-6">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-sm font-semibold text-ink3">Progress</p>
          <h1 className="font-display text-3xl font-bold">Your trend</h1>
        </div>
        <div role="group" aria-label="Chart range" className="flex rounded-full bg-card2 p-1">
          {RANGES.map((option) => (
            <button
              key={option.days}
              type="button"
              aria-pressed={option.days === range}
              onClick={() => setRange(option.days)}
              className={`rounded-full px-3 py-1.5 text-sm font-semibold ${option.days === range ? "bg-card text-ink shadow-card" : "text-ink2"}`}
            >
              {option.label}
            </button>
          ))}
        </div>
      </header>
      <div className="grid gap-6 lg:grid-cols-2">
        <div className="lg:col-span-2">
          <WeightCard summary={summary} range={range} units={units} />
        </div>
        <LogWeightCard units={units} />
        <TargetCard summary={summary} sex={profile?.sex} />
        <ExpenditureCard summary={summary} />
        <div className="lg:col-span-2">
          <StrengthCard />
        </div>
      </div>
    </div>
  );
}
