import { useRef, useState } from "react";
import { useMutation } from "convex/react";
import { Plus, X } from "lucide-react";
import { api } from "@convex/_generated/api";
import { inferSlot } from "@stride/core";
import { Button, Select, fieldClass } from "@/components/ui";
import { SLOTS, SLOT_NAMES, plainError, type FoodId, type MealSlot } from "@/lib/log";
import { cn } from "@/lib/utils";
import { FoodPicker } from "./FoodPicker";
import { submissionIdFor, type Submission } from "./submission";
import { useLogToast } from "./toasts";

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
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="flex w-full items-center gap-3.5 rounded-md border-[1.5px] border-dashed border-line2 px-4 py-3.5 text-left transition-[background-color,transform] hover:bg-card/60 active:scale-[0.99]"
      >
        <span className="grid size-9 place-items-center rounded-[12px] bg-card2 text-ink">
          <Plus className="size-[18px]" strokeWidth={1.9} />
        </span>
        <span>
          <span className="block type-body-strong">Add food</span>
          <span className="type-caption text-ink3">Search the food database and pick grams</span>
        </span>
      </button>
    );
  }

  return (
    <section className="flex flex-col gap-5 rounded-card bg-card p-6 shadow-card">
      <div className="flex items-center justify-between gap-4">
        <h2 className="type-card-title">Add food</h2>
        <button
          type="button"
          aria-label="Close"
          onClick={() => setOpen(false)}
          className="grid size-9 place-items-center rounded-pill text-ink3 transition-colors hover:bg-card2 hover:text-ink"
        >
          <X className="size-[18px]" strokeWidth={1.9} />
        </button>
      </div>

      <FoodPicker
        candidates={[]}
        chosen={food?._id ?? null}
        heading={food ? `Chosen: ${food.name}` : "Which food?"}
        onPick={(foodId, foodName) => setFood({ _id: foodId, name: foodName })}
      />

      <div className="flex flex-wrap items-end gap-3 border-t border-line pt-5">
        <label className="flex flex-col gap-1.5 type-label text-ink2">
          Grams
          <input
            type="number"
            min="0"
            step="any"
            value={gramsText}
            onChange={(e) => setGramsText(e.target.value)}
            className={cn(fieldClass, "w-28 tabular-nums")}
          />
        </label>
        <label className="flex flex-col gap-1.5 type-label text-ink2">
          Meal
          <Select
            value={slot}
            onChange={(e) => {
              const next = SLOTS.find((option) => option === e.target.value);
              if (next) setSlot(next);
            }}
            className="w-36"
          >
            {SLOTS.map((option) => (
              <option key={option} value={option}>
                {SLOT_NAMES[option]}
              </option>
            ))}
          </Select>
        </label>
        <Button className="ml-auto" disabled={!valid || busy} onClick={() => void add()}>
          {busy ? "Adding…" : "Add"}
        </Button>
      </div>

      {food && !valid ? <p className="-mt-2 type-caption text-polo-ink">Enter an amount above 0 g.</p> : null}
      {problem ? (
        <p role="alert" className="-mt-2 type-secondary text-polo-ink">
          {problem}
        </p>
      ) : null}
    </section>
  );
}
