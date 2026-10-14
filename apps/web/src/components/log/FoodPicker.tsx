import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { Check, Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Skeleton, fieldClass } from "@/components/ui";
import type { FoodId } from "@/lib/log";
import { cn } from "@/lib/utils";

// Search over the food database, or the given candidates until a search starts.
export function FoodPicker({
  candidates,
  chosen,
  heading,
  hint,
  onPick,
}: {
  candidates: { _id: FoodId; name: string }[];
  chosen: FoodId | null;
  heading: string;
  hint?: string;
  onPick: (foodId: FoodId, foodName: string) => void;
}) {
  const [query, setQuery] = useState("");
  const [debounced, setDebounced] = useState("");
  useEffect(() => {
    const timer = setTimeout(() => setDebounced(query.trim()), 250);
    return () => clearTimeout(timer);
  }, [query]);

  const searching = debounced.length >= 2;
  const results = useQuery(api.foods_db.searchFoods, searching ? { query: debounced, limit: 8 } : "skip");
  const loading = searching && results === undefined;
  const options: { _id: FoodId; name: string; sub: string | null }[] = searching
    ? (results ?? []).map((food) => ({ _id: food._id, name: food.name, sub: `${Math.round(food.per100g.kcal)} kcal / 100 g` }))
    : candidates.map((candidate) => ({ ...candidate, sub: null }));

  return (
    <div className="flex flex-col gap-3">
      <div>
        <p className="type-value">{heading}</p>
        {hint ? <p className="mt-1 type-caption text-ink3">{hint}</p> : null}
      </div>
      <div className="relative">
        <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-ink3" strokeWidth={1.9} />
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Search foods"
          aria-label="Search foods"
          className={cn(fieldClass, "w-full pl-10")}
        />
      </div>
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Searching">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : (
        <ul className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {options.map((option) => {
            const on = chosen === option._id;
            return (
              <li key={option._id}>
                <button
                  type="button"
                  aria-pressed={on}
                  onClick={() => onPick(option._id, option.name)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-sm px-3.5 py-3 text-left type-callout transition-[background-color,transform] active:scale-[0.98]",
                    on ? "bg-ink text-bg" : "bg-card2 text-ink hover:bg-line2",
                  )}
                >
                  <span className="truncate font-medium">{option.name}</span>
                  <span className={cn("flex shrink-0 items-center gap-2 type-caption", on ? "text-bg/70" : "text-ink3")}>
                    {option.sub}
                    {on ? <Check className="size-4 text-bg" strokeWidth={2.2} /> : null}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {!loading && options.length === 0 ? (
        <p className="type-caption text-ink3">{searching ? "No foods found. Try another word." : "Type at least two letters to search."}</p>
      ) : null}
    </div>
  );
}
