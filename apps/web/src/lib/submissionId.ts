import { useCallback, useRef } from "react";

/** Random id used to make a chat submission idempotent on the backend. */
export function newSubmissionId(): string {
  if (typeof crypto !== "undefined" && typeof crypto.randomUUID === "function") return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 11)}`;
}

/**
 * Stable id per logical submission attempt.
 *
 * The same message content keeps the same id until it lands, so retrying after
 * a dropped response reuses the id and the backend de-duplicates the write
 * instead of logging the meal twice. A different message gets a new id.
 */
export function useSubmissionId(): { idFor: (key: string) => string; clear: () => void } {
  const ref = useRef<{ key: string; id: string } | null>(null);

  const idFor = useCallback((key: string) => {
    if (ref.current?.key === key) return ref.current.id;
    const id = newSubmissionId();
    ref.current = { key, id };
    return id;
  }, []);

  const clear = useCallback(() => {
    ref.current = null;
  }, []);

  return { idFor, clear };
}
