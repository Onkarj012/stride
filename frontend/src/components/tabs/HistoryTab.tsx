import { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Calendar,
  ChevronLeft,
  ChevronRight,
  Plus,
  Flame,
  Repeat,
  BarChart2,
} from "lucide-react";
import type { Id } from "../../../backend/convex/_generated/dataModel";
import { Card } from "../ui/Card";
import { PageHeader } from "../ui/PageHeader";
import { ConfirmLogCard } from "../ConfirmLogCard";
import { springs } from "../../lib/animations";
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

const monthNames = ["JAN", "FEB", "MAR", "APR", "MAY", "JUN", "JUL", "AUG", "SEP", "OCT", "NOV", "DEC"];

function getDaysInMonth(year: number, month: number) {
  return new Date(year, month, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number) {
  return new Date(year, month - 1, 1).getDay();
}

interface HistoryTabProps {
  today: string;
  calendarData: Record<string, { meals: number; workouts: number }>;
  historyDayData: any;
  historyInsights: any;
  effectiveGoals: {
    calorieGoal: number;
    proteinGoal: number;
    carbGoal: number;
    fatGoal: number;
  };
  onCommitMeal: (data: any, date: string) => Promise<void>;
  onCommitWorkout: (data: any, date: string) => Promise<void>;
}

export default function HistoryTab({
  today,
  calendarData,
  historyDayData,
  historyInsights,
  effectiveGoals,
  onCommitMeal,
  onCommitWorkout,
}: HistoryTabProps) {
  const [calendarYear, setCalendarYear] = useState(new Date().getFullYear());
  const [calendarMonth, setCalendarMonth] = useState(new Date().getMonth() + 1);
  const [selectedDate, setSelectedDate] = useState<string | null>(today);
  const [calendarPanelPct, setCalendarPanelPct] = useState(35);
  const [calendarHidden, setCalendarHidden] = useState(false);
  const [isDesktop, setIsDesktop] = useState(false);
  const [historyView, setHistoryView] = useState<'day' | 'insights'>('day');
  const [historyInsightDays, setHistoryInsightDays] = useState(30);
  const [historyAddMealDate, setHistoryAddMealDate] = useState<string | null>(null);
  const [historyAddWorkoutDate, setHistoryAddWorkoutDate] = useState<string | null>(null);

  const resizeRef = useRef<{ startX: number; startPct: number } | null>(null);
  const historyContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const check = () => setIsDesktop(window.innerWidth >= 1024);
    check();
    window.addEventListener('resize', check);
    return () => window.removeEventListener('resize', check);
  }, []);

  useEffect(() => {
    const handleMouseMove = (e: MouseEvent) => {
      if (resizeRef.current && historyContainerRef.current) {
        const containerRect = historyContainerRef.current.getBoundingClientRect();
        const dx = e.clientX - resizeRef.current.startX;
        const newPct = Math.min(60, Math.max(20, resizeRef.current.startPct + (dx / containerRect.width) * 100));
        setCalendarPanelPct(newPct);
      }
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

  const handleSelectDate = (dateStr: string) => {
    setSelectedDate(dateStr);
  };

  return (
    <motion.div
      key="history-tab"
      ref={historyContainerRef}
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="flex flex-col flex-1 min-h-0 will-change-transform"
      data-testid="history-tab"
    >
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

          <div
            className="hidden lg:block w-1 shrink-0 cursor-col-resize hover:bg-accent transition-colors bg-[var(--border-default)]"
            onMouseDown={(e) => { resizeRef.current = { startX: e.clientX, startPct: calendarPanelPct }; document.body.style.cursor = "col-resize"; document.body.style.userSelect = "none"; }}
          />

          <div className="flex-1 min-w-0 overflow-y-auto p-4">
            {historyAddMealDate && (
              <ConfirmLogCard
                mode="meal"
                initialData={{ description: "", mealType: "unspecified", time: "" }}
                onConfirm={(data) => {
                  onCommitMeal(data, historyAddMealDate);
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
                  onCommitWorkout(data, historyAddWorkoutDate);
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
                        <div key={m._id} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-0.5 shrink-0">{m.time}</span>
                              <span className="font-medium tracking-wide truncate">{m.name}</span>
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="font-mono text-accent tracking-wide">{m.calories} kcal</span>
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onCommitMeal({ name: m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat, time: m.time, mealType: m.mealType }, today)}
                                className="p-1.5 border border-[var(--border-default)] hover:border-accent hover:bg-accent hover:text-[var(--theme-primary-text)] transition-all opacity-0 group-hover:opacity-100"
                                title="Log again today"
                              >
                                <Repeat size={12} />
                              </motion.button>
                            </div>
                          </div>
                          <div className="flex items-center gap-3 text-[10px] font-mono text-[var(--text-muted)] tracking-wide">
                            <span>P: {m.protein}g</span>
                            <span>C: {m.carbs.toFixed(2)}g</span>
                            <span>F: {m.fat}g</span>
                            {m.mealType && <span className="uppercase">{m.mealType}</span>}
                          </div>
                          {m.aiSuggestion && (
                            <div className="mt-2 text-xs text-[var(--text-muted)] italic border-l-2 border-accent pl-2">
                              {m.aiSuggestion}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs font-mono text-[var(--text-muted)] mt-2 tracking-wide">
                      TOTAL: {historyDayData.meals.reduce((s: number, m: any) => s + m.calories, 0)} kcal · P: {historyDayData.meals.reduce((s: number, m: any) => s + m.protein, 0)}g · C: {historyDayData.meals.reduce((s: number, m: any) => s + m.carbs, 0).toFixed(2)}g · F: {historyDayData.meals.reduce((s: number, m: any) => s + m.fat, 0)}g
                    </div>
                  </div>
                )}

                {historyDayData.workouts.length > 0 && (
                  <div className="mb-6">
                    <div className="text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Workouts ({historyDayData.workouts.length})</div>
                    <div className="space-y-2">
                      {historyDayData.workouts.map((w: any) => (
                        <div key={w._id} className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] group">
                          <div className="flex items-center justify-between mb-2">
                            <div className="flex items-center gap-2 flex-1 min-w-0">
                              <span className={`text-xs font-mono px-2 py-0.5 shrink-0 ${w.intensity === "MAX" ? "bg-red-600 text-white" : w.intensity === "HIGH" ? "bg-accent text-[var(--theme-primary-text)]" : "border border-[var(--border-default)]"}`}>{w.intensity}</span>
                              <span className="font-medium tracking-wide truncate">{w.name}</span>
                              {w.duration && <span className="text-xs text-[var(--text-muted)] shrink-0">{w.duration}</span>}
                            </div>
                            <div className="flex items-center gap-2">
                              {w.caloriesBurned !== undefined && w.caloriesBurned !== null && w.caloriesBurned > 0 && (
                                <span className="flex items-center gap-1 text-xs font-mono bg-accent/20 text-accent px-2 py-0.5">
                                  <Flame size={10} /> {w.caloriesBurned} kcal
                                </span>
                              )}
                              <motion.button
                                whileHover={{ scale: 1.1 }}
                                whileTap={{ scale: 0.9 }}
                                onClick={() => onCommitWorkout({ name: w.name, sets: w.sets, duration: w.duration, intensity: w.intensity, exercises: w.exercises, rationale: w.rationale, caloriesBurned: w.caloriesBurned }, today)}
                                className="p-1.5 border border-[var(--border-default)] hover:border-accent hover:bg-accent hover:text-[var(--theme-primary-text)] transition-all opacity-0 group-hover:opacity-100"
                                title="Log again today"
                              >
                                <Repeat size={12} />
                              </motion.button>
                            </div>
                          </div>
                          {w.exercises && w.exercises.length > 0 && (
                            <div className="text-xs text-[var(--text-muted)] space-y-1 mb-2">
                              {w.exercises.map((ex: any, ei: number) => (
                                <div key={ei} className="tracking-wide">{ex.name}: {ex.sets.map((s: any) => `${s.weight ? s.weight + '\u00D7' : ''}${s.reps}`).join(', ')}</div>
                              ))}
                            </div>
                          )}
                          {w.rationale && (
                            <div className="text-xs text-[var(--text-muted)] italic border-l-2 border-accent pl-2">
                              {w.rationale}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <div className="text-xs font-mono text-[var(--text-muted)] mt-2 tracking-wide flex items-center gap-1">
                      <Flame size={12} className="text-accent" /> TOTAL BURNED: {historyDayData.workouts.reduce((s: number, w: any) => s + (w.caloriesBurned ?? 0), 0)} kcal
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
  );
}
