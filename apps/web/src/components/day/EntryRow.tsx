import { useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useToast } from "@/components/Toast";
import { Button, Select, Tag, fieldClass, smoothSpring } from "@/components/ui";
import { SLOTS, SLOT_NAMES, newSubmissionId, plainError, type EntryId, type EntryView, type MealSlot } from "@/lib/log";
import { cn } from "@/lib/utils";

// One logged food. Click it to open an inline editor for grams, meal slot and delete.
export function EntryRow({ entry }: { entry: EntryView }) {
  const [editing, setEditing] = useState(false);
  const amount = Math.round(entry.grams * 10) / 10;
  const { protein, carbs, fat, kcal } = entry.nutrients;

  return (
    <li className={cn("rounded-sm transition-colors", editing ? "bg-card2" : "hover:bg-card2/60")}>
      <button
        type="button"
        aria-expanded={editing}
        onClick={() => setEditing((open) => !open)}
        className="flex w-full items-center justify-between gap-4 rounded-sm px-3 py-2.5 text-left"
      >
        <span className="min-w-0">
          <span className="flex items-center gap-2">
            <span className="truncate type-body-strong">{entry.foodName}</span>
            {entry.flags.includes("estimated") ? <Tag tone="est">est.</Tag> : null}
          </span>
          <span className="mt-0.5 flex items-center gap-3 type-caption text-ink3 tabular-nums">
            <span>{amount} g</span>
            <MacroDot className="bg-protein" value={protein} label="protein" />
            <MacroDot className="bg-carbs" value={carbs} label="carbs" />
            <MacroDot className="bg-fat" value={fat} label="fat" />
          </span>
        </span>
        <span className="shrink-0 type-value tabular-nums">{Math.round(kcal).toLocaleString("en-IN")}</span>
      </button>
      <AnimatePresence initial={false}>
        {editing ? (
          <motion.div
            key="editor"
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={smoothSpring}
            className="overflow-hidden"
          >
            <EntryEditor entry={entry} onDone={() => setEditing(false)} />
          </motion.div>
        ) : null}
      </AnimatePresence>
    </li>
  );
}

// A coloured dot and grams for one macro.
function MacroDot({ className, value, label }: { className: string; value: number; label: string }) {
  return (
    <span className="inline-flex items-center gap-1" title={`${Math.round(value)} g ${label}`}>
      <i className={cn("size-1.5 rounded-pill", className)} />
      {Math.round(value)}
    </span>
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
    <form
      className="flex flex-col gap-3 px-3 pt-1 pb-3"
      onSubmit={(e) => {
        e.preventDefault();
        void save();
      }}
    >
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1.5 type-label text-ink2">
          Grams
          <input
            type="number"
            min="0"
            step="any"
            value={grams}
            onChange={(e) => setGrams(e.target.value)}
            aria-invalid={!gramsValid}
            className={cn(fieldClass, "w-28 bg-card tabular-nums", !gramsValid && "border-polo-ink")}
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
        <div className="ml-auto flex items-center gap-1">
          <Button variant="danger" size="sm" disabled={busy} onClick={() => void remove()}>
            Delete
          </Button>
          <Button variant="quiet" size="sm" onClick={onDone}>
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={busy || !gramsValid}>
            Save
          </Button>
        </div>
      </div>
      {gramsValid ? null : <p className="type-caption text-polo-ink">Enter an amount above 0 g.</p>}
    </form>
  );
}
