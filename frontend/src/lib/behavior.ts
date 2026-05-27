/**
 * Stride — behavioral memory.
 * Tracks which suggestion chips the user clicks so we can reorder them
 * by frequency. Demonstrates the "Behavioral Memory Layer" from SYSTEM.md.
 */

const KEY = "stride.behavior.v1";

type Behavior = { suggestionClicks: Record<string, number> };

function read(): Behavior {
  if (typeof window === "undefined") return { suggestionClicks: {} };
  const raw = localStorage.getItem(KEY);
  if (!raw) return { suggestionClicks: {} };
  try {
    return JSON.parse(raw) as Behavior;
  } catch {
    return { suggestionClicks: {} };
  }
}

export function recordSuggestion(label: string): void {
  if (typeof window === "undefined") return;
  const data = read();
  data.suggestionClicks[label] = (data.suggestionClicks[label] ?? 0) + 1;
  localStorage.setItem(KEY, JSON.stringify(data));
}

export function orderSuggestions(suggestions: string[]): string[] {
  const data = read();
  return [...suggestions].sort(
    (a, b) =>
      (data.suggestionClicks[b] ?? 0) - (data.suggestionClicks[a] ?? 0),
  );
}
