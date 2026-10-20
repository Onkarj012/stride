import { useState } from "react";
import { motion } from "motion/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useToast } from "@/components/Toast";
import { formatDayLabel } from "@/lib/date";
import { plainError, SLOT_NAMES, type DraftId, type DraftItem, type FoodId } from "@/lib/log";
import { FoodPicker } from "./FoodPicker";
import { loggedTitle, useLogToast } from "./toasts";
import { Button, CardSkeleton, Polo, Tag, fieldClass, pressSpring } from "@/components/ui";
import { cn } from "@/lib/utils";

/** One change the user made to a draft item before confirming. */
type Fix = { remove?: boolean; foodId?: FoodId; foodName?: string; grams?: number; localDate?: string };

// A grams amount that can be logged, or undefined for empty, zero, negative or non-numeric text.
function parseGrams(raw: string): number | undefined {
  const grams = Number(raw);
  return Number.isFinite(grams) && grams > 0 ? grams : undefined;
}

// What an item will log as. The server's preview is scaled to the grams the user chose.
function viewOf(item: DraftItem, fix: Fix) {
  const foodName = fix.foodName ?? item.food?.name ?? null;
  const changedFood = fix.foodId !== undefined && fix.foodId !== item.food?._id;
  const grams = fix.grams ?? (changedFood ? null : item.grams);
  // Display only: nutrients scale linearly with grams, and the server recomputes them on confirm.
  const factor = grams !== null && item.grams ? grams / item.grams : 1;
  const kcal = changedFood || !item.preview ? null : item.preview.kcal * factor;
  const protein = changedFood || !item.preview ? null : item.preview.protein * factor;
  return { foodName, changedFood, grams, kcal, protein };
}

// Where an item will be saved: its meal, plus its day when that is not the page's day. Null parts are left out.
function destinationOf(item: DraftItem, pageDate: string): string | null {
  const parts = [
    item.slot ? SLOT_NAMES[item.slot] : null,
    item.localDate && item.localDate !== pageDate ? formatDayLabel(item.localDate) : null,
  ].filter((part): part is string => part !== null);
  return parts.length > 0 ? parts.join(" · ") : null;
}

// "2", "1½" or "0.75" for a quantity.
function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  if (q - whole === 0.5) return whole === 0 ? "½" : `${whole}½`;
  return String(Math.round(q * 100) / 100);
}

// The amount line under an item: its quantity as typed, its grams, or why it has none.
function amountText(item: DraftItem, fix: Fix, view: ReturnType<typeof viewOf>): string {
  if (view.grams === null) return view.foodName === null ? "not matched yet" : "";
  if (!view.changedFood && fix.grams === undefined && item.quantity !== null && item.unit !== null) {
    return `${formatQuantity(item.quantity)} ${item.unit === "piece" ? "pc" : item.unit}`;
  }
  return `${Math.round(view.grams * 10) / 10} g`;
}

// Draft card: fix grams or foods, drop items, then log the rest or discard the draft.
export function DraftCard({ draftId, today, pageDate }: { draftId: DraftId; today: string; pageDate: string }) {
  const draft = useQuery(api.pipeline.drafts.getDraft, { draftId });
  const confirmDraft = useMutation(api.pipeline.drafts.confirmDraft);
  const discardDraft = useMutation(api.pipeline.drafts.discardDraft);
  const showLogged = useLogToast();
  const toast = useToast();
  const [fixes, setFixes] = useState<Record<number, Fix>>({});
  // The grams text as typed, so a cleared or invalid field stays as the user left it.
  const [gramsText, setGramsText] = useState<Record<number, string>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState<"confirm" | "discard" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (draft === undefined) return <CardSkeleton lines={2} />;
  // A draft that is no longer pending leaves the list on its own, so there is nothing to show.
  if (draft === null || draft.status !== "pending") return null;

  // Merges a change into one item's fix.
  const patch = (index: number, change: Fix) => setFixes((all) => ({ ...all, [index]: { ...all[index], ...change } }));

  const views = draft.items.map((item, i) => viewOf(item, fixes[i] ?? {}));
  const kept = draft.items.map((_, i) => i).filter((i) => fixes[i]?.remove !== true);
  const missingFood = kept.some((i) => views[i]?.foodName === null);
  const total = kept.reduce<number | null>((sum, i) => {
    const kcal = views[i]?.kcal;
    return sum === null || kcal === null || kcal === undefined ? null : sum + kcal;
  }, 0);
  const photo = draft.inputKind === "photo";
  // True when an item's grams text was typed but does not parse to a usable amount.
  const badGrams = (i: number) => gramsText[i] !== undefined && parseGrams(gramsText[i]) === undefined;
  // True when no grams are known and the save cannot resolve them. A changed food resolves from its quantity.
  const needsAmount = (i: number) => {
    const view = views[i];
    if (!view || view.foodName === null || view.grams !== null) return false;
    return !(view.changedFood && draft.items[i]?.quantity !== null);
  };
  const gramsBlocked = kept.some((i) => badGrams(i) || needsAmount(i));
  // Every draft control is locked while a save runs, so no edit is lost after Confirm.
  const locked = busy !== null;

  // Only the changes that differ from the draft. The server resolves amounts and computes every nutrient.
  function corrections() {
    return Object.entries(fixes).flatMap(([index, fix]) => {
      const change = {
        index: Number(index),
        ...(fix.remove ? { remove: true } : {}),
        ...(fix.foodId ? { foodId: fix.foodId } : {}),
        ...(fix.grams !== undefined ? { grams: fix.grams } : {}),
        ...(fix.localDate ? { localDate: fix.localDate } : {}),
      };
      // An undone change leaves only the index, which would mark the item as corrected.
      return Object.keys(change).length > 1 ? [change] : [];
    });
  }

  // Logs the kept items with the fixes applied.
  async function confirm() {
    setBusy("confirm");
    setProblem(null);
    try {
      const result = await confirmDraft({ draftId, corrections: corrections() });
      if (result.kind === "committed") {
        showLogged({ title: loggedTitle(result.lines), sub: "Confirmed · edit anytime", entryIds: result.entryIds });
      }
    } catch (err) {
      setProblem(plainError(err));
      setBusy(null);
    }
  }

  // Drops the whole draft.
  async function discard() {
    setBusy("discard");
    setProblem(null);
    try {
      await discardDraft({ draftId });
      toast.show({ title: "Discarded. Nothing logged." });
    } catch (err) {
      setProblem(plainError(err));
      setBusy(null);
    }
  }

  return (
    <motion.section
      initial={{ opacity: 0, y: 12, scale: 0.98 }}
      animate={{ opacity: 1, y: 0, scale: 1 }}
      transition={pressSpring}
      className="flex flex-col gap-4 rounded-card bg-card p-6 shadow-card ring-1 ring-polo-soft"
    >
      <div className="flex items-center gap-3">
        <Polo size={36} mood={missingFood ? "idle" : "happy"} />
        <div className="min-w-0 flex-1">
          <h2 className="type-card-title">{photo ? "From your photo" : missingFood ? "A quick check" : "Got these"}</h2>
          <p className="type-caption text-ink3">Not logged yet. Check it, then log.</p>
        </div>
        {total !== null && kept.length > 0 ? (
          <span className="type-metric tabular-nums">
            {Math.round(total).toLocaleString()}
            <span className="ml-1 type-unit text-ink3">kcal</span>
          </span>
        ) : null}
      </div>

      <ul className="flex flex-col gap-2">
        {draft.items.map((item, i) => {
          const fix = fixes[i] ?? {};
          const view = views[i];
          if (!view) return null;
          const name = view.foodName ?? `"${item.text}"`;
          const destination = destinationOf(item, pageDate);

          if (fix.remove) {
            return (
              <li key={i} className="flex items-center justify-between gap-3 rounded-sm border border-dashed border-line2 px-4 py-2.5">
                <span className="truncate type-callout text-ink3 line-through">{name}</span>
                <Button variant="quiet" size="sm" disabled={locked} onClick={() => patch(i, { remove: false })}>
                  Put back
                </Button>
              </li>
            );
          }

          const asking = view.foodName === null || editing === i;
          return (
            <li key={i} className={cn("flex flex-col gap-3 rounded-sm px-4 py-3.5", view.foodName === null ? "bg-polo-soft/50" : "bg-card2")}>
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="truncate type-body-strong">{name}</div>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1.5 type-caption text-ink3">
                    <span>
                      {amountText(item, fix, view)}
                      {view.protein !== null ? ` · ${Math.round(view.protein)} g protein` : ""}
                    </span>
                    {destination ? <span>{destination}</span> : null}
                    {item.estimated ? <Tag tone="est">est.</Tag> : null}
                  </div>
                </div>
                <span className="shrink-0 type-value tabular-nums">{view.kcal === null ? "–" : Math.round(view.kcal).toLocaleString()}</span>
              </div>

              {view.foodName !== null ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <span className="relative">
                    <input
                      type="number"
                      min="0"
                      step="any"
                      aria-label={`Grams for ${view.foodName}`}
                      value={gramsText[i] ?? (view.grams === null ? "" : Math.round(view.grams * 10) / 10)}
                      placeholder="grams"
                      disabled={locked}
                      onChange={(e) => {
                        setGramsText((all) => ({ ...all, [i]: e.target.value }));
                        patch(i, { grams: parseGrams(e.target.value) });
                      }}
                      className={cn(fieldClass, "h-[34px] w-28 py-1 pr-8 tabular-nums")}
                    />
                    <span className="pointer-events-none absolute top-1/2 right-3 -translate-y-1/2 type-caption text-ink3">g</span>
                  </span>
                  <Button variant="quiet" size="sm" disabled={locked} onClick={() => setEditing(editing === i ? null : i)}>
                    {editing === i ? "Keep this food" : "Change food"}
                  </Button>
                  <Button variant="quiet" size="sm" disabled={locked} className="ml-auto" onClick={() => patch(i, { remove: true })}>
                    Remove
                  </Button>
                  {badGrams(i) || needsAmount(i) ? <p className="w-full type-caption text-polo-ink">Enter an amount in grams.</p> : null}
                </div>
              ) : null}

              {item.requestedDate !== null && !fix.localDate ? (
                <div className="flex flex-col items-start gap-2 rounded-sm bg-card px-3.5 py-3 type-secondary text-ink2">
                  <p>This says {item.requestedDate}, which can't be logged. Pick today, or remove it.</p>
                  <Button variant="ghost" size="sm" disabled={locked} onClick={() => patch(i, { localDate: today })}>
                    Log for today, {formatDayLabel(today)}
                  </Button>
                </div>
              ) : null}

              {asking ? (
                // A disabled fieldset turns off the picker's native search box and food buttons.
                <fieldset disabled={locked} className="min-w-0 rounded-sm bg-card p-4 disabled:opacity-60">
                  <FoodPicker
                    candidates={item.candidates}
                    chosen={fix.foodId ?? item.food?._id ?? null}
                    heading={view.foodName === null ? `What's "${item.text}" closest to?` : "Not right? Pick another."}
                    hint={view.foodName === null ? "No solid match in IFCT, USDA or Open Food Facts. Pick one and I'll remember it." : undefined}
                    onPick={(foodId, foodName) => {
                      patch(i, foodId === item.food?._id ? { foodId: undefined, foodName: undefined } : { foodId, foodName });
                      setEditing(null);
                    }}
                  />
                </fieldset>
              ) : null}

              {view.foodName === null ? (
                <div>
                  <Button variant="quiet" size="sm" disabled={locked} onClick={() => patch(i, { remove: true })}>
                    Remove
                  </Button>
                </div>
              ) : null}
            </li>
          );
        })}
      </ul>

      <p className="type-caption text-ink3">
        {photo
          ? "Photos are estimates, so I always check first. Use Change food to fix a match."
          : "Use Change food to swap a match. Your picks are remembered next time."}
        {missingFood && kept.length > 0 ? " Pick a food for each item, or remove it." : ""}
      </p>
      {problem ? (
        <p role="alert" className="type-secondary text-polo-ink">
          {problem}
        </p>
      ) : null}

      <div className="flex gap-2">
        <Button variant="ghost" disabled={busy !== null} onClick={() => void discard()}>
          {busy === "discard" ? "Discarding…" : "Discard"}
        </Button>
        <Button disabled={busy !== null || kept.length === 0 || missingFood || gramsBlocked} onClick={() => void confirm()} className="flex-1">
          {busy === "confirm"
            ? "Logging…"
            : kept.length === 0
              ? "Nothing to log"
              : `Log ${kept.length} item${kept.length === 1 ? "" : "s"}${total !== null ? ` · ${Math.round(total).toLocaleString()} kcal` : ""}`}
        </Button>
      </div>
    </motion.section>
  );
}
