import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, Reorder } from "framer-motion";
import {
  Play,
  Pause,
  Square,
  Plus,
  X,
  Dumbbell,
  Clock,
  Flame,
  ChevronDown,
  ChevronUp,
  Trash2,
  GripVertical,
  Check,
  Zap,
} from "lucide-react";
import { Card } from "./ui/Card";
import {
  WorkoutTimer,
  AnimatedNumber,
  ConfettiBurst,
  PulseRing,
  AnimatedCheckmark,
} from "./ui/AnimatedComponents";
import { springs, exerciseCardIn, setAdded } from "../lib/animations";

interface ExerciseSet {
  weight: string;
  reps: string;
  completed: boolean;
}

interface Exercise {
  id: string;
  name: string;
  sets: ExerciseSet[];
  isExpanded: boolean;
}

interface LiveWorkoutProps {
  onFinish: (data: {
    name: string;
    intensity: string;
    duration: string;
    exercises: { name: string; sets: { weight: string; reps: string }[] }[];
  }) => void;
  onCancel: () => void;
}

export function LiveWorkout({ onFinish, onCancel }: LiveWorkoutProps) {
  const [isRunning, setIsRunning] = useState(true);
  const [workoutName, setWorkoutName] = useState("");
  const [intensity, setIntensity] = useState("HIGH");
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [currentExercise, setCurrentExercise] = useState("");
  const [currentWeight, setCurrentWeight] = useState("");
  const [currentReps, setCurrentReps] = useState("");
  const [showCelebration, setShowCelebration] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);
  const exerciseInputRef = useRef<HTMLInputElement>(null);

  // Timer
  useEffect(() => {
    let interval: ReturnType<typeof setInterval>;
    if (isRunning) {
      interval = setInterval(() => setElapsedSeconds((s) => s + 1), 1000);
    }
    return () => clearInterval(interval);
  }, [isRunning]);

  const formatTime = (s: number) => {
    const mins = Math.floor(s / 60);
    const secs = s % 60;
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  const totalSets = exercises.reduce((sum, ex) => sum + ex.sets.length, 0);
  const completedSets = exercises.reduce(
    (sum, ex) => sum + ex.sets.filter((s) => s.completed).length,
    0
  );

  const addSet = () => {
    if (!currentExercise.trim() || !currentReps.trim()) return;

    const existingIndex = exercises.findIndex(
      (e) => e.name.toLowerCase() === currentExercise.trim().toLowerCase()
    );

    if (existingIndex >= 0) {
      setExercises((prev) =>
        prev.map((ex, i) =>
          i === existingIndex
            ? {
                ...ex,
                sets: [...ex.sets, { weight: currentWeight, reps: currentReps, completed: false }],
                isExpanded: true,
              }
            : ex
        )
      );
    } else {
      setExercises((prev) => [
        ...prev,
        {
          id: Date.now().toString(),
          name: currentExercise.trim(),
          sets: [{ weight: currentWeight, reps: currentReps, completed: false }],
          isExpanded: true,
        },
      ]);
    }

    setCurrentWeight("");
    setCurrentReps("");
    exerciseInputRef.current?.focus();
  };

  const toggleSetComplete = (exIndex: number, setIndex: number) => {
    const wasCompleted = exercises[exIndex].sets[setIndex].completed;

    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exIndex
          ? {
              ...ex,
              sets: ex.sets.map((s, si) =>
                si === setIndex ? { ...s, completed: !s.completed } : s
              ),
            }
          : ex
      )
    );

    // Celebrate when completing a set
    if (!wasCompleted) {
      setShowCelebration(true);
      setTimeout(() => setShowCelebration(false), 1500);
    }
  };

  const removeSet = (exIndex: number, setIndex: number) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exIndex
          ? { ...ex, sets: ex.sets.filter((_, si) => si !== setIndex) }
          : ex
      ).filter((ex) => ex.sets.length > 0)
    );
  };

  const toggleExpand = (exIndex: number) => {
    setExercises((prev) =>
      prev.map((ex, i) =>
        i === exIndex ? { ...ex, isExpanded: !ex.isExpanded } : ex
      )
    );
  };

  const handleFinish = () => {
    if (exercises.length === 0) return;

    const duration = `${Math.floor(elapsedSeconds / 60)} min`;
    const name = workoutName.trim() || `${exercises.length} Exercise Session`;

    onFinish({
      name,
      intensity,
      duration,
      exercises: exercises.map((ex) => ({
        name: ex.name,
        sets: ex.sets.map((s) => ({ weight: s.weight, reps: s.reps })),
      })),
    });
  };

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -20 }}
      transition={springs.smooth}
    >
      <Card className="overflow-hidden border-2 border-accent relative">
        {/* Celebration confetti */}
        <ConfettiBurst trigger={showCelebration} particleCount={12} />

        {/* Header with Timer */}
        <div className="bg-accent text-[var(--theme-primary-text)] p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <motion.div
                animate={isRunning ? { rotate: [0, 360] } : {}}
                transition={{ duration: 2, repeat: Infinity, ease: "linear" }}
              >
                <Dumbbell size={24} strokeWidth={2.5} />
              </motion.div>
              <div>
                <div className="font-mono text-xs uppercase tracking-wider opacity-80">
                  LIVE WORKOUT
                </div>
                <motion.div
                  className="font-heading text-3xl tabular-nums"
                  animate={isRunning ? { scale: [1, 1.02, 1] } : {}}
                  transition={{ duration: 1, repeat: Infinity }}
                >
                  {formatTime(elapsedSeconds)}
                </motion.div>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={() => setIsRunning(!isRunning)}
                className="p-3 bg-[var(--theme-primary-text)]/20 hover:bg-[var(--theme-primary-text)]/30 transition-colors"
              >
                {isRunning ? <Pause size={20} /> : <Play size={20} />}
              </motion.button>
              <motion.button
                whileHover={{ scale: 1.1 }}
                whileTap={{ scale: 0.9 }}
                onClick={onCancel}
                className="p-3 bg-[var(--theme-primary-text)]/20 hover:bg-red-500/50 transition-colors"
              >
                <X size={20} />
              </motion.button>
            </div>
          </div>

          {/* Stats bar */}
          <div className="flex items-center gap-4 mt-4 pt-3 border-t border-[var(--theme-primary-text)]/20">
            <div className="flex items-center gap-2">
              <Zap size={14} />
              <span className="font-mono text-sm">
                <AnimatedNumber value={exercises.length} /> exercises
              </span>
            </div>
            <div className="flex items-center gap-2">
              <Flame size={14} />
              <span className="font-mono text-sm">
                <AnimatedNumber value={completedSets} /> / {totalSets} sets
              </span>
            </div>
          </div>
        </div>

        {/* Workout Name & Intensity */}
        <div className="p-4 border-b border-[var(--border-default)] bg-[var(--bg-card)]">
          <div className="flex gap-3">
            <input
              placeholder="Workout name (optional)"
              value={workoutName}
              onChange={(e) => setWorkoutName(e.target.value)}
              className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <div className="flex">
              {["LOW", "MED", "HIGH", "MAX"].map((level) => (
                <motion.button
                  key={level}
                  whileHover={{ scale: 1.05 }}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => setIntensity(level === "MED" ? "MEDIUM" : level)}
                  className={`px-3 py-3 font-mono text-[10px] uppercase tracking-wider transition-all first:rounded-l last:rounded-r ${
                    intensity === (level === "MED" ? "MEDIUM" : level)
                      ? level === "MAX"
                        ? "bg-red-600 text-white"
                        : "bg-accent text-[var(--theme-primary-text)]"
                      : "bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-accent"
                  }`}
                >
                  {level}
                </motion.button>
              ))}
            </div>
          </div>
        </div>

        {/* Exercise List */}
        <div className="p-4 space-y-3 max-h-[300px] overflow-y-auto">
          <AnimatePresence>
            {exercises.map((exercise, exIndex) => (
              <motion.div
                key={exercise.id}
                variants={exerciseCardIn}
                initial="initial"
                animate="animate"
                exit="exit"
                layout
                className="bg-[var(--bg-elevated)] border border-[var(--border-default)] overflow-hidden"
              >
                {/* Exercise Header */}
                <div
                  className="flex items-center justify-between p-3 cursor-pointer hover:bg-[var(--bg-main)] transition-colors"
                  onClick={() => toggleExpand(exIndex)}
                >
                  <div className="flex items-center gap-3">
                    <GripVertical size={14} className="text-[var(--text-muted)]" />
                    <span className="font-mono text-sm font-bold tracking-wide">
                      {exercise.name}
                    </span>
                    <span className="text-xs font-mono text-accent">
                      {exercise.sets.filter((s) => s.completed).length}/{exercise.sets.length} sets
                    </span>
                  </div>
                  <motion.div
                    animate={{ rotate: exercise.isExpanded ? 180 : 0 }}
                    transition={{ duration: 0.2 }}
                  >
                    <ChevronDown size={16} />
                  </motion.div>
                </div>

                {/* Sets */}
                <AnimatePresence>
                  {exercise.isExpanded && (
                    <motion.div
                      initial={{ height: 0, opacity: 0 }}
                      animate={{ height: "auto", opacity: 1 }}
                      exit={{ height: 0, opacity: 0 }}
                      transition={springs.snappy}
                      className="border-t border-[var(--border-default)]"
                    >
                      <div className="p-3 space-y-2">
                        {exercise.sets.map((set, setIndex) => (
                          <motion.div
                            key={setIndex}
                            variants={setAdded}
                            initial="initial"
                            animate="animate"
                            className={`flex items-center gap-3 p-2 transition-colors ${
                              set.completed
                                ? "bg-accent/10 border border-accent/30"
                                : "bg-[var(--bg-main)] border border-[var(--border-default)]"
                            }`}
                          >
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.8 }}
                              onClick={() => toggleSetComplete(exIndex, setIndex)}
                              className={`w-6 h-6 flex items-center justify-center border transition-all ${
                                set.completed
                                  ? "bg-accent border-accent text-[var(--theme-primary-text)]"
                                  : "border-[var(--border-default)] hover:border-accent"
                              }`}
                            >
                              {set.completed && (
                                <motion.div
                                  initial={{ scale: 0 }}
                                  animate={{ scale: 1 }}
                                  transition={springs.bouncy}
                                >
                                  <Check size={14} strokeWidth={3} />
                                </motion.div>
                              )}
                            </motion.button>
                            <span className="text-xs font-mono text-[var(--text-muted)] w-12">
                              SET {setIndex + 1}
                            </span>
                            <span className={`flex-1 font-mono text-sm ${set.completed ? "text-accent" : ""}`}>
                              {set.weight ? `${set.weight} × ` : ""}
                              {set.reps} reps
                            </span>
                            <motion.button
                              whileHover={{ scale: 1.1 }}
                              whileTap={{ scale: 0.9 }}
                              onClick={() => removeSet(exIndex, setIndex)}
                              className="p-1 text-[var(--text-muted)] hover:text-red-400 transition-colors"
                            >
                              <Trash2 size={12} />
                            </motion.button>
                          </motion.div>
                        ))}
                      </div>
                    </motion.div>
                  )}
                </AnimatePresence>
              </motion.div>
            ))}
          </AnimatePresence>

          {exercises.length === 0 && (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="text-center py-8"
            >
              <Dumbbell size={48} className="mx-auto mb-3 text-[var(--text-muted)]" />
              <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">
                Add your first exercise below
              </div>
            </motion.div>
          )}
        </div>

        {/* Add Set Input */}
        <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-main)]">
          <div className="flex gap-2">
            <input
              ref={exerciseInputRef}
              placeholder="Exercise name"
              value={currentExercise}
              onChange={(e) => setCurrentExercise(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSet()}
              className="flex-1 px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <input
              placeholder="Weight"
              value={currentWeight}
              onChange={(e) => setCurrentWeight(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSet()}
              className="w-24 px-3 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <input
              placeholder="Reps"
              value={currentReps}
              onChange={(e) => setCurrentReps(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && addSet()}
              className="w-20 px-3 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent transition-colors"
            />
            <motion.button
              whileHover={{ scale: 1.05 }}
              whileTap={{ scale: 0.95 }}
              onClick={addSet}
              disabled={!currentExercise.trim() || !currentReps.trim()}
              className="px-4 py-3 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold disabled:opacity-50 flex items-center gap-2"
            >
              <Plus size={14} strokeWidth={3} /> ADD
            </motion.button>
          </div>
        </div>

        {/* Finish Button */}
        <div className="p-4 border-t border-[var(--border-default)] bg-[var(--bg-card)]">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleFinish}
            disabled={exercises.length === 0}
            className="w-full py-4 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold disabled:opacity-50 flex items-center justify-center gap-3"
          >
            <Square size={16} fill="currentColor" />
            FINISH WORKOUT
            {exercises.length > 0 && (
              <span className="text-xs opacity-70">
                ({exercises.length} exercises • {totalSets} sets)
              </span>
            )}
          </motion.button>
        </div>
      </Card>
    </motion.div>
  );
}
