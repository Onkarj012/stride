import { motion } from 'motion/react'
import { AnimatedNumber } from './AnimatedNumber'
import { SPRING_CARD } from '@/lib/motion'

export interface MacroData {
  kcal: number
  protein: number
  carbs: number
  fat: number
}

const chips: { key: keyof MacroData; label: string; bg: string; unit: string }[] = [
  { key: 'kcal',    label: 'kcal',    bg: 'bg-peach',     unit: '' },
  { key: 'protein', label: 'protein', bg: 'bg-mint',      unit: 'g' },
  { key: 'carbs',   label: 'carbs',   bg: 'bg-sky',       unit: 'g' },
  { key: 'fat',     label: 'fat',     bg: 'bg-bubblegum', unit: 'g' },
]

const container = {
  hidden: {},
  show: { transition: { staggerChildren: 0.04 } },
}
const chip = {
  hidden: { opacity: 0, scale: 0.85, y: 8 },
  show:   { opacity: 1, scale: 1,    y: 0, transition: { type: 'spring' as const, stiffness: 260, damping: 20 } },
}

export function MacroCard(props: MacroData) {
  return (
    <motion.div
      className="bg-white dark:bg-[#1a1e2e] rounded-[20px] p-5 shadow-[0_10px_30px_rgba(13,16,27,0.07)]"
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={SPRING_CARD}
    >
      <p className="text-[11px] font-extrabold tracking-[2px] uppercase text-ink/40 dark:text-white/40 mb-4">
        Today's macros
      </p>
      <motion.div className="flex flex-wrap gap-2" variants={container} initial="hidden" animate="show">
        {chips.map(c => (
          <motion.div
            key={c.key}
            variants={chip}
            className={`${c.bg} rounded-full px-3 py-2 flex flex-col items-center min-w-[64px]`}
          >
            <span className="text-[11px] font-bold text-ink/55 mb-0.5 tracking-wide">{c.label}</span>
            <span className="text-[18px] font-extrabold text-ink tabular-nums leading-none">
              <AnimatedNumber value={props[c.key]} />{c.unit}
            </span>
          </motion.div>
        ))}
      </motion.div>
    </motion.div>
  )
}
