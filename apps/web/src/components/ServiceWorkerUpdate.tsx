import { useEffect, useRef, useState } from "react";
import { registerSW } from "virtual:pwa-register";
import { motion, AnimatePresence } from "motion/react";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/primitives/Button";

export function ServiceWorkerUpdate() {
  const [needRefresh, setNeedRefresh] = useState(false);
  const [needReload, setNeedReload] = useState(false);
  const updateSWRef = useRef<((reloadPage?: boolean) => Promise<void>) | null>(null);
  const registeredRef = useRef(false);
  const userInitiatedRef = useRef(false);

  useEffect(() => {
    if (registeredRef.current) return;
    registeredRef.current = true;

    const update = registerSW({
      immediate: true,
      onNeedRefresh() {
        setNeedRefresh(true);
      },
      onNeedReload() {
        // When the user already clicked Reload, the new service worker has been
        // told to skip waiting and the 'controlling' event fired; reload now.
        // Otherwise another tab activated the worker externally, so just show
        // the toast and let the user finish their current work before reloading.
        if (userInitiatedRef.current) {
          window.location.reload();
        } else {
          setNeedReload(true);
        }
      },
      onOfflineReady() {
        // Intentionally empty — no offline banner needed.
      },
      onRegisterError(error) {
        console.error("Service worker registration failed:", error);
      },
    });
    updateSWRef.current = update;
  }, []);

  const handleReload = () => {
    if (needReload) {
      // The new service worker is already controlling; reload immediately.
      window.location.reload();
      return;
    }

    userInitiatedRef.current = true;
    void updateSWRef.current?.(true);
  };

  const showReload = needRefresh || needReload;
  const reloadLabel = needReload ? "App updated — reload when ready" : "Update available";

  return (
    <AnimatePresence>
      {showReload && (
        <motion.div
          initial={{ opacity: 0, y: 16, scale: 0.96 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: 16, scale: 0.96 }}
          transition={{ type: "spring", stiffness: 300, damping: 28 }}
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-[60] w-[calc(100%-2rem)] max-w-sm"
        >
          <div className="flex items-center justify-between gap-3 rounded-2xl border border-border-strong bg-card px-4 py-3 shadow-[var(--shadow-elev)]">
            <div className="flex items-center gap-2.5 min-w-0">
              <RefreshCw className="h-4 w-4 shrink-0 text-text-muted" />
              <p className="text-[13.5px] font-semibold text-text">{reloadLabel}</p>
            </div>
            <Button size="sm" variant="primary" onClick={handleReload} className="shrink-0">
              Reload
            </Button>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}
