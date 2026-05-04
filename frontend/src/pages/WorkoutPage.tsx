import { motion } from "framer-motion";
import { Trash2, Loader2, Sparkles } from "lucide-react";
import { useDashboard } from "./context/DashboardContext";

export default function WorkoutPage() {
  const {
    workouts,
    workoutForm,
    setWorkoutForm,
    workoutLoading,
    workoutError,
    handleLogWorkout,
    handleDeleteWorkout,
    workoutSuggestion,
    suggestionLoading,
    handleGenerateWorkoutSuggestion,
  } = useDashboard();

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      className="space-y-6"
    >
      <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
        <h2 className="text-3xl font-black tracking-tighter mb-6">
          TRAINING LOG
        </h2>
        <div className="border-2 border-black dark:border-gray-700 p-6 mb-6 bg-neutral-50 dark:bg-gray-900 transition-colors">
          <h3 className="text-sm font-bold mb-3">
            LOG WORKOUT — AI POWERED
          </h3>
          <div className="space-y-3">
            <textarea
              placeholder="Describe your workout — what exercises you did, how many sets/reps, what weights... AI will structure and log it for you."
              value={workoutForm.description}
              onChange={(e) =>
                setWorkoutForm({
                  ...workoutForm,
                  description: e.target.value,
                })
              }
              rows={3}
              className="w-full px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600 resize-none"
            />
            <div className="flex gap-3">
              <input
                placeholder="Duration (e.g. 45 min)"
                value={workoutForm.duration}
                onChange={(e) =>
                  setWorkoutForm({
                    ...workoutForm,
                    duration: e.target.value,
                  })
                }
                className="flex-1 px-3 py-2 border-2 border-black dark:border-gray-700 bg-white dark:bg-gray-800 text-black dark:text-gray-100 font-bold text-sm focus:outline-none placeholder:text-neutral-400 dark:placeholder:text-gray-600"
              />
              <select
                value={workoutForm.intensity}
                onChange={(e) =>
                  setWorkoutForm({
                    ...workoutForm,
                    intensity: e.target.value,
                  })
                }
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
              disabled={
                workoutLoading || !workoutForm.description.trim()
              }
              className="flex items-center gap-2 px-4 py-2 bg-black dark:bg-gray-100 text-white dark:text-gray-950 text-xs font-bold border-2 border-black dark:border-gray-700 hover:bg-red-600 dark:hover:bg-red-600 dark:hover:text-white transition-colors disabled:opacity-50"
            >
              {workoutLoading ? (
                <Loader2 size={14} className="animate-spin" />
              ) : (
                <Sparkles size={14} />
              )}
              AI LOG WORKOUT
            </button>
          </div>
          {workoutError && (
            <div className="mt-3 p-4 border-2 border-red-600 bg-red-50 dark:bg-red-950 text-xs font-bold text-red-700 dark:text-red-400">
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
            <div
              key={w._id}
              className="border-2 border-black dark:border-gray-700 p-4"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <div className="flex items-center gap-3 flex-wrap">
                    <h3 className="text-lg font-black">{w.name}</h3>
                    <span
                      className={`text-xs font-bold px-2 py-1 border-2 border-black dark:border-gray-700 ${
                        w.intensity === "MAX"
                          ? "bg-red-600 text-white"
                          : w.intensity === "HIGH"
                            ? "bg-black dark:bg-gray-100 text-white dark:text-gray-950"
                            : "bg-white dark:bg-gray-900"
                      }`}
                    >
                      {w.intensity}
                    </span>
                    {w.duration && (
                      <span className="text-xs font-bold text-neutral-500 dark:text-gray-400 border-2 border-black dark:border-gray-700 px-2 py-1">
                        {w.duration}
                      </span>
                    )}
                  </div>
                  {w.exercises && w.exercises.length > 0 ? (
                    <div className="mt-3 space-y-3">
                      {w.exercises.map((ex: any, ei: number) => (
                        <div key={ei}>
                          <div className="text-xs font-bold text-black dark:text-gray-200 uppercase tracking-wide mb-1">
                            {ex.name}
                          </div>
                          {Array.isArray(ex.sets) ? (
                            <div className="ml-2 flex flex-wrap gap-x-3 gap-y-0.5">
                              {ex.sets.map((s: any, si: number) => (
                                <span
                                  key={si}
                                  className="text-xs text-neutral-500 dark:text-gray-400 flex items-center gap-1"
                                >
                                  <span className="w-1 h-1 bg-red-600 rounded-full shrink-0" />
                                  {s.weight !== "cardio" ? (
                                    <>
                                      {s.weight} × {s.reps}
                                    </>
                                  ) : (
                                    <>{s.reps}</>
                                  )}
                                </span>
                              ))}
                            </div>
                          ) : (
                            <div className="ml-2 text-xs text-neutral-500 dark:text-gray-400">
                              {ex.sets} sets · {ex.reps} reps @{" "}
                              {ex.weight}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="flex gap-3 mt-2 text-xs font-bold text-neutral-500 dark:text-gray-400">
                      {w.sets && <span>SETS: {w.sets}</span>}
                      {w.weight && <span>LOAD: {w.weight}</span>}
                    </div>
                  )}
                </div>
                <button
                  onClick={() => handleDeleteWorkout(w._id)}
                  className="p-2 border-2 border-black dark:border-gray-700 hover:bg-red-600 hover:text-white transition-colors shrink-0"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-2 gap-6">
        <div className="border-2 border-black dark:border-gray-700 p-6 transition-colors">
          <h3 className="text-xl font-black mb-4">
            AI WORKOUT SUGGESTION
          </h3>
          {workoutSuggestion ? (
            <div className="space-y-3">
              <div className="text-lg font-black">
                {workoutSuggestion.name}
              </div>
              <div className="grid grid-cols-2 gap-2 text-sm font-bold">
                <div className="border-2 border-black dark:border-gray-700 p-4">
                  SETS: {workoutSuggestion.sets}
                </div>
                <div className="border-2 border-black dark:border-gray-700 p-4">
                  REPS: {workoutSuggestion.reps}
                </div>
                <div className="border-2 border-black dark:border-gray-700 p-4">
                  WEIGHT: {workoutSuggestion.weight}
                </div>
                <div className="border-2 border-black dark:border-gray-700 p-4">
                  DURATION: {workoutSuggestion.duration}
                </div>
              </div>
              <div className="text-xs font-bold text-neutral-600 dark:text-gray-400">
                {workoutSuggestion.rationale}
              </div>
              <button
                onClick={() => {
                  setWorkoutForm({
                    description: `${workoutSuggestion.name} - ${workoutSuggestion.sets} ${workoutSuggestion.reps} ${workoutSuggestion.weight}`,
                    duration: workoutSuggestion.duration,
                    intensity: workoutSuggestion.intensity,
                  });
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
            {suggestionLoading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Sparkles size={14} />
            )}
            GENERATE SUGGESTION
          </button>
        </div>
        <div className="border-2 border-red-600 p-6 bg-red-50 dark:bg-red-950 transition-colors">
          <h3 className="text-xl font-black mb-4 text-red-700 dark:text-red-400">
            AI COACH NOTES
          </h3>
          <p className="text-sm font-bold leading-relaxed text-red-700 dark:text-red-400">
            LOG YOUR WORKOUTS WITH NATURAL LANGUAGE. DESCRIBE WHAT YOU
            DID AND AI WILL STRUCTURE THE DATA, ESTIMATE VOLUME, AND
            TRACK YOUR PROGRESS AUTOMATICALLY.
          </p>
        </div>
      </div>
    </motion.div>
  );
}
