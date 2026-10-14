import { useState, type FormEvent } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { plainError } from "@/lib/log";
import { weightNumber, weightToKg, weightUnit, type Units } from "@/lib/units";
import { Card } from "./Card";

// Log-weight card: saves today's weigh-in and shows the one already logged today.
export function LogWeightCard({ units }: { units: Units }) {
  const today = useQuery(api.weights.todayWeight, {});
  const logWeight = useMutation(api.weights.logWeight);
  const [value, setValue] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const unit = weightUnit(units);
  const todayKg = today?.kg ?? null;

  // Saves the typed weight as kg for today, replacing any weigh-in already logged today.
  async function save(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const typed = Number(value);
    if (value.trim() === "" || !Number.isFinite(typed)) {
      setError("Enter your weight as a number.");
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await logWeight({ kg: weightToKg(typed, units) });
      setValue("");
    } catch (err) {
      setError(plainError(err));
    } finally {
      setSaving(false);
    }
  }

  return (
    <Card title="Log weight">
      <p className="text-sm text-ink2">
        {today === undefined ? " " : todayKg === null ? "Not logged today yet." : `Today: ${weightNumber(todayKg, units)} ${unit}`}
      </p>
      <form onSubmit={save} className="flex flex-col gap-3">
        <div className="flex items-center gap-2">
          <input
            type="number"
            inputMode="decimal"
            step="0.1"
            min="0"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            aria-label={`Weight in ${unit}`}
            placeholder={units === "metric" ? "78.4" : "173"}
            className="w-32 rounded-field border border-line2 bg-card px-4 py-2 text-ink"
          />
          <span className="text-sm text-ink3">{unit}</span>
          <button
            type="submit"
            disabled={saving || value.trim() === ""}
            className="ml-auto rounded-field bg-polo px-4 py-2 text-sm font-semibold text-on-polo disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save"}
          </button>
        </div>
        {error ? <p role="alert" className="text-sm text-polo-ink">{error}</p> : null}
      </form>
    </Card>
  );
}
