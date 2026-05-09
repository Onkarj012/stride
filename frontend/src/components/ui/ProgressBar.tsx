import { motion } from "framer-motion";

export function ProgressBar({
  value,
  max,
  showLabel = true,
}: {
  value: number;
  max: number;
  showLabel?: boolean;
}) {
  const pct = Math.min(100, (value / max) * 100);
  return (
    <div className="space-y-1.5">
      {showLabel && (
        <div className="flex justify-between text-xs font-mono tracking-wide">
          <span className="text-[var(--text-secondary)]">{Math.round(value)}</span>
          <span className="text-[var(--text-muted)]">/ {max}</span>
        </div>
      )}
      <div className="h-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
        <motion.div
          initial={{ width: 0 }}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 1, ease: "easeOut" }}
          className="h-full bg-accent"
        />
      </div>
    </div>
  );
}
