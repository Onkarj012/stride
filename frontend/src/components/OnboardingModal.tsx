import { useState } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  ChevronRight,
  ChevronLeft,
  CheckCircle2,
  Loader2,
  Zap,
  Target,
  Scale,
  Footprints,
  Dumbbell,
  TrendingUp,
  TrendingDown,
  Flame,
  Trophy,
  ArrowRight,
  Sparkles,
  Activity,
  Calendar,
  Timer,
} from "lucide-react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import CustomSelect from "./ui/CustomSelect";

const pageVariants = {
  initial: { opacity: 0, x: 20 },
  animate: { opacity: 1, x: 0 },
  exit: { opacity: 0, x: -20 },
};

const pageTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
};

interface OnboardingModalProps {
  open: boolean;
  onClose: () => void;
  onComplete: (targets: { calories: number; protein: number; carbs: number; fat: number }) => void;
}

const STEPS = [
  { id: "welcome", title: "Welcome" },
  { id: "basics", title: "Basics" },
  { id: "activity", title: "Activity" },
  { id: "training", title: "Training" },
  { id: "goal", title: "Goal" },
  { id: "results", title: "Your Plan" },
];

const SEX_OPTIONS = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
];

const JOB_OPTIONS = [
  { value: "desk", label: "Desk", description: "Sedentary — little movement" },
  { value: "mixed", label: "Mixed", description: "Some walking during day" },
  { value: "standing", label: "Standing", description: "On feet most of the day" },
  { value: "physical", label: "Physical", description: "Heavy labor / active work" },
];

const STYLE_OPTIONS = [
  { value: "resistance", label: "Resistance", description: "Weightlifting focused" },
  { value: "mixed", label: "Mixed", description: "Weights + cardio blend" },
  { value: "endurance", label: "Endurance", description: "Running, cycling, etc." },
];

const GOAL_OPTIONS = [
  { value: "cut", label: "Cut", description: "Lose fat — moderate deficit", icon: TrendingDown },
  { value: "bulk", label: "Bulk", description: "Build muscle — small surplus", icon: TrendingUp },
  { value: "maintain", label: "Maintain", description: "Keep current weight", icon: Target },
  { value: "recomp", label: "Recomp", description: "Simultaneous build + burn", icon: Flame },
];

function getProjectedResults(form: any) {
  const weight = Number(form.weight) || 75;
  const bodyFat = Number(form.bodyFat) || 18;
  const goal = form.goal;

  if (goal === "cut") {
    const fatToLose = Math.round(weight * (bodyFat / 100) * 0.3);
    const weeksNeeded = Math.round(fatToLose / 0.5);
    const targetWeight = Math.round(weight - fatToLose);
    const dailyDeficit = 500;
    return {
      headline: `Lose ${fatToLose}kg of fat`,
      timeline: `${weeksNeeded} weeks`,
      targetWeight: `${targetWeight}kg`,
      dailyDeficit: `${dailyDeficit}cal deficit`,
      details: [
        { label: "Weekly fat loss", value: "0.5kg", icon: TrendingDown },
        { label: "Daily deficit", value: `${dailyDeficit} cal`, icon: Flame },
        { label: "Target weight", value: `${targetWeight}kg`, icon: Scale },
        { label: "Timeline", value: `${weeksNeeded} weeks`, icon: Calendar },
      ],
      tip: "Hit your protein target daily to preserve muscle while cutting.",
    };
  } else if (goal === "bulk") {
    const muscleToGain = Math.round(weight * 0.05);
    const weeksNeeded = Math.round(muscleToGain / 0.25);
    const targetWeight = Math.round(weight + muscleToGain);
    const proteinTarget = Math.round(weight * 2.2);
    return {
      headline: `Build ${muscleToGain}kg of muscle`,
      timeline: `${weeksNeeded} weeks`,
      targetWeight: `${targetWeight}kg`,
      dailySurplus: "300cal surplus",
      details: [
        { label: "Weekly muscle gain", value: "0.25kg", icon: TrendingUp },
        { label: "Daily protein", value: `${proteinTarget}g`, icon: Dumbbell },
        { label: "Target weight", value: `${targetWeight}kg`, icon: Scale },
        { label: "Timeline", value: `${weeksNeeded} weeks`, icon: Calendar },
      ],
      tip: "Train 4+ days per week and hit your protein target for optimal gains.",
    };
  } else if (goal === "recomp") {
    const weeksNeeded = 12;
    return {
      headline: "Transform your physique",
      timeline: `${weeksNeeded} weeks`,
      targetWeight: `${weight}kg`,
      dailySurplus: "At maintenance",
      details: [
        { label: "Body composition", value: "Improving", icon: Activity },
        { label: "Protein priority", value: `${Math.round(weight * 2.2)}g/day`, icon: Dumbbell },
        { label: "Scale weight", value: "Stable", icon: Scale },
        { label: "Visual change", value: "8-12 weeks", icon: Calendar },
      ],
      tip: "Progress is measured in the mirror, not the scale. Trust the process.",
    };
  } else {
    return {
      headline: "Maintain your gains",
      timeline: "Ongoing",
      targetWeight: `${weight}kg`,
      dailySurplus: "At maintenance",
      details: [
        { label: "Daily calories", value: "At TDEE", icon: Flame },
        { label: "Protein target", value: `${Math.round(weight * 1.8)}g`, icon: Dumbbell },
        { label: "Weight fluctuation", value: "±1kg normal", icon: Scale },
        { label: "Check-in", value: "Weekly", icon: Calendar },
      ],
      tip: "Focus on performance and how you feel rather than the scale.",
    };
  }
}

export default function OnboardingModal({ open, onClose, onComplete }: OnboardingModalProps) {
  const [step, setStep] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<any>(null);

  const calculateTDEE = useAction(api.profile.calculateTDEE);
  const upsertProfile = useMutation(api.profile.upsertProfile);
  const upsertGoal = useMutation(api.goals.upsertDailyGoal);

  const [form, setForm] = useState({
    weight: "",
    height: "",
    age: "",
    sex: "male",
    bodyFat: "",
    leanMass: "",
    dailySteps: "8000",
    trainingDays: "3",
    cardioMinutes: "0",
    jobType: "desk",
    goal: "cut",
    trainingStyle: "resistance",
  });

  const update = (key: string, value: string) => setForm((prev) => ({ ...prev, [key]: value }));

  const canProceed = () => {
    if (step === 1) return form.weight && form.height && form.age;
    return true;
  };

  const handleCalculate = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await calculateTDEE({
        weight: Number(form.weight),
        height: Number(form.height),
        age: Number(form.age),
        sex: form.sex,
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        leanMass: form.leanMass ? Number(form.leanMass) : undefined,
        dailySteps: Number(form.dailySteps) || 0,
        trainingDays: Number(form.trainingDays) || 0,
        cardioMinutes: Number(form.cardioMinutes) || 0,
        jobType: form.jobType,
        goal: form.goal,
        trainingStyle: form.trainingStyle,
      });
      setResults(data);

      await upsertProfile({
        weight: Number(form.weight),
        height: Number(form.height),
        age: Number(form.age),
        sex: form.sex,
        bodyFat: form.bodyFat ? Number(form.bodyFat) : undefined,
        leanMass: form.leanMass ? Number(form.leanMass) : undefined,
        dailySteps: Number(form.dailySteps) || 0,
        trainingDays: Number(form.trainingDays) || 0,
        cardioMinutes: Number(form.cardioMinutes) || 0,
        jobType: form.jobType,
        goal: form.goal,
        trainingStyle: form.trainingStyle,
        calorieTarget: data.targetCals,
        proteinTarget: data.targetProtein,
        carbTarget: data.targetCarbs,
        fatTarget: data.targetFat,
        onboardingComplete: true,
      });

      const today = new Date().toISOString().split("T")[0];
      await upsertGoal({
        date: today,
        calorieGoal: data.targetCals,
        proteinGoal: data.targetProtein,
        carbGoal: data.targetCarbs,
        fatGoal: data.targetFat,
      });

      onComplete({
        calories: data.targetCals,
        protein: data.targetProtein,
        carbs: data.targetCarbs,
        fat: data.targetFat,
      });
    } catch (err: any) {
      setError(err.message || "Failed to calculate targets");
    } finally {
      setLoading(false);
    }
  };

  const handleNext = () => {
    if (step < STEPS.length - 2) {
      setStep(step + 1);
    } else if (step === STEPS.length - 2) {
      handleCalculate();
      setStep(step + 1);
    }
  };

  const handleBack = () => {
    if (step > 0) setStep(step - 1);
  };

  const handleFinish = () => {
    onClose();
  };

  const inputClass = "w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono text-sm focus:outline-none focus:border-accent transition-colors";
  const labelClass = "block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider";

  if (!open) return null;

  const projected = getProjectedResults(form);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/90 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.95, y: 20 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 20 }}
        transition={{ type: "spring", damping: 25, stiffness: 300 }}
        className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-2xl shadow-2xl flex flex-col"
        style={{ height: "640px", maxHeight: "90vh" }}
      >
        {/* Header with Progress */}
        <div className="shrink-0 border-b border-[var(--border-default)] px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-accent flex items-center justify-center">
                <Zap size={16} className="text-[var(--theme-primary-text)]" />
              </div>
              <span className="font-heading text-lg uppercase tracking-normal">STRIDE</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">
              {step === 0 ? "GET STARTED" : `STEP ${step} OF ${STEPS.length - 1}`}
            </span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`flex-1 h-1.5 transition-all duration-300 ${
                  i < step ? "bg-accent" : i === step ? "bg-[var(--text-primary)]" : "bg-[var(--bg-elevated)]"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content Area - Flex grow to fill space */}
        <div className="flex-1 overflow-y-auto p-6">
          <AnimatePresence mode="wait" initial={false}>
            {/* ─── WELCOME ─────────────────────────────────────────────── */}
            {step === 0 && (
              <motion.div
                key="welcome"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="h-full flex flex-col"
              >
                <div className="text-center mb-6">
                  <h2 className="font-heading text-3xl uppercase tracking-normal mb-2">
                    Your Transformation Starts Now
                  </h2>
                  <p className="text-sm text-[var(--text-secondary)] tracking-wide max-w-md mx-auto">
                    In under 2 minutes, we'll build your personalized protocol. Here's what you'll achieve:
                  </p>
                </div>

                {/* Results preview cards */}
                <div className="grid grid-cols-3 gap-3 mb-6">
                  <div className="p-4 bg-accent/10 border border-accent/30 text-center">
                    <TrendingDown size={24} className="text-accent mx-auto mb-2" />
                    <div className="font-heading text-2xl">5kg</div>
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Fat Loss</div>
                    <div className="text-[10px] font-mono text-accent mt-1">in 10 weeks</div>
                  </div>
                  <div className="p-4 bg-accent/10 border border-accent/30 text-center">
                    <Dumbbell size={24} className="text-accent mx-auto mb-2" />
                    <div className="font-heading text-2xl">3kg</div>
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Muscle Gain</div>
                    <div className="text-[10px] font-mono text-accent mt-1">in 12 weeks</div>
                  </div>
                  <div className="p-4 bg-accent/10 border border-accent/30 text-center">
                    <Target size={24} className="text-accent mx-auto mb-2" />
                    <div className="font-heading text-2xl">100%</div>
                    <div className="text-[10px] font-mono text-[var(--text-muted)] uppercase tracking-wider">Macro Accuracy</div>
                    <div className="text-[10px] font-mono text-accent mt-1">AI-powered</div>
                  </div>
                </div>

                {/* Timeline visualization */}
                <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)] mb-6">
                  <div className="flex items-center gap-2 mb-3">
                    <Timer size={14} className="text-accent" />
                    <span className="text-xs font-mono uppercase tracking-wider">Your 30-Day Transformation</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <div className="flex-1 relative">
                      <div className="h-2 bg-[var(--border-default)] rounded-full overflow-hidden">
                        <div className="h-full w-1/3 bg-accent rounded-full" />
                      </div>
                      <div className="flex justify-between mt-2">
                        <span className="text-[10px] font-mono text-accent">Today</span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">Week 2</span>
                        <span className="text-[10px] font-mono text-[var(--text-muted)]">Week 4</span>
                      </div>
                    </div>
                  </div>
                  <div className="grid grid-cols-3 gap-3 mt-4 text-center">
                    <div>
                      <div className="text-xs font-mono text-[var(--text-muted)]">Week 1</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Habits form</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-[var(--text-muted)]">Week 2</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Energy increases</div>
                    </div>
                    <div>
                      <div className="text-xs font-mono text-[var(--text-muted)]">Week 4</div>
                      <div className="text-[10px] text-[var(--text-secondary)]">Visible results</div>
                    </div>
                  </div>
                </div>

                {/* CTA */}
                <div className="mt-auto text-center">
                  <button
                    onClick={() => setStep(1)}
                    className="px-8 py-3.5 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                  >
                    Build My Plan <ArrowRight size={16} />
                  </button>
                  <p className="mt-3 text-[10px] font-mono text-[var(--text-muted)] tracking-wide">
                    Takes under 2 minutes. No credit card required.
                  </p>
                </div>
              </motion.div>
            )}

            {/* ─── BASICS ──────────────────────────────────────────────── */}
            {step === 1 && (
              <motion.div
                key="basics"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="h-full flex flex-col"
              >
                <div className="mb-5">
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Body Metrics</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">These determine your metabolic baseline. Be honest — precision matters.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Weight (kg) *</label>
                    <input type="number" value={form.weight} onChange={(e) => update("weight", e.target.value)} placeholder="75" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Height (cm) *</label>
                    <input type="number" value={form.height} onChange={(e) => update("height", e.target.value)} placeholder="175" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Age *</label>
                    <input type="number" value={form.age} onChange={(e) => update("age", e.target.value)} placeholder="28" className={inputClass} />
                  </div>
                  <CustomSelect
                    label="Sex *"
                    value={form.sex}
                    onChange={(val) => update("sex", val)}
                    options={SEX_OPTIONS}
                  />
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Body Fat % (optional)</label>
                    <input type="number" step="0.1" value={form.bodyFat} onChange={(e) => update("bodyFat", e.target.value)} placeholder="15" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Lean Mass kg (optional)</label>
                    <input type="number" step="0.1" value={form.leanMass} onChange={(e) => update("leanMass", e.target.value)} placeholder="65" className={inputClass} />
                  </div>
                </div>

                <div className="mt-auto p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                  <div className="flex items-start gap-3">
                    <Scale size={18} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider mb-1">Why This Matters</div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed tracking-wide">
                        We use the Mifflin-St Jeor equation by default. If you provide body fat % or lean mass,
                        we'll switch to the Cunningham equation — typically 5-10% more accurate for trained individuals.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── ACTIVITY ────────────────────────────────────────────── */}
            {step === 2 && (
              <motion.div
                key="activity"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="h-full flex flex-col"
              >
                <div className="mb-5">
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Daily Activity</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">Your non-training movement shapes your total daily expenditure.</p>
                </div>

                <div className="mb-4">
                  <label className={labelClass}>Average Daily Steps</label>
                  <input type="number" value={form.dailySteps} onChange={(e) => update("dailySteps", e.target.value)} placeholder="8000" className={inputClass} />
                </div>

                <div className="mb-4">
                  <label className={labelClass}>Job Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {JOB_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => update("jobType", opt.value)}
                        className={`p-3 border text-left transition-colors ${
                          form.jobType === opt.value
                            ? "border-accent bg-accent/10"
                            : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                        }`}
                      >
                        <div className="text-xs font-mono uppercase tracking-wider">{opt.label}</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-auto p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                  <div className="flex items-start gap-3">
                    <Footprints size={18} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider mb-1">NEAT Matters</div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed tracking-wide">
                        Non-exercise activity thermogenesis (NEAT) can account for 15-30% of your daily calorie burn.
                        A desk worker walking 3,000 steps burns ~200 fewer calories than someone hitting 10,000 steps.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── TRAINING ────────────────────────────────────────────── */}
            {step === 3 && (
              <motion.div
                key="training"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="h-full flex flex-col"
              >
                <div className="mb-5">
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Training Profile</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">How you train directly impacts your calorie needs and macro targets.</p>
                </div>

                <div className="grid sm:grid-cols-2 gap-4 mb-4">
                  <div>
                    <label className={labelClass}>Training Days / Week</label>
                    <input type="number" value={form.trainingDays} onChange={(e) => update("trainingDays", e.target.value)} placeholder="3" className={inputClass} />
                  </div>
                  <div>
                    <label className={labelClass}>Cardio Minutes / Week</label>
                    <input type="number" value={form.cardioMinutes} onChange={(e) => update("cardioMinutes", e.target.value)} placeholder="60" className={inputClass} />
                  </div>
                </div>

                <div className="mb-4">
                  <label className={labelClass}>Training Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {STYLE_OPTIONS.map((opt) => (
                      <button
                        key={opt.value}
                        onClick={() => update("trainingStyle", opt.value)}
                        className={`p-3 border text-center transition-colors ${
                          form.trainingStyle === opt.value
                            ? "border-accent bg-accent/10"
                            : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                        }`}
                      >
                        <div className="text-xs font-mono uppercase tracking-wider">{opt.label}</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{opt.description}</div>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="mt-auto p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                  <div className="flex items-start gap-3">
                    <Dumbbell size={18} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider mb-1">Training Affects Your Macros</div>
                      <p className="text-[11px] text-[var(--text-muted)] leading-relaxed tracking-wide">
                        Resistance training increases protein needs to support muscle repair. Endurance training raises carb
                        requirements for glycogen replenishment. We'll optimize your splits based on your style.
                      </p>
                    </div>
                  </div>
                </div>
              </motion.div>
            )}

            {/* ─── GOAL ────────────────────────────────────────────────── */}
            {step === 4 && (
              <motion.div
                key="goal"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="h-full flex flex-col"
              >
                <div className="mb-5">
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">What's Your Goal?</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">This determines your calorie target and macro split.</p>
                </div>

                <div className="grid grid-cols-2 gap-3 mb-5">
                  {GOAL_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => update("goal", opt.value)}
                      className={`p-4 border text-left transition-colors ${
                        form.goal === opt.value
                          ? "border-accent bg-accent/10"
                          : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-2">
                        <opt.icon size={20} className={form.goal === opt.value ? "text-accent" : "text-[var(--text-muted)]"} />
                        {form.goal === opt.value && <CheckCircle2 size={14} className="text-accent" />}
                      </div>
                      <div className="text-sm font-mono uppercase tracking-wider font-bold">{opt.label}</div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{opt.description}</div>
                    </button>
                  ))}
                </div>

                {/* Dynamic projection based on selected goal */}
                <div className="mt-auto p-4 border border-accent/30 bg-accent/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={14} className="text-accent" />
                    <span className="text-xs font-mono uppercase text-accent tracking-wider">Your Projected Results</span>
                  </div>
                  <div className="text-center mb-3">
                    <div className="font-heading text-2xl">{projected.headline}</div>
                    <div className="text-xs font-mono text-[var(--text-muted)]">Timeline: {projected.timeline}</div>
                  </div>
                  <div className="grid grid-cols-4 gap-2">
                    {projected.details.map((detail, i) => (
                      <div key={i} className="text-center p-2 bg-[var(--bg-elevated)] border border-[var(--border-default)]">
                        <detail.icon size={14} className="text-accent mx-auto mb-1" />
                        <div className="text-[10px] font-mono text-[var(--text-muted)]">{detail.label}</div>
                        <div className="text-xs font-mono font-bold">{detail.value}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-[10px] font-mono text-accent mt-3 text-center">{projected.tip}</p>
                </div>
              </motion.div>
            )}

            {/* ─── RESULTS ─────────────────────────────────────────────── */}
            {step === 5 && (
              <motion.div
                key="results"
                variants={pageVariants}
                initial="initial"
                animate="animate"
                exit="exit"
                transition={pageTransition}
                className="h-full flex flex-col"
              >
                {loading ? (
                  <div className="flex-1 flex flex-col items-center justify-center gap-4">
                    <Loader2 size={36} className="animate-spin text-accent" />
                    <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">CALCULATING YOUR PROTOCOL...</div>
                  </div>
                ) : error ? (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono tracking-wide">{error}</div>
                ) : results ? (
                  <>
                    <div className="text-center mb-4">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent text-[10px] font-mono uppercase tracking-wider mb-2">
                        <Sparkles size={12} /> Your Protocol is Ready
                      </div>
                      <h3 className="font-heading text-xl uppercase tracking-normal">{projected.headline}</h3>
                      <p className="text-xs text-[var(--text-muted)] font-mono">Achieve this in {projected.timeline} with consistent tracking</p>
                    </div>

                    {/* Big calorie number */}
                    <div className="p-5 bg-accent text-[var(--theme-primary-text)] text-center mb-4">
                      <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-1">Daily Calorie Target</div>
                      <div className="font-heading text-4xl tracking-tight">{results.targetCals}</div>
                      <div className="text-xs font-mono uppercase tracking-widest opacity-70">KCAL / DAY</div>
                    </div>

                    {/* Macro grid */}
                    <div className="grid grid-cols-3 gap-3 mb-4">
                      <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center">
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">PROTEIN</div>
                        <div className="font-heading text-xl">{results.targetProtein}g</div>
                      </div>
                      <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center">
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">CARBS</div>
                        <div className="font-heading text-xl">{results.targetCarbs}g</div>
                      </div>
                      <div className="p-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center">
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">FAT</div>
                        <div className="font-heading text-xl">{results.targetFat}g</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-3 mb-4">
                      <div className="p-3 border border-[var(--border-default)] flex items-center gap-3">
                        <Activity size={16} className="text-accent" />
                        <div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)]">RMR</div>
                          <div className="font-heading text-lg">{results.rmr} <span className="text-xs font-mono text-[var(--text-muted)]">kcal</span></div>
                        </div>
                      </div>
                      <div className="p-3 border border-[var(--border-default)] flex items-center gap-3">
                        <Flame size={16} className="text-accent" />
                        <div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)]">TDEE</div>
                          <div className="font-heading text-lg">{results.tdee} <span className="text-xs font-mono text-[var(--text-muted)]">kcal</span></div>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="mt-auto text-center">
                      <button
                        onClick={handleFinish}
                        className="px-10 py-3.5 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                      >
                        <Trophy size={16} /> Start My Journey
                      </button>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-2">
                        Your targets are saved. Edit anytime in Settings.
                      </p>
                    </div>
                  </>
                ) : null}
              </motion.div>
            )}
          </AnimatePresence>
        </div>

        {/* Footer Navigation - Always visible for steps 1-4 */}
        {step > 0 && step < 5 && (
          <div className="shrink-0 border-t border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
            <button
              onClick={handleBack}
              className="flex items-center gap-2 px-4 py-2 border border-[var(--border-default)] font-mono text-xs uppercase tracking-wider hover:border-accent transition-colors"
            >
              <ChevronLeft size={14} /> Back
            </button>
            <button
              onClick={handleNext}
              disabled={!canProceed() || loading}
              className="flex items-center gap-2 px-6 py-2.5 bg-accent text-[var(--theme-primary-text)] font-mono text-xs uppercase tracking-wider font-bold hover:opacity-90 transition-opacity disabled:opacity-50"
            >
              {step === STEPS.length - 2 ? (
                loading ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : <><Sparkles size={14} /> See My Results</>
              ) : (
                <>Next <ChevronRight size={14} /></>
              )}
            </button>
          </div>
        )}
      </motion.div>
    </motion.div>
  );
}
