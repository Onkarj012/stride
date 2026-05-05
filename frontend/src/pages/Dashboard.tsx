import { useState, useEffect, useRef, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
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
  Droplets,
  BedDouble,
  Trophy,
  Target,
  TrendingUp,
  Plus,
  Minus,
  ChefHat,
  BookOpen,
  BarChart3,
  Clock,
  Activity,
  Award,
  Star,
  Palette,
} from "lucide-react";
// Auth removed for UI testing
import { useTheme, colorSchemes } from "../lib/theme";

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
  { icon: Utensils, label: "MEALS" },
  { icon: Dumbbell, label: "WORKOUT" },
  { icon: ChefHat, label: "RECIPES" },
  { icon: BarChart3, label: "INSIGHTS" },
  { icon: CalendarDays, label: "HISTORY" },
  { icon: Bot, label: "AI COACH" },
  { icon: User, label: "PROFILE" },
];

const monthNames = [
  "JAN", "FEB", "MAR", "APR", "MAY", "JUN",
  "JUL", "AUG", "SEP", "OCT", "NOV", "DEC",
];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

// Badge definitions for achievements
const badges = [
  { id: 'first-meal', name: 'First Bite', icon: Utensils, description: 'Log your first meal' },
  { id: 'first-workout', name: 'First Rep', icon: Dumbbell, description: 'Complete your first workout' },
  { id: 'week-streak', name: 'Week Warrior', icon: Flame, description: '7 day logging streak' },
  { id: 'hydration-hero', name: 'Hydration Hero', icon: Droplets, description: 'Hit water goal 5 days' },
  { id: 'sleep-master', name: 'Sleep Master', icon: BedDouble, description: '8hrs sleep for a week' },
  { id: 'macro-master', name: 'Macro Master', icon: Target, description: 'Hit all macros perfectly' },
  { id: 'century', name: 'Century Club', icon: Trophy, description: 'Log 100 meals' },
  { id: 'iron-will', name: 'Iron Will', icon: Award, description: '30 day streak' },
];

export default function Dashboard() {
  // Mock auth for UI testing
  const getToken = async () => null;
  const signOut = () => console.log('Sign out clicked');
  const user = { firstName: 'Demo', fullName: 'Demo User', imageUrl: null, emailAddresses: [{ emailAddress: 'demo@stride.app' }], createdAt: new Date().toISOString() };
  const openUserProfile = () => console.log('Open profile clicked');
  const { isDark, toggleTheme, accentColor, setAccentColor } = useTheme();
  const [activeTab, setActiveTab] = useState("HOME");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const today = new Date().toISOString().split("T")[0];

  const [meals, setMeals] = useState<any[] | undefined>(undefined);
  const [workouts, setWorkouts] = useState<any[] | undefined>(undefined);
  const [goals, setGoals] = useState<any>(undefined);
  const [history, setHistory] = useState<any[] | undefined>(undefined);
  const [dailyInsightsData, setDailyInsightsData] = useState<any>(undefined);
  const [weeklySummary, setWeeklySummary] = useState<any>(undefined);

  // Water & Sleep tracking (UI state - stored locally)
  const [waterIntake, setWaterIntake] = useState(() => {
    const saved = localStorage.getItem(`water-${today}`);
    return saved ? parseInt(saved) : 0;
  });
  const [sleepHours, setSleepHours] = useState(() => {
    const saved = localStorage.getItem(`sleep-${today}`);
    return saved ? parseFloat(saved) : 0;
  });
  const waterGoal = 8; // glasses
  const sleepGoal = 8; // hours

  // Recipes state (UI only - local storage)
  const [recipes, setRecipes] = useState<any[]>(() => {
    const saved = localStorage.getItem('user-recipes');
    return saved ? JSON.parse(saved) : [];
  });
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [recipeForm, setRecipeForm] = useState({
    name: '',
    servings: '1',
    prepTime: '',
    cookTime: '',
    ingredients: '',
    instructions: '',
    notes: '',
  });

  // Unlocked badges (UI only)
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>(() => {
    const saved = localStorage.getItem('unlocked-badges');
    return saved ? JSON.parse(saved) : [];
  });

  // AI Coach sessions state
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sessionMessages, setSessionMessages] = useState<any[]>([]);
  const [chatLoggedItem, setChatLoggedItem] = useState<any>(null);
  const [sidebarWidth, setSidebarWidth] = useState(288);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // History/Calendar state
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [calendarData, setCalendarData] = useState<Record<string, { meals: number; workouts: number; calories: number }>>({});
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [historyDayData, setHistoryDayData] = useState<{ meals: any[]; workouts: any[] } | null>(null);
  const [calendarPanelPct, setCalendarPanelPct] = useState(35);
  const resizeRef = useRef<{ startX: number; startPct: number } | null>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  // Save water intake to localStorage
  useEffect(() => {
    localStorage.setItem(`water-${today}`, String(waterIntake));
  }, [waterIntake, today]);

  // Save sleep to localStorage
  useEffect(() => {
    localStorage.setItem(`sleep-${today}`, String(sleepHours));
  }, [sleepHours, today]);

  // Save recipes to localStorage
  useEffect(() => {
    localStorage.setItem('user-recipes', JSON.stringify(recipes));
  }, [recipes]);

  // Save badges to localStorage
  useEffect(() => {
    localStorage.setItem('unlocked-badges', JSON.stringify(unlockedBadges));
  }, [unlockedBadges]);

  // Check for badge unlocks
  useEffect(() => {
    const newBadges = [...unlockedBadges];
    if (meals && meals.length > 0 && !newBadges.includes('first-meal')) {
      newBadges.push('first-meal');
    }
    if (workouts && workouts.length > 0 && !newBadges.includes('first-workout')) {
      newBadges.push('first-workout');
    }
    if (waterIntake >= waterGoal && !newBadges.includes('hydration-hero')) {
      newBadges.push('hydration-hero');
    }
    if (sleepHours >= sleepGoal && !newBadges.includes('sleep-master')) {
      newBadges.push('sleep-master');
    }
    if (newBadges.length !== unlockedBadges.length) {
      setUnlockedBadges(newBadges);
    }
  }, [meals, workouts, waterIntake, sleepHours, unlockedBadges]);

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
      setGoals({ calorieGoal: 2400, proteinGoal: 180, carbGoal: 280, fatGoal: 80 });
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

  const fetchSessionMessages = useCallback(async (sessionId: string) => {
    try {
      const msgs = await apiFetch(`/api/chat/sessions/${sessionId}/messages`, {}, getToken);
      setSessionMessages(msgs);
    } catch {}
  }, [getToken]);

  const fetchCalendar = useCallback(async (year: number, month: number) => {
    try {
      const data = await apiFetch(`/api/history/calendar?year=${year}&month=${month}`, {}, getToken);
      setCalendarData(data);
    } catch {}
  }, [getToken]);

  const fetchHistoryDay = useCallback(async (date: string) => {
    try {
      const data = await apiFetch(`/api/history/day?date=${date}`, {}, getToken);
      setHistoryDayData(data);
    } catch {}
  }, [getToken]);

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
          const session = await apiFetch("/api/chat/sessions", { method: "POST", body: "{}" }, getToken);
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

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (!resizeRef.current || !historyContainerRef.current) return;
      const containerRect = historyContainerRef.current.getBoundingClientRect();
      const dx = e.clientX - resizeRef.current.startX;
      const newPct = Math.min(60, Math.max(20, resizeRef.current.startPct + (dx / containerRect.width) * 100));
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
      const newWidth = Math.min(500, Math.max(180, sidebarResizeRef.current.startWidth + dx));
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

  const totalCals = meals?.reduce((s: number, m: any) => s + m.calories, 0) || 0;
  const totalProtein = meals?.reduce((s: number, m: any) => s + m.protein, 0) || 0;
  const totalCarbs = meals?.reduce((s: number, m: any) => s + m.carbs, 0) || 0;
  const totalFat = meals?.reduce((s: number, m: any) => s + m.fat, 0) || 0;
  const totalBurned = (workouts?.length || 0) * 150;

  const [mealForm, setMealForm] = useState({ description: "", mealType: "breakfast", time: "" });
  const [mealLoading, setMealLoading] = useState(false);
  const [mealError, setMealError] = useState<string | null>(null);

  const [workoutForm, setWorkoutForm] = useState({ description: "", duration: "", intensity: "HIGH" });
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>(null);
  const [profileForm, setProfileForm] = useState({
    weight: "", height: "", age: "", activityLevel: "moderate",
    calorieTarget: "", proteinTarget: "", carbTarget: "", fatTarget: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileAILoading, setProfileAILoading] = useState(false);
  const [profileAIExplanation, setProfileAIExplanation] = useState<string | null>(null);

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
      await apiFetch("/api/ai/log-meal", {
        method: "POST",
        body: JSON.stringify({
          description: mealForm.description,
          mealType: mealForm.mealType,
          time: mealForm.time || new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
        }),
      }, getToken);
      setMealForm({ description: "", mealType: "breakfast", time: "" });
      await fetchData();
      try {
        await apiFetch("/api/ai/daily-insights", { method: "POST", body: JSON.stringify({ date: today }) }, getToken);
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
      await apiFetch("/api/ai/log-workout", {
        method: "POST",
        body: JSON.stringify({
          description: workoutForm.description,
          duration: workoutForm.duration,
          intensity: workoutForm.intensity,
        }),
      }, getToken);
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
      await apiFetch("/api/profile", {
        method: "POST",
        body: JSON.stringify({
          weight: profileForm.weight ? Number(profileForm.weight) : null,
          height: profileForm.height ? Number(profileForm.height) : null,
          age: profileForm.age ? Number(profileForm.age) : null,
          activityLevel: profileForm.activityLevel,
          calorieTarget: profileForm.calorieTarget ? Number(profileForm.calorieTarget) : null,
          proteinTarget: profileForm.proteinTarget ? Number(profileForm.proteinTarget) : null,
          carbTarget: profileForm.carbTarget ? Number(profileForm.carbTarget) : null,
          fatTarget: profileForm.fatTarget ? Number(profileForm.fatTarget) : null,
        }),
      }, getToken);
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
      const result = await apiFetch("/api/ai/profile-macros", {
        method: "POST",
        body: JSON.stringify({
          weight: Number(profileForm.weight),
          height: Number(profileForm.height),
          age: Number(profileForm.age),
          activityLevel: profileForm.activityLevel,
        }),
      }, getToken);
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
      const session = await apiFetch("/api/chat/sessions", { method: "POST", body: "{}" }, getToken);
      setSessions((prev) => [session, ...prev]);
      setActiveSessionId(session.id);
    } catch {}
  };

  const handleDeleteSession = async (id: string) => {
    try {
      await apiFetch(`/api/chat/sessions/${id}`, { method: "DELETE" }, getToken);
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

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeSessionId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    setSessionMessages((prev) => [...prev, { role: "human", content: userMsg }]);
    setChatLoading(true);
    setChatError("");
    try {
      const response = await apiFetch("/api/ai/chat", {
        method: "POST",
        body: JSON.stringify({ message: userMsg, sessionId: activeSessionId }),
      }, getToken);
      setSessionMessages((prev) => [...prev, { role: "ai", content: response.reply }]);
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
    if (newMonth === 0) { newMonth = 12; newYear -= 1; }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    setSelectedDate(null);
    setHistoryDayData(null);
  };

  const handleNextMonth = () => {
    let newMonth = calendarMonth + 1;
    let newYear = calendarYear;
    if (newMonth === 13) { newMonth = 1; newYear += 1; }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    setSelectedDate(null);
    setHistoryDayData(null);
  };

  const handleGenerateWorkoutSuggestion = async () => {
    setSuggestionLoading(true);
    try {
      const result = await apiFetch("/api/ai/workout-suggestion", { method: "POST", body: "{}" }, getToken);
      setWorkoutSuggestion(result);
    } catch (err: any) {
    } finally {
      setSuggestionLoading(false);
    }
  };

  const handleGenerateWeeklySummary = async () => {
    setWeeklyLoading(true);
    try {
      const result = await apiFetch("/api/ai/weekly-summary", { method: "POST", body: "{}" }, getToken);
      setWeeklySummary(result);
    } catch (err: any) {
    } finally {
      setWeeklyLoading(false);
    }
  };

  const handleGenerateInsights = async () => {
    setInsightsLoading(true);
    try {
      const result = await apiFetch("/api/ai/daily-insights", { method: "POST", body: JSON.stringify({ date: today }) }, getToken);
      setDailyInsightsData(result);
    } catch (err: any) {
    } finally {
      setInsightsLoading(false);
    }
  };

  const handleSaveRecipe = () => {
    if (!recipeForm.name.trim()) return;
    const newRecipe = {
      id: Date.now().toString(),
      ...recipeForm,
      createdAt: new Date().toISOString(),
    };
    setRecipes(prev => [newRecipe, ...prev]);
    setRecipeForm({ name: '', servings: '1', prepTime: '', cookTime: '', ingredients: '', instructions: '', notes: '' });
    setShowRecipeForm(false);
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const isLoading = meals === undefined || workouts === undefined || goals === undefined;

  // Card component for consistent styling
  const Card = ({ children, className = "", hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) => (
    <div className={`bg-[var(--bg-card)] border border-[var(--border-default)] rounded-none ${hover ? 'hover:-translate-y-1 hover:-translate-x-1 hover:shadow-brutal transition-all duration-200' : ''} ${className}`}>
      {children}
    </div>
  );

  // Stat card component
  const StatCard = ({ label, value, subValue, icon: Icon, accent = false }: { label: string; value: string | number; subValue?: string; icon: any; accent?: boolean }) => (
    <Card className={`p-5 ${accent ? 'border-accent border-2' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[10px] uppercase tracking-[0.2em] font-mono text-[var(--text-muted)] mb-1">{label}</div>
          <div className="text-3xl font-heading text-[var(--text-primary)]">{value}</div>
          {subValue && <div className="text-xs font-mono text-[var(--text-secondary)] mt-1">{subValue}</div>}
        </div>
        <div className={`p-2 ${accent ? 'bg-accent' : 'bg-[var(--bg-elevated)]'}`}>
          <Icon size={20} className={accent ? 'text-[var(--theme-primary-text)]' : 'text-[var(--text-secondary)]'} strokeWidth={2.5} />
        </div>
      </div>
    </Card>
  );

  // Progress bar component
  const ProgressBar = ({ value, max, color = 'accent', showLabel = true }: { value: number; max: number; color?: string; showLabel?: boolean }) => {
    const pct = Math.min(100, (value / max) * 100);
    return (
      <div className="space-y-1">
        {showLabel && (
          <div className="flex justify-between text-xs font-mono">
            <span className="text-[var(--text-secondary)]">{value}</span>
            <span className="text-[var(--text-muted)]">/ {max}</span>
          </div>
        )}
        <div className="h-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className={`h-full ${color === 'accent' ? 'bg-accent' : color}`}
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-main)] text-[var(--text-primary)] font-body transition-colors">
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-[var(--bg-main)] border-b border-[var(--border-default)]" data-testid="main-nav">
        <div className="flex items-center px-4 py-3">
          <div className="flex items-center gap-3 shrink-0">
            <div className="text-2xl font-heading tracking-tighter text-accent" data-testid="app-logo">STRIDE</div>
          </div>
          
          <div className="hidden lg:flex items-center gap-0 mx-auto">
            {navItems.map((item) => (
              <button
                key={item.label}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                onClick={() => setActiveTab(item.label)}
                className={`flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] -ml-px first:ml-0 font-mono text-xs uppercase tracking-wider transition-all ${
                  activeTab === item.label
                    ? "bg-accent text-[var(--theme-primary-text)] border-accent"
                    : "bg-[var(--bg-card)] text-[var(--text-secondary)] hover:text-[var(--text-primary)] hover:border-[var(--border-bold)]"
                }`}
              >
                <item.icon size={14} strokeWidth={2.5} />
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 shrink-0">
            {/* Color Picker Toggle */}
            <div className="relative">
              <button
                data-testid="color-picker-toggle"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="hidden lg:flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] bg-[var(--bg-card)] text-xs font-mono hover:border-accent transition-colors"
              >
                <div className="w-4 h-4 bg-accent" />
                <Palette size={14} />
              </button>
              
              <AnimatePresence>
                {showColorPicker && (
                  <motion.div
                    initial={{ opacity: 0, y: -10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    className="absolute right-0 top-full mt-2 p-3 bg-[var(--bg-card)] border border-[var(--border-default)] z-50"
                    data-testid="color-picker-dropdown"
                  >
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">ACCENT COLOR</div>
                    <div className="flex gap-2">
                      {colorSchemes.map((scheme) => (
                        <button
                          key={scheme.name}
                          data-testid={`color-${scheme.name.toLowerCase()}`}
                          onClick={() => {
                            setAccentColor(scheme.value, scheme.textColor);
                            setShowColorPicker(false);
                          }}
                          className={`w-8 h-8 transition-all ${accentColor === scheme.value ? 'ring-2 ring-white ring-offset-2 ring-offset-[var(--bg-card)]' : 'hover:scale-110'}`}
                          style={{ backgroundColor: scheme.value }}
                          title={scheme.name}
                        />
                      ))}
                    </div>
                  </motion.div>
                )}
              </AnimatePresence>
            </div>

            <button
              data-testid="theme-toggle"
              onClick={toggleTheme}
              className="hidden lg:flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] bg-[var(--bg-card)] text-xs font-mono hover:border-accent transition-colors"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
            </button>
            <button
              data-testid="logout-btn"
              onClick={() => signOut()}
              className="hidden lg:flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] bg-[var(--bg-card)] text-xs font-mono hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
            >
              <LogOut size={14} />
            </button>
            <button
              data-testid="mobile-menu-toggle"
              onClick={() => setMenuOpen(!menuOpen)}
              className="lg:hidden p-2 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"
            >
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
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
              className="lg:hidden border-t border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden"
            >
              {navItems.map((item) => (
                <button
                  key={item.label}
                  data-testid={`mobile-nav-${item.label.toLowerCase().replace(' ', '-')}`}
                  onClick={() => { setActiveTab(item.label); setMenuOpen(false); }}
                  className={`flex items-center gap-3 w-full px-4 py-3 border-b border-[var(--border-default)] font-mono text-sm ${
                    activeTab === item.label ? "bg-accent text-[var(--theme-primary-text)]" : ""
                  }`}
                >
                  <item.icon size={16} strokeWidth={2.5} />
                  {item.label}
                </button>
              ))}
              <div className="p-4 border-b border-[var(--border-default)]">
                <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">ACCENT COLOR</div>
                <div className="flex gap-2">
                  {colorSchemes.map((scheme) => (
                    <button
                      key={scheme.name}
                      onClick={() => setAccentColor(scheme.value, scheme.textColor)}
                      className={`w-8 h-8 ${accentColor === scheme.value ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: scheme.value }}
                    />
                  ))}
                </div>
              </div>
              <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-3 border-b border-[var(--border-default)] font-mono text-sm">
                {isDark ? <Sun size={16} /> : <Moon size={16} />}
                {isDark ? "LIGHT MODE" : "DARK MODE"}
              </button>
              <button onClick={() => { signOut(); setMenuOpen(false); }} className="flex items-center gap-3 w-full px-4 py-3 font-mono text-sm">
                <LogOut size={16} /> LOGOUT
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      {isLoading ? (
        <div className="flex items-center justify-center h-96" data-testid="loading-state">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-accent" />
            <div className="text-sm font-mono text-[var(--text-muted)]">INITIALIZING DATA STREAM...</div>
          </div>
        </div>
      ) : (
        <main className={`flex-1 min-h-0 ${
          activeTab === "AI COACH" ? "flex flex-col overflow-hidden w-full" :
          activeTab === "HISTORY" ? "flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-4 lg:p-6" :
          "overflow-auto max-w-7xl mx-auto w-full p-4 lg:p-6"
        }`}>

          {/* ═══════════════════════════════════════════════════════════════════
              HOME TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "HOME" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
              data-testid="home-tab"
            >
              {/* Welcome Header */}
              <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
                <div>
                  <h1 className="text-4xl lg:text-5xl font-heading uppercase tracking-tighter">
                    {user?.firstName?.toUpperCase() || "OPERATOR"}
                  </h1>
                  <p className="text-sm font-mono text-[var(--text-muted)] mt-1">
                    {new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })}
                  </p>
                </div>
                <div className="flex gap-2">
                  <button
                    data-testid="quick-log-meal"
                    onClick={() => setActiveTab("MEALS")}
                    className="flex items-center gap-2 px-4 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-all"
                  >
                    <Plus size={14} strokeWidth={3} /> LOG MEAL
                  </button>
                  <button
                    data-testid="quick-log-workout"
                    onClick={() => setActiveTab("WORKOUT")}
                    className="flex items-center gap-2 px-4 py-3 border-2 border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-all"
                  >
                    <Plus size={14} strokeWidth={3} /> LOG WORKOUT
                  </button>
                </div>
              </div>

              {/* Main Stats Grid */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="CALORIES" value={totalCals} subValue={`/ ${effectiveGoals.calorieGoal} KCAL`} icon={Flame} accent />
                <StatCard label="PROTEIN" value={`${totalProtein}g`} subValue={`/ ${effectiveGoals.proteinGoal}g`} icon={Target} />
                <StatCard label="WORKOUTS" value={workouts?.length || 0} subValue="TODAY" icon={Dumbbell} />
                <StatCard label="BURNED" value={totalBurned} subValue="KCAL" icon={Zap} />
              </div>

              {/* Water & Sleep Trackers */}
              <div className="grid lg:grid-cols-2 gap-4">
                {/* Water Tracker */}
                <Card className="p-5" data-testid="water-tracker">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <Droplets size={20} className="text-accent" strokeWidth={2.5} />
                      <span className="font-mono text-sm uppercase tracking-wider">HYDRATION</span>
                    </div>
                    <span className="font-heading text-2xl">{waterIntake}/{waterGoal}</span>
                  </div>
                  <div className="flex gap-2 mb-3">
                    {Array.from({ length: waterGoal }).map((_, i) => (
                      <button
                        key={i}
                        data-testid={`water-glass-${i}`}
                        onClick={() => setWaterIntake(i + 1)}
                        className={`flex-1 h-12 border transition-all ${
                          i < waterIntake
                            ? 'bg-accent border-accent'
                            : 'bg-[var(--bg-elevated)] border-[var(--border-default)] hover:border-accent'
                        }`}
                      />
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <button
                      data-testid="water-decrease"
                      onClick={() => setWaterIntake(Math.max(0, waterIntake - 1))}
                      className="flex-1 py-2 border border-[var(--border-default)] font-mono text-xs hover:border-accent transition-colors"
                    >
                      <Minus size={14} className="mx-auto" />
                    </button>
                    <button
                      data-testid="water-increase"
                      onClick={() => setWaterIntake(Math.min(waterGoal + 4, waterIntake + 1))}
                      className="flex-1 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs"
                    >
                      <Plus size={14} className="mx-auto" />
                    </button>
                  </div>
                </Card>

                {/* Sleep Tracker */}
                <Card className="p-5" data-testid="sleep-tracker">
                  <div className="flex items-center justify-between mb-4">
                    <div className="flex items-center gap-2">
                      <BedDouble size={20} className="text-accent" strokeWidth={2.5} />
                      <span className="font-mono text-sm uppercase tracking-wider">SLEEP</span>
                    </div>
                    <span className="font-heading text-2xl">{sleepHours}h</span>
                  </div>
                  <ProgressBar value={sleepHours} max={sleepGoal} />
                  <div className="flex gap-2 mt-3">
                    <button
                      data-testid="sleep-decrease"
                      onClick={() => setSleepHours(Math.max(0, sleepHours - 0.5))}
                      className="flex-1 py-2 border border-[var(--border-default)] font-mono text-xs hover:border-accent transition-colors"
                    >
                      -0.5H
                    </button>
                    <button
                      data-testid="sleep-increase"
                      onClick={() => setSleepHours(Math.min(12, sleepHours + 0.5))}
                      className="flex-1 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs"
                    >
                      +0.5H
                    </button>
                  </div>
                </Card>
              </div>

              {/* Macro Progress */}
              <Card className="p-5">
                <h3 className="font-heading text-xl uppercase tracking-tight mb-4">MACRO BREAKDOWN</h3>
                <div className="grid lg:grid-cols-3 gap-6">
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span>PROTEIN</span>
                      <span>{totalProtein}/{effectiveGoals.proteinGoal}g</span>
                    </div>
                    <ProgressBar value={totalProtein} max={effectiveGoals.proteinGoal} showLabel={false} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span>CARBS</span>
                      <span>{totalCarbs}/{effectiveGoals.carbGoal}g</span>
                    </div>
                    <ProgressBar value={totalCarbs} max={effectiveGoals.carbGoal} showLabel={false} />
                  </div>
                  <div>
                    <div className="flex justify-between text-xs font-mono mb-1">
                      <span>FAT</span>
                      <span>{totalFat}/{effectiveGoals.fatGoal}g</span>
                    </div>
                    <ProgressBar value={totalFat} max={effectiveGoals.fatGoal} showLabel={false} />
                  </div>
                </div>
              </Card>

              {/* Recent Activity & Badges */}
              <div className="grid lg:grid-cols-3 gap-4">
                {/* Today's Meals */}
                <Card className="p-5 lg:col-span-2">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading text-xl uppercase tracking-tight">TODAY'S MEALS</h3>
                    <button
                      onClick={() => setActiveTab("MEALS")}
                      className="text-xs font-mono text-accent hover:underline"
                    >
                      VIEW ALL
                    </button>
                  </div>
                  {meals && meals.length > 0 ? (
                    <div className="space-y-2">
                      {meals.slice(0, 3).map((meal: any) => (
                        <div key={meal._id} className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                            <span className="font-medium">{meal.name}</span>
                          </div>
                          <span className="font-mono text-accent">{meal.calories} KCAL</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-[var(--text-muted)] font-mono text-sm">
                      NO MEALS LOGGED TODAY
                    </div>
                  )}
                </Card>

                {/* Badges */}
                <Card className="p-5" data-testid="badges-widget">
                  <h3 className="font-heading text-xl uppercase tracking-tight mb-4">BADGES</h3>
                  <div className="grid grid-cols-4 gap-2">
                    {badges.slice(0, 8).map((badge) => {
                      const isUnlocked = unlockedBadges.includes(badge.id);
                      return (
                        <div
                          key={badge.id}
                          data-testid={`badge-${badge.id}`}
                          className={`aspect-square flex items-center justify-center border-2 transition-all ${
                            isUnlocked
                              ? 'border-accent bg-accent/10'
                              : 'border-[var(--border-default)] bg-[var(--bg-elevated)] opacity-40'
                          }`}
                          title={`${badge.name}: ${badge.description}`}
                        >
                          <badge.icon size={20} className={isUnlocked ? 'text-accent' : 'text-[var(--text-muted)]'} strokeWidth={2.5} />
                        </div>
                      );
                    })}
                  </div>
                  <div className="mt-3 text-xs font-mono text-[var(--text-muted)]">
                    {unlockedBadges.length}/{badges.length} UNLOCKED
                  </div>
                </Card>
              </div>

              {/* AI Insights Preview */}
              {dailyInsightsData?.insights?.length > 0 && (
                <Card className="p-5 border-l-4 border-l-accent">
                  <div className="flex items-center gap-2 mb-3">
                    <BrainCircuit size={20} className="text-accent" strokeWidth={2.5} />
                    <span className="font-heading text-lg uppercase">AI INSIGHTS</span>
                  </div>
                  <div className="space-y-2">
                    {dailyInsightsData.insights.slice(0, 2).map((insight: string, i: number) => (
                      <p key={i} className="text-sm text-[var(--text-secondary)]">{insight}</p>
                    ))}
                  </div>
                  <button
                    onClick={() => setActiveTab("INSIGHTS")}
                    className="mt-3 text-xs font-mono text-accent hover:underline"
                  >
                    VIEW ALL INSIGHTS
                  </button>
                </Card>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              MEALS TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "MEALS" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
              data-testid="meals-tab"
            >
              <h1 className="text-4xl font-heading uppercase tracking-tighter">MEAL LOG</h1>

              {/* Log Meal Form */}
              <Card className="p-6">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">LOG NEW MEAL — AI POWERED</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <select
                      data-testid="meal-type-select"
                      value={mealForm.mealType}
                      onChange={(e) => setMealForm({ ...mealForm, mealType: e.target.value })}
                      className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="breakfast">BREAKFAST</option>
                      <option value="lunch">LUNCH</option>
                      <option value="snack">SNACK</option>
                      <option value="dinner">DINNER</option>
                    </select>
                    <input
                      data-testid="meal-time-input"
                      placeholder="Time (HH:MM)"
                      value={mealForm.time}
                      onChange={(e) => setMealForm({ ...mealForm, time: e.target.value })}
                      className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                    />
                  </div>
                  <textarea
                    data-testid="meal-description-input"
                    placeholder="Describe your meal — what you ate, how it was prepared, portion size, ingredients... AI will estimate the macros for you."
                    value={mealForm.description}
                    onChange={(e) => setMealForm({ ...mealForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none"
                  />
                  <button
                    data-testid="log-meal-btn"
                    onClick={handleLogMeal}
                    disabled={mealLoading || !mealForm.description.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {mealLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    AI LOG MEAL
                  </button>
                  {mealError && (
                    <div className="p-4 border-2 border-red-600 bg-red-950/50 text-xs font-mono text-red-400">{mealError}</div>
                  )}
                </div>
              </Card>

              {/* Meals List */}
              <div className="space-y-3">
                {meals?.length === 0 && (
                  <Card className="p-8 text-center border-dashed">
                    <div className="font-mono text-sm text-[var(--text-muted)]">NO MEALS LOGGED TODAY. DESCRIBE YOUR MEAL ABOVE.</div>
                  </Card>
                )}
                {meals?.map((meal) => (
                  <Card key={meal._id} className="p-4 hover:border-accent transition-colors" data-testid={`meal-item-${meal._id}`}>
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                          {meal.mealType && meal.mealType !== "unspecified" && (
                            <span className="text-xs font-mono border border-[var(--border-default)] px-2 py-1 uppercase">{meal.mealType}</span>
                          )}
                          <h3 className="text-lg font-heading uppercase">{meal.name}</h3>
                        </div>
                        <div className="flex items-center gap-4 text-sm font-mono text-[var(--text-secondary)]">
                          <span className="flex items-center gap-1"><Flame size={14} /> {meal.calories} KCAL</span>
                          <span>P: {meal.protein}G</span>
                          <span>C: {meal.carbs}G</span>
                          <span>F: {meal.fat}G</span>
                        </div>
                      </div>
                      <button
                        data-testid={`delete-meal-${meal._id}`}
                        onClick={() => handleDeleteMeal(meal._id)}
                        className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    {meal.aiSuggestion && (
                      <div className="mt-3 p-3 border-l-4 border-accent bg-accent/10">
                        <div className="flex items-center gap-2 text-xs font-mono text-accent">
                          <Zap size={14} />
                          <span>AI NOTE: {meal.aiSuggestion}</span>
                        </div>
                      </div>
                    )}
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              WORKOUT TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "WORKOUT" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
              data-testid="workout-tab"
            >
              <h1 className="text-4xl font-heading uppercase tracking-tighter">TRAINING LOG</h1>

              {/* Log Workout Form */}
              <Card className="p-6">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">LOG WORKOUT — AI POWERED</h3>
                <div className="space-y-4">
                  <textarea
                    data-testid="workout-description-input"
                    placeholder="Describe your workout — exercises, sets, reps, weights... AI will structure it for you."
                    value={workoutForm.description}
                    onChange={(e) => setWorkoutForm({ ...workoutForm, description: e.target.value })}
                    rows={3}
                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none"
                  />
                  <div className="flex gap-3">
                    <input
                      data-testid="workout-duration-input"
                      placeholder="Duration (e.g. 45 min)"
                      value={workoutForm.duration}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, duration: e.target.value })}
                      className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                    />
                    <select
                      data-testid="workout-intensity-select"
                      value={workoutForm.intensity}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, intensity: e.target.value })}
                      className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MAX">MAX</option>
                    </select>
                  </div>
                  <button
                    data-testid="log-workout-btn"
                    onClick={handleLogWorkout}
                    disabled={workoutLoading || !workoutForm.description.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 transition-all disabled:opacity-50"
                  >
                    {workoutLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                    AI LOG WORKOUT
                  </button>
                  {workoutError && (
                    <div className="p-4 border-2 border-red-600 bg-red-950/50 text-xs font-mono text-red-400">{workoutError}</div>
                  )}
                </div>
              </Card>

              {/* AI Suggestion */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading text-xl uppercase tracking-tight">AI WORKOUT SUGGESTION</h3>
                  <button
                    data-testid="generate-workout-suggestion"
                    onClick={handleGenerateWorkoutSuggestion}
                    disabled={suggestionLoading}
                    className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors disabled:opacity-50"
                  >
                    {suggestionLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    GENERATE
                  </button>
                </div>
                {workoutSuggestion ? (
                  <div className="space-y-4">
                    <div className="text-2xl font-heading uppercase">{workoutSuggestion.name}</div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                        <div className="text-xs font-mono text-[var(--text-muted)]">SETS</div>
                        <div className="font-heading text-xl">{workoutSuggestion.sets}</div>
                      </div>
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                        <div className="text-xs font-mono text-[var(--text-muted)]">REPS</div>
                        <div className="font-heading text-xl">{workoutSuggestion.reps}</div>
                      </div>
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                        <div className="text-xs font-mono text-[var(--text-muted)]">WEIGHT</div>
                        <div className="font-heading text-xl">{workoutSuggestion.weight}</div>
                      </div>
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                        <div className="text-xs font-mono text-[var(--text-muted)]">DURATION</div>
                        <div className="font-heading text-xl">{workoutSuggestion.duration}</div>
                      </div>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)]">{workoutSuggestion.rationale}</p>
                    <button
                      onClick={() => {
                        setWorkoutForm({
                          description: `${workoutSuggestion.name} - ${workoutSuggestion.sets} ${workoutSuggestion.reps} ${workoutSuggestion.weight}`,
                          duration: workoutSuggestion.duration,
                          intensity: workoutSuggestion.intensity,
                        });
                      }}
                      className="px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase"
                    >
                      USE THIS WORKOUT
                    </button>
                  </div>
                ) : (
                  <p className="text-sm font-mono text-[var(--text-muted)]">GET A PERSONALIZED WORKOUT BASED ON YOUR RECENT ACTIVITY.</p>
                )}
              </Card>

              {/* Workouts List */}
              <div className="space-y-3">
                {workouts?.length === 0 && (
                  <Card className="p-8 text-center border-dashed">
                    <div className="font-mono text-sm text-[var(--text-muted)]">NO WORKOUTS LOGGED TODAY.</div>
                  </Card>
                )}
                {workouts?.map((w) => (
                  <Card key={w._id} className="p-4" data-testid={`workout-item-${w._id}`}>
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <h3 className="text-lg font-heading uppercase">{w.name}</h3>
                          <span className={`text-xs font-mono px-2 py-1 border ${
                            w.intensity === "MAX" ? "bg-red-600 border-red-600 text-white" :
                            w.intensity === "HIGH" ? "bg-accent border-accent text-[var(--theme-primary-text)]" :
                            "border-[var(--border-default)]"
                          }`}>
                            {w.intensity}
                          </span>
                          {w.duration && (
                            <span className="text-xs font-mono text-[var(--text-muted)]">{w.duration}</span>
                          )}
                        </div>
                        {w.exercises && w.exercises.length > 0 && (
                          <div className="space-y-2">
                            {w.exercises.map((ex: any, ei: number) => (
                              <div key={ei}>
                                <div className="text-xs font-mono text-[var(--text-secondary)] uppercase">{ex.name}</div>
                                {Array.isArray(ex.sets) && (
                                  <div className="flex flex-wrap gap-2 mt-1">
                                    {ex.sets.map((s: any, si: number) => (
                                      <span key={si} className="text-xs font-mono text-[var(--text-muted)]">
                                        {s.weight !== "cardio" ? `${s.weight} × ${s.reps}` : s.reps}
                                      </span>
                                    ))}
                                  </div>
                                )}
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                      <button
                        data-testid={`delete-workout-${w._id}`}
                        onClick={() => handleDeleteWorkout(w._id)}
                        className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                  </Card>
                ))}
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              RECIPES TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "RECIPES" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
              data-testid="recipes-tab"
            >
              <div className="flex items-center justify-between">
                <h1 className="text-4xl font-heading uppercase tracking-tighter">MY RECIPES</h1>
                <button
                  data-testid="add-recipe-btn"
                  onClick={() => setShowRecipeForm(true)}
                  className="flex items-center gap-2 px-4 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold"
                >
                  <Plus size={14} strokeWidth={3} /> NEW RECIPE
                </button>
              </div>

              {/* Recipe Form Modal */}
              <AnimatePresence>
                {showRecipeForm && (
                  <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    exit={{ opacity: 0 }}
                    className="fixed inset-0 bg-black/80 z-50 flex items-center justify-center p-4"
                    onClick={() => setShowRecipeForm(false)}
                  >
                    <motion.div
                      initial={{ scale: 0.95, opacity: 0 }}
                      animate={{ scale: 1, opacity: 1 }}
                      exit={{ scale: 0.95, opacity: 0 }}
                      className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                      onClick={(e) => e.stopPropagation()}
                      data-testid="recipe-form-modal"
                    >
                      <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
                        <h2 className="font-heading text-2xl uppercase">ADD RECIPE</h2>
                        <button onClick={() => setShowRecipeForm(false)} className="p-2 hover:bg-[var(--bg-elevated)]">
                          <X size={20} />
                        </button>
                      </div>
                      <div className="p-6 space-y-4">
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">RECIPE NAME *</label>
                          <input
                            data-testid="recipe-name-input"
                            value={recipeForm.name}
                            onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                            className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                            placeholder="e.g. High Protein Breakfast Bowl"
                          />
                        </div>
                        <div className="grid grid-cols-3 gap-4">
                          <div>
                            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">SERVINGS</label>
                            <input
                              data-testid="recipe-servings-input"
                              value={recipeForm.servings}
                              onChange={(e) => setRecipeForm({ ...recipeForm, servings: e.target.value })}
                              className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                              placeholder="1"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">PREP TIME</label>
                            <input
                              data-testid="recipe-prep-time-input"
                              value={recipeForm.prepTime}
                              onChange={(e) => setRecipeForm({ ...recipeForm, prepTime: e.target.value })}
                              className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                              placeholder="10 min"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">COOK TIME</label>
                            <input
                              data-testid="recipe-cook-time-input"
                              value={recipeForm.cookTime}
                              onChange={(e) => setRecipeForm({ ...recipeForm, cookTime: e.target.value })}
                              className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                              placeholder="15 min"
                            />
                          </div>
                        </div>
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">INGREDIENTS</label>
                          <textarea
                            data-testid="recipe-ingredients-input"
                            value={recipeForm.ingredients}
                            onChange={(e) => setRecipeForm({ ...recipeForm, ingredients: e.target.value })}
                            rows={4}
                            className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent resize-none"
                            placeholder="List ingredients with portions (one per line)&#10;e.g. 200g chicken breast&#10;1 cup rice&#10;2 tbsp olive oil"
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">INSTRUCTIONS</label>
                          <textarea
                            data-testid="recipe-instructions-input"
                            value={recipeForm.instructions}
                            onChange={(e) => setRecipeForm({ ...recipeForm, instructions: e.target.value })}
                            rows={4}
                            className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent resize-none"
                            placeholder="Step-by-step cooking method..."
                          />
                        </div>
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">NOTES (FOR AI COACH)</label>
                          <textarea
                            data-testid="recipe-notes-input"
                            value={recipeForm.notes}
                            onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })}
                            rows={2}
                            className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent resize-none"
                            placeholder="Any notes for the AI coach about this recipe..."
                          />
                        </div>
                        <button
                          data-testid="save-recipe-btn"
                          onClick={handleSaveRecipe}
                          disabled={!recipeForm.name.trim()}
                          className="w-full py-4 bg-accent text-[var(--theme-primary-text)] font-mono uppercase tracking-wider font-bold disabled:opacity-50"
                        >
                          SAVE RECIPE
                        </button>
                      </div>
                    </motion.div>
                  </motion.div>
                )}
              </AnimatePresence>

              {/* Recipes List */}
              {recipes.length === 0 ? (
                <Card className="p-12 text-center border-dashed">
                  <ChefHat size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
                  <h3 className="font-heading text-xl uppercase mb-2">NO RECIPES YET</h3>
                  <p className="text-sm font-mono text-[var(--text-muted)] mb-4">
                    Add your favorite healthy recipes for the AI coach to analyze and track.
                  </p>
                  <button
                    onClick={() => setShowRecipeForm(true)}
                    className="px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase"
                  >
                    ADD FIRST RECIPE
                  </button>
                </Card>
              ) : (
                <div className="grid lg:grid-cols-2 gap-4">
                  {recipes.map((recipe) => (
                    <Card key={recipe.id} className="overflow-hidden" data-testid={`recipe-card-${recipe.id}`}>
                      <div className="p-5">
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-heading text-xl uppercase">{recipe.name}</h3>
                          <button
                            data-testid={`delete-recipe-${recipe.id}`}
                            onClick={() => handleDeleteRecipe(recipe.id)}
                            className="p-2 hover:bg-red-600 hover:text-white transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)] mb-3">
                          {recipe.servings && <span>{recipe.servings} SERVINGS</span>}
                          {recipe.prepTime && <span><Clock size={12} className="inline mr-1" />PREP: {recipe.prepTime}</span>}
                          {recipe.cookTime && <span><Clock size={12} className="inline mr-1" />COOK: {recipe.cookTime}</span>}
                        </div>
                        {recipe.ingredients && (
                          <div className="mb-3">
                            <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-1">INGREDIENTS</div>
                            <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line line-clamp-3">{recipe.ingredients}</p>
                          </div>
                        )}
                        {recipe.notes && (
                          <div className="p-3 border-l-4 border-accent bg-accent/10 mt-3">
                            <div className="flex items-center gap-2 text-xs font-mono text-accent mb-1">
                              <BrainCircuit size={14} />
                              AI COACH NOTES
                            </div>
                            <p className="text-sm text-[var(--text-secondary)]">{recipe.notes}</p>
                          </div>
                        )}
                      </div>
                    </Card>
                  ))}
                </div>
              )}
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              INSIGHTS TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "INSIGHTS" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="space-y-6"
              data-testid="insights-tab"
            >
              <div className="flex items-center justify-between">
                <h1 className="text-4xl font-heading uppercase tracking-tighter">INSIGHTS</h1>
                <div className="flex gap-2">
                  <button
                    data-testid="generate-daily-insights"
                    onClick={handleGenerateInsights}
                    disabled={insightsLoading}
                    className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors disabled:opacity-50"
                  >
                    {insightsLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    DAILY
                  </button>
                  <button
                    data-testid="generate-weekly-summary"
                    onClick={handleGenerateWeeklySummary}
                    disabled={weeklyLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase disabled:opacity-50"
                  >
                    {weeklyLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    WEEKLY
                  </button>
                </div>
              </div>

              {/* Daily Stats Overview */}
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                <StatCard label="CALORIES" value={totalCals} subValue={`${Math.round((totalCals / effectiveGoals.calorieGoal) * 100)}% of goal`} icon={Flame} accent />
                <StatCard label="PROTEIN" value={`${totalProtein}g`} subValue={`${Math.round((totalProtein / effectiveGoals.proteinGoal) * 100)}% of goal`} icon={Target} />
                <StatCard label="HYDRATION" value={`${waterIntake}/${waterGoal}`} subValue="GLASSES" icon={Droplets} />
                <StatCard label="SLEEP" value={`${sleepHours}h`} subValue={sleepHours >= sleepGoal ? "GOAL MET" : `${sleepGoal - sleepHours}h short`} icon={BedDouble} />
              </div>

              {/* Daily Insights */}
              <Card className="p-6">
                <div className="flex items-center gap-2 mb-4">
                  <BrainCircuit size={24} className="text-accent" strokeWidth={2.5} />
                  <h2 className="font-heading text-2xl uppercase">DAILY AI INSIGHTS</h2>
                </div>
                {dailyInsightsData?.insights?.length > 0 ? (
                  <div className="space-y-3">
                    {dailyInsightsData.insights.map((insight: string, i: number) => (
                      <motion.div
                        key={i}
                        initial={{ opacity: 0, x: -20 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: i * 0.1 }}
                        className="flex items-start gap-3 p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]"
                      >
                        <div className="w-6 h-6 bg-accent flex items-center justify-center shrink-0">
                          <span className="text-xs font-mono font-bold text-[var(--theme-primary-text)]">{i + 1}</span>
                        </div>
                        <p className="text-sm text-[var(--text-secondary)]">{insight}</p>
                      </motion.div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8">
                    <TrendingUp size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
                    <p className="font-mono text-sm text-[var(--text-muted)]">LOG MEALS AND WORKOUTS TO GET AI-POWERED INSIGHTS</p>
                  </div>
                )}
              </Card>

              {/* Weekly Summary */}
              <Card className="p-6 border-l-4 border-l-accent">
                <div className="flex items-center gap-2 mb-4">
                  <Activity size={24} className="text-accent" strokeWidth={2.5} />
                  <h2 className="font-heading text-2xl uppercase">WEEKLY SUMMARY</h2>
                </div>
                {weeklySummary ? (
                  <p className="text-[var(--text-secondary)] leading-relaxed">{weeklySummary.content}</p>
                ) : (
                  <p className="font-mono text-sm text-[var(--text-muted)]">GENERATE A WEEKLY SUMMARY TO SEE YOUR PROGRESS TRENDS.</p>
                )}
              </Card>

              {/* Achievement Progress */}
              <Card className="p-6">
                <h2 className="font-heading text-2xl uppercase mb-4">ACHIEVEMENT PROGRESS</h2>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  {badges.map((badge) => {
                    const isUnlocked = unlockedBadges.includes(badge.id);
                    return (
                      <div
                        key={badge.id}
                        className={`p-4 border-2 text-center transition-all ${
                          isUnlocked ? 'border-accent bg-accent/10' : 'border-[var(--border-default)] opacity-60'
                        }`}
                      >
                        <badge.icon size={32} className={`mx-auto mb-2 ${isUnlocked ? 'text-accent' : 'text-[var(--text-muted)]'}`} strokeWidth={2} />
                        <div className="font-mono text-xs uppercase">{badge.name}</div>
                        <div className="text-[10px] text-[var(--text-muted)] mt-1">{badge.description}</div>
                      </div>
                    );
                  })}
                </div>
              </Card>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              HISTORY TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "HISTORY" && (
            <motion.div
              ref={historyContainerRef}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex flex-col flex-1 min-h-0"
              data-testid="history-tab"
            >
              <div className="flex gap-0 border border-[var(--border-default)] overflow-hidden flex-1 min-h-0 bg-[var(--bg-card)]">
                {/* Calendar Panel */}
                <div style={{ width: `${calendarPanelPct}%` }} className="shrink-0 overflow-hidden">
                  <div className="h-full border-r border-[var(--border-default)] p-4 flex flex-col overflow-y-auto">
                    <div className="flex items-center justify-between mb-4 shrink-0">
                      <button
                        data-testid="prev-month-btn"
                        onClick={handlePrevMonth}
                        className="p-2 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"
                      >
                        <ChevronLeft size={14} />
                      </button>
                      <h2 className="font-heading text-lg">{monthNames[calendarMonth - 1]} {calendarYear}</h2>
                      <button
                        data-testid="next-month-btn"
                        onClick={handleNextMonth}
                        className="p-2 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"
                      >
                        <ChevronRight size={14} />
                      </button>
                    </div>

                    <div className="grid grid-cols-7 gap-1 mb-2 shrink-0">
                      {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                        <div key={i} className="text-center text-[10px] font-mono text-[var(--text-muted)] py-1">{d}</div>
                      ))}
                    </div>

                    <div className="grid grid-cols-7 gap-1 shrink-0">
                      {Array.from({ length: getFirstDayOfMonth(calendarYear, calendarMonth) }).map((_, i) => (
                        <div key={`empty-${i}`} />
                      ))}
                      {Array.from({ length: getDaysInMonth(calendarYear, calendarMonth) }).map((_, i) => {
                        const day = i + 1;
                        const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                        const dayData = calendarData[dateStr];
                        const isToday = dateStr === today;
                        const isSelected = dateStr === selectedDate;
                        return (
                          <button
                            key={day}
                            data-testid={`calendar-day-${day}`}
                            onClick={() => { setSelectedDate(dateStr); fetchHistoryDay(dateStr); }}
                            className={`aspect-square p-1 border transition-colors text-xs font-mono flex flex-col items-center justify-center ${
                              isSelected ? "bg-accent text-[var(--theme-primary-text)] border-accent" :
                              isToday ? "border-accent text-accent" :
                              "border-[var(--border-default)] hover:border-accent"
                            }`}
                          >
                            <span>{day}</span>
                            {dayData && (
                              <div className="flex gap-0.5 mt-0.5">
                                {dayData.meals > 0 && <span className="w-1 h-1 rounded-full bg-accent" />}
                                {dayData.workouts > 0 && <span className="w-1 h-1 rounded-full bg-[var(--text-secondary)]" />}
                              </div>
                            )}
                          </button>
                        );
                      })}
                    </div>

                    <div className="flex gap-3 mt-4 text-[10px] font-mono text-[var(--text-muted)] shrink-0">
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-accent" /> MEALS</span>
                      <span className="flex items-center gap-1"><span className="w-2 h-2 rounded-full bg-[var(--text-secondary)]" /> WORKOUTS</span>
                    </div>
                  </div>
                </div>

                {/* Resize Handle */}
                <div
                  className="w-1 shrink-0 cursor-col-resize hover:bg-accent transition-colors bg-[var(--border-default)]"
                  onMouseDown={(e) => {
                    resizeRef.current = { startX: e.clientX, startPct: calendarPanelPct };
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                  }}
                />

                {/* Day Detail Panel */}
                <div className="flex-1 min-w-0 overflow-y-auto p-4">
                  {selectedDate && historyDayData ? (
                    <>
                      <h3 className="font-heading text-xl uppercase mb-4">
                        {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", {
                          weekday: "long", month: "long", day: "numeric", year: "numeric",
                        })}
                      </h3>

                      {historyDayData.meals.length > 0 && (
                        <div className="mb-6">
                          <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3">MEALS</div>
                          <div className="space-y-2">
                            {historyDayData.meals.map((m: any) => (
                              <div key={m._id} className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="flex items-center gap-2">
                                  <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-0.5">{m.time}</span>
                                  <span className="font-medium">{m.name}</span>
                                </div>
                                <span className="font-mono text-accent">{m.calories} kcal</span>
                              </div>
                            ))}
                          </div>
                          <div className="text-xs font-mono text-[var(--text-muted)] mt-2">
                            TOTAL: {historyDayData.meals.reduce((s: number, m: any) => s + m.calories, 0)} kcal
                          </div>
                        </div>
                      )}

                      {historyDayData.workouts.length > 0 && (
                        <div>
                          <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3">WORKOUTS</div>
                          <div className="space-y-2">
                            {historyDayData.workouts.map((w: any) => (
                              <div key={w._id} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="flex items-center gap-2">
                                  <span className={`text-xs font-mono px-2 py-0.5 ${
                                    w.intensity === "MAX" ? "bg-red-600 text-white" :
                                    w.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" :
                                    "border border-[var(--border-default)]"
                                  }`}>
                                    {w.intensity}
                                  </span>
                                  <span className="font-medium">{w.name}</span>
                                  {w.duration && <span className="text-xs text-[var(--text-muted)]">{w.duration}</span>}
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {historyDayData.meals.length === 0 && historyDayData.workouts.length === 0 && (
                        <div className="text-sm font-mono text-[var(--text-muted)]">No data logged for this day.</div>
                      )}
                    </>
                  ) : (
                    <div className="flex items-center justify-center h-full">
                      <div className="text-sm font-mono text-[var(--text-muted)] text-center">
                        {selectedDate ? "LOADING..." : "SELECT A DATE FROM THE CALENDAR"}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              AI COACH TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "AI COACH" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="flex-1 min-h-0 flex overflow-hidden"
              data-testid="ai-coach-tab"
            >
              {/* Sessions Sidebar */}
              <div
                className="shrink-0 border-r border-[var(--border-default)] flex flex-col overflow-hidden transition-[width] duration-200 bg-[var(--bg-card)]"
                style={{ width: sessionsPanelOpen ? sidebarWidth : 0 }}
              >
                <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between shrink-0" style={{ minWidth: 160 }}>
                  <span className="text-xs font-mono uppercase tracking-wider">CONVERSATIONS</span>
                  <div className="flex items-center gap-1">
                    <button
                      data-testid="new-chat-btn"
                      onClick={handleNewSession}
                      className="p-1.5 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"
                    >
                      <MessageSquarePlus size={14} />
                    </button>
                    <button
                      onClick={() => setSessionsPanelOpen((p) => !p)}
                      className="p-1.5 border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"
                    >
                      <PanelLeftClose size={14} />
                    </button>
                  </div>
                </div>
                <div className="flex-1 overflow-y-auto min-h-0">
                  {sessions.map((s: any) => (
                    <button
                      key={s.id}
                      data-testid={`session-${s.id}`}
                      onClick={() => setActiveSessionId(s.id)}
                      className={`w-full text-left px-3 py-2.5 border-b border-[var(--border-default)] text-xs font-mono hover:bg-[var(--bg-elevated)] transition-colors truncate block ${
                        activeSessionId === s.id ? "bg-[var(--bg-elevated)] border-l-2 border-l-accent" : ""
                      }`}
                    >
                      <div className="truncate">{s.title || "New Chat"}</div>
                      <div className="text-[10px] text-[var(--text-muted)] mt-0.5">
                        {new Date(s.updatedAt || s.createdAt).toLocaleDateString()}
                      </div>
                    </button>
                  ))}
                </div>
              </div>

              {/* Resize Handle */}
              {sessionsPanelOpen && (
                <div
                  className="w-1 shrink-0 bg-[var(--border-default)] hover:bg-accent transition-colors cursor-col-resize"
                  onMouseDown={(e) => {
                    e.preventDefault();
                    sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth };
                    document.body.style.cursor = "col-resize";
                    document.body.style.userSelect = "none";
                  }}
                />
              )}

              {/* Main Chat Area */}
              <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-main)]">
                {/* Chat Header */}
                <div className="shrink-0 px-4 py-3 border-b border-[var(--border-default)] flex items-center gap-3 bg-[var(--bg-card)]">
                  {!sessionsPanelOpen && (
                    <button
                      onClick={() => setSessionsPanelOpen(true)}
                      className="p-1.5 border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors shrink-0"
                    >
                      <PanelLeftOpen size={14} />
                    </button>
                  )}
                  <div className="w-10 h-10 bg-accent flex items-center justify-center shrink-0">
                    <Bot size={20} className="text-[var(--theme-primary-text)]" strokeWidth={2.5} />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="font-heading text-lg uppercase truncate">
                      {sessions.find((s: any) => s.id === activeSessionId)?.title || "STRIDE COACH"}
                    </div>
                    <div className="flex items-center gap-1 text-xs font-mono text-accent">
                      <span className="w-2 h-2 bg-accent rounded-full animate-pulse" /> ONLINE
                    </div>
                  </div>
                </div>

                {/* Messages Area */}
                <div className="flex-1 overflow-y-auto p-4 space-y-4 min-h-0">
                  {!activeSessionId && (
                    <div className="text-center py-16">
                      <div className="font-mono text-sm text-[var(--text-muted)] mb-4">SELECT OR CREATE A CONVERSATION</div>
                      <button
                        onClick={handleNewSession}
                        className="px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase"
                      >
                        + NEW CHAT
                      </button>
                    </div>
                  )}
                  {activeSessionId && sessionMessages.length === 0 && (
                    <div className="text-center py-16">
                      <Bot size={48} className="mx-auto mb-4 text-accent" />
                      <div className="font-heading text-xl uppercase mb-2">STRIDE COACH READY</div>
                      <div className="text-sm text-[var(--text-muted)]">
                        Ask anything, or describe your meals/workouts to log them directly.
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
                        className={`max-w-xs lg:max-w-lg xl:max-w-3xl px-4 py-3 text-sm break-words ${
                          msg.role === "ai"
                            ? "bg-accent text-[var(--theme-primary-text)] mr-8"
                            : "bg-[var(--bg-card)] border border-[var(--border-default)] ml-8"
                        }`}
                      >
                        {msg.role === "ai" ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              h1: ({ children }) => <h1 className="text-lg font-bold mb-1">{children}</h1>,
                              h2: ({ children }) => <h2 className="text-base font-bold mb-1">{children}</h2>,
                              h3: ({ children }) => <h3 className="text-sm font-bold mb-1">{children}</h3>,
                              ul: ({ children }) => <ul className="list-disc pl-5 my-1 space-y-0.5">{children}</ul>,
                              ol: ({ children }) => <ol className="list-decimal pl-5 my-1 space-y-0.5">{children}</ol>,
                              li: ({ children }) => <li className="text-sm">{children}</li>,
                              p: ({ children }) => <p className="mb-1 last:mb-0">{children}</p>,
                              strong: ({ children }) => <strong className="font-bold">{children}</strong>,
                              code: ({ children }) => <code className="bg-black/20 px-1 py-0.5 text-xs font-mono">{children}</code>,
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
                      <div className="max-w-sm border-2 border-green-500 bg-green-950/50 p-3">
                        <div className="flex items-center gap-2 text-xs font-mono text-green-400 mb-1">
                          <CheckCircle2 size={14} />
                          {chatLoggedItem.type === "meal" ? "MEAL LOGGED" : "WORKOUT LOGGED"}
                        </div>
                        {chatLoggedItem.type === "meal" && chatLoggedItem.data && (
                          <div className="text-xs text-green-400">
                            {chatLoggedItem.data.name} · {chatLoggedItem.data.calories} kcal
                          </div>
                        )}
                        {chatLoggedItem.type === "workout" && chatLoggedItem.data && (
                          <div className="text-xs text-green-400">
                            {chatLoggedItem.data.name} · {chatLoggedItem.data.exercises?.length || 0} exercises
                          </div>
                        )}
                      </div>
                    </motion.div>
                  )}
                  <div ref={chatEndRef} />
                </div>

                {/* Input Area */}
                <div className="p-4 border-t border-[var(--border-default)] shrink-0 bg-[var(--bg-card)]">
                  {chatError && <div className="mb-2 text-xs font-mono text-red-400">{chatError}</div>}
                  <div className="flex items-center gap-2">
                    <input
                      data-testid="chat-input"
                      value={chatInput}
                      onChange={(e) => setChatInput(e.target.value)}
                      onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && handleSendChat()}
                      placeholder="Describe a meal or workout, or ask anything..."
                      className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                    />
                    <button
                      data-testid="send-chat-btn"
                      onClick={handleSendChat}
                      disabled={chatLoading || !chatInput.trim() || !activeSessionId}
                      className="px-4 py-3 bg-accent text-[var(--theme-primary-text)] font-mono font-bold hover:opacity-90 transition-all disabled:opacity-50"
                    >
                      {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                    </button>
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {/* ═══════════════════════════════════════════════════════════════════
              PROFILE TAB
          ═══════════════════════════════════════════════════════════════════ */}
          {activeTab === "PROFILE" && (
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              className="max-w-4xl mx-auto space-y-6"
              data-testid="profile-tab"
            >
              <h1 className="text-4xl font-heading uppercase tracking-tighter">PROFILE</h1>

              {/* User Info */}
              <Card className="p-6">
                <div className="flex items-center gap-5">
                  {user?.imageUrl && (
                    <img src={user.imageUrl} alt="" className="w-20 h-20 border-2 border-accent object-cover shrink-0" />
                  )}
                  <div>
                    <h3 className="font-heading text-2xl uppercase">{user?.fullName || "Operator"}</h3>
                    <p className="text-sm font-mono text-[var(--text-muted)]">{user?.emailAddresses?.[0]?.emailAddress}</p>
                    <p className="text-xs font-mono text-[var(--text-muted)] mt-1">
                      MEMBER SINCE {user?.createdAt ? new Date(user.createdAt).toLocaleDateString() : "—"}
                    </p>
                  </div>
                  <button
                    onClick={() => openUserProfile()}
                    className="ml-auto px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors"
                  >
                    ACCOUNT SETTINGS
                  </button>
                </div>
              </Card>

              {/* Body Metrics */}
              <Card className="p-6">
                <h3 className="font-heading text-xl uppercase mb-6 pb-2 border-b border-[var(--border-default)]">BODY METRICS</h3>
                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">WEIGHT (KG)</label>
                    <input
                      data-testid="profile-weight-input"
                      type="number"
                      value={profileForm.weight}
                      onChange={(e) => setProfileForm({ ...profileForm, weight: e.target.value })}
                      placeholder="75"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">HEIGHT (CM)</label>
                    <input
                      data-testid="profile-height-input"
                      type="number"
                      value={profileForm.height}
                      onChange={(e) => setProfileForm({ ...profileForm, height: e.target.value })}
                      placeholder="175"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">AGE</label>
                    <input
                      data-testid="profile-age-input"
                      type="number"
                      value={profileForm.age}
                      onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })}
                      placeholder="28"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  {profileForm.weight && profileForm.height && (
                    <div className="p-6 bg-accent text-[var(--theme-primary-text)] flex flex-col justify-center">
                      <div className="text-xs font-mono opacity-70">BMI</div>
                      <div className="text-3xl font-heading">
                        {(Number(profileForm.weight) / (Number(profileForm.height) / 100) ** 2).toFixed(1)}
                      </div>
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">ACTIVITY LEVEL</label>
                  <select
                    data-testid="profile-activity-select"
                    value={profileForm.activityLevel}
                    onChange={(e) => setProfileForm({ ...profileForm, activityLevel: e.target.value })}
                    className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                  >
                    <option value="sedentary">SEDENTARY — Little to no exercise</option>
                    <option value="light">LIGHT — Light exercise 1-3 days/week</option>
                    <option value="moderate">MODERATE — Exercise 3-5 days/week</option>
                    <option value="active">ACTIVE — Intense exercise 6-7 days/week</option>
                    <option value="intense">INTENSE — Very intense daily training</option>
                  </select>
                </div>
              </Card>

              {/* Macro Targets */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-6 pb-2 border-b border-[var(--border-default)]">
                  <h3 className="font-heading text-xl uppercase">DAILY MACRO TARGETS</h3>
                  <button
                    data-testid="ai-calculate-macros"
                    onClick={handleAIFillProfile}
                    disabled={profileAILoading || !profileForm.weight || !profileForm.height || !profileForm.age}
                    className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors disabled:opacity-50"
                  >
                    {profileAILoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    AI CALCULATE
                  </button>
                </div>

                {profileAIExplanation && (
                  <div className="mb-4 p-4 border-l-4 border-accent bg-accent/10 text-sm">{profileAIExplanation}</div>
                )}

                <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">CALORIES (KCAL)</label>
                    <input
                      data-testid="profile-calories-input"
                      type="number"
                      value={profileForm.calorieTarget}
                      onChange={(e) => setProfileForm({ ...profileForm, calorieTarget: e.target.value })}
                      placeholder="2400"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">PROTEIN (G)</label>
                    <input
                      data-testid="profile-protein-input"
                      type="number"
                      value={profileForm.proteinTarget}
                      onChange={(e) => setProfileForm({ ...profileForm, proteinTarget: e.target.value })}
                      placeholder="180"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">CARBS (G)</label>
                    <input
                      data-testid="profile-carbs-input"
                      type="number"
                      value={profileForm.carbTarget}
                      onChange={(e) => setProfileForm({ ...profileForm, carbTarget: e.target.value })}
                      placeholder="280"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2">FAT (G)</label>
                    <input
                      data-testid="profile-fat-input"
                      type="number"
                      value={profileForm.fatTarget}
                      onChange={(e) => setProfileForm({ ...profileForm, fatTarget: e.target.value })}
                      placeholder="80"
                      className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-[var(--text-primary)] font-mono focus:outline-none focus:border-accent"
                    />
                  </div>
                </div>
              </Card>

              {/* Save Button */}
              <div className="flex gap-4">
                <button
                  data-testid="save-profile-btn"
                  onClick={handleSaveProfile}
                  disabled={profileLoading}
                  className="flex-1 py-4 bg-accent text-[var(--theme-primary-text)] font-mono uppercase tracking-wider font-bold disabled:opacity-50"
                >
                  {profileLoading ? <Loader2 size={16} className="animate-spin mx-auto" /> : "SAVE METRICS & TARGETS"}
                </button>
                <button
                  onClick={() => openUserProfile()}
                  className="px-6 py-4 border-2 border-[var(--border-default)] font-mono uppercase hover:border-accent transition-colors"
                >
                  MANAGE ACCOUNT
                </button>
              </div>

              {profileError && (
                <div className="p-4 border-2 border-red-600 bg-red-950/50 text-xs font-mono text-red-400">{profileError}</div>
              )}
              {profileSuccess && (
                <div className="p-4 border-2 border-green-500 bg-green-950/50 text-xs font-mono text-green-400">PROFILE SAVED SUCCESSFULLY</div>
              )}
            </motion.div>
          )}
        </main>
      )}
    </div>
  );
}
