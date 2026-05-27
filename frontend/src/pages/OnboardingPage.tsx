import { useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useUser } from "@clerk/react";
import { useMutation, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { ArrowRight, ArrowLeft, Check, Loader2 } from "lucide-react";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { cn } from "@/lib/utils";

const SPRING = { type: "spring", stiffness: 280, damping: 28 } as const;

type Step = "intro" | "name" | "stats" | "goal" | "activity" | "diet" | "style" | "wrap";
const STEPS: Step[] = ["intro", "name", "stats", "goal", "activity", "diet", "style", "wrap"];

type State = {
  firstName: string;
  age: string;
  sex: "" | "male" | "female";
  weight: string;
  height: string;
  goal: "" | "cut" | "maintain" | "recomp" | "bulk";
  activityLevel: "" | "sedentary" | "moderate" | "active" | "very_active";
  trainingDays: string;
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
          <button key={o.value} type="button" onClick={() => onChange(o.value)}
            className={cn("rounded-2xl border p-4 text-left transition-all focus-visible:outline-none", active ? "bg-lavender/15 border-lavender" : "bg-card border-border hover:border-border-strong")}>
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

export function OnboardingPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const upsertProfile = useMutation(api.profile.upsertProfile);
  const calculateTDEE = useAction(api.profile.calculateTDEE);

  const [step, setStep] = useState<Step>("intro");
  const [state, setState] = useState<State>({
    firstName: user?.firstName ?? "", age: "", sex: "", weight: "", height: "",
    goal: "", activityLevel: "", trainingDays: "", dietaryPreference: "", allergies: "", coachingStyle: "gentle",
  });
  const [submitting, setSubmitting] = useState(false);

  const idx = STEPS.indexOf(step);
  const progress = (idx + 1) / STEPS.length;
  const set = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));
  const next = () => { const i = STEPS.indexOf(step); if (i < STEPS.length - 1) setStep(STEPS[i + 1]); };
  const back = () => { const i = STEPS.indexOf(step); if (i > 0) setStep(STEPS[i - 1]); };

  async function finish() {
    setSubmitting(true);
    try {
      let targets: Record<string, number> = {};
      if (state.weight && state.height && state.age && state.sex) {
        try {
          const r = await calculateTDEE({
            weight: parseFloat(state.weight), height: parseFloat(state.height),
            age: parseInt(state.age, 10), sex: state.sex,
            activityLevel: state.activityLevel || "moderate",
            trainingDays: state.trainingDays ? parseInt(state.trainingDays, 10) : 0,
            goal: state.goal || "maintain",
          });
          targets = { calorieTarget: r.targetCals, proteinTarget: r.targetProtein, carbTarget: r.targetCarbs, fatTarget: r.targetFat };
        } catch { /* ignore */ }
      }
      await upsertProfile({
        weight: state.weight ? parseFloat(state.weight) : undefined,
        height: state.height ? parseFloat(state.height) : undefined,
        age: state.age ? parseInt(state.age, 10) : undefined,
        sex: state.sex || undefined,
        activityLevel: state.activityLevel || "moderate",
        goal: state.goal || undefined,
        trainingDays: state.trainingDays ? parseInt(state.trainingDays, 10) : undefined,
        dietaryPreference: state.dietaryPreference || undefined,
        allergies: state.allergies || undefined,
        onboardingComplete: true,
        ...targets,
      });
      localStorage.setItem("stride.prefs.v1", JSON.stringify({ units: "metric", notifications: true, reduceMotion: false, coachingStyle: state.coachingStyle }));
      navigate("/");
    } catch (err) {
      console.error("Onboarding profile save failed:", err);
      // Profile save failed — still navigate so user isn't stuck; they can update in Settings
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
                  Five quick questions and I'll know how to help you best.
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
              <div><h2 className="text-h1 text-text">A few basics</h2><p className="text-[14px] text-text-muted mt-1">For accurate calorie + macro targets. Optional.</p></div>
              <div className="grid grid-cols-2 gap-2.5">
                {[
                  { label: "Age", key: "age" as const, placeholder: "28", type: "number" },
                  { label: "Weight (kg)", key: "weight" as const, placeholder: "65", type: "number" },
                  { label: "Height (cm)", key: "height" as const, placeholder: "170", type: "number" },
                ].map(({ label, key, placeholder, type }) => (
                  <label key={key} className="block space-y-1.5">
                    <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">{label}</span>
                    <input type={type} value={state[key]} onChange={(e) => set(key, e.target.value)} placeholder={placeholder}
                      className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3 text-[15px]" />
                  </label>
                ))}
                <label className="block space-y-1.5">
                  <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Sex</span>
                  <div className="grid grid-cols-2 gap-1.5">
                    {(["female", "male"] as const).map((s) => (
                      <button key={s} type="button" onClick={() => set("sex", s)}
                        className={cn("rounded-2xl border py-3 text-[13px] font-semibold capitalize transition-colors", state.sex === s ? "bg-lavender/15 border-lavender text-text" : "bg-card border-border text-text-muted")}>
                        {s}
                      </button>
                    ))}
                  </div>
                </label>
              </div>
              <NavRow canBack canNext onBack={back} onNext={next} nextLabel="Next" />
            </div>
          )}

          {step === "goal" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">What's your goal?</h2><p className="text-[14px] text-text-muted mt-1">I'll tailor your daily targets around this.</p></div>
              <ChoiceGrid<State["goal"]> value={state.goal} onChange={(v) => set("goal", v)} options={[
                { value: "cut", label: "Lose fat", sub: "Slight calorie deficit" },
                { value: "maintain", label: "Maintain", sub: "Stay where I am" },
                { value: "recomp", label: "Recomp", sub: "Build muscle, lose fat" },
                { value: "bulk", label: "Build muscle", sub: "Slight surplus" },
              ]} />
              <NavRow canBack canNext={!!state.goal} onBack={back} onNext={next} />
            </div>
          )}

          {step === "activity" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">How active are you?</h2><p className="text-[14px] text-text-muted mt-1">Day-to-day, not just workouts.</p></div>
              <ChoiceGrid<State["activityLevel"]> value={state.activityLevel} onChange={(v) => set("activityLevel", v)} options={[
                { value: "sedentary", label: "Sedentary", sub: "Mostly desk-bound" },
                { value: "moderate", label: "Moderate", sub: "Some walking, light activity" },
                { value: "active", label: "Active", sub: "On feet a lot, regular exercise" },
                { value: "very_active", label: "Very active", sub: "Physical job or daily training" },
              ]} />
              <label className="block space-y-1.5">
                <span className="text-[12px] font-semibold text-text-muted uppercase tracking-wider">Workouts per week</span>
                <input type="number" min={0} max={14} value={state.trainingDays} onChange={(e) => set("trainingDays", e.target.value)} placeholder="3"
                  className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3 text-[15px]" />
              </label>
              <NavRow canBack canNext={!!state.activityLevel} onBack={back} onNext={next} />
            </div>
          )}

          {step === "diet" && (
            <div className="space-y-5">
              <div><h2 className="text-h1 text-text">Any dietary preferences?</h2><p className="text-[14px] text-text-muted mt-1">I won't suggest foods that don't fit.</p></div>
              <ChoiceGrid<State["dietaryPreference"]> value={state.dietaryPreference} onChange={(v) => set("dietaryPreference", v)} options={[
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
                    <button key={p.value} type="button" onClick={() => set("coachingStyle", p.value as State["coachingStyle"])}
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
                  Log a meal, paste a photo, or just say what's on your mind.
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
