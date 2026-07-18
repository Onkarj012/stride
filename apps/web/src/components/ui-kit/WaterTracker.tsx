import { useRef, useState } from 'react'
import { motion } from 'motion/react'
import { SPRING_CARD } from '@/lib/motion'

export interface WaterTrackerProps {
  initial?: number
  current?: number
  target?: number
  unit?: 'ml' | 'oz'
  onAdd?: (amount: number, idempotencyToken: string) => void | Promise<void>
  onRemove?: (amount: number) => void | Promise<void>
}

export function WaterTracker({ initial = 1200, current, target = 2500, unit = 'ml', onAdd, onRemove }: WaterTrackerProps) {
  const [localCurrent, setLocalCurrent] = useState(initial)
  const [pending, setPending] = useState(false)
  const addIntentToken = useRef<string | null>(null)
  const controlled = current !== undefined
  const value = controlled ? current : localCurrent
  const step = unit === 'ml' ? 250 : 8
  const pct = Math.min(value / target, 1)

  async function add() {
    if (controlled) {
      if (!onAdd || addIntentToken.current) return
      const token = crypto.randomUUID()
      addIntentToken.current = token
      setPending(true)
      try {
        await onAdd(step, token)
      } finally {
        addIntentToken.current = null
        setPending(false)
      }
      return
    }
    setLocalCurrent(c => Math.min(target, c + step))
  }

  async function remove() {
    if (controlled) {
      if (!onRemove || pending) return
      setPending(true)
      try {
        await onRemove(step)
      } finally {
        setPending(false)
      }
      return
    }
    setLocalCurrent(c => Math.max(0, c - step))
  }

  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CARD}
    >
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-4">
        Water intake
      </p>

      <div className="flex items-center gap-4">
        <div>
          <span className="text-[34px] font-extrabold tabular-nums text-ink dark:text-surface tracking-[-1px] leading-none">
            {value.toLocaleString()}
          </span>
          <span className="text-[16px] font-bold text-ink/40 dark:text-white/40 ml-1">{unit}</span>
          <p className="text-[13px] font-medium text-ink/40 dark:text-white/40 mt-1">
            of {target.toLocaleString()} {unit} goal
          </p>
        </div>

        <div className="flex items-center gap-2 ml-auto">
          <button
            onClick={() => void remove()}
            disabled={pending || (controlled && (!onRemove || value <= 0))}
            className="w-10 h-10 rounded-full bg-surface dark:bg-ink/40 flex items-center justify-center text-ink dark:text-surface font-extrabold text-[18px] hover:bg-sky/40 transition-colors cursor-pointer active:scale-95"
          >
            −
          </button>
          <button
            onClick={() => void add()}
            disabled={pending || (controlled && !onAdd)}
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
          transition={{ type: 'spring', stiffness: 260, damping: 30 }}
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
