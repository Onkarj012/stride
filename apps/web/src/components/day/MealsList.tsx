import { Card, Empty, Eyebrow, Skeleton, Tag } from "@/components/ui";
import { SLOTS, SLOT_NAMES, type EntryView, type MealSlot } from "@/lib/log";
import { EntryRow } from "./EntryRow";

export type Meal = { slot: MealSlot; kcal: number; firstAt: number; estimated: boolean; entries: EntryView[] };

const CLOCK = new Intl.DateTimeFormat(undefined, { hour: "numeric", minute: "2-digit" });

// Meals in SLOTS order, leaving out empty slots. The subtotal comes from the server's mealNutrients.
export function groupBySlot(entries: EntryView[]): Meal[] {
  return SLOTS.flatMap((slot) => {
    const rows = entries.filter((entry) => entry.slot === slot);
    const first = rows[0];
    if (!first) return [];
    return [
      {
        slot,
        kcal: Math.round(first.mealNutrients.kcal),
        firstAt: Math.min(...rows.map((row) => row.loggedAt)),
        estimated: rows.some((row) => row.flags.includes("estimated")),
        entries: rows,
      },
    ];
  });
}

// The day's logged food in one card, a section per meal slot. Click a food to edit it.
export function MealsList({ meals, isToday }: { meals: Meal[] | undefined; isToday: boolean }) {
  if (meals === undefined)
    return (
      <Card title="Meals">
        <div aria-busy="true" aria-label="Loading meals" className="flex flex-col gap-4">
          {[0, 1, 2].map((i) => (
            <div key={i} className="flex items-center justify-between gap-6">
              <div className="flex flex-1 flex-col gap-2">
                <Skeleton className="h-4 w-1/3" />
                <Skeleton className="h-3 w-1/2" />
              </div>
              <Skeleton className="h-5 w-14" />
            </div>
          ))}
        </div>
      </Card>
    );

  if (meals.length === 0)
    return (
      <Card title="Meals">
        <Empty
          title="Clean slate."
          body={isToday ? "Nothing logged yet. Tell me what you had in the box above, in any words." : "Nothing logged on this day."}
          mood={isToday ? "idle" : "sleep"}
        />
      </Card>
    );

  return (
    <Card className="gap-1 px-3 pb-3">
      <Eyebrow className="px-3">Meals</Eyebrow>
      <div className="flex flex-col">
        {meals.map((meal, i) => (
          <section key={meal.slot} className={i === 0 ? "" : "mt-2 border-t border-line pt-2"}>
            <div className="flex items-baseline gap-3 px-3 pt-3 pb-1">
              <h2 className="type-section">{SLOT_NAMES[meal.slot]}</h2>
              <span className="type-caption text-ink3 tabular-nums">{CLOCK.format(meal.firstAt)}</span>
              {meal.estimated ? <Tag tone="est">est.</Tag> : null}
              <span className="ml-auto type-value tabular-nums">
                {meal.kcal.toLocaleString("en-IN")}
                <span className="ml-1 type-unit text-ink3">kcal</span>
              </span>
            </div>
            <ul className="flex flex-col">
              {meal.entries.map((entry) => (
                <EntryRow key={entry._id} entry={entry} />
              ))}
            </ul>
          </section>
        ))}
      </div>
    </Card>
  );
}
