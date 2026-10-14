import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { pressSpring } from "@/components/ui";

export type ToastAction = { label: string; run: () => Promise<unknown> | void };
export type ToastInput = { title: string; sub?: string; action?: ToastAction };
type ToastState = ToastInput & { id: number };
type ToastApi = { show: (toast: ToastInput) => void };

const AUTO_HIDE_MS = 10_000;
const ToastContext = createContext<ToastApi | null>(null);

// Shows one toast at a time above the page. App.tsx mounts it once around the signed-in routes.
export function ToastProvider({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<ToastState | null>(null);
  const lastId = useRef(0);

  // Replaces whatever toast is showing with the new one.
  const show = useCallback((input: ToastInput) => {
    lastId.current += 1;
    setToast({ ...input, id: lastId.current });
  }, []);

  // Clears the toast only if it is still the one with this id.
  const dismiss = useCallback((id: number) => {
    setToast((current) => (current?.id === id ? null : current));
  }, []);

  const api = useMemo<ToastApi>(() => ({ show }), [show]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      <AnimatePresence>{toast ? <ToastView key={toast.id} toast={toast} onDone={dismiss} /> : null}</AnimatePresence>
    </ToastContext.Provider>
  );
}

// Returns the show function for the nearest ToastProvider.
export function useToast(): ToastApi {
  const value = useContext(ToastContext);
  if (!value) throw new Error("useToast must be used inside ToastProvider");
  return value;
}

// One toast on screen. Hides itself after 10 s, or when its action is clicked.
function ToastView({ toast, onDone }: { toast: ToastState; onDone: (id: number) => void }) {
  useEffect(() => {
    const timer = setTimeout(() => onDone(toast.id), AUTO_HIDE_MS);
    return () => clearTimeout(timer);
  }, [toast.id, onDone]);

  // The action's run must not reject; the caller handles its own errors.
  function runAction() {
    const run = toast.action?.run;
    onDone(toast.id);
    void run?.();
  }

  return (
    <div className="pointer-events-none fixed inset-x-0 bottom-8 z-50 flex justify-center pl-[232px]">
      <motion.div
        role="status"
        aria-live="polite"
        initial={{ opacity: 0, y: 24, scale: 0.96 }}
        animate={{ opacity: 1, y: 0, scale: 1 }}
        exit={{ opacity: 0, y: 12, scale: 0.98, transition: { duration: 0.18 } }}
        transition={pressSpring}
        className="pointer-events-auto flex w-max max-w-[min(90vw,460px)] items-center gap-4 rounded-md bg-ink py-3 pr-3 pl-4 text-bg shadow-toast"
      >
        <div className="min-w-0">
          <div className="type-callout-strong">{toast.title}</div>
          {toast.sub ? <div className="mt-0.5 truncate type-caption opacity-60">{toast.sub}</div> : null}
        </div>
        {toast.action ? (
          <button
            type="button"
            onClick={runAction}
            className="flex h-[38px] shrink-0 items-center gap-2 rounded-pill bg-toast-undo pr-3 pl-2 type-button-small transition-transform active:scale-95"
          >
            <CountdownRing />
            {toast.action.label}
          </button>
        ) : null}
      </motion.div>
    </div>
  );
}

// A ring that empties over the toast's 10 seconds, so the undo window is visible.
function CountdownRing() {
  return (
    <svg viewBox="0 0 22 22" aria-hidden className="size-[22px] -rotate-90">
      <circle cx={11} cy={11} r={9} fill="none" strokeWidth={2.5} className="stroke-current opacity-25" />
      <circle
        cx={11}
        cy={11}
        r={9}
        fill="none"
        strokeWidth={2.5}
        strokeDasharray={56.5}
        className="stroke-polo motion-safe:animate-[toast-ring_10s_linear_forwards]"
      />
    </svg>
  );
}
