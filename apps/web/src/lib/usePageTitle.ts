import { useEffect } from "react";

// Formats a page name for the browser tab and history.
export function pageTitle(name: string): string {
  return `${name} · Stride`;
}

// Keeps the browser tab title in sync with the current page.
export function usePageTitle(name: string): void {
  useEffect(() => {
    document.title = pageTitle(name);
  }, [name]);
}
