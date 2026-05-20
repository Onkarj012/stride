import { useState, useEffect } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Flame,
  Utensils,
  Dumbbell,
  Droplets,
  BedDouble,
  Trophy,
  Target,
  TrendingUp,
  Plus,
  Minus,
  ChevronDown,
  Repeat,
} from "lucide-react";
import { useUser } from "@clerk/react";
import { Card } from "../ui/Card";
import { StatCard } from "../ui/StatCard";
import { ProgressBar } from "../ui/ProgressBar";
import { PageHeader } from "../ui/PageHeader";
import { ConfirmLogCard } from "../ConfirmLogCard";
import { InlineLogPanel } from "../InlineLogPanel";
import { GamificationPanel } from "../GamificationPanel";
import { VoiceInputButton } from "../VoiceInputButton";
import { springs } from "../../lib/animations";

const badges = [
  { id: 'first-meal', name: 'First Bite', icon: Utensils, description: 'Log your first meal' },
  { id: 'first-workout', name: 'First Rep', icon: Dumbbell, description: 'Complete your first workout' },
  { id: 'week-streak', name: 'Week Warrior', icon: Flame, description: '7 day logging streak' },
  { id: 'hydration-hero', name: 'Hydration Hero', icon: Droplets, description: 'Hit water goal 5 days' },
  { id: 'sleep-master', name: 'Sleep Master', icon: BedDouble, description: '8hrs sleep for a week' },
  { id: 'macro-master', name: 'Macro Master', icon: Target, description: 'Hit all macros perfectly' },
  { id: 'century', name: 'Century Club', icon: Trophy, description: 'Log 100 meals' },
  { id: 'iron-will', name: 'Iron Will', icon: Dumbbell, description: '30 day streak' },
];

interface HomeTabProps {
  today: string;
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
  caloriesBurnedData: { total: number; count: number };
  streakData: { streak: number; todayLogged: boolean };
  meals: any[];
  commitMeal: (data: any) => Promise<void>;
  commitWorkout: (data: any) => Promise<void>;
  showQuickMealPanel: boolean;
  setShowQuickMealPanel: (v: boolean) => void;
  showQuickWorkoutPanel: boolean;
  setShowQuickWorkoutPanel: (v: boolean) => void;
  waterIntake: number;
  setWaterIntake: (v: number | ((prev: number) => number)) => void;
  waterUnit: 'glasses' | 'litres';
  setWaterUnit: (v: 'glasses' | 'litres') => void;
  sleepHours: number;
  setSleepHours: (v: number | ((prev: number) => number)) => void;
  logAgainMeal: any | null;
  setLogAgainMeal: (v: any | null) => void;
  logAgainWorkout: any | null;
  setLogAgainWorkout: (v: any | null) => void;
}

export default function HomeTab({
  today,
  totalCals,
  totalProtein,
  totalCarbs,
  totalFat,
  effectiveGoals,
  caloriesBurnedData,
  streakData,
  meals,
  commitMeal,
  commitWorkout,
  showQuickMealPanel,
  setShowQuickMealPanel,
  showQuickWorkoutPanel,
  setShowQuickWorkoutPanel,
  waterIntake,
  setWaterIntake,
  waterUnit,
  setWaterUnit,
  sleepHours,
  setSleepHours,
  logAgainMeal,
  setLogAgainMeal,
  logAgainWorkout,
  setLogAgainWorkout,
}: HomeTabProps) {
  const { user } = useUser();

  const [voiceInput, setVoiceInput] = useState("");
  const [homeCardsExpanded, setHomeCardsExpanded] = useState(false);

  const [customWaterInput, setCustomWaterInput] = useState('');
  const waterGoalGlasses = 8;
  const waterGoalLitres = 2;
  const waterGoal = waterUnit === 'glasses' ? waterGoalGlasses : waterGoalLitres;

  const [customSleepInput, setCustomSleepInput] = useState('');
  const sleepGoal = 8;

  const [unlockedBadges, setUnlockedBadges] = useState<string[]>(() => {
    const saved = localStorage.getItem('unlocked-badges');
    return saved ? JSON.parse(saved) : [];
  });

  useEffect(() => {
    localStorage.setItem('unlocked-badges', JSON.stringify(unlockedBadges));
  }, [unlockedBadges]);

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

  return (
    <motion.div
      key="home-tab"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      exit={{ opacity: 0, y: -12 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      className="space-y-6 will-change-transform"
      data-testid="home-tab"
    >
      <div className="flex flex-col lg:flex-row lg:items-end lg:justify-between gap-4">
        <PageHeader
          title={user?.firstName?.toUpperCase() || "OPERATOR"}
          subtitle={new Date().toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" })}
        />
        <div className="flex gap-2">
          <button
            data-testid="quick-log-meal"
            onClick={() => {
              setShowQuickMealPanel(!showQuickMealPanel);
              setShowQuickWorkoutPanel(false);
            }}
            className="flex items-center gap-2 px-4 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-all"
          >
            <Plus size={14} strokeWidth={3} /> MEAL
          </button>
          <button
            data-testid="quick-log-workout"
            onClick={() => {
              setShowQuickWorkoutPanel(!showQuickWorkoutPanel);
              setShowQuickMealPanel(false);
            }}
            className="flex items-center gap-2 px-4 py-2.5 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-all"
          >
            <Plus size={14} strokeWidth={3} /> WORKOUT
          </button>
          <VoiceInputButton
            value={voiceInput}
            onChange={(text) => {
              setVoiceInput(text);
              if (text.trim()) {
                setShowQuickMealPanel(true);
                setShowQuickWorkoutPanel(false);
              }
            }}
            className="h-[42px]"
          />
        </div>
      </div>

      <InlineLogPanel
        mode="meal"
        open={showQuickMealPanel}
        onClose={() => setShowQuickMealPanel(false)}
        onConfirm={(data) => commitMeal(data)}
        totalCals={totalCals}
        totalProtein={totalProtein}
        totalCarbs={totalCarbs}
        totalFat={totalFat}
        goals={effectiveGoals}
        defaultDescription={voiceInput}
        onDescriptionUsed={() => setVoiceInput("")}
      />
      <InlineLogPanel
        mode="workout"
        open={showQuickWorkoutPanel}
        onClose={() => setShowQuickWorkoutPanel(false)}
        onConfirm={(data) => commitWorkout(data)}
        totalCals={totalCals}
        totalProtein={totalProtein}
        totalCarbs={totalCarbs}
        totalFat={totalFat}
        goals={effectiveGoals}
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          label="CALORIES"
          value={totalCals || 0}
          subValue={`/ ${effectiveGoals.calorieGoal} KCAL`}
          icon={Flame}
          accent
          expanded={homeCardsExpanded}
          onToggle={() => setHomeCardsExpanded(!homeCardsExpanded)}
          tooltipContent={
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono tracking-wide">
                <span className="text-[var(--text-muted)]">CONSUMED</span>
                <span className="font-bold">{totalCals} KCAL</span>
              </div>
              <div className="flex justify-between text-xs font-mono tracking-wide">
                <span className="text-[var(--text-muted)]">BURNED</span>
                <span className="text-accent font-bold">{caloriesBurnedData.total} KCAL</span>
              </div>
              <div className="flex justify-between text-xs font-mono tracking-wide">
                <span className="text-[var(--text-muted)]">NET</span>
                <span className="font-bold">{totalCals - caloriesBurnedData.total} KCAL</span>
              </div>
              <div className="flex justify-between text-xs font-mono tracking-wide">
                <span className="text-[var(--text-muted)]">REMAINING</span>
                <span className="text-accent font-bold">{Math.max(0, effectiveGoals.calorieGoal - (totalCals - caloriesBurnedData.total))} KCAL</span>
              </div>
              <div className="h-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${Math.min(100, ((totalCals - caloriesBurnedData.total) / effectiveGoals.calorieGoal) * 100)}%` }}
                />
              </div>
            </div>
          }
        />
        <StatCard
          label="PROTEIN"
          value={`${totalProtein || 0}g`}
          subValue={`/ ${effectiveGoals.proteinGoal}g`}
          icon={Target}
          expanded={homeCardsExpanded}
          onToggle={() => setHomeCardsExpanded(!homeCardsExpanded)}
          tooltipContent={
            <div className="space-y-2">
              <div className="flex justify-between text-xs font-mono tracking-wide">
                <span className="text-[var(--text-muted)]">REMAINING</span>
                <span className="text-accent font-bold">{Math.max(0, effectiveGoals.proteinGoal - totalProtein)}g</span>
              </div>
              <div className="h-1.5 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                <div
                  className="h-full bg-accent transition-all"
                  style={{ width: `${Math.min(100, (totalProtein / effectiveGoals.proteinGoal) * 100)}%` }}
                />
              </div>
            </div>
          }
        />
        <StatCard
          label="NET"
          value={totalCals - caloriesBurnedData.total}
          subValue="KCAL"
          icon={TrendingUp}
          expanded={homeCardsExpanded}
          onToggle={() => setHomeCardsExpanded(!homeCardsExpanded)}
          tooltipContent={
            <div className="space-y-1 text-xs font-mono tracking-wide">
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">EATEN</span>
                <span>{totalCals}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-[var(--text-muted)]">BURNED</span>
                <span className="text-accent">-{caloriesBurnedData.total}</span>
              </div>
            </div>
          }
        />
        <StatCard
          label="STREAK"
          value={streakData.streak}
          subValue={streakData.streak === 1 ? "DAY" : "DAYS"}
          icon={Flame}
          accent={streakData.streak >= 7}
          expanded={homeCardsExpanded}
          onToggle={() => setHomeCardsExpanded(!homeCardsExpanded)}
          tooltipContent={
            <div className="text-xs font-mono tracking-wide">
              {streakData.todayLogged
                ? "You've logged today! Keep it up."
                : "Log something today to continue your streak!"}
            </div>
          }
        />
      </div>

      <GamificationPanel />

      <div className="grid lg:grid-cols-2 gap-4">
        <Card className="p-5" data-testid="water-tracker">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <Droplets size={18} className="text-accent" strokeWidth={2.5} />
              <span className="font-mono text-sm uppercase tracking-wider">Hydration</span>
            </div>
            <div className="flex items-center gap-2">
              <span className="font-heading text-2xl">{waterUnit === 'glasses' ? Math.floor(waterIntake) : waterIntake.toFixed(1)}</span>
              <span className="text-[10px] font-mono uppercase text-[var(--text-muted)] tracking-wide">{waterUnit === 'glasses' ? 'GLASSES' : 'LITRES'}</span>
            </div>
          </div>

          <div>
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
            <div className="flex gap-2 mt-2">
              <button
                onClick={() => setWaterUnit('glasses')}
                className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider border ${waterUnit === 'glasses' ? 'bg-accent text-[var(--theme-primary-text)] border-accent' : 'border-[var(--border-default)] hover:border-accent'}`}
              >
                Glasses
              </button>
              <button
                onClick={() => setWaterUnit('litres')}
                className={`px-3 py-1.5 font-mono text-[10px] uppercase tracking-wider border ${waterUnit === 'litres' ? 'bg-accent text-[var(--theme-primary-text)] border-accent' : 'border-[var(--border-default)] hover:border-accent'}`}
              >
                Litres
              </button>
            </div>
          </div>
        </Card>

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
              <span>{totalCarbs.toFixed(2)}/{effectiveGoals.carbGoal}g</span>
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

      <div className="grid lg:grid-cols-3 gap-4">
        <Card className="p-5 lg:col-span-2">
          <div className="flex items-center justify-between mb-4">
            <h3 className="font-heading text-xl uppercase tracking-normal">Today's Meals</h3>
          </div>
          {meals.length > 0 ? (
            <div className="space-y-2">
              {meals.slice(0, 3).map((meal: any) => (
                <div key={meal._id} className="flex items-center justify-between p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] group">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="text-xs font-mono bg-accent text-[var(--theme-primary-text)] px-2 py-1">{meal.time}</span>
                    <span className="font-medium tracking-wide">{meal.name}</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLogAgainMeal(meal)}
                      className="opacity-0 group-hover:opacity-100 p-1.5 text-[var(--text-muted)] hover:text-accent transition-opacity"
                      title="Log again"
                    >
                      <Repeat size={12} />
                    </button>
                    <span className="font-mono text-accent tracking-wide">{meal.calories} KCAL</span>
                  </div>
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

      <AnimatePresence>
        {logAgainMeal && (
          <ConfirmLogCard
            mode="meal"
            initialData={{ description: logAgainMeal.name }}
            preParsed={{
              name: logAgainMeal.name,
              calories: logAgainMeal.calories,
              protein: logAgainMeal.protein,
              carbs: logAgainMeal.carbs,
              fat: logAgainMeal.fat,
              time: new Date().toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit", hour12: false }),
              mealType: logAgainMeal.mealType || "unspecified",
              aiSuggestion: logAgainMeal.aiSuggestion,
            }}
            onConfirm={(data) => { commitMeal(data); setLogAgainMeal(null); }}
            onDiscard={() => setLogAgainMeal(null)}
          />
        )}
        {logAgainWorkout && (
          <ConfirmLogCard
            mode="workout"
            initialData={{ description: logAgainWorkout.name }}
            preParsed={{
              name: logAgainWorkout.name,
              sets: logAgainWorkout.sets,
              duration: logAgainWorkout.duration,
              intensity: logAgainWorkout.intensity,
              rationale: logAgainWorkout.rationale,
              exercises: logAgainWorkout.exercises,
            }}
            onConfirm={(data) => { commitWorkout(data); setLogAgainWorkout(null); }}
            onDiscard={() => setLogAgainWorkout(null)}
          />
        )}
      </AnimatePresence>
    </motion.div>
  );
}
