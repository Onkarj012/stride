import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search,
  X,
  Utensils,
  Dumbbell,
  Droplets,
  BedDouble,
  Repeat,
  Plus,
  Zap,
} from "lucide-react";

interface RecentItem {
  label: string;
  type: "meal" | "workout";
  data: any;
}

interface CommandBarProps {
  open: boolean;
  onClose: () => void;
  recentMeals: any[];
  recentWorkouts: any[];
  onLogMeal: () => void;
  onLogWorkout: () => void;
  onAddWater: () => void;
  onLogSleep: () => void;
  onLogAgain: (item: RecentItem) => void;
}

export function CommandBar({
  open,
  onClose,
  recentMeals,
  recentWorkouts,
  onLogMeal,
  onLogWorkout,
  onAddWater,
  onLogSleep,
  onLogAgain,
}: CommandBarProps) {
  const [query, setQuery] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setQuery("");
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        if (open) onClose();
        // Parent handles opening
      }
      if (e.key === "Escape" && open) {
        onClose();
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  const recents: RecentItem[] = [
    ...recentMeals.slice(0, 3).map((m) => ({ label: m.name, type: "meal" as const, data: m })),
    ...recentWorkouts.slice(0, 2).map((w) => ({ label: w.name, type: "workout" as const, data: w })),
  ];

  const actions = [
    { label: "Log Meal", icon: Utensils, action: onLogMeal },
    { label: "Log Workout", icon: Dumbbell, action: onLogWorkout },
    { label: "Add Water", icon: Droplets, action: onAddWater },
    { label: "Log Sleep", icon: BedDouble, action: onLogSleep },
  ];

  const filteredRecents = query
    ? recents.filter((r) => r.label.toLowerCase().includes(query.toLowerCase()))
    : recents;
  const filteredActions = query
    ? actions.filter((a) => a.label.toLowerCase().includes(query.toLowerCase()))
    : actions;

  return (
    <AnimatePresence>
      {open && (
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          className="fixed inset-0 bg-black/60 z-[100] flex items-start justify-center pt-[15vh]"
          onClick={onClose}
        >
          <motion.div
            initial={{ opacity: 0, y: -20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -20, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="w-full max-w-xl bg-[var(--bg-card)] border border-[var(--border-default)] shadow-brutal"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-3 px-4 py-3 border-b border-[var(--border-default)]">
              <Search size={16} className="text-[var(--text-muted)]" />
              <input
                ref={inputRef}
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Quick log..."
                className="flex-1 bg-transparent font-mono text-sm focus:outline-none placeholder:text-[var(--text-muted)] tracking-wide"
              />
              <button
                onClick={onClose}
                className="p-1 hover:text-[var(--text-muted)] transition-colors"
              >
                <X size={14} />
              </button>
            </div>

            <div className="max-h-[50vh] overflow-y-auto">
              {filteredRecents.length > 0 && (
                <div className="p-2">
                  <div className="px-2 py-1.5 text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
                    RECENT
                  </div>
                  {filteredRecents.map((item, i) => (
                    <button
                      key={`${item.type}-${i}`}
                      onClick={() => {
                        onLogAgain(item);
                        onClose();
                      }}
                      className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors text-left"
                    >
                      <Repeat size={14} className="text-accent shrink-0" />
                      <span className="text-sm tracking-wide flex-1 truncate">
                        {item.label}
                      </span>
                      <span className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">
                        {item.type}
                      </span>
                    </button>
                  ))}
                </div>
              )}

              <div className="p-2 border-t border-[var(--border-default)]">
                <div className="px-2 py-1.5 text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wider">
                  ACTIONS
                </div>
                {filteredActions.map((action) => (
                  <button
                    key={action.label}
                    onClick={() => {
                      action.action();
                      onClose();
                    }}
                    className="w-full flex items-center gap-3 px-3 py-2.5 hover:bg-[var(--bg-elevated)] transition-colors text-left"
                  >
                    <action.icon size={14} className="text-accent shrink-0" />
                    <span className="text-sm tracking-wide">{action.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="px-4 py-2 border-t border-[var(--border-default)] text-[10px] font-mono text-[var(--text-muted)] tracking-wide flex items-center justify-between">
              <span>
                <Zap size={10} className="inline mr-1" />
                CMD+K to toggle
              </span>
              <span>ESC to close</span>
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
