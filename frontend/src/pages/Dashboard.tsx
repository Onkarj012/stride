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
  GlassWater,
  LineChart,
  PieChart,
  BarChart2,
  Calendar,
} from "lucide-react";
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

// Mock data for previous day
const mockPreviousDayMeals = [
  { _id: 'mock1', name: 'Oatmeal with Berries', time: '08:30', mealType: 'breakfast', calories: 350, protein: 12, carbs: 58, fat: 8 },
  { _id: 'mock2', name: 'Grilled Chicken Salad', time: '13:00', mealType: 'lunch', calories: 480, protein: 42, carbs: 18, fat: 28 },
  { _id: 'mock3', name: 'Protein Shake', time: '16:00', mealType: 'snack', calories: 220, protein: 30, carbs: 12, fat: 6 },
  { _id: 'mock4', name: 'Salmon with Vegetables', time: '19:30', mealType: 'dinner', calories: 580, protein: 45, carbs: 25, fat: 32 },
];

const mockPreviousDayWorkouts = [
  { _id: 'mockw1', name: 'Morning Run', duration: '35 min', intensity: 'MEDIUM', exercises: [{ name: 'Running', sets: [{ weight: 'cardio', reps: '5km' }] }] },
  { _id: 'mockw2', name: 'Upper Body Strength', duration: '45 min', intensity: 'HIGH', exercises: [
    { name: 'Bench Press', sets: [{ weight: '80kg', reps: '8' }, { weight: '85kg', reps: '6' }, { weight: '90kg', reps: '4' }] },
    { name: 'Shoulder Press', sets: [{ weight: '40kg', reps: '10' }, { weight: '45kg', reps: '8' }] },
    { name: 'Pull-ups', sets: [{ weight: 'BW', reps: '12' }, { weight: 'BW', reps: '10' }, { weight: 'BW', reps: '8' }] },
  ]},
];

// Mock data for today (so the home dashboard isn't empty for demo)
const mockTodayMeals = [
  { _id: 'today1', name: 'Greek Yogurt & Granola', time: '08:00', mealType: 'breakfast', calories: 320, protein: 22, carbs: 42, fat: 8 },
  { _id: 'today2', name: 'Chicken & Rice Bowl', time: '12:30', mealType: 'lunch', calories: 540, protein: 48, carbs: 62, fat: 14 },
  { _id: 'today3', name: 'Almond Butter Toast', time: '16:00', mealType: 'snack', calories: 280, protein: 9, carbs: 28, fat: 16 },
];

const mockTodayWorkouts = [
  { _id: 'todayw1', name: 'Lower Body Strength', duration: '50 min', intensity: 'HIGH', exercises: [
    { name: 'Back Squat', sets: [{ weight: '100kg', reps: '8' }, { weight: '110kg', reps: '6' }, { weight: '120kg', reps: '4' }] },
    { name: 'Romanian Deadlift', sets: [{ weight: '80kg', reps: '10' }, { weight: '90kg', reps: '8' }] },
    { name: 'Bulgarian Split Squat', sets: [{ weight: '20kg', reps: '12' }, { weight: '20kg', reps: '12' }] },
  ]},
];

// Mock AI chat messages
const mockChatMessages = [
  { role: 'human', content: 'I had a chicken breast with rice and broccoli for lunch, about 200g of chicken' },
  { role: 'ai', content: "Great choice! I've logged your lunch:\n\n**Grilled Chicken with Rice & Broccoli**\n- Calories: ~450 kcal\n- Protein: 46g\n- Carbs: 35g\n- Fat: 12g\n\nYou're doing well on protein today! You've hit 68% of your daily protein goal. Keep it up! 💪" },
  { role: 'human', content: 'What should I eat for dinner to hit my macros?' },
  { role: 'ai', content: "Based on your remaining macros for today:\n\n**You still need:**\n- ~600 calories\n- 58g protein\n- 85g carbs\n- 28g fat\n\n**Suggested dinner:**\n\n🥗 **Salmon Bowl**\n- 150g grilled salmon (35g protein)\n- 1 cup quinoa (8g protein)\n- Mixed greens with olive oil\n- Avocado (half)\n\nThis would give you approximately 550 calories and help you hit your protein target perfectly!" },
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
  const yesterday = new Date(Date.now() - 86400000).toISOString().split("T")[0];

  // Use mock data instead of undefined to avoid loading state
  const [meals, setMeals] = useState<any[]>(mockTodayMeals);
  const [workouts, setWorkouts] = useState<any[]>(mockTodayWorkouts);
  const [goals, setGoals] = useState<any>({ calorieGoal: 2400, proteinGoal: 180, carbGoal: 280, fatGoal: 80 });
  const [history, setHistory] = useState<any[]>([]);
  const [dailyInsightsData, setDailyInsightsData] = useState<any>({ insights: ['Start logging your meals to get personalized AI insights!', 'Track your workouts for progress analysis.'] });
  const [weeklySummary, setWeeklySummary] = useState<any>(null);

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

  // Badges
  const [unlockedBadges, setUnlockedBadges] = useState<string[]>(() => {
    const saved = localStorage.getItem('unlocked-badges');
    return saved ? JSON.parse(saved) : ['first-meal', 'first-workout'];
  });

  // AI Coach state with mock messages
  const [sessions, setSessions] = useState<any[]>([
    { id: 'session1', title: 'Nutrition Chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() },
    { id: 'session2', title: 'Workout Planning', createdAt: new Date(Date.now() - 86400000).toISOString(), updatedAt: new Date(Date.now() - 86400000).toISOString() },
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>('session1');
  const [sessionsPanelOpen, setSessionsPanelOpen] = useState(true);
  const [sessionMessages, setSessionMessages] = useState<any[]>(mockChatMessages);
  const [chatLoggedItem, setChatLoggedItem] = useState<any>(null);
  const [sidebarWidth, setSidebarWidth] = useState(260);
  const sidebarResizeRef = useRef<{ startX: number; startWidth: number } | null>(null);

  // History state
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [calendarData, setCalendarData] = useState<Record<string, { meals: number; workouts: number; calories: number }>>({
    [yesterday]: { meals: 4, workouts: 2, calories: 1630 },
  });
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [historyDayData, setHistoryDayData] = useState<{ meals: any[]; workouts: any[] } | null>(null);
  const [calendarPanelPct, setCalendarPanelPct] = useState(35);
  const resizeRef = useRef<{ startX: number; startPct: number } | null>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

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
  const [mealLoading, setMealLoading] = useState(false);
  const [mealError, setMealError] = useState<string | null>(null);

  const [workoutForm, setWorkoutForm] = useState({ description: "", duration: "", intensity: "HIGH" });
  const [workoutLoading, setWorkoutLoading] = useState(false);
  const [workoutError, setWorkoutError] = useState<string | null>(null);

  const [profile, setProfile] = useState<any>({ weight: 75, height: 178, age: 28, activityLevel: 'moderate' });
  const [profileForm, setProfileForm] = useState({
    weight: "75", height: "178", age: "28", activityLevel: "moderate",
    calorieTarget: "2400", proteinTarget: "180", carbTarget: "280", fatTarget: "80",
  });
  const [profileLoading, setProfileLoading] = useState(false);
  const [profileError, setProfileError] = useState<string | null>(null);
  const [profileSuccess, setProfileSuccess] = useState(false);
  const [profileAILoading, setProfileAILoading] = useState(false);
  const [profileAIExplanation, setProfileAIExplanation] = useState<string | null>(null);

  const effectiveGoals = {
    calorieGoal: parseInt(profileForm.calorieTarget) || 2400,
    proteinGoal: parseInt(profileForm.proteinTarget) || 180,
    carbGoal: parseInt(profileForm.carbTarget) || 280,
    fatGoal: parseInt(profileForm.fatTarget) || 80,
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

  // Auto-resize chat input
  const handleChatInputChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setChatInput(e.target.value);
    if (chatInputRef.current) {
      chatInputRef.current.style.height = 'auto';
      chatInputRef.current.style.height = Math.min(chatInputRef.current.scrollHeight, 150) + 'px';
    }
  };

  const handleSendChat = async () => {
    if (!chatInput.trim() || !activeSessionId) return;
    const userMsg = chatInput.trim();
    setChatInput("");
    if (chatInputRef.current) chatInputRef.current.style.height = 'auto';
    setSessionMessages((prev) => [...prev, { role: "human", content: userMsg }]);
    setChatLoading(true);
    // Simulate AI response
    setTimeout(() => {
      setSessionMessages((prev) => [...prev, { role: "ai", content: "I've received your message! Since this is a demo, I'm showing a placeholder response. In the full app, I would analyze your input and provide personalized fitness advice." }]);
      setChatLoading(false);
    }, 1500);
  };

  const handleNewSession = () => {
    const newSession = { id: `session${Date.now()}`, title: 'New Chat', createdAt: new Date().toISOString(), updatedAt: new Date().toISOString() };
    setSessions((prev) => [newSession, ...prev]);
    setActiveSessionId(newSession.id);
    setSessionMessages([]);
  };

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
    if (dateStr === yesterday) {
      setHistoryDayData({ meals: mockPreviousDayMeals, workouts: mockPreviousDayWorkouts });
    } else {
      setHistoryDayData({ meals: [], workouts: [] });
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

  // Page Header component for consistency
  const PageHeader = ({ title, subtitle }: { title: string; subtitle?: string }) => (
    <div className="mb-8">
      <h1 className="text-4xl lg:text-5xl font-heading uppercase tracking-normal leading-none">{title}</h1>
      {subtitle && <p className="text-sm font-mono text-[var(--text-muted)] mt-2 tracking-wide">{subtitle}</p>}
    </div>
  );

  // Card component
  const Card = ({ children, className = "", hover = false }: { children: React.ReactNode; className?: string; hover?: boolean }) => (
    <div className={`bg-[var(--bg-card)] border border-[var(--border-default)] ${hover ? 'hover:-translate-y-1 hover:shadow-brutal transition-all duration-200' : ''} ${className}`}>
      {children}
    </div>
  );

  // Stat card
  const StatCard = ({ label, value, subValue, icon: Icon, accent = false }: { label: string; value: string | number; subValue?: string; icon: any; accent?: boolean }) => (
    <Card className={`p-5 ${accent ? 'border-accent border-2' : ''}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="text-[11px] uppercase tracking-[0.15em] font-mono text-[var(--text-muted)] mb-1">{label}</div>
          <div className="text-3xl font-heading tracking-normal">{value}</div>
          {subValue && <div className="text-xs font-mono text-[var(--text-secondary)] mt-1 tracking-wide">{subValue}</div>}
        </div>
        <div className={`p-2.5 ${accent ? 'bg-accent' : 'bg-[var(--bg-elevated)]'}`}>
          <Icon size={20} className={accent ? 'text-[var(--theme-primary-text)]' : 'text-[var(--text-secondary)]'} strokeWidth={2} />
        </div>
      </div>
    </Card>
  );

  // Progress bar
  const ProgressBar = ({ value, max, showLabel = true }: { value: number; max: number; showLabel?: boolean }) => {
    const pct = Math.min(100, (value / max) * 100);
    return (
      <div className="space-y-1.5">
        {showLabel && (
          <div className="flex justify-between text-xs font-mono tracking-wide">
            <span className="text-[var(--text-secondary)]">{value}</span>
            <span className="text-[var(--text-muted)]">/ {max}</span>
          </div>
        )}
        <div className="h-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
          <motion.div
            initial={{ width: 0 }}
            animate={{ width: `${pct}%` }}
            transition={{ duration: 1, ease: "easeOut" }}
            className="h-full bg-accent"
          />
        </div>
      </div>
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[var(--bg-main)] text-[var(--text-primary)] font-body transition-colors">
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
                  onClick={() => setActiveTab("MEALS")}
                  className="flex items-center gap-2 px-4 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-all"
                >
                  <Plus size={14} strokeWidth={3} /> MEAL
                </button>
                <button
                  data-testid="quick-log-workout"
                  onClick={() => setActiveTab("WORKOUT")}
                  className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-all"
                >
                  <Plus size={14} strokeWidth={3} /> WORKOUT
                </button>
              </div>
            </div>

            {/* Stats Grid */}
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
              <StatCard label="CALORIES" value={totalCals || 0} subValue={`/ ${effectiveGoals.calorieGoal} KCAL`} icon={Flame} accent />
              <StatCard label="PROTEIN" value={`${totalProtein || 0}g`} subValue={`/ ${effectiveGoals.proteinGoal}g`} icon={Target} />
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
                    <select
                      value={waterUnit}
                      onChange={(e) => setWaterUnit(e.target.value as 'glasses' | 'litres')}
                      className="bg-[var(--bg-elevated)] border border-[var(--border-default)] px-2 py-1 text-xs font-mono"
                    >
                      <option value="glasses">Glasses</option>
                      <option value="litres">Litres</option>
                    </select>
                    <span className="font-heading text-2xl">{waterIntake.toFixed(1)}/{waterGoal}</span>
                  </div>
                </div>
                
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
                      <div key={meal._id} className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                          <span className="font-medium tracking-wide">{meal.name}</span>
                        </div>
                        <span className="font-mono text-accent tracking-wide">{meal.calories} KCAL</span>
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
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            MEALS TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "MEALS" && (
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6" data-testid="meals-tab">
            <PageHeader title="Meal Log" subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric" })} />

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
                <textarea
                  placeholder="Describe your meal — what you ate, portion sizes, ingredients... AI will estimate macros."
                  value={mealForm.description}
                  onChange={(e) => setMealForm({ ...mealForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed"
                />
                <button
                  disabled={mealLoading || !mealForm.description.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {mealLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  AI Log Meal
                </button>
              </div>
            </Card>

            <div className="space-y-3">
              {meals.length === 0 && (
                <Card className="p-8 text-center border-dashed">
                  <div className="font-mono text-sm text-[var(--text-muted)] tracking-wide">NO MEALS LOGGED TODAY</div>
                </Card>
              )}
              {meals.map((meal) => (
                <Card key={meal._id} className="p-4 hover:border-accent transition-colors">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-3 flex-wrap mb-2">
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
                    <button className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
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

            <Card className="p-6">
              <h3 className="font-mono text-sm uppercase tracking-wider text-[var(--text-muted)] mb-4">Log Workout — AI Powered</h3>
              <div className="space-y-4">
                <textarea
                  placeholder="Describe your workout — exercises, sets, reps, weights..."
                  value={workoutForm.description}
                  onChange={(e) => setWorkoutForm({ ...workoutForm, description: e.target.value })}
                  rows={3}
                  className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent placeholder:text-[var(--text-muted)] resize-none leading-relaxed"
                />
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
                <button
                  disabled={workoutLoading || !workoutForm.description.trim()}
                  className="flex items-center gap-2 px-6 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 disabled:opacity-50"
                >
                  {workoutLoading ? <Loader2 size={16} className="animate-spin" /> : <Sparkles size={16} />}
                  AI Log Workout
                </button>
              </div>
            </Card>

            <div className="space-y-3">
              {workouts.length === 0 && (
                <Card className="p-8 text-center border-dashed">
                  <div className="font-mono text-sm text-[var(--text-muted)] tracking-wide">NO WORKOUTS LOGGED TODAY</div>
                </Card>
              )}
              {workouts.map((w: any) => (
                <Card key={w._id} className="p-5 hover:border-accent transition-colors" data-testid={`workout-${w._id}`}>
                  <div className="flex items-start justify-between mb-3">
                    <div>
                      <div className="flex items-center gap-3 mb-1.5 flex-wrap">
                        <span className={`text-[10px] font-mono px-2 py-1 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{w.intensity}</span>
                        <h3 className="text-lg font-heading uppercase tracking-normal">{w.name}</h3>
                        {w.duration && <span className="text-xs font-mono text-[var(--text-muted)] tracking-wide">{w.duration}</span>}
                      </div>
                    </div>
                    <button className="p-2 border border-[var(--border-default)] hover:bg-red-600 hover:border-red-600 hover:text-white transition-colors">
                      <Trash2 size={14} />
                    </button>
                  </div>
                  {w.exercises && w.exercises.length > 0 && (
                    <div className="mt-3 space-y-2">
                      {w.exercises.map((ex: any, ei: number) => (
                        <div key={ei} className="flex items-center justify-between p-2.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                          <span className="font-mono text-sm tracking-wide">{ex.name}</span>
                          <span className="font-mono text-xs text-[var(--text-muted)] tracking-wide">{ex.sets.map((s: any) => `${s.weight}×${s.reps}`).join('  ·  ')}</span>
                        </div>
                      ))}
                    </div>
                  )}
                </Card>
              ))}
            </div>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            RECIPES TAB
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
            ) : (
              <div className="grid lg:grid-cols-2 gap-4">
                {recipes.map((recipe) => (
                  <Card key={recipe.id} className="p-5">
                    <div className="flex items-start justify-between mb-3">
                      <h3 className="font-heading text-xl uppercase tracking-normal">{recipe.name}</h3>
                      <button onClick={() => handleDeleteRecipe(recipe.id)} className="p-2 hover:bg-red-600 hover:text-white transition-colors"><Trash2 size={14} /></button>
                    </div>
                    <div className="flex gap-4 text-xs font-mono text-[var(--text-muted)] mb-3 tracking-wide">
                      {recipe.servings && <span>{recipe.servings} SERVINGS</span>}
                      {recipe.prepTime && <span>PREP: {recipe.prepTime}</span>}
                      {recipe.cookTime && <span>COOK: {recipe.cookTime}</span>}
                    </div>
                    {recipe.ingredients && <p className="text-sm text-[var(--text-secondary)] whitespace-pre-line line-clamp-3 leading-relaxed">{recipe.ingredients}</p>}
                  </Card>
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
              <div className="flex gap-2">
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
              <StatCard label="CALORIES" value={totalCals || 1630} subValue={`${Math.round(((totalCals || 1630) / effectiveGoals.calorieGoal) * 100)}% of goal`} icon={Flame} accent />
              <StatCard label="PROTEIN" value={`${totalProtein || 145}g`} subValue={`${Math.round(((totalProtein || 145) / effectiveGoals.proteinGoal) * 100)}% of goal`} icon={Target} />
              <StatCard label="HYDRATION" value={`${waterIntake}/${waterGoal}`} subValue={waterUnit.toUpperCase()} icon={Droplets} />
              <StatCard label="SLEEP" value={`${sleepHours}h`} subValue={sleepHours >= sleepGoal ? "GOAL MET" : `${(sleepGoal - sleepHours).toFixed(1)}h short`} icon={BedDouble} />
            </div>

            {/* Visualization Area based on selected view */}
            <Card className="p-6">
              {insightView === 'overview' && (
                <>
                  <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Weekly Overview</h2>
                  <div className="grid grid-cols-7 gap-2 mb-4">
                    {['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map((day, i) => (
                      <div key={day} className="text-center">
                        <div className="text-xs font-mono text-[var(--text-muted)] mb-2 tracking-wide">{day}</div>
                        <div className={`h-24 border transition-all ${i === 4 ? 'border-accent bg-accent/20' : 'border-[var(--border-default)] bg-[var(--bg-elevated)]'}`}>
                          <div className="h-full flex flex-col justify-end p-1">
                            <div className="bg-accent" style={{ height: `${Math.random() * 60 + 40}%` }} />
                          </div>
                        </div>
                        <div className="text-xs font-mono mt-1 tracking-wide">{Math.floor(Math.random() * 500 + 1500)}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide">
                    You've been consistent this week! Average daily calories: 1,820 kcal. Protein intake is strong at 82% of goal on average.
                  </p>
                </>
              )}
              {insightView === 'calories' && (
                <>
                  <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Calorie Tracking</h2>
                  <div className="h-48 flex items-end gap-1 mb-4">
                    {Array.from({ length: 14 }).map((_, i) => (
                      <div key={i} className="flex-1 bg-accent" style={{ height: `${Math.random() * 80 + 20}%`, opacity: i > 10 ? 1 : 0.5 }} />
                    ))}
                  </div>
                  <div className="grid grid-cols-3 gap-4 text-center">
                    <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">AVG INTAKE</div>
                      <div className="font-heading text-xl">1,820</div>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">GOAL</div>
                      <div className="font-heading text-xl">{effectiveGoals.calorieGoal}</div>
                    </div>
                    <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">DEFICIT</div>
                      <div className="font-heading text-xl text-accent">-580</div>
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
                          <div className="font-heading text-2xl">1,630</div>
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
                        <div className="font-heading">40%</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#FF3B30]" />
                      <div>
                        <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">CARBS</div>
                        <div className="font-heading">35%</div>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <div className="w-4 h-4 bg-[#00FFFF]" />
                      <div>
                        <div className="text-xs font-mono text-[var(--text-muted)] tracking-wide">FAT</div>
                        <div className="font-heading">25%</div>
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
                        <span className="font-mono tracking-wide">Protein intake improved by 15% this week</span>
                      </div>
                      <span className="text-green-500 font-heading">+15%</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="flex items-center gap-3">
                        <TrendingUp size={20} className="text-green-500" />
                        <span className="font-mono tracking-wide">Workout frequency up from 3 to 5 days</span>
                      </div>
                      <span className="text-green-500 font-heading">+67%</span>
                    </div>
                    <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                      <div className="flex items-center gap-3">
                        <Activity size={20} className="text-yellow-500" />
                        <span className="font-mono tracking-wide">Sleep consistency needs attention</span>
                      </div>
                      <span className="text-yellow-500 font-heading">-5%</span>
                    </div>
                  </div>
                </>
              )}
            </Card>

            {/* AI Insights */}
            <Card className="p-6 border-l-4 border-l-accent">
              <div className="flex items-center gap-2 mb-4">
                <BrainCircuit size={24} className="text-accent" strokeWidth={2} />
                <h2 className="font-heading text-2xl uppercase tracking-normal">AI Recommendations</h2>
              </div>
              <div className="space-y-3">
                {dailyInsightsData?.insights?.map((insight: string, i: number) => (
                  <motion.div key={i} initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }} transition={{ delay: i * 0.1 }} className="flex items-start gap-3 p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                    <div className="w-6 h-6 bg-accent flex items-center justify-center shrink-0">
                      <span className="text-xs font-mono font-bold text-[var(--theme-primary-text)]">{i + 1}</span>
                    </div>
                    <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide">{insight}</p>
                  </motion.div>
                ))}
              </div>
            </Card>
          </motion.div>
        )}

        {/* ═══════════════════════════════════════════════════════════════════
            HISTORY TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "HISTORY" && (
          <motion.div ref={historyContainerRef} initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="flex flex-col flex-1 min-h-0" data-testid="history-tab">
            <PageHeader title="History" subtitle="Review your past meals and workouts" />
            
            <div className="flex gap-0 border border-[var(--border-default)] overflow-hidden flex-1 min-h-0 bg-[var(--bg-card)]">
              {/* Calendar */}
              <div style={{ width: `${calendarPanelPct}%` }} className="shrink-0 overflow-hidden">
                <div className="h-full border-r border-[var(--border-default)] p-4 flex flex-col overflow-y-auto">
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
                          onClick={() => handleSelectDate(dateStr)}
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
                className="w-1 shrink-0 cursor-col-resize hover:bg-accent transition-colors bg-[var(--border-default)]"
                onMouseDown={(e) => { resizeRef.current = { startX: e.clientX, startPct: calendarPanelPct }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
              />

              {/* Day Detail */}
              <div className="flex-1 min-w-0 overflow-y-auto p-4">
                {selectedDate && historyDayData ? (
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
                  </>
                ) : (
                  <div className="flex items-center justify-center h-full">
                    <div className="text-center">
                      <Calendar size={48} className="mx-auto mb-4 text-[var(--text-muted)]" />
                      <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">SELECT A DATE FROM THE CALENDAR</div>
                      <p className="text-xs text-[var(--text-muted)] mt-2 tracking-wide">Yesterday has mock data to preview</p>
                    </div>
                  </div>
                )}
              </div>
            </div>
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
                {sessions.map((s) => (
                  <button
                    key={s.id}
                    onClick={() => { setActiveSessionId(s.id); setSessionMessages(s.id === 'session1' ? mockChatMessages : []); }}
                    className={`w-full text-left px-3 py-3 border-b border-[var(--border-default)] text-xs font-mono hover:bg-[var(--bg-elevated)] transition-colors ${activeSessionId === s.id ? "bg-[var(--bg-elevated)] border-l-2 border-l-accent" : ""}`}
                  >
                    <div className="truncate tracking-wide">{s.title}</div>
                    <div className="text-[10px] text-[var(--text-muted)] mt-0.5">{new Date(s.updatedAt).toLocaleDateString()}</div>
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
                <div className="flex-1">
                  <div className="font-heading text-xl uppercase tracking-normal">Stride Coach</div>
                  <div className="flex items-center gap-1.5 text-xs font-mono text-accent">
                    <span className="w-2 h-2 bg-accent rounded-full animate-pulse" /> ONLINE • Ready to help
                  </div>
                </div>
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
                      {['Log my breakfast', 'Suggest a workout', 'How are my macros?', 'Plan my meals'].map((suggestion) => (
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
                    <div className={`max-w-[70%] px-4 py-3 text-sm leading-relaxed tracking-wide ${
                      msg.role === "ai"
                        ? "bg-[var(--bg-card)] border border-[var(--border-default)]"
                        : "bg-accent text-[var(--theme-primary-text)]"
                    }`}>
                      {msg.role === "ai" ? (
                        <ReactMarkdown
                          remarkPlugins={[remarkGfm]}
                          components={{
                            h1: ({ children }) => <h1 className="text-lg font-bold mb-2 tracking-normal">{children}</h1>,
                            h2: ({ children }) => <h2 className="text-base font-bold mb-2 tracking-normal">{children}</h2>,
                            p: ({ children }) => <p className="mb-2 last:mb-0">{children}</p>,
                            ul: ({ children }) => <ul className="list-disc pl-4 mb-2 space-y-1">{children}</ul>,
                            li: ({ children }) => <li>{children}</li>,
                            strong: ({ children }) => <strong className="font-bold text-accent">{children}</strong>,
                            code: ({ children }) => <code className="bg-[var(--bg-elevated)] px-1.5 py-0.5 text-xs font-mono">{children}</code>,
                          }}
                        >
                          {msg.content}
                        </ReactMarkdown>
                      ) : (
                        <span>{msg.content}</span>
                      )}
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
                  <button
                    data-testid="send-chat-btn"
                    onClick={handleSendChat}
                    disabled={chatLoading || !chatInput.trim()}
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
                <div className="w-20 h-20 bg-accent flex items-center justify-center">
                  <User size={32} className="text-[var(--theme-primary-text)]" />
                </div>
                <div>
                  <h3 className="font-heading text-2xl uppercase tracking-normal">{user?.fullName || "Demo User"}</h3>
                  <p className="text-sm font-mono text-[var(--text-muted)] tracking-wide">{user?.emailAddresses?.[0]?.emailAddress}</p>
                </div>
                <button onClick={openUserProfile} className="ml-auto px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors tracking-wide">
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
                <button className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase hover:border-accent transition-colors tracking-wide">
                  <Sparkles size={14} /> AI Calculate
                </button>
              </div>
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

            <button className="w-full py-4 bg-accent text-[var(--theme-primary-text)] font-mono uppercase tracking-wider font-bold">
              Save Profile
            </button>
          </motion.div>
        )}
      </main>
    </div>
  );
}
