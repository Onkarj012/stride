import { motion } from 'motion/react'
import { SPRING_CARD } from '@/lib/motion'

export interface ExerciseSet { weight: string; reps: number | string }
export interface Exercise { name: string; sets: ExerciseSet[] }
export interface WorkoutSession {
  title: string
  date: string
  durationMin: number
  burnKcal: number
  exercises: Exercise[]
}

export function WorkoutSessionCard({ session, index = 0 }: { session: WorkoutSession; index?: number }) {
  const totalSets = session.exercises.reduce((s, e) => s + e.sets.length, 0)
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ ...SPRING_CARD, delay: Math.min(index, 6) * 0.04 }}
    >
      <div className="flex items-start justify-between mb-4">
        <div>
          <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-1">Session</p>
          <h3 className="text-[18px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">{session.title}</h3>
          <p className="text-[13px] text-ink/40 dark:text-white/40 font-medium mt-0.5">{session.date}</p>
        </div>
        <div className="flex flex-col items-end gap-1.5">
          <span className="bg-peach rounded-full px-3 py-1.5 text-[13px] font-extrabold text-ink tabular-nums whitespace-nowrap">{session.burnKcal} kcal</span>
          <span className="bg-mint rounded-full px-3 py-1.5 text-[12px] font-bold text-ink tabular-nums whitespace-nowrap">{session.durationMin} min</span>
        </div>
      </div>

      <div className="flex items-center gap-2 mb-3 text-[11px] font-extrabold uppercase tracking-wide text-ink/35 dark:text-white/35">
        <span>{session.exercises.length} exercises</span>
        <span className="w-1 h-1 rounded-full bg-ink/20 dark:bg-white/20" />
        <span>{totalSets} sets</span>
      </div>

      <div className="space-y-3">
        {session.exercises.map((ex, i) => (
          <div key={i} className="rounded-[12px] bg-surface dark:bg-ink/30 p-3.5">
            <div className="flex items-center justify-between mb-2.5">
              <span className="text-[14px] font-extrabold text-ink dark:text-surface">{ex.name}</span>
              <span className="text-[11px] font-bold text-ink/40 dark:text-white/40 tabular-nums">{ex.sets.length} sets</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {ex.sets.map((set, j) => (
                <span
                  key={j}
                  className="inline-flex items-center gap-1 rounded-[9px] bg-white dark:bg-[#11141f] px-2.5 py-1.5 text-[12px] font-bold text-ink dark:text-surface tabular-nums shadow-[0_2px_8px_rgba(13,16,27,0.05)]"
                >
                  <span className="text-ink/35 dark:text-white/35 text-[10px] font-extrabold">{j + 1}</span>
                  {set.weight}
                  {String(set.reps) && (
                    <>
                      <span className="text-ink/30 dark:text-white/30">×</span>
                      {set.reps}
                    </>
                  )}
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </motion.div>
  )
}
