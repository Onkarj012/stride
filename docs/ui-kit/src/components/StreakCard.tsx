import { motion } from 'framer-motion'
import { AnimatedNumber } from './AnimatedNumber'

export interface StreakCardProps {
  days: number
  label?: string
  quote?: string
}

export function StreakCard({ days, label = 'day streak', quote }: StreakCardProps) {
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 200, damping: 22 }}
    >
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-3">
        Consistency
      </p>
      <div className="flex items-baseline gap-3">
        <span
          className="text-[58px] font-extrabold leading-none tabular-nums tracking-[-2px]"
          style={{ background: 'linear-gradient(135deg, #FDB572, #FFC93B)', WebkitBackgroundClip: 'text', WebkitTextFillColor: 'transparent', backgroundClip: 'text' }}
        >
          <AnimatedNumber value={days} duration={1.4} />
        </span>
        <span className="text-[18px] font-bold text-ink/60 dark:text-white/60 leading-none">{label}</span>
      </div>
      {quote && (
        <p className="text-[14px] text-ink/50 dark:text-white/50 font-medium mt-3 leading-snug italic">
          "{quote}"
        </p>
      )}
      <div className="flex gap-1 mt-4">
        {Array.from({ length: 7 }).map((_, i) => (
          <motion.div
            key={i}
            className={`h-1.5 flex-1 rounded-full ${i < Math.min(days, 7) ? 'bg-sunshine' : 'bg-ink/08 dark:bg-white/10'}`}
            initial={{ scaleX: 0 }}
            animate={{ scaleX: 1 }}
            transition={{ delay: i * 0.06, duration: 0.4, ease: 'easeOut' }}
            style={{ transformOrigin: 'left' }}
          />
        ))}
      </div>
    </motion.div>
  )
}
