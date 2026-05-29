import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useUser } from "@clerk/react";
import { useMutation, useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { ArrowRight, ArrowLeft, Check, Loader2, Plus, Trash2 } from "lucide-react";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 280, damping: 28 } as const;

type Step = "intro" | "name" | "stats" | "goal" | "work" | "training" | "diet" | "style" | "plan" | "wrap";
const STEPS: Step[] = ["intro", "name", "stats", "goal", "work", "training", "diet", "style", "plan", "wrap"];

type Goal = "aggressive_loss" | "moderate_loss" | "maintain" | "recomp" | "lean_gain" | "muscle_gain";
type WorkoutRow = { type: string; durationMin: number; sessionsPerWeek: number };

const WORKOUT_TYPES = ["strength", "run_slow", "run_fast", "cycling", "hiit", "yoga", "swim", "walk", "sport"];

type State = {
  firstName: string;
  age: string;
  sex: "" | "male" | "female";
  weight: string;
  height: string;
  bodyFat: string;
  goal: "" | Goal;
  occupationType: "" | "desk" | "mixed" | "standing" | "physical";
  workHoursPerDay: string;
  lifestyleActivity: "" | "sedentary" | "light" | "moderate" | "active";
  weeklyWorkouts: WorkoutRow[];
  dietaryPreference: "" | "none" | "vegetarian" | "vegan" | "pescatarian" | "keto";
  allergies: string;
  coachingStyle: "gentle" | "motivating" | "analytical";
};

function StepShell({ progress, children }: { progress: number; children: ReactNode }) {
  return (
    <div className="min-h-dvh w-full bg-bg flex flex-col">
      <div className="sticky top-0 z-10 bg-bg/95 backdrop-blur-sm border-b border-border">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-3">
          <span className="text-[12px] font-bold uppercase tracking-wider text-text-muted">Stride</span>
          <div className="flex-1 h-1.5 rounded-full bg-border overflow-hidden">
            <motion.div className="h-full bg-ink rounded-full" initial={false} animate={{ width: `${progress * 100}%` }} transition={SPRING} />
          </div>
          <span className="text-[12px] font-semibold text-text-muted">{Math.round(progress * 100)}%</span>
        </div>
      </div>
      <div className="flex-1 flex items-center justify-center p-5 lg:p-8">
        <div className="w-full max-w-md">{children}</div>
      </div>
    </div>
  );
}

function NavRow({ canBack, canNext, nextLabel, loading, onBack, onNext }: {
  canBack: boolean; canNext: boolean; nextLabel?: string; loading?: boolean;
  onBack: () => void; onNext: () => void;
}) {
  return (
    <div className="flex items-center justify-between gap-3 pt-4">
      <button type="button" onClick={onBack} disabled={!canBack}
        className={cn("inline-flex items-center gap-1.5 rounded-full px-4 py-2.5 text-[13px] font-semibold transition-colors", canBack ? "text-text hover:bg-card-elev" : "text-text-subtle cursor-not-allowed")}>
        <ArrowLeft className="h-3.5 w-3.5" strokeWidth={2} /> Back
      </button>
      <button type="button" onClick={onNext} disabled={!canNext || loading}
        className={cn("inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-5 py-2.5 text-[14px] font-semibold transition-opacity", (!canNext || loading) && "opacity-50")}>
        {loading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>{nextLabel ?? "Next"} {!nextLabel && <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />}</>}
      </button>
    </div>
  );
}

function ChoiceGrid<T extends string>({ options, value, onChange, cols = 2 }: {
  options: { value: T; label: string; sub?: string }[];
  value: T | ""; onChange: (v: T) => void; cols?: 2 | 3;
}) {
  return (
    <div className={cn("grid gap-2.5", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onChange(o.value)} aria-pressed={active}
            className={cn("rounded-2xl border p-4 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender", active ? "bg-lavender/15 border-lavender" : "bg-card border-border hover:border-border-strong")}>
            <div className="flex items-center justify-between">
              <span className="text-[14px] font-bold text-text">{o.label}</span>
              {active && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-lavender"><Check className="h-3 w-3 text-ink" strokeWidth={2.5} /></span>}
            </div>
            {o.sub && <p className="text-[12px] text-text-muted mt-1">{o.sub}</p>}
          </button>
        );
      })}
    </div>
  );
}

function BreakdownRow({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="flex items-baseline justify-between py-1.5 border-b border-border last:border-0">
      <span className="text-[13px] text-text-muted">{label}</span>
      <span className="text-[13px] font-semibold text-text">{value}</span>
    </div>
  );
}

export function OnboardingPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const upsertPlan = useMutation(api.profile.upsertPlanFromOnboarding);
  const upsertSettings = useMutation(api.profile.upsertSettings);

  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<State>({
    firstName: user?.firstName ?? "", age: "", sex: "", weight: "", height: "", bodyFat: "",
    goal: "", occupationType: "", workHoursPerDay: "8", lifestyleActivity: "", weeklyWorkouts: [],
    dietaryPreference: "", allergies: "", coachingStyle: "gentle",
  });
  const [submitting, setSubmitting] = useState(false);

  const idx = STEPS.indexOf(step);
  const progress = (idx + 1) / STEPS.length;
  const set = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));
  const next = () => { const i = STEPS.indexOf(step); if (i < STEPS.length - 1) setStep(STEPS[i + 1]); };
  const back = () => { const i = STEPS.indexOf(step); if (i > 0) setStep(STEPS[i - 1]); };

  const statsValid = !!(state.weight && state.height && state.age && state.sex);
  const planArgs = statsValid
    ? {
        weightKg: parseFloat(state.weight),
        heightCm: parseFloat(state.height),
        age: parseInt(state.age, 10),
        sex: state.sex as string,
        bodyFat: state.bodyFat ? parseFloat(state.bodyFat) : undefined,
        occupationType: state.occupationType || undefined,
        workHoursPerDay: state.workHoursPerDay ? parseFloat(state.workHoursPerDay) : undefined,
        lifestyleActivity: state.lifestyleActivity || undefined,
        weeklyWorkouts: state.weeklyWorkouts.length ? state.weeklyWorkouts : undefined,
        goal: state.goal || undefined,
      }
    : "skip";
  // Live transparency preview (reactive, no persistence).
  const plan = useQuery(api.profile.calculateNutritionPlan, planArgs as any) as any;

  function addWorkout() {
    set("weeklyWorkouts", [...state.weeklyWorkouts, { type: "strength", durationMin: 60, sessionsPerWeek: 3 }]);
  }
  function updateWorkout(i: number, patch: Partial<WorkoutRow>) {
    set("weeklyWorkouts", state.weeklyWorkouts.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  }

  async function finish() {
    setSubmitting(true);
    try {
      if (statsValid) {
        await upsertPlan({
          ...(planArgs as object),
          date: new Date().toISOString().slice(0, 10),
          dietaryPreference: state.dietaryPreference || undefined,
          allergies: state.allergies || undefined,
        } as any);
      }
      await upsertSettings({ coachingStyle: state.coachingStyle }).catch(() => {});
      localStorage.setItem("stride.prefs.v1", JSON.stringify({ units: "metric", notifications: true, reduceMotion: false, coachingStyle: state.coachingStyle }));
      navigate("/");
    } catch (err) {
      console.error("Onboarding plan save failed:", err);
      navigate("/");
    } finally { setSubmitting(false); }
  }

  return (
    <StepShell progress={progress}>
      <AnimatePresence mode="wait">
        <motion.div key={step} initial={{ opacity: 0, x: 12 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -12 }} transition={SPRING} className="space-y-6">

          {step === "intro" && (
            <div className="space-y-5 text-center">
              <div className="w-40 h-40 mx-auto rounded-full bg-lavender overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <VoxelAgent agent="main" size={160} state="idle" />
                </div>
              </div>
              <div className="space-y-2">
                <h1 className="text-display text-text leading-[1.05]">Hi, I'm Stry.</h1>
                <p className="text-[16px] text-text-muted leading-relaxed max-w-[34ch] mx-auto">
                  A few quick questions and I'll build your science-based calorie + macro plan.
                </p>
              </div>
              <button type="button" onClick={next} className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-6 py-3 text-[14px] font-semibold mx-auto">
                Let's start <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
              </button>
            </div>
          )}

          {step === "name" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">What should I call you?</h2><p className="text-[14px] text-text-muted mt-1">Just a first name is fine.</p></div>
              <input autoFocus type="text" value={state.firstName} onChange={(e) => set("firstName", e.target.value)} placeholder="Sandra"
                className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3.5 text-[16px] text-text placeholder:text-text-subtle" />
              <NavRow canBack canNext={state.firstName.trim().length >= 1} onBack={back} onNext={next} />
            </div>
          )}

          {step === "stats" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">A few basics</h2><p className="text-[14px] text-text-muted mt-1">Required for accurate targets. Body fat is optional (enables a more precise formula).</p></div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Age", key: "age" as const, placeholder: "28" },
                  { label: "Weight (kg)", key: "weight" as const, placeholder: "65" },
                  { label: "Height (cm)", key: "height" as const, placeholder: "170" },
                  { label: "Body fat % (optional)", key: "bodyFat" as const, placeholder: "18" },
                ].map(({ label, key, placeholder }) => (
                  <label key={key} className="block space-y-1.5">
                    <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
                    <input type="number" value={state[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder}
                      className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3 text-[15px]" />
                  </label>
                ))}
                <label className="block space-y-1.5 col-span-2">
                  <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Sex</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["female", "male"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => set("sex", s)} aria-pressed={state.sex === s}
                        className={cn("rounded-2xl border py-3 text-[13px] font-semibold capitalize transition-colors", state.sex === s ? "bg-lavender/15 border-lavender text-text" : "bg-card border-border text-text-muted")}>
                        {s}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
              <NavRow canBack canNext={statsValid} onBack={back} onNext={next} />
            </div>
          )}

          {step === "goal" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">What's your goal?</h2><p className="text-[14px] text-text-muted mt-1">I'll set your calorie adjustment around this.</p></div>
              <ChoiceGrid<Goal> value={state.goal} onChange={(v) => set("goal", v)} options={[
                { value: "aggressive_loss", label: "Lose fat fast", sub: "~25% deficit" },
                { value: "moderate_loss", label: "Lose fat", sub: "~18% deficit" },
                { value: "maintain", label: "Maintain", sub: "Stay where I am" },
                { value: "recomp", label: "Recomp", sub: "Slight deficit, build muscle" },
                { value: "lean_gain", label: "Lean gain", sub: "~10% surplus" },
                { value: "muscle_gain", label: "Build muscle", sub: "~18% surplus" },
              ]} />
              <NavRow canBack canNext={!!state.goal} onBack={back} onNext={next} />
            </div>
          )}

          {step === "work" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">Your typical day</h2><p className="text-[14px] text-text-muted mt-1">Work and lifestyle drive non-exercise burn (NEAT).</p></div>
              <div className="space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Occupation</span>
                <ChoiceGrid<NonNullable<State["occupationType"]>> value={state.occupationType} onChange={(v) => set("occupationType", v)} options={[
                  { value: "desk", label: "Desk", sub: "Mostly seated" },
                  { value: "mixed", label: "Mixed", sub: "Sit + move" },
                  { value: "standing", label: "Standing", sub: "On feet" },
                  { value: "physical", label: "Physical", sub: "Manual labor" },
                ]} />
              </div>
              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Work hours / day</span>
                <input type="number" min={0} max={16} value={state.workHoursPerDay} onChange={(e) => set("workHoursPerDay", e.target.value)} placeholder="8"
                  className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3 text-[15px]" />
              </label>
              <div className="space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Off-work lifestyle</span>
                <ChoiceGrid<NonNullable<State["lifestyleActivity"]>> value={state.lifestyleActivity} onChange={(v) => set("lifestyleActivity", v)} options={[
                  { value: "sedentary", label: "Sedentary" },
                  { value: "light", label: "Light" },
                  { value: "moderate", label: "Moderate" },
                  { value: "active", label: "Active" },
                ]} />
              </div>
              <NavRow canBack canNext={!!state.occupationType && !!state.lifestyleActivity} onBack={back} onNext={next} />
            </div>
          )}

          {step === "training" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">Weekly training</h2><p className="text-[14px] text-text-muted mt-1">Add the workouts you do most weeks. Drives exercise burn (EAT).</p></div>
              <div className="space-y-2">
                {state.weeklyWorkouts.map((w, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-1.5 rounded-2xl border border-border p-2.5">
                    <label className="flex flex-col gap-0.5">
                      <span className="text-[10px] text-text-muted">Type</span>
                      <select value={w.type} onChange={(e) => updateWorkout(i, { type: e.target.value })}
                        className="bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-lavender">
                        {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                      </select>
                    </label>
                    <label className="flex flex-col gap-0.5 w-16">
                      <span className="text-[10px] text-text-muted">Min</span>
                      <input type="number" min={1} value={w.durationMin} onChange={(e) => updateWorkout(i, { durationMin: Math.max(1, Number(e.target.value) || 0) })}
                        className="bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-lavender" />
                    </label>
                    <label className="flex flex-col gap-0.5 w-16">
                      <span className="text-[10px] text-text-muted">×/wk</span>
                      <input type="number" min={1} max={14} value={w.sessionsPerWeek} onChange={(e) => updateWorkout(i, { sessionsPerWeek: Math.max(1, Number(e.target.value) || 0) })}
                        className="bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] text-text focus:outline-none focus:border-lavender" />
                    </label>
                    <button type="button" aria-label="Remove workout" onClick={() => set("weeklyWorkouts", state.weeklyWorkouts.filter((_, k) => k !== i))}
                      className="inline-flex h-9 w-9 items-center justify-center rounded-full text-text-muted hover:text-bubblegum">
                      <Trash2 className="h-4 w-4" strokeWidth={2} />
                    </button>
                  </div>
                ))}
                <button type="button" onClick={addWorkout}
                  className="inline-flex items-center gap-1.5 rounded-full border border-border bg-card px-4 py-2 text-[13px] font-semibold text-text hover:border-lavender">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add workout
                </button>
              </div>
              <NavRow canBack canNext onBack={back} onNext={next} />
            </div>
          )}

          {step === "diet" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">Any dietary preferences?</h2><p className="text-[14px] text-text-muted mt-1">I won't suggest foods that don't fit.</p></div>
              <ChoiceGrid<NonNullable<State["dietaryPreference"]>> value={state.dietaryPreference} onChange={(v) => set("dietaryPreference", v)} options={[
                { value: "none", label: "No preference" },
                { value: "vegetarian", label: "Vegetarian" },
                { value: "vegan", label: "Vegan" },
                { value: "pescatarian", label: "Pescatarian" },
                { value: "keto", label: "Keto" },
              ]} />
              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Allergies / avoid (optional)</span>
                <input type="text" value={state.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="peanuts, shellfish, gluten…"
                  className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3 text-[15px]" />
              </label>
              <NavRow canBack canNext={!!state.dietaryPreference} onBack={back} onNext={next} />
            </div>
          )}

          {step === "style" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">How should I talk to you?</h2><p className="text-[14px] text-text-muted mt-1">You can change this anytime.</p></div>
              <div className="grid grid-cols-1 gap-2.5">
                {[
                  { value: "gentle", label: "Gentle", sub: "Warm, low-pressure", example: "Got it — that's a good step." },
                  { value: "motivating", label: "Motivating", sub: "High-energy, celebrates wins", example: "Logged it — you're on fire!" },
                  { value: "analytical", label: "Analytical", sub: "Data-first, precise", example: "Logged. 3rd entry today, +22% pace." },
                ].map((p) => {
                  const active = state.coachingStyle === p.value;
                  return (
                    <button key={p.value} type="button" onClick={() => set("coachingStyle", p.value as State["coachingStyle"])} aria-pressed={active}
                      className={cn("rounded-2xl border p-4 text-left transition-all", active ? "bg-lavender/15 border-lavender" : "bg-card border-border hover:border-border-strong")}>
                      <div className="flex items-center justify-between">
                        <span className="text-[14px] font-bold text-text">{p.label}</span>
                        {active && <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-lavender"><Check className="h-3 w-3 text-ink" strokeWidth={2.5} /></span>}
                      </div>
                      <p className="text-[12px] text-text-muted mt-0.5">{p.sub}</p>
                      <p className="text-[12.5px] italic text-text mt-1.5">"{p.example}"</p>
                    </button>
                  );
                })}
              </div>
              <NavRow canBack canNext onBack={back} onNext={next} />
            </div>
          )}

          {step === "plan" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">Your plan</h2><p className="text-[14px] text-text-muted mt-1">Built from your inputs — fully transparent.</p></div>
              {!plan ? (
                <div className="py-10 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-text-muted" /></div>
              ) : (
                <>
                  <div className="flex flex-col items-center gap-3 rounded-2xl bg-card border border-border p-5">
                    <span className="text-[40px] font-extrabold text-text leading-none">{plan.calories}</span>
                    <span className="text-[13px] text-text-muted -mt-2">kcal / day</span>
                    <MacroDonut kcal={plan.calories} protein={plan.protein} carbs={plan.carbs} fat={plan.fat} />
                    <div className="flex gap-4 text-[13px]">
                      <span className="text-text"><b>{plan.protein}g</b> <span className="text-text-muted">P · {plan.percentages.protein}%</span></span>
                      <span className="text-text"><b>{plan.carbs}g</b> <span className="text-text-muted">C · {plan.percentages.carbs}%</span></span>
                      <span className="text-text"><b>{plan.fat}g</b> <span className="text-text-muted">F · {plan.percentages.fat}%</span></span>
                    </div>
                  </div>
                  <div className="rounded-2xl bg-card border border-border p-4">
                    <p className="text-[12px] font-bold uppercase tracking-wider text-text-muted mb-1">About this calculation</p>
                    <BreakdownRow label="BMR (resting)" value={`${plan.breakdown.bmr} kcal`} />
                    <BreakdownRow label="NEAT — job" value={`+${plan.breakdown.neatJob} kcal`} />
                    <BreakdownRow label="NEAT — lifestyle" value={`+${plan.breakdown.neatLifestyle} kcal`} />
                    <BreakdownRow label="EAT — workouts (avg/day)" value={`+${plan.breakdown.eat} kcal`} />
                    <BreakdownRow label="Thermic effect of food" value={`+${plan.breakdown.tef} kcal`} />
                    <BreakdownRow label="Maintenance (TDEE)" value={`${plan.breakdown.finalTDEE} kcal`} />
                    <BreakdownRow label="Goal adjustment" value={`${plan.breakdown.goalAdjustment >= 0 ? "+" : ""}${plan.breakdown.goalAdjustment} kcal`} />
                  </div>
                </>
              )}
              <NavRow canBack canNext={!!plan} onBack={back} onNext={next} nextLabel="Looks good" />
            </div>
          )}

          {step === "wrap" && (
            <div className="space-y-6 text-center">
              <div className="w-32 h-32 mx-auto rounded-full bg-mint overflow-hidden relative">
                <div className="absolute inset-0 flex items-center justify-center">
                  <VoxelAgent agent="main" size={120} state="idle" />
                </div>
              </div>
              <div className="space-y-2">
                <h2 className="text-h1 text-text">All set, {state.firstName || "friend"}.</h2>
                <p className="text-[15px] text-text-muted leading-relaxed max-w-[34ch] mx-auto">
                  Your plan is saved. Log a meal, paste a photo, or just say what's on your mind.
                </p>
              </div>
              <button type="button" onClick={finish} disabled={submitting}
                className="inline-flex items-center gap-1.5 rounded-full bg-ink text-text-on-ink px-6 py-3 text-[14px] font-semibold disabled:opacity-50 mx-auto">
                {submitting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <>Take me home <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} /></>}
              </button>
            </div>
          )}
        </motion.div>
      </AnimatePresence>
    </StepShell>
  );
}
