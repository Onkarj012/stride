import { Check, Lock } from "lucide-react";
import { computeMilestones } from "@/lib/milestones";
import type { LogEntry } from "@/lib/storage";
import { cn } from "@/lib/utils";

export function MilestoneList({
  logs,
  showLocked = true,
}: {
  logs: LogEntry[];
  showLocked?: boolean;
}) {
  const milestones = computeMilestones(logs);
  const items = showLocked ? milestones : milestones.filter((m) => m.achieved);

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
      {items.map((m) => (
        <div
          key={m.id}
          className={cn(
            "rounded-[16px] border p-4 transition-colors duration-150",
            m.achieved
              ? "bg-lavender/15 border-lavender/40"
              : "bg-card border-border opacity-60",
          )}
        >
          <div className="flex items-start gap-3">
            <span
              className={cn(
                "grid h-8 w-8 shrink-0 place-items-center rounded-full",
                m.achieved
                  ? "bg-lavender text-ink"
                  : "bg-card-elev text-text-subtle",
              )}
            >
              {m.achieved ? (
                <Check className="h-4 w-4" strokeWidth={2.5} />
              ) : (
                <Lock className="h-3.5 w-3.5" strokeWidth={1.75} />
              )}
            </span>
            <div className="flex-1 min-w-0">
              <h4 className="text-[14px] font-bold text-text">{m.label}</h4>
              <p className="text-[12.5px] text-text-muted leading-relaxed mt-0.5">
                {m.description}
              </p>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
