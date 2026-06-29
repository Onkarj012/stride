import { createContext, useContext, useState, type ReactNode } from "react";

type SnapshotContextValue = {
  expanded: boolean;
  toggle: () => void;
};

const SnapshotContext = createContext<SnapshotContextValue>({
  expanded: true,
  toggle: () => {},
});

export function SnapshotProvider({ children }: { children: ReactNode }) {
  const [expanded, setExpanded] = useState<boolean>(() => {
    try { return localStorage.getItem("stride_snapshot_expanded") !== "false"; }
    catch { return true; }
  });

  const toggle = () => {
    setExpanded((prev) => {
      const next = !prev;
      try { localStorage.setItem("stride_snapshot_expanded", String(next)); } catch {}
      return next;
    });
  };

  return (
    <SnapshotContext.Provider value={{ expanded, toggle }}>
      {children}
    </SnapshotContext.Provider>
  );
}

export const useSnapshot = () => useContext(SnapshotContext);
