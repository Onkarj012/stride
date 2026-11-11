import { useEffect, useId, useRef, useState, type KeyboardEvent } from "react";
import { useQuery } from "convex/react";
import { Check, Search } from "lucide-react";
import { api } from "@convex/_generated/api";
import { Skeleton, fieldClass } from "@/components/ui";
import type { FoodId } from "@/lib/log";
import { cn } from "@/lib/utils";

// Next highlighted food for an arrow key. -1 means none. Down from none starts at the top; Up from none starts at the bottom.
export function stepFoodHighlight(current: number, key: "ArrowDown" | "ArrowUp", count: number): number {
  if (count <= 0) return -1;
  if (key === "ArrowDown") return current < 0 ? 0 : Math.min(count - 1, current + 1);
  return current < 0 ? count - 1 : Math.max(0, current - 1);
}

// How many foods a finished search found, read out when the list updates.
export function foodSearchStatus(count: number): string {
  if (count === 0) return "No foods found. Try another word.";
  if (count === 1) return "1 food";
  return `${count} foods`;
}

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
  const [highlight, setHighlight] = useState(-1);
  const listId = useId();
  const helpId = useId();
  const activeRow = useRef<HTMLButtonElement>(null);
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

  // A new list must not keep the previous row. Search and suggestions are different lists even when the foods match.
  const optionKey = `${searching ? "search" : "suggestions"}\n${options.map((option) => option._id).join("\n")}`;
  const [listKey, setListKey] = useState(optionKey);
  const listChanged = listKey !== optionKey;
  if (listChanged) {
    setListKey(optionKey);
    setHighlight(searching && options.length > 0 ? 0 : -1);
  }
  const active = listChanged
    ? searching && options.length > 0
      ? 0
      : -1
    : highlight >= 0 && highlight < options.length
      ? highlight
      : -1;
  const showList = !loading && options.length > 0;
  // The list still shows the last search until the debounce catches up. Enter must not take that stale row.
  const queryPending = query.trim() !== debounced;

  useEffect(() => {
    activeRow.current?.scrollIntoView({ block: "nearest" });
  }, [active, optionKey]);

  // Arrows move the highlight. Enter picks it. Typing stays in the box, so a search can keep going.
  function onSearchKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.nativeEvent.isComposing) return;
    const key = event.key;
    if (key === "ArrowDown" || key === "ArrowUp") {
      event.preventDefault();
      setHighlight((current) => stepFoodHighlight(current, key, options.length));
      return;
    }
    if (key !== "Enter") return;
    // The visible list can still be the previous search. Wait until this text is the one being shown.
    if (queryPending) {
      event.preventDefault();
      return;
    }
    const option = options[active];
    if (!option) return;
    event.preventDefault();
    onPick(option._id, option.name);
  }

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
          role="combobox"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          onKeyDown={onSearchKeyDown}
          placeholder="Search foods"
          aria-label="Search foods"
          aria-autocomplete="list"
          aria-expanded={showList}
          aria-controls={showList ? listId : undefined}
          aria-activedescendant={active >= 0 ? `${listId}-option-${active}` : undefined}
          aria-describedby={showList ? helpId : undefined}
          className={cn(fieldClass, "w-full pl-10")}
        />
      </div>
      {showList ? (
        <p id={helpId} className="type-caption text-ink3">
          <kbd className="font-body font-semibold text-ink2">Arrow keys</kbd> to move · <kbd className="font-body font-semibold text-ink2">Enter</kbd> to pick
        </p>
      ) : null}
      {loading ? (
        <div className="flex flex-col gap-2" aria-busy="true" aria-label="Searching">
          <Skeleton className="h-11" />
          <Skeleton className="h-11" />
        </div>
      ) : showList ? (
        <ul id={listId} role="listbox" aria-label="Foods" className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
          {options.map((option, index) => {
            const on = chosen === option._id;
            const highlighted = index === active;
            return (
              <li key={option._id} role="presentation">
                <button
                  type="button"
                  role="option"
                  id={`${listId}-option-${index}`}
                  ref={highlighted ? activeRow : undefined}
                  aria-selected={on}
                  onClick={() => onPick(option._id, option.name)}
                  className={cn(
                    "flex w-full items-center justify-between gap-3 rounded-sm px-3.5 py-3 text-left type-callout transition-[background-color,transform] active:scale-[0.98]",
                    on ? "bg-ink text-bg" : "bg-card2 text-ink hover:bg-line2",
                    highlighted && "ring-2 ring-polo ring-inset",
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
      ) : null}
      <p className="sr-only" role="status" aria-atomic="true">
        {searching && !loading ? foodSearchStatus(options.length) : ""}
      </p>
      {!loading && options.length === 0 ? (
        <p aria-hidden={searching || undefined} className="type-caption text-ink3">
          {searching ? "No foods found. Try another word." : "Type at least two letters to search."}
        </p>
      ) : null}
    </div>
  );
}
