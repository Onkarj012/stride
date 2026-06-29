import { motion } from "motion/react";
import { cn } from "@/lib/utils";

export type Period = "today" | "week" | "month";

const OPTIONS: { id: Period; label: string }[] = [
  { id: "today", label: "Today" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

export function PeriodSwitcher({
  value,
  onChange,
}: {
  value: Period;
  onChange: (p: Period) => void;
}) {
  return (
    <div
      role="tablist"
      aria-label="Period"
      className="inline-flex items-center gap-1 rounded-full bg-card-elev border border-border p-1"
    >
      {OPTIONS.map((opt) => {
        const active = value === opt.id;
        return (
          <button
            key={opt.id}
            role="tab"
            aria-selected={active}
            onClick={() => onChange(opt.id)}
            className={cn(
              "relative inline-flex items-center justify-center rounded-full px-4 py-1.5",
              "text-[13px] font-semibold transition-colors duration-150",
              "focus-visible:outline-none",
              active ? "text-text-on-ink" : "text-text-muted hover:text-text",
            )}
          >
            {active && (
              <motion.div
                layoutId="period-indicator"
                className="absolute inset-0 rounded-full bg-ink"
                transition={{ type: "spring", stiffness: 320, damping: 32 }}
              />
            )}
            <span className="relative">{opt.label}</span>
          </button>
        );
      })}
    </div>
  );
}
