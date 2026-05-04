import { motion } from "framer-motion";
import { BrainCircuit, Loader2, Sparkles } from "lucide-react";
import { useDashboard } from "./context/DashboardContext";

export default function CaloriesPage() {
  const {
    totalCals,
    totalBurned,
    effectiveGoals,
    totalProtein,
    totalCarbs,
    totalFat,
    dailyInsightsData,
    weeklySummary,
    handleGenerateInsights,
    handleGenerateWeeklySummary,
    insightsLoading,
    weeklyLoading,
  } = useDashboard();

  return (
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
  );
}
