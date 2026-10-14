import { addDays } from "@stride/core";
import { Card, Skeleton } from "./Card";
import { WeightChart } from "./WeightChart";
import type { Summary } from "./types";
import { rateText, weightNumber, weightUnit, type Units } from "@/lib/units";

// Weight trend card: latest trend weight, weekly rate, and the chart for the chosen range.
export function WeightCard({ summary, range, units }: { summary: Summary | undefined; range: number; units: Units }) {
  if (summary === undefined) return <Skeleton className="h-96" />;
  const { weights, latestTrendKg, weeklyRateKg, localDate } = summary;

  if (latestTrendKg === null || weights.length === 0)
    return (
      <Card title="Weight trend">
        <p className="text-sm text-ink2">No weigh-ins yet. Log your first weigh-in to see the trend.</p>
      </Card>
    );

  return (
    <Card title="Weight trend">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <p className="font-display text-4xl font-bold">
          {weightNumber(latestTrendKg, units)} <span className="text-lg font-semibold text-ink3">{weightUnit(units)}</span>
        </p>
        {weeklyRateKg === null ? null : <p className="text-sm font-semibold text-ink2">{rateText(weeklyRateKg, units)}</p>}
      </div>
      <WeightChart points={weights} from={addDays(localDate, 1 - range)} to={localDate} units={units} />
      <p className="text-sm text-ink3">Dots are weigh-ins. The line is the trend, so one salty dinner doesn't count.</p>
    </Card>
  );
}
