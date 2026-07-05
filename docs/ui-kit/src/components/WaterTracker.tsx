import { useState } from 'react'
import { motion } from 'framer-motion'

export interface WaterTrackerProps {
  initial?: number
  target?: number
  unit?: 'ml' | 'oz'
}

export function WaterTracker({ initial = 1200, target = 2500, unit = 'ml' }: WaterTrackerProps) {
  const [current, setCurrent] = useState(initial)
  const step = unit === 'ml' ? 250 : 8
  const pct = Math.min(current / target, 1)

  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-4">
        Water intake
      </p>

      <div className="flex items-center gap-4">
        <div>
          <span className="text-[34px] font-extrabold tabular-nums text-ink dark:text-surface tracking-[-1px] leading-none">
            {current.toLocaleString()}
          </span>
          <span className="text-[16px] font-bold text-ink/40 dark:text-white/40 ml-1">{unit}</span>
          <p className="text-[13px] font-medium text-ink/40 dark:text-white/40 mt-1">
            of {target.toLocaleString()} {unit} goal
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => setCurrent(c => Math.max(0, c - step))}
            className="w-10 h-10 rounded-full bg-surface dark:bg-ink/40 flex items-center justify-center text-ink dark:text-surface font-extrabold text-[18px] hover:bg-sky/40 transition-colors cursor-pointer active:scale-95"
          >
            −
          </button>
          <button
            onClick={() => setCurrent(c => Math.min(target, c + step))}
            className="w-10 h-10 rounded-full bg-sky flex items-center justify-center text-ink font-extrabold text-[18px] hover:bg-sky/80 transition-colors cursor-pointer active:scale-95"
          >
            +
          </button>
        </div>
      </div>

      <div className="mt-5 bg-surface dark:bg-ink/40 rounded-full h-3 overflow-hidden">
        <motion.div
          className="h-full rounded-full bg-sky"
          animate={{ width: `${pct * 100}%` }}
          transition={{ type: 'spring', stiffness: 180, damping: 22 }}
        />
      </div>
      <div className="flex justify-between mt-1.5">
        <span className="text-[11px] font-bold text-ink/35 dark:text-white/35">0</span>
        <span className="text-[11px] font-bold text-sky">
          {Math.round(pct * 100)}%
        </span>
        <span className="text-[11px] font-bold text-ink/35 dark:text-white/35">{target.toLocaleString()}</span>
      </div>
    </motion.div>
  )
}
