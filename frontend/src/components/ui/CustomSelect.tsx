import { useState, useRef, useEffect, useCallback } from "react";
import { ChevronDown, Check } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

interface SelectOption {
  value: string;
  label: string;
  description?: string;
}

interface CustomSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SelectOption[];
  placeholder?: string;
  label?: string;
  className?: string;
}

export default function CustomSelect({
  value,
  onChange,
  options,
  placeholder = "Select...",
  label,
  className = "",
}: CustomSelectProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const selected = options.find((o) => o.value === value);

  const handleSelect = useCallback(
    (val: string) => {
      onChange(val);
      setOpen(false);
    },
    [onChange]
  );

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) {
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div ref={ref} className={`relative ${className}`}>
      {label && (
        <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`w-full px-4 py-3 bg-[var(--bg-elevated)] border font-mono text-sm focus:outline-none transition-colors flex items-center justify-between ${
          open ? "border-accent" : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
        }`}
      >
        <span className={selected ? "text-[var(--text-primary)]" : "text-[var(--text-muted)]"}>
          {selected ? selected.label : placeholder}
        </span>
        <ChevronDown
          size={14}
          className={`text-[var(--text-muted)] transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: -6, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: -6, scale: 0.98 }}
            transition={{ type: "spring", stiffness: 500, damping: 30 }}
            className="absolute z-50 left-0 right-0 mt-1 bg-[var(--bg-card)] border border-[var(--border-default)] shadow-xl max-h-64 overflow-y-auto will-change-transform"
          >
            {options.map((option) => (
              <button
                key={option.value}
                type="button"
                onClick={() => handleSelect(option.value)}
                className={`w-full text-left px-4 py-2.5 font-mono text-xs tracking-wide transition-colors flex items-center justify-between ${
                  option.value === value
                    ? "bg-accent/10 text-accent"
                    : "text-[var(--text-secondary)] hover:bg-[var(--bg-elevated)] hover:text-[var(--text-primary)]"
                }`}
              >
                <div>
                  <div className="uppercase tracking-wider">{option.label}</div>
                  {option.description && (
                    <div className="text-[10px] text-[var(--text-muted)] tracking-wide mt-0.5 font-normal">
                      {option.description}
                    </div>
                  )}
                </div>
                {option.value === value && <Check size={14} className="text-accent shrink-0" />}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
