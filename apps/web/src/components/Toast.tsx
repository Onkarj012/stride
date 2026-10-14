import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";

export type ToastAction = { label: string; run: () => Promise<unknown> | void };
export type ToastInput = { title: string; sub?: string; action?: ToastAction };
type ToastState = ToastInput & { id: number };
type ToastApi = { show: (toast: ToastInput) => void };

const AUTO_HIDE_MS = 10_000;
const ToastContext = createContext<ToastApi | null>(null);

// Shows one toast at a time above the page. Mounted at the top of DayPage for now; hoist it to App later.
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
      {toast ? <ToastView key={toast.id} toast={toast} onDone={dismiss} /> : null}
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
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-24 left-1/2 z-50 flex w-max max-w-[min(90vw,420px)] -translate-x-1/2 items-center gap-4 rounded-md bg-dock py-3 pl-4 pr-3 text-dock-ink shadow-toast"
    >
      <div className="min-w-0">
        <div className="text-sm font-semibold">{toast.title}</div>
        {toast.sub ? <div className="mt-0.5 text-xs opacity-60">{toast.sub}</div> : null}
      </div>
      {toast.action ? (
        <button
          type="button"
          onClick={runAction}
          className="shrink-0 rounded-pill bg-dock-field px-3 py-1.5 text-sm font-semibold text-dock-ink"
        >
          {toast.action.label}
        </button>
      ) : null}
    </div>
  );
}
