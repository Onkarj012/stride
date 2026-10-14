import { useEffect, useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { Check } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Button, Card, Skeleton, fieldClass } from "@/components/ui";
import { plainError } from "@/lib/log";
import { weightNumber, weightToKg, weightUnit, type Units } from "@/lib/units";
import { cn } from "@/lib/utils";

// Log-weight card: saves today's weigh-in and shows the one already logged today. Units undefined means the profile is still loading.
export function LogWeightCard({ localDate, units }: { localDate: string; units: Units | undefined }) {
  const today = useQuery(api.weights.todayWeight, { localDate });
  const logWeight = useMutation(api.weights.logWeight);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = units === undefined ? "" : weightUnit(units);
  const todayKg = today?.kg ?? null;

  // A typed value is in the old unit once the units change, so it is cleared.
  useEffect(() => {
    setValue("");
  }, [units]);

  // Saves the typed weight as kg for today, replacing any weigh-in already logged today.
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (units === undefined) return;
    const typed = Number(value);
    if (value.trim() === "" || !Number.isFinite(typed)) {
      setError("Enter your weight as a number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await logWeight({ kg: weightToKg(typed, units), localDate });
      setValue("");
    } catch (err) {
      setError(plainError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Morning weight">
      <div className="-mt-2">
        {today === undefined || units === undefined ? (
          <Skeleton className="h-5 w-40" />
        ) : todayKg === null ? (
          <p className="type-secondary text-ink2">Not logged today yet. Optional, and it feeds your burn estimate.</p>
        ) : (
          <p className="flex items-center gap-2 type-secondary text-ink2">
            <span className="grid size-5 place-items-center rounded-pill bg-fat text-card">
              <Check className="size-3" strokeWidth={3} />
            </span>
            Today
            <span className="type-value text-ink tabular-nums">
              {weightNumber(todayKg, units)} {unit}
            </span>
          </p>
        )}
      </div>
      <form onSubmit={save} className="flex flex-col gap-2">
        <div className="flex items-center gap-2">
          <span className="relative flex-1">
            <input
              type="number"
              inputMode="decimal"
              step="0.1"
              min="0"
              value={value}
              disabled={units === undefined}
              onChange={(event) => setValue(event.target.value)}
              aria-label={`Weight in ${unit}`}
              aria-invalid={error !== null}
              placeholder={units === "imperial" ? "173" : "78.4"}
              className={cn(fieldClass, "h-11 w-full pr-11 font-display text-lg font-semibold tabular-nums", error && "border-polo-ink")}
            />
            <span className="pointer-events-none absolute top-1/2 right-3.5 -translate-y-1/2 type-unit text-ink3">{unit}</span>
          </span>
          <Button type="submit" disabled={units === undefined || saving || value.trim() === ""}>
            {saving ? "Saving…" : todayKg === null ? "Save" : "Replace"}
          </Button>
        </div>
        {error ? (
          <p role="alert" className="type-caption text-polo-ink">
            {error}
          </p>
        ) : null}
      </form>
    </Card>
  );
}
