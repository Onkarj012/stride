import { createContext, useContext, useEffect, useState } from "react";

type SidebarCtxValue = {
  collapsed: boolean;
  setCollapsed: (v: boolean) => void;
  toggle: () => void;
};

const SidebarCtx = createContext<SidebarCtxValue>({
  collapsed: false,
  setCollapsed: () => {},
  toggle: () => {},
});

const KEY = "stride.sidebar.collapsed";

export function SidebarProvider({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsedState] = useState<boolean>(() => {
    if (typeof window === "undefined") return true;
    // Always start collapsed — hover-to-expand handles the rest
    return true;
  });

  useEffect(() => {
    localStorage.setItem(KEY, collapsed ? "1" : "0");
  }, [collapsed]);

  const setCollapsed = (v: boolean) => setCollapsedState(v);
  const toggle = () => setCollapsedState((c) => !c);

  return (
    <SidebarCtx.Provider value={{ collapsed, setCollapsed, toggle }}>
      {children}
    </SidebarCtx.Provider>
  );
}

export function useSidebar() {
  return useContext(SidebarCtx);
}
