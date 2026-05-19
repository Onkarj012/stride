import { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence, LayoutGroup } from "framer-motion";
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
  Briefcase,
  TrendingUp,
  BrainCircuit,
  BarChart3,
  Flame,
  Trophy,
  ArrowRight,
  Sparkles,
  Activity,
  Clock,
} from "lucide-react";
import { useMutation, useAction } from "convex/react";
import { api } from "../../../backend/convex/_generated/api";
import CustomSelect from "./ui/CustomSelect";

const pageVariants = {
  initial: { opacity: 0, scale: 0.96, filter: "blur(4px)" },
  animate: { opacity: 1, scale: 1, filter: "blur(0px)" },
  exit: { opacity: 0, scale: 0.96, filter: "blur(4px)" },
};

const pageTransition = {
  type: "spring",
  stiffness: 300,
  damping: 30,
  mass: 0.8,
};

const staggerContainer = {
  animate: {
    transition: {
      staggerChildren: 0.06,
      delayChildren: 0.1,
    },
  },
};

const staggerItem = {
  initial: { opacity: 0, y: 12 },
  animate: { opacity: 1, y: 0, transition: { type: "spring", stiffness: 400, damping: 25 } },
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
  { value: "cut", label: "Cut", description: "Lose fat — moderate deficit" },
  { value: "bulk", label: "Bulk", description: "Build muscle — small surplus" },
  { value: "maintain", label: "Maintain", description: "Keep current weight" },
  { value: "recomp", label: "Recomp", description: "Simultaneous build + burn" },
];

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
    goal: "maintain",
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

  if (!open) return null;

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.2 }}
      className="fixed inset-0 z-[100] flex items-center justify-center p-4 bg-black/85 backdrop-blur-sm"
    >
      <motion.div
        initial={{ opacity: 0, scale: 0.92, y: 24 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.92, y: 24 }}
        transition={{ type: "spring", damping: 28, stiffness: 350, mass: 0.8 }}
        className="bg-[var(--bg-card)] border border-[var(--border-default)] w-full max-w-3xl shadow-2xl will-change-transform"
        style={{ maxHeight: "92vh" }}
      >
        {/* Progress Header */}
        <div className="sticky top-0 z-10 bg-[var(--bg-card)] border-b border-[var(--border-default)] px-6 py-4">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <div className="w-8 h-8 bg-accent flex items-center justify-center">
                <Zap size={16} className="text-[var(--theme-primary-text)]" />
              </div>
              <span className="font-heading text-lg uppercase tracking-normal">STRIDE</span>
            </div>
            <span className="text-[10px] font-mono text-[var(--text-muted)] tracking-wider">
              {step === 0 ? "GET STARTED" : `STEP ${step} / ${STEPS.length - 1}`}
            </span>
          </div>
          <div className="flex gap-1.5">
            {STEPS.map((s, i) => (
              <div
                key={s.id}
                className={`flex-1 h-1 transition-all duration-300 ${
                  i < step ? "bg-accent" : i === step ? "bg-accent/50" : "bg-[var(--border-default)]"
                }`}
              />
            ))}
          </div>
        </div>

        {/* Content - Fixed height container for consistent size */}
        <div className="p-6 lg:p-8" style={{ height: "520px" }}>
          <LayoutGroup>
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
                  className="space-y-8"
                >
                <motion.div
                  className="text-center space-y-3"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                >
                  <motion.h2
                    variants={staggerItem}
                    className="font-heading text-3xl uppercase tracking-normal"
                  >
                    Your Transformation Starts Now
                  </motion.h2>
                  <motion.p
                    variants={staggerItem}
                    className="text-sm text-[var(--text-secondary)] tracking-wide max-w-lg mx-auto leading-relaxed"
                  >
                    Answer a few questions and we'll build your personalized nutrition & training protocol.
                    In 30 days, you'll look back at this moment as the day everything changed.
                  </motion.p>
                </motion.div>

                {/* Feature preview cards */}
                <motion.div
                  className="grid sm:grid-cols-3 gap-3"
                  variants={staggerContainer}
                  initial="initial"
                  animate="animate"
                >
                  {[
                    {
                      icon: BarChart3,
                      title: "Daily Insights",
                      desc: "AI-powered analysis of your nutrition and training patterns, updated every day.",
                    },
                    {
                      icon: TrendingUp,
                      title: "Progress Tracking",
                      desc: "Visualize your calorie trends, macro consistency, and workout volume over time.",
                    },
                    {
                      icon: BrainCircuit,
                      title: "AI Coach",
                      desc: "A personal trainer in your pocket. Ask anything, log meals by talking, get real-time feedback.",
                    },
                  ].map((feature) => (
                    <motion.div
                      key={feature.title}
                      variants={staggerItem}
                      whileHover={{ y: -2, transition: { duration: 0.15 } }}
                      className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] hover:border-accent/50 transition-colors group will-change-transform"
                    >
                      <feature.icon size={20} className="text-accent mb-3 group-hover:scale-110 transition-transform duration-200" />
                      <div className="text-xs font-mono uppercase tracking-wider mb-1.5">{feature.title}</div>
                      <div className="text-[11px] text-[var(--text-muted)] leading-relaxed tracking-wide">
                        {feature.desc}
                      </div>
                    </motion.div>
                  ))}
                </motion.div>

                {/* What you'll get at 30 days */}
                <div className="p-5 border border-accent/30 bg-accent/5">
                  <div className="flex items-center gap-2 mb-3">
                    <Sparkles size={16} className="text-accent" />
                    <span className="text-xs font-mono uppercase text-accent tracking-wider">In 30 Days You'll Receive</span>
                  </div>
                  <div className="grid sm:grid-cols-2 gap-3">
                    {[
                      "A complete macro blueprint tailored to your body",
                      "Weekly trend reports showing exactly how you're progressing",
                      "AI-generated adjustments based on your real data",
                      "Habit streaks and achievements that keep you locked in",
                    ].map((item, i) => (
                      <div key={i} className="flex items-start gap-2 text-xs text-[var(--text-secondary)] tracking-wide">
                        <CheckCircle2 size={12} className="text-accent shrink-0 mt-0.5" />
                        {item}
                      </div>
                    ))}
                  </div>
                </div>

                <div className="text-center">
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
                className="space-y-5"
              >
                <div>
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Body Metrics</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">These determine your metabolic baseline. Be honest — precision matters.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Weight (kg) *</label>
                    <input type="number" value={form.weight} onChange={(e) => update("weight", e.target.value)} placeholder="75" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Height (cm) *</label>
                    <input type="number" value={form.height} onChange={(e) => update("height", e.target.value)} placeholder="175" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Age *</label>
                    <input type="number" value={form.age} onChange={(e) => update("age", e.target.value)} placeholder="28" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <CustomSelect
                    label="Sex *"
                    value={form.sex}
                    onChange={(val) => update("sex", val)}
                    options={SEX_OPTIONS}
                  />
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Body Fat % (optional)</label>
                    <input type="number" step="0.1" value={form.bodyFat} onChange={(e) => update("bodyFat", e.target.value)} placeholder="15" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Lean Mass kg (optional)</label>
                    <input type="number" step="0.1" value={form.leanMass} onChange={(e) => update("leanMass", e.target.value)} placeholder="65" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                </div>

                {/* Info section */}
                <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                  <div className="flex items-start gap-3">
                    <Scale size={18} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider mb-1">About These Metrics</div>
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
                className="space-y-6"
              >
                <div>
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Daily Activity</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">Your non-training movement shapes your total daily expenditure.</p>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Average Daily Steps</label>
                  <input type="number" value={form.dailySteps} onChange={(e) => update("dailySteps", e.target.value)} placeholder="8000" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Job Type</label>
                  <div className="grid grid-cols-2 gap-2">
                    {JOB_OPTIONS.map((opt) => (
                      <motion.button
                        key={opt.value}
                        onClick={() => update("jobType", opt.value)}
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`p-3 border text-left transition-colors will-change-transform ${
                          form.jobType === opt.value
                            ? "border-accent bg-accent/10"
                            : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                        }`}
                      >
                        <div className="text-xs font-mono uppercase tracking-wider">{opt.label}</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{opt.description}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Info section to fill space */}
                <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                  <div className="flex items-start gap-3">
                    <Footprints size={18} className="text-accent shrink-0 mt-0.5" />
                    <div>
                      <div className="text-xs font-mono uppercase tracking-wider mb-1">Why This Matters</div>
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
                className="space-y-6"
              >
                <div>
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Training Profile</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">How you train directly impacts your calorie needs and macro targets.</p>
                </div>
                <div className="grid sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Training Days / Week</label>
                    <input type="number" value={form.trainingDays} onChange={(e) => update("trainingDays", e.target.value)} placeholder="3" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                  <div>
                    <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-2 tracking-wider">Cardio Minutes / Week</label>
                    <input type="number" value={form.cardioMinutes} onChange={(e) => update("cardioMinutes", e.target.value)} placeholder="60" className="w-full px-4 py-3 bg-[var(--bg-elevated)] border border-[var(--border-default)] font-mono focus:outline-none focus:border-accent" />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-mono uppercase text-[var(--text-muted)] mb-3 tracking-wider">Training Style</label>
                  <div className="grid grid-cols-3 gap-2">
                    {STYLE_OPTIONS.map((opt) => (
                      <motion.button
                        key={opt.value}
                        onClick={() => update("trainingStyle", opt.value)}
                        whileHover={{ scale: 1.02 }}
                        whileTap={{ scale: 0.97 }}
                        transition={{ type: "spring", stiffness: 400, damping: 25 }}
                        className={`p-3 border text-center transition-colors will-change-transform ${
                          form.trainingStyle === opt.value
                            ? "border-accent bg-accent/10"
                            : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                        }`}
                      >
                        <div className="text-xs font-mono uppercase tracking-wider">{opt.label}</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{opt.description}</div>
                      </motion.button>
                    ))}
                  </div>
                </div>

                {/* Info section to fill space */}
                <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
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
                className="space-y-6"
              >
                <div>
                  <h3 className="font-heading text-xl uppercase tracking-normal mb-1">Select Your Goal</h3>
                  <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide">This determines your calorie surplus or deficit. You can change this anytime.</p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {GOAL_OPTIONS.map((opt) => (
                    <motion.button
                      key={opt.value}
                      onClick={() => update("goal", opt.value)}
                      whileHover={{ scale: 1.02, y: -2 }}
                      whileTap={{ scale: 0.98 }}
                      transition={{ type: "spring", stiffness: 400, damping: 25 }}
                      className={`p-4 border text-left transition-colors will-change-transform ${
                        form.goal === opt.value
                          ? "border-accent bg-accent/10"
                          : "border-[var(--border-default)] hover:border-[var(--text-secondary)]"
                      }`}
                    >
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-sm font-mono uppercase tracking-wider font-bold">
                          {opt.label}
                        </span>
                        <AnimatePresence>
                          {form.goal === opt.value && (
                            <motion.span
                              initial={{ scale: 0, opacity: 0 }}
                              animate={{ scale: 1, opacity: 1 }}
                              exit={{ scale: 0, opacity: 0 }}
                              transition={{ type: "spring", stiffness: 500, damping: 25 }}
                            >
                              <CheckCircle2 size={14} className="text-accent" />
                            </motion.span>
                          )}
                        </AnimatePresence>
                      </div>
                      <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">{opt.description}</div>
                    </motion.button>
                  ))}
                </div>

                {/* Goal explanation */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-2 mb-2">
                      <Target size={16} className="text-accent" />
                      <span className="text-xs font-mono uppercase tracking-wider">Calorie Adjustment</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed tracking-wide">
                      {form.goal === "cut" && "We'll set you at ~15% below maintenance for steady fat loss without muscle sacrifice."}
                      {form.goal === "bulk" && "A modest 10% surplus maximizes muscle gain while minimizing fat accumulation."}
                      {form.goal === "maintain" && "You'll eat at maintenance — perfect for sustaining progress or body recomposition."}
                      {form.goal === "recomp" && "Eating at maintenance with high protein enables simultaneous fat loss and muscle gain."}
                    </p>
                  </div>
                  <div className="p-4 border border-[var(--border-default)] bg-[var(--bg-elevated)]">
                    <div className="flex items-center gap-2 mb-2">
                      <TrendingUp size={16} className="text-accent" />
                      <span className="text-xs font-mono uppercase tracking-wider">Expected Timeline</span>
                    </div>
                    <p className="text-[11px] text-[var(--text-muted)] leading-relaxed tracking-wide">
                      {form.goal === "cut" && "Aim for 0.5-1% body weight loss per week. Visible results in 4-6 weeks."}
                      {form.goal === "bulk" && "Expect 0.25-0.5% weight gain per week. Strength gains within 2-3 weeks."}
                      {form.goal === "maintain" && "Focus on performance metrics and how you feel rather than the scale."}
                      {form.goal === "recomp" && "Progress is slower but sustainable. Track measurements, not just weight."}
                    </p>
                  </div>
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
                className="space-y-6"
              >
                {loading ? (
                  <div className="flex flex-col items-center justify-center py-16 gap-4">
                    <Loader2 size={36} className="animate-spin text-accent" />
                    <div className="text-sm font-mono text-[var(--text-muted)] tracking-wide">CALCULATING YOUR PROTOCOL...</div>
                  </div>
                ) : error ? (
                  <div className="p-4 bg-red-500/10 border border-red-500/30 text-red-400 text-sm font-mono tracking-wide">{error}</div>
                ) : results ? (
                  <div className="space-y-6">
                    <div className="text-center space-y-2">
                      <div className="inline-flex items-center gap-2 px-3 py-1.5 bg-accent/10 border border-accent/30 text-accent text-[10px] font-mono uppercase tracking-wider">
                        <Sparkles size={12} /> Personalized Protocol Ready
                      </div>
                      <h3 className="font-heading text-2xl uppercase tracking-normal">Your Daily Targets</h3>
                      <p className="text-xs text-[var(--text-muted)] font-mono tracking-wide max-w-md mx-auto">
                        Based on {form.sex === "male" ? "Mifflin-St Jeor" : "Mifflin-St Jeor"} equation
                        {form.leanMass || form.bodyFat ? " + Cunningham adjustment" : ""}.
                        These numbers adapt as you log data.
                      </p>
                    </div>

                    {/* Big calorie number */}
                    <div className="p-6 bg-accent text-[var(--theme-primary-text)] text-center">
                      <div className="text-[10px] font-mono uppercase tracking-widest opacity-70 mb-2">Daily Calorie Target</div>
                      <div className="font-heading text-5xl tracking-tight">{results.targetCals}</div>
                      <div className="text-xs font-mono uppercase tracking-widest opacity-70 mt-1">KCAL / DAY</div>
                    </div>

                    {/* Macro grid */}
                    <div className="grid grid-cols-3 gap-3">
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center">
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mb-1">PROTEIN</div>
                        <div className="font-heading text-2xl">{results.targetProtein}g</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{Math.round(results.targetProtein * 4)} kcal</div>
                      </div>
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center">
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mb-1">CARBS</div>
                        <div className="font-heading text-2xl">{results.targetCarbs}g</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{Math.round(results.targetCarbs * 4)} kcal</div>
                      </div>
                      <div className="p-4 bg-[var(--bg-elevated)] border border-[var(--border-default)] text-center">
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mb-1">FAT</div>
                        <div className="font-heading text-2xl">{results.targetFat}g</div>
                        <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide mt-1">{Math.round(results.targetFat * 9)} kcal</div>
                      </div>
                    </div>

                    {/* Stats row */}
                    <div className="grid grid-cols-2 gap-3">
                      <div className="p-3 border border-[var(--border-default)] flex items-center gap-3">
                        <Activity size={18} className="text-accent" />
                        <div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">RMR</div>
                          <div className="font-heading text-lg">{results.rmr} <span className="text-xs font-mono text-[var(--text-muted)]">kcal</span></div>
                        </div>
                      </div>
                      <div className="p-3 border border-[var(--border-default)] flex items-center gap-3">
                        <Flame size={18} className="text-accent" />
                        <div>
                          <div className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">TDEE</div>
                          <div className="font-heading text-lg">{results.tdee} <span className="text-xs font-mono text-[var(--text-muted)]">kcal</span></div>
                        </div>
                      </div>
                    </div>

                    {/* CTA */}
                    <div className="text-center space-y-3 pt-2">
                      <button
                        onClick={handleFinish}
                        className="px-10 py-4 bg-accent text-[var(--theme-primary-text)] font-mono text-sm uppercase tracking-wider font-bold hover:opacity-90 transition-opacity inline-flex items-center gap-2"
                      >
                        <Trophy size={16} /> Start My Journey
                      </button>
                      <p className="text-[10px] font-mono text-[var(--text-muted)] tracking-wide">
                        Your targets are saved. You can edit them anytime in Settings.
                      </p>
                    </div>
                  </div>
                ) : null}
              </motion.div>
            )}
            </AnimatePresence>
          </LayoutGroup>
        </div>

        {/* Footer Navigation */}
        {step > 0 && step < 5 && (
          <div className="sticky bottom-0 bg-[var(--bg-card)] border-t border-[var(--border-default)] px-6 py-4 flex items-center justify-between">
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
                loading ? <><Loader2 size={14} className="animate-spin" /> Calculating...</> : <><Sparkles size={14} /> Reveal My Plan</>
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
