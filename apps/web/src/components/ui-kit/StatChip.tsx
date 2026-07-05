import { motion } from 'motion/react'
import { cn } from '@/lib/utils'

type ChipColor = 'mint' | 'sky' | 'peach' | 'bubblegum' | 'lavender' | 'card'

interface StatChipProps {
  label: string
  value: string
  color?: ChipColor
  tone?: ChipColor
  unit?: string
  className?: string
}

const bg: Record<ChipColor, string> = {
  mint:      'bg-mint',
  sky:       'bg-sky',
  peach:     'bg-peach',
  bubblegum: 'bg-bubblegum',
  lavender:  'bg-lavender',
  card:      'bg-card border border-border',
}

export function StatChip({ label, value, unit, color, tone, className }: StatChipProps) {
  const chipColor = color ?? tone ?? 'mint'

  return (
    <motion.div
      className={cn(`${bg[chipColor]} rounded-[16px] px-5 py-3 flex flex-col items-start min-w-[100px]`, className)}
      initial={{ opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ type: 'spring', stiffness: 240, damping: 22 }}
      whileHover={{ scale: 1.03 }}
      whileTap={{ scale: 0.97 }}
    >
      <span className="text-[11px] font-bold text-ink/50 uppercase tracking-widest mb-0.5">{label}</span>
      <span className="flex items-baseline gap-1 text-ink">
        <span className="text-[20px] font-extrabold leading-tight tabular-nums">{value}</span>
        {unit && <span className="text-[12px] font-bold opacity-55">{unit}</span>}
      </span>
    </motion.div>
  )
}
