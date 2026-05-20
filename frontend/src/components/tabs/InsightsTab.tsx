import { motion } from "framer-motion";
import {
  Flame,
  Target,
  Droplets,
  BedDouble,
  TrendingUp,
  Activity,
  LineChart,
  PieChart,
  BarChart2,
  BrainCircuit,
  Sparkles,
  Loader2,
} from "lucide-react";
import { Card } from "../ui/Card";
import { StatCard } from "../ui/StatCard";
import { PageHeader } from "../ui/PageHeader";

interface InsightsTabProps {
  totalCals: number;
  totalProtein: number;
  totalCarbs: number;
  totalFat: number;
  effectiveGoals: {
    calorieGoal: number;
    proteinGoal: number;
    carbGoal: number;
    fatGoal: number;
  };
  insightView: 'overview' | 'calories' | 'macros' | 'trends';
  setInsightView: (v: 'overview' | 'calories' | 'macros' | 'trends') => void;
  weeklySummary: any;
  weeklyLoading: boolean;
  dailyInsightsData: any;
  insightsLoading: boolean;
  waterIntake: number;
  waterUnit: 'glasses' | 'litres';
  sleepHours: number;
  sleepGoal: number;
  onGenerateWeeklySummary: () => void;
  onGenerateDailyInsights: () => void;
}

export default function InsightsTab({
  totalCals,
  totalProtein,
  totalCarbs,
  totalFat,
  effectiveGoals,
  insightView,
  setInsightView,
  weeklySummary,
  weeklyLoading,
  dailyInsightsData,
  insightsLoading,
  waterIntake,
  waterUnit,
  sleepHours,
  sleepGoal,
  onGenerateWeeklySummary,
  onGenerateDailyInsights,
}: InsightsTabProps) {
  return (
    <motion.div
      key="insights-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 will-change-transform"
      data-testid="insights-tab"
    >
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

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard label="CALORIES" value={totalCals || 0} subValue={`${effectiveGoals.calorieGoal ? Math.round(((totalCals || 0) / effectiveGoals.calorieGoal) * 100) : 0}% of goal`} icon={Flame} accent />
        <StatCard label="PROTEIN" value={`${totalProtein || 0}g`} subValue={`${effectiveGoals.proteinGoal ? Math.round(((totalProtein || 0) / effectiveGoals.proteinGoal) * 100) : 0}% of goal`} icon={Target} />
        <StatCard label="HYDRATION" value={waterUnit === 'glasses' ? Math.floor(waterIntake) : waterIntake.toFixed(1)} subValue={waterUnit === 'glasses' ? 'GLASSES' : 'LITRES'} icon={Droplets} />
        <StatCard label="SLEEP" value={`${sleepHours}h`} subValue={sleepHours >= sleepGoal ? "GOAL MET" : `${(sleepGoal - sleepHours).toFixed(1)}h short`} icon={BedDouble} />
      </div>

      <Card className="p-6">
        {insightView === 'overview' && (
          <>
            <h2 className="font-heading text-2xl uppercase tracking-normal mb-4">Weekly Overview</h2>
            {weeklySummary ? (
              <p className="text-sm text-[var(--text-secondary)] leading-relaxed tracking-wide mb-4">{weeklySummary.content}</p>
            ) : (
              <div className="text-sm font-mono text-[var(--text-muted)] mb-4 tracking-wide">
                No weekly summary yet. <button onClick={onGenerateWeeklySummary} className="text-accent hover:underline">Generate one</button>
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
                  <span className="font-mono tracking-wide">Meals logged today: {dailyInsightsData?.meals?.length ?? 0}</span>
                </div>
                <span className="text-green-500 font-heading">+{dailyInsightsData?.meals?.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <TrendingUp size={20} className="text-green-500" />
                  <span className="font-mono tracking-wide">Workouts logged today: {dailyInsightsData?.workouts?.length ?? 0}</span>
                </div>
                <span className="text-green-500 font-heading">+{dailyInsightsData?.workouts?.length ?? 0}</span>
              </div>
              <div className="flex items-center justify-between p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <div className="flex items-center gap-3">
                  <Activity size={20} className="text-yellow-500" />
                  <span className="font-mono tracking-wide">Calorie progress: {effectiveGoals.calorieGoal ? Math.round((totalCals / effectiveGoals.calorieGoal) * 100) : 0}%</span>
                </div>
                <span className="text-yellow-500 font-heading">{effectiveGoals.calorieGoal ? Math.round((totalCals / effectiveGoals.calorieGoal) * 100) : 0}%</span>
              </div>
            </div>
          </>
        )}
      </Card>

      <Card className="p-6 border-l-4 border-l-accent">
        <div className="flex items-center justify-between mb-4">
          <div className="flex items-center gap-2">
            <BrainCircuit size={24} className="text-accent" strokeWidth={2} />
            <h2 className="font-heading text-2xl uppercase tracking-normal">AI Recommendations</h2>
          </div>
          <button
            onClick={onGenerateDailyInsights}
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
  );
}
