import { useState, useCallback } from "react";

export interface Toast {
  id: string;
  message: string;
  type: "success" | "error" | "info";
  undoAction?: () => void;
  undoLabel?: string;
  duration?: number;
}

export function useToast() {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const addToast = useCallback((toast: Omit<Toast, "id">) => {
    const id = Math.random().toString(36).slice(2, 9);
    setToasts((prev) => [...prev, { ...toast, id }]);
    return id;
  }, []);

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const success = useCallback(
    (message: string, undoAction?: () => void, undoLabel = "UNDO") => {
      return addToast({ message, type: "success", undoAction, undoLabel, duration: 5000 });
    },
    [addToast],
  );

  const error = useCallback(
    (message: string) => {
      return addToast({ message, type: "error", duration: 5000 });
    },
    [addToast],
  );

  return { toasts, addToast, removeToast, success, error };
}
