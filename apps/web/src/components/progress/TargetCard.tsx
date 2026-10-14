import { KCAL_FLOOR } from "@stride/core";
import { Card, CardSkeleton } from "@/components/ui";
import type { Sex, Summary } from "./types";
import { formatDayLabel } from "@/lib/date";
import { targetsFor } from "@/lib/log";
import { cn } from "@/lib/utils";

const SOURCE_TEXT = { formula: "From your profile", adaptive: "Adapted to your data" } as const;

// One line on why the target moved off the formula, or null when it did not.
function clampNote(clamped: "pace_cap" | "floor" | undefined, sex: Sex | undefined): string | null {
  if (clamped === "pace_cap") return "Capped at 1% of your weight a week to keep it safe.";
  if (clamped === "floor") return sex === undefined ? "Raised to the calorie minimum." : `Raised to the ${KCAL_FLOOR[sex]} kcal minimum.`;
  return null;
}

// Target card: today's calorie target, where it came from, and the macro split.
export function TargetCard({ summary, sex }: { summary: Summary | undefined; sex: Sex | undefined }) {
  if (summary === undefined) return <CardSkeleton lines={2} />;
  const target = summary.target;
  const macros = targetsFor(target?.kcal ?? null);
  const note = target === null ? null : clampNote(target.clamped, sex);

  return (
    <Card title="Daily target">
      {target === null ? (
        <p className="-mt-2 type-secondary text-ink2">Log a weigh-in to get your target. Until then the split below uses the default.</p>
      ) : (
        <div className="-mt-2 flex flex-col gap-1.5">
          <p className="font-display text-[44px] leading-none font-bold tracking-[-0.045em] tabular-nums">
            {target.kcal.toLocaleString("en-IN")}
            <span className="ml-1.5 font-body text-sm font-medium tracking-normal text-ink3">kcal / day</span>
          </p>
          <p className="type-caption text-ink2">
            {SOURCE_TEXT[target.source]} · set {formatDayLabel(target.appliedLocalDate)}
          </p>
          {note ? <p className="type-caption text-ink3">{note}</p> : null}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-2">
        <Macro label="Protein" grams={macros.proteinG} dot="bg-protein" />
        <Macro label="Carbs" grams={macros.carbsG} dot="bg-carbs" />
        <Macro label="Fat" grams={macros.fatG} dot="bg-fat" />
      </dl>
    </Card>
  );
}

// One macro target in grams, keyed by its macro colour.
function Macro({ label, grams, dot }: { label: string; grams: number; dot: string }) {
  return (
    <div className="rounded-sm bg-card2 px-3 py-2.5">
      <dt className="flex items-center gap-1.5 type-label text-ink2">
        <i className={cn("size-[7px] rounded-pill", dot)} />
        {label}
      </dt>
      <dd className="mt-0.5 type-metric tabular-nums">
        {Math.round(grams)}
        <span className="ml-0.5 type-label text-ink3">g</span>
      </dd>
    </div>
  );
}
