import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { Card } from "./Card";

export function StatCard({
  label,
  value,
  subValue,
  icon: Icon,
  accent = false,
  tooltipContent,
  expanded,
  onToggle,
}: {
  label: string;
  value: string | number;
  subValue?: string;
  icon: any;
  accent?: boolean;
  tooltipContent?: React.ReactNode;
  expanded?: boolean;
  onToggle?: () => void;
}) {
  const [internalExpanded, setInternalExpanded] = useState(false);
  const isExpanded = expanded !== undefined ? expanded : internalExpanded;
  const handleToggle = () => {
    if (onToggle) onToggle();
    else setInternalExpanded(!internalExpanded);
  };
  return (
    <Card
      className={`p-5 ${accent ? "border-accent border-2" : ""} ${tooltipContent ? "cursor-pointer" : ""}`}
      onClick={tooltipContent ? handleToggle : undefined}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.15em] font-mono text-[var(--text-muted)] mb-1">
            {label}
          </div>
          <div className="text-3xl font-heading tracking-normal">{value}</div>
          {subValue && (
            <div className="text-xs font-mono text-[var(--text-secondary)] mt-1 tracking-wide">
              {subValue}
            </div>
          )}
        </div>
        <div
          className={`p-2.5 ${
            accent ? "bg-accent" : "bg-[var(--bg-elevated)]"
          }`}
        >
          <Icon
            size={20}
            className={
              accent
                ? "text-[var(--theme-primary-text)]"
                : "text-[var(--text-secondary)]"
            }
            strokeWidth={2}
          />
        </div>
      </div>
      <AnimatePresence>
        {isExpanded && tooltipContent && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: "auto", opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ type: "spring", stiffness: 400, damping: 30 }}
            className="overflow-hidden"
          >
            <div className="mt-3 pt-3 border-t border-[var(--border-default)]">
              {tooltipContent}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </Card>
  );
}
