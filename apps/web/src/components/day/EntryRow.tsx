import { useState } from "react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useToast } from "@/components/Toast";
import { SLOTS, SLOT_NAMES, newSubmissionId, plainError, type EntryId, type EntryView, type MealSlot } from "@/lib/log";

// One logged food. Click it to open an inline editor for grams, meal slot and delete.
export function EntryRow({ entry }: { entry: EntryView }) {
  const [editing, setEditing] = useState(false);
  const amount = Math.round(entry.grams * 10) / 10;
  const { protein, carbs, fat, kcal } = entry.nutrients;

  return (
    <div className="rounded-field bg-card shadow-card">
      <button
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing((open) => !open)}
        className="flex w-full items-center justify-between gap-4 px-4 py-3 text-left"
      >
        <span className="min-w-0">
          <span className="block truncate font-semibold">
            {entry.foodName}
            {entry.flags.includes("estimated") ? (
              <span className="ml-2 rounded-tag bg-card2 px-1.5 py-0.5 align-middle text-xs font-normal text-ink2">estimated</span>
            ) : null}
          </span>
          <span className="block text-sm text-ink2">{amount} g</span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold">{Math.round(kcal)} kcal</span>
          <span className="block text-xs text-ink2">
            P {Math.round(protein)} · C {Math.round(carbs)} · F {Math.round(fat)}
          </span>
        </span>
      </button>
      {editing ? <EntryEditor entry={entry} onDone={() => setEditing(false)} /> : null}
    </div>
  );
}

// Edits one entry's grams and slot, or deletes it. Each save writes a revision with an undo toast.
function EntryEditor({ entry, onDone }: { entry: EntryView; onDone: () => void }) {
  const toast = useToast();
  const editEntry = useMutation(api.entries.editEntry);
  const deleteEntry = useMutation(api.entries.deleteEntry);
  const undoRevision = useMutation(api.entries.undoRevision);
  const [grams, setGrams] = useState(String(entry.grams));
  const [slot, setSlot] = useState<MealSlot>(entry.slot);
  const [busy, setBusy] = useState(false);

  const parsed = Number(grams);
  const gramsValid = grams.trim() !== "" && Number.isFinite(parsed) && parsed > 0;

  // Reverts the revision the server returned, then says so.
  async function undo(revisionId: EntryId) {
    try {
      await undoRevision({ submissionId: newSubmissionId(), entryId: revisionId });
      toast.show({ title: "Undone. Nothing lost." });
    } catch (err) {
      toast.show({ title: "Couldn't undo that.", sub: plainError(err) });
    }
  }

  // Shows a toast whose Undo button reverts the revision just written.
  function offerUndo(title: string, revisionId: EntryId) {
    toast.show({ title, action: { label: "Undo", run: () => undo(revisionId) } });
  }

  // Saves only the fields that changed.
  async function save() {
    if (!gramsValid) return;
    const changes: { grams?: number; slot?: MealSlot } = {};
    if (parsed !== entry.grams) changes.grams = parsed;
    if (slot !== entry.slot) changes.slot = slot;
    if (Object.keys(changes).length === 0) {
      onDone();
      return;
    }
    setBusy(true);
    try {
      const revisionId = await editEntry({ submissionId: newSubmissionId(), entryId: entry._id, ...changes });
      onDone();
      offerUndo("Entry updated", revisionId);
    } catch (err) {
      toast.show({ title: "Couldn't save that.", sub: plainError(err) });
    } finally {
      setBusy(false);
    }
  }

  // Soft-deletes the entry. Undo brings it back.
  async function remove() {
    setBusy(true);
    try {
      const revisionId = await deleteEntry({ submissionId: newSubmissionId(), entryId: entry._id });
      onDone();
      offerUndo("Entry deleted", revisionId);
    } catch (err) {
      toast.show({ title: "Couldn't delete that.", sub: plainError(err) });
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-4 border-t border-line px-4 py-4">
      <div className="flex flex-wrap gap-4">
        <label className="flex flex-col gap-1 text-sm font-semibold text-ink2">
          Grams
          <input
            type="number"
            min="0"
            step="any"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            className="w-32 rounded-field border border-line2 bg-card px-3 py-2 font-normal text-ink"
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
            className="rounded-field border border-line2 bg-card px-3 py-2 font-normal text-ink"
          >
            {SLOTS.map((option) => (
              <option key={option} value={option}>
                {SLOT_NAMES[option]}
              </option>
            ))}
          </select>
        </label>
      </div>
      {gramsValid ? null : <p className="text-sm text-polo-ink">Enter an amount above 0 g.</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={busy || !gramsValid}
          onClick={() => void save()}
          className="rounded-pill bg-polo px-4 py-2 text-sm font-semibold text-on-polo disabled:opacity-40"
        >
          Save
        </button>
        <button type="button" onClick={onDone} className="rounded-pill px-4 py-2 text-sm font-semibold text-ink2 hover:bg-card2">
          Cancel
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void remove()}
          className="ml-auto rounded-pill px-4 py-2 text-sm font-semibold text-polo-ink hover:bg-polo-soft disabled:opacity-40"
        >
          Delete
        </button>
      </div>
    </div>
  );
}
