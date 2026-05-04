import { useState, useEffect, useRef, useCallback } from "react";
import { motion } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import {
  Flame,
  Utensils,
  Dumbbell,
  Bot,
  Menu,
  X,
  Zap,
  Send,
  Trash2,
  Loader2,
  LogOut,
  Sparkles,
  BrainCircuit,
  Moon,
  Sun,
  User,
  Home,
  CalendarDays,
  ChevronDown,
  ChevronUp,
  CheckCircle2,
  MessageSquarePlus,
  ChevronLeft,
  ChevronRight,
  PanelLeftClose,
  PanelLeftOpen,
} from "lucide-react";
import { useAuth, useUser, useClerk } from "@clerk/react";
import { useTheme } from "../lib/theme";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3210";

async function apiFetch(
  path: string,
  options: RequestInit = {},
  getToken?: () => Promise<string | null>,
) {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(options.headers as Record<string, string>),
  };
  if (getToken) {
    try {
      const token = await getToken();
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }
    } catch {}
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  if (!res.ok) {
    let errorMsg = "Request failed";
    try {
      const errorData = await res.json();
      errorMsg = errorData.error || errorMsg;
    } catch {}
    throw new Error(errorMsg);
  }
  try {
    return await res.json();
  } catch {
    throw new Error("Invalid response from server");
  }
}

const navItems = [
  { icon: Home, label: "HOME" },
  { icon: Flame, label: "CALORIES" },
  { icon: Utensils, label: "MEALS" },
  { icon: Dumbbell, label: "WORKOUT" },
  { icon: CalendarDays, label: "HISTORY" },
  { icon: Bot, label: "AI COACH" },
  { icon: User, label: "PROFILE" },
];

const monthNames = [
  "JAN",
  "FEB",
  "MAR",
  "APR",
  "MAY",
  "JUN",
  "JUL",
  "AUG",
  "SEP",
  "OCT",
  "NOV",
  "DEC",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

export default function Dashboard() {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const { isDark, toggleTheme } = useTheme();
  const [activeTab, setActiveTab] = useState("HOME");
  const [menuOpen, setMenuOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const [meals, setMeals] = useState<any[] | undefined>(undefined);
  const [workouts, setWorkouts] = useState<any[] | undefined>(undefined);
  const [goals, setGoals] = useState<any>(undefined);
  const [history, setHistory] = useState<any[] | undefined>(undefined);
  const [dailyInsightsData, setDailyInsightsData] = useState<any>(undefined);
  const [weeklySummary, setWeeklySummary] = useState<any>(undefined);

  // AI Coach sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sessionMessages, setSessionMessages] = useState<any[]>([]);
  const [chatLoggedItem, setChatLoggedItem] = useState<any>(null);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const sidebarResizeRef = useRef<{
    startX: number;
    startWidth: number;
  } | null>(null);

  // History/Calendar state
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [calendarData, setCalendarData] = useState<
    Record<string, { meals: number; workouts: number; calories: number }>
  >({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [historyDayData, setHistoryDayData] = useState<{
    meals: any[];
    workouts: any[];
  } | null>(null);
  const [calendarPanelPct, setCalendarPanelPct] = useState(35);
  const resizeRef = useRef<{ startX: number; startPct: number } | null>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  // Expandable cards state
  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set(),
  );

  const fetchData = useCallback(async () => {
    try {
      const [m, w, g, h, dI, wS] = await Promise.all([
        apiFetch(`/api/meals?date=${today}`, {}, getToken),
        apiFetch(`/api/workouts?date=${today}`, {}, getToken),
        apiFetch(`/api/goals?date=${today}`, {}, getToken),
        apiFetch(`/api/progress?days=7`, {}, getToken),
        apiFetch(`/api/insights/daily?date=${today}`, {}, getToken),
        apiFetch(`/api/insights/weekly`, {}, getToken),
      ]);
      setMeals(m);
      setWorkouts(w);
      setGoals(g);
      setHistory(h);
      setDailyInsightsData(dI);
      setWeeklySummary(wS);
    } catch (e) {
      setMeals([]);
      setWorkouts([]);
      setGoals({
        calorieGoal: 2400,
        proteinGoal: 180,
        carbGoal: 280,
        fatGoal: 80,
      });
      setHistory([]);
      setDailyInsightsData({ insights: [] });
      setWeeklySummary(null);
    }
  }, [getToken, today]);

  const fetchProfile = useCallback(async () => {
    try {
      const p = await apiFetch("/api/profile", {}, getToken);
      setProfile(p);
      setProfileForm({
        weight: p.weight ? String(p.weight) : "",
        height: p.height ? String(p.height) : "",
        age: p.age ? String(p.age) : "",
        activityLevel: p.activityLevel || "moderate",
        calorieTarget: p.calorieTarget ? String(p.calorieTarget) : "",
        proteinTarget: p.proteinTarget ? String(p.proteinTarget) : "",
        carbTarget: p.carbTarget ? String(p.carbTarget) : "",
        fatTarget: p.fatTarget ? String(p.fatTarget) : "",
      });
    } catch (e) {}
  }, [getToken]);

  const fetchSessionMessages = useCallback(
    async (sessionId: string) => {
      try {
        const msgs = await apiFetch(
          `/api/chat/sessions/${sessionId}/messages`,
          {},
          getToken,
        );
        setSessionMessages(msgs);
      } catch {}
    },
    [getToken],
  );

  const fetchCalendar = useCallback(
    async (year: number, month: number) => {
      try {
        const data = await apiFetch(
          `/api/history/calendar?year=${year}&month=${month}`,
          {},
          getToken,
        );
        setCalendarData(data);
      } catch {}
    },
    [getToken],
  );

  const fetchHistoryDay = useCallback(
    async (date: string) => {
      try {
        const data = await apiFetch(
          `/api/history/day?date=${date}`,
          {},
          getToken,
        );
        setHistoryDayData(data);
      } catch {}
    },
    [getToken],
  );

  const fetchSessions = useCallback(async () => {
    try {
      const s = await apiFetch("/api/chat/sessions", {}, getToken);
      setSessions(s);
      return s;
    } catch {
      return [];
    }
  }, [getToken]);

  useEffect(() => {
    fetchData();
    fetchProfile();
  }, [fetchData, fetchProfile]);

  // Load sessions on mount and auto-select/create
  useEffect(() => {
    const initSessions = async () => {
      const s = await fetchSessions();
      if (s.length > 0) {
        setActiveSessionId(s[0].id);
      } else {
        try {
          const session = await apiFetch(
            "/api/chat/sessions",
            { method: "POST", body: "{}" },
            getToken,
          );
          setSessions([session]);
          setActiveSessionId(session.id);
        } catch {}
      }
    };
    initSessions();
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // Fetch messages when activeSessionId changes
  useEffect(() => {
    if (activeSessionId) {
      fetchSessionMessages(activeSessionId);
    }
  }, [activeSessionId, fetchSessionMessages]);

  // Load calendar when HISTORY tab is active or when year/month changes
  useEffect(() => {
    if (activeTab === "HISTORY") {
      fetchCalendar(calendarYear, calendarMonth);
    }
  }, [activeTab, calendarYear, calendarMonth, fetchCalendar]);

  // Resize handler for history calendar/details split
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !historyContainerRef.current) return;
      const containerRect = historyContainerRef.current.getBoundingClientRect();
      const dx = e.clientX - resizeRef.current.startX;
      const newPct = Math.min(
        60,
        Math.max(
          20,
          resizeRef.current.startPct + (dx / containerRect.width) * 100,
        ),
      );
      setCalendarPanelPct(newPct);
    };
    const handleMouseUp = () => {
      resizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  // Resize handler for chat sidebar
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!sidebarResizeRef.current) return;
      const dx = e.clientX - sidebarResizeRef.current.startX;
      const newWidth = Math.min(
        500,
        Math.max(180, sidebarResizeRef.current.startWidth + dx),
      );
      setSidebarWidth(newWidth);
    };
    const handleMouseUp = () => {
      sidebarResizeRef.current = null;
      document.body.style.cursor = "";
      document.body.style.userSelect = "";
    };
    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);
    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, []);

  const totalCals =
    meals?.reduce((s: number, m: any) => s + m.calories, 0) || 0;
  const totalProtein =
    meals?.reduce((s: number, m: any) => s + m.protein, 0) || 0;
  const totalCarbs = meals?.reduce((s: number, m: any) => s + m.carbs, 0) || 0;
  const totalFat = meals?.reduce((s: number, m: any) => s + m.fat, 0) || 0;
  const totalBurned = (workouts?.length || 0) * 150;

  const [mealForm, setMealForm] = useState({
    description: "",
    mealType: "breakfast",
    time: "",
  });
  const [mealLoading, setMealLoading] = useState(false);
  const [mealError, setMealError] = useState<string | null>(null);

  const [workoutForm, setWorkoutForm] = useState({
    description: "",
    duration: "",
    intensity: "HIGH",
  });
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({
    weight: "",
    height: "",
    age: "",
    activityLevel: "moderate",
    calorieTarget: "",
    proteinTarget: "",
    carbTarget: "",
    fatTarget: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileAILoading, setProfileAILoading] = useState(false);
  const [profileAIExplanation, setProfileAIExplanation] = useState<
    string | null
  >(null);

  const effectiveGoals = {
    calorieGoal: profile?.calorieTarget || goals?.calorieGoal || 2400,
    proteinGoal: profile?.proteinTarget || goals?.proteinGoal || 180,
    carbGoal: profile?.carbTarget || goals?.carbGoal || 280,
    fatGoal: profile?.fatTarget || goals?.fatGoal || 80,
  };

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [workoutSuggestion, setWorkoutSuggestion] = useState<any>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages]);

  const handleLogMeal = async () => {
    if (!mealForm.description.trim()) {
      setMealError("DESCRIPTION REQUIRED");
      return;
    }
    setMealLoading(true);
    setMealError(null);
    try {
      await apiFetch(
        "/api/ai/log-meal",
        {
          method: "POST",
          body: JSON.stringify({
            description: mealForm.description,
            mealType: mealForm.mealType,
            time:
              mealForm.time ||
              new Date().toLocaleTimeString("en-US", {
                hour: "2-digit",
                minute: "2-digit",
                hour12: false,
              }),
          }),
        },
        getToken,
      );
      setMealForm({ description: "", mealType: "breakfast", time: "" });
      await fetchData();
      try {
        await apiFetch(
          "/api/ai/daily-insights",
          { method: "POST", body: JSON.stringify({ date: today }) },
          getToken,
        );
      } catch (e) {}
    } catch (err: any) {
      setMealError(err.message || "FAILED TO LOG MEAL");
    } finally {
      setMealLoading(false);
    }
  };

  const handleDeleteMeal = async (id: string) => {
    try {
      await apiFetch(`/api/meals/${id}`, { method: "DELETE" }, getToken);
      await fetchData();
    } catch (err: any) {
      setMealError(err.message || "FAILED TO DELETE");
    }
  };

  const handleLogWorkout = async () => {
    if (!workoutForm.description.trim()) {
      setWorkoutError("DESCRIPTION REQUIRED");
      return;
    }
    setWorkoutLoading(true);
    setWorkoutError(null);
    try {
      await apiFetch(
        "/api/ai/log-workout",
        {
          method: "POST",
          body: JSON.stringify({
            description: workoutForm.description,
            duration: workoutForm.duration,
            intensity: workoutForm.intensity,
          }),
        },
        getToken,
      );
      setWorkoutForm({ description: "", duration: "", intensity: "HIGH" });
      await fetchData();
    } catch (err: any) {
      setWorkoutError(err.message || "FAILED TO LOG WORKOUT");
    } finally {
      setWorkoutLoading(false);
    }
  };

  const handleDeleteWorkout = async (id: string) => {
    try {
      await apiFetch(`/api/workouts/${id}`, { method: "DELETE" }, getToken);
      await fetchData();
    } catch (err: any) {
      setWorkoutError(err.message || "FAILED TO DELETE");
    }
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      await apiFetch(
        "/api/profile",
        {
          method: "POST",
          body: JSON.stringify({
            weight: profileForm.weight ? Number(profileForm.weight) : null,
            height: profileForm.height ? Number(profileForm.height) : null,
            age: profileForm.age ? Number(profileForm.age) : null,
            activityLevel: profileForm.activityLevel,
            calorieTarget: profileForm.calorieTarget
              ? Number(profileForm.calorieTarget)
              : null,
            proteinTarget: profileForm.proteinTarget
              ? Number(profileForm.proteinTarget)
              : null,
            carbTarget: profileForm.carbTarget
              ? Number(profileForm.carbTarget)
              : null,
            fatTarget: profileForm.fatTarget
              ? Number(profileForm.fatTarget)
              : null,
          }),
        },
        getToken,
      );
      setProfileSuccess(true);
      await fetchProfile();
      setTimeout(() => setProfileSuccess(false), 2000);
    } catch (err: any) {
      setProfileError(err.message || "FAILED TO SAVE PROFILE");
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAIFillProfile = async () => {
    if (!profileForm.weight || !profileForm.height || !profileForm.age) {
      setProfileError("ENTER WEIGHT, HEIGHT, AND AGE FIRST");
      return;
    }
    setProfileAILoading(true);
    setProfileError(null);
    setProfileAIExplanation(null);
    try {
      const result = await apiFetch(
        "/api/ai/profile-macros",
        {
          method: "POST",
          body: JSON.stringify({
            weight: Number(profileForm.weight),
            height: Number(profileForm.height),
            age: Number(profileForm.age),
            activityLevel: profileForm.activityLevel,
          }),
        },
        getToken,
      );
      setProfileForm((prev) => ({
        ...prev,
        calorieTarget: String(result.calories),
        proteinTarget: String(result.protein),
        carbTarget: String(result.carbs),
        fatTarget: String(result.fat),
      }));
      setProfileAIExplanation(result.explanation || null);
    } catch (err: any) {
      setProfileError(err.message || "AI CALCULATION FAILED");
    } finally {
      setProfileAILoading(false);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await apiFetch(
        "/api/chat/sessions",
        { method: "POST", body: "{}" },
        getToken,
      );
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } catch {}
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await apiFetch(
        `/api/chat/sessions/${id}`,
        { method: "DELETE" },
        getToken,
      );
      setSessions((prev) => prev.filter((s) => s.id !== id));
      if (activeSessionId === id) {
        const remaining = sessions.filter((s) => s.id !== id);
        if (remaining.length > 0) {
          setActiveSessionId(remaining[0].id);
        } else {
          setActiveSessionId(null);
        }
      }
    } catch {}
  };

  const handleClearChat = async () => {
    if (!activeSessionId) return;
    try {
      await apiFetch(
        `/api/chat/sessions/${activeSessionId}`,
        { method: "DELETE" },
        getToken,
      );
      setSessionMessages([]);
    } catch {}
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeSessionId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSessionMessages((prev) => [
      ...prev,
      { role: "human", content: userMsg },
    ]);
    setChatLoading(true);
    setChatError("");
    try {
      const response = await apiFetch(
        "/api/ai/chat",
        {
          method: "POST",
          body: JSON.stringify({
            message: userMsg,
            sessionId: activeSessionId,
          }),
        },
        getToken,
      );
      setSessionMessages((prev) => [
        ...prev,
        { role: "ai", content: response.reply },
      ]);
      if (response.loggedItem) {
        setChatLoggedItem(response.loggedItem);
        fetchData();
        setTimeout(() => setChatLoggedItem(null), 6000);
      }
    } catch (e: any) {
      setChatError(e.message || "Failed to send message");
    } finally {
      setChatLoading(false);
    }
  };

  const handlePrevMonth = () => {
    let newMonth = calendarMonth - 1;
    let newYear = calendarYear;
    if (newMonth === 0) {
      newMonth = 12;
      newYear -= 1;
    }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    setSelectedDate(null);
    setHistoryDayData(null);
  };

  const handleNextMonth = () => {
    let newMonth = calendarMonth + 1;
    let newYear = calendarYear;
    if (newMonth === 13) {
      newMonth = 1;
      newYear += 1;
    }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    setSelectedDate(null);
    setHistoryDayData(null);
  };

  const handleGenerateWorkoutSuggestion = async () => {
    setSuggestionLoading(true);
    try {
      const result = await apiFetch(
        "/api/ai/workout-suggestion",
        { method: "POST", body: "{}" },
        getToken,
      );
      setWorkoutSuggestion(result);
    } catch (err: any) {
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleGenerateWeeklySummary = async () => {
    setWeeklyLoading(true);
    try {
      const result = await apiFetch(
        "/api/ai/weekly-summary",
        { method: "POST", body: "{}" },
        getToken,
      );
      setWeeklySummary(result);
    } catch (err: any) {
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleGenerateInsights = async () => {
    setInsightsLoading(true);
    try {
      const result = await apiFetch(
        "/api/ai/daily-insights",
        { method: "POST", body: JSON.stringify({ date: today }) },
        getToken,
      );
      setDailyInsightsData(result);
    } catch (err: any) {
    } finally {
      setInsightsLoading(false);
    }
  };

  const isLoading =
    meals === undefined || workouts === undefined || goals === undefined;

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
              ? "flex flex-col overflow-hidden w-full"
              : activeTab === "HISTORY"
                ? "flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-4"
                : "overflow-auto max-w-7xl mx-auto w-full p-4"
          }`}
        >
          {activeTab === "HOME" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-2">
                  WELCOME BACK, {user?.firstName?.toUpperCase() || "OPERATOR"}
                </h2>
                <p className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-6">
                  {new Date().toLocaleDateString("en-US", {
                    weekday: "long",
                    month: "long",
                    day: "numeric",
                  })}
                </p>

                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      CALORIES
                    </div>
                    <div className="text-3xl font-black">
                      {totalCals}
                      <span className="text-lg text-neutral-400 dark:text-gray-500">
                        /{effectiveGoals.calorieGoal}
                      </span>
                    </div>
                    <div className="mt-2 h-2 border border-black dark:border-gray-700 bg-white dark:bg-gray-900 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, (totalCals / effectiveGoals.calorieGoal) * 100)}%`,
                        }}
                        transition={{ duration: 1 }}
                        className="h-full bg-red-600 rounded-full"
                      />
                    </div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      PROTEIN
                    </div>
                    <div className="text-3xl font-black">
                      {totalProtein}
                      <span className="text-lg text-neutral-400 dark:text-gray-500">
                        /{effectiveGoals.proteinGoal}g
                      </span>
                    </div>
                    <div className="mt-2 h-2 border border-black dark:border-gray-700 bg-white dark:bg-gray-900 rounded-full overflow-hidden">
                      <motion.div
                        initial={{ width: 0 }}
                        animate={{
                          width: `${Math.min(100, (totalProtein / effectiveGoals.proteinGoal) * 100)}%`,
                        }}
                        transition={{ duration: 1, delay: 0.2 }}
                        className="h-full bg-black dark:bg-gray-100 rounded-full"
                      />
                    </div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      MEALS TODAY
                    </div>
                    <div className="text-3xl font-black">
                      {meals?.length || 0}
                    </div>
                    <div className="text-xs font-bold mt-2 text-neutral-500 dark:text-gray-400">
                      ENTRIES
                    </div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      WORKOUTS
                    </div>
                    <div className="text-3xl font-black">
                      {workouts?.length || 0}
                    </div>
                    <div className="text-xs font-bold mt-2 text-neutral-500 dark:text-gray-400">
                      SESSIONS
                    </div>
                  </div>
                </div>

                {meals && meals.length > 0 && (
                  <div className="mb-6">
                    <h3 className="text-sm font-bold mb-3 border-b-2 border-black dark:border-gray-700 pb-2">
                      TODAY'S MEALS
                    </h3>
                    <div className="space-y-2">
                      {meals.slice(0, 3).map((meal: any) => (
                        <div
                          key={meal._id}
                          className="flex items-center justify-between border-2 border-black dark:border-gray-700 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold bg-black dark:bg-gray-100 text-white dark:text-gray-950 px-2 py-1">
                              {meal.time}
                            </span>
                            <span className="text-sm font-bold">
                              {meal.name}
                            </span>
                          </div>
                          <span className="text-sm font-bold text-red-600">
                            {meal.calories} KCAL
                          </span>
                        </div>
                      ))}
                      {meals.length > 3 && (
                        <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 text-center py-2">
                          +{meals.length - 3} MORE MEALS —{" "}
                          <button
                            onClick={() => setActiveTab("MEALS")}
                            className="underline hover:text-red-600"
                          >
                            VIEW ALL
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {workouts && workouts.length > 0 && (
                  <div>
                    <h3 className="text-sm font-bold mb-3 border-b-2 border-black dark:border-gray-700 pb-2">
                      TODAY'S TRAINING
                    </h3>
                    <div className="space-y-2">
                      {workouts.slice(0, 3).map((w: any) => (
                        <div
                          key={w._id}
                          className="flex items-center justify-between border-2 border-black dark:border-gray-700 p-4"
                        >
                          <div className="flex items-center gap-3">
                            <span
                              className={`text-xs font-bold px-2 py-1 border border-black dark:border-gray-700 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950" : ""}`}
                            >
                              {w.intensity}
                            </span>
                            <span className="text-sm font-bold">{w.name}</span>
                          </div>
                          <span className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                            {w.duration || "-"}
                          </span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {(!meals || meals.length === 0) &&
                  (!workouts || workouts.length === 0) && (
                    <div className="border-2 border-dashed border-neutral-300 dark:border-gray-600 p-12 text-center">
                      <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-4">
                        NO DATA LOGGED YET TODAY.
                      </div>
                      <div className="flex gap-3 justify-center">
                        <button
                          onClick={() => setActiveTab("MEALS")}
                          className="px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors"
                        >
                          LOG MEAL →
                        </button>
                        <button
                          onClick={() => setActiveTab("WORKOUT")}
                          className="px-4 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
                        >
                          LOG WORKOUT →
                        </button>
                      </div>
                    </div>
                  )}
              </div>
            </motion.div>
          )}

          {activeTab === "CALORIES" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-3xl font-black tracking-tighter">
                    DAILY ENERGY BALANCE
                  </h2>
                  <button
                    onClick={handleGenerateInsights}
                    disabled={insightsLoading}
                    className="flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {insightsLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    AI INSIGHTS
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      CONSUMED
                    </div>
                    <div className="text-4xl font-black">{totalCals}</div>
                    <div className="text-xs font-bold mt-2 text-red-600">
                      KCAL
                    </div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      GOAL
                    </div>
                    <div className="text-4xl font-black">
                      {effectiveGoals.calorieGoal}
                    </div>
                    <div className="text-xs font-bold mt-2 text-neutral-400 dark:text-gray-500">
                      KCAL
                    </div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-6">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
                      BURNED
                    </div>
                    <div className="text-4xl font-black">{totalBurned}</div>
                    <div className="text-xs font-bold mt-2 text-red-600">
                      KCAL
                    </div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-6 bg-neutral-900 dark:bg-gray-200 text-white dark:text-gray-950">
                    <div className="text-xs font-bold text-neutral-400 dark:text-gray-500 mb-1">
                      REMAINING
                    </div>
                    <div className="text-4xl font-black">
                      {Math.max(0, effectiveGoals.calorieGoal - totalCals)}
                    </div>
                    <div className="text-xs font-bold mt-2 text-red-400 dark:text-red-600">
                      KCAL
                    </div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 border-2 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-xl font-black mb-4">
                    MACRONUTRIENT BREAKDOWN
                  </h3>
                  <div className="space-y-4">
                    {[
                      {
                        label: "PROTEIN",
                        val: totalProtein,
                        max: effectiveGoals.proteinGoal,
                        unit: "G",
                        color: "bg-red-600",
                      },
                      {
                        label: "CARBS",
                        val: totalCarbs,
                        max: effectiveGoals.carbGoal,
                        unit: "G",
                        color: "bg-black dark:bg-gray-100",
                      },
                      {
                        label: "FATS",
                        val: totalFat,
                        max: effectiveGoals.fatGoal,
                        unit: "G",
                        color: "bg-neutral-400 dark:bg-gray-500",
                      },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="flex justify-between text-sm font-bold mb-1">
                          <span>{m.label}</span>
                          <span>
                            {m.val}/{m.max}
                            {m.unit}
                          </span>
                        </div>
                        <div className="h-6 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900 rounded-full overflow-hidden">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{
                              width: `${Math.min(100, (m.val / m.max) * 100)}%`,
                            }}
                            transition={{ duration: 1, ease: "easeOut" }}
                            className={`h-full rounded-full ${m.color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-xl font-black mb-4">AI DAILY INSIGHTS</h3>
                  {dailyInsightsData?.insights?.length > 0 ? (
                    <div className="space-y-3">
                      {dailyInsightsData.insights.map((insight, i) => (
                        <div
                          key={i}
                          className="flex items-start gap-2 text-sm font-bold"
                        >
                          <BrainCircuit
                            size={16}
                            className="text-red-600 mt-0.5 shrink-0"
                          />
                          <span>{insight}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                      NO INSIGHTS YET. LOG MEALS AND GENERATE AI ANALYSIS.
                    </div>
                  )}
                </div>
              </div>

              <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black">WEEKLY AI SUMMARY</h3>
                  <button
                    onClick={handleGenerateWeeklySummary}
                    disabled={weeklyLoading}
                    className="flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {weeklyLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    GENERATE
                  </button>
                </div>
                {weeklySummary ? (
                  <p className="text-sm font-bold leading-relaxed">
                    {weeklySummary.content}
                  </p>
                ) : (
                  <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                    NO WEEKLY SUMMARY GENERATED YET.
                  </div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === "MEALS" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-6">
                  MEAL LOG
                </h2>
                <div className="border-2 border-black dark:border-gray-700 p-6 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
                  <h3 className="text-sm font-bold mb-3">
                    LOG NEW MEAL — AI POWERED
                  </h3>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <select
                        value={mealForm.mealType}
                        onChange={(e) =>
                          setMealForm({ ...mealForm, mealType: e.target.value })
                        }
                        className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      >
                        <option value="breakfast">BREAKFAST</option>
                        <option value="lunch">LUNCH</option>
                        <option value="snack">SNACK</option>
                        <option value="dinner">DINNER</option>
                      </select>
                      <input
                        placeholder="Time (HH:MM)"
                        value={mealForm.time}
                        onChange={(e) =>
                          setMealForm({ ...mealForm, time: e.target.value })
                        }
                        className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 flex-1"
                      />
                    </div>
                    <textarea
                      placeholder="Describe your meal — what you ate, how it was prepared, portion size, ingredients... AI will estimate the macros for you."
                      value={mealForm.description}
                      onChange={(e) =>
                        setMealForm({
                          ...mealForm,
                          description: e.target.value,
                        })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 resize-none"
                    />
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleLogMeal}
                      disabled={mealLoading || !mealForm.description.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {mealLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      AI LOG MEAL
                    </button>
                  </div>
                  {mealError && (
                    <div className="mt-3 p-4 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
                      {mealError}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {meals?.length === 0 && (
                    <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 border-2 border-dashed border-neutral-300 dark:border-gray-600 p-8 text-center">
                      NO MEALS LOGGED TODAY. DESCRIBE YOUR MEAL ABOVE AND LET AI
                      HANDLE THE REST.
                    </div>
                  )}
                  {meals?.map((meal) => (
                    <div
                      key={meal._id}
                      className="border-2 border-black dark:border-gray-700 p-4 hover:bg-neutral-50 dark:hover:bg-gray-900 transition-colors"
                    >
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3 flex-wrap">
                            <span className="text-xs font-bold bg-black dark:bg-gray-100 text-white dark:text-gray-950 px-2 py-1">
                              {meal.time}
                            </span>
                            {meal.mealType &&
                              meal.mealType !== "unspecified" && (
                                <span className="text-xs font-bold border-2 border-black dark:border-gray-700 px-2 py-1 uppercase">
                                  {meal.mealType}
                                </span>
                              )}
                            <h3 className="text-lg font-black">{meal.name}</h3>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm font-bold text-neutral-600 dark:text-gray-400">
                            <span className="flex items-center gap-1">
                              <Flame size={14} /> {meal.calories} KCAL
                            </span>
                            <span>P: {meal.protein}G</span>
                            <span>C: {meal.carbs}G</span>
                            <span>F: {meal.fat}G</span>
                          </div>
                        </div>
                        <button
                          onClick={() => handleDeleteMeal(meal._id)}
                          className="p-2 border-2 border-black dark:border-gray-700 hover:bg-red-600 hover:text-white transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                      {meal.aiSuggestion && (
                        <div className="mt-3 p-3 border-2 border-red-600 bg-red-50 dark:bg-red-950">
                          <div className="flex items-center gap-2 text-xs font-bold text-red-700 dark:text-red-400">
                            <Zap size={14} />
                            <span>AI NOTE: {meal.aiSuggestion}</span>
                          </div>
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "WORKOUT" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
            >
              <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-6">
                  TRAINING LOG
                </h2>
                <div className="border-2 border-black dark:border-gray-700 p-6 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
                  <h3 className="text-sm font-bold mb-3">
                    LOG WORKOUT — AI POWERED
                  </h3>
                  <div className="space-y-3">
                    <textarea
                      placeholder="Describe your workout — what exercises you did, how many sets/reps, what weights... AI will structure and log it for you."
                      value={workoutForm.description}
                      onChange={(e) =>
                        setWorkoutForm({
                          ...workoutForm,
                          description: e.target.value,
                        })
                      }
                      rows={3}
                      className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 resize-none"
                    />
                    <div className="flex gap-3">
                      <input
                        placeholder="Duration (e.g. 45 min)"
                        value={workoutForm.duration}
                        onChange={(e) =>
                          setWorkoutForm({
                            ...workoutForm,
                            duration: e.target.value,
                          })
                        }
                        className="flex-1 px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600"
                      />
                      <select
                        value={workoutForm.intensity}
                        onChange={(e) =>
                          setWorkoutForm({
                            ...workoutForm,
                            intensity: e.target.value,
                          })
                        }
                        className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      >
                        <option value="LOW">LOW</option>
                        <option value="MEDIUM">MEDIUM</option>
                        <option value="HIGH">HIGH</option>
                        <option value="MAX">MAX</option>
                      </select>
                    </div>
                  </div>
                  <div className="flex gap-2 mt-3">
                    <button
                      onClick={handleLogWorkout}
                      disabled={
                        workoutLoading || !workoutForm.description.trim()
                      }
                      className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {workoutLoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      AI LOG WORKOUT
                    </button>
                  </div>
                  {workoutError && (
                    <div className="mt-3 p-4 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
                      {workoutError}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {workouts?.length === 0 && (
                    <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 border-2 border-dashed border-neutral-300 dark:border-gray-600 p-8 text-center">
                      NO WORKOUTS LOGGED TODAY. DESCRIBE YOUR SESSION ABOVE.
                    </div>
                  )}
                  {workouts?.map((w) => (
                    <div
                      key={w._id}
                      className="border-2 border-black dark:border-gray-700 p-4"
                    >
                      <div className="flex items-start justify-between gap-4">
                        <div className="flex-1">
                          <div className="flex items-center gap-3 flex-wrap">
                            <h3 className="text-lg font-black">{w.name}</h3>
                            <span
                              className={`text-xs font-bold px-2 py-1 border-2 border-black dark:border-gray-700 ${
                                w.intensity === "MAX"
                                  ? "bg-red-600 text-white"
                                  : w.intensity === "HIGH"
                                    ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950"
                                    : "bg-white dark:bg-gray-900"
                              }`}
                            >
                              {w.intensity}
                            </span>
                            {w.duration && (
                              <span className="text-xs font-bold text-neutral-500 dark:text-gray-400 border-2 border-black dark:border-gray-700 px-2 py-1">
                                {w.duration}
                              </span>
                            )}
                          </div>
                          {w.exercises && w.exercises.length > 0 ? (
                            <div className="mt-3 space-y-3">
                              {w.exercises.map((ex: any, ei: number) => (
                                <div key={ei}>
                                  <div className="text-xs font-bold text-black dark:text-gray-200 uppercase tracking-wide mb-1">
                                    {ex.name}
                                  </div>
                                  {/* New schema: sets is an array of {weight, reps} */}
                                  {Array.isArray(ex.sets) ? (
                                    <div className="ml-2 flex flex-wrap gap-x-3 gap-y-0.5">
                                      {ex.sets.map((s: any, si: number) => (
                                        <span
                                          key={si}
                                          className="text-xs text-neutral-500 dark:text-gray-400 flex items-center gap-1"
                                        >
                                          <span className="w-1 h-1 bg-red-600 rounded-full shrink-0" />
                                          {s.weight !== "cardio" ? (
                                            <>
                                              {s.weight} × {s.reps}
                                            </>
                                          ) : (
                                            <>{s.reps}</>
                                          )}
                                        </span>
                                      ))}
                                    </div>
                                  ) : (
                                    /* Legacy flat schema fallback */
                                    <div className="ml-2 text-xs text-neutral-500 dark:text-gray-400">
                                      {ex.sets} sets · {ex.reps} reps @{" "}
                                      {ex.weight}
                                    </div>
                                  )}
                                </div>
                              ))}
                            </div>
                          ) : (
                            <div className="flex gap-3 mt-2 text-xs font-bold text-neutral-500 dark:text-gray-400">
                              {w.sets && <span>SETS: {w.sets}</span>}
                              {w.weight && <span>LOAD: {w.weight}</span>}
                            </div>
                          )}
                        </div>
                        <button
                          onClick={() => handleDeleteWorkout(w._id)}
                          className="p-2 border-2 border-black dark:border-gray-700 hover:bg-red-600 hover:text-white transition-colors shrink-0"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-xl font-black mb-4">
                    AI WORKOUT SUGGESTION
                  </h3>
                  {workoutSuggestion ? (
                    <div className="space-y-3">
                      <div className="text-lg font-black">
                        {workoutSuggestion.name}
                      </div>
                      <div className="grid grid-cols-2 gap-2 text-sm font-bold">
                        <div className="border-2 border-black dark:border-gray-700 p-4">
                          SETS: {workoutSuggestion.sets}
                        </div>
                        <div className="border-2 border-black dark:border-gray-700 p-4">
                          REPS: {workoutSuggestion.reps}
                        </div>
                        <div className="border-2 border-black dark:border-gray-700 p-4">
                          WEIGHT: {workoutSuggestion.weight}
                        </div>
                        <div className="border-2 border-black dark:border-gray-700 p-4">
                          DURATION: {workoutSuggestion.duration}
                        </div>
                      </div>
                      <div className="text-xs font-bold text-neutral-600 dark:text-gray-400">
                        {workoutSuggestion.rationale}
                      </div>
                      <button
                        onClick={() => {
                          setWorkoutForm({
                            description: `${workoutSuggestion.name} - ${workoutSuggestion.sets} ${workoutSuggestion.reps} ${workoutSuggestion.weight}`,
                            duration: workoutSuggestion.duration,
                            intensity: workoutSuggestion.intensity,
                          });
                        }}
                        className="px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors"
                      >
                        USE THIS WORKOUT →
                      </button>
                    </div>
                  ) : (
                    <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-4">
                      GET A PERSONALIZED WORKOUT BASED ON YOUR RECENT ACTIVITY.
                    </div>
                  )}
                  <button
                    onClick={handleGenerateWorkoutSuggestion}
                    disabled={suggestionLoading}
                    className="flex items-center gap-2 px-4 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {suggestionLoading ? (
                      <Loader2 size={14} className="animate-spin" />
                    ) : (
                      <Sparkles size={14} />
                    )}
                    GENERATE SUGGESTION
                  </button>
                </div>
                <div className="border-2 border-red-600 p-6 bg-red-50 dark:bg-red-950 transition-colors">
                  <h3 className="text-xl font-black mb-4 text-red-700 dark:text-red-400">
                    AI COACH NOTES
                  </h3>
                  <p className="text-sm font-bold leading-relaxed text-red-700 dark:text-red-400">
                    LOG YOUR WORKOUTS WITH NATURAL LANGUAGE. DESCRIBE WHAT YOU
                    DID AND AI WILL STRUCTURE THE DATA, ESTIMATE VOLUME, AND
                    TRACK YOUR PROGRESS AUTOMATICALLY.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {/* ── HISTORY ───────────────────────────────────────────── */}
          {activeTab === "HISTORY" && (
            <motion.div
              ref={historyContainerRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col flex-1 min-h-0"
            >
              <div className="flex gap-0 border-2 border-black dark:border-gray-700 overflow-hidden flex-1 min-h-0">
                {/* LEFT PANEL: Calendar */}
                <div
                  style={{ width: `${calendarPanelPct}%` }}
                  className="shrink-0 overflow-hidden"
                >
                  <div className="h-full border-r-2 border-black dark:border-gray-700 p-4 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                      <button
                        onClick={handlePrevMonth}
                        className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <h2 className="text-base font-black">
                        {monthNames[calendarMonth - 1]} {calendarYear}
                      </h2>
                      <button
                        onClick={handleNextMonth}
                        className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 mb-1 shrink-0">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d) => (
                        <div
                          key={d}
                          className="text-center text-[10px] font-bold text-neutral-500 dark:text-gray-400 py-0.5"
                        >
                          {d}
                        </div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-0.5 shrink-0">
                      {Array.from({
                        length: getFirstDayOfMonth(calendarYear, calendarMonth),
                      }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({
                        length: getDaysInMonth(calendarYear, calendarMonth),
                      }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const dayData = calendarData[dateStr];
                        const isToday = dateStr === today;
                        const isSelected = dateStr === selectedDate;
                        return (
                          <button
                            key={day}
                            onClick={() => {
                              setSelectedDate(dateStr);
                              fetchHistoryDay(dateStr);
                            }}
                            className={`aspect-square p-0.5 border-2 transition-colors text-[11px] font-bold flex flex-col items-center justify-center gap-0
                            ${
                              isSelected
                                ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950 border-black dark:border-gray-100"
                                : isToday
                                  ? "border-red-600 text-red-600"
                                  : "border-black dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-800"
                            }`}
                          >
                            <span className="leading-none">{day}</span>
                            {dayData && (
                              <div className="flex gap-0.5 mt-px">
                                {dayData.meals > 0 && (
                                  <span className="w-1 h-1 rounded-full bg-red-600" />
                                )}
                                {dayData.workouts > 0 && (
                                  <span className="w-1 h-1 rounded-full bg-black dark:bg-gray-300" />
                                )}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 mt-3 text-[10px] font-bold text-neutral-500 dark:text-gray-400 shrink-0">
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-red-600" />{" "}
                        MEALS
                      </span>
                      <span className="flex items-center gap-1">
                        <span className="w-1.5 h-1.5 rounded-full bg-black dark:bg-gray-300" />{" "}
                        WORKOUTS
                      </span>
                    </div>
                  </div>
                </div>

                {/* RESIZE HANDLE */}
                <div
                  className="w-2 shrink-0 cursor-col-resize hover:bg-red-600 active:bg-red-600 transition-colors bg-neutral-200 dark:bg-gray-700 flex items-center justify-center"
                  onMouseDown={(e) => {
                    resizeRef.current = {
                      startX: e.clientX,
                      startPct: calendarPanelPct,
                    };
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                  }}
                >
                  <div className="w-0.5 h-8 rounded-full bg-neutral-400 dark:bg-gray-500" />
                </div>

                {/* RIGHT PANEL: Day detail */}
                <div className="flex-1 min-w-0 overflow-y-auto">
                  {selectedDate && historyDayData ? (
                    <>
                      <h3 className="text-lg font-black mb-4">
                        {new Date(
                          selectedDate + "T12:00:00",
                        ).toLocaleDateString("en-US", {
                          weekday: "long",
                          month: "long",
                          day: "numeric",
                          year: "numeric",
                        })}
                      </h3>

                      {historyDayData.meals.length > 0 && (
                        <div className="mb-6">
                          <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-3">
                            MEALS
                          </div>
                          <div className="space-y-2">
                            {historyDayData.meals.map((m: any) => (
                              <div
                                key={m._id}
                                className="flex items-center justify-between border-2 border-black dark:border-gray-700 p-4"
                              >
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-bold bg-black dark:bg-gray-100 text-white dark:text-gray-950 px-2 py-0.5">
                                    {m.time}
                                  </span>
                                  {m.mealType &&
                                    m.mealType !== "unspecified" && (
                                      <span className="text-xs font-bold border border-black dark:border-gray-700 px-1.5 py-0.5">
                                        {m.mealType.toUpperCase()}
                                      </span>
                                    )}
                                  <span className="text-sm font-bold">
                                    {m.name}
                                  </span>
                                </div>
                                <span className="text-sm font-bold text-red-600">
                                  {m.calories} kcal
                                </span>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mt-2">
                            TOTAL:{" "}
                            {historyDayData.meals.reduce(
                              (s: number, m: any) => s + m.calories,
                              0,
                            )}{" "}
                            kcal · P:{" "}
                            {historyDayData.meals.reduce(
                              (s: number, m: any) => s + m.protein,
                              0,
                            )}
                            g · C:{" "}
                            {historyDayData.meals.reduce(
                              (s: number, m: any) => s + m.carbs,
                              0,
                            )}
                            g · F:{" "}
                            {historyDayData.meals.reduce(
                              (s: number, m: any) => s + m.fat,
                              0,
                            )}
                            g
                          </div>
                        </div>
                      )}

                      {historyDayData.workouts.length > 0 && (
                        <div>
                          <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-3">
                            WORKOUTS
                          </div>
                          <div className="space-y-2">
                            {historyDayData.workouts.map((w: any) => (
                              <div
                                key={w._id}
                                className="border-2 border-black dark:border-gray-700 p-4"
                              >
                                <div className="flex items-center gap-2">
                                  <span
                                    className={`text-xs font-bold px-2 py-0.5 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950" : "border border-black dark:border-gray-700"}`}
                                  >
                                    {w.intensity}
                                  </span>
                                  <span className="text-sm font-bold">
                                    {w.name}
                                  </span>
                                  {w.duration && (
                                    <span className="text-xs text-neutral-500 dark:text-gray-400">
                                      {w.duration}
                                    </span>
                                  )}
                                </div>
                                {w.exercises && w.exercises.length > 0 && (
                                  <div className="mt-2 text-xs text-neutral-500 dark:text-gray-400">
                                    {w.exercises
                                      .map((ex: any) => ex.name)
                                      .join(" · ")}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {historyDayData.meals.length === 0 &&
                        historyDayData.workouts.length === 0 && (
                          <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                            No data logged for this day.
                          </div>
                        )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 text-center">
                        {selectedDate
                          ? "LOADING..."
                          : "SELECT A DATE FROM THE CALENDAR TO VIEW DETAILS."}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ── AI COACH ──────────────────────────────────────────── */}
          {activeTab === "AI COACH" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 min-h-0 flex overflow-hidden"
            >
              {/* LEFT PANEL: Sessions sidebar */}
              <div
                className="shrink-0 border-r-2 border-black dark:border-gray-700 flex flex-col overflow-hidden transition-[width] duration-200"
                style={{ width: sessionsPanelOpen ? sidebarWidth : 0 }}
              >
                <div
                  className="p-3 border-b-2 border-black dark:border-gray-700 flex items-center justify-between shrink-0"
                  style={{ minWidth: 160 }}
                >
                  <span className="text-xs font-black tracking-wider truncate">
                    CONVERSATIONS
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={handleNewSession}
                      className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-red-600 hover:text-white transition-colors"
                    >
                      <MessageSquarePlus size={14} />
                    </button>
                    <button
                      onClick={() => setSessionsPanelOpen((p) => !p)}
                      className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-800 transition-colors"
                    >
                      <PanelLeftClose size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {sessions.map((s: any) => (
                    <button
                      key={s.id}
                      onClick={() => setActiveSessionId(s.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-black/10 dark:border-gray-800 text-xs font-bold hover:bg-neutral-100 dark:hover:bg-gray-800 transition-colors truncate block ${
                        activeSessionId === s.id
                          ? "bg-neutral-100 dark:bg-gray-800 border-l-2 border-l-red-600"
                          : ""
                      }`}
                    >
                      <div className="truncate">{s.title || "New Chat"}</div>
                      <div className="text-[10px] text-neutral-400 dark:text-gray-500 mt-0.5">
                        {new Date(
                          s.updatedAt || s.createdAt,
                        ).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* RESIZE HANDLE for sidebar */}
              {sessionsPanelOpen && (
                <div
                  className="w-1.5 shrink-0 bg-black/10 dark:bg-gray-700/50 hover:bg-red-600 dark:hover:bg-red-600 transition-colors cursor-col-resize"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    sidebarResizeRef.current = {
                      startX: e.clientX,
                      startWidth: sidebarWidth,
                    };
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                  }}
                />
              )}

              {/* MAIN AREA */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0">
                {/* Header */}
                <div className="shrink-0 px-4 py-3 border-b-2 border-black dark:border-gray-700 flex items-center gap-3">
                  {!sessionsPanelOpen && (
                    <button
                      onClick={() => setSessionsPanelOpen(true)}
                      className="p-1.5 border-2 border-black dark:border-gray-700 hover:bg-neutral-100 dark:hover:bg-gray-800 transition-colors shrink-0"
                    >
                      <PanelLeftOpen size={14} />
                    </button>
                  )}
                  <div className="w-8 h-8 bg-black dark:bg-gray-100 text-white dark:text-gray-950 flex items-center justify-center shrink-0">
                    <Bot size={16} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-black truncate">
                      {sessions.find((s: any) => s.id === activeSessionId)
                        ?.title || "STRIDE COACH"}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-bold text-red-600">
                      <span className="w-1.5 h-1.5 bg-red-600 rounded-full animate-pulse" />{" "}
                      ONLINE
                    </div>
                  </div>
                </div>

                {/* Messages area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                  {!activeSessionId && (
                    <div className="text-center py-16">
                      <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-4">
                        Select or create a conversation to start.
                      </div>
                      <button
                        onClick={handleNewSession}
                        className="px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 transition-colors"
                      >
                        + NEW CHAT
                      </button>
                    </div>
                  )}
                  {activeSessionId && sessionMessages.length === 0 && (
                    <div className="text-center py-16">
                      <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-2">
                        STRIDE COACH IS READY.
                      </div>
                      <div className="text-xs text-neutral-400 dark:text-gray-500">
                        Ask anything, or describe your meals/workouts to log
                        them directly.
                      </div>
                    </div>
                  )}
                  {sessionMessages.map((msg: any, i: number) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, y: 8 }}
                      animate={{ opacity: 1, y: 0 }}
                      className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-lg xl:max-w-3xl px-4 py-3 text-sm rounded-sm break-words ${
                          msg.role === "ai"
                            ? "bg-neutral-100 dark:bg-gray-800 border-2 border-black dark:border-gray-700 text-black dark:text-gray-100"
                            : "bg-black dark:bg-gray-100 text-white dark:text-gray-950 border-2 border-black dark:border-gray-700 font-bold"
                        }`}
                      >
                        {msg.role === "ai" ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ children }) => (
                                <h1 className="text-lg font-black tracking-tighter mb-1">
                                  {children}
                                </h1>
                              ),
                              h2: ({ children }) => (
                                <h2 className="text-base font-black tracking-tighter mb-1">
                                  {children}
                                </h2>
                              ),
                              h3: ({ children }) => (
                                <h3 className="text-sm font-black mb-1">
                                  {children}
                                </h3>
                              ),
                              ul: ({ children }) => (
                                <ul className="list-disc pl-5 my-1 space-y-0.5">
                                  {children}
                                </ul>
                              ),
                              ol: ({ children }) => (
                                <ol className="list-decimal pl-5 my-1 space-y-0.5">
                                  {children}
                                </ol>
                              ),
                              li: ({ children }) => (
                                <li className="text-sm">{children}</li>
                              ),
                              table: ({ children }) => (
                                <div className="overflow-x-auto my-2">
                                  <table className="min-w-full border-collapse border border-black/20 dark:border-gray-600">
                                    {children}
                                  </table>
                                </div>
                              ),
                              thead: ({ children }) => (
                                <thead className="bg-black/5 dark:bg-white/5">
                                  {children}
                                </thead>
                              ),
                              th: ({ children }) => (
                                <th className="border border-black/20 dark:border-gray-600 px-2 py-1 text-xs font-black text-left">
                                  {children}
                                </th>
                              ),
                              td: ({ children }) => (
                                <td className="border border-black/20 dark:border-gray-600 px-2 py-1 text-xs">
                                  {children}
                                </td>
                              ),
                              p: ({ children }) => (
                                <p className="mb-1 last:mb-0">{children}</p>
                              ),
                              strong: ({ children }) => (
                                <strong className="font-black">
                                  {children}
                                </strong>
                              ),
                              em: ({ children }) => (
                                <em className="italic">{children}</em>
                              ),
                              code: ({ children }) => (
                                <code className="bg-black/10 dark:bg-white/10 px-1 py-0.5 rounded text-xs font-mono">
                                  {children}
                                </code>
                              ),
                              blockquote: ({ children }) => (
                                <blockquote className="border-l-2 border-black/30 dark:border-gray-500 pl-3 my-1 italic">
                                  {children}
                                </blockquote>
                              ),
                            }}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          msg.content
                        )}
                      </div>
                    </motion.div>
                  ))}
                  {chatLoggedItem && (
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      className="flex justify-start"
                    >
                      <div className="max-w-sm border-2 border-green-600 bg-green-50 dark:bg-green-950 p-3 rounded-sm">
                        <div className="flex items-center gap-2 text-xs font-bold text-green-700 dark:text-green-400 mb-1">
                          <CheckCircle2 size={14} />
                          {chatLoggedItem.type === "meal"
                            ? "MEAL LOGGED"
                            : "WORKOUT LOGGED"}
                        </div>
                        {chatLoggedItem.type === "meal" &&
                          chatLoggedItem.data && (
                            <div className="text-xs text-green-700 dark:text-green-400">
                              {chatLoggedItem.data.name} ·{" "}
                              {chatLoggedItem.data.calories} kcal · P:
                              {chatLoggedItem.data.protein}g C:
                              {chatLoggedItem.data.carbs}g F:
                              {chatLoggedItem.data.fat}g
                            </div>
                          )}
                        {chatLoggedItem.type === "workout" &&
                          chatLoggedItem.data && (
                            <div className="text-xs text-green-700 dark:text-green-400">
                              {chatLoggedItem.data.name} ·{" "}
                              {chatLoggedItem.data.exercises?.length || 0}{" "}
                              exercises · {chatLoggedItem.data.intensity}
                            </div>
                          )}
                      </div>
                    </motion.div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input area */}
                <div className="p-4 border-t-2 border-black dark:border-gray-700 shrink-0">
                  {chatError && (
                    <div className="mb-2 text-xs font-bold text-red-600">
                      {chatError}
                    </div>
                  )}
                  <div className="flex items-center gap-2">
                    <input
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) =>
                        e.key === "Enter" && !e.shiftKey && handleSendChat()
                      }
                      placeholder="Describe a meal or workout, or ask anything..."
                      className="flex-1 px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600"
                    />
                    <button
                      onClick={handleSendChat}
                      disabled={
                        chatLoading || !chatInput.trim() || !activeSessionId
                      }
                      className="px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 font-bold text-sm border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {chatLoading ? (
                        <Loader2 size={16} className="animate-spin" />
                      ) : (
                        <Send size={16} />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "PROFILE" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto space-y-6"
            >
              <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-3xl font-black tracking-tighter">
                    PROFILE
                  </h2>
                  <button
                    onClick={() => openUserProfile()}
                    className="px-4 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
                  >
                    ACCOUNT SETTINGS
                  </button>
                </div>

                <div className="border-2 border-black dark:border-gray-700 p-6 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
                  <div className="flex items-center gap-5">
                    {user?.imageUrl && (
                      <img
                        src={user.imageUrl}
                        alt=""
                        className="w-20 h-20 border-2 border-black dark:border-gray-700 object-cover shrink-0"
                      />
                    )}
                    <div>
                      <h3 className="text-xl font-black">
                        {user?.fullName || "Operator"}
                      </h3>
                      <p className="text-sm font-bold text-neutral-500 dark:text-gray-400">
                        {user?.emailAddresses?.[0]?.emailAddress}
                      </p>
                      <p className="text-xs font-bold text-neutral-400 dark:text-gray-500 mt-1">
                        MEMBER SINCE{" "}
                        {user?.createdAt
                          ? new Date(user.createdAt).toLocaleDateString()
                          : "—"}
                      </p>
                    </div>
                  </div>
                </div>

                <div className="mb-6">
                  <h3 className="text-lg font-black mb-6 border-b-2 border-black dark:border-gray-700 pb-2">
                    BODY METRICS
                  </h3>
                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        WEIGHT (KG)
                      </label>
                      <input
                        type="number"
                        value={profileForm.weight}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            weight: e.target.value,
                          })
                        }
                        placeholder="75"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        HEIGHT (CM)
                      </label>
                      <input
                        type="number"
                        value={profileForm.height}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            height: e.target.value,
                          })
                        }
                        placeholder="175"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        AGE
                      </label>
                      <input
                        type="number"
                        value={profileForm.age}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            age: e.target.value,
                          })
                        }
                        placeholder="28"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    {profileForm.weight && profileForm.height && (
                      <div className="border-2 border-black dark:border-gray-700 p-6 bg-red-600 dark:bg-red-800 text-white flex flex-col justify-center">
                        <div className="text-xs font-bold text-red-200 dark:text-red-300">
                          BMI
                        </div>
                        <div className="text-3xl font-black mt-1">
                          {(
                            Number(profileForm.weight) /
                            (Number(profileForm.height) / 100) ** 2
                          ).toFixed(1)}
                        </div>
                      </div>
                    )}
                  </div>

                  <div>
                    <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                      ACTIVITY LEVEL
                    </label>
                    <select
                      value={profileForm.activityLevel}
                      onChange={(e) =>
                        setProfileForm({
                          ...profileForm,
                          activityLevel: e.target.value,
                        })
                      }
                      className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none mb-2"
                    >
                      <option value="sedentary">
                        SEDENTARY — Little to no exercise, desk job
                      </option>
                      <option value="light">
                        LIGHT — Light exercise 1-3 days/week
                      </option>
                      <option value="moderate">
                        MODERATE — Exercise 3-5 days/week
                      </option>
                      <option value="active">
                        ACTIVE — Intense exercise 6-7 days/week
                      </option>
                      <option value="intense">
                        INTENSE — Very intense daily training, physical job
                      </option>
                    </select>
                  </div>
                </div>

                <div className="mb-6">
                  <div className="flex items-center justify-between mb-6 border-b-2 border-black dark:border-gray-700 pb-2">
                    <h3 className="text-lg font-black">DAILY MACRO TARGETS</h3>
                    <button
                      onClick={handleAIFillProfile}
                      disabled={
                        profileAILoading ||
                        !profileForm.weight ||
                        !profileForm.height ||
                        !profileForm.age
                      }
                      className="flex items-center gap-2 px-4 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                    >
                      {profileAILoading ? (
                        <Loader2 size={14} className="animate-spin" />
                      ) : (
                        <Sparkles size={14} />
                      )}
                      AI CALCULATE
                    </button>
                  </div>

                  {profileAIExplanation && (
                    <div className="mb-4 p-4 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
                      AI: {profileAIExplanation}
                    </div>
                  )}

                  <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        CALORIES (KCAL)
                      </label>
                      <input
                        type="number"
                        value={profileForm.calorieTarget}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            calorieTarget: e.target.value,
                          })
                        }
                        placeholder="2400"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        PROTEIN (G)
                      </label>
                      <input
                        type="number"
                        value={profileForm.proteinTarget}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            proteinTarget: e.target.value,
                          })
                        }
                        placeholder="180"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        CARBS (G)
                      </label>
                      <input
                        type="number"
                        value={profileForm.carbTarget}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            carbTarget: e.target.value,
                          })
                        }
                        placeholder="280"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-2 text-neutral-500 dark:text-gray-400">
                        FAT (G)
                      </label>
                      <input
                        type="number"
                        value={profileForm.fatTarget}
                        onChange={(e) =>
                          setProfileForm({
                            ...profileForm,
                            fatTarget: e.target.value,
                          })
                        }
                        placeholder="80"
                        className="w-full px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex gap-4">
                  <button
                    onClick={handleSaveProfile}
                    disabled={profileLoading}
                    className="flex-1 flex items-center justify-center gap-2 px-6 py-4 bg-red-600 text-white text-sm font-bold border-2 border-red-600 hover:bg-black dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors disabled:opacity-50"
                  >
                    {profileLoading ? (
                      <Loader2 size={16} className="animate-spin" />
                    ) : (
                      "SAVE METRICS & TARGETS"
                    )}
                  </button>
                  <button
                    onClick={() => openUserProfile()}
                    className="flex items-center gap-2 px-6 py-4 border-2 border-black dark:border-gray-700 text-sm font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors"
                  >
                    MANAGE ACCOUNT
                  </button>
                </div>

                {profileError && (
                  <div className="mt-4 p-3 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
                    {profileError}
                  </div>
                )}
                {profileSuccess && (
                  <div className="mt-4 p-3 border-2 border-green-600 bg-green-50 dark:bg-green-950 text-xs font-bold text-green-700 dark:text-green-400">
                    PROFILE SAVED SUCCESSFULLY
                  </div>
                )}

                {(profile?.weight || profile?.height) && (
                  <div className="border-2 border-black dark:border-gray-700 p-6 mt-8 bg-neutral-50 dark:bg-gray-900">
                    <h3 className="text-sm font-bold mb-4">
                      CURRENT SAVED PROFILE
                    </h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 text-sm font-bold">
                      {profile.weight && (
                        <div>
                          WEIGHT:{" "}
                          <span className="text-red-600">
                            {profile.weight} KG
                          </span>
                        </div>
                      )}
                      {profile.height && (
                        <div>
                          HEIGHT:{" "}
                          <span className="text-red-600">
                            {profile.height} CM
                          </span>
                        </div>
                      )}
                      {profile.age && (
                        <div>
                          AGE:{" "}
                          <span className="text-red-600">{profile.age}</span>
                        </div>
                      )}
                      <div>
                        ACTIVITY:{" "}
                        <span className="text-red-600">
                          {profile.activityLevel?.toUpperCase()}
                        </span>
                      </div>
                      {profile.calorieTarget && (
                        <div>
                          CAL TARGET:{" "}
                          <span className="text-red-600">
                            {profile.calorieTarget} KCAL
                          </span>
                        </div>
                      )}
                      {profile.proteinTarget && (
                        <div>
                          PROTEIN:{" "}
                          <span className="text-red-600">
                            {profile.proteinTarget}G
                          </span>
                        </div>
                      )}
                      {profile.carbTarget && (
                        <div>
                          CARBS:{" "}
                          <span className="text-red-600">
                            {profile.carbTarget}G
                          </span>
                        </div>
                      )}
                      {profile.fatTarget && (
                        <div>
                          FAT:{" "}
                          <span className="text-red-600">
                            {profile.fatTarget}G
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>
            </motion.div>
          )}
        </main>
      )}
    </div>
  );
}
