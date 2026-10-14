import { KCAL_FLOOR } from "@stride/core";
import { Card, Skeleton } from "./Card";
import type { Sex, Summary } from "./types";
import { formatDayLabel } from "@/lib/date";
import { targetsFor } from "@/lib/log";

const SOURCE_TEXT = { formula: "From your profile", adaptive: "Adapted to your data" } as const;

// One line on why the target moved off the formula, or null when it did not.
function clampNote(clamped: "pace_cap" | "floor" | undefined, sex: Sex | undefined): string | null {
  if (clamped === "pace_cap") return "Capped at 1% of your weight a week to keep it safe.";
  if (clamped === "floor") return sex === undefined ? "Raised to the calorie minimum." : `Raised to the ${KCAL_FLOOR[sex]} kcal minimum.`;
  return null;
}

// Target card: today's calorie target, where it came from, and the macro split.
export function TargetCard({ summary, sex }: { summary: Summary | undefined; sex: Sex | undefined }) {
  if (summary === undefined) return <Skeleton className="h-72" />;
  const target = summary.target;
  const macros = targetsFor(target?.kcal ?? null);
  const note = target === null ? null : clampNote(target.clamped, sex);

  return (
    <Card title="Daily target">
      {target === null ? (
        <p className="text-sm text-ink2">Log a weigh-in to get your target.</p>
      ) : (
        <div className="flex flex-col gap-1">
          <p className="font-display text-4xl font-bold">
            {target.kcal.toLocaleString("en-IN")} <span className="text-lg font-semibold text-ink3">kcal / day</span>
          </p>
          <p className="text-sm text-ink2">
            {SOURCE_TEXT[target.source]} · set {formatDayLabel(target.appliedLocalDate)}
          </p>
          {note ? <p className="text-sm text-ink3">{note}</p> : null}
        </div>
      )}
      <dl className="grid grid-cols-3 gap-3">
        <Macro label="Protein" grams={macros.proteinG} tone="text-protein" />
        <Macro label="Carbs" grams={macros.carbsG} tone="text-carbs" />
        <Macro label="Fat" grams={macros.fatG} tone="text-fat" />
      </dl>
    </Card>
  );
}

// One macro target in grams, coloured by its macro.
function Macro({ label, grams, tone }: { label: string; grams: number; tone: string }) {
  return (
    <div className="rounded-field bg-card2 p-3">
      <dt className="text-xs font-semibold text-ink3">{label}</dt>
      <dd className={`font-display text-xl font-bold ${tone}`}>{Math.round(grams)} g</dd>
    </div>
  );
}
