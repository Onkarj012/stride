import { useEffect, useState } from "react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import type { FoodId } from "@/lib/log";
import { field } from "./ui";

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
  const options: { _id: FoodId; name: string; sub: string | null }[] = searching
    ? (results ?? []).map((food) => ({ _id: food._id, name: food.name, sub: `${Math.round(food.per100g.kcal)} kcal / 100 g` }))
    : candidates.map((candidate) => ({ ...candidate, sub: null }));

  return (
    <div className="flex flex-col gap-2 rounded-field bg-card p-3">
      <p className="font-semibold">{heading}</p>
      {hint ? <p className="text-sm text-ink2">{hint}</p> : null}
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="Search foods"
        aria-label="Search foods"
        className={field}
      />
      <ul className="flex flex-col gap-1">
        {options.map((option) => (
          <li key={option._id}>
            <button
              type="button"
              aria-pressed={chosen === option._id}
              onClick={() => onPick(option._id, option.name)}
              className={`flex w-full items-center justify-between gap-3 rounded-field px-3 py-2 text-left ${
                chosen === option._id ? "bg-ink text-bg" : "bg-card2 hover:bg-line"
              }`}
            >
              <span className="truncate">{option.name}</span>
              {option.sub ? <span className="shrink-0 text-xs">{option.sub}</span> : null}
            </button>
          </li>
        ))}
      </ul>
      {options.length === 0 ? (
        <p className="text-sm text-ink2">{searching && results !== undefined ? "No foods found. Try another word." : "Type to search."}</p>
      ) : null}
    </div>
  );
}
