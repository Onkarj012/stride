import { useEffect, useRef, useState } from "react";

const REDUCED = typeof window !== "undefined"
  && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

/**
 * Reveals `text` character-by-character at `speed` ms/char.
 * Respects prefers-reduced-motion (instant reveal).
 */
export function useTypewriter(text: string, speed = 22, active = true) {
  const [displayed, setDisplayed] = useState("");
  const rafRef = useRef<number>(0);

  useEffect(() => {
    if (!active) { setDisplayed(""); return; }
    if (REDUCED) { setDisplayed(text); return; }

    setDisplayed("");
    let i = 0;
    let last = 0;

    function tick(now: number) {
      if (now - last >= speed) {
        i++;
        setDisplayed(text.slice(0, i));
        last = now;
      }
      if (i < text.length) rafRef.current = requestAnimationFrame(tick);
    }

    rafRef.current = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafRef.current);
  }, [text, speed, active]);

  const done = displayed.length === text.length;
  return { displayed, done };
}
