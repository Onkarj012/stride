import { usePrefs } from "@/hooks/usePrefs";
import { useMediaQuery } from "@/hooks/useMediaQuery";

/**
 * True when motion should be reduced — either the user's synced `reduceMotion`
 * preference (Task 1) or the OS `prefers-reduced-motion` setting. Use to gate
 * framer-motion animations on core flows (Task 14).
 */
export function useReducedMotion(): boolean {
  const { prefs } = usePrefs();
  const system = useMediaQuery("(prefers-reduced-motion: reduce)");
  return prefs.reduceMotion || system;
}
