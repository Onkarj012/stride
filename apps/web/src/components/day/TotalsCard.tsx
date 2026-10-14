import { targetsFor } from "@/lib/log";

type Targets = ReturnType<typeof targetsFor>;
type Eaten = { kcal: number; protein: number; carbs: number; fat: number };

// Kcal eaten against target, with protein, carbs and fat bars. Shows a loading line until totals arrive.
export function TotalsCard({ nutrients, targets }: { nutrients: Eaten | undefined; targets: Targets }) {
  if (nutrients === undefined) {
    return <div className="rounded-card bg-card p-5 text-sm text-ink3 shadow-card">Loading…</div>;
  }

  const eaten = Math.round(nutrients.kcal);
  const left = targets.kcal - eaten;

  return (
    <section className="flex flex-col gap-5 rounded-card bg-card p-5 shadow-card">
      <div className="flex items-end justify-between gap-4">
        <div>
          <div className="font-display text-4xl font-bold tracking-tight">{eaten}</div>
          <div className="text-sm text-ink2">of {targets.kcal} kcal eaten</div>
        </div>
        <div className="text-right">
          <div className={`font-semibold ${left < 0 ? "text-polo-ink" : "text-ink"}`}>{Math.abs(left)} kcal</div>
          <div className="text-sm text-ink2">{left < 0 ? "over by" : "remaining"}</div>
        </div>
      </div>
      <Bar label="Calories" eaten={eaten} target={targets.kcal} color="bg-polo" labelColor="text-ink" />
      <Bar label="Protein" eaten={nutrients.protein} target={targets.proteinG} color="bg-protein" labelColor="text-protein" />
      <Bar label="Carbs" eaten={nutrients.carbs} target={targets.carbsG} color="bg-carbs" labelColor="text-carbs" />
      <Bar label="Fat" eaten={nutrients.fat} target={targets.fatG} color="bg-fat" labelColor="text-fat" />
    </section>
  );
}

// One progress bar: amount eaten against its target, capped at full width.
function Bar({ label, eaten, target, color, labelColor }: { label: string; eaten: number; target: number; color: string; labelColor: string }) {
  const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
  const unit = label === "Calories" ? "kcal" : "g";
  return (
    <div>
      <div className="flex justify-between text-sm">
        <span className={`font-semibold ${labelColor}`}>{label}</span>
        <span className="text-ink2">
          {Math.round(eaten)} / {target} {unit}
        </span>
      </div>
      <div className="mt-1.5 h-2 overflow-hidden rounded-pill bg-card2">
        <div className={`h-full rounded-pill ${color}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}
