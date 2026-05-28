import { useEffect } from "react";

type Options = {
  meta?: boolean;
  ctrl?: boolean;
  shift?: boolean;
};

export function useShortcut(key: string, cb: () => void, opts: Options = {}) {
  useEffect(() => {
    function handler(e: KeyboardEvent) {
      const metaOk = opts.meta ? e.metaKey || e.ctrlKey : true;
      const ctrlOk = opts.ctrl ? e.ctrlKey : true;
      const shiftOk = opts.shift ? e.shiftKey : true;
      if (e.key.toLowerCase() === key.toLowerCase() && metaOk && ctrlOk && shiftOk) {
        e.preventDefault();
        cb();
      }
    }
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [key, cb, opts.meta, opts.ctrl, opts.shift]);
}
