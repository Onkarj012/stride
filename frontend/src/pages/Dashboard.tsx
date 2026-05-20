import { useState, useEffect, useRef } from "react";
import { AnimatePresence } from "framer-motion";
import { useUser, useClerk } from "@clerk/react";
import { useNavigate } from "react-router-dom";

import { useToast } from "../hooks/useToast";
import { useQuery, useMutation, useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { ToastStack } from "../components/ToastStack";
import { CommandBar } from "../components/CommandBar";
import OnboardingModal from "../components/OnboardingModal";
import { useLayout } from "../components/Layout";
import { Confetti } from "../components/Confetti";

import HomeTab from "../components/tabs/HomeTab";
import MealsTab from "../components/tabs/MealsTab";
import WorkoutsTab from "../components/tabs/WorkoutsTab";
import RecipesTab from "../components/tabs/RecipesTab";
import InsightsTab from "../components/tabs/InsightsTab";
import HistoryTab from "../components/tabs/HistoryTab";
import AICoachTab from "../components/tabs/AICoachTab";
import LevelsTab from "../components/tabs/LevelsTab";
import ProfileTab from "../components/tabs/ProfileTab";

export default function Dashboard() {
  const { user } = useUser()
  const { openUserProfile } = useClerk()
  const navigate = useNavigate()
  const { activeTab, setActiveTab } = useLayout();
  const [showOnboarding, setShowOnboarding] = useState(false);

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
  const regenerateSuggestionAction = useAction(api.ai.regenerateSuggestion);
  const recordActivityMutation = useMutation(api.gamification.recordActivity);

  // ─── Convex reactive queries ────────────────────────────────────────────────
  const mealsQuery = useQuery(api.meals.getMeals, { date: today });
  const workoutsQuery = useQuery(api.workouts.getWorkouts, { date: today });
  const meals = mealsQuery ?? [];
  const workouts = workoutsQuery ?? [];
  const mealsLoading = mealsQuery === undefined;
  const workoutsLoading = workoutsQuery === undefined;
  const caloriesBurnedData = useQuery(api.workouts.getTotalCaloriesBurned, { date: today }) ?? { total: 0, count: 0 };
  const goalsData = useQuery(api.goals.getDailyGoal, { date: today });
  const goals = goalsData ?? { calorieGoal: 2400, proteinGoal: 180, carbGoal: 280, fatGoal: 80 };
  const dailyInsightsData = useQuery(api.insights.getDailyInsights, { date: today }) ?? { insights: [] };
  const weeklySummary = useQuery(api.insights.getWeeklySummary) ?? null;
  const streakData = useQuery(api.history.getStreak) ?? { streak: 0, todayLogged: false };
  const gamificationState = useQuery(api.gamification.getState);

  // Confetti state
  const [showConfetti, setShowConfetti] = useState(false);
  const prevMissionsRef = useRef<string[]>([]);
  const isInitialLoadRef = useRef(true);
  const [regeneratingSuggestionId, setRegeneratingSuggestionId] = useState<string | null>(null);

  useEffect(() => {
    if (gamificationState?.missions) {
      const completed = (gamificationState.missions as any[]).filter((m) => m.completed).map((m) => m.id);
      const prev = prevMissionsRef.current;
      const newlyCompleted = completed.filter((id) => !prev.includes(id));
      if (newlyCompleted.length > 0 && !isInitialLoadRef.current) {
        setShowConfetti(true);
      }
      prevMissionsRef.current = completed;
      isInitialLoadRef.current = false;
    }
  }, [gamificationState]);

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
    try {
      const saved = localStorage.getItem('user-recipes');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
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

  const profile = useQuery(api.profile.getProfile) ?? null;

  // Trigger onboarding for new users
  useEffect(() => {
    if (profile && !profile.onboardingComplete) {
      setShowOnboarding(true);
    }
  }, [profile]);

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

  // Home stat cards expand/collapse together
  const [homeCardsExpanded, setHomeCardsExpanded] = useState(false);

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

  const [mealForm, setMealForm] = useState({ description: "", time: "", date: today });
  const [mealError, setMealError] = useState<string | null>(null);
  const mealTextareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const el = mealTextareaRef.current;
    if (el) {
      el.style.height = "auto";
      el.style.height = el.scrollHeight + "px";
    }
  }, [mealForm.description]);

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
     if (!chatInput.trim()) return;
     let sessionId = activeSessionId;
     if (!sessionId) {
       try {
         const session = await createSessionMutation({ title: 'New Chat' });
         sessionId = session.id as Id<"chat_sessions">;
         setActiveSessionId(sessionId);
       } catch (err: any) {
         setChatError(err.message || 'Failed to create session');
         return;
       }
     }
     const userMsg = chatInput.trim();
     setChatInput("");
     if (chatInputRef.current) chatInputRef.current.style.height = 'auto';
     setChatLoading(true);
     setChatError("");
     try {
       const data = await chatAction({ message: userMsg, sessionId: sessionId, coachType: selectedCoach });
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

  const handleRegenerateSuggestion = async (mealId: Id<"meals">, meal: {
    name: string;
    calories: number;
    protein: number;
    carbs: number;
    fat: number;
    components?: string | null;
    time: string;
  }) => {
    setRegeneratingSuggestionId(mealId as string);
    try {
      const remaining = {
        calories: Math.max(0, effectiveGoals.calorieGoal - totalCals + meal.calories),
        protein: Math.max(0, effectiveGoals.proteinGoal - totalProtein + meal.protein),
        carbs: Math.max(0, effectiveGoals.carbGoal - totalCarbs + meal.carbs),
        fat: Math.max(0, effectiveGoals.fatGoal - totalFat + meal.fat),
      };
      const result = await regenerateSuggestionAction({
        mealName: meal.name,
        mealComponents: meal.components ?? undefined,
        mealCalories: meal.calories,
        mealProtein: meal.protein,
        mealCarbs: meal.carbs,
        mealFat: meal.fat,
        remainingCalories: remaining.calories,
        remainingProtein: remaining.protein,
        remainingCarbs: remaining.carbs,
        remainingFat: remaining.fat,
      });
      if (result.suggestion) {
        await updateMealMutation({ id: mealId, name: meal.name, calories: meal.calories, protein: meal.protein, carbs: meal.carbs, fat: meal.fat, time: meal.time, aiSuggestion: result.suggestion });
      }
    } catch { /* ignore */ }
    setRegeneratingSuggestionId(null);
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

  const handleLiveWorkoutFinish = async (data: {
    name: string;
    intensity: string;
    duration: string;
    exercises: { name: string; sets: { weight: string; reps: string }[] }[];
  }) => {
    const totalSets = data.exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
    const setsStr = `${data.exercises.length} exercise${data.exercises.length !== 1 ? 's' : ''} · ${totalSets} set${totalSets !== 1 ? 's' : ''}`;
    await commitWorkout({
      name: data.name,
      sets: setsStr,
      duration: data.duration,
      intensity: data.intensity,
      exercises: data.exercises,
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
  const [voiceInput, setVoiceInput] = useState("");

  // Confirm flow states per context
  const [mealConfirm, setMealConfirm] = useState<{ initialData: any } | null>(null);
  const [workoutConfirm, setWorkoutConfirm] = useState<{ initialData: any } | null>(null);
  const [recipeLogConfirm, setRecipeLogConfirm] = useState<any | null>(null);
  const [recipeLogForm, setRecipeLogForm] = useState<{ recipeId: string; quantity: string; extras: string } | null>(null);
  const [logAgainMeal, setLogAgainMeal] = useState<any | null>(null);
  const [logAgainWorkout, setLogAgainWorkout] = useState<any | null>(null);
  const [historyAddMealDate, setHistoryAddMealDate] = useState<string | null>(null);
  const [historyAddWorkoutDate, setHistoryAddWorkoutDate] = useState<string | null>(null);
  const [showScanner, setShowScanner] = useState(false);


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
      components: data.components,
    });
    toastSuccess(
      `Logged: ${data.name}`,
      async () => { try { await deleteMealMutation({ id: id as Id<"meals"> }); } catch {} },
      "UNDO",
    );
    // Update gamification state
    recordActivityMutation({
      type: "meal",
      date: targetDate ?? today,
      totalCalories: totalCals + (data.calories ?? 0),
      totalProtein: totalProtein + (data.protein ?? 0),
      calorieTarget: goals.calorieGoal,
      proteinTarget: goals.proteinGoal,
      mealsLoggedToday: meals.length,
    }).catch(() => {});
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
      caloriesBurned: data.caloriesBurned,
    });
    toastSuccess(
      `Logged: ${data.name}`,
      async () => { try { await deleteWorkoutMutation({ id: id as Id<"workouts"> }); } catch {} },
      "UNDO",
    );
    recordActivityMutation({ type: "workout", date: targetDate ?? today }).catch(() => {});
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
    <div className={`h-full ${activeTab === "AI COACH" ? "flex flex-col overflow-hidden" : activeTab === "HISTORY" ? "flex flex-col overflow-hidden" : "overflow-auto"}`}>
      <div className={`${
        activeTab === "AI COACH" ? "flex flex-col overflow-hidden w-full h-full" :
        activeTab === "HISTORY" ? "flex flex-col overflow-hidden max-w-7xl mx-auto w-full p-5 lg:p-8 h-full" :
        "max-w-7xl mx-auto w-full p-5 lg:p-8 min-h-full"
      }`}>

        <AnimatePresence mode="wait" initial={false}>
        {/* ═══════════════════════════════════════════════════════════════════
            HOME TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "HOME" && <HomeTab today={today} totalCals={totalCals} totalProtein={totalProtein} totalCarbs={totalCarbs} totalFat={totalFat} effectiveGoals={effectiveGoals} caloriesBurnedData={caloriesBurnedData} streakData={streakData} meals={meals} commitMeal={commitMeal} commitWorkout={commitWorkout} showQuickMealPanel={showQuickMealPanel} setShowQuickMealPanel={setShowQuickMealPanel} showQuickWorkoutPanel={showQuickWorkoutPanel} setShowQuickWorkoutPanel={setShowQuickWorkoutPanel} waterIntake={waterIntake} setWaterIntake={setWaterIntake} waterUnit={waterUnit} setWaterUnit={setWaterUnit} sleepHours={sleepHours} setSleepHours={setSleepHours} logAgainMeal={logAgainMeal} setLogAgainMeal={setLogAgainMeal} logAgainWorkout={logAgainWorkout} setLogAgainWorkout={setLogAgainWorkout} />}

        {/* ═══════════════════════════════════════════════════════════════════
            MEALS TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "MEALS" && <MealsTab today={today} meals={meals} mealsLoading={mealsLoading} totalCals={totalCals} totalProtein={totalProtein} totalCarbs={totalCarbs} totalFat={totalFat} effectiveGoals={effectiveGoals} onCommitMeal={commitMeal} onDeleteMeal={handleDeleteMeal} onUpdateMeal={handleUpdateMeal} onRegenerateSuggestion={handleRegenerateSuggestion} />}

        {/* ═══════════════════════════════════════════════════════════════════
            WORKOUT TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "WORKOUT" && <WorkoutsTab workouts={workouts} workoutsLoading={workoutsLoading} onCommitWorkout={commitWorkout} onDeleteWorkout={handleDeleteWorkout} onUpdateWorkout={handleUpdateWorkout} onGetWorkoutSuggestion={handleGetWorkoutSuggestion} onLiveWorkoutFinish={handleLiveWorkoutFinish} workoutSuggestion={workoutSuggestion} suggestionLoading={suggestionLoading} />}

        {/* ═══════════════════════════════════════════════════════════════════
            RECIPES TAB — 2-Panel System
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "RECIPES" && <RecipesTab today={today} userId={user?.id} commitMeal={commitMeal} chatAction={chatAction} activeSessionId={activeSessionId} />}

        {/* ═══════════════════════════════════════════════════════════════════
            INSIGHTS TAB - Enhanced with visualization buttons
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "INSIGHTS" && <InsightsTab totalCals={totalCals} totalProtein={totalProtein} totalCarbs={totalCarbs} totalFat={totalFat} effectiveGoals={effectiveGoals} insightView={insightView} setInsightView={setInsightView} weeklySummary={weeklySummary} weeklyLoading={weeklyLoading} dailyInsightsData={dailyInsightsData} insightsLoading={insightsLoading} waterIntake={waterIntake} waterUnit={waterUnit} sleepHours={sleepHours} sleepGoal={sleepGoal} onGenerateWeeklySummary={handleGenerateWeeklySummary} onGenerateDailyInsights={handleGenerateDailyInsights} />}

        {/* ═══════════════════════════════════════════════════════════════════
            HISTORY TAB
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "HISTORY" && <HistoryTab today={today} calendarData={calendarData} historyDayData={historyDayData} historyInsights={historyInsights} effectiveGoals={effectiveGoals} onCommitMeal={commitMeal} onCommitWorkout={commitWorkout} />}

        {/* ═══════════════════════════════════════════════════════════════════
            AI COACH TAB - Completely Redesigned
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "AI COACH" && <AICoachTab sessions={sessions} activeSessionId={activeSessionId} setActiveSessionId={setActiveSessionId} sessionMessages={sessionMessages} coaches={coaches} selectedCoach={selectedCoach} setSelectedCoach={setSelectedCoach} chatInput={chatInput} setChatInput={setChatInput} chatLoading={chatLoading} chatError={chatError} onSendChat={handleSendChat} onNewSession={handleNewSession} onDeleteSession={handleDeleteSession} markdownComponents={markdownComponents} getContextualPrompts={getContextualPrompts} />}

        {/* ═══════════════════════════════════════════════════════════════════
            LEVELS TAB — Gamification & Progress
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "LEVELS" && <LevelsTab />}

        {/* ═══════════════════════════════════════════════════════════════════
            PROFILE TAB — deprecated, redirects to settings
        ═══════════════════════════════════════════════════════════════════ */}
        {activeTab === "PROFILE" && <ProfileTab />}
        </AnimatePresence>
      </div>

      {/* Confetti */}
      <Confetti active={showConfetti} onDone={() => setShowConfetti(false)} />

      {/* Global overlays */}
      <OnboardingModal
        open={showOnboarding}
        onClose={() => setShowOnboarding(false)}
        onComplete={() => setShowOnboarding(false)}
      />
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
