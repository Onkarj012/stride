import { lazy, Suspense } from "react";
import {
  Flame, Utensils, Dumbbell, Bot, Menu, X,
  LogOut, Moon, Sun, User, Home,
  CalendarDays, Loader2,
} from "lucide-react";
import { useAuth, useUser, useClerk } from "@clerk/react";
import { useTheme } from "../lib/theme";
import { DashboardProvider, useDashboard } from "./context/DashboardContext";

const HomePage = lazy(() => import("./HomePage"));
const CaloriesPage = lazy(() => import("./CaloriesPage"));
const MealsPage = lazy(() => import("./MealsPage"));
const WorkoutPage = lazy(() => import("./WorkoutPage"));
const HistoryPage = lazy(() => import("./HistoryPage"));
const AiCoachPage = lazy(() => import("./AiCoachPage"));
const ProfilePage = lazy(() => import("./ProfilePage"));

const navItems = [
  { icon: Home, label: "HOME" },
  { icon: Flame, label: "CALORIES" },
  { icon: Utensils, label: "MEALS" },
  { icon: Dumbbell, label: "WORKOUT" },
  { icon: CalendarDays, label: "HISTORY" },
  { icon: Bot, label: "AI COACH" },
  { icon: User, label: "PROFILE" },
];

function PageLoader() {
  return (
    <div className="flex items-center justify-center h-64">
      <Loader2 size={24} className="animate-spin text-red-600" />
    </div>
  );
}

function DashboardInner() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const { isDark, toggleTheme } = useTheme();
  const {
    activeTab,
    setActiveTab,
    menuOpen,
    setMenuOpen,
    isLoading,
  } = useDashboard();

  return (
    <div className="min-h-screen flex flex-col bg-white dark:bg-gray-950 text-black dark:text-gray-100 font-mono selection:bg-red-600 selection:text-white transition-colors">
      <nav className="sticky top-0 z-50 bg-white dark:bg-gray-950 border-b-2 border-black dark:border-gray-700 transition-colors">
        <div className="flex items-center px-4 py-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-xl font-black tracking-tighter">STRIDE</div>
          </div>
          <div className="hidden lg:flex items-center gap-0 mx-auto">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => setActiveTab(item.label)}
                className={`flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 -ml-[2px] first:ml-0 font-bold text-xs tracking-wider transition-all ${
                  activeTab === item.label
                    ? "bg-black text-white dark:bg-gray-100 dark:text-gray-950"
                    : "bg-white dark:bg-gray-950 text-black dark:text-gray-100 hover:bg-red-600 hover:text-white"
                }`}
              >
                <item.icon size={14} />
                {item.label}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={toggleTheme}
              className="hidden lg:flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              onClick={() => signOut()}
              className="hidden lg:flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"
            >
              <LogOut size={14} />
            </button>
            <button
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden p-2 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors ml-auto"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t-2 border-black dark:border-gray-700 bg-white dark:bg-gray-950">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => {
                  setActiveTab(item.label);
                  setMenuOpen(false);
                }}
                className={`flex items-center gap-3 w-full px-4 py-3 border-b-2 border-black dark:border-gray-700 font-bold text-sm ${activeTab === item.label ? "bg-black text-white dark:bg-gray-100 dark:text-gray-950" : ""}`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
            <button
              onClick={toggleTheme}
              className="flex items-center gap-3 w-full px-4 py-3 border-b-2 border-black dark:border-gray-700 font-bold text-sm"
            >
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {isDark ? "LIGHT MODE" : "DARK MODE"}
            </button>
            <button
              onClick={() => {
                signOut();
                setMenuOpen(false);
              }}
              className="flex items-center gap-3 w-full px-4 py-3 border-b-2 border-black dark:border-gray-700 font-bold text-sm"
            >
              <LogOut size={16} /> LOGOUT
            </button>
          </div>
        )}
      </nav>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-red-600" />
            <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">
              INITIALIZING DATA STREAM...
            </div>
          </div>
        </div>
      ) : (
        <main
          className={`flex-1 min-h-0 ${
            activeTab === "AI COACH"
              ? "flex flex-col overflow-hidden"
              : activeTab === "HISTORY"
                ? "p-4 max-w-7xl mx-auto overflow-hidden flex flex-col"
                : "p-4 max-w-7xl mx-auto overflow-auto"
          }`}
        >
          <Suspense fallback={<PageLoader />}>
            {activeTab === "HOME" && <HomePage />}
            {activeTab === "CALORIES" && <CaloriesPage />}
            {activeTab === "MEALS" && <MealsPage />}
            {activeTab === "WORKOUT" && <WorkoutPage />}
            {activeTab === "HISTORY" && <HistoryPage />}
            {activeTab === "AI COACH" && <AiCoachPage />}
            {activeTab === "PROFILE" && <ProfilePage />}
          </Suspense>
        </main>
      )}
    </div>
  );
}

export default function Dashboard() {
  return (
    <DashboardProvider>
      <DashboardInner />
    </DashboardProvider>
  );
}
