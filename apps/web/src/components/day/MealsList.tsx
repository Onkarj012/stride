import { SLOTS, SLOT_NAMES, type EntryView, type MealSlot } from "@/lib/log";
import { EntryRow } from "./EntryRow";

type Meal = { slot: MealSlot; kcal: number; entries: EntryView[] };

// Meals in SLOTS order, leaving out empty slots. The subtotal comes from the server's mealNutrients.
function groupBySlot(entries: EntryView[]): Meal[] {
  return SLOTS.flatMap((slot) => {
    const rows = entries.filter((entry) => entry.slot === slot);
    const first = rows[0];
    return first ? [{ slot, kcal: Math.round(first.mealNutrients.kcal), entries: rows }] : [];
  });
}

// The day's logged food, one section per meal slot.
export function MealsList({ entries }: { entries: EntryView[] | undefined }) {
  if (entries === undefined) return <p className="text-sm text-ink3">Loading meals…</p>;
  if (entries.length === 0) return <p className="text-sm text-ink2">Nothing logged on this day.</p>;

  return (
    <div className="flex flex-col gap-6">
      {groupBySlot(entries).map((meal) => (
        <section key={meal.slot} className="flex flex-col gap-2">
          <div className="flex items-baseline justify-between">
            <h2 className="font-display text-lg font-bold">{SLOT_NAMES[meal.slot]}</h2>
            <span className="text-sm text-ink2">{meal.kcal} kcal</span>
          </div>
          {meal.entries.map((entry) => (
            <EntryRow key={entry._id} entry={entry} />
          ))}
        </section>
      ))}
    </div>
  );
}
