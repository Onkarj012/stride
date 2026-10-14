import { motion, useReducedMotion } from "motion/react";
import { Eyebrow, Skeleton, pressSpring } from "@/components/ui";
import { SLOT_NAMES, targetsFor, type MealSlot } from "@/lib/log";
import { cn } from "@/lib/utils";

type Targets = ReturnType<typeof targetsFor>;
type Eaten = { kcal: number; protein: number; carbs: number; fat: number };

const NUMBER = new Intl.NumberFormat("en-IN");

// The budget hero: kcal left as a rolling number, a day bar split by meal, and the three macros.
export function TotalsCard({
  nutrients,
  targets,
  meals,
  isToday,
}: {
  nutrients: Eaten | undefined;
  targets: Targets;
  meals: { slot: MealSlot; kcal: number }[] | undefined;
  isToday: boolean;
}) {
  if (nutrients === undefined || meals === undefined) return <TotalsSkeleton />;

  const eaten = Math.round(nutrients.kcal);
  const left = targets.kcal - eaten;
  const over = left < 0;

  return (
    <section className="rounded-card bg-card p-7 shadow-card" aria-label="Day totals">
      <div className="flex items-baseline justify-between gap-4">
        <Eyebrow className={over ? "text-polo-ink" : undefined}>{over ? "Over" : isToday ? "Left today" : "Left"}</Eyebrow>
        <span className="type-caption text-ink3">{NUMBER.format(eaten)} eaten</span>
      </div>
      <div className="mt-3 flex items-end">
        <Odometer value={Math.abs(left)} className={over ? "text-polo-ink" : "text-ink"} />
        <span className="mb-2.5 ml-3 type-hero-unit text-ink3">
          {over ? "over" : "of"}
          <br />
          {NUMBER.format(targets.kcal)} kcal
        </span>
      </div>
      <DayBar meals={meals} target={targets.kcal} />
      <div className="mt-7 grid grid-cols-3 gap-4">
        <Macro name="Protein" eaten={nutrients.protein} target={targets.proteinG} dot="bg-protein" />
        <Macro name="Carbs" eaten={nutrients.carbs} target={targets.carbsG} dot="bg-carbs" />
        <Macro name="Fat" eaten={nutrients.fat} target={targets.fatG} dot="bg-fat" />
      </div>
    </section>
  );
}

// Each digit rolls to its value on a bouncy spring, like an odometer.
function Odometer({ value, className }: { value: number; className?: string }) {
  const chars = NUMBER.format(value).split("");
  return (
    <span
      aria-label={NUMBER.format(value)}
      className={cn("inline-flex h-[92px] overflow-hidden type-hero [font-variation-settings:'opsz'_96]", className)}
    >
      {chars.map((ch, i) =>
        /\d/.test(ch) ? (
          <span key={`d${chars.length - i}`} aria-hidden className="h-[1em] w-[0.6em] overflow-hidden text-center">
            <motion.span className="flex flex-col" initial={{ y: "0em" }} animate={{ y: `${-Number(ch)}em` }} transition={pressSpring}>
              {Array.from({ length: 10 }, (_, d) => (
                <span key={d} className="block h-[1em] leading-none">
                  {d}
                </span>
              ))}
            </motion.span>
          </span>
        ) : (
          <span key={`s${chars.length - i}`} aria-hidden className="w-[0.24em] leading-none">
            {ch}
          </span>
        ),
      )}
    </span>
  );
}

// One bar for the day, one segment per meal, sized by its share of the target.
function DayBar({ meals, target }: { meals: { slot: MealSlot; kcal: number }[]; target: number }) {
  const reduce = useReducedMotion();
  const total = meals.reduce((sum, meal) => sum + meal.kcal, 0);
  const scale = Math.max(target, total, 1);
  return (
    <div className="mt-5">
      <div className="flex h-3.5 gap-[3px] overflow-hidden rounded-[8px] bg-card2">
        {meals.map((meal, i) => (
          <motion.div
            key={meal.slot}
            title={`${SLOT_NAMES[meal.slot]} · ${NUMBER.format(meal.kcal)} kcal`}
            className={cn("h-full rounded-[3px] bg-ink opacity-80", i === 0 && "rounded-l-[8px]")}
            initial={reduce ? false : { width: 0 }}
            animate={{ width: `${(meal.kcal / scale) * 100}%` }}
            transition={{ ...pressSpring, delay: i * 0.06 }}
          />
        ))}
      </div>
      <div className="mt-2 flex justify-between type-label text-ink3">
        <span>{meals.length === 0 ? "No meals yet" : meals.map((meal) => SLOT_NAMES[meal.slot]).join(" · ")}</span>
        <span>{NUMBER.format(target)}</span>
      </div>
    </div>
  );
}

// One macro: dot and name, grams eaten of target, and a thin track that grows in.
function Macro({ name, eaten, target, dot }: { name: string; eaten: number; target: number; dot: string }) {
  const reduce = useReducedMotion();
  const pct = target > 0 ? Math.min(100, (eaten / target) * 100) : 0;
  return (
    <div>
      <div className="flex items-center gap-1.5 type-label text-ink2">
        <i className={cn("size-[7px] rounded-pill", dot)} />
        {name}
      </div>
      <p className="mt-1 type-metric">
        {Math.round(eaten)}
        <span className="type-label text-ink3"> / {target} g</span>
      </p>
      <div className="mt-2 h-1 overflow-hidden rounded-[4px] bg-card2">
        <motion.div
          className={cn("h-full rounded-[4px]", dot)}
          initial={reduce ? false : { width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ ...pressSpring, delay: 0.12 }}
        />
      </div>
    </div>
  );
}

// Placeholder in the hero's shape while totals load.
function TotalsSkeleton() {
  return (
    <div aria-busy="true" aria-label="Loading totals" className="flex flex-col gap-4 rounded-card bg-card p-7 shadow-card">
      <Skeleton className="h-3 w-24" />
      <Skeleton className="h-[84px] w-52" />
      <Skeleton className="h-3.5 w-full" />
      <div className="mt-3 grid grid-cols-3 gap-4">
        {[0, 1, 2].map((i) => (
          <Skeleton key={i} className="h-12" />
        ))}
      </div>
    </div>
  );
}
