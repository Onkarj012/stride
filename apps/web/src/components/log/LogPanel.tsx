import { useQuery } from "convex/react";
import { Info } from "lucide-react";
import { api } from "@convex/_generated/api";
import { AddFood } from "./AddFood";
import { DraftCard } from "./DraftCard";
import { TextLog } from "./TextLog";

// Logging on the Day page: typed food for today, unfinished drafts, and manual add for any day.
export function LogPanel({ localDate, today }: { localDate: string; today: string }) {
  const drafts = useQuery(api.pipeline.drafts.listPendingDrafts, {});

  return (
    <section className="flex flex-col gap-4">
      {localDate === today ? (
        <TextLog />
      ) : (
        <p className="flex items-center gap-2.5 rounded-sm border border-dashed border-line2 px-4 py-3 type-secondary text-ink2">
          <Info className="size-4 shrink-0 text-ink3" strokeWidth={1.9} />
          Typed logs go to today. Use Add food to log on this day.
        </p>
      )}
      {drafts?.map((draft) => (
        <DraftCard key={draft._id} draftId={draft._id} today={today} pageDate={localDate} />
      ))}
      <AddFood localDate={localDate} />
    </section>
  );
}
