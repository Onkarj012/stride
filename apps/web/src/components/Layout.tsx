import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { useClerk } from "@clerk/react";

const NAV_ITEMS = [
  { to: "/day", label: "Day" },
  { to: "/progress", label: "Progress" },
] as const;

// App shell: a sidebar with the main navigation and the page area beside it.
export function Layout({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <aside className="flex w-[220px] shrink-0 flex-col gap-6 border-r border-line p-5">
        <div className="font-display text-2xl font-bold tracking-tight">Stride</div>
        <nav className="flex flex-col gap-1">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                `rounded-field px-3 py-2 text-sm font-semibold ${isActive ? "bg-card2 text-ink" : "text-ink2 hover:bg-card2"}`
              }
            >
              {item.label}
            </NavLink>
          ))}
        </nav>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-auto rounded-field px-3 py-2 text-left text-sm font-semibold text-ink2 hover:bg-card2"
        >
          Sign out
        </button>
      </aside>
      <main className="min-w-0 flex-1 overflow-y-auto">
        <div className="mx-auto max-w-[1100px] p-8">{children}</div>
      </main>
    </div>
  );
}
