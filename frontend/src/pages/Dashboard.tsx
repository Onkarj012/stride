import { useState, useEffect, useRef, useCallback } from 'react'
import { motion } from 'framer-motion'
import {
  Flame, Utensils, Dumbbell, TrendingUp, Bot, Menu, X,
  Zap, Send, Trash2, Loader2, LogOut,
  Sparkles, BrainCircuit, Moon, Sun, User
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:3210'

async function apiFetch(path: string, options: RequestInit = {}, token?: string | null) {
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  }
  if (token) {
    headers['Authorization'] = `Bearer ${token}`
  }
  const res = await fetch(`${API_URL}${path}`, { ...options, headers })
  const data = await res.json()
  if (!res.ok) throw new Error(data.error || 'Request failed')
  return data
}

const navItems = [
  { icon: Flame, label: 'CALORIES' },
  { icon: Utensils, label: 'MEALS' },
  { icon: Dumbbell, label: 'WORKOUT' },
  { icon: TrendingUp, label: 'STATS' },
  { icon: Bot, label: 'AI COACH' },
  { icon: User, label: 'PROFILE' },
]

export default function Dashboard() {
  const { user, token, logout } = useAuth()
  const { isDark, toggleTheme } = useTheme()
  const [activeTab, setActiveTab] = useState('CALORIES')
  const [menuOpen, setMenuOpen] = useState(false)

  const today = new Date().toISOString().split('T')[0]

  const [meals, setMeals] = useState<any[] | undefined>(undefined)
  const [workouts, setWorkouts] = useState<any[] | undefined>(undefined)
  const [goals, setGoals] = useState<any>(undefined)
  const [history, setHistory] = useState<any[] | undefined>(undefined)
  const [dailyInsightsData, setDailyInsightsData] = useState<any>(undefined)
  const [chatMessages, setChatMessages] = useState<any[] | undefined>(undefined)
  const [weeklySummary, setWeeklySummary] = useState<any>(undefined)

  const fetchData = useCallback(async () => {
    if (!token) return
    try {
      const [m, w, g, h, dI, cM, wS] = await Promise.all([
        apiFetch(`/api/meals?date=${today}`, {}, token),
        apiFetch(`/api/workouts?date=${today}`, {}, token),
        apiFetch(`/api/goals?date=${today}`, {}, token),
        apiFetch(`/api/progress?days=7`, {}, token),
        apiFetch(`/api/insights/daily?date=${today}`, {}, token),
        apiFetch(`/api/chat`, {}, token),
        apiFetch(`/api/insights/weekly`, {}, token),
      ])
      setMeals(m)
      setWorkouts(w)
      setGoals(g)
      setHistory(h)
      setDailyInsightsData(dI)
      setChatMessages(cM)
      setWeeklySummary(wS)
    } catch (e) {
      setMeals([])
      setWorkouts([])
      setGoals({ calorieGoal: 2400, proteinGoal: 180, carbGoal: 280, fatGoal: 80 })
      setHistory([])
      setDailyInsightsData({ insights: [] })
      setChatMessages([])
      setWeeklySummary(null)
    }
  }, [token, today])

  const fetchProfile = useCallback(async () => {
    if (!token) return
    try {
      const p = await apiFetch('/api/profile', {}, token)
      setProfile(p)
      setProfileForm({
        weight: p.weight ? String(p.weight) : '',
        height: p.height ? String(p.height) : '',
        age: p.age ? String(p.age) : '',
        activityLevel: p.activityLevel || 'moderate',
        calorieTarget: p.calorieTarget ? String(p.calorieTarget) : '',
        proteinTarget: p.proteinTarget ? String(p.proteinTarget) : '',
        carbTarget: p.carbTarget ? String(p.carbTarget) : '',
        fatTarget: p.fatTarget ? String(p.fatTarget) : '',
      })
    } catch (e) {}
  }, [token])

  useEffect(() => {
    fetchData()
    fetchProfile()
  }, [fetchData, fetchProfile])

  const totalCals = meals?.reduce((s: number, m: any) => s + m.calories, 0) || 0
  const totalProtein = meals?.reduce((s: number, m: any) => s + m.protein, 0) || 0
  const totalCarbs = meals?.reduce((s: number, m: any) => s + m.carbs, 0) || 0
  const totalFat = meals?.reduce((s: number, m: any) => s + m.fat, 0) || 0
  const totalBurned = (workouts?.length || 0) * 150

  const [mealForm, setMealForm] = useState({ description: '', mealType: 'breakfast', time: '' })
  const [mealLoading, setMealLoading] = useState(false)
  const [mealError, setMealError] = useState<string | null>(null)

  const [workoutForm, setWorkoutForm] = useState({ description: '', duration: '', intensity: 'HIGH' })
  const [workoutLoading, setWorkoutLoading] = useState(false)
  const [workoutError, setWorkoutError] = useState<string | null>(null)

  const [profile, setProfile] = useState<any>(null)
  const [profileForm, setProfileForm] = useState({ weight: '', height: '', age: '', activityLevel: 'moderate', calorieTarget: '', proteinTarget: '', carbTarget: '', fatTarget: '' })
  const [profileLoading, setProfileLoading] = useState(false)
  const [profileError, setProfileError] = useState<string | null>(null)
  const [profileSuccess, setProfileSuccess] = useState(false)

  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  const [workoutSuggestion, setWorkoutSuggestion] = useState<any>(null)
  const [suggestionLoading, setSuggestionLoading] = useState(false)
  const [insightsLoading, setInsightsLoading] = useState(false)
  const [weeklyLoading, setWeeklyLoading] = useState(false)

  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleLogMeal = async () => {
    if (!token) return
    if (!mealForm.description.trim()) {
      setMealError('DESCRIPTION REQUIRED')
      return
    }
    setMealLoading(true)
    setMealError(null)
    try {
      await apiFetch('/api/ai/log-meal', {
        method: 'POST',
        body: JSON.stringify({
          description: mealForm.description,
          mealType: mealForm.mealType,
          time: mealForm.time || new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }),
        }),
      }, token)
      setMealForm({ description: '', mealType: 'breakfast', time: '' })
      await fetchData()
      try { await apiFetch('/api/ai/daily-insights', { method: 'POST', body: JSON.stringify({ date: today }) }, token) } catch (e) {}
    } catch (err: any) {
      setMealError(err.message || 'FAILED TO LOG MEAL')
    } finally {
      setMealLoading(false)
    }
  }

  const handleDeleteMeal = async (id: string) => {
    if (!token) return
    try {
      await apiFetch(`/api/meals/${id}`, { method: 'DELETE' }, token)
      await fetchData()
    } catch (err: any) {
      setMealError(err.message || 'FAILED TO DELETE')
    }
  }

  const handleLogWorkout = async () => {
    if (!token) return
    if (!workoutForm.description.trim()) {
      setWorkoutError('DESCRIPTION REQUIRED')
      return
    }
    setWorkoutLoading(true)
    setWorkoutError(null)
    try {
      await apiFetch('/api/ai/log-workout', {
        method: 'POST',
        body: JSON.stringify({
          description: workoutForm.description,
          duration: workoutForm.duration,
          intensity: workoutForm.intensity,
        }),
      }, token)
      setWorkoutForm({ description: '', duration: '', intensity: 'HIGH' })
      await fetchData()
    } catch (err: any) {
      setWorkoutError(err.message || 'FAILED TO LOG WORKOUT')
    } finally {
      setWorkoutLoading(false)
    }
  }

  const handleDeleteWorkout = async (id: string) => {
    if (!token) return
    try {
      await apiFetch(`/api/workouts/${id}`, { method: 'DELETE' }, token)
      await fetchData()
    } catch (err: any) {
      setWorkoutError(err.message || 'FAILED TO DELETE')
    }
  }

  const handleSaveProfile = async () => {
    if (!token) return
    setProfileLoading(true)
    setProfileError(null)
    setProfileSuccess(false)
    try {
      await apiFetch('/api/profile', {
        method: 'POST',
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
      }, token)
      setProfileSuccess(true)
      await fetchProfile()
      setTimeout(() => setProfileSuccess(false), 2000)
    } catch (err: any) {
      setProfileError(err.message || 'FAILED TO SAVE PROFILE')
    } finally {
      setProfileLoading(false)
    }
  }

  const handleSendChat = async () => {
    if (!chatInput.trim() || !token) return
    setChatLoading(true)
    try {
      await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ role: 'user', content: chatInput }),
      }, token)
      const reply = await apiFetch('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({ message: chatInput }),
      }, token)
      setChatInput('')
      // Refresh chat messages
      const msgs = await apiFetch('/api/chat', {}, token)
      setChatMessages(msgs)
    } catch (err: any) {
      await apiFetch('/api/chat', {
        method: 'POST',
        body: JSON.stringify({ role: 'ai', content: `ERROR: ${err.message || 'AI UNAVAILABLE'}` }),
      }, token)
    } finally {
      setChatLoading(false)
    }
  }

  const handleGenerateWorkoutSuggestion = async () => {
    if (!token) return
    setSuggestionLoading(true)
    try {
      const result = await apiFetch('/api/ai/workout-suggestion', { method: 'POST', body: '{}' }, token)
      setWorkoutSuggestion(result)
    } catch (err: any) {
    } finally {
      setSuggestionLoading(false)
    }
  }

  const handleGenerateWeeklySummary = async () => {
    if (!token) return
    setWeeklyLoading(true)
    try {
      const result = await apiFetch('/api/ai/weekly-summary', { method: 'POST', body: '{}' }, token)
      setWeeklySummary(result)
    } catch (err: any) {
    } finally {
      setWeeklyLoading(false)
    }
  }

  const handleGenerateInsights = async () => {
    if (!token) return
    setInsightsLoading(true)
    try {
      const result = await apiFetch('/api/ai/daily-insights', { method: 'POST', body: JSON.stringify({ date: today }) }, token)
      setDailyInsightsData(result)
    } catch (err: any) {
    } finally {
      setInsightsLoading(false)
    }
  }

  const isLoading = meals === undefined || workouts === undefined || goals === undefined

  return (
    <div className="min-h-screen bg-white dark:bg-gray-950 text-black dark:text-gray-100 font-mono selection:bg-red-600 selection:text-white transition-colors">
      <nav className="sticky top-0 z-50 bg-white dark:bg-gray-950 border-b-4 border-black dark:border-gray-700 transition-colors">
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
                    ? 'bg-black text-white dark:bg-gray-100 dark:text-gray-950'
                    : 'bg-white dark:bg-gray-950 text-black dark:text-gray-100 hover:bg-red-600 hover:text-white'
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
              onClick={logout}
              className="hidden lg:flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors"
            >
              <LogOut size={14} />
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="lg:hidden p-2 border-2 border-black dark:border-gray-700 hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors ml-auto">
              {menuOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
          </div>
        </div>
        {menuOpen && (
          <div className="lg:hidden border-t-2 border-black dark:border-gray-700 bg-white dark:bg-gray-950">
            {navItems.map((item) => (
              <button
                key={item.label}
                onClick={() => { setActiveTab(item.label); setMenuOpen(false) }}
                className={`flex items-center gap-3 w-full px-4 py-3 border-b-2 border-black dark:border-gray-700 font-bold text-sm ${activeTab === item.label ? 'bg-black text-white dark:bg-gray-100 dark:text-gray-950' : ''}`}
              >
                <item.icon size={16} />
                {item.label}
              </button>
            ))}
            <button onClick={toggleTheme} className="flex items-center gap-3 w-full px-4 py-3 border-b-2 border-black dark:border-gray-700 font-bold text-sm">
              {isDark ? <Sun size={16} /> : <Moon size={16} />}
              {isDark ? 'LIGHT MODE' : 'DARK MODE'}
            </button>
            <button onClick={() => { logout(); setMenuOpen(false) }} className="flex items-center gap-3 w-full px-4 py-3 border-b-2 border-black dark:border-gray-700 font-bold text-sm">
              <LogOut size={16} /> LOGOUT
            </button>
          </div>
        )}
      </nav>

      {isLoading ? (
        <div className="flex items-center justify-center h-96">
          <div className="flex flex-col items-center gap-4">
            <Loader2 size={32} className="animate-spin text-red-600" />
            <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">INITIALIZING DATA STREAM...</div>
          </div>
        </div>
      ) : (
        <main className="p-4 lg:p-8 max-w-7xl mx-auto">
          {activeTab === 'CALORIES' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-3xl font-black tracking-tighter">DAILY ENERGY BALANCE</h2>
                  <button
                    onClick={handleGenerateInsights}
                    disabled={insightsLoading}
                    className="flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {insightsLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    AI INSIGHTS
                  </button>
                </div>
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
                  <div className="border-2 border-black dark:border-gray-700 p-4">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">CONSUMED</div>
                    <div className="text-4xl font-black">{totalCals}</div>
                    <div className="text-xs font-bold mt-2 text-red-600">KCAL</div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-4">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">GOAL</div>
                    <div className="text-4xl font-black">{goals?.calorieGoal || 2400}</div>
                    <div className="text-xs font-bold mt-2 text-neutral-400 dark:text-gray-500">KCAL</div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-4">
                    <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">BURNED</div>
                    <div className="text-4xl font-black">{totalBurned}</div>
                    <div className="text-xs font-bold mt-2 text-red-600">KCAL</div>
                  </div>
                  <div className="border-2 border-black dark:border-gray-700 p-4 bg-black dark:bg-gray-100 text-white dark:text-gray-950">
                    <div className="text-xs font-bold text-neutral-400 dark:text-gray-500 mb-1">REMAINING</div>
                    <div className="text-4xl font-black">{Math.max(0, (goals?.calorieGoal || 2400) - totalCals)}</div>
                    <div className="text-xs font-bold mt-2 text-red-500">KCAL</div>
                  </div>
                </div>
              </div>

              <div className="grid lg:grid-cols-3 gap-6">
                <div className="lg:col-span-2 border-4 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-xl font-black mb-4">MACRONUTRIENT BREAKDOWN</h3>
                  <div className="space-y-4">
                    {[
                      { label: 'PROTEIN', val: totalProtein, max: goals?.proteinGoal || 180, unit: 'G', color: 'bg-red-600' },
                      { label: 'CARBS', val: totalCarbs, max: goals?.carbGoal || 280, unit: 'G', color: 'bg-black dark:bg-gray-100' },
                      { label: 'FATS', val: totalFat, max: goals?.fatGoal || 80, unit: 'G', color: 'bg-neutral-400 dark:bg-gray-500' },
                    ].map((m) => (
                      <div key={m.label}>
                        <div className="flex justify-between text-sm font-bold mb-1">
                          <span>{m.label}</span>
                          <span>{m.val}/{m.max}{m.unit}</span>
                        </div>
                        <div className="h-6 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900">
                          <motion.div
                            initial={{ width: 0 }}
                            animate={{ width: `${Math.min(100, (m.val / m.max) * 100)}%` }}
                            transition={{ duration: 1, ease: 'easeOut' }}
                            className={`h-full ${m.color}`}
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
                <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-xl font-black mb-4">AI DAILY INSIGHTS</h3>
                  {dailyInsightsData?.insights?.length > 0 ? (
                    <div className="space-y-3">
                      {dailyInsightsData.insights.map((insight, i) => (
                        <div key={i} className="flex items-start gap-2 text-sm font-bold">
                          <BrainCircuit size={16} className="text-red-600 mt-0.5 shrink-0" />
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

              <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                <div className="flex items-center justify-between mb-4">
                  <h3 className="text-xl font-black">WEEKLY AI SUMMARY</h3>
                  <button
                    onClick={handleGenerateWeeklySummary}
                    disabled={weeklyLoading}
                    className="flex items-center gap-2 px-3 py-2 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-red-600 hover:text-white transition-colors disabled:opacity-50"
                  >
                    {weeklyLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    GENERATE
                  </button>
                </div>
                {weeklySummary ? (
                  <p className="text-sm font-bold leading-relaxed">{weeklySummary.content}</p>
                ) : (
                  <div className="text-sm font-bold text-neutral-500 dark:text-gray-400">NO WEEKLY SUMMARY GENERATED YET.</div>
                )}
              </div>
            </motion.div>
          )}

          {activeTab === 'MEALS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-6">MEAL LOG</h2>
                <div className="border-2 border-black dark:border-gray-700 p-4 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
                  <h3 className="text-sm font-bold mb-3">LOG NEW MEAL — AI POWERED</h3>
                  <div className="space-y-3">
                    <div className="flex gap-3">
                      <select
                        value={mealForm.mealType}
                        onChange={e => setMealForm({ ...mealForm, mealType: e.target.value })}
                        className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      >
                        <option value="breakfast">BREAKFAST</option>
                        <option value="lunch">LUNCH</option>
                        <option value="snack">SNACK</option>
                        <option value="dinner">DINNER</option>
                      </select>
                      <input
                        placeholder="TIME (HH:MM)"
                        value={mealForm.time}
                        onChange={e => setMealForm({ ...mealForm, time: e.target.value })}
                        className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 flex-1"
                      />
                    </div>
                    <textarea
                      placeholder="DESCRIBE YOUR MEAL — what you ate, how it was prepared, portion size, ingredients... AI will estimate the macros for you."
                      value={mealForm.description}
                      onChange={e => setMealForm({ ...mealForm, description: e.target.value })}
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
                      {mealLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      AI LOG MEAL
                    </button>
                  </div>
                  {mealError && (
                    <div className="mt-3 p-2 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
                      {mealError}
                    </div>
                  )}
                </div>

                <div className="space-y-4">
                  {meals?.length === 0 && (
                    <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 border-2 border-dashed border-neutral-300 dark:border-gray-600 p-8 text-center">
                      NO MEALS LOGGED TODAY. DESCRIBE YOUR MEAL ABOVE AND LET AI HANDLE THE REST.
                    </div>
                  )}
                  {meals?.map((meal) => (
                    <div key={meal._id} className="border-2 border-black dark:border-gray-700 p-4 hover:bg-neutral-50 dark:hover:bg-gray-900 transition-colors">
                      <div className="flex items-start justify-between">
                        <div>
                          <div className="flex items-center gap-3">
                            <span className="text-xs font-bold bg-black dark:bg-gray-100 text-white dark:text-gray-950 px-2 py-1">{meal.time}</span>
                            <h3 className="text-lg font-black">{meal.name}</h3>
                          </div>
                          <div className="flex items-center gap-4 mt-2 text-sm font-bold text-neutral-600 dark:text-gray-400">
                            <span className="flex items-center gap-1"><Flame size={14} /> {meal.calories} KCAL</span>
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

          {activeTab === 'WORKOUT' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-6">TRAINING LOG</h2>
                <div className="border-2 border-black dark:border-gray-700 p-4 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
                  <h3 className="text-sm font-bold mb-3">LOG WORKOUT — AI POWERED</h3>
                  <div className="space-y-3">
                    <textarea
                      placeholder="DESCRIBE YOUR WORKOUT — what exercises you did, how many sets/reps, what weights... AI will structure and log it for you."
                      value={workoutForm.description}
                      onChange={e => setWorkoutForm({ ...workoutForm, description: e.target.value })}
                      rows={3}
                      className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 resize-none"
                    />
                    <div className="flex gap-3">
                      <input
                        placeholder="DURATION (e.g. 45 min)"
                        value={workoutForm.duration}
                        onChange={e => setWorkoutForm({ ...workoutForm, duration: e.target.value })}
                        className="flex-1 px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600"
                      />
                      <select
                        value={workoutForm.intensity}
                        onChange={e => setWorkoutForm({ ...workoutForm, intensity: e.target.value })}
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
                      disabled={workoutLoading || !workoutForm.description.trim()}
                      className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
                    >
                      {workoutLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                      AI LOG WORKOUT
                    </button>
                  </div>
                  {workoutError && (
                    <div className="mt-3 p-2 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
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
                    <div key={w._id} className="border-2 border-black dark:border-gray-700 p-4 grid lg:grid-cols-5 gap-4 items-center">
                      <div className="lg:col-span-2">
                        <h3 className="text-lg font-black">{w.name}</h3>
                        <span className={`text-xs font-bold px-2 py-1 mt-1 inline-block border-2 border-black dark:border-gray-700 ${
                          w.intensity === 'MAX' ? 'bg-red-600 text-white' : w.intensity === 'HIGH' ? 'bg-black dark:bg-gray-100 text-white dark:text-gray-950' : 'bg-white dark:bg-gray-900'
                        }`}>
                          {w.intensity}
                        </span>
                      </div>
                      <div className="text-center border-2 border-black dark:border-gray-700 p-2">
                        <div className="text-xs font-bold text-neutral-500 dark:text-gray-400">SETS</div>
                        <div className="text-xl font-black">{w.sets}</div>
                      </div>
                      <div className="text-center border-2 border-black dark:border-gray-700 p-2">
                        <div className="text-xs font-bold text-neutral-500 dark:text-gray-400">LOAD</div>
                        <div className="text-xl font-black">{w.weight || 'BODY'}</div>
                      </div>
                      <div className="text-center border-2 border-black dark:border-gray-700 p-2">
                        <div className="text-xs font-bold text-neutral-500 dark:text-gray-400">DURATION</div>
                        <div className="text-xl font-black">{w.duration || '-'}</div>
                      </div>
                      <div className="flex gap-1 lg:justify-end">
                        <button
                          onClick={() => handleDeleteWorkout(w._id)}
                          className="p-2 border-2 border-black dark:border-gray-700 hover:bg-red-600 hover:text-white transition-colors"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              <div className="grid lg:grid-cols-2 gap-6">
                <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-xl font-black mb-4">AI WORKOUT SUGGESTION</h3>
                  {workoutSuggestion ? (
                    <div className="space-y-3">
                      <div className="text-lg font-black">{workoutSuggestion.name}</div>
                      <div className="grid grid-cols-2 gap-2 text-sm font-bold">
                        <div className="border-2 border-black dark:border-gray-700 p-2">SETS: {workoutSuggestion.sets}</div>
                        <div className="border-2 border-black dark:border-gray-700 p-2">REPS: {workoutSuggestion.reps}</div>
                        <div className="border-2 border-black dark:border-gray-700 p-2">WEIGHT: {workoutSuggestion.weight}</div>
                        <div className="border-2 border-black dark:border-gray-700 p-2">DURATION: {workoutSuggestion.duration}</div>
                      </div>
                      <div className="text-xs font-bold text-neutral-600 dark:text-gray-400">{workoutSuggestion.rationale}</div>
                      <button
                        onClick={() => {
                          setWorkoutForm({
                            description: `${workoutSuggestion.name} - ${workoutSuggestion.sets} ${workoutSuggestion.reps} ${workoutSuggestion.weight}`,
                            duration: workoutSuggestion.duration,
                            intensity: workoutSuggestion.intensity,
                          })
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
                    {suggestionLoading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
                    GENERATE SUGGESTION
                  </button>
                </div>
                <div className="border-4 border-black dark:border-gray-700 p-6 bg-red-600 dark:bg-red-800 text-white transition-colors">
                  <h3 className="text-xl font-black mb-4">AI COACH NOTES</h3>
                  <p className="text-sm font-bold leading-relaxed">
                    LOG YOUR WORKOUTS WITH NATURAL LANGUAGE. DESCRIBE WHAT YOU DID AND AI WILL STRUCTURE THE DATA, ESTIMATE VOLUME, AND TRACK YOUR PROGRESS AUTOMATICALLY.
                  </p>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'STATS' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
              <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-6">PERFORMANCE METRICS</h2>
                {history && history.length > 0 ? (
                  <div className="grid lg:grid-cols-7 gap-2 mb-6">
                    {history.map((d, i) => (
                      <div key={d.date} className="border-2 border-black dark:border-gray-700 p-2 text-center">
                        <div className="text-xs font-bold text-neutral-500 dark:text-gray-400">{d.dayLabel}</div>
                        <div className={`h-24 border-2 border-black dark:border-gray-700 mt-2 relative ${d.calories > 0 ? 'bg-neutral-100 dark:bg-gray-800' : 'bg-white dark:bg-gray-900'}`}>
                          <motion.div
                            initial={{ height: 0 }}
                            animate={{ height: `${Math.min(100, (d.calories / (d.goal || 2400)) * 100)}%` }}
                            transition={{ duration: 0.8, delay: i * 0.1 }}
                            className="absolute bottom-0 left-0 right-0 bg-black dark:bg-gray-100"
                          />
                        </div>
                        <div className="text-xs font-bold mt-1">{d.calories}</div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 border-2 border-dashed border-neutral-300 dark:border-gray-600 p-8 text-center">
                    NO HISTORICAL DATA YET. START LOGGING TO SEE TRENDS.
                  </div>
                )}
              </div>
              <div className="grid lg:grid-cols-3 gap-6">
                <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-2">7-DAY AVG CALORIES</h3>
                  <div className="text-4xl font-black">
                    {history ? Math.round(history.reduce((s, d) => s + d.calories, 0) / Math.max(1, history.length)) : 0}
                    <span className="text-lg text-neutral-400 dark:text-gray-500">KCAL</span>
                  </div>
                  <div className="mt-4 flex items-end gap-1 h-24 border-b-2 border-black dark:border-gray-700 pb-1">
                    {history?.map((d, i) => (
                      <div key={i} className="flex-1 bg-black dark:bg-gray-100" style={{ height: `${Math.min(100, (d.calories / (d.goal || 2400)) * 100)}%` }} />
                    ))}
                  </div>
                </div>
                <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                  <h3 className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-2">7-DAY AVG PROTEIN</h3>
                  <div className="text-4xl font-black">
                    {history ? Math.round(history.reduce((s, d) => s + d.protein, 0) / Math.max(1, history.length)) : 0}
                    <span className="text-lg text-neutral-400 dark:text-gray-500">G</span>
                  </div>
                  <div className="mt-4 h-6 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900">
                    <div className="h-full bg-black dark:bg-gray-100" style={{ width: `${Math.min(100, history ? (history.reduce((s, d) => s + d.protein, 0) / Math.max(1, history.length) / (goals?.proteinGoal || 180)) * 100 : 0)}%` }} />
                  </div>
                </div>
                <div className="border-4 border-black dark:border-gray-700 p-6 bg-black dark:bg-gray-100 text-white dark:text-gray-950 transition-colors">
                  <h3 className="text-sm font-bold text-neutral-400 dark:text-gray-500 mb-2">WORKOUT DAYS</h3>
                  <div className="text-4xl font-black text-red-500">
                    {history?.filter(d => d.workouts > 0).length || 0}
                    <span className="text-lg text-neutral-500 dark:text-gray-400">/7</span>
                  </div>
                  <div className="mt-4 grid grid-cols-7 gap-1">
                    {history?.map((d, i) => (
                      <div key={i} className={`aspect-square border border-white dark:border-gray-950 ${d.workouts > 0 ? 'bg-white dark:bg-gray-950' : ''}`} />
                    ))}
                  </div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === 'AI COACH' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-3xl mx-auto">
              <div className="border-4 border-black dark:border-gray-700 bg-white dark:bg-gray-950 transition-colors">
                <div className="border-b-4 border-black dark:border-gray-700 p-4 flex items-center gap-3">
                  <div className="w-10 h-10 bg-black dark:bg-gray-100 text-white dark:text-gray-950 flex items-center justify-center">
                    <Bot size={20} />
                  </div>
                  <div>
                    <h2 className="text-lg font-black">STRIDE COACH</h2>
                    <div className="flex items-center gap-1 text-xs font-bold text-red-600">
                      <span className="w-2 h-2 bg-red-600 rounded-full animate-pulse" /> ONLINE
                    </div>
                  </div>
                </div>
                <div className="h-96 overflow-y-auto p-4 space-y-4">
                  {chatMessages?.length === 0 && (
                    <div className="text-center text-sm font-bold text-neutral-500 dark:text-gray-400 py-12">
                      START A CONVERSATION WITH YOUR AI COACH.
                    </div>
                  )}
                  {chatMessages?.map((msg, i) => (
                    <motion.div
                      key={i}
                      initial={{ opacity: 0, x: msg.role === 'ai' ? -20 : 20 }}
                      animate={{ opacity: 1, x: 0 }}
                      className={`flex ${msg.role === 'ai' ? 'justify-start' : 'justify-end'}`}
                    >
                      <div
                        className={`max-w-xs lg:max-w-md px-4 py-3 text-sm font-bold ${
                          msg.role === 'ai'
                            ? 'bg-neutral-100 dark:bg-gray-800 border-2 border-black dark:border-gray-700 text-black dark:text-gray-100'
                            : 'bg-black dark:bg-gray-100 text-white dark:text-gray-950 border-2 border-black dark:border-gray-700'
                        }`}
                      >
                        {msg.content}
                      </div>
                    </motion.div>
                  ))}
                  <div ref={chatEndRef} />
                </div>
                <div className="border-t-4 border-black dark:border-gray-700 p-4 flex gap-2">
                  <input
                    value={chatInput}
                    onChange={(e) => setChatInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSendChat()}
                    placeholder="TYPE QUERY..."
                    className="flex-1 px-4 py-3 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-900 text-black dark:text-gray-100 font-bold text-sm placeholder:text-neutral-400 dark:placeholder:text-gray-600 focus:outline-none focus:bg-neutral-50 dark:focus:bg-gray-800"
                  />
                  <button
                    onClick={handleSendChat}
                    disabled={chatLoading || !chatInput.trim()}
                    className="px-6 py-3 bg-black dark:bg-gray-100 text-white dark:text-gray-950 font-bold text-sm border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
                  >
                    {chatLoading ? <Loader2 size={16} className="animate-spin" /> : <Send size={16} />}
                  </button>
                </div>
              </div>
              <div className="mt-6 grid grid-cols-2 lg:grid-cols-4 gap-3">
                {['MACRO ANALYSIS', 'MEAL PLAN', 'WORKOUT SPLIT', 'SUPPLEMENTS'].map((q) => (
                  <button
                    key={q}
                    onClick={() => { setChatInput(q); setTimeout(() => handleSendChat(), 50) }}
                    className="p-3 border-2 border-black dark:border-gray-700 text-xs font-bold hover:bg-black hover:text-white dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors text-left"
                  >
                    {q} →
                  </button>
                ))}
              </div>
            </motion.div>
          )}

          {activeTab === 'PROFILE' && (
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} className="max-w-2xl mx-auto space-y-6">
              <div className="border-4 border-black dark:border-gray-700 p-6 transition-colors">
                <h2 className="text-3xl font-black tracking-tighter mb-6">OPERATOR PROFILE</h2>
                <p className="text-sm font-bold text-neutral-500 dark:text-gray-400 mb-6">
                  SET YOUR BODY METRICS AND TARGETS. AI WILL USE THIS DATA TO PERSONALIZE RECOMMENDATIONS.
                </p>

                <div className="space-y-4">
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">WEIGHT (KG)</label>
                      <input
                        type="number"
                        value={profileForm.weight}
                        onChange={e => setProfileForm({ ...profileForm, weight: e.target.value })}
                        placeholder="e.g. 75"
                        className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">HEIGHT (CM)</label>
                      <input
                        type="number"
                        value={profileForm.height}
                        onChange={e => setProfileForm({ ...profileForm, height: e.target.value })}
                        placeholder="e.g. 175"
                        className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">AGE</label>
                      <input
                        type="number"
                        value={profileForm.age}
                        onChange={e => setProfileForm({ ...profileForm, age: e.target.value })}
                        placeholder="e.g. 28"
                        className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">ACTIVITY LEVEL</label>
                      <select
                        value={profileForm.activityLevel}
                        onChange={e => setProfileForm({ ...profileForm, activityLevel: e.target.value })}
                        className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                      >
                        <option value="sedentary">SEDENTARY</option>
                        <option value="light">LIGHT</option>
                        <option value="moderate">MODERATE</option>
                        <option value="active">ACTIVE</option>
                        <option value="intense">INTENSE</option>
                      </select>
                    </div>
                  </div>

                  <div className="border-t-2 border-black dark:border-gray-700 pt-4">
                    <h3 className="text-sm font-bold mb-3 text-red-600">DAILY MACRO TARGETS</h3>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                      <div>
                        <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">CALORIES</label>
                        <input
                          type="number"
                          value={profileForm.calorieTarget}
                          onChange={e => setProfileForm({ ...profileForm, calorieTarget: e.target.value })}
                          placeholder="2400"
                          className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">PROTEIN (G)</label>
                        <input
                          type="number"
                          value={profileForm.proteinTarget}
                          onChange={e => setProfileForm({ ...profileForm, proteinTarget: e.target.value })}
                          placeholder="180"
                          className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">CARBS (G)</label>
                        <input
                          type="number"
                          value={profileForm.carbTarget}
                          onChange={e => setProfileForm({ ...profileForm, carbTarget: e.target.value })}
                          placeholder="280"
                          className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                        />
                      </div>
                      <div>
                        <label className="block text-xs font-bold mb-1 text-neutral-500 dark:text-gray-400">FAT (G)</label>
                        <input
                          type="number"
                          value={profileForm.fatTarget}
                          onChange={e => setProfileForm({ ...profileForm, fatTarget: e.target.value })}
                          placeholder="80"
                          className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
                        />
                      </div>
                    </div>
                  </div>

                  <button
                    onClick={handleSaveProfile}
                    disabled={profileLoading}
                    className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 text-white text-xs font-bold border-2 border-red-600 hover:bg-black dark:hover:bg-gray-100 dark:hover:text-gray-950 transition-colors disabled:opacity-50"
                  >
                    {profileLoading ? <Loader2 size={14} className="animate-spin" /> : 'SAVE PROFILE'}
                  </button>

                  {profileError && (
                    <div className="p-2 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
                      {profileError}
                    </div>
                  )}
                  {profileSuccess && (
                    <div className="p-2 border-2 border-green-600 bg-green-50 dark:bg-green-950 text-xs font-bold text-green-700 dark:text-green-400">
                      PROFILE SAVED SUCCESSFULLY
                    </div>
                  )}

                  {profile && (profile.weight || profile.height) && (
                    <div className="border-2 border-black dark:border-gray-700 p-4 mt-4 bg-neutral-50 dark:bg-gray-900">
                      <h3 className="text-sm font-bold mb-3">CURRENT PROFILE</h3>
                      <div className="grid grid-cols-2 gap-2 text-xs font-bold">
                        {profile.weight && <div>WEIGHT: <span className="text-red-600">{profile.weight} KG</span></div>}
                        {profile.height && <div>HEIGHT: <span className="text-red-600">{profile.height} CM</span></div>}
                        {profile.age && <div>AGE: <span className="text-red-600">{profile.age}</span></div>}
                        <div>ACTIVITY: <span className="text-red-600">{profile.activityLevel?.toUpperCase()}</span></div>
                        {profile.calorieTarget && <div>CAL TARGET: <span className="text-red-600">{profile.calorieTarget} KCAL</span></div>}
                        {profile.proteinTarget && <div>PROTEIN: <span className="text-red-600">{profile.proteinTarget}G</span></div>}
                        {profile.carbTarget && <div>CARBS: <span className="text-red-600">{profile.carbTarget}G</span></div>}
                        {profile.fatTarget && <div>FAT: <span className="text-red-600">{profile.fatTarget}G</span></div>}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </motion.div>
          )}
        </main>
      )}


    </div>
  )
}
