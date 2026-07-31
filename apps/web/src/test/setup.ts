import "@testing-library/jest-dom/vitest";

// Node 22 exposes a separate experimental global localStorage. Keep tests on
// a small browser-compatible store when jsdom cannot expose one in workers.
const values = new Map<string, string>();
const storage: Storage = {
  getItem: (key) => values.get(key) ?? null,
  setItem: (key, value) => values.set(key, String(value)),
  removeItem: (key) => values.delete(key),
  clear: () => values.clear(),
  key: (index) => [...values.keys()][index] ?? null,
  get length() { return values.size; },
};

Object.defineProperty(globalThis, "localStorage", {
  configurable: true,
  value: storage,
});

// jsdom does not implement matchMedia; components read it for reduced-motion.
if (typeof window !== "undefined" && typeof window.matchMedia !== "function") {
  Object.defineProperty(window, "matchMedia", {
    configurable: true,
    value: (query: string) => ({
      matches: false,
      media: query,
      onchange: null,
      addEventListener: () => {},
      removeEventListener: () => {},
      addListener: () => {},
      removeListener: () => {},
      dispatchEvent: () => false,
    }),
  });
}
