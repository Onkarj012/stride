import { useMutation } from "convex/react";
import { api } from "@convex/_generated/api";
import { useToast } from "@/components/Toast";
import { linesKcal, newSubmissionId, plainError, type EntryId, type LogLine } from "@/lib/log";

type LoggedToast = { title: string; sub?: string; entryIds: EntryId[] };

// Shows a toast for saved entries. Its Undo reverts every entry, one submission id each.
export function useLogToast(): (input: LoggedToast) => void {
  const toast = useToast();
  const undoRevision = useMutation(api.entries.undoRevision);

  // Reverts the latest revision of each entry. Failed entries get a Retry that runs this again for them only.
  async function undo(entryIds: EntryId[]) {
    const base = newSubmissionId();
    const results = await Promise.allSettled(entryIds.map((entryId, i) => undoRevision({ submissionId: `${base}-${i}`, entryId })));
    const failed = entryIds.filter((_, i) => results[i].status === "rejected");
    const errors = results.flatMap((result) => (result.status === "rejected" ? [result.reason] : []));
    if (errors.length === 0) {
      toast.show({ title: "Undone. Nothing lost.", sub: "It's back the way it was." });
      return;
    }
    const title = failed.length === entryIds.length ? "Couldn't undo that." : `Undid ${entryIds.length - failed.length} of ${entryIds.length}.`;
    toast.show({ title, sub: plainError(errors[0]), action: { label: "Retry", run: () => undo(failed) } });
  }

  return ({ title, sub, entryIds }) => toast.show({ title, sub, action: { label: "Undo", run: () => undo(entryIds) } });
}

// Toast title for a log: its kcal when every line is known.
export function loggedTitle(lines: LogLine[]): string {
  const kcal = linesKcal(lines);
  return kcal === null ? "Logged" : `Logged · ${kcal.toLocaleString()} kcal`;
}

// Food names for a toast, shortened after three.
export function namesOf(lines: LogLine[]): string {
  const names = lines.map((line) => line.foodName ?? line.text);
  return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} and ${names.length - 3} more`;
}
