import { useQuery } from "convex/react";
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
        <p className="text-sm text-ink2">Typed logs go to today. Use Add food to log on this day.</p>
      )}
      {drafts?.map((draft) => (
        <DraftCard key={draft._id} draftId={draft._id} today={today} />
      ))}
      <AddFood localDate={localDate} />
    </section>
  );
}
