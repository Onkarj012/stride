import { motion } from "framer-motion";
import { useDashboard } from "./context/DashboardContext";

export default function HomePage() {
  const {
    user,
    totalCals,
    totalProtein,
    effectiveGoals,
    meals,
    workouts,
    setActiveTab,
  } = useDashboard();

  return (
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
            <div className="text-3xl font-black">{meals?.length || 0}</div>
            <div className="text-xs font-bold mt-2 text-neutral-500 dark:text-gray-400">
              ENTRIES
            </div>
          </div>
          <div className="border-2 border-black dark:border-gray-700 p-6">
            <div className="text-xs font-bold text-neutral-500 dark:text-gray-400 mb-1">
              WORKOUTS
            </div>
            <div className="text-3xl font-black">{workouts?.length || 0}</div>
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
                    <span className="text-sm font-bold">{meal.name}</span>
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
  );
}
