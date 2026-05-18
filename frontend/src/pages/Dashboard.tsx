import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { useAuth, useUser, useClerk } from "@clerk/react";
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
  GlassWater,
  LineChart,
  PieChart,
  BarChart2,
  Calendar,
  Repeat,
  Pencil,
  Save,
  Play,
  Square,
  ArrowLeft,
} from "lucide-react";
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  ReferenceLine,
  LineChart as ReLineChart,
  Line as ReLine,
} from "recharts";
import { useTheme, colorSchemes } from "../lib/theme";
import { useToast } from "../hooks/useToast";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { Card } from "../components/ui/Card";
import { StatCard } from "../components/ui/StatCard";
import { ProgressBar } from "../components/ui/ProgressBar";
import { PageHeader } from "../components/ui/PageHeader";
import { ConfirmLogCard } from "../components/ConfirmLogCard";
import { InlineLogPanel } from "../components/InlineLogPanel";
import { ToastStack } from "../components/ToastStack";
import { CommandBar } from "../components/CommandBar";
import { RemainingBudget } from "../components/RemainingBudget";
import { VoiceInputButton } from "../components/VoiceInputButton";

// Simplified nav items with icons only on desktop
const navItems = [
  { icon: Home, label: "HOME", short: "HOME" },
  { icon: Utensils, label: "MEALS", short: "MEALS" },
  { icon: Dumbbell, label: "WORKOUT", short: "GYM" },
  { icon: ChefHat, label: "RECIPES", short: "RECIPES" },
  { icon: BarChart3, label: "INSIGHTS", short: "STATS" },
  { icon: CalendarDays, label: "HISTORY", short: "HISTORY" },
  { icon: Bot, label: "AI COACH", short: "COACH" },
  { icon: User, label: "PROFILE", short: "ME" },
];

const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

// Badge definitions
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
  const { signOut } = useAuth()
  const { user } = useUser()
  const { openUserProfile } = useClerk()
  const { isDark, toggleTheme, accentColor, setAccentColor } = useTheme();
  const [activeTab, setActiveTab] = useState("HOME");
  const [menuOpen, setMenuOpen] = useState(false);
  const [showColorPicker, setShowColorPicker] = useState(false);

  const today = new Date().toISOString().split("T")[0];
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // ─── Convex mutations / actions ────────────────────────────────────────────
  const ensureUserMutation = useMutation(api.users.ensureUser);
  const addMealMutation = useMutation(api.meals.addMeal);
  const updateMealMutation = useMutation(api.meals.updateMeal);
  const deleteMealMutation = useMutation(api.meals.deleteMeal);
  const addWorkoutMutation = useMutation(api.workouts.addWorkout);
  const updateWorkoutMutation = useMutation(api.workouts.updateWorkout);
  const deleteWorkoutMutation = useMutation(api.workouts.deleteWorkout);
  const upsertProfileMutation = useMutation(api.profile.upsertProfile);
  const createSessionMutation = useMutation(api.chat.createSession);
  const deleteSessionMutation = useMutation(api.chat.deleteSession);
  const updateSessionTitleMutation = useMutation(api.chat.updateSessionTitle);
  const chatAction = useAction(api.ai.chat);
  const parseMealAction = useAction(api.ai.parseMeal);
  const parseWorkoutAction = useAction(api.ai.parseWorkout);
  const logMealAction = useAction(api.ai.logMeal);
  const logWorkoutAction = useAction(api.ai.logWorkout);
  const calculateMacrosAction = useAction(api.ai.calculateProfileMacros);
  const dailyInsightsAction = useAction(api.ai.generateDailyInsights);
  const weeklySummaryAction = useAction(api.ai.generateWeeklySummary);
  const suggestWorkoutAction = useAction(api.ai.suggestWorkout);

  // ─── Convex reactive queries ────────────────────────────────────────────────
  const meals = useQuery(api.meals.getMeals, { date: today }) ?? [];
  const workouts = useQuery(api.workouts.getWorkouts, { date: today }) ?? [];
  const goalsData = useQuery(api.goals.getDailyGoal, { date: today });
  const goals = goalsData ?? { calorieGoal: 2400, proteinGoal: 180, carbGoal: 280, fatGoal: 80 };
  const dailyInsightsData = useQuery(api.insights.getDailyInsights, { date: today }) ?? { insights: [] };
  const weeklySummary = useQuery(api.insights.getWeeklySummary) ?? null;

  // Ensure user record exists on first load
  useEffect(() => {
    if (user) {
      ensureUserMutation({
        name: user.fullName || "Athlete",
        email: user.emailAddresses[0]?.emailAddress || "",
      }).catch(() => {});
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  // Water tracking with flexible input
  const [waterIntake, setWaterIntake] = useState(() => {
    const saved = localStorage.getItem(`water-${today}`);
    return saved ? parseFloat(saved) : 0;
  });
  const [waterUnit, setWaterUnit] = useState<'glasses' | 'litres'>(() => {
    return (localStorage.getItem('water-unit') as 'glasses' | 'litres') || 'glasses';
  });
  const [customWaterInput, setCustomWaterInput] = useState('');
  const waterGoalGlasses = 8;
  const waterGoalLitres = 2;
  const waterGoal = waterUnit === 'glasses' ? waterGoalGlasses : waterGoalLitres;

  // Sleep tracking with custom input
  const [sleepHours, setSleepHours] = useState(() => {
    const saved = localStorage.getItem(`sleep-${today}`);
    return saved ? parseFloat(saved) : 7.5;
  });
  const [customSleepInput, setCustomSleepInput] = useState('');
  const sleepGoal = 8;

  // Recipes state
  const [recipes, setRecipes] = useState<any[]>(() => {
    const saved = localStorage.getItem('user-recipes');
    return saved ? JSON.parse(saved) : [];
  });
  const [showRecipeForm, setShowRecipeForm] = useState(false);
  const [recipeForm, setRecipeForm] = useState({
    name: '', servings: '1', prepTime: '', cookTime: '', ingredients: '', instructions: '', notes: '',
  });
  const [selectedRecipeId, setSelectedRecipeId] = useState<string | null>(null);
  const [editingRecipeId, setEditingRecipeId] = useState<string | null>(null);
  const [editRecipeForm, setEditRecipeForm] = useState<any>(null);
  const [recipeAiNote, setRecipeAiNote] = useState<string | null>(null);
  const [recipeAiLoading, setRecipeAiLoading] = useState(false);

  // Meal / Workout expand & edit
  const [expandedMealId, setExpandedMealId] = useState<string | null>(null);
  const [editingMealId, setEditingMealId] = useState<string | null>(null);
  const [editMealForm, setEditMealForm] = useState<any>(null);
  const [expandedWorkoutId, setExpandedWorkoutId] = useState<string | null>(null);
  const [editingWorkoutId, setEditingWorkoutId] = useState<string | null>(null);
  const [editWorkoutForm, setEditWorkoutForm] = useState<any>(null);

  // Live Workout state
  const [liveWorkoutMode, setLiveWorkoutMode] = useState(false);
  const [liveWorkoutName, setLiveWorkoutName] = useState("");
  const [liveWorkoutIntensity, setLiveWorkoutIntensity] = useState("HIGH");
  const [liveExercises, setLiveExercises] = useState<{ name: string; sets: { weight: string; reps: string }[] }[]>([]);
  const [liveCurrentExercise, setLiveCurrentExercise] = useState("");
  const [liveCurrentWeight, setLiveCurrentWeight] = useState("");
  const [liveCurrentReps, setLiveCurrentReps] = useState("");

  const profile = useQuery(api.profile.getProfile) ?? null;
  const [profileForm, setProfileForm] = useState({
    weight: "", height: "", age: "", activityLevel: "moderate",
    calorieTarget: "", proteinTarget: "", carbTarget: "", fatTarget: "",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileAILoading, setProfileAILoading] = useState(false);
  const [profileAIExplanation, setProfileAIExplanation] = useState<string | null>(null);

  // AI Coaches
  const coaches = useQuery(api.ai.getCoaches) ?? [];
  const [selectedCoach, setSelectedCoach] = useState<string>("auto");

  // History insights
  const [historyInsightDays, setHistoryInsightDays] = useState(30);
  const historyInsights = useQuery(api.history.getHistoryInsights, { days: historyInsightDays }) ?? null;
  const [historyView, setHistoryView] = useState<'day' | 'insights'>('day');

  // Badges
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>(() => {
    const saved = localStorage.getItem('unlocked-badges');
    return saved ? JSON.parse(saved) : [];
  });

  // AI Coach state
  const [activeSessionId, setActiveSessionId] = useState<Id<"chat_sessions"> | null>(null);
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const sessions = useQuery(api.chat.getSessions) ?? [];
  const rawMessages = useQuery(api.chat.getMessages, activeSessionId ? { sessionId: activeSessionId } : "skip") ?? [];
  const sessionMessages = rawMessages.map((m: any) => ({
    role: m.role === "user" ? "human" : m.role,
    content: m.content,
  }));
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // History state
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const calendarData = useQuery(api.history.getCalendar, { year: calendarYear, month: calendarMonth }) ?? {};
  const historyDayData = useQuery(api.history.getDayHistory, selectedDate ? { date: selectedDate } : "skip") ?? null;
  const [calendarPanelPct, setCalendarPanelPct] = useState(35);
  const [calendarHidden, setCalendarHidden] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [profileImgError, setProfileImgError] = useState(false);
  const resizeRef = useRef<{ startX: number; startPct: number } | null>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  // Insights visualization mode
  const [insightView, setInsightView] = useState<'overview' | 'calories' | 'macros' | 'trends'>('overview');

  // Save to localStorage
  useEffect(() => {
    localStorage.setItem(`water-${today}`, String(waterIntake));
  }, [waterIntake, today]);

  useEffect(() => {
    localStorage.setItem('water-unit', waterUnit);
  }, [waterUnit]);

  useEffect(() => {
    localStorage.setItem(`sleep-${today}`, String(sleepHours));
  }, [sleepHours, today]);

  useEffect(() => {
    localStorage.setItem('user-recipes', JSON.stringify(recipes));
  }, [recipes]);

  useEffect(() => {
    localStorage.setItem('unlocked-badges', JSON.stringify(unlockedBadges));
  }, [unlockedBadges]);

  // Sync profile form when profile loads from Convex
  useEffect(() => {
    if (profile) {
      setProfileForm({
        weight: profile.weight ? String(profile.weight) : '',
        height: profile.height ? String(profile.height) : '',
        age: profile.age ? String(profile.age) : '',
        activityLevel: profile.activityLevel || 'moderate',
        calorieTarget: profile.calorieTarget ? String(profile.calorieTarget) : '',
        proteinTarget: profile.proteinTarget ? String(profile.proteinTarget) : '',
        carbTarget: profile.carbTarget ? String(profile.carbTarget) : '',
        fatTarget: profile.fatTarget ? String(profile.fatTarget) : '',
      });
    }
  }, [profile]);

  // Resize handlers
  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizeRef.current && historyContainerRef.current) {
        const containerRect = historyContainerRef.current.getBoundingClientRect();
        const dx = e.clientX - resizeRef.current.startX;
        const newPct = Math.min(60, Math.max(20, resizeRef.current.startPct + (dx / containerRect.width) * 100));
        setCalendarPanelPct(newPct);
      }
      if (sidebarResizeRef.current) {
        const dx = e.clientX - sidebarResizeRef.current.startX;
        const newWidth = Math.min(400, Math.max(200, sidebarResizeRef.current.startWidth + dx));
        setSidebarWidth(newWidth);
      }
    };
    const handleMouseUp = () => {
      resizeRef.current = null;
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

  const totalCals = meals.reduce((s, m) => s + m.calories, 0);
  const totalProtein = meals.reduce((s, m) => s + m.protein, 0);
  const totalCarbs = meals.reduce((s, m) => s + m.carbs, 0);
  const totalFat = meals.reduce((s, m) => s + m.fat, 0);

  const [mealForm, setMealForm] = useState({ description: "", mealType: "breakfast", time: "" });
  const [mealError, setMealError] = useState<string | null>(null);

  const [workoutForm, setWorkoutForm] = useState({ description: "", duration: "", intensity: "HIGH" });
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const effectiveGoals = {
    calorieGoal: parseInt(profileForm.calorieTarget) || goals?.calorieGoal || 2400,
    proteinGoal: parseInt(profileForm.proteinTarget) || goals?.proteinGoal || 180,
    carbGoal: parseInt(profileForm.carbTarget) || goals?.carbGoal || 280,
    fatGoal: parseInt(profileForm.fatTarget) || goals?.fatGoal || 80,
  };

  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);
  const [chatError, setChatError] = useState("");
  const chatEndRef = useRef<HTMLDivElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);

  const [workoutSuggestion, setWorkoutSuggestion] = useState<any>(null);
  const [suggestionLoading, setSuggestionLoading] = useState(false);
  const [insightsLoading, setInsightsLoading] = useState(false);
  const [weeklyLoading, setWeeklyLoading] = useState(false);

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [sessionMessages]);

  // Auto-select today when entering HISTORY tab
  useEffect(() => {
    if (activeTab === "HISTORY" && !selectedDate) {
      setSelectedDate(today);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // Auto-select first session when sessions load
  useEffect(() => {
    if (sessions.length > 0 && !activeSessionId) {
      setActiveSessionId(sessions[0].id as Id<"chat_sessions">);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessions.length]);

  // ─── Handlers ──────────────────────────────────────────────────────────────

  const handleDeleteMeal = async (id: Id<"meals">) => {
    try { await deleteMealMutation({ id }); } catch {}
  };

  const handleDeleteWorkout = async (id: Id<"workouts">) => {
    try { await deleteWorkoutMutation({ id }); } catch {}
  };

  const handleSaveProfile = async () => {
    setProfileLoading(true);
    setProfileError(null);
    setProfileSuccess(false);
    try {
      await upsertProfileMutation({
        weight: profileForm.weight ? Number(profileForm.weight) : undefined,
        height: profileForm.height ? Number(profileForm.height) : undefined,
        age: profileForm.age ? Number(profileForm.age) : undefined,
        activityLevel: profileForm.activityLevel,
        calorieTarget: profileForm.calorieTarget ? Number(profileForm.calorieTarget) : undefined,
        proteinTarget: profileForm.proteinTarget ? Number(profileForm.proteinTarget) : undefined,
        carbTarget: profileForm.carbTarget ? Number(profileForm.carbTarget) : undefined,
        fatTarget: profileForm.fatTarget ? Number(profileForm.fatTarget) : undefined,
      });
      setProfileSuccess(true);
      setTimeout(() => setProfileSuccess(false), 3000);
    } catch (err: any) {
      setProfileError(err.message || 'Failed to save profile');
    } finally {
      setProfileLoading(false);
    }
  };

  const handleAICalculateMacros = async () => {
    if (!profileForm.weight || !profileForm.height || !profileForm.age) {
      setProfileError('Weight, height, and age required for AI calculation');
      return;
    }
    setProfileAILoading(true);
    setProfileAIExplanation(null);
    setProfileError(null);
    try {
      const data = await calculateMacrosAction({
        weight: Number(profileForm.weight),
        height: Number(profileForm.height),
        age: Number(profileForm.age),
        activityLevel: profileForm.activityLevel,
      });
      setProfileForm(prev => ({
        ...prev,
        calorieTarget: String(data.calories || ''),
        proteinTarget: String(data.protein || ''),
        carbTarget: String(data.carbs || ''),
        fatTarget: String(data.fat || ''),
      }));
      setProfileAIExplanation((data as any).explanation || '');
    } catch (err: any) {
      setProfileError(err.message || 'Failed to calculate macros');
    } finally {
      setProfileAILoading(false);
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeSessionId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    if (chatInputRef.current) chatInputRef.current.style.height = 'auto';
    setChatLoading(true);
    setChatError("");
    try {
      const data = await chatAction({ message: userMsg, sessionId: activeSessionId, coachType: selectedCoach });
      if (data.loggedItem) {
        const item = data.loggedItem;
        toastSuccess(
          `Logged ${item.type}: ${item.data?.name || ""}`,
          async () => {
            try {
              if (item.type === "meal") await deleteMealMutation({ id: item.data._id });
              else await deleteWorkoutMutation({ id: item.data._id });
            } catch {}
          },
          "UNDO",
        );
      }
    } catch (err: any) {
      setChatError(err.message || "Failed to get response");
    } finally {
      setChatLoading(false);
    }
  };

  const handleNewSession = async () => {
    try {
      const session = await createSessionMutation({ title: 'New Chat' });
      setActiveSessionId(session.id as Id<"chat_sessions">);
    } catch (err: any) {
      setChatError(err.message || 'Failed to create session');
    }
  };

  const handleDeleteSession = async (id: Id<"chat_sessions">, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await deleteSessionMutation({ id });
      if (activeSessionId === id) setActiveSessionId(null);
    } catch {}
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  const handlePrevMonth = () => {
    let newMonth = calendarMonth - 1;
    let newYear = calendarYear;
    if (newMonth === 0) { newMonth = 12; newYear -= 1; }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    setSelectedDate(null);
  };

  const handleNextMonth = () => {
    let newMonth = calendarMonth + 1;
    let newYear = calendarYear;
    if (newMonth === 13) { newMonth = 1; newYear += 1; }
    setCalendarMonth(newMonth);
    setCalendarYear(newYear);
    setSelectedDate(null);
  };

  const handleAddCustomWater = () => {
    const val = parseFloat(customWaterInput);
    if (!isNaN(val) && val > 0) {
      setWaterIntake(prev => prev + val);
      setCustomWaterInput('');
    }
  };

  const handleSetCustomSleep = () => {
    const val = parseFloat(customSleepInput);
    if (!isNaN(val) && val >= 0 && val <= 24) {
      setSleepHours(val);
      setCustomSleepInput('');
    }
  };

  const handleSaveRecipe = () => {
    if (!recipeForm.name.trim()) return;
    const newRecipe = { id: Date.now().toString(), ...recipeForm, createdAt: new Date().toISOString() };
    setRecipes(prev => [newRecipe, ...prev]);
    setRecipeForm({ name: '', servings: '1', prepTime: '', cookTime: '', ingredients: '', instructions: '', notes: '' });
    setShowRecipeForm(false);
  };

  const handleDeleteRecipe = (id: string) => {
    setRecipes(prev => prev.filter(r => r.id !== id));
  };

  const handleGenerateDailyInsights = async () => {
    setInsightsLoading(true);
    try { await dailyInsightsAction({ date: today }); } catch {}
    setInsightsLoading(false);
  };

  const handleGenerateWeeklySummary = async () => {
    setWeeklyLoading(true);
    try { await weeklySummaryAction({}); } catch {}
    setWeeklyLoading(false);
  };

  const handleGetWorkoutSuggestion = async () => {
    setSuggestionLoading(true);
    try {
      const data = await suggestWorkoutAction({});
      setWorkoutSuggestion(data);
    } catch {
      setWorkoutSuggestion(null);
    }
    setSuggestionLoading(false);
  };

  // ─── Edit handlers ─────────────────────────────────────────────────────────

  const handleUpdateMeal = async (id: Id<"meals">) => {
    if (!editMealForm) return;
    try {
      await updateMealMutation({ id, ...editMealForm });
      setEditingMealId(null);
      setEditMealForm(null);
    } catch {}
  };

  const handleUpdateWorkout = async (id: Id<"workouts">) => {
    if (!editWorkoutForm) return;
    try {
      await updateWorkoutMutation({ id, ...editWorkoutForm });
      setEditingWorkoutId(null);
      setEditWorkoutForm(null);
    } catch {}
  };

  const handleSaveEditRecipe = () => {
    if (!editRecipeForm || !editRecipeForm.name.trim()) return;
    setRecipes(prev => prev.map(r => r.id === editingRecipeId ? { ...r, ...editRecipeForm } : r));
    setEditingRecipeId(null);
    setEditRecipeForm(null);
  };

  const handleGenerateRecipeNote = async (recipe: any) => {
    setRecipeAiLoading(true);
    setRecipeAiNote(null);
    try {
      const prompt = `Analyze this recipe from a nutrition and fitness perspective and give a brief, actionable note (max 2 sentences):\n\nName: ${recipe.name}\nServings: ${recipe.servings}\nIngredients: ${recipe.ingredients}\nNotes: ${recipe.notes || 'None'}\n\nReturn ONLY the note text, no quotes or markdown.`;
      const data = await chatAction({ message: prompt, sessionId: activeSessionId ?? undefined, coachType: 'diet' });
      setRecipeAiNote(data.reply || 'No note generated.');
    } catch {
      setRecipeAiNote('Unable to generate AI note.');
    }
    setRecipeAiLoading(false);
  };

  // ─── Live Workout handlers ─────────────────────────────────────────────────

  const startLiveWorkout = () => {
    setLiveWorkoutMode(true);
    setLiveWorkoutName("");
    setLiveWorkoutIntensity("HIGH");
    setLiveExercises([]);
    setLiveCurrentExercise("");
    setLiveCurrentWeight("");
    setLiveCurrentReps("");
  };

  const addLiveExerciseSet = () => {
    if (!liveCurrentExercise.trim() || !liveCurrentReps.trim()) return;
    setLiveExercises(prev => {
      const existing = prev.find(e => e.name.toLowerCase() === liveCurrentExercise.trim().toLowerCase());
      if (existing) {
        return prev.map(e =>
          e.name.toLowerCase() === liveCurrentExercise.trim().toLowerCase()
            ? { ...e, sets: [...e.sets, { weight: liveCurrentWeight, reps: liveCurrentReps }] }
            : e
        );
      }
      return [...prev, { name: liveCurrentExercise.trim(), sets: [{ weight: liveCurrentWeight, reps: liveCurrentReps }] }];
    });
    setLiveCurrentWeight("");
    setLiveCurrentReps("");
  };

  const finishLiveWorkout = async () => {
    if (liveExercises.length === 0) return;
    const totalSets = liveExercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const name = liveWorkoutName.trim() || `${liveExercises.length} Exercise Session`;
    const setsStr = `${liveExercises.length} exercise${liveExercises.length !== 1 ? 's' : ''} · ${totalSets} set${totalSets !== 1 ? 's' : ''}`;
    await commitWorkout({
      name,
      sets: setsStr,
      duration: "",
      intensity: liveWorkoutIntensity,
      exercises: liveExercises,
      rationale: "",
    });
    setLiveWorkoutMode(false);
  };

  // Auto-resize chat input
  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.style.height = Math.min(chatInputRef.current.scrollHeight, 150) + 'px';
    }
  };

  // Toast hook
  const { toasts, removeToast, success: toastSuccess, error: toastError } = useToast();

  // Command bar
  const [commandBarOpen, setCommandBarOpen] = useState(false);

  // Home inline panels
  const [showQuickMealPanel, setShowQuickMealPanel] = useState(false);
  const [showQuickWorkoutPanel, setShowQuickWorkoutPanel] = useState(false);

  // Confirm flow states per context
  const [mealConfirm, setMealConfirm] = useState<{ initialData: any } | null>(null);
  const [workoutConfirm, setWorkoutConfirm] = useState<{ initialData: any } | null>(null);
  const [recipeLogConfirm, setRecipeLogConfirm] = useState<any | null>(null);
  const [logAgainMeal, setLogAgainMeal] = useState<any | null>(null);
  const [logAgainWorkout, setLogAgainWorkout] = useState<any | null>(null);
  const [historyAddMealDate, setHistoryAddMealDate] = useState<string | null>(null);
  const [historyAddWorkoutDate, setHistoryAddWorkoutDate] = useState<string | null>(null);
  const [suggestionConfirm, setSuggestionConfirm] = useState<any | null>(null);

  // Global Cmd+K listener
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setCommandBarOpen((prev) => !prev);
      }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, []);

  // Commit helpers
  const commitMeal = async (data: any, targetDate?: string) => {
    const id = await addMealMutation({
      name: data.name,
      calories: data.calories,
      protein: data.protein,
      carbs: data.carbs,
      fat: data.fat,
      time: data.time,
      date: targetDate,
      mealType: data.mealType,
      aiSuggestion: data.aiSuggestion,
    });
    toastSuccess(
      `Logged: ${data.name}`,
      async () => { try { await deleteMealMutation({ id: id as Id<"meals"> }); } catch {} },
      "UNDO",
    );
  };

  const commitWorkout = async (data: any, targetDate?: string) => {
    const id = await addWorkoutMutation({
      name: data.name,
      sets: data.sets,
      duration: data.duration,
      intensity: data.intensity,
      date: targetDate,
      exercises: data.exercises,
      rationale: data.rationale,
    });
    toastSuccess(
      `Logged: ${data.name}`,
      async () => { try { await deleteWorkoutMutation({ id: id as Id<"workouts"> }); } catch {} },
      "UNDO",
    );
  };

  // Context-aware AI coach prompts
  function getContextualPrompts() {
    const hour = new Date().getHours();
    const mealCount = meals.length;
    const workoutCount = workouts.length;
    if (hour < 10 && mealCount === 0) {
      return ["Log breakfast", "What should I eat today?", "Plan my meals for today", "Morning workout suggestion"];
    }
    if (hour >= 10 && hour < 14 && mealCount < 2) {
      return ["Log lunch", "Suggest a healthy snack", "How are my macros?", "Quick workout idea"];
    }
    if (hour >= 14 && hour < 20) {
      if (mealCount < 3 && workoutCount === 0) {
        return ["Log dinner", "Evening workout suggestion", "How are my macros today?", "Log my water intake"];
      }
      if (workoutCount === 0) {
        return ["I haven't worked out yet — help", "How are my macros today?", "Log my water intake", "Evening snack ideas"];
      }
      return ["How are my macros today?", "Log my water intake", "Plan tomorrow", "Recovery tips"];
    }
    return ["How are my macros today?", "Log my water intake", "Plan tomorrow", "Recovery tips"];
  }

  // Markdown renderers for AI Coach
  const markdownComponents = {
    h1: ({ children }: any) => <h1 className="text-lg font-bold mb-2 tracking-normal">{children}</h1>,
    h2: ({ children }: any) => <h2 className="text-base font-bold mb-2 tracking-normal">{children}</h2>,
    h3: ({ children }: any) => <h3 className="text-sm font-bold mb-1 tracking-normal">{children}</h3>,
    p: ({ children }: any) => <p className="mb-2 last:mb-0">{children}</p>,
    ul: ({ children }: any) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
    ol: ({ children }: any) => <ol className="list-decimal pl-4 mb-2 space-y-1">{children}</ol>,
    li: ({ children }: any) => <li>{children}</li>,
    strong: ({ children }: any) => <strong className="font-bold text-accent">{children}</strong>,
    code: ({ children }: any) => <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs font-mono">{children}</code>,
    pre: ({ children }: any) => <pre className="bg-[var(--bg-elevated)] p-2 mb-2 overflow-x-auto text-xs font-mono">{children}</pre>,
    blockquote: ({ children }: any) => <blockquote className="border-l-2 border-accent pl-3 mb-2 text-[var(--text-secondary)]">{children}</blockquote>,
    a: ({ href, children }: any) => <a href={href} target="_blank" rel="noreferrer" className="text-accent underline">{children}</a>,
    table: ({ children }: any) => <table className="w-full text-xs mb-2 border border-[var(--border-default)]">{children}</table>,
    thead: ({ children }: any) => <thead className="bg-[var(--bg-elevated)]">{children}</thead>,
    tbody: ({ children }: any) => <tbody>{children}</tbody>,
    tr: ({ children }: any) => <tr className="border-b border-[var(--border-default)]">{children}</tr>,
    th: ({ children }: any) => <th className="px-2 py-1 text-left font-mono text-[var(--text-muted)]">{children}</th>,
    td: ({ children }: any) => <td className="px-2 py-1">{children}</td>,
    hr: () => <hr className="border-[var(--border-default)] my-2" />,
  };

  return (
    <div className={`flex flex-col bg-[var(--bg-main)] text-[var(--text-primary)] font-body transition-colors ${
      activeTab === "AI COACH" ? "h-screen overflow-hidden" : "min-h-screen"
    }`}>
      {/* Compact Navigation */}
      <nav className="sticky top-0 z-50 bg-[var(--bg-main)] border-b border-[var(--border-default)]" data-testid="main-nav">
        <div className="flex items-center px-4 py-2.5">
          {/* Logo */}
          <div className="text-xl font-heading tracking-normal text-accent mr-6" data-testid="app-logo">STRIDE</div>
          
          {/* Compact Nav - Icons with tooltip-like labels */}
          <div className="hidden lg:flex items-center gap-1 flex-1">
            {navItems.map((item) => (
              <button
                key={item.label}
                data-testid={`nav-${item.label.toLowerCase().replace(' ', '-')}`}
                onClick={() => setActiveTab(item.label)}
                className={`flex items-center gap-1.5 px-3 py-2 font-mono text-[11px] uppercase tracking-wider transition-all ${
                  activeTab === item.label
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
            {/* Color Picker */}
            <div className="relative">
              <button
                data-testid="color-picker-toggle"
                onClick={() => setShowColorPicker(!showColorPicker)}
                className="hidden lg:flex items-center gap-1.5 px-2.5 py-2 border border-[var(--border-default)] bg-[var(--bg-card)] text-xs font-mono hover:border-accent transition-colors"
              >
                <div className="w-3.5 h-3.5 bg-accent" />
                <Palette size={12} />
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
                    <div className="text-[10px] font-mono uppercase tracking-wider text-[var(--text-muted)] mb-2">ACCENT</div>
                    <div className="flex gap-2">
                      {colorSchemes.map((scheme) => (
                        <button
                          key={scheme.name}
                          data-testid={`color-${scheme.name.toLowerCase()}`}
                          onClick={() => { setAccentColor(scheme.value, scheme.textColor); setShowColorPicker(false); }}
                          className={`w-7 h-7 transition-all ${accentColor === scheme.value ? 'ring-2 ring-white ring-offset-1 ring-offset-[var(--bg-card)]' : 'hover:scale-110'}`}
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
              className="hidden lg:flex items-center p-2 border border-[var(--border-default)] bg-[var(--bg-card)] hover:border-accent transition-colors"
            >
              {isDark ? <Sun size={14} /> : <Moon size={14} />}
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
              className="lg:hidden border-t border-[var(--border-default)] bg-[var(--bg-card)] overflow-hidden"
            >
              <div className="grid grid-cols-4 gap-1 p-2">
                {navItems.map((item) => (
                  <button
                    key={item.label}
                    onClick={() => { setActiveTab(item.label); setMenuOpen(false); }}
                    className={`flex flex-col items-center gap-1 p-3 font-mono text-[10px] ${
                      activeTab === item.label ? "bg-accent text-[var(--theme-primary-text)]" : "hover:bg-[var(--bg-elevated)]"
                    }`}
                  >
                    <item.icon size={18} strokeWidth={2} />
                    {item.short}
                  </button>
                ))}
              </div>
              <div className="flex items-center justify-between p-3 border-t border-[var(--border-default)]">
                <div className="flex gap-1.5">
                  {colorSchemes.map((scheme) => (
                    <button
                      key={scheme.name}
                      onClick={() => setAccentColor(scheme.value, scheme.textColor)}
                      className={`w-6 h-6 ${accentColor === scheme.value ? 'ring-2 ring-white' : ''}`}
                      style={{ backgroundColor: scheme.value }}
                    />
                  ))}
                </div>
                <div className="flex gap-1.5">
                  <button onClick={toggleTheme} className="p-2 border border-[var(--border-default)]">
                    {isDark ? <Sun size={14} /> : <Moon size={14} />}
                  </button>
                  <button onClick={() => signOut()} className="p-2 border border-[var(--border-default)]">
                    <LogOut size={14} />
                  </button>
                </div>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </nav>

      <main className={`flex-1 min-h-0 ${
        activeTab === "AI COACH" ? "flex flex-col overflow-hidden w-full" :
        activeTab === "HISTORY" ? "flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-5 lg:p-8" :
        "overflow-auto max-w-7xl mx-auto w-full p-5 lg:p-8"
      }`}>

        {/* ═══════════════════════════════════════════════════════════════════
            HOME TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "HOME" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="home-tab">
            {/* Header */}
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <PageHeader 
                title={user?.firstName?.toUpperCase() || "OPERATOR"} 
                subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
              />
              <div className="flex gap-2">
                <button
                  data-testid="quick-log-meal"
                  onClick={() => {
                    setShowQuickMealPanel(!showQuickMealPanel);
                    setShowQuickWorkoutPanel(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-all"
                >
                  <Plus size={14} strokeWidth={3} /> MEAL
                </button>
                <button
                  data-testid="quick-log-workout"
                  onClick={() => {
                    setShowQuickWorkoutPanel(!showQuickWorkoutPanel);
                    setShowQuickMealPanel(false);
                  }}
                  className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-all"
                >
                  <Plus size={14} strokeWidth={3} /> WORKOUT
                </button>
              </div>
            </div>

            <InlineLogPanel
              mode="meal"
              open={showQuickMealPanel}
              onClose={() => setShowQuickMealPanel(false)}

              onConfirm={(data) => commitMeal(data)}
              totalCals={totalCals}
              totalProtein={totalProtein}
              totalCarbs={totalCarbs}
              totalFat={totalFat}
              goals={effectiveGoals}
            />
            <InlineLogPanel
              mode="workout"
              open={showQuickWorkoutPanel}
              onClose={() => setShowQuickWorkoutPanel(false)}

              onConfirm={(data) => commitWorkout(data)}
              totalCals={totalCals}
              totalProtein={totalProtein}
              totalCarbs={totalCarbs}
              totalFat={totalFat}
              goals={effectiveGoals}
            />

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard
                label="CALORIES"
                value={totalCals || 0}
                subValue={`/ ${effectiveGoals.calorieGoal} KCAL`}
                icon={Flame}
                accent
                tooltipContent={
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono tracking-wide">
                      <span className="text-[var(--text-muted)]">REMAINING</span>
                      <span className="text-accent font-bold">{Math.max(0, effectiveGoals.calorieGoal - totalCals)} KCAL</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${Math.min(100, (totalCals / effectiveGoals.calorieGoal) * 100)}%` }}
                      />
                    </div>
                  </div>
                }
              />
              <StatCard
                label="PROTEIN"
                value={`${totalProtein || 0}g`}
                subValue={`/ ${effectiveGoals.proteinGoal}g`}
                icon={Target}
                tooltipContent={
                  <div className="space-y-2">
                    <div className="flex justify-between text-xs font-mono tracking-wide">
                      <span className="text-[var(--text-muted)]">REMAINING</span>
                      <span className="text-accent font-bold">{Math.max(0, effectiveGoals.proteinGoal - totalProtein)}g</span>
                    </div>
                    <div className="h-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div
                        className="h-full bg-accent transition-all"
                        style={{ width: `${Math.min(100, (totalProtein / effectiveGoals.proteinGoal) * 100)}%` }}
                      />
                    </div>
                  </div>
                }
              />
              <StatCard label="WORKOUTS" value={workouts.length} subValue="TODAY" icon={Dumbbell} />
              <StatCard label="BURNED" value={(workouts.length || 0) * 150} subValue="KCAL" icon={Zap} />
            </div>

            {/* Water & Sleep - Flexible Input */}
            <div className="grid lg:grid-cols-2 gap-4">
              {/* Water Tracker */}
              <Card className="p-5" data-testid="water-tracker">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Droplets size={18} className="text-accent" strokeWidth={2.5} />
                    <span className="font-mono text-sm uppercase tracking-wider">Hydration</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="font-heading text-2xl">{waterIntake.toFixed(1)}/{waterGoal}</span>
                    <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wide">{waterUnit === 'glasses' ? 'GLS' : 'L'}</span>
                  </div>
                </div>

                <div>
                  {/* Visual glasses */}
                  {waterUnit === 'glasses' && (
                    <div className="flex gap-1.5 mb-3">
                      {Array.from({ length: waterGoalGlasses }).map((_, i) => (
                        <button
                          key={i}
                          onClick={() => setWaterIntake(i + 1)}
                          className={`flex-1 h-10 border transition-all ${
                            i < Math.floor(waterIntake) ? 'bg-accent border-accent' : 'bg-[var(--bg-elevated)] border-[var(--border-default)] hover:border-accent'
                          }`}
                        />
                      ))}
                    </div>
                  )}

                  {/* Quick buttons + custom input */}
                  <div className="flex gap-2">
                    <button onClick={() => setWaterIntake(Math.max(0, waterIntake - (waterUnit === 'glasses' ? 1 : 0.25)))} className="px-3 py-2 border border-[var(--border-default)] font-mono text-xs hover:border-accent transition-colors">
                      <Minus size={14} />
                    </button>
                    <button onClick={() => setWaterIntake(waterIntake + (waterUnit === 'glasses' ? 1 : 0.25))} className="px-3 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs">
                      <Plus size={14} />
                    </button>
                    <input
                      type="number"
                      step={waterUnit === 'glasses' ? 1 : 0.1}
                      value={customWaterInput}
                      onChange={(e) => setCustomWaterInput(e.target.value)}
                      placeholder={waterUnit === 'glasses' ? 'Add...' : 'Litres...'}
                      className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                    />
                    <button onClick={handleAddCustomWater} className="px-3 py-2 border border-[var(--border-default)] font-mono text-xs hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors">
                      ADD
                    </button>
                  </div>
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={() => setWaterUnit('glasses')}
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider border ${waterUnit === 'glasses' ? 'bg-accent text-[var(--theme-primary-text)] border-accent' : 'border-[var(--border-default)] hover:border-accent'}`}
                    >
                      Glasses
                    </button>
                    <button
                      onClick={() => setWaterUnit('litres')}
                      className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider border ${waterUnit === 'litres' ? 'bg-accent text-[var(--theme-primary-text)] border-accent' : 'border-[var(--border-default)] hover:border-accent'}`}
                    >
                      Litres
                    </button>
                  </div>
                </div>
              </Card>

              {/* Sleep Tracker */}
              <Card className="p-5" data-testid="sleep-tracker">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <BedDouble size={18} className="text-accent" strokeWidth={2.5} />
                    <span className="font-mono text-sm uppercase tracking-wider">Sleep</span>
                  </div>
                  <span className="font-heading text-2xl">{sleepHours}h</span>
                </div>
                <ProgressBar value={sleepHours} max={sleepGoal} />
                <div className="flex gap-2 mt-3">
                  <button onClick={() => setSleepHours(Math.max(0, sleepHours - 0.5))} className="px-3 py-2 border border-[var(--border-default)] font-mono text-xs hover:border-accent transition-colors">
                    -0.5h
                  </button>
                  <button onClick={() => setSleepHours(Math.min(14, sleepHours + 0.5))} className="px-3 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs">
                    +0.5h
                  </button>
                  <input
                    type="number"
                    step={0.5}
                    min={0}
                    max={24}
                    value={customSleepInput}
                    onChange={(e) => setCustomSleepInput(e.target.value)}
                    placeholder="Hours..."
                    className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-xs focus:outline-none focus:border-accent"
                  />
                  <button onClick={handleSetCustomSleep} className="px-3 py-2 border border-[var(--border-default)] font-mono text-xs hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors">
                    SET
                  </button>
                </div>
              </Card>
            </div>

            {/* Macro Progress */}
            <Card className="p-5">
              <h3 className="font-heading text-xl uppercase tracking-normal mb-4">Macro Breakdown</h3>
              <div className="grid lg:grid-cols-3 gap-6">
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1.5 tracking-wide">
                    <span>PROTEIN</span>
                    <span>{totalProtein}/{effectiveGoals.proteinGoal}g</span>
                  </div>
                  <ProgressBar value={totalProtein} max={effectiveGoals.proteinGoal} showLabel={false} />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1.5 tracking-wide">
                    <span>CARBS</span>
                    <span>{totalCarbs}/{effectiveGoals.carbGoal}g</span>
                  </div>
                  <ProgressBar value={totalCarbs} max={effectiveGoals.carbGoal} showLabel={false} />
                </div>
                <div>
                  <div className="flex justify-between text-xs font-mono mb-1.5 tracking-wide">
                    <span>FAT</span>
                    <span>{totalFat}/{effectiveGoals.fatGoal}g</span>
                  </div>
                  <ProgressBar value={totalFat} max={effectiveGoals.fatGoal} showLabel={false} />
                </div>
              </div>
            </Card>

            {/* Recent Activity & Badges */}
            <div className="grid lg:grid-cols-3 gap-4">
              <Card className="p-5 lg:col-span-2">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-heading text-xl uppercase tracking-normal">Today's Meals</h3>
                  <button onClick={() => setActiveTab("MEALS")} className="text-xs font-mono text-accent hover:underline tracking-wide">VIEW ALL</button>
                </div>
                {meals.length > 0 ? (
                  <div className="space-y-2">
                    {meals.slice(0, 3).map((meal: any) => (
                      <div key={meal._id} className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] group">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="text-[10px] font-mono bg-[var(--bg-main)] border border-[var(--border-default)] px-1.5 py-0.5 uppercase tracking-wider">{meal.mealType}</span>
                          <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                          <span className="font-medium tracking-wide">{meal.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <button
                            onClick={() => setLogAgainMeal(meal)}
                            className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-muted)] hover:text-accent transition-opacity"
                            title="Log again"
                          >
                            <Repeat size={12} />
                          </button>
                          <span className="font-mono text-accent tracking-wide">{meal.calories} KCAL</span>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-[var(--text-muted)] font-mono text-sm tracking-wide">NO MEALS LOGGED TODAY</div>
                )}
              </Card>

              <Card className="p-5" data-testid="badges-widget">
                <h3 className="font-heading text-xl uppercase tracking-normal mb-4">Badges</h3>
                <div className="grid grid-cols-4 gap-2">
                  {badges.slice(0, 8).map((badge) => {
                    const isUnlocked = unlockedBadges.includes(badge.id);
                    return (
                      <div
                        key={badge.id}
                        className={`aspect-square flex items-center justify-center border-2 transition-all ${
                          isUnlocked ? 'border-accent bg-accent/10' : 'border-[var(--border-default)] bg-[var(--bg-elevated)] opacity-40'
                        }`}
                        title={`${badge.name}: ${badge.description}`}
                      >
                        <badge.icon size={18} className={isUnlocked ? 'text-accent' : 'text-[var(--text-muted)]'} strokeWidth={2} />
                      </div>
                    );
                  })}
                </div>
                <div className="mt-3 text-xs font-mono text-[var(--text-muted)] tracking-wide">{unlockedBadges.length}/{badges.length} UNLOCKED</div>
              </Card>
            </div>

            {/* Log Again Confirm Cards (inline) */}
            {logAgainMeal && (
              <ConfirmLogCard
                mode="meal"
                initialData={{ description: logAgainMeal.name }}
  
                preParsed={{
                  name: logAgainMeal.name,
                  calories: logAgainMeal.calories,
                  protein: logAgainMeal.protein,
                  carbs: logAgainMeal.carbs,
                  fat: logAgainMeal.fat,
                  time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
                  mealType: logAgainMeal.mealType || "unspecified",
                  aiSuggestion: logAgainMeal.aiSuggestion,
                }}
                onConfirm={(data) => { commitMeal(data); setLogAgainMeal(null); }}
                onDiscard={() => setLogAgainMeal(null)}
              />
            )}
            {logAgainWorkout && (
              <ConfirmLogCard
                mode="workout"
                initialData={{ description: logAgainWorkout.name }}
  
                preParsed={{
                  name: logAgainWorkout.name,
                  sets: logAgainWorkout.sets,
                  duration: logAgainWorkout.duration,
                  intensity: logAgainWorkout.intensity,
                  rationale: logAgainWorkout.rationale,
                  exercises: logAgainWorkout.exercises,
                }}
                onConfirm={(data) => { commitWorkout(data); setLogAgainWorkout(null); }}
                onDiscard={() => setLogAgainWorkout(null)}
              />
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MEALS TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "MEALS" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="meals-tab">
            <PageHeader title="Meal Log" subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

            <RemainingBudget
              totalCals={totalCals}
              totalProtein={totalProtein}
              totalCarbs={totalCarbs}
              totalFat={totalFat}
              goals={effectiveGoals}
            />

            {mealConfirm ? (
              <ConfirmLogCard
                mode="meal"
                initialData={mealConfirm.initialData}
  
                onConfirm={(data) => {
                  commitMeal(data);
                  setMealConfirm(null);
                  setMealForm({ description: "", mealType: "breakfast", time: "" });
                }}
                onDiscard={() => setMealConfirm(null)}
              />
            ) : (
              <Card className="p-6">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">Log New Meal — AI Powered</h3>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <select
                      value={mealForm.mealType}
                      onChange={(e) => setMealForm({ ...mealForm, mealType: e.target.value })}
                      className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="breakfast">BREAKFAST</option>
                      <option value="lunch">LUNCH</option>
                      <option value="snack">SNACK</option>
                      <option value="dinner">DINNER</option>
                    </select>
                    <input
                      placeholder="Time (HH:MM)"
                      value={mealForm.time}
                      onChange={(e) => setMealForm({ ...mealForm, time: e.target.value })}
                      className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                    />
                  </div>
                  <div className="relative">
                    <textarea
                      placeholder="Describe your meal — what you ate, portion sizes, ingredients... AI will estimate macros."
                      value={mealForm.description}
                      onChange={(e) => setMealForm({ ...mealForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 pr-12 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed"
                    />
                    <VoiceInputButton
                      value={mealForm.description}
                      onChange={(text) => setMealForm({ ...mealForm, description: text })}
                      className="absolute bottom-3 right-3"
                    />
                  </div>
                  {mealError && <div className="text-xs font-mono text-red-400 tracking-wide">{mealError}</div>}
                  <button
                    onClick={() => {
                      if (!mealForm.description.trim()) {
                        setMealError("DESCRIPTION REQUIRED");
                        return;
                      }
                      setMealError(null);
                      setMealConfirm({
                        initialData: {
                          description: mealForm.description,
                          mealType: mealForm.mealType,
                          time: mealForm.time,
                        },
                      });
                    }}
                    disabled={!mealForm.description.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    <Sparkles size={16} />
                    AI Log Meal
                  </button>
                </div>
              </Card>
            )}

            <div className="space-y-3">
              {meals.length === 0 && (
                <Card className="p-8 text-center border-dashed">
                  <div className="font-mono text-sm text-[var(--text-muted)] tracking-wide">NO MEALS LOGGED TODAY</div>
                </Card>
              )}
              {meals.map((meal) => (
                <Card key={meal._id} className="p-4 hover:border-accent transition-colors group">
                  {editingMealId === meal._id && editMealForm ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs uppercase text-accent tracking-wider">EDIT MEAL</span>
                        <button onClick={() => { setEditingMealId(null); setEditMealForm(null); }} className="p-1 hover:text-red-400"><X size={14} /></button>
                      </div>
                      <div className="grid grid-cols-4 gap-3">
                        <input type="number" value={editMealForm.calories} onChange={(e) => setEditMealForm({ ...editMealForm, calories: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="KCAL" />
                        <input type="number" value={editMealForm.protein} onChange={(e) => setEditMealForm({ ...editMealForm, protein: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="P" />
                        <input type="number" value={editMealForm.carbs} onChange={(e) => setEditMealForm({ ...editMealForm, carbs: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="C" />
                        <input type="number" value={editMealForm.fat} onChange={(e) => setEditMealForm({ ...editMealForm, fat: Number(e.target.value) })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="F" />
                      </div>
                      <div className="flex gap-3">
                        <input value={editMealForm.name} onChange={(e) => setEditMealForm({ ...editMealForm, name: e.target.value })} className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Name" />
                        <input value={editMealForm.time} onChange={(e) => setEditMealForm({ ...editMealForm, time: e.target.value })} className="w-24 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Time" />
                        <select value={editMealForm.mealType} onChange={(e) => setEditMealForm({ ...editMealForm, mealType: e.target.value })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent">
                          <option value="breakfast">BREAKFAST</option>
                          <option value="lunch">LUNCH</option>
                          <option value="snack">SNACK</option>
                          <option value="dinner">DINNER</option>
                        </select>
                      </div>
                      <button onClick={() => handleUpdateMeal(meal._id)} className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
                        <Save size={12} /> SAVE
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 flex-wrap mb-2">
                            <span className="text-[10px] font-mono bg-[var(--bg-main)] border border-[var(--border-default)] px-1.5 py-0.5 uppercase tracking-wider">{meal.mealType}</span>
                            <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                            <h3 className="text-lg font-heading uppercase tracking-normal">{meal.name}</h3>
                          </div>
                          <div className="flex items-center gap-4 text-sm font-mono text-[var(--text-secondary)] tracking-wide">
                            <span><Flame size={14} className="inline mr-1" />{meal.calories} KCAL</span>
                            <span>P: {meal.protein}g</span>
                            <span>C: {meal.carbs}g</span>
                            <span>F: {meal.fat}g</span>
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <div className="flex items-center gap-1 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[100px]">
                            <button
                              onClick={() => {
                                setEditingMealId(meal._id);
                                setEditMealForm({
                                  name: meal.name,
                                  calories: meal.calories,
                                  protein: meal.protein,
                                  carbs: meal.carbs,
                                  fat: meal.fat,
                                  time: meal.time,
                                  mealType: meal.mealType || 'unspecified',
                                  aiSuggestion: meal.aiSuggestion || null,
                                });
                              }}
                              className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setLogAgainMeal(meal)}
                              className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                              title="Log again"
                            >
                              <Repeat size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setExpandedMealId(expandedMealId === meal._id ? null : meal._id);
                            }}
                            className="p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                            title="Details"
                          >
                            {expandedMealId === meal._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button onClick={() => handleDeleteMeal(meal._id)} className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedMealId === meal._id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-3 pt-3 border-t border-[var(--border-default)] space-y-2">
                              {meal.aiSuggestion && (
                                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                  <div className="text-[10px] font-mono uppercase text-accent tracking-wider mb-1">AI Note</div>
                                  <p className="text-sm text-[var(--text-secondary)] tracking-wide">{meal.aiSuggestion}</p>
                                </div>
                              )}
                              <div className="grid grid-cols-4 gap-2 text-center">
                                <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                  <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">CALORIES</div>
                                  <div className="font-heading">{meal.calories}</div>
                                </div>
                                <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                  <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">PROTEIN</div>
                                  <div className="font-heading">{meal.protein}g</div>
                                </div>
                                <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                  <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">CARBS</div>
                                  <div className="font-heading">{meal.carbs}g</div>
                                </div>
                                <div className="p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                  <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">FAT</div>
                                  <div className="font-heading">{meal.fat}g</div>
                                </div>
                              </div>
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
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
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="workout-tab">
            <PageHeader title="Training Log" subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

            {workoutConfirm ? (
              <ConfirmLogCard
                mode="workout"
                initialData={workoutConfirm.initialData}
  
                onConfirm={(data) => {
                  commitWorkout(data);
                  setWorkoutConfirm(null);
                  setWorkoutForm({ description: "", duration: "", intensity: "HIGH" });
                }}
                onDiscard={() => setWorkoutConfirm(null)}
              />
            ) : (
              <Card className="p-6">
                <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">Log Workout — AI Powered</h3>
                <div className="space-y-4">
                  <div className="relative">
                    <textarea
                      placeholder="Describe your workout — exercises, sets, reps, weights..."
                      value={workoutForm.description}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-4 py-3 pr-12 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed"
                    />
                    <VoiceInputButton
                      value={workoutForm.description}
                      onChange={(text) => setWorkoutForm({ ...workoutForm, description: text })}
                      className="absolute bottom-3 right-3"
                    />
                  </div>
                  <div className="flex gap-3">
                    <input
                      placeholder="Duration (e.g. 45 min)"
                      value={workoutForm.duration}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, duration: e.target.value })}
                      className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)]"
                    />
                    <select
                      value={workoutForm.intensity}
                      onChange={(e) => setWorkoutForm({ ...workoutForm, intensity: e.target.value })}
                      className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MAX">MAX</option>
                    </select>
                  </div>
                  {workoutError && <div className="text-xs font-mono text-red-400 tracking-wide">{workoutError}</div>}
                  <button
                    onClick={() => {
                      if (!workoutForm.description.trim()) {
                        setWorkoutError("DESCRIPTION REQUIRED");
                        return;
                      }
                      setWorkoutError(null);
                      setWorkoutConfirm({
                        initialData: {
                          description: workoutForm.description,
                          duration: workoutForm.duration,
                          intensity: workoutForm.intensity,
                        },
                      });
                    }}
                    disabled={!workoutForm.description.trim()}
                    className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    <Sparkles size={16} />
                    AI Log Workout
                  </button>
                </div>
              </Card>
            )}

            {/* Workout suggestion */}
            {suggestionConfirm ? (
              <ConfirmLogCard
                mode="workout"
                initialData={{ description: workoutSuggestion?.name || "" }}
  
                preParsed={{
                  name: workoutSuggestion.name,
                  sets: workoutSuggestion.sets,
                  duration: workoutSuggestion.duration,
                  intensity: workoutSuggestion.intensity,
                  rationale: workoutSuggestion.rationale,
                  exercises: null,
                }}
                onConfirm={(data) => {
                  commitWorkout(data);
                  setSuggestionConfirm(null);
                }}
                onDiscard={() => setSuggestionConfirm(null)}
              />
            ) : (
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)]">AI Workout Suggestion</h3>
                  <button
                    onClick={handleGetWorkoutSuggestion}
                    disabled={suggestionLoading}
                    className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
                  >
                    {suggestionLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    SUGGEST
                  </button>
                </div>
                {workoutSuggestion ? (
                  <div className="space-y-3">
                    <div className="flex items-center gap-3">
                      <span className={`text-[10px] font-mono px-2 py-1 ${workoutSuggestion.intensity === "MAX" ? "bg-red-600 text-white" : workoutSuggestion.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{workoutSuggestion.intensity}</span>
                      <h4 className="font-heading text-lg uppercase tracking-normal">{workoutSuggestion.name}</h4>
                      <span className="text-xs font-mono text-[var(--text-muted)] tracking-wide">{workoutSuggestion.duration}</span>
                    </div>
                    <div className="text-sm font-mono text-[var(--text-secondary)] tracking-wide">
                      {workoutSuggestion.sets && <span className="mr-4">{workoutSuggestion.sets}</span>}
                      {workoutSuggestion.reps && <span className="mr-4">{workoutSuggestion.reps} reps</span>}
                      {workoutSuggestion.weight && <span className="mr-4">{workoutSuggestion.weight}</span>}
                    </div>
                    {workoutSuggestion.rationale && (
                      <p className="text-xs text-[var(--text-muted)] tracking-wide">{workoutSuggestion.rationale}</p>
                    )}
                    <button
                      onClick={() => setSuggestionConfirm(workoutSuggestion)}
                      className="mt-2 flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity"
                    >
                      <Sparkles size={12} /> LOG THIS WORKOUT
                    </button>
                  </div>
                ) : (
                  <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">Click SUGGEST to get an AI-powered workout recommendation.</div>
                )}
              </Card>
            )}

            {/* Live Workout Mode */}
            {liveWorkoutMode && (
              <Card className="p-6 border-2 border-accent">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Play size={16} className="text-accent" />
                    <span className="font-mono text-sm uppercase text-accent tracking-wider">LIVE WORKOUT</span>
                  </div>
                  <button onClick={() => setLiveWorkoutMode(false)} className="p-1.5 hover:text-red-400"><X size={14} /></button>
                </div>
                <div className="space-y-4">
                  <div className="flex gap-3">
                    <input
                      placeholder="Workout name (optional)"
                      value={liveWorkoutName}
                      onChange={(e) => setLiveWorkoutName(e.target.value)}
                      className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                    />
                    <select
                      value={liveWorkoutIntensity}
                      onChange={(e) => setLiveWorkoutIntensity(e.target.value)}
                      className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                    >
                      <option value="LOW">LOW</option>
                      <option value="MEDIUM">MEDIUM</option>
                      <option value="HIGH">HIGH</option>
                      <option value="MAX">MAX</option>
                    </select>
                  </div>

                  {liveExercises.length > 0 && (
                    <div className="space-y-2">
                      {liveExercises.map((ex, ei) => (
                        <div key={ei} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                          <div className="font-mono text-sm tracking-wide mb-1">{ex.name}</div>
                          <div className="flex flex-wrap gap-2">
                            {ex.sets.map((s, si) => (
                              <span key={si} className="text-xs font-mono bg-[var(--bg-main)] border border-[var(--border-default)] px-2 py-1">{s.weight ? `${s.weight} × ` : ''}{s.reps}</span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}

                  <div className="p-3 bg-[var(--bg-main)] border border-[var(--border-default)]">
                    <div className="flex gap-2 mb-2">
                      <input
                        placeholder="Exercise name"
                        value={liveCurrentExercise}
                        onChange={(e) => setLiveCurrentExercise(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                      />
                    </div>
                    <div className="flex gap-2">
                      <input
                        placeholder="Weight"
                        value={liveCurrentWeight}
                        onChange={(e) => setLiveCurrentWeight(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                      />
                      <input
                        placeholder="Reps"
                        value={liveCurrentReps}
                        onChange={(e) => setLiveCurrentReps(e.target.value)}
                        className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent"
                      />
                      <button
                        onClick={addLiveExerciseSet}
                        disabled={!liveCurrentExercise.trim() || !liveCurrentReps.trim()}
                        className="px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50"
                      >
                        <Plus size={12} /> ADD SET
                      </button>
                    </div>
                  </div>

                  <button
                    onClick={finishLiveWorkout}
                    disabled={liveExercises.length === 0}
                    className="w-full py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50"
                  >
                    <Square size={12} className="inline mr-1" /> FINISH WORKOUT
                  </button>
                </div>
              </Card>
            )}

            {!liveWorkoutMode && (
              <button
                onClick={startLiveWorkout}
                className="w-full py-3 border-2 border-dashed border-accent text-accent font-mono text-xs uppercase tracking-wider font-bold hover:bg-accent hover:text-[var(--theme-primary-text)] transition-all"
              >
                <Play size={14} className="inline mr-2" /> START LIVE WORKOUT
              </button>
            )}

            <div className="space-y-3">
              {workouts.length === 0 && (
                <Card className="p-8 text-center border-dashed">
                  <div className="font-mono text-sm text-[var(--text-muted)] tracking-wide">NO WORKOUTS LOGGED TODAY</div>
                </Card>
              )}
              {workouts.map((w: any) => (
                <Card key={w._id} className="p-5 hover:border-accent transition-colors group" data-testid={`workout-${w._id}`}>
                  {editingWorkoutId === w._id && editWorkoutForm ? (
                    <div className="space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="font-mono text-xs uppercase text-accent tracking-wider">EDIT WORKOUT</span>
                        <button onClick={() => { setEditingWorkoutId(null); setEditWorkoutForm(null); }} className="p-1 hover:text-red-400"><X size={14} /></button>
                      </div>
                      <div className="flex gap-3">
                        <input value={editWorkoutForm.name} onChange={(e) => setEditWorkoutForm({ ...editWorkoutForm, name: e.target.value })} className="flex-1 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Name" />
                        <input value={editWorkoutForm.duration} onChange={(e) => setEditWorkoutForm({ ...editWorkoutForm, duration: e.target.value })} className="w-28 px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent" placeholder="Duration" />
                        <select value={editWorkoutForm.intensity} onChange={(e) => setEditWorkoutForm({ ...editWorkoutForm, intensity: e.target.value })} className="px-3 py-2 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent">
                          <option value="LOW">LOW</option>
                          <option value="MEDIUM">MEDIUM</option>
                          <option value="HIGH">HIGH</option>
                          <option value="MAX">MAX</option>
                        </select>
                      </div>
                      <button onClick={() => handleUpdateWorkout(w._id)} className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
                        <Save size={12} /> SAVE
                      </button>
                    </div>
                  ) : (
                    <>
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                            <span className={`text-[10px] font-mono px-2 py-1 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{w.intensity}</span>
                            <h3 className="text-lg font-heading uppercase tracking-normal">{w.name}</h3>
                            {w.duration && <span className="text-xs font-mono text-[var(--text-muted)] tracking-wide">{w.duration}</span>}
                          </div>
                        </div>
                        <div className="flex items-center gap-1 ml-2">
                          <div className="flex items-center gap-1 overflow-hidden transition-all duration-200 max-w-0 group-hover:max-w-[100px]">
                            <button
                              onClick={() => {
                                setEditingWorkoutId(w._id);
                                setEditWorkoutForm({
                                  name: w.name,
                                  sets: w.sets,
                                  duration: w.duration || '',
                                  intensity: w.intensity,
                                  exercises: w.exercises || null,
                                  rationale: w.rationale || null,
                                });
                              }}
                              className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                              title="Edit"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => setLogAgainWorkout(w)}
                              className="shrink-0 p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                              title="Log again"
                            >
                              <Repeat size={14} />
                            </button>
                          </div>
                          <button
                            onClick={() => {
                              setExpandedWorkoutId(expandedWorkoutId === w._id ? null : w._id);
                            }}
                            className="p-2 border border-[var(--border-default)] hover:border-accent transition-all"
                            title="Details"
                          >
                            {expandedWorkoutId === w._id ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                          </button>
                          <button onClick={() => handleDeleteWorkout(w._id)} className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </div>
                      <AnimatePresence>
                        {expandedWorkoutId === w._id && (
                          <motion.div initial={{ height: 0, opacity: 0 }} animate={{ height: 'auto', opacity: 1 }} exit={{ height: 0, opacity: 0 }} className="overflow-hidden">
                            <div className="mt-3 pt-3 border-t border-[var(--border-default)] space-y-2">
                              {w.rationale && (
                                <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                  <div className="text-[10px] font-mono uppercase text-accent tracking-wider mb-1">AI Note</div>
                                  <p className="text-sm text-[var(--text-secondary)] tracking-wide">{w.rationale}</p>
                                </div>
                              )}
                              {w.exercises && w.exercises.length > 0 && (
                                <div className="space-y-2">
                                  {w.exercises.map((ex: any, ei: number) => (
                                    <div key={ei} className="p-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                      <div className="font-mono text-sm tracking-wide mb-1">{ex.name}</div>
                                      <div className="flex flex-wrap gap-2">
                                        {ex.sets.map((s: any, si: number) => (
                                          <span key={si} className="text-xs font-mono bg-[var(--bg-main)] border border-[var(--border-default)] px-2 py-1">{s.weight ? `${s.weight} × ` : ''}{s.reps}</span>
                                        ))}
                                      </div>
                                    </div>
                                  ))}
                                </div>
                              )}
                              {!w.rationale && (!w.exercises || w.exercises.length === 0) && (
                                <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">No detailed breakdown available.</div>
                              )}
                            </div>
                          </motion.div>
                        )}
                      </AnimatePresence>
                    </>
                  )}
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            RECIPES TAB — 2-Panel System
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "RECIPES" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="recipes-tab">
            <div className="flex items-center justify-between">
              <PageHeader title="My Recipes" />
              <button
                data-testid="add-recipe-btn"
                onClick={() => setShowRecipeForm(true)}
                className="flex items-center gap-2 px-4 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold"
              >
                <Plus size={14} strokeWidth={3} /> New Recipe
              </button>
            </div>

            {/* Recipe Modal */}
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
                    initial={{ scale: 0.95 }}
                    animate={{ scale: 1 }}
                    exit={{ scale: 0.95 }}
                    className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-2xl max-h-[90vh] overflow-y-auto"
                    onClick={(e) => e.stopPropagation()}
                  >
                    <div className="p-6 border-b border-[var(--border-default)] flex items-center justify-between">
                      <h2 className="font-heading text-2xl uppercase tracking-normal">Add Recipe</h2>
                      <button onClick={() => setShowRecipeForm(false)} className="p-2 hover:bg-[var(--bg-elevated)]"><X size={20} /></button>
                    </div>
                    <div className="p-6 space-y-4">
                      <div>
                        <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Recipe Name *</label>
                        <input
                          data-testid="recipe-name"
                          value={recipeForm.name}
                          onChange={(e) => setRecipeForm({ ...recipeForm, name: e.target.value })}
                          className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent"
                          placeholder="e.g. High Protein Breakfast Bowl"
                        />
                      </div>
                      <div className="grid grid-cols-3 gap-4">
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Servings</label>
                          <input data-testid="recipe-servings" value={recipeForm.servings} onChange={(e) => setRecipeForm({ ...recipeForm, servings: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                        </div>
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Prep Time</label>
                          <input data-testid="recipe-prep-time" value={recipeForm.prepTime} onChange={(e) => setRecipeForm({ ...recipeForm, prepTime: e.target.value })} placeholder="10 min" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                        </div>
                        <div>
                          <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Cook Time</label>
                          <input data-testid="recipe-cook-time" value={recipeForm.cookTime} onChange={(e) => setRecipeForm({ ...recipeForm, cookTime: e.target.value })} placeholder="15 min" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                        </div>
                      </div>
                      <div>
                        <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Ingredients</label>
                        <textarea data-testid="recipe-ingredients" value={recipeForm.ingredients} onChange={(e) => setRecipeForm({ ...recipeForm, ingredients: e.target.value })} rows={4} placeholder="List ingredients with portions (one per line)" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Instructions</label>
                        <textarea data-testid="recipe-instructions" value={recipeForm.instructions} onChange={(e) => setRecipeForm({ ...recipeForm, instructions: e.target.value })} rows={4} placeholder="Step-by-step cooking method..." className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
                      </div>
                      <div>
                        <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wide">Notes (For AI Coach)</label>
                        <textarea data-testid="recipe-notes" value={recipeForm.notes} onChange={(e) => setRecipeForm({ ...recipeForm, notes: e.target.value })} rows={2} placeholder="Any notes for the AI coach..." className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
                      </div>
                      <button data-testid="save-recipe-btn" onClick={handleSaveRecipe} disabled={!recipeForm.name.trim()} className="w-full py-4 bg-accent text-[var(--theme-primary-text)] font-mono uppercase tracking-wider font-bold disabled:opacity-50">
                        Save Recipe
                      </button>
                    </div>
                  </motion.div>
                </motion.div>
              )}
            </AnimatePresence>

            {recipes.length === 0 ? (
              <Card className="p-12 text-center border-dashed">
                <ChefHat size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
                <h3 className="font-heading text-xl uppercase mb-2 tracking-normal">No Recipes Yet</h3>
                <p className="text-sm font-mono text-[var(--text-muted)] mb-4 tracking-wide">Add your favorite healthy recipes for the AI coach to analyze.</p>
                <button onClick={() => setShowRecipeForm(true)} className="px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wide">
                  Add First Recipe
                </button>
              </Card>
            ) : selectedRecipeId ? (
              /* ═══ 2-PANEL VIEW ═══ */
              <div className="flex flex-col lg:flex-row gap-0 border border-[var(--border-default)] overflow-hidden min-h-[500px]">
                {/* Left Panel — Recipe List */}
                <div className="w-full lg:w-80 shrink-0 border-b lg:border-b-0 lg:border-r border-[var(--border-default)] overflow-y-auto bg-[var(--bg-card)] max-h-[40vh] lg:max-h-none">
                  <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between">
                    <span className="text-xs font-mono uppercase tracking-wider text-[var(--text-muted)]">{recipes.length} RECIPES</span>
                    <button onClick={() => { setSelectedRecipeId(null); setRecipeAiNote(null); }} className="p-1.5 hover:text-accent transition-colors" title="Close panel">
                      <ArrowLeft size={14} />
                    </button>
                  </div>
                  {recipes.map((recipe) => (
                    <button
                      key={recipe.id}
                      onClick={() => { setSelectedRecipeId(recipe.id); setEditingRecipeId(null); setRecipeAiNote(null); }}
                      className={`w-full text-left px-4 py-3 border-b border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors ${selectedRecipeId === recipe.id ? 'bg-[var(--bg-elevated)] border-l-2 border-l-accent' : ''}`}
                    >
                      <div className="font-mono text-sm tracking-wide truncate">{recipe.name}</div>
                      <div className="flex gap-3 mt-1 text-[10px] font-mono text-[var(--text-muted)] tracking-wide">
                        {recipe.servings && <span>{recipe.servings} srv</span>}
                        {recipe.prepTime && <span>prep {recipe.prepTime}</span>}
                      </div>
                    </button>
                  ))}
                </div>

                {/* Right Panel — Recipe Detail */}
                <div className="flex-1 min-w-0 overflow-y-auto p-6">
                  {(() => {
                    const recipe = recipes.find(r => r.id === selectedRecipeId);
                    if (!recipe) return null;
                    return (
                      <div className="space-y-6">
                        {editingRecipeId === recipe.id ? (
                          <div className="space-y-4">
                            <div className="flex items-center justify-between">
                              <span className="font-mono text-xs uppercase text-accent tracking-wider">EDIT RECIPE</span>
                              <button onClick={() => { setEditingRecipeId(null); setEditRecipeForm(null); }} className="p-1 hover:text-red-400"><X size={14} /></button>
                            </div>
                            <input value={editRecipeForm.name} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, name: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" placeholder="Recipe Name" />
                            <div className="grid grid-cols-3 gap-4">
                              <input value={editRecipeForm.servings} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, servings: e.target.value })} placeholder="Servings" className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                              <input value={editRecipeForm.prepTime} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, prepTime: e.target.value })} placeholder="Prep Time" className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                              <input value={editRecipeForm.cookTime} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, cookTime: e.target.value })} placeholder="Cook Time" className="px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                            </div>
                            <textarea value={editRecipeForm.ingredients} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, ingredients: e.target.value })} rows={4} placeholder="Ingredients" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
                            <textarea value={editRecipeForm.instructions} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, instructions: e.target.value })} rows={4} placeholder="Instructions" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
                            <textarea value={editRecipeForm.notes} onChange={(e) => setEditRecipeForm({ ...editRecipeForm, notes: e.target.value })} rows={2} placeholder="Notes" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent resize-none leading-relaxed" />
                            <button onClick={handleSaveEditRecipe} className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold">
                              <Save size={14} /> SAVE CHANGES
                            </button>
                          </div>
                        ) : (
                          <>
                            <div className="flex items-start justify-between">
                              <div>
                                <h2 className="font-heading text-3xl uppercase tracking-normal mb-2">{recipe.name}</h2>
                                <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)] tracking-wide">
                                  {recipe.servings && <span>{recipe.servings} SERVINGS</span>}
                                  {recipe.prepTime && <span>PREP: {recipe.prepTime}</span>}
                                  {recipe.cookTime && <span>COOK: {recipe.cookTime}</span>}
                                </div>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => {
                                    setEditingRecipeId(recipe.id);
                                    setEditRecipeForm({ ...recipe });
                                  }}
                                  className="flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-colors"
                                >
                                  <Pencil size={12} /> EDIT
                                </button>
                                <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                                  <Trash2 size={14} />
                                </button>
                              </div>
                            </div>

                            {recipe.ingredients && (
                              <div>
                                <h3 className="font-mono text-xs uppercase text-[var(--text-muted)] mb-3 tracking-wider">Ingredients</h3>
                                <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] whitespace-pre-line text-sm text-[var(--text-secondary)] leading-relaxed">{recipe.ingredients}</div>
                              </div>
                            )}

                            {recipe.instructions && (
                              <div>
                                <h3 className="font-mono text-xs uppercase text-[var(--text-muted)] mb-3 tracking-wider">Instructions</h3>
                                <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] whitespace-pre-line text-sm text-[var(--text-secondary)] leading-relaxed">{recipe.instructions}</div>
                              </div>
                            )}

                            {recipe.notes && (
                              <div>
                                <h3 className="font-mono text-xs uppercase text-[var(--text-muted)] mb-3 tracking-wider">Notes</h3>
                                <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-sm text-[var(--text-secondary)] leading-relaxed">{recipe.notes}</div>
                              </div>
                            )}

                            {/* AI Note Section */}
                            <div className="border border-[var(--border-default)] p-4">
                              <div className="flex items-center justify-between mb-3">
                                <h3 className="font-mono text-xs uppercase text-accent tracking-wider flex items-center gap-2">
                                  <Sparkles size={12} /> AI NUTRITION NOTE
                                </h3>
                                {!recipeAiNote && (
                                  <button
                                    onClick={() => handleGenerateRecipeNote(recipe)}
                                    disabled={recipeAiLoading}
                                    className="flex items-center gap-2 px-3 py-1.5 bg-accent text-[var(--theme-primary-text)] font-mono text-[10px] uppercase tracking-wider font-bold disabled:opacity-50"
                                  >
                                    {recipeAiLoading ? <Loader2 size={10} className="animate-spin" /> : <Sparkles size={10} />}
                                    GENERATE
                                  </button>
                                )}
                              </div>
                              {recipeAiLoading ? (
                                <div className="flex items-center gap-2 text-sm text-[var(--text-muted)]">
                                  <Loader2 size={14} className="animate-spin text-accent" />
                                  <span className="font-mono tracking-wide">Analyzing recipe...</span>
                                </div>
                              ) : recipeAiNote ? (
                                <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide">{recipeAiNote}</p>
                              ) : (
                                <p className="text-sm text-[var(--text-muted)] tracking-wide">Click GENERATE to get an AI-powered nutrition analysis of this recipe.</p>
                              )}
                            </div>

                            {recipeLogConfirm?.id === recipe.id ? (
                              <ConfirmLogCard
                                mode="meal"
                                initialData={{
                                  description: `${recipe.name}. Ingredients: ${recipe.ingredients}`,
                                  mealType: "unspecified",
                                  time: "",
                                }}
                  
                                onConfirm={(data) => {
                                  commitMeal(data);
                                  setRecipeLogConfirm(null);
                                }}
                                onDiscard={() => setRecipeLogConfirm(null)}
                              />
                            ) : (
                              <button
                                onClick={() => setRecipeLogConfirm(recipe)}
                                className="flex items-center gap-2 px-4 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity"
                              >
                                <Utensils size={12} /> LOG AS MEAL
                              </button>
                            )}
                          </>
                        )}
                      </div>
                    );
                  })()}
                </div>
              </div>
            ) : (
              /* ═══ GRID VIEW ═══ */
              <div className="grid lg:grid-cols-2 gap-4">
                {recipes.map((recipe) => (
                  <div key={recipe.id}>
                    {recipeLogConfirm?.id === recipe.id ? (
                      <ConfirmLogCard
                        mode="meal"
                        initialData={{
                          description: `${recipe.name}. Ingredients: ${recipe.ingredients}`,
                          mealType: "unspecified",
                          time: "",
                        }}
          
                        onConfirm={(data) => {
                          commitMeal(data);
                          setRecipeLogConfirm(null);
                        }}
                        onDiscard={() => setRecipeLogConfirm(null)}
                      />
                    ) : (
                      <Card
                        className="p-5 cursor-pointer hover:border-accent transition-colors"
                        onClick={() => setSelectedRecipeId(recipe.id)}
                      >
                        <div className="flex items-start justify-between mb-3">
                          <h3 className="font-heading text-xl uppercase tracking-normal">{recipe.name}</h3>
                          <button
                            onClick={(e) => { e.stopPropagation(); handleDeleteRecipe(recipe.id); }}
                            className="p-2 hover:bg-red-600 hover:text-white transition-colors"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                        <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)] mb-3 tracking-wide">
                          {recipe.servings && <span>{recipe.servings} SERVINGS</span>}
                          {recipe.prepTime && <span>PREP: {recipe.prepTime}</span>}
                          {recipe.cookTime && <span>COOK: {recipe.cookTime}</span>}
                        </div>
                        {recipe.ingredients && <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line line-clamp-3 leading-relaxed">{recipe.ingredients}</p>}
                        <div className="mt-3 flex items-center gap-2 text-xs font-mono text-accent tracking-wide">
                          <ChevronDown size={10} /> CLICK TO OPEN
                        </div>
                      </Card>
                    )}
                  </div>
                ))}
              </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            INSIGHTS TAB - Enhanced with visualization buttons
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "INSIGHTS" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="insights-tab">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
              <PageHeader title="Insights" subtitle="Your fitness analytics and AI-powered recommendations" />
              <div className="flex gap-2 flex-wrap">
                <button onClick={() => setInsightView('overview')} className={`px-3 py-2 font-mono text-xs uppercase tracking-wide ${insightView === 'overview' ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}>
                  <BarChart2 size={14} className="inline mr-1" /> Overview
                </button>
                <button onClick={() => setInsightView('calories')} className={`px-3 py-2 font-mono text-xs uppercase tracking-wide ${insightView === 'calories' ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}>
                  <LineChart size={14} className="inline mr-1" /> Calories
                </button>
                <button onClick={() => setInsightView('macros')} className={`px-3 py-2 font-mono text-xs uppercase tracking-wide ${insightView === 'macros' ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}>
                  <PieChart size={14} className="inline mr-1" /> Macros
                </button>
                <button onClick={() => setInsightView('trends')} className={`px-3 py-2 font-mono text-xs uppercase tracking-wide ${insightView === 'trends' ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}>
                  <TrendingUp size={14} className="inline mr-1" /> Trends
                </button>
              </div>
            </div>

            {/* Stats Row */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="CALORIES" value={totalCals || 0} subValue={`${Math.round(((totalCals || 0) / effectiveGoals.calorieGoal) * 100)}% of goal`} icon={Flame} accent />
              <StatCard label="PROTEIN" value={`${totalProtein || 0}g`} subValue={`${Math.round(((totalProtein || 0) / effectiveGoals.proteinGoal) * 100)}% of goal`} icon={Target} />
              <StatCard label="HYDRATION" value={`${waterIntake}/${waterGoal}`} subValue={waterUnit.toUpperCase()} icon={Droplets} />
              <StatCard label="SLEEP" value={`${sleepHours}h`} subValue={sleepHours >= sleepGoal ? "GOAL MET" : `${(sleepGoal - sleepHours).toFixed(1)}h short`} icon={BedDouble} />
            </div>

            {/* Visualization Area based on selected view */}
            <Card className="p-6">
              {insightView === 'overview' && (
                <>
                  <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Weekly Overview</h2>
                  {weeklySummary ? (
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide mb-4">{weeklySummary.content}</p>
                  ) : (
                    <div className="text-sm font-mono text-[var(--text-muted)] mb-4 tracking-wide">
                      No weekly summary yet. <button onClick={handleGenerateWeeklySummary} className="text-accent hover:underline">Generate one</button>
                    </div>
                  )}
                  {weeklyLoading && <Loader2 size={16} className="animate-spin text-accent mb-4" />}
                </>
              )}
              {insightView === 'calories' && (
                <>
                  <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Calorie Tracking</h2>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">TODAY</div>
                      <div className="font-heading text-xl">{totalCals}</div>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">GOAL</div>
                      <div className="font-heading text-xl">{effectiveGoals.calorieGoal}</div>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">REMAINING</div>
                      <div className="font-heading text-xl text-accent">{effectiveGoals.calorieGoal - totalCals}</div>
                    </div>
                  </div>
                </>
              )}
              {insightView === 'macros' && (
                <>
                  <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Macro Distribution</h2>
                  <div className="flex items-center justify-center mb-6">
                    <div className="relative w-48 h-48">
                      <svg className="w-full h-full" viewBox="0 0 100 100">
                        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--bg-elevated)" strokeWidth="20" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke="var(--theme-primary)" strokeWidth="20" strokeDasharray="100 151" strokeDashoffset="-25" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#FF3B30" strokeWidth="20" strokeDasharray="60 191" strokeDashoffset="-125" />
                        <circle cx="50" cy="50" r="40" fill="none" stroke="#00FFFF" strokeWidth="20" strokeDasharray="40 211" strokeDashoffset="-185" />
                      </svg>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <div className="text-center">
                          <div className="font-heading text-2xl">{totalCals}</div>
                          <div className="text-xs font-mono text-[var(--text-muted)]">KCAL</div>
                        </div>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-accent" />
                      <div>
                        <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">PROTEIN</div>
                        <div className="font-heading">{totalProtein}g</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#FF3B30]" />
                      <div>
                        <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">CARBS</div>
                        <div className="font-heading">{totalCarbs}g</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#00FFFF]" />
                      <div>
                        <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">FAT</div>
                        <div className="font-heading">{totalFat}g</div>
                      </div>
                    </div>
                  </div>
                </>
              )}
              {insightView === 'trends' && (
                <>
                  <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Progress Trends</h2>
                  <div className="space-y-4">
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="flex items-center gap-3">
                        <TrendingUp size={20} className="text-green-500" />
                        <span className="font-mono tracking-wide">Meals logged today: {meals.length}</span>
                      </div>
                      <span className="text-green-500 font-heading">+{meals.length}</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="flex items-center gap-3">
                        <TrendingUp size={20} className="text-green-500" />
                        <span className="font-mono tracking-wide">Workouts logged today: {workouts.length}</span>
                      </div>
                      <span className="text-green-500 font-heading">+{workouts.length}</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="flex items-center gap-3">
                        <Activity size={20} className="text-yellow-500" />
                        <span className="font-mono tracking-wide">Calorie progress: {Math.round((totalCals / effectiveGoals.calorieGoal) * 100)}%</span>
                      </div>
                      <span className="text-yellow-500 font-heading">{Math.round((totalCals / effectiveGoals.calorieGoal) * 100)}%</span>
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* AI Insights */}
            <Card className="p-6 border-l-4 border-l-accent">
              <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                  <BrainCircuit size={24} className="text-accent" strokeWidth={2} />
                  <h2 className="font-heading text-2xl uppercase tracking-normal">AI Recommendations</h2>
                </div>
                <button
                  onClick={handleGenerateDailyInsights}
                  disabled={insightsLoading}
                  className="flex items-center gap-2 px-4 py-2 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {insightsLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                  GENERATE
                </button>
              </div>
              <div className="space-y-3">
                {dailyInsightsData?.insights?.length > 0 ? dailyInsightsData.insights.map((insight: string, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-start gap-3 p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="w-6 h-6 bg-accent flex items-center justify-center shrink-0">
                      <span className="text-xs font-mono font-bold text-[var(--theme-primary-text)]">{i + 1}</span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide">{insight}</p>
                  </motion.div>
                )) : (
                  <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">
                    No insights yet. Click GENERATE to get AI-powered recommendations based on today's data.
                  </div>
                )}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            HISTORY TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "HISTORY" && (
          <motion.div ref={historyContainerRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col flex-1 min-h-0" data-testid="history-tab">
            <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4 mb-4">
              <PageHeader title="History" subtitle="Review your past meals and workouts" />
              <div className="flex gap-2 flex-wrap">
                {historyView === 'day' && (
                  <button
                    onClick={() => setCalendarHidden(!calendarHidden)}
                    className="lg:hidden flex items-center gap-2 px-3 py-2 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wide hover:border-accent transition-colors"
                  >
                    <Calendar size={14} /> {calendarHidden ? 'Show Calendar' : 'Hide Calendar'}
                  </button>
                )}
                <button onClick={() => setHistoryView('day')} className={`px-3 py-2 font-mono text-xs uppercase tracking-wide ${historyView === 'day' ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}>
                  <Calendar size={14} className="inline mr-1" /> Day View
                </button>
                <button onClick={() => setHistoryView('insights')} className={`px-3 py-2 font-mono text-xs uppercase tracking-wide ${historyView === 'insights' ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}>
                  <BarChart2 size={14} className="inline mr-1" /> Insights
                </button>
              </div>
            </div>

            {historyView === 'insights' && (
              <div className="space-y-6 overflow-y-auto">
                <Card className="p-6">
                  <div className="flex items-center justify-between mb-4">
                    <h3 className="font-heading text-xl uppercase tracking-normal">Trends</h3>
                    <div className="flex gap-2">
                      {[7, 14, 30].map((d) => (
                        <button
                          key={d}
                          onClick={() => setHistoryInsightDays(d)}
                          className={`px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider ${historyInsightDays === d ? 'bg-accent text-[var(--theme-primary-text)]' : 'border border-[var(--border-default)] hover:border-accent'}`}
                        >
                          {d}D
                        </button>
                      ))}
                    </div>
                  </div>

                  {historyInsights?.daily ? (
                    <div className="space-y-8">
                      {/* Calories Chart */}
                      <div>
                        <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Calories vs Goal</div>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <AreaChart data={historyInsights.daily}>
                              <defs>
                                <linearGradient id="calsGradient" x1="0" y1="0" x2="0" y2="1">
                                  <stop offset="5%" stopColor="var(--theme-primary)" stopOpacity={0.3} />
                                  <stop offset="95%" stopColor="var(--theme-primary)" stopOpacity={0} />
                                </linearGradient>
                              </defs>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="var(--text-muted)" fontSize={10} fontFamily="monospace" />
                              <YAxis stroke="var(--text-muted)" fontSize={10} fontFamily="monospace" />
                              <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', fontFamily: 'monospace', fontSize: 12 }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                              />
                              <ReferenceLine y={historyInsights.goals.calories} stroke="var(--theme-primary)" strokeDasharray="4 4" />
                              <Area type="monotone" dataKey="calories" stroke="var(--theme-primary)" fill="url(#calsGradient)" strokeWidth={2} />
                            </AreaChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Macros Chart */}
                      <div>
                        <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Macros Over Time</div>
                        <div className="h-64">
                          <ResponsiveContainer width="100%" height="100%">
                            <ReLineChart data={historyInsights.daily}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="var(--text-muted)" fontSize={10} fontFamily="monospace" />
                              <YAxis stroke="var(--text-muted)" fontSize={10} fontFamily="monospace" />
                              <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', fontFamily: 'monospace', fontSize: 12 }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                              />
                              <ReferenceLine y={historyInsights.goals.protein} stroke="#FF3B30" strokeDasharray="4 4" />
                              <ReLine type="monotone" dataKey="protein" stroke="#FF3B30" strokeWidth={2} dot={false} />
                              <ReLine type="monotone" dataKey="carbs" stroke="#00FFFF" strokeWidth={2} dot={false} />
                              <ReLine type="monotone" dataKey="fat" stroke="#FFD700" strokeWidth={2} dot={false} />
                            </ReLineChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="flex gap-4 mt-2">
                          <div className="flex items-center gap-1.5 text-xs font-mono"><div className="w-3 h-1 bg-[#FF3B30]" /> Protein</div>
                          <div className="flex items-center gap-1.5 text-xs font-mono"><div className="w-3 h-1 bg-[#00FFFF]" /> Carbs</div>
                          <div className="flex items-center gap-1.5 text-xs font-mono"><div className="w-3 h-1 bg-[#FFD700]" /> Fat</div>
                        </div>
                      </div>

                      {/* Workouts Chart */}
                      <div>
                        <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Workouts</div>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={historyInsights.daily}>
                              <CartesianGrid strokeDasharray="3 3" stroke="var(--border-default)" />
                              <XAxis dataKey="date" tickFormatter={(d) => d.slice(5)} stroke="var(--text-muted)" fontSize={10} fontFamily="monospace" />
                              <YAxis stroke="var(--text-muted)" fontSize={10} fontFamily="monospace" allowDecimals={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: 'var(--bg-card)', border: '1px solid var(--border-default)', fontFamily: 'monospace', fontSize: 12 }}
                                itemStyle={{ color: 'var(--text-primary)' }}
                              />
                              <Bar dataKey="workouts" fill="var(--theme-primary)" />
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </div>

                      {/* Summary Stats */}
                      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                        {(() => {
                          const days = historyInsights.daily;
                          const avgCals = Math.round(days.reduce((s: number, d: any) => s + d.calories, 0) / days.length);
                          const avgProtein = Math.round(days.reduce((s: number, d: any) => s + d.protein, 0) / days.length);
                          const totalWorkouts = days.reduce((s: number, d: any) => s + d.workouts, 0);
                          const streakDays = days.reduce((max: number, d: any, i: number, arr: any[]) => {
                            let count = 0;
                            for (let j = i; j >= 0 && (arr[j].meals > 0 || arr[j].workouts > 0); j--) count++;
                            return Math.max(max, count);
                          }, 0);
                          return (
                            <>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">AVG CALORIES</div>
                                <div className="font-heading text-xl">{avgCals}</div>
                              </div>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">AVG PROTEIN</div>
                                <div className="font-heading text-xl">{avgProtein}g</div>
                              </div>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">TOTAL WORKOUTS</div>
                                <div className="font-heading text-xl">{totalWorkouts}</div>
                              </div>
                              <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                                <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">LOGGING STREAK</div>
                                <div className="font-heading text-xl">{streakDays}d</div>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  ) : (
                    <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">No insights data available.</div>
                  )}
                </Card>
              </div>
            )}

            {historyView === 'day' && (
            <div className="flex flex-col lg:flex-row gap-0 border border-[var(--border-default)] overflow-hidden flex-1 min-h-0 bg-[var(--bg-card)]">
              {/* Calendar */}
              <div
                style={{ width: isDesktop ? `${calendarPanelPct}%` : undefined }}
                className={`shrink-0 overflow-hidden ${calendarHidden ? 'hidden lg:block' : 'block'} ${isDesktop ? '' : 'w-full'}`}
              >
                <div className="lg:h-full lg:border-r border-[var(--border-default)] p-4 flex flex-col overflow-y-auto max-h-[45vh] lg:max-h-none">
                  <div className="flex items-center justify-between mb-4">
                    <button onClick={handlePrevMonth} className="p-2 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"><ChevronLeft size={14} /></button>
                    <h2 className="font-heading text-lg tracking-normal">{monthNames[calendarMonth - 1]} {calendarYear}</h2>
                    <button onClick={handleNextMonth} className="p-2 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"><ChevronRight size={14} /></button>
                  </div>

                  <div className="grid grid-cols-7 gap-1 mb-2">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => (
                      <div key={i} className="text-center text-[10px] font-mono text-[var(--text-muted)] py-1 tracking-wide">{d}</div>
                    ))}
                  </div>

                  <div className="grid grid-cols-7 gap-1">
                    {Array.from({ length: getFirstDayOfMonth(calendarYear, calendarMonth) }).map((_, i) => <div key={`empty-${i}`} />)}
                    {Array.from({ length: getDaysInMonth(calendarYear, calendarMonth) }).map((_, i) => {
                      const day = i + 1;
                      const dateStr = `${calendarYear}-${String(calendarMonth).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
                      const dayData = calendarData[dateStr];
                      const isToday = dateStr === today;
                      const isSelected = dateStr === selectedDate;
                      return (
                        <button
                          key={day}
                          onClick={() => { handleSelectDate(dateStr); if (!isDesktop) setCalendarHidden(true); }}
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
                </div>
              </div>

              {/* Resize Handle */}
              <div
                className="hidden lg:block w-1 shrink-0 cursor-col-resize hover:bg-accent transition-colors bg-[var(--border-default)]"
                onMouseDown={(e) => { resizeRef.current = { startX: e.clientX, startPct: calendarPanelPct }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
              />

              {/* Day Detail */}
              <div className="flex-1 min-w-0 overflow-y-auto p-4">
                {historyAddMealDate && (
                  <ConfirmLogCard
                    mode="meal"
                    initialData={{ description: "", mealType: "unspecified", time: "" }}
      
                    onConfirm={(data) => {
                      commitMeal(data, historyAddMealDate);
                      setHistoryAddMealDate(null);
                      handleSelectDate(historyAddMealDate);
                    }}
                    onDiscard={() => setHistoryAddMealDate(null)}
                  />
                )}
                {historyAddWorkoutDate && (
                  <ConfirmLogCard
                    mode="workout"
                    initialData={{ description: "", duration: "", intensity: "HIGH" }}
      
                    onConfirm={(data) => {
                      commitWorkout(data, historyAddWorkoutDate);
                      setHistoryAddWorkoutDate(null);
                      handleSelectDate(historyAddWorkoutDate);
                    }}
                    onDiscard={() => setHistoryAddWorkoutDate(null)}
                  />
                )}
                {selectedDate && historyDayData && !historyAddMealDate && !historyAddWorkoutDate ? (
                  <>
                    <h3 className="font-heading text-xl uppercase mb-4 tracking-normal">
                      {new Date(selectedDate + "T12:00:00").toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
                    </h3>

                    {historyDayData.meals.length > 0 && (
                      <div className="mb-6">
                        <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Meals ({historyDayData.meals.length})</div>
                        <div className="space-y-2">
                          {historyDayData.meals.map((m: any) => (
                            <div key={m._id} className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                              <div className="flex items-center gap-2">
                                <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-0.5">{m.time}</span>
                                <span className="font-medium tracking-wide">{m.name}</span>
                              </div>
                              <span className="font-mono text-accent tracking-wide">{m.calories} kcal</span>
                            </div>
                          ))}
                        </div>
                        <div className="text-xs font-mono text-[var(--text-muted)] mt-2 tracking-wide">
                          TOTAL: {historyDayData.meals.reduce((s: number, m: any) => s + m.calories, 0)} kcal
                        </div>
                      </div>
                    )}

                    {historyDayData.workouts.length > 0 && (
                      <div>
                        <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Workouts ({historyDayData.workouts.length})</div>
                        <div className="space-y-2">
                          {historyDayData.workouts.map((w: any) => (
                            <div key={w._id} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                              <div className="flex items-center gap-2 mb-2">
                                <span className={`text-xs font-mono px-2 py-0.5 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{w.intensity}</span>
                                <span className="font-medium tracking-wide">{w.name}</span>
                                {w.duration && <span className="text-xs text-[var(--text-muted)]">{w.duration}</span>}
                              </div>
                              {w.exercises && w.exercises.length > 0 && (
                                <div className="text-xs text-[var(--text-muted)] space-y-1">
                                  {w.exercises.map((ex: any, ei: number) => (
                                    <div key={ei} className="tracking-wide">{ex.name}: {ex.sets.map((s: any) => `${s.weight}×${s.reps}`).join(', ')}</div>
                                  ))}
                                </div>
                              )}
                            </div>
                          ))}
                        </div>
                      </div>
                    )}

                    {historyDayData.meals.length === 0 && historyDayData.workouts.length === 0 && (
                      <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">No data logged for this day.</div>
                    )}

                    <div className="flex flex-col gap-2 mt-6 pt-4 border-t border-[var(--border-default)]">
                      <button
                        onClick={() => setHistoryAddMealDate(selectedDate)}
                        className="flex items-center gap-2 px-4 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity"
                      >
                        <Plus size={12} strokeWidth={3} /> ADD MEAL TO THIS DAY
                      </button>
                      <button
                        onClick={() => setHistoryAddWorkoutDate(selectedDate)}
                        className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-all"
                      >
                        <Plus size={12} strokeWidth={3} /> ADD WORKOUT TO THIS DAY
                      </button>
                    </div>
                  </>
                ) : !historyAddMealDate && !historyAddWorkoutDate ? (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Calendar size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
                      <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">SELECT A DATE FROM THE CALENDAR</div>
                    </div>
                  </div>
                ) : null}
              </div>
            </div>
            )}
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            AI COACH TAB - Completely Redesigned
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "AI COACH" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex-1 min-h-0 flex overflow-hidden" data-testid="ai-coach-tab">
            {/* Sessions Sidebar */}
            <div className="shrink-0 border-r border-[var(--border-default)] flex flex-col overflow-hidden transition-[width] duration-200 bg-[var(--bg-card)]" style={{ width: sessionsPanelOpen ? sidebarWidth : 0 }}>
              <div className="p-3 border-b border-[var(--border-default)] flex items-center justify-between" style={{ minWidth: 180 }}>
                <span className="text-xs font-mono uppercase tracking-wider">Chats</span>
                <div className="flex items-center gap-1">
                  <button data-testid="new-chat-btn" onClick={handleNewSession} className="p-1.5 border border-[var(--border-default)] hover:bg-accent hover:text-[var(--theme-primary-text)] transition-colors"><MessageSquarePlus size={14} /></button>
                  <button onClick={() => setSessionsPanelOpen(false)} className="p-1.5 border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"><PanelLeftClose size={14} /></button>
                </div>
              </div>
              <div className="flex-1 overflow-y-auto">
                {sessions.length === 0 && (
                  <div className="p-4 text-xs font-mono text-[var(--text-muted)] tracking-wide">No chats yet</div>
                )}
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => setActiveSessionId(s.id)}
                    className={`w-full text-left px-3 py-3 border-b border-[var(--border-default)] text-xs font-mono hover:bg-[var(--bg-elevated)] transition-colors group ${activeSessionId === s.id ? "bg-[var(--bg-elevated)] border-l-2 border-l-accent" : ""}`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="truncate tracking-wide flex-1">{s.title}</div>
                      <span
                        onClick={(e) => handleDeleteSession(s.id, e)}
                        className="opacity-0 group-hover:opacity-100 p-1 hover:text-red-400 transition-opacity"
                      >
                        <Trash2 size={12} />
                      </span>
                    </div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(s.updated_at || s.updatedAt).toLocaleDateString()}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Resize Handle */}
            {sessionsPanelOpen && (
              <div
                className="w-1 shrink-0 bg-[var(--border-default)] hover:bg-accent transition-colors cursor-col-resize"
                onMouseDown={(e) => { sidebarResizeRef.current = { startX: e.clientX, startWidth: sidebarWidth }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
              />
            )}

            {/* Main Chat Area */}
            <div className="flex-1 flex flex-col min-w-0 min-h-0 bg-[var(--bg-main)]">
              {/* Header */}
              <div className="shrink-0 px-5 py-4 border-b border-[var(--border-default)] flex items-center gap-3 bg-[var(--bg-card)]">
                {!sessionsPanelOpen && (
                  <button onClick={() => setSessionsPanelOpen(true)} className="p-2 border border-[var(--border-default)] hover:bg-[var(--bg-elevated)] transition-colors"><PanelLeftOpen size={14} /></button>
                )}
                <div className="w-12 h-12 bg-accent flex items-center justify-center">
                  <Bot size={24} className="text-[var(--theme-primary-text)]" strokeWidth={2} />
                </div>
                <div className="flex-1 min-w-0">
                  <div className="font-heading text-xl uppercase tracking-normal">Stride Coach</div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-accent">
                    <span className="w-2 h-2 bg-accent rounded-full animate-pulse" />
                    {selectedCoach === "auto"
                      ? "AUTO • Routing to the best coach"
                      : coaches.find((c: any) => c.id === selectedCoach)?.tagline || "ONLINE • Ready to help"}
                  </div>
                </div>
                {/* Coach Selector */}
                {coaches.length > 0 && (
                  <div className="hidden sm:flex items-center gap-1">
                    {coaches.map((coach: any) => (
                      <button
                        key={coach.id}
                        onClick={() => setSelectedCoach(coach.id)}
                        className={`px-2.5 py-1.5 font-mono text-[10px] uppercase tracking-wider transition-all ${
                          selectedCoach === coach.id
                            ? 'bg-accent text-[var(--theme-primary-text)]'
                            : 'border border-[var(--border-default)] hover:border-accent text-[var(--text-secondary)]'
                        }`}
                        title={coach.tagline}
                      >
                        {coach.name}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Messages */}
              <div className="flex-1 overflow-y-auto p-5 space-y-4">
                {sessionMessages.length === 0 && (
                  <div className="text-center py-16">
                    <Bot size={64} className="mx-auto mb-4 text-accent opacity-50" />
                    <div className="font-heading text-2xl uppercase mb-2 tracking-normal">How can I help?</div>
                    <p className="text-sm text-[var(--text-muted)] max-w-md mx-auto leading-relaxed tracking-wide">
                      Describe your meals or workouts and I'll log them for you. Ask me about nutrition, fitness advice, or your progress!
                    </p>
                    <div className="flex flex-wrap gap-2 justify-center mt-6">
                      {getContextualPrompts().map((suggestion) => (
                        <button
                          key={suggestion}
                          onClick={() => setChatInput(suggestion)}
                          className="px-3 py-2 border border-[var(--border-default)] text-xs font-mono hover:border-accent hover:text-accent transition-colors tracking-wide"
                        >
                          {suggestion}
                        </button>
                      ))}
                    </div>
                  </div>
                )}
                
                {sessionMessages.map((msg, i) => (
                  <motion.div key={i} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className={`flex ${msg.role === "ai" ? "justify-start" : "justify-end"}`}>
                    {msg.role === "ai" && (
                      <div className="w-8 h-8 bg-accent flex items-center justify-center shrink-0 mr-3 mt-1">
                        <Bot size={16} className="text-[var(--theme-primary-text)]" />
                      </div>
                    )}
                    <div className={`max-w-[70%] ${msg.role === "ai" ? "space-y-1" : ""}`}>
                      {msg.role === "ai" && msg.coachType && msg.coachType !== "overall" && (
                        <div className="text-[10px] font-mono uppercase tracking-wider text-accent">
                          {coaches.find((c: any) => c.id === msg.coachType)?.name || msg.coachType}
                        </div>
                      )}
                      <div className={`px-4 py-3 text-sm leading-relaxed tracking-wide ${
                        msg.role === "ai"
                          ? "bg-[var(--bg-card)] border border-[var(--border-default)]"
                          : "bg-accent text-[var(--theme-primary-text)]"
                      }`}>
                        {msg.role === "ai" ? (
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={markdownComponents}
                          >
                            {msg.content}
                          </ReactMarkdown>
                        ) : (
                          <ReactMarkdown remarkPlugins={[remarkGfm]} components={markdownComponents}>
                            {msg.content}
                          </ReactMarkdown>
                        )}
                      </div>
                    </div>
                    {msg.role === "human" && (
                      <div className="w-8 h-8 bg-[var(--bg-elevated)] border border-[var(--border-default)] flex items-center justify-center shrink-0 ml-3 mt-1">
                        <User size={16} />
                      </div>
                    )}
                  </motion.div>
                ))}
                
                {chatLoading && (
                  <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex justify-start">
                    <div className="w-8 h-8 bg-accent flex items-center justify-center shrink-0 mr-3">
                      <Bot size={16} className="text-[var(--theme-primary-text)]" />
                    </div>
                    <div className="bg-[var(--bg-card)] border border-[var(--border-default)] px-4 py-3">
                      <div className="flex gap-1">
                        <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                        <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                        <span className="w-2 h-2 bg-accent rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                      </div>
                    </div>
                  </motion.div>
                )}
                <div ref={chatEndRef} />
              </div>

              {/* Input Area - Expandable */}
              <div className="shrink-0 p-4 border-t border-[var(--border-default)] bg-[var(--bg-card)]">
                {chatError && <div className="mb-2 text-xs font-mono text-red-400 tracking-wide">{chatError}</div>}
                <div className="flex items-end gap-3">
                  <textarea
                    ref={chatInputRef}
                    data-testid="chat-input"
                    value={chatInput}
                    onChange={handleChatInputChange}
                    onKeyDown={(e) => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleSendChat(); } }}
                    placeholder="Describe a meal, log a workout, or ask anything..."
                    rows={1}
                    className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none min-h-[48px] max-h-[150px] leading-relaxed tracking-wide"
                    style={{ height: 'auto' }}
                  />
                  <VoiceInputButton
                    value={chatInput}
                    onChange={setChatInput}
                    className="h-[48px]"
                  />
                  <button
                    data-testid="send-chat-btn"
                    onClick={handleSendChat}
                    disabled={chatLoading || !chatInput.trim() || !activeSessionId}
                    className="px-5 py-3 bg-accent text-[var(--theme-primary-text)] font-mono font-bold hover:opacity-90 transition-all disabled:opacity-50 h-[48px]"
                  >
                    {chatLoading ? <Loader2 size={18} className="animate-spin" /> : <Send size={18} />}
                  </button>
                </div>
                <div className="text-[10px] font-mono text-[var(--text-muted)] mt-2 tracking-wide">Press Enter to send, Shift+Enter for new line</div>
              </div>
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            PROFILE TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "PROFILE" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-4xl mx-auto space-y-6" data-testid="profile-tab">
            <PageHeader title="Profile" subtitle="Manage your fitness settings and goals" />

            <Card className="p-6">
              <div className="flex items-center gap-5">
                {user?.imageUrl && !profileImgError ? (
                  <img
                    src={user.imageUrl}
                    alt="Profile"
                    className="w-20 h-20 object-cover border-2 border-accent"
                    onError={() => setProfileImgError(true)}
                  />
                ) : (
                  <div className="w-20 h-20 bg-accent flex items-center justify-center">
                    <User size={32} className="text-[var(--theme-primary-text)]" />
                  </div>
                )}
                <div>
                  <h3 className="font-heading text-2xl uppercase tracking-normal">{user?.fullName || "Athlete"}</h3>
                  <p className="text-sm font-mono text-[var(--text-muted)] tracking-wide">{user?.emailAddresses?.[0]?.emailAddress}</p>
                </div>
                <button onClick={() => openUserProfile()} className="ml-auto px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors tracking-wide">
                  Account Settings
                </button>
              </div>
            </Card>

            <Card className="p-6">
              <h3 className="font-heading text-xl uppercase mb-6 pb-2 border-b border-[var(--border-default)] tracking-normal">Body Metrics</h3>
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Weight (kg)</label>
                  <input type="number" value={profileForm.weight} onChange={(e) => setProfileForm({ ...profileForm, weight: e.target.value })} placeholder="75" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Height (cm)</label>
                  <input type="number" value={profileForm.height} onChange={(e) => setProfileForm({ ...profileForm, height: e.target.value })} placeholder="175" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Age</label>
                  <input type="number" value={profileForm.age} onChange={(e) => setProfileForm({ ...profileForm, age: e.target.value })} placeholder="28" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                {profileForm.weight && profileForm.height && (
                  <div className="p-4 bg-accent text-[var(--theme-primary-text)] flex flex-col justify-center">
                    <div className="text-xs font-mono opacity-70 tracking-wider">BMI</div>
                    <div className="text-3xl font-heading">{(Number(profileForm.weight) / (Number(profileForm.height) / 100) ** 2).toFixed(1)}</div>
                  </div>
                )}
              </div>
              <div>
                <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Activity Level</label>
                <select value={profileForm.activityLevel} onChange={(e) => setProfileForm({ ...profileForm, activityLevel: e.target.value })} className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent">
                  <option value="sedentary">SEDENTARY — Little to no exercise</option>
                  <option value="light">LIGHT — Light exercise 1-3 days/week</option>
                  <option value="moderate">MODERATE — Exercise 3-5 days/week</option>
                  <option value="active">ACTIVE — Intense exercise 6-7 days/week</option>
                  <option value="intense">INTENSE — Very intense daily training</option>
                </select>
              </div>
            </Card>

            <Card className="p-6">
              <div className="flex items-center justify-between mb-6 pb-2 border-b border-[var(--border-default)]">
                <h3 className="font-heading text-xl uppercase tracking-normal">Daily Macro Targets</h3>
                <button
                  onClick={handleAICalculateMacros}
                  disabled={profileAILoading}
                  className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors tracking-wide"
                >
                  {profileAILoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />} AI Calculate
                </button>
              </div>
              {profileAIExplanation && (
                <div className="mb-4 text-xs font-mono text-accent tracking-wide">{profileAIExplanation}</div>
              )}
              {profileError && (
                <div className="mb-4 text-xs font-mono text-red-400 tracking-wide">{profileError}</div>
              )}
              <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Calories (kcal)</label>
                  <input type="number" value={profileForm.calorieTarget} onChange={(e) => setProfileForm({ ...profileForm, calorieTarget: e.target.value })} placeholder="2400" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Protein (g)</label>
                  <input type="number" value={profileForm.proteinTarget} onChange={(e) => setProfileForm({ ...profileForm, proteinTarget: e.target.value })} placeholder="180" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Carbs (g)</label>
                  <input type="number" value={profileForm.carbTarget} onChange={(e) => setProfileForm({ ...profileForm, carbTarget: e.target.value })} placeholder="280" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Fat (g)</label>
                  <input type="number" value={profileForm.fatTarget} onChange={(e) => setProfileForm({ ...profileForm, fatTarget: e.target.value })} placeholder="80" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
              </div>
            </Card>

            <button
              onClick={handleSaveProfile}
              disabled={profileLoading}
              className="w-full py-4 bg-accent text-[var(--theme-primary-text)] font-mono uppercase tracking-wider font-bold disabled:opacity-50"
            >
              {profileLoading ? <Loader2 size={16} className="animate-spin inline mr-2" /> : null}
              {profileSuccess ? 'SAVED!' : 'Save Profile'}
            </button>
          </motion.div>
        )}
      </main>

      {/* Global overlays */}
      <ToastStack toasts={toasts} onRemove={removeToast} />
      <CommandBar
        open={commandBarOpen}
        onClose={() => setCommandBarOpen(false)}
        recentMeals={meals.slice(0, 5)}
        recentWorkouts={workouts.slice(0, 5)}
        onLogMeal={() => { setCommandBarOpen(false); setActiveTab("HOME"); setShowQuickMealPanel(true); setShowQuickWorkoutPanel(false); }}
        onLogWorkout={() => { setCommandBarOpen(false); setActiveTab("HOME"); setShowQuickWorkoutPanel(true); setShowQuickMealPanel(false); }}
        onAddWater={() => {
          setCommandBarOpen(false);
          setWaterIntake((prev) => prev + (waterUnit === "glasses" ? 1 : 0.25));
          toastSuccess(`Added ${waterUnit === "glasses" ? "1 glass" : "0.25L"} of water`);
        }}
        onLogSleep={() => { setCommandBarOpen(false); setActiveTab("HOME"); }}
        onLogAgain={(item) => {
          setCommandBarOpen(false);
          if (item.type === "meal") {
            setLogAgainMeal(item.data);
            setActiveTab("HOME");
          } else {
            setLogAgainWorkout(item.data);
            setActiveTab("HOME");
          }
        }}
      />
    </div>
  );
}
