import { motion } from 'framer-motion'

export interface WorkoutCardProps {
  exercise: string
  sets: number
  reps: number
  weight: string
  burnKcal: number
  date: string
}

export function WorkoutCard({ exercise, sets, reps, weight, burnKcal, date }: WorkoutCardProps) {
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
      whileHover={{ y: -2, boxShadow: '0 20px 50px rgba(13,16,27,0.12)' }}
    >
      <div className="flex items-start justify-between mb-3">
        <div>
          <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-1">
            Workout logged
          </p>
          <h3 className="text-[18px] font-extrabold text-ink dark:text-surface tracking-[-0.5px]">
            {exercise}
          </h3>
        </div>
        <span className="bg-peach rounded-full px-3 py-1.5 text-[13px] font-extrabold text-ink tabular-nums whitespace-nowrap">
          {burnKcal} kcal
        </span>
      </div>

      <div className="flex items-center gap-2 mt-4">
        <span className="bg-surface dark:bg-ink/40 rounded-full px-4 py-2 text-[15px] font-bold text-ink dark:text-surface tabular-nums">
          {sets} sets
        </span>
        <span className="text-ink/30 dark:text-white/30 font-bold">×</span>
        <span className="bg-surface dark:bg-ink/40 rounded-full px-4 py-2 text-[15px] font-bold text-ink dark:text-surface tabular-nums">
          {reps} reps
        </span>
        {weight && (
          <>
            <span className="text-ink/30 dark:text-white/30 font-bold">@</span>
            <span className="bg-mint rounded-full px-4 py-2 text-[15px] font-bold text-ink tabular-nums">
              {weight}
            </span>
          </>
        )}
      </div>

      <p className="text-[13px] text-ink/40 dark:text-white/40 font-medium mt-4">{date}</p>
    </motion.div>
  )
}

export function WorkoutCardEmpty() {
  return (
    <div className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 border-2 border-dashed border-ink/10 dark:border-white/10">
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/25 dark:text-white/25 mb-3">
        Workout logged
      </p>
      <div className="space-y-3">
        <div className="h-7 w-40 bg-ink/06 dark:bg-white/06 rounded-full" />
        <div className="flex gap-2">
          <div className="h-8 w-20 bg-ink/06 dark:bg-white/06 rounded-full" />
          <div className="h-8 w-20 bg-ink/06 dark:bg-white/06 rounded-full" />
          <div className="h-8 w-20 bg-ink/06 dark:bg-white/06 rounded-full" />
        </div>
      </div>
      <p className="text-[13px] text-ink/25 dark:text-white/25 font-medium mt-4">No workout logged yet</p>
    </div>
  )
}
