import type { ReactNode } from "react";
import { NavLink } from "react-router-dom";
import { motion } from "motion/react";
import { useClerk, useUser } from "@clerk/react";
import { CalendarDays, LogOut, TrendingUp } from "lucide-react";
import { Eyebrow, StrideMark, smoothSpring } from "@/components/ui";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { to: "/day", label: "Day", icon: CalendarDays },
  { to: "/progress", label: "Progress", icon: TrendingUp },
] as const;

// App shell: a quiet sidebar with the brand, the two pages and the account, and the page beside it.
export function Layout({ children }: { children: ReactNode }) {
  const { signOut } = useClerk();
  const { user } = useUser();
  const name = user?.firstName || user?.username || user?.primaryEmailAddress?.emailAddress || "You";

  return (
    <div className="flex min-h-dvh bg-bg text-ink">
      <aside className="sticky top-0 flex h-dvh w-[232px] shrink-0 flex-col border-r border-line px-4 py-6">
        <div className="flex items-center gap-2.5 px-3">
          <span className="grid size-8 place-items-center rounded-[10px] bg-polo text-on-polo">
            <StrideMark className="size-6" />
          </span>
          <span className="font-display text-[22px] font-bold tracking-[-0.03em]">Stride</span>
        </div>

        <nav className="mt-9 flex flex-col gap-1" aria-label="Main">
          {NAV_ITEMS.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              className={({ isActive }) =>
                cn(
                  "relative flex items-center gap-3 rounded-sm px-3 py-2.5 type-body-strong transition-colors",
                  isActive ? "text-bg" : "text-ink2 hover:bg-card2 hover:text-ink",
                )
              }
            >
              {({ isActive }) => (
                <>
                  {isActive ? (
                    <motion.span layoutId="nav-active" transition={smoothSpring} className="absolute inset-0 rounded-sm bg-ink" />
                  ) : null}
                  <item.icon className="relative size-[18px]" strokeWidth={1.9} />
                  <span className="relative">{item.label}</span>
                </>
              )}
            </NavLink>
          ))}
        </nav>

        <div className="mt-auto flex items-center gap-3 border-t border-line px-3 pt-5">
          <span className="grid size-9 shrink-0 place-items-center rounded-pill bg-card font-display text-[15px] font-bold shadow-card">
            {name.slice(0, 1).toUpperCase()}
          </span>
          <span className="min-w-0 flex-1 truncate type-secondary font-medium text-ink">{name}</span>
          <button
            type="button"
            onClick={() => void signOut()}
            aria-label="Sign out"
            title="Sign out"
            className="grid size-9 shrink-0 place-items-center rounded-pill text-ink3 transition-colors hover:bg-card2 hover:text-ink"
          >
            <LogOut className="size-[18px]" strokeWidth={1.9} />
          </button>
        </div>
        <div className="mt-4 space-y-1.5 px-3">
          <Eyebrow>Food data</Eyebrow>
          <p className="type-caption text-ink3">
            IFCT 2017 (NIN, India), USDA FoodData Central, UK CoFID 2021, Open Food Facts (ODbL). Contains public sector information licensed under the{" "}
            <a
              href="https://www.nationalarchives.gov.uk/doc/open-government-licence/version/3/"
              target="_blank"
              rel="noreferrer"
              className="underline underline-offset-2 hover:text-ink2"
            >
              Open Government Licence v3.0
            </a>
            .
          </p>
        </div>
      </aside>
      <main className="min-w-0 flex-1">
        <div className="mx-auto max-w-[1240px] px-10 pt-10 pb-24">{children}</div>
      </main>
    </div>
  );
}
