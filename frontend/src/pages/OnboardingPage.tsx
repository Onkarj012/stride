import { useEffect, useRef, useState, type ReactNode } from "react";
import { useNavigate } from "react-router-dom";
import { motion, AnimatePresence } from "motion/react";
import { useUser } from "@clerk/react";
import { useMutation, useQuery, useAction } from "convex/react";
import { api } from "@convex/_generated/api";
import { ArrowRight, Check, Loader2, Plus, Trash2, Sparkles, Send } from "lucide-react";
import { VoxelAgent } from "@/components/voxel/VoxelAgent";
import { MacroDonut } from "@/components/charts/MacroDonut";
import { cn } from "@/lib/utils";

type Phase = "name" | "stats" | "goal" | "work" | "training" | "diet" | "style" | "plan";

type Goal = "aggressive_loss" | "moderate_loss" | "mild_loss" | "maintain" | "recomp" | "lean_gain" | "muscle_gain";
type WorkoutRow = { type: string; durationMin: number; sessionsPerWeek: number };
const WORKOUT_TYPES = ["strength", "run_slow", "run_fast", "cycling", "hiit", "yoga", "swim", "walk", "sport"];

type State = {
  firstName: string; age: string; sex: "" | "male" | "female"; weight: string; height: string; bodyFat: string;
  goal: "" | Goal;
  occupationType: "" | "desk" | "mixed" | "standing" | "physical"; workHoursPerDay: string;
  lifestyleActivity: "" | "sedentary" | "light" | "moderate" | "active";
  weeklyWorkouts: WorkoutRow[];
  dietaryPreference: "" | "none" | "vegetarian" | "vegan" | "pescatarian" | "keto"; allergies: string;
  coachingStyle: "gentle" | "motivating" | "analytical";
};

type Msg = { id: number; role: "bot" | "user"; node: ReactNode };

/* ── Free-text input that LLM-parses into structured fields ── */
function FreeText({ field, placeholder, onParsed }: {
  field: string; placeholder: string; onParsed: (data: Record<string, unknown>) => void;
}) {
  const parse = useAction(api.ai.parseOnboarding);
  const [text, setText] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    if (!text.trim() || busy) return;
    setBusy(true);
    try {
      const data = await parse({ field, text: text.trim() });
      onParsed(data);
      setText("");
    } catch { /* keep text so user can retry / use widgets */ }
    finally { setBusy(false); }
  }

  return (
    <div className="flex items-center gap-2 rounded-2xl border border-border bg-card-elev px-3 py-2">
      <Sparkles className="h-4 w-4 text-lavender shrink-0" strokeWidth={2} />
      <input
        value={text} onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => { if (e.key === "Enter") submit(); }}
        placeholder={placeholder}
        aria-label="Describe in your own words"
        className="flex-1 min-w-0 bg-transparent outline-none text-[14px] text-text placeholder:text-text-subtle"
      />
      <button type="button" onClick={submit} disabled={busy || !text.trim()} aria-label="Send"
        className="inline-flex h-8 w-8 items-center justify-center rounded-full bg-ink text-text-on-ink disabled:opacity-40">
        {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-3.5 w-3.5" strokeWidth={2.5} />}
      </button>
    </div>
  );
}

function Choices<T extends string>({ options, value, onPick, cols = 2 }: {
  options: { value: T; label: string; sub?: string }[]; value: T | ""; onPick: (v: T) => void; cols?: 2 | 3;
}) {
  return (
    <div className={cn("grid gap-2", cols === 2 ? "grid-cols-2" : "grid-cols-3")}>
      {options.map((o) => {
        const active = value === o.value;
        return (
          <button key={o.value} type="button" onClick={() => onPick(o.value)} aria-pressed={active}
            className={cn("rounded-2xl border p-3 text-left transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-lavender",
              active ? "bg-lavender/15 border-lavender" : "bg-card border-border hover:border-border-strong")}>
            <div className="flex items-center justify-between gap-1">
              <span className="text-[13.5px] font-bold text-text">{o.label}</span>
              {active && <Check className="h-3.5 w-3.5 text-lavender shrink-0" strokeWidth={2.5} />}
            </div>
            {o.sub && <p className="text-[11.5px] text-text-muted mt-0.5">{o.sub}</p>}
          </button>
        );
      })}
    </div>
  );
}

const FieldInput = ({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) => (
  <label className="flex flex-col gap-1">
    <span className="text-[11px] font-semibold uppercase tracking-wider text-text-muted">{label}</span>
    <input type="number" value={value} onChange={(e) => onChange(e.target.value)} placeholder={placeholder}
      className="w-full rounded-xl bg-card border border-border focus:border-lavender outline-none px-3 py-2 text-[14px]" />
  </label>
);

function PrimaryBtn({ onClick, disabled, children }: { onClick: () => void; disabled?: boolean; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} disabled={disabled}
      className={cn("inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink px-5 py-2.5 text-[14px] font-semibold transition-opacity", disabled && "opacity-40")}>
      {children} <ArrowRight className="h-3.5 w-3.5" strokeWidth={2} />
    </button>
  );
}

export function OnboardingPage() {
  const { user } = useUser();
  const navigate = useNavigate();
  const upsertPlan = useMutation(api.profile.upsertPlanFromOnboarding);
  const upsertSettings = useMutation(api.profile.upsertSettings);

  const [phase, setPhase] = useState<Phase>("name");
  const [state, setState] = useState<State>({
    firstName: user?.firstName ?? "", age: "", sex: "", weight: "", height: "", bodyFat: "",
    goal: "", occupationType: "", workHoursPerDay: "8", lifestyleActivity: "", weeklyWorkouts: [],
    dietaryPreference: "", allergies: "", coachingStyle: "gentle",
  });
  const set = <K extends keyof State>(k: K, v: State[K]) => setState((s) => ({ ...s, [k]: v }));

  const [thread, setThread] = useState<Msg[]>([]);
  const [typing, setTyping] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const idRef = useRef(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const started = useRef(false);

  const QUESTIONS: Record<Phase, (s: State) => string> = {
    name: () => "Hey, I'm Stry 👋 I'll build you a science-based nutrition plan. First — what should I call you?",
    stats: (s) => `Nice to meet you, ${s.firstName || "friend"}! Tell me your age, weight, height and sex — type it naturally or use the fields.`,
    goal: () => "What are you aiming for right now?",
    work: () => "What's a typical day like? Your job, and how active you are outside of workouts.",
    training: () => "How do you train in a normal week? (Skip if you don't yet.)",
    diet: () => "Any dietary preferences or things to avoid?",
    style: () => "Last thing — how should I talk to you?",
    plan: () => "Amazing. Here's your personalized plan 👇",
  };

  function botSay(node: ReactNode) {
    setTyping(true);
    setTimeout(() => {
      setTyping(false);
      setThread((t) => [...t, { id: idRef.current++, role: "bot", node }]);
    }, 550);
  }
  function userSay(node: ReactNode) {
    setThread((t) => [...t, { id: idRef.current++, role: "user", node }]);
  }
  function advance(next: Phase, summary: ReactNode) {
    userSay(summary);
    setPhase(next);
    botSay(QUESTIONS[next](state));
  }

  // Kick off the conversation once.
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    botSay(QUESTIONS.name(state));
  }, []);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight, behavior: "smooth" });
  }, [thread, typing]);

  // Live plan preview for the final step.
  const statsValid = !!(state.weight && state.height && state.age && state.sex);
  const planArgs = statsValid && phase === "plan" ? {
    weightKg: parseFloat(state.weight), heightCm: parseFloat(state.height), age: parseInt(state.age, 10),
    sex: state.sex as string, bodyFat: state.bodyFat ? parseFloat(state.bodyFat) : undefined,
    occupationType: state.occupationType || undefined, workHoursPerDay: state.workHoursPerDay ? parseFloat(state.workHoursPerDay) : undefined,
    lifestyleActivity: state.lifestyleActivity || undefined, weeklyWorkouts: state.weeklyWorkouts.length ? state.weeklyWorkouts : undefined,
    goal: state.goal || undefined,
  } : "skip";
  const plan = useQuery(api.profile.calculateNutritionPlan, planArgs as any) as any;

  async function finish() {
    setSubmitting(true);
    try {
      if (statsValid) {
        await upsertPlan({
          weightKg: parseFloat(state.weight), heightCm: parseFloat(state.height), age: parseInt(state.age, 10),
          sex: state.sex as string, bodyFat: state.bodyFat ? parseFloat(state.bodyFat) : undefined,
          occupationType: state.occupationType || undefined, workHoursPerDay: state.workHoursPerDay ? parseFloat(state.workHoursPerDay) : undefined,
          lifestyleActivity: state.lifestyleActivity || undefined, weeklyWorkouts: state.weeklyWorkouts.length ? state.weeklyWorkouts : undefined,
          goal: state.goal || undefined, date: new Date().toISOString().slice(0, 10),
          dietaryPreference: state.dietaryPreference || undefined, allergies: state.allergies || undefined,
        } as any);
      }
      await upsertSettings({ coachingStyle: state.coachingStyle }).catch(() => {});
      navigate("/");
    } catch (e) {
      console.error("Onboarding save failed", e);
      navigate("/");
    } finally { setSubmitting(false); }
  }

  function addWorkout() { set("weeklyWorkouts", [...state.weeklyWorkouts, { type: "strength", durationMin: 60, sessionsPerWeek: 3 }]); }
  function updateWorkout(i: number, patch: Partial<WorkoutRow>) {
    set("weeklyWorkouts", state.weeklyWorkouts.map((w, k) => (k === i ? { ...w, ...patch } : w)));
  }

  const GOALS: { value: Goal; label: string; sub: string }[] = [
    { value: "aggressive_loss", label: "Lose fat fast", sub: "~25% deficit" },
    { value: "moderate_loss", label: "Lose fat", sub: "~18% deficit" },
    { value: "maintain", label: "Maintain", sub: "Stay here" },
    { value: "recomp", label: "Recomp", sub: "Lose fat, build muscle" },
    { value: "lean_gain", label: "Lean gain", sub: "~10% surplus" },
    { value: "muscle_gain", label: "Build muscle", sub: "~18% surplus" },
  ];

  return (
    <div className="min-h-dvh w-full bg-bg flex flex-col">
      {/* Thread */}
      <div ref={scrollRef} className="flex-1 overflow-y-auto" aria-live="polite">
        <div className="max-w-xl mx-auto px-4 py-6 space-y-3">
          <AnimatePresence initial={false}>
            {thread.map((m) => (
              <motion.div key={m.id} initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}
                className={cn("flex items-end gap-2", m.role === "user" ? "justify-end" : "justify-start")}>
                {m.role === "bot" && (
                  <div className="h-8 w-8 shrink-0 rounded-full bg-lavender overflow-hidden grid place-items-center">
                    <VoxelAgent agent="main" size={32} state="idle" />
                  </div>
                )}
                <div className={cn("max-w-[80%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed",
                  m.role === "user" ? "bg-ink text-text-on-ink rounded-br-md" : "bg-card border border-border text-text rounded-bl-md")}>
                  {m.node}
                </div>
              </motion.div>
            ))}
          </AnimatePresence>
          {typing && (
            <div className="flex items-end gap-2">
              <div className="h-8 w-8 shrink-0 rounded-full bg-lavender overflow-hidden grid place-items-center">
                <VoxelAgent agent="main" size={32} state="idle" />
              </div>
              <div className="rounded-2xl rounded-bl-md bg-card border border-border px-4 py-3 flex gap-1">
                {[0, 1, 2].map((i) => (
                  <motion.span key={i} className="h-1.5 w-1.5 rounded-full bg-text-muted"
                    animate={{ opacity: [0.3, 1, 0.3] }} transition={{ duration: 1, repeat: Infinity, delay: i * 0.2 }} />
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Composer — changes per phase */}
      {!typing && (
        <div className="border-t border-border bg-bg/95 backdrop-blur-sm">
          <div className="max-w-xl mx-auto px-4 py-4 space-y-3">
            {phase === "name" && (
              <div className="flex items-center gap-2">
                <input autoFocus value={state.firstName} onChange={(e) => set("firstName", e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter" && state.firstName.trim()) advance("stats", state.firstName); }}
                  placeholder="Your name" aria-label="Your name"
                  className="flex-1 rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-3 text-[15px]" />
                <PrimaryBtn onClick={() => advance("stats", state.firstName)} disabled={!state.firstName.trim()}>Next</PrimaryBtn>
              </div>
            )}

            {phase === "stats" && (
              <div className="space-y-3">
                <div className="grid grid-cols-2 gap-2">
                  <FieldInput label="Age" value={state.age} onChange={(v) => set("age", v)} placeholder="28" />
                  <FieldInput label="Weight (kg)" value={state.weight} onChange={(v) => set("weight", v)} placeholder="65" />
                  <FieldInput label="Height (cm)" value={state.height} onChange={(v) => set("height", v)} placeholder="170" />
                  <FieldInput label="Body fat % (opt)" value={state.bodyFat} onChange={(v) => set("bodyFat", v)} placeholder="18" />
                </div>
                <Choices options={[{ value: "female", label: "Female" }, { value: "male", label: "Male" }]} value={state.sex} onPick={(v) => set("sex", v)} />
                <FreeText field="stats" placeholder="…or: 28yo male, 80kg, 178cm" onParsed={(d) => {
                  if (d.age != null) set("age", String(d.age));
                  if (d.weightKg != null) set("weight", String(Math.round(Number(d.weightKg) * 10) / 10));
                  if (d.heightCm != null) set("height", String(Math.round(Number(d.heightCm))));
                  if (d.sex === "male" || d.sex === "female") set("sex", d.sex);
                  if (d.bodyFat != null) set("bodyFat", String(d.bodyFat));
                }} />
                <div className="flex justify-end">
                  <PrimaryBtn onClick={() => advance("goal", `${state.age}y · ${state.weight}kg · ${state.height}cm · ${state.sex}`)} disabled={!statsValid}>Continue</PrimaryBtn>
                </div>
              </div>
            )}

            {phase === "goal" && (
              <>
                <Choices cols={3} options={GOALS} value={state.goal} onPick={(v) => { set("goal", v); advance("work", GOALS.find((g) => g.value === v)!.label); }} />
                <FreeText field="goal" placeholder="…or describe your goal" onParsed={(d) => {
                  const g = d.goal as Goal; if (g && GOALS.some((x) => x.value === g)) { set("goal", g); advance("work", GOALS.find((x) => x.value === g)!.label); }
                }} />
              </>
            )}

            {phase === "work" && (
              <div className="space-y-3">
                <Choices options={[
                  { value: "desk", label: "Desk", sub: "Mostly seated" }, { value: "mixed", label: "Mixed", sub: "Sit + move" },
                  { value: "standing", label: "Standing", sub: "On feet" }, { value: "physical", label: "Physical", sub: "Manual labor" },
                ]} value={state.occupationType} onPick={(v) => set("occupationType", v)} />
                <div className="grid grid-cols-2 gap-2 items-end">
                  <FieldInput label="Work hrs/day" value={state.workHoursPerDay} onChange={(v) => set("workHoursPerDay", v)} placeholder="8" />
                </div>
                <Choices options={[
                  { value: "sedentary", label: "Sedentary" }, { value: "light", label: "Light" },
                  { value: "moderate", label: "Moderate" }, { value: "active", label: "Active" },
                ]} value={state.lifestyleActivity} onPick={(v) => set("lifestyleActivity", v)} />
                <FreeText field="work" placeholder="…or: desk job 9h, fairly lazy otherwise" onParsed={(d) => {
                  if (d.occupationType) set("occupationType", d.occupationType as State["occupationType"]);
                  if (d.workHoursPerDay != null) set("workHoursPerDay", String(d.workHoursPerDay));
                  if (d.lifestyleActivity) set("lifestyleActivity", d.lifestyleActivity as State["lifestyleActivity"]);
                }} />
                <div className="flex justify-end">
                  <PrimaryBtn onClick={() => advance("training", `${state.occupationType || "desk"} job · ${state.lifestyleActivity || "moderate"}`)} disabled={!state.occupationType || !state.lifestyleActivity}>Continue</PrimaryBtn>
                </div>
              </div>
            )}

            {phase === "training" && (
              <div className="space-y-2">
                {state.weeklyWorkouts.map((w, i) => (
                  <div key={i} className="grid grid-cols-[1fr_auto_auto_auto] items-end gap-1.5 rounded-xl border border-border p-2">
                    <select value={w.type} onChange={(e) => updateWorkout(i, { type: e.target.value })} aria-label="Workout type"
                      className="bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-lavender">
                      {WORKOUT_TYPES.map((t) => <option key={t} value={t}>{t.replace("_", " ")}</option>)}
                    </select>
                    <input type="number" min={1} value={w.durationMin} aria-label="Minutes" onChange={(e) => updateWorkout(i, { durationMin: Math.max(1, +e.target.value || 0) })}
                      className="w-14 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-lavender" />
                    <input type="number" min={1} value={w.sessionsPerWeek} aria-label="Sessions per week" onChange={(e) => updateWorkout(i, { sessionsPerWeek: Math.max(1, +e.target.value || 0) })}
                      className="w-14 bg-input border border-border rounded-lg px-2 py-1.5 text-[13px] focus:outline-none focus:border-lavender" />
                    <button type="button" aria-label="Remove" onClick={() => set("weeklyWorkouts", state.weeklyWorkouts.filter((_, k) => k !== i))}
                      className="inline-flex h-8 w-8 items-center justify-center rounded-full text-text-muted hover:text-bubblegum"><Trash2 className="h-4 w-4" strokeWidth={2} /></button>
                  </div>
                ))}
                <button type="button" onClick={addWorkout} className="inline-flex items-center gap-1 text-[13px] font-semibold text-text-muted hover:text-text">
                  <Plus className="h-3.5 w-3.5" strokeWidth={2} /> Add workout
                </button>
                <FreeText field="training" placeholder="…or: lift 4x/week ~1h, run twice 30min" onParsed={(d) => {
                  const ws = d.weeklyWorkouts as WorkoutRow[]; if (Array.isArray(ws) && ws.length) set("weeklyWorkouts", ws);
                }} />
                <div className="flex justify-end">
                  <PrimaryBtn onClick={() => advance("diet", state.weeklyWorkouts.length ? `${state.weeklyWorkouts.reduce((s, w) => s + w.sessionsPerWeek, 0)} sessions/wk` : "No regular training")}>Continue</PrimaryBtn>
                </div>
              </div>
            )}

            {phase === "diet" && (
              <div className="space-y-3">
                <Choices cols={3} options={[
                  { value: "none", label: "No pref" }, { value: "vegetarian", label: "Vegetarian" }, { value: "vegan", label: "Vegan" },
                  { value: "pescatarian", label: "Pescatarian" }, { value: "keto", label: "Keto" },
                ]} value={state.dietaryPreference} onPick={(v) => set("dietaryPreference", v)} />
                <input value={state.allergies} onChange={(e) => set("allergies", e.target.value)} placeholder="Allergies / avoid (optional)"
                  className="w-full rounded-2xl bg-card border border-border focus:border-lavender outline-none px-4 py-2.5 text-[14px]" />
                <FreeText field="diet" placeholder="…or: vegetarian, allergic to peanuts" onParsed={(d) => {
                  if (d.dietaryPreference) set("dietaryPreference", d.dietaryPreference as State["dietaryPreference"]);
                  if (d.allergies) set("allergies", String(d.allergies));
                }} />
                <div className="flex justify-end">
                  <PrimaryBtn onClick={() => advance("style", `${state.dietaryPreference || "no pref"}${state.allergies ? ` · avoid ${state.allergies}` : ""}`)} disabled={!state.dietaryPreference}>Continue</PrimaryBtn>
                </div>
              </div>
            )}

            {phase === "style" && (
              <Choices cols={3} options={[
                { value: "gentle", label: "Gentle", sub: "Warm" }, { value: "motivating", label: "Motivating", sub: "High-energy" }, { value: "analytical", label: "Analytical", sub: "Data-first" },
              ]} value={state.coachingStyle} onPick={(v) => { set("coachingStyle", v as State["coachingStyle"]); advance("plan", `${v} coaching`); }} />
            )}

            {phase === "plan" && (
              <div className="space-y-3">
                {!plan ? (
                  <div className="py-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-text-muted" /></div>
                ) : (
                  <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                    <div className="flex items-center gap-4">
                      <MacroDonut kcal={plan.calories} protein={plan.protein} carbs={plan.carbs} fat={plan.fat} />
                      <div>
                        <p className="text-[28px] font-extrabold text-text leading-none">{plan.calories}</p>
                        <p className="text-[12px] text-text-muted">kcal / day</p>
                        <p className="text-[12px] text-text mt-1">P {plan.protein}g · C {plan.carbs}g · F {plan.fat}g</p>
                      </div>
                    </div>
                    <details className="text-[12px] text-text-muted">
                      <summary className="cursor-pointer font-semibold text-text">About this calculation</summary>
                      <div className="mt-1 space-y-0.5">
                        <div>BMR {plan.breakdown.bmr} · NEAT job +{plan.breakdown.neatJob} · NEAT lifestyle +{plan.breakdown.neatLifestyle}</div>
                        <div>Workouts +{plan.breakdown.eat} · TEF +{plan.breakdown.tef} → TDEE {plan.breakdown.finalTDEE}</div>
                        <div>Goal adjustment {plan.breakdown.goalAdjustment >= 0 ? "+" : ""}{plan.breakdown.goalAdjustment}</div>
                      </div>
                    </details>
                  </div>
                )}
                <button type="button" onClick={finish} disabled={submitting || !plan}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-full bg-ink text-text-on-ink px-5 py-3 text-[14px] font-semibold disabled:opacity-50">
                  {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : <>Start using Stride <ArrowRight className="h-4 w-4" strokeWidth={2} /></>}
                </button>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
