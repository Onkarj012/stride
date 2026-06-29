import { createContext, useContext, useState, type ReactNode } from "react";

type NavSheetCtx = { open: boolean; setOpen: (v: boolean) => void };

const NavSheetContext = createContext<NavSheetCtx>({ open: false, setOpen: () => {} });

export function NavSheetProvider({ children }: { children: ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <NavSheetContext.Provider value={{ open, setOpen }}>
      {children}
    </NavSheetContext.Provider>
  );
}

export function useNavSheet() {
  return useContext(NavSheetContext);
}
