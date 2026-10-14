import { useState } from "react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useToast } from "@/components/Toast";
import { formatDayLabel } from "@/lib/date";
import { plainError, type DraftId, type DraftItem, type FoodId } from "@/lib/log";
import { FoodPicker } from "./FoodPicker";
import { loggedTitle, namesOf, useLogToast } from "./toasts";
import { field, outlineButton, primaryButton, quietButton } from "./ui";

/** One change the user made to a draft item before confirming. */
type Fix = { remove?: boolean; foodId?: FoodId; foodName?: string; grams?: number; localDate?: string };

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

// "2", "1½" or "0.75" for a quantity.
function formatQuantity(q: number): string {
  const whole = Math.floor(q);
  if (q - whole === 0.5) return whole === 0 ? "½" : `${whole}½`;
  return String(Math.round(q * 100) / 100);
}

// The amount line under an item: its quantity as typed, its grams, or why it has none.
function amountText(item: DraftItem, fix: Fix, view: ReturnType<typeof viewOf>): string {
  if (view.grams === null) return view.foodName === null ? "not matched yet" : "amount on save";
  if (!view.changedFood && fix.grams === undefined && item.quantity !== null && item.unit !== null) {
    return `${formatQuantity(item.quantity)} ${item.unit}`;
  }
  return `${Math.round(view.grams * 10) / 10} g`;
}

// Draft card: fix grams or foods, drop items, then log the rest or discard the draft.
export function DraftCard({ draftId, today }: { draftId: DraftId; today: string }) {
  const draft = useQuery(api.pipeline.drafts.getDraft, { draftId });
  const confirmDraft = useMutation(api.pipeline.drafts.confirmDraft);
  const discardDraft = useMutation(api.pipeline.drafts.discardDraft);
  const showLogged = useLogToast();
  const toast = useToast();
  const [fixes, setFixes] = useState<Record<number, Fix>>({});
  const [editing, setEditing] = useState<number | null>(null);
  const [busy, setBusy] = useState<"confirm" | "discard" | null>(null);
  const [problem, setProblem] = useState<string | null>(null);

  if (draft === undefined) return <p className="text-sm text-ink3">Opening the draft…</p>;
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
    <section className="flex flex-col gap-3 rounded-card bg-card p-5 shadow-card">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="font-display text-lg font-bold">{photo ? "From your photo" : missingFood ? "A quick check" : "Got these"}</h2>
        {total !== null && kept.length > 0 ? <span className="font-semibold">{Math.round(total).toLocaleString()} kcal</span> : null}
      </div>

      {draft.items.map((item, i) => {
        const fix = fixes[i] ?? {};
        const view = views[i];
        if (!view) return null;
        const name = view.foodName ?? `"${item.text}"`;

        if (fix.remove) {
          return (
            <div key={i} className="flex items-center justify-between gap-3 rounded-field bg-card2 p-3">
              <span className="truncate text-ink3 line-through">{name}</span>
              <button type="button" onClick={() => patch(i, { remove: false })} className={quietButton}>
                Put back
              </button>
            </div>
          );
        }

        const asking = view.foodName === null || editing === i;
        return (
          <div key={i} className="flex flex-col gap-3 rounded-field bg-card2 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="truncate font-semibold">{name}</div>
                <div className="text-sm text-ink2">
                  {amountText(item, fix, view)}
                  {view.protein !== null ? ` · ${Math.round(view.protein)} g protein` : ""}
                  {item.estimated ? " · estimated" : ""}
                </div>
              </div>
              <span className="shrink-0 font-semibold">{view.kcal === null ? "–" : Math.round(view.kcal).toLocaleString()}</span>
            </div>

            {view.foodName !== null ? (
              <div className="flex flex-wrap items-center gap-2">
                <input
                  type="number"
                  min="0"
                  step="any"
                  aria-label={`Grams for ${view.foodName}`}
                  value={view.grams === null ? "" : Math.round(view.grams * 10) / 10}
                  placeholder="grams"
                  onChange={(e) => {
                    const grams = Number(e.target.value);
                    patch(i, { grams: e.target.value !== "" && grams > 0 ? grams : undefined });
                  }}
                  className={`${field} w-28`}
                />
                <button type="button" onClick={() => setEditing(editing === i ? null : i)} className={quietButton}>
                  Change food
                </button>
              </div>
            ) : null}

            {item.requestedDate !== null && !fix.localDate ? (
              <div className="flex flex-col items-start gap-2 text-sm text-ink2">
                <p>This says {item.requestedDate}, which can't be logged. Pick today, or remove it.</p>
                <button type="button" onClick={() => patch(i, { localDate: today })} className={outlineButton}>
                  Log for today, {formatDayLabel(today)}
                </button>
              </div>
            ) : null}

            {asking ? (
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
            ) : null}

            <div>
              <button type="button" onClick={() => patch(i, { remove: true })} className={quietButton}>
                Remove
              </button>
            </div>
          </div>
        );
      })}

      <p className="text-sm text-ink2">
        {photo
          ? "Photos are estimates, so I always check first. Use Change food to fix a match."
          : "Use Change food to swap a match. Your picks are remembered next time."}
      </p>
      {missingFood && kept.length > 0 ? <p className="text-sm text-ink2">Pick a food for each item, or remove it.</p> : null}
      {problem ? <p className="text-sm text-polo-ink">{problem}</p> : null}

      <div className="flex gap-2">
        <button type="button" disabled={busy !== null} onClick={() => void discard()} className={outlineButton}>
          {busy === "discard" ? "Discarding…" : "Discard"}
        </button>
        <button
          type="button"
          disabled={busy !== null || kept.length === 0 || missingFood}
          onClick={() => void confirm()}
          className={`${primaryButton} flex-1`}
        >
          {busy === "confirm"
            ? "Logging…"
            : kept.length === 0
              ? "Nothing to log"
              : `Log ${kept.length} item${kept.length === 1 ? "" : "s"}${total !== null ? ` · ${Math.round(total).toLocaleString()} kcal` : ""}`}
        </button>
      </div>
    </section>
  );
}
