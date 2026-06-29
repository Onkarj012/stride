import { motion } from "motion/react";
import { cn } from "@/lib/utils";

type MacroBarsProps = {
  protein: number;
  carbs: number;
  fat: number;
  target: { protein: number; carbs: number; fat: number };
  className?: string;
};

const ROWS = [
  { key: "protein", label: "Protein", color: "bg-lavender" },
  { key: "carbs", label: "Carbs", color: "bg-peach" },
  { key: "fat", label: "Fat", color: "bg-mint" },
] as const;

const EASE = [0.22, 1, 0.36, 1] as [number, number, number, number];

export function MacroBars({ protein, carbs, fat, target, className }: MacroBarsProps) {
  const values: Record<"protein" | "carbs" | "fat", number> = { protein, carbs, fat };
  return (
    <div className={cn("flex flex-col gap-3 flex-1 min-w-0", className)}>
      {ROWS.map((row, i) => {
        const value = values[row.key];
        const tgt = target[row.key];
        const pct = Math.min(100, Math.round((value / Math.max(1, tgt)) * 100));
        return (
          <div key={row.key} className="space-y-1">
            <div className="flex items-baseline justify-between text-[13px]">
              <div className="flex items-center gap-2 min-w-0">
                <span className={cn("h-2 w-2 rounded-full shrink-0", row.color)} />
                <span className="font-semibold text-text">{row.label}</span>
              </div>
              <span className="text-text-muted">
                <span className="font-semibold text-text">{Math.round(value)}</span>
                <span className="mx-0.5">/</span>
                <span>{tgt} g</span>
              </span>
            </div>
            <div className="h-2 w-full rounded-full bg-border overflow-hidden">
              <motion.div
                className={cn("h-full rounded-full", row.color)}
                initial={{ width: 0 }}
                animate={{ width: `${pct}%` }}
                transition={{ duration: 0.7, delay: i * 0.1, ease: EASE }}
              />
            </div>
          </div>
        );
      })}
    </div>
  );
}
