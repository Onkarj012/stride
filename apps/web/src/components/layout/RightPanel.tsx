import { motion } from "motion/react";
import { useQuery } from "convex/react";
import { api } from "@convex/_generated/api";
import { useLogs } from "@/hooks/useLogs";
import { useReducedMotion } from "@/hooks/useReducedMotion";
import { localDateStr } from "@/lib/utils";
import { useSnapshot } from "@/context/SnapshotContext";

const SPRING = { type: "spring", stiffness: 260, damping: 30 } as const;

function PulseBar({ pct, color }: { pct: number; color: string }) {
  return (
    <div className="h-1 rounded-full bg-input overflow-hidden mt-1">
      <div className="h-full rounded-full transition-all duration-500" style={{ width: `${Math.min(pct, 100)}%`, background: color }} />
    </div>
  );
}

export function RightPanel() {
  const { expanded, toggle } = useSnapshot();
  const reduceMotion = useReducedMotion();
  const profile = useQuery(api.profile.getProfile);
  const { logs } = useLogs(localDateStr());
  const streakInfo = useQuery(api.history.getStreak, { today: new Date().toISOString().split("T")[0] });

  const kcal = Math.round(logs.reduce((s, l) => s + (l.meal?.kcal ?? 0), 0));
  const protein = Math.round(logs.reduce((s, l) => s + (l.meal?.protein ?? 0), 0));
  const waterMl = logs.reduce((s, l) => s + (l.water?.ml ?? 0), 0);
  const workoutMin = logs.reduce((s, l) => s + (l.workout?.duration ?? 0), 0);
  const streak = streakInfo?.streak ?? 0;

  const kcalTarget = profile?.calorieTarget ?? 2000;
  const proteinTarget = profile?.proteinTarget ?? 90;
  const waterTarget = 2500;

  const kcalPct = kcalTarget > 0 ? (kcal / kcalTarget) * 100 : 0;
  const proteinPct = proteinTarget > 0 ? (protein / proteinTarget) * 100 : 0;
  const waterPct = (waterMl / waterTarget) * 100;

  const firstName = profile?.name?.split(" ")[0] ?? "You";
  const goalWeight = (profile as any)?.goalWeightKg;
  const currentWeight = (profile as any)?.weight;

  const adherenceBars = [70, 92, 34, 80, 64, 88, 42];
  const days = ["M", "T", "W", "T", "F", "S", "S"];

  return (
    <motion.aside
      animate={{ width: expanded ? 312 : 48 }}
      transition={reduceMotion ? { duration: 0 } : SPRING}
      className="hidden lg:block shrink-0 h-screen border-l border-ink/8 dark:border-white/8 bg-surface dark:bg-[#090b12] overflow-hidden"
    >
      {expanded ? (
          <div className="h-full w-[312px] overflow-y-auto p-4">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
              <span className="text-[11px] font-extrabold uppercase tracking-[2px] text-ink/35 dark:text-white/35">Your day</span>
              <button
                type="button"
                onClick={toggle}
                aria-label="Collapse snapshot"
                className="w-7 h-7 rounded-full hover:bg-ink/5 dark:hover:bg-white/10 flex items-center justify-center text-ink/45 dark:text-white/40 cursor-pointer"
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 6l6 6-6 6" /></svg>
              </button>
            </div>

            <div className="flex flex-col gap-4">

            {/* Focus card — dark ink */}
            <div className="rounded-[18px] bg-ink text-text-on-ink p-4">
              <p className="text-[9.5px] font-extrabold tracking-[1.2px] uppercase text-white/50 mb-2">Today's focus</p>
              <p className="text-[13.5px] font-bold leading-[1.45]">
                {protein < proteinTarget
                  ? `Close protein gap (+${proteinTarget - protein}g at dinner)`
                  : "Stay consistent — great progress today"}
              </p>
              <div className="flex gap-1.5 mt-2.5 flex-wrap">
                {protein < proteinTarget && (
                  <span className="text-[10.5px] font-bold rounded-full px-2.5 py-0.5 bg-lavender text-ink">Protein</span>
                )}
                {waterMl < waterTarget && (
                  <span className="text-[10.5px] font-bold rounded-full px-2.5 py-0.5 bg-sky text-ink">Hydration</span>
                )}
                {workoutMin === 0 && (
                  <span className="text-[10.5px] font-bold rounded-full px-2.5 py-0.5 bg-mint text-ink">Movement</span>
                )}
              </div>
            </div>

            {/* 2×2 stat tiles */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-[14px] p-3 bg-lavender">
                <div className="text-[15.5px] font-extrabold tracking-tight text-ink">
                  {kcal > 0 ? kcal.toLocaleString() : "—"}<span className="text-[9.5px] font-semibold opacity-65"> kcal</span>
                </div>
                <div className="text-[10px] font-semibold opacity-70 text-ink mt-0.5">Calories</div>
              </div>
              <div className="rounded-[14px] p-3 bg-sky">
                <div className="text-[15.5px] font-extrabold tracking-tight text-ink">
                  {protein > 0 ? protein : "—"}<span className="text-[9.5px] font-semibold opacity-65">g</span>
                </div>
                <div className="text-[10px] font-semibold opacity-70 text-ink mt-0.5">Protein</div>
              </div>
              <div className="rounded-[14px] p-3 bg-mint">
                <div className="text-[15.5px] font-extrabold tracking-tight text-ink">
                  {waterMl > 0 ? (waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)}` : waterMl) : "—"}<span className="text-[9.5px] font-semibold opacity-65">{waterMl >= 1000 ? "L" : "ml"}</span>
                </div>
                <div className="text-[10px] font-semibold opacity-70 text-ink mt-0.5">Water</div>
              </div>
              <div className="rounded-[14px] p-3 bg-peach">
                <div className="text-[15.5px] font-extrabold tracking-tight text-ink">
                  {workoutMin > 0 ? workoutMin : "—"}<span className="text-[9.5px] font-semibold opacity-65">min</span>
                </div>
                <div className="text-[10px] font-semibold opacity-70 text-ink mt-0.5">Movement</div>
              </div>
            </div>

            {/* Weekly adherence */}
            <div className="rounded-[15px] bg-bg p-3.5">
              <div className="flex justify-between items-baseline mb-2.5">
                <span className="text-[12px] font-bold text-text">Weekly adherence</span>
                <span className="text-[13.5px] font-extrabold text-text">72%</span>
              </div>
              <div className="flex items-end gap-1.5 h-10">
                {adherenceBars.map((h, i) => (
                  <div
                    key={i}
                    className="flex-1 rounded-[5px_5px_3px_3px]"
                    style={{
                      height: `${h}%`,
                      background: h > 60 ? "var(--color-lavender)" : "color-mix(in srgb, var(--color-lavender) 30%, transparent)",
                    }}
                  />
                ))}
              </div>
              <div className="flex gap-1.5 mt-1">
                {days.map((d, i) => (
                  <span key={i} className="flex-1 text-center text-[9px] font-bold text-text-muted">{d}</span>
                ))}
              </div>
            </div>

            {/* Macro progress */}
            <div className="rounded-[15px] bg-bg p-3.5 flex flex-col gap-2.5">
              <p className="text-[12px] font-bold text-text">Macro progress</p>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-text-muted font-semibold">Calories</span>
                  <span className="font-extrabold text-text">{kcal} / {kcalTarget}</span>
                </div>
                <PulseBar pct={kcalPct} color="var(--color-peach)" />
              </div>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-text-muted font-semibold">Protein</span>
                  <span className="font-extrabold text-text">{protein}g / {proteinTarget}g</span>
                </div>
                <PulseBar pct={proteinPct} color="var(--color-lavender)" />
              </div>
              <div>
                <div className="flex justify-between text-[11px]">
                  <span className="text-text-muted font-semibold">Water</span>
                  <span className="font-extrabold text-text">{waterMl >= 1000 ? `${(waterMl / 1000).toFixed(1)}L` : `${waterMl}ml`} / {(waterTarget / 1000).toFixed(1)}L</span>
                </div>
                <PulseBar pct={waterPct} color="var(--color-sky)" />
              </div>
            </div>

            {/* Coach insight */}
            <div className="rounded-[15px] bg-lavender-soft p-3.5">
              <div className="flex items-center gap-2 mb-2">
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" className="text-lavender shrink-0">
                  <path d="M12 2.5l2.1 5.6 5.6 2.1-5.6 2.1L12 17.9 9.9 12.3 4.3 10.2l5.6-2.1z"/>
                </svg>
                <span className="text-[11.5px] font-extrabold text-text">Coach insight</span>
              </div>
              <p className="text-[12px] font-semibold text-text-muted leading-[1.55]">
                {protein >= proteinTarget
                  ? `Protein goal hit, ${firstName}! Keep this consistency — you're on a strong trajectory.`
                  : `${firstName}, close the protein gap at dinner — just ${proteinTarget - protein}g more to hit your daily target.`}
              </p>
            </div>

            {/* Weight goal chip */}
            {goalWeight && currentWeight && (
              <div className="rounded-[14px] bg-card border border-border p-3.5">
                <p className="text-[11px] text-text-muted font-semibold mb-1">Weight goal</p>
                <p className="text-[18px] font-extrabold text-text tracking-tight">{currentWeight} kg</p>
                <p className="text-[11px] text-text-muted mt-0.5">→ {goalWeight} kg target</p>
              </div>
            )}

            {/* Streak */}
            {streak > 0 && (
              <div className="rounded-[14px] bg-card border border-border p-3.5 flex items-center gap-3">
                <span className="text-[22px] font-extrabold text-text tracking-tight leading-none">{streak}</span>
                <div>
                  <p className="text-[11px] font-extrabold text-text">day streak</p>
                  <p className="text-[10px] text-text-muted">Keep it going!</p>
                </div>
              </div>
            )}
            </div>
          </div>
        ) : (
          <button onClick={toggle} className="w-12 h-full flex flex-col items-center pt-5 gap-3 text-ink/45 dark:text-white/40 hover:text-ink dark:hover:text-white cursor-pointer">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
            <span className="[writing-mode:vertical-rl] text-[11px] font-extrabold uppercase tracking-widest">Your day</span>
          </button>
        )}
    </motion.aside>
  );
}
