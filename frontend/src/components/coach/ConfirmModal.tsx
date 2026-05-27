import { useEffect } from "react";
import { createPortal } from "react-dom";
import { motion, AnimatePresence } from "motion/react";
import { LogConfirmCard } from "./LogConfirmCard";
import type { LogDraft } from "@/data/mock";
import { useMediaQuery } from "@/hooks/useMediaQuery";

type Props = {
  draft: LogDraft | null;
  onConfirm: (draft: LogDraft) => void;
  onDiscard: () => void;
};

const SPRING = { type: "spring", stiffness: 320, damping: 30 } as const;

export function ConfirmModal({ draft, onConfirm, onDiscard }: Props) {
  const isLarge = useMediaQuery("(min-width: 768px)");

  // ESC closes (treats as discard)
  useEffect(() => {
    if (!draft) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDiscard();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [draft, onDiscard]);

  // Lock body scroll while modal is open
  useEffect(() => {
    if (!draft) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = prev; };
  }, [draft]);

  if (typeof document === "undefined") return null;

  return createPortal(
    <AnimatePresence>
      {draft && (
        <motion.div
          key="backdrop"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.18 }}
          onClick={onDiscard}
          className="fixed inset-0 z-50 flex items-end md:items-center justify-center bg-ink/45 backdrop-blur-sm"
          style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
          aria-modal="true"
          role="dialog"
        >
          <motion.div
            key="card"
            onClick={(e) => e.stopPropagation()}
            initial={isLarge ? { opacity: 0, scale: 0.94, y: 8 } : { y: "100%" }}
            animate={isLarge ? { opacity: 1, scale: 1, y: 0 } : { y: 0 }}
            exit={isLarge ? { opacity: 0, scale: 0.95, y: 4 } : { y: "100%" }}
            transition={SPRING}
            className="w-full md:w-auto md:max-w-md flex justify-center"
          >
            <LogConfirmCard
              draft={draft}
              onConfirm={onConfirm}
              onDiscard={onDiscard}
            />
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>,
    document.body,
  );
}
