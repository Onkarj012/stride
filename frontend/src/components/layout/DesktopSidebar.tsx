import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import {
  Home, BarChart3, CalendarDays, Settings as SettingsIcon,
  MessageSquare, Bot, User, LogOut, ChefHat,
} from "lucide-react";
import { Brand } from "@/components/layout/Brand";
import { StrideMark } from "@/components/primitives/StrideMark";
import { ThemeToggle } from "@/components/layout/ThemeToggle";
import { Avatar } from "@/components/primitives/Avatar";
import { useSidebar } from "@/context/SidebarContext";
import { useUser, useClerk } from "@clerk/react";
import { cn } from "@/lib/utils";
import { useRef, useState } from "react";

const NAV = [
  { to: "/", label: "Home", icon: Home },
  { to: "/insights", label: "Insights", icon: BarChart3 },
  { to: "/history", label: "History", icon: CalendarDays },
  { to: "/recipes", label: "Recipes", icon: ChefHat },
  { to: "/coach", label: "AI Coach", icon: Bot },
];

const SPRING = { type: "spring", stiffness: 320, damping: 32 } as const;
const FADE = { duration: 0.15, ease: [0.22, 1, 0.36, 1] as [number, number, number, number] };

function NavItem({
  to, label, Icon, active, collapsed,
}: {
  to: string; label: string;
  Icon: typeof Home; active: boolean; collapsed: boolean;
}) {
  return (
    <NavLink
      to={to}
      aria-current={active ? "page" : undefined}
      title={collapsed ? label : undefined}
      className={cn(
        "relative flex items-center rounded-[14px]",
        "transition-colors duration-150 focus-visible:outline-none",
        collapsed ? "h-11 w-11 mx-auto justify-center" : "h-11 px-3 gap-3",
      )}
    >
      {active && (
        <motion.div
          layoutId="sidebar-indicator"
          className="absolute inset-0 rounded-[14px] bg-card border border-border"
          transition={SPRING}
        />
      )}
      <Icon
        className={cn(
          "relative h-5 w-5 shrink-0 transition-colors duration-150",
          active ? "text-text" : "text-text-muted",
        )}
        strokeWidth={active ? 2 : 1.6}
      />
      {!collapsed && (
        <span
          className={cn(
            "relative text-[15px] transition-colors duration-150 truncate",
            active ? "text-text font-semibold" : "text-text-muted font-medium",
          )}
        >
          {label}
        </span>
      )}
    </NavLink>
  );
}

/* ── User chip with popover ── */
function UserChip({ collapsed }: { collapsed: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();
  const { user } = useUser();
  const { signOut } = useClerk();

  const displayName = user?.fullName ?? user?.username ?? user?.primaryEmailAddress?.emailAddress ?? "Account";
  const firstName = user?.firstName ?? user?.username ?? displayName.split(" ")[0];
  const subtitle = user?.primaryEmailAddress?.emailAddress ?? "";

  // Close on outside click
  const handleBlur = (e: React.FocusEvent) => {
    if (!ref.current?.contains(e.relatedTarget as Node)) setOpen(false);
  };

  return (
    <div ref={ref} className="relative" onBlur={handleBlur}>
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={cn(
          "flex items-center rounded-[14px] border border-border bg-card w-full transition-colors hover:bg-card-elev",
          collapsed ? "h-11 w-11 mx-auto justify-center" : "gap-3 px-3 py-2.5",
        )}
      >
        <Avatar name={displayName} size={collapsed ? 28 : 32} />
        {!collapsed && (
          <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE} className="flex flex-col min-w-0 flex-1 text-left">
            <span className="text-[14px] font-semibold text-text truncate">{firstName}</span>
            <span className="text-[12px] text-text-muted truncate">{subtitle}</span>
          </motion.div>
        )}
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 6, scale: 0.97 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 6, scale: 0.97 }}
            transition={{ duration: 0.15 }}
            className="absolute bottom-full mb-2 left-0 w-44 rounded-[14px] bg-card border border-border shadow-[var(--shadow-elev)] py-1 overflow-hidden z-50"
          >
            {[
              { icon: User, label: "Profile", action: () => { navigate("/profile"); setOpen(false); } },
              { icon: LogOut, label: "Sign out", action: () => { setOpen(false); signOut(); }, danger: true },
            ].map(({ icon: Icon, label, action, danger }) => (
              <button
                key={label}
                type="button"
                onClick={action}
                className={cn(
                  "w-full flex items-center gap-2.5 px-3 py-2.5 text-[13px] font-medium transition-colors hover:bg-card-elev",
                  danger ? "text-bubblegum" : "text-text",
                )}
              >
                <Icon className="h-4 w-4 shrink-0" strokeWidth={1.75} />
                {label}
              </button>
            ))}
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

export function DesktopSidebar(_props: { onAskStride?: () => void }) {
  const { collapsed, setCollapsed } = useSidebar();
  const { pathname } = useLocation();
  const navigate = useNavigate();
  const activeIndex = NAV.findIndex((n) => (n.to === "/" ? pathname === "/" : pathname.startsWith(n.to)));

  return (
    <motion.aside
      animate={{ width: collapsed ? 76 : 240 }}
      transition={SPRING}
      onMouseEnter={() => collapsed && setCollapsed(false)}
      onMouseLeave={() => !collapsed && setCollapsed(true)}
      className={cn(
        "hidden lg:flex shrink-0 flex-col gap-5",
        "sticky top-0 h-screen overflow-hidden",
        "border-r border-border bg-bg",
        "py-5 z-20",
      )}
    >
      {/* Brand */}
      <div className={cn("flex items-center", collapsed ? "justify-center px-2" : "px-5")}>
        <AnimatePresence mode="wait" initial={false}>
          {collapsed ? (
            <motion.div key="mark" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE} className="text-text">
              <StrideMark className="h-7 w-7" />
            </motion.div>
          ) : (
            <motion.div key="full" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} transition={FADE}>
              <Brand />
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      {/* Ask Stry CTA → navigates to /coach */}
      <div className={cn(collapsed ? "px-2" : "px-4")}>
        <button
          type="button"
          onClick={() => navigate("/coach")}
          aria-label="Ask Stry"
          title={collapsed ? "Ask Stry" : undefined}
          className={cn(
            "flex items-center justify-center rounded-full bg-ink text-text-on-ink",
            "transition-[transform,opacity] duration-150 hover:opacity-90 active:scale-[0.98]",
            "focus-visible:outline-none",
            collapsed ? "h-11 w-11 mx-auto" : "h-11 w-full gap-2 px-4 text-[15px] font-semibold",
          )}
        >
          <MessageSquare className="h-4 w-4 shrink-0" strokeWidth={2} />
          {!collapsed && (
            <motion.span initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={FADE}>
              Ask Stry
            </motion.span>
          )}
        </button>
      </div>

      {/* Nav */}
      <nav aria-label="Main" className={cn("flex flex-col gap-1", collapsed ? "px-2" : "px-3")}>
        {NAV.map((item, i) => (
          <NavItem
            key={item.to}
            to={item.to}
            label={item.label}
            Icon={item.icon}
            active={i === activeIndex}
            collapsed={collapsed}
          />
        ))}
      </nav>

      <div className="flex-1" />

      {/* Footer: theme toggle, settings, user chip */}
      <div className={cn("flex flex-col gap-3", collapsed ? "px-2" : "px-4")}>
        {/* Theme toggle */}
        <div className={cn("flex", collapsed ? "justify-center" : "")}>
          <ThemeToggle />
        </div>

        {/* Settings icon */}
        <NavLink
          to="/settings"
          title={collapsed ? "Settings" : undefined}
          className={cn(
            "flex items-center rounded-[14px] transition-colors duration-150 focus-visible:outline-none",
            collapsed ? "h-11 w-11 mx-auto justify-center" : "h-11 px-3 gap-3",
            pathname.startsWith("/settings") ? "bg-card border border-border" : "hover:bg-card",
          )}
        >
          <SettingsIcon
            className={cn("h-5 w-5 shrink-0", pathname.startsWith("/settings") ? "text-text" : "text-text-muted")}
            strokeWidth={1.75}
          />
          {!collapsed && (
            <span className={cn("text-[15px] font-medium", pathname.startsWith("/settings") ? "text-text font-semibold" : "text-text-muted")}>
              Settings
            </span>
          )}
        </NavLink>

        {/* User chip with popover */}
        <UserChip collapsed={collapsed} />
      </div>
    </motion.aside>
  );
}
