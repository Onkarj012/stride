import { NavLink, useLocation } from "react-router-dom";
import { motion } from "motion/react";
import { Home, BarChart3, CalendarDays, Settings as SettingsIcon, Bot } from "lucide-react";
import { cn } from "@/lib/utils";

type Tab = {
  to: string;
  label: string;
  icon: React.ComponentType<{ className?: string; strokeWidth?: number }>;
};

const TABS: Tab[] = [
  { to: "/", label: "Home", icon: Home },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/coach", label: "Coach", icon: Bot },
  { to: "/history", label: "History", icon: CalendarDays },
  { to: "/settings", label: "Settings", icon: SettingsIcon },
];

const SPRING = { type: "spring", stiffness: 220, damping: 26 } as const;

export function FloatingTabBar() {
  const { pathname } = useLocation();
  const activeIndex = Math.max(
    0,
    TABS.findIndex((t) => (t.to === "/" ? pathname === "/" : pathname.startsWith(t.to))),
  );

  return (
    <div
      className="lg:hidden pointer-events-none fixed inset-x-0 bottom-0 z-30 flex justify-center px-5"
      style={{ paddingBottom: "max(env(safe-area-inset-bottom), 16px)" }}
    >
      <nav
        aria-label="Primary"
        className="pointer-events-auto relative w-full max-w-[400px] h-16 rounded-full bg-ink shadow-[var(--shadow-float)]"
      >
        {/* Indicator slot row sitting above the bar */}
        <div className="pointer-events-none absolute -top-2 left-0 flex h-16 w-full">
          {TABS.map((tab, i) => (
            <div
              key={tab.to}
              className="relative flex flex-1 items-center justify-center"
            >
              {i === activeIndex && (
                <motion.div
                  layoutId="tab-indicator"
                  className="h-16 w-16 rounded-full bg-card border-[6px] border-bg"
                  transition={SPRING}
                />
              )}
            </div>
          ))}
        </div>

        <ul className="relative flex h-full items-center">
          {TABS.map((tab, index) => {
            const Icon = tab.icon;
            const isActive = index === activeIndex;
            return (
              <li key={tab.to} className="flex flex-1 justify-center">
                <NavLink
                  to={tab.to}
                  aria-label={tab.label}
                  className={cn(
                    "relative z-10 inline-flex h-12 w-12 items-center justify-center rounded-full",
                    "focus-visible:outline-none",
                  )}
                >
                  <motion.div
                    animate={{ y: isActive ? -10 : 0 }}
                    transition={SPRING}
                  >
                    <Icon
                      className={cn(
                        "h-5 w-5 transition-colors duration-200",
                        isActive ? "text-ink" : "text-text-on-ink/55",
                      )}
                      strokeWidth={1.75}
                    />
                  </motion.div>
                </NavLink>
              </li>
            );
          })}
        </ul>
      </nav>
    </div>
  );
}
