import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import { X, CheckCircle2, Clock } from "lucide-react";
import type { Toast } from "../hooks/useToast";

export function ToastStack({
  toasts,
  onRemove,
}: {
  toasts: Toast[];
  onRemove: (id: string) => void;
}) {
  return (
    <div className="fixed bottom-6 right-6 z-[100] flex flex-col gap-3 pointer-events-none">
      <AnimatePresence>
        {toasts.map((toast) => (
          <ToastItem key={toast.id} toast={toast} onRemove={onRemove} />
        ))}
      </AnimatePresence>
    </div>
  );
}

function ToastItem({
  toast,
  onRemove,
}: {
  toast: Toast;
  onRemove: (id: string) => void;
}) {
  const [progress, setProgress] = useState(100);
  const duration = toast.duration || 5000;

  useEffect(() => {
    const start = Date.now();
    const timer = setInterval(() => {
      const elapsed = Date.now() - start;
      const pct = Math.max(0, 100 - (elapsed / duration) * 100);
      setProgress(pct);
      if (pct <= 0) {
        clearInterval(timer);
        onRemove(toast.id);
      }
    }, 50);
    return () => clearInterval(timer);
  }, [duration, toast.id, onRemove]);

  const bgClass =
    toast.type === "error"
      ? "border-red-600"
      : toast.type === "success"
        ? "border-accent"
        : "border-[var(--border-default)]";

  return (
    <motion.div
      initial={{ opacity: 0, x: 50, scale: 0.95 }}
      animate={{ opacity: 1, x: 0, scale: 1 }}
      exit={{ opacity: 0, x: 50, scale: 0.95 }}
      className={`pointer-events-auto min-w-[320px] max-w-[420px] bg-[var(--bg-card)] border-2 ${bgClass} overflow-hidden`}
    >
      <div className="p-4 flex items-start gap-3">
        {toast.type === "success" && (
          <CheckCircle2 size={18} className="text-accent shrink-0 mt-0.5" />
        )}
        {toast.type === "error" && (
          <X size={18} className="text-red-400 shrink-0 mt-0.5" />
        )}
        {toast.type === "info" && (
          <Clock size={18} className="text-[var(--text-muted)] shrink-0 mt-0.5" />
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm tracking-wide leading-relaxed">{toast.message}</p>
          {toast.undoAction && (
            <button
              type="button"
              onClick={() => {
                toast.undoAction?.();
                onRemove(toast.id);
              }}
              className="mt-2 text-xs font-mono text-accent hover:underline tracking-wider"
            >
              {toast.undoLabel || "UNDO"}
            </button>
          )}
        </div>
        <button
          type="button"
          aria-label="Dismiss notification"
          onClick={() => onRemove(toast.id)}
          className="p-1 hover:text-[var(--text-muted)] transition-colors shrink-0"
        >
          <X size={14} />
        </button>
      </div>
      <div className="h-1 bg-[var(--bg-elevated)]">
        <motion.div
          className={`h-full ${toast.type === "error" ? "bg-red-600" : toast.type === "success" ? "bg-accent" : "bg-[var(--text-muted)]"}`}
          style={{ width: `${progress}%` }}
        />
      </div>
    </motion.div>
  );
}
