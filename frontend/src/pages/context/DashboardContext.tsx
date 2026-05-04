import React, { createContext, useContext, useState, useEffect, useRef, useCallback } from "react";
import { useAuth, useUser, useClerk } from "@clerk/react";
import { useTheme } from "../../lib/theme";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3210";

function monthNames() {
  return ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];
}

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

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

interface DashboardContextType {
  // Auth
  getToken: () => Promise<string | null>;
  signOut: () => void;
  user: ReturnType<typeof useUser>["user"];
  openUserProfile: () => void;

  // Theme
  isDark: boolean;
  toggleTheme: () => void;

  // Navigation
  activeTab: string;
  setActiveTab: (tab: string) => void;
  menuOpen: boolean;
  setMenuOpen: (open: boolean) => void;

  // Data
  today: string;
  meals: any[] | undefined;
  workouts: any[] | undefined;
  goals: any;
  history: any[] | undefined;
  dailyInsightsData: any;
  weeklySummary: any;

  // Computed
  totalCals: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  totalBurned: number;
  effectiveGoals: {
    calorieGoal: number;
    proteinGoal: number;
    carbGoal: number;
    fatGoal: number;
  };

  // Fetch functions
  fetchData: () => Promise<void>;
  fetchProfile: () => Promise<void>;
  fetchSessions: () => Promise<any[]>;
  fetchSessionMessages: (sessionId: string) => Promise<void>;
  fetchCalendar: (year: number, month: number) => Promise<void>;
  fetchHistoryDay: (date: string) => Promise<void>;

  // Meal form
  mealForm: { description: string; mealType: string; time: string };
  setMealForm: React.Dispatch<
    React.SetStateAction<{
      description: string;
      mealType: string;
      time: string;
    }>
  >;
  mealLoading: boolean;
  mealError: string | null;
  handleLogMeal: () => Promise<void>;
  handleDeleteMeal: (id: string) => Promise<void>;

  // Workout form
  workoutForm: { description: string; duration: string; intensity: string };
  setWorkoutForm: React.Dispatch<
    React.SetStateAction<{
      description: string;
      duration: string;
      intensity: string;
    }>
  >;
  workoutLoading: boolean;
  workoutError: string | null;
  handleLogWorkout: () => Promise<void>;
  handleDeleteWorkout: (id: string) => Promise<void>;
  workoutSuggestion: any;
  suggestionLoading: boolean;
  handleGenerateWorkoutSuggestion: () => Promise<void>;

  // Profile
  profile: any;
  profileForm: {
    weight: string;
    height: string;
    age: string;
    activityLevel: string;
    calorieTarget: string;
    proteinTarget: string;
    carbTarget: string;
    fatTarget: string;
  };
  setProfileForm: React.Dispatch<
    React.SetStateAction<{
      weight: string;
      height: string;
      age: string;
      activityLevel: string;
      calorieTarget: string;
      proteinTarget: string;
      carbTarget: string;
      fatTarget: string;
    }>
  >;
  profileLoading: boolean;
  profileError: string | null;
  profileSuccess: boolean;
  profileAILoading: boolean;
  profileAIExplanation: string | null;
  handleSaveProfile: () => Promise<void>;
  handleAIFillProfile: () => Promise<void>;

  // AI Coach
  sessions: any[];
  activeSessionId: string | null;
  setActiveSessionId: (id: string | null) => void;
  sessionsPanelOpen: boolean;
  setSessionsPanelOpen: (open: boolean) => void;
  sessionMessages: any[];
  chatLoggedItem: any;
  sidebarWidth: number;
  setSidebarWidth: (w: number) => void;
  sidebarResizeRef: React.MutableRefObject<{
    startX: number;
    startWidth: number;
  } | null>;
  chatInput: string;
  setChatInput: (s: string) => void;
  chatLoading: boolean;
  chatError: string;
  chatEndRef: React.MutableRefObject<HTMLDivElement | null>;
  handleNewSession: () => Promise<void>;
  handleDeleteSession: (id: string) => Promise<void>;
  handleClearChat: () => Promise<void>;
  handleSendChat: () => Promise<void>;

  // History
  calendarYear: number;
  setCalendarYear: (y: number) => void;
  calendarMonth: number;
  setCalendarMonth: (m: number) => void;
  calendarData: Record<
    string,
    { meals: number; workouts: number; calories: number }
  >;
  selectedDate: string | null;
  setSelectedDate: (d: string | null) => void;
  historyDayData: { meals: any[]; workouts: any[] } | null;
  calendarPanelPct: number;
  setCalendarPanelPct: (p: number) => void;
  resizeRef: React.MutableRefObject<{
    startX: number;
    startPct: number;
  } | null>;
  historyContainerRef: React.MutableRefObject<HTMLDivElement | null>;
  handlePrevMonth: () => void;
  handleNextMonth: () => void;

  // Insights
  insightsLoading: boolean;
  weeklyLoading: boolean;
  handleGenerateInsights: () => Promise<void>;
  handleGenerateWeeklySummary: () => Promise<void>;

  // Expandable cards
  expandedMeals: Set<string>;
  setExpandedMeals: React.Dispatch<React.SetStateAction<Set<string>>>;
  expandedWorkouts: Set<string>;
  setExpandedWorkouts: React.Dispatch<React.SetStateAction<Set<string>>>;

  isLoading: boolean;

  // Helpers
  MONTH_NAMES: string[];
  getDaysInMonth: typeof getDaysInMonth;
  getFirstDayOfMonth: typeof getFirstDayOfMonth;
}

const DashboardContext = createContext<DashboardContextType | null>(null);

export function DashboardProvider({ children }: { children: React.ReactNode }) {
  const { getToken, signOut } = useAuth();
  const { user } = useUser();
  const { openUserProfile } = useClerk();
  const { isDark, toggleTheme } = useTheme();

  const MONTH_NAMES = React.useMemo(() => monthNames(), []);

  const [activeTab, setActiveTab] = useState("HOME");
  const [menuOpen, setMenuOpen] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const [meals, setMeals] = useState<any[] | undefined>(undefined);
  const [workouts, setWorkouts] = useState<any[] | undefined>(undefined);
  const [goals, setGoals] = useState<any>(undefined);
  const [history, setHistory] = useState<any[] | undefined>(undefined);
  const [dailyInsightsData, setDailyInsightsData] = useState<any>(undefined);
  const [weeklySummary, setWeeklySummary] = useState<any>(undefined);

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

  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(
    new Date().getMonth() + 1,
  );
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

  const [expandedMeals, setExpandedMeals] = useState<Set<string>>(new Set());
  const [expandedWorkouts, setExpandedWorkouts] = useState<Set<string>>(
    new Set(),
  );

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

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);

  const [workoutSuggestion, setWorkoutSuggestion] = useState<any>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  const totalCals =
    meals?.reduce((s: number, m: any) => s + m.calories, 0) || 0;
  const totalProtein =
    meals?.reduce((s: number, m: any) => s + m.protein, 0) || 0;
  const totalCarbs = meals?.reduce((s: number, m: any) => s + m.carbs, 0) || 0;
  const totalFat = meals?.reduce((s: number, m: any) => s + m.fat, 0) || 0;
  const totalBurned = (workouts?.length || 0) * 150;

  const effectiveGoals = {
    calorieGoal: profile?.calorieTarget || goals?.calorieGoal || 2400,
    proteinGoal: profile?.proteinTarget || goals?.proteinGoal || 180,
    carbGoal: profile?.carbTarget || goals?.carbGoal || 280,
    fatGoal: profile?.fatTarget || goals?.fatGoal || 80,
  };

  const isLoading =
    meals === undefined || workouts === undefined || goals === undefined;

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
    } catch {
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
    } catch {}
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

  useEffect(() => {
    if (activeSessionId) {
      fetchSessionMessages(activeSessionId);
    }
  }, [activeSessionId, fetchSessionMessages]);

  useEffect(() => {
    if (activeTab === "HISTORY") {
      fetchCalendar(calendarYear, calendarMonth);
    }
  }, [activeTab, calendarYear, calendarMonth, fetchCalendar]);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !historyContainerRef.current) return;
      const containerRect =
        historyContainerRef.current.getBoundingClientRect();
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

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages]);

  const handleLogMeal = useCallback(async () => {
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
      } catch {}
    } catch (err: any) {
      setMealError(err.message || "FAILED TO LOG MEAL");
    } finally {
      setMealLoading(false);
    }
  }, [mealForm, getToken, fetchData, today]);

  const handleDeleteMeal = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/meals/${id}`, { method: "DELETE" }, getToken);
        await fetchData();
      } catch (err: any) {
        setMealError(err.message || "FAILED TO DELETE");
      }
    },
    [getToken, fetchData],
  );

  const handleLogWorkout = useCallback(async () => {
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
  }, [workoutForm, getToken, fetchData]);

  const handleDeleteWorkout = useCallback(
    async (id: string) => {
      try {
        await apiFetch(`/api/workouts/${id}`, { method: "DELETE" }, getToken);
        await fetchData();
      } catch (err: any) {
        setWorkoutError(err.message || "FAILED TO DELETE");
      }
    },
    [getToken, fetchData],
  );

  const handleSaveProfile = useCallback(async () => {
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
  }, [profileForm, getToken, fetchProfile]);

  const handleAIFillProfile = useCallback(async () => {
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
  }, [profileForm, getToken]);

  const handleNewSession = useCallback(async () => {
    try {
      const session = await apiFetch(
        "/api/chat/sessions",
        { method: "POST", body: "{}" },
        getToken,
      );
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } catch {}
  }, [getToken]);

  const handleDeleteSession = useCallback(
    async (id: string) => {
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
    },
    [getToken, activeSessionId, sessions],
  );

  const handleClearChat = useCallback(async () => {
    if (!activeSessionId) return;
    try {
      await apiFetch(
        `/api/chat/sessions/${activeSessionId}`,
        { method: "DELETE" },
        getToken,
      );
      setSessionMessages([]);
    } catch {}
  }, [activeSessionId, getToken]);

  const handleSendChat = useCallback(async () => {
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
  }, [chatInput, activeSessionId, getToken, fetchData]);

  const handlePrevMonth = useCallback(() => {
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
  }, [calendarMonth, calendarYear]);

  const handleNextMonth = useCallback(() => {
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
  }, [calendarMonth, calendarYear]);

  const handleGenerateWorkoutSuggestion = useCallback(async () => {
    setSuggestionLoading(true);
    try {
      const result = await apiFetch(
        "/api/ai/workout-suggestion",
        { method: "POST", body: "{}" },
        getToken,
      );
      setWorkoutSuggestion(result);
    } catch {
    } finally {
      setSuggestionLoading(false);
    }
  }, [getToken]);

  const handleGenerateWeeklySummary = useCallback(async () => {
    setWeeklyLoading(true);
    try {
      const result = await apiFetch(
        "/api/ai/weekly-summary",
        { method: "POST", body: "{}" },
        getToken,
      );
      setWeeklySummary(result);
    } catch {
    } finally {
      setWeeklyLoading(false);
    }
  }, [getToken]);

  const handleGenerateInsights = useCallback(async () => {
    setInsightsLoading(true);
    try {
      const result = await apiFetch(
        "/api/ai/daily-insights",
        { method: "POST", body: JSON.stringify({ date: today }) },
        getToken,
      );
      setDailyInsightsData(result);
    } catch {
    } finally {
      setInsightsLoading(false);
    }
  }, [getToken, today]);

  const value: DashboardContextType = {
    getToken,
    signOut,
    user,
    openUserProfile,
    isDark,
    toggleTheme,
    activeTab,
    setActiveTab,
    menuOpen,
    setMenuOpen,
    today,
    meals,
    workouts,
    goals,
    history,
    dailyInsightsData,
    weeklySummary,
    totalCals,
    totalProtein,
    totalCarbs,
    totalFat,
    totalBurned,
    effectiveGoals,
    fetchData,
    fetchProfile,
    fetchSessions,
    fetchSessionMessages,
    fetchCalendar,
    fetchHistoryDay,
    mealForm,
    setMealForm,
    mealLoading,
    mealError,
    handleLogMeal,
    handleDeleteMeal,
    workoutForm,
    setWorkoutForm,
    workoutLoading,
    workoutError,
    handleLogWorkout,
    handleDeleteWorkout,
    workoutSuggestion,
    suggestionLoading,
    handleGenerateWorkoutSuggestion,
    profile,
    profileForm,
    setProfileForm,
    profileLoading,
    profileError,
    profileSuccess,
    profileAILoading,
    profileAIExplanation,
    handleSaveProfile,
    handleAIFillProfile,
    sessions,
    activeSessionId,
    setActiveSessionId,
    sessionsPanelOpen,
    setSessionsPanelOpen,
    sessionMessages,
    chatLoggedItem,
    sidebarWidth,
    setSidebarWidth,
    sidebarResizeRef,
    chatInput,
    setChatInput,
    chatLoading,
    chatError,
    chatEndRef,
    handleNewSession,
    handleDeleteSession,
    handleClearChat,
    handleSendChat,
    calendarYear,
    setCalendarYear,
    calendarMonth,
    setCalendarMonth,
    calendarData,
    selectedDate,
    setSelectedDate,
    historyDayData,
    calendarPanelPct,
    setCalendarPanelPct,
    resizeRef,
    historyContainerRef,
    handlePrevMonth,
    handleNextMonth,
    insightsLoading,
    weeklyLoading,
    handleGenerateInsights,
    handleGenerateWeeklySummary,
    expandedMeals,
    setExpandedMeals,
    expandedWorkouts,
    setExpandedWorkouts,
    isLoading,
    MONTH_NAMES,
    getDaysInMonth,
    getFirstDayOfMonth,
  };

  return (
    <DashboardContext.Provider value={value}>
      {children}
    </DashboardContext.Provider>
  );
}

export function useDashboard() {
  const ctx = useContext(DashboardContext);
  if (!ctx) throw new Error("useDashboard must be inside DashboardProvider");
  return ctx;
}
