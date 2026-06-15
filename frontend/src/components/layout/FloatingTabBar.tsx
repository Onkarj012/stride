import { useNavigate, useLocation } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { Home, BarChart3, Bot, UtensilsCrossed, Dumbbell } from "lucide-react";
import { useUser } from "@clerk/react";
import { useNavSheet } from "@/context/NavSheetContext";
import { cn } from "@/lib/utils";

const TABS = [
  { to: "/",           label: "Today",    Icon: Home },
  { to: "/nutrition",  label: "Nutrition", Icon: UtensilsCrossed },
  { to: "/workouts",   label: "Workouts", Icon: Dumbbell },
  { to: "/insights",   label: "Insights", Icon: BarChart3 },
  { to: "/coach",      label: "Coach",    Icon: Bot },
] as const;

export function FloatingTabBar() {
  const { open, setOpen } = useNavSheet();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const { user } = useUser();

  const initials = [user?.firstName?.[0], user?.lastName?.[0]]
    .filter(Boolean).join("").toUpperCase() || "?";
  const fullName = user?.fullName ?? user?.firstName ?? "Profile";
  const goal = "Cut · 🔥 Streak";

  function handleNav(to: string) {
    navigate(to);
    setOpen(false);
  }

  function isActive(to: string) {
    return to === "/" ? pathname === "/" : pathname.startsWith(to);
  }

  return (
    <AnimatePresence>
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-50 flex flex-col justify-end"
          aria-modal="true"
          role="dialog"
          aria-label="Navigation"
        >
          {/* Backdrop */}
          <motion.div
            className="absolute inset-0 bg-ink/50"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.18 }}
            onClick={() => setOpen(false)}
          />

          {/* Sheet */}
          <motion.div
            className="relative z-10 bg-card rounded-t-[26px] px-5 pt-3"
            style={{ paddingBottom: "max(env(safe-area-inset-bottom), 40px)" }}
            initial={{ y: "100%" }}
            animate={{ y: 0 }}
            exit={{ y: "100%" }}
            transition={{ type: "spring", stiffness: 340, damping: 34 }}
          >
            {/* Handle */}
            <div className="w-9 h-1 rounded-full bg-border mx-auto mb-5" />

            {/* Label */}
            <p className="text-[10px] font-extrabold tracking-[1.1px] uppercase text-text-muted mb-2.5">
              Go to
            </p>

            {/* 5-col nav grid */}
            <div className="grid grid-cols-5 gap-1 mb-3.5">
              {TABS.map(({ to, label, Icon }) => {
                const active = isActive(to);
                return (
                  <button
                    key={to}
                    type="button"
                    onClick={() => handleNav(to)}
                    className={cn(
                      "flex flex-col items-center gap-1.5 py-2.5 px-0.5 rounded-[14px] transition-colors",
                      active ? "bg-lavender/15" : "bg-transparent",
                    )}
                  >
                    <div
                      className={cn(
                        "w-11 h-11 rounded-[14px] flex items-center justify-center",
                        active ? "bg-lavender" : "bg-input",
                      )}
                    >
                      <Icon
                        className={cn("w-5 h-5", active ? "text-ink" : "text-text-muted")}
                        strokeWidth={1.75}
                      />
                    </div>
                    <span
                      className={cn(
                        "text-[10px] font-bold",
                        active ? "text-ink" : "text-text-muted",
                      )}
                    >
                      {label}
                    </span>
                  </button>
                );
              })}
            </div>

            {/* Profile row */}
            <button
              type="button"
              onClick={() => handleNav("/settings")}
              className="flex w-full items-center gap-3 rounded-2xl bg-bg px-3.5 py-3 text-left transition-colors active:bg-input"
            >
              <div className="w-9 h-9 rounded-full bg-lavender flex items-center justify-center text-ink text-[13px] font-bold shrink-0">
                {initials}
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-[13px] font-extrabold text-text truncate">{fullName}</div>
                <div className="text-[11px] text-text-muted mt-0.5">{goal}</div>
              </div>
              <svg
                width="14" height="14" viewBox="0 0 24 24"
                fill="none" stroke="currentColor" strokeWidth="2.2"
                strokeLinecap="round" strokeLinejoin="round"
                className="text-text-muted shrink-0"
                aria-hidden="true"
              >
                <path d="M9 18l6-6-6-6" />
              </svg>
            </button>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  );
}
