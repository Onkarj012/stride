import { createContext, useContext, useState, type ReactNode } from "react";
import { useNavigate, useLocation, Outlet } from "react-router-dom";
import { useAuth, useUser, useClerk } from "@clerk/react";
import { AnimatePresence, motion } from "framer-motion";
import {
  Home,
  Utensils,
  Dumbbell,
  ChefHat,
  BarChart3,
  CalendarDays,
  Bot,
  Menu,
  X,
  Moon,
  Sun,
  Settings,
  LogOut,
  Trophy,
} from "lucide-react";
import { useTheme } from "../lib/theme";

const navItems = [
  { icon: Home, label: "HOME", short: "HOME" },
  { icon: Utensils, label: "MEALS", short: "MEALS" },
  { icon: Dumbbell, label: "WORKOUT", short: "GYM" },
  { icon: ChefHat, label: "RECIPES", short: "RECIPES" },
  { icon: BarChart3, label: "INSIGHTS", short: "STATS" },
  { icon: CalendarDays, label: "HISTORY", short: "HISTORY" },
  { icon: Trophy, label: "LEVELS", short: "LEVELS" },
  { icon: Bot, label: "AI COACH", short: "COACH" },
];

interface LayoutContextType {
  activeTab: string;
  setActiveTab: (tab: string) => void;
}

const LayoutContext = createContext<LayoutContextType>({
  activeTab: "HOME",
  setActiveTab: () => {},
});

export function useLayout() {
  return useContext(LayoutContext);
}

export default function Layout() {
  const { signOut } = useAuth();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const navigate = useNavigate();
  const location = useLocation();
  const { isDark, toggleTheme, accentColor, setAccentColor } = useTheme();

  const [activeTab, setActiveTab] = useState("HOME");
  const [menuOpen, setMenuOpen] = useState(false);

  const isSettings = location.pathname === "/settings";

  const handleTabClick = (label: string) => {
    setActiveTab(label);
    if (isSettings) navigate("/");
  };

  return (
    <LayoutContext.Provider value={{ activeTab, setActiveTab }}>
      <div className="flex flex-col h-screen bg-[var(--bg-main)] text-[var(--text-primary)] font-body transition-colors">
        {/* Top Navigation */}
        <nav className="shrink-0 z-50 bg-[var(--bg-main)] border-b border-[var(--border-default)]" data-testid="main-nav">
          <div className="flex items-center px-4 py-2.5">
            {/* Logo */}
            <div className="text-xl font-heading tracking-normal text-accent mr-6" data-testid="app-logo">STRIDE</div>

            {/* Desktop Nav */}
            <div className="hidden lg:flex items-center gap-1 flex-1">
              {navItems.map((item) => (
                <button
                  key={item.label}
                  data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                  onClick={() => handleTabClick(item.label)}
                  className={`flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-all ${
                    activeTab === item.label && !isSettings
                      ? "bg-accent text-[var(--theme-primary-text)]"
                      : "text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:bg-[var(--bg-elevated)]"
                  }`}
                >
                  <item.icon size={14} strokeWidth={2.5} />
                  <span className="hidden xl:inline">{item.short}</span>
                </button>
              ))}
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-1.5 ml-auto">
                <button
                data-testid="theme-toggle"
                onClick={toggleTheme}
                className="hidden lg:flex items-center p-2 border border-[var(--border-default)] bg-[var(--bg-card)] hover:border-accent transition-colors"
              >
                {isDark ? <Sun size={14} /> : <Moon size={14} />}
              </button>

              <button
                data-testid="settings-btn"
                onClick={() => navigate('/settings')}
                className={`hidden lg:flex items-center p-2 border border-[var(--border-default)] bg-[var(--bg-card)] hover:border-accent transition-colors ${isSettings ? 'border-accent text-accent' : ''}`}
              >
                <Settings size={14} />
              </button>

              <button
                data-testid="logout-btn"
                onClick={() => signOut()}
                className="hidden lg:flex items-center p-2 border border-[var(--border-default)] bg-[var(--bg-card)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
              >
                <LogOut size={14} />
              </button>

              <button
                data-testid="mobile-menu-toggle"
                onClick={() => setMenuOpen(!menuOpen)}
                className="lg:hidden p-2 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"
              >
                {menuOpen ? <X size={18} /> : <Menu size={18} />}
              </button>
            </div>
          </div>

          {/* Mobile menu */}
          <AnimatePresence>
            {menuOpen && (
              <motion.div
                initial={{ height: 0, opacity: 0 }}
                animate={{ height: 'auto', opacity: 1 }}
                exit={{ height: 0, opacity: 0 }}
                transition={{
                  height: { type: "spring", stiffness: 400, damping: 30 },
                  opacity: { duration: 0.2 }
                }}
                className="lg:hidden border-t border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden will-change-transform"
              >
                <div className="grid grid-cols-4 gap-1 p-2">
                  {navItems.map((item) => (
                    <button
                      key={item.label}
                      onClick={() => { handleTabClick(item.label); setMenuOpen(false); }}
                      className={`flex flex-col items-center gap-1 p-3 font-mono text-[10px] ${
                        activeTab === item.label && !isSettings ? "bg-accent text-[var(--theme-primary-text)]" : "hover:bg-[var(--bg-elevated)]"
                      }`}
                    >
                      <item.icon size={18} strokeWidth={2} />
                      {item.short}
                    </button>
                  ))}
                </div>
                <div className="flex items-center justify-end p-3 border-t border-[var(--border-default)] gap-1.5">
                  <button onClick={() => navigate('/settings')} className="p-2 border border-[var(--border-default)]">
                    <Settings size={14} />
                  </button>
                  <button onClick={toggleTheme} className="p-2 border border-[var(--border-default)]">
                    {isDark ? <Sun size={14} /> : <Moon size={14} />}
                  </button>
                  <button onClick={() => signOut()} className="p-2 border border-[var(--border-default)]">
                    <LogOut size={14} />
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </nav>

        {/* Content Area */}
        <div className="flex-1 min-h-0 relative">
          <Outlet />
        </div>
      </div>
    </LayoutContext.Provider>
  );
}
