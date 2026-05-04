import { motion } from "framer-motion";
import { Flame, Trash2, Loader2, Sparkles, Zap } from "lucide-react";
import { useDashboard } from "./context/DashboardContext";

export default function MealsPage() {
  const {
    meals,
    mealForm,
    setMealForm,
    mealLoading,
    mealError,
    handleLogMeal,
    handleDeleteMeal,
  } = useDashboard();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
        <h2 className="text-3xl font-black tracking-tighter mb-6">
          MEAL LOG
        </h2>
        <div className="border-2 border-black dark:border-gray-700 p-6 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
          <h3 className="text-sm font-bold mb-3">
            LOG NEW MEAL — AI POWERED
          </h3>
          <div className="space-y-3">
            <div className="flex gap-3">
              <select
                value={mealForm.mealType}
                onChange={(e) =>
                  setMealForm({ ...mealForm, mealType: e.target.value })
                }
                className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none"
              >
                <option value="breakfast">BREAKFAST</option>
                <option value="lunch">LUNCH</option>
                <option value="snack">SNACK</option>
                <option value="dinner">DINNER</option>
              </select>
              <input
                placeholder="Time (HH:MM)"
                value={mealForm.time}
                onChange={(e) =>
                  setMealForm({ ...mealForm, time: e.target.value })
                }
                className="px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 flex-1"
              />
            </div>
            <textarea
              placeholder="Describe your meal — what you ate, how it was prepared, portion size, ingredients... AI will estimate the macros for you."
              value={mealForm.description}
              onChange={(e) =>
                setMealForm({
                  ...mealForm,
                  description: e.target.value,
                })
              }
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
              {mealLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AI LOG MEAL
            </button>
          </div>
          {mealError && (
            <div className="mt-3 p-4 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
              {mealError}
            </div>
          )}
        </div>

        <div className="space-y-4">
          {meals?.length === 0 && (
            <div className="text-sm font-bold text-neutral-500 dark:text-gray-400 border-2 border-dashed border-neutral-300 dark:border-gray-600 p-8 text-center">
              NO MEALS LOGGED TODAY. DESCRIBE YOUR MEAL ABOVE AND LET AI
              HANDLE THE REST.
            </div>
          )}
          {meals?.map((meal) => (
            <div
              key={meal._id}
              className="border-2 border-black dark:border-gray-700 p-4 hover:bg-neutral-50 dark:hover:bg-gray-900 transition-colors"
            >
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className="text-xs font-bold bg-black dark:bg-gray-100 text-white dark:text-gray-950 px-2 py-1">
                      {meal.time}
                    </span>
                    {meal.mealType &&
                      meal.mealType !== "unspecified" && (
                        <span className="text-xs font-bold border-2 border-black dark:border-gray-700 px-2 py-1 uppercase">
                          {meal.mealType}
                        </span>
                      )}
                    <h3 className="text-lg font-black">{meal.name}</h3>
                  </div>
                  <div className="flex items-center gap-4 mt-2 text-sm font-bold text-neutral-600 dark:text-gray-400">
                    <span className="flex items-center gap-1">
                      <Flame size={14} /> {meal.calories} KCAL
                    </span>
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
  );
}
