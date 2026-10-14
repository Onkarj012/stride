import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { inferSlot } from "@stride/core";
import { SLOTS, SLOT_NAMES, plainError, type FoodId, type MealSlot } from "@/lib/log";
import { FoodPicker } from "./FoodPicker";
import { submissionIdFor, type Submission } from "./submission";
import { useLogToast } from "./toasts";
import { field, outlineButton, primaryButton, quietButton } from "./ui";

// Manual add for the day shown. Works on past days too, unlike typed logging.
export function AddFood({ localDate }: { localDate: string }) {
  const addEntries = useMutation(api.entries.addEntries);
  const showLogged = useLogToast();
  const [open, setOpen] = useState(false);
  const [food, setFood] = useState<{ _id: FoodId; name: string } | null>(null);
  const [gramsText, setGramsText] = useState("100");
  const [slot, setSlot] = useState<MealSlot>(() => {
    const now = new Date();
    return inferSlot(now.getHours(), now.getMinutes());
  });
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState<string | null>(null);
  const pending = useRef<Submission>(null);

  const grams = Number(gramsText);
  const valid = food !== null && Number.isFinite(grams) && grams > 0;

  // Writes the entry. A retry of the same food, grams and meal reuses its submission id.
  async function add() {
    if (!food || !valid) return;
    const submissionId = submissionIdFor(pending, `${food._id}|${grams}|${slot}|${localDate}`);
    setBusy(true);
    setProblem(null);
    try {
      const entryIds = await addEntries({
        submissionId,
        items: [{ foodId: food._id, grams, source: "db", slot, localDate }],
      });
      pending.current = null;
      setOpen(false);
      setFood(null);
      setGramsText("100");
      showLogged({ title: "Logged", sub: `${food.name} · ${grams} g · ${SLOT_NAMES[slot]}`, entryIds });
    } catch (err) {
      setProblem(plainError(err));
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className={`${outlineButton} self-start`}>
        Add food
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <h2 className="font-display text-lg font-bold">Add food</h2>
        <button type="button" onClick={() => setOpen(false)} className={quietButton}>
          Cancel
        </button>
      </div>

      <FoodPicker
        candidates={[]}
        chosen={food?._id ?? null}
        heading={food ? `Chosen: ${food.name}` : "Which food?"}
        onPick={(foodId, foodName) => setFood({ _id: foodId, name: foodName })}
      />

      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
          Grams
          <input
            type="number"
            min="0"
            step="any"
            value={gramsText}
            onChange={(e) => setGramsText(e.target.value)}
            className={`${field} w-28 font-normal`}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
          Meal
          <select
            value={slot}
            onChange={(e) => {
              const next = SLOTS.find((option) => option === e.target.value);
              if (next) setSlot(next);
            }}
            className={`${field} font-normal`}
          >
            {SLOTS.map((option) => (
              <option key={option} value={option}>
                {SLOT_NAMES[option]}
              </option>
            ))}
          </select>
        </label>
      </div>

      {food && !valid ? <p className="text-sm text-polo-ink">Enter an amount above 0 g.</p> : null}
      {problem ? <p className="text-sm text-polo-ink">{problem}</p> : null}
      <button type="button" disabled={!valid || busy} onClick={() => void add()} className={`${primaryButton} self-start`}>
        {busy ? "Adding…" : "Add"}
      </button>
    </section>
  );
}
