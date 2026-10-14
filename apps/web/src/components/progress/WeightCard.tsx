import { addDays } from "@stride/core";
import { Card, CardSkeleton, Empty } from "@/components/ui";
import { WeightChart } from "./WeightChart";
import type { Summary } from "./types";
import { rateText, weightNumber, weightUnit, type Units } from "@/lib/units";

// Weight trend card: latest trend weight, weekly rate, and the chart for the chosen range.
export function WeightCard({ summary, range, units }: { summary: Summary | undefined; range: number; units: Units }) {
  if (summary === undefined) return <CardSkeleton className="h-[420px]" lines={4} />;
  const { weights, latestTrendKg, weeklyRateKg, localDate } = summary;

  if (latestTrendKg === null || weights.length === 0)
    return (
      <Card title="Weight trend">
        <Empty title="No weigh-ins yet." body="Log your first weigh-in and the trend line starts here." />
      </Card>
    );

  return (
    <Card title="Weight trend">
      <div className="-mt-2 flex flex-wrap items-end justify-between gap-4">
        <p className="font-display text-[44px] leading-none font-bold tracking-[-0.045em] tabular-nums">
          {weightNumber(latestTrendKg, units)}
          <span className="ml-1.5 font-body text-sm font-medium tracking-normal text-ink3">{weightUnit(units)} trend</span>
        </p>
        {weeklyRateKg === null ? null : (
          <p className="rounded-pill bg-card2 px-3 py-1 type-button-small text-ink2 tabular-nums">
            {rateText(weeklyRateKg, units)}
          </p>
        )}
      </div>
      <WeightChart points={weights} from={addDays(localDate, 1 - range)} to={localDate} units={units} />
      <p className="type-caption text-ink3">Dots are weigh-ins. The line is the trend, so one salty dinner doesn't count.</p>
    </Card>
  );
}
