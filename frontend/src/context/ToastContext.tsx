import { createContext, useCallback, useContext, useState, type ReactNode } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, AlertTriangle, Info } from "lucide-react";
import { cn } from "@/lib/utils";

type ToastTone = "success" | "info" | "error";
type Toast = { id: number; tone: ToastTone; title: string; sub?: string };

type ToastCtx = {
  show: (toast: Omit<Toast, "id">) => void;
  success: (title: string, sub?: string) => void;
  info: (title: string, sub?: string) => void;
  error: (title: string, sub?: string) => void;
};

const Ctx = createContext<ToastCtx | null>(null);

export function useToast() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useToast must be used inside <ToastProvider>");
  return c;
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const show = useCallback((t: Omit<Toast, "id">) => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { ...t, id }]);
    setTimeout(() => setToasts((prev) => prev.filter((x) => x.id !== id)), 3500);
  }, []);

  const ctx: ToastCtx = {
    show,
    success: (title, sub) => show({ tone: "success", title, sub }),
    info: (title, sub) => show({ tone: "info", title, sub }),
    error: (title, sub) => show({ tone: "error", title, sub }),
  };

  return (
    <Ctx.Provider value={ctx}>
      {children}
      <div className="pointer-events-none fixed top-4 left-1/2 -translate-x-1/2 z-[60] flex flex-col gap-2 w-full max-w-sm px-4">
        <AnimatePresence>
          {toasts.map((t) => {
            const Icon = t.tone === "success" ? Check : t.tone === "error" ? AlertTriangle : Info;
            return (
              <motion.div
                key={t.id}
                initial={{ opacity: 0, y: -10, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                exit={{ opacity: 0, y: -10, scale: 0.95 }}
                transition={{ type: "spring", stiffness: 300, damping: 28 }}
                className={cn(
                  "pointer-events-auto flex items-start gap-2.5 rounded-2xl px-4 py-3 shadow-[var(--shadow-elev)] border",
                  t.tone === "success" && "bg-mint border-mint",
                  t.tone === "error" && "bg-bubblegum border-bubblegum",
                  t.tone === "info" && "bg-card border-border-strong",
                )}
              >
                <Icon className={cn("h-4 w-4 shrink-0 mt-0.5", t.tone === "info" ? "text-text-muted" : "text-ink")} strokeWidth={2.25} />
                <div className="flex-1 min-w-0">
                  <p className={cn("text-[13.5px] font-semibold", t.tone === "info" ? "text-text" : "text-ink")}>{t.title}</p>
                  {t.sub && <p className={cn("text-[12px] mt-0.5", t.tone === "info" ? "text-text-muted" : "text-ink/70")}>{t.sub}</p>}
                </div>
              </motion.div>
            );
          })}
        </AnimatePresence>
      </div>
    </Ctx.Provider>
  );
}
